import { Response } from "../api/base";
import {
  GameState,
  UserId,
  Point2D,
  IThrustTowardsRequest,
  ISetTurretTargetRequest,
  Role,
  Entity2D,
} from "../api/types";
import { GameArea } from "../shared/consts";

import { Methods, Context } from "./.hathora/methods";

type InternalShip = Entity2D & { target?: Point2D };
type InternalProjectile = Entity2D & { firedBy: number; attackPoints: number };
type InternalTurret = { angle: number; target?: Point2D };
type InternalState = {
  players: UserId[];
  playerShip: InternalShip;
  turret: InternalTurret;
  enemyShips: InternalShip[];
  projectiles: InternalProjectile[];
  score: number;
  gameOver: boolean;
  fireCooldown: number;
  spawnCooldown: number;
};

const PROJECTILE_COOLDOWN = 1; // seconds
const ENEMY_SPAWN_COOLDOWN = 15; // seconds
const SHIP_SPEED = 100; // pixels per second
const PROJECTILE_SPEED = 500; // pixels per second
const SHIP_TURN_SPEED = 0.05; // radians per second
const SHIP_RADIUS = 20; // pixels
const PROJECTILE_RADIUS = 2; // pixels

export class Impl implements Methods<InternalState> {
  initialize(ctx: Context): InternalState {
    const playerShip = { id: 0, location: { x: 100, y: 100 }, angle: 0, health: 99 };
    return {
      players: [],
      playerShip,
      turret: { angle: 0 },
      enemyShips: [newEnemy(playerShip, ctx)],
      projectiles: [],
      score: 0,
      gameOver: false,
      fireCooldown: PROJECTILE_COOLDOWN,
      spawnCooldown: ENEMY_SPAWN_COOLDOWN,
    };
  }
  joinGame(state: InternalState, userId: UserId): Response {
    if (state.players.some((player) => player === userId)) {
      return Response.error("Already joined");
    }
    state.players.push(userId);
    return Response.ok();
  }
  playAgain(state: InternalState, userId: UserId, ctx: Context): Response {
    if (!state.gameOver) {
      return Response.error("Game in progress");
    }
    Object.assign(state, { ...this.initialize(ctx), players: state.players });
    return Response.ok();
  }
  thrustTowards(state: InternalState, userId: string, ctx: Context, request: IThrustTowardsRequest): Response {
    const playerIdx = state.players.indexOf(userId);
    if (playerIdx !== 0) {
      return Response.error("Not navigator");
    }
    state.playerShip.target = request.location;
    return Response.ok();
  }
  setTurretTarget(state: InternalState, userId: string, ctx: Context, request: ISetTurretTargetRequest): Response {
    const playerIdx = state.players.indexOf(userId);
    if (playerIdx !== 1) {
      return Response.error("Not turret controller");
    }
    state.turret.target = request.location;
    return Response.ok();
  }
  onTick(state: InternalState, ctx: Context, timeDelta: number): void {
    const { playerShip: ship, enemyShips, projectiles, turret } = state;
    if (state.gameOver) {
      return;
    }

    // update player ship
    if (ship.target !== undefined) {
      const dx = ship.target.x - ship.location.x;
      const dy = ship.target.y - ship.location.y;
      const targetAngle = Math.atan2(dy, dx);
      const angleDiff = wrap(targetAngle - ship.angle, -Math.PI, Math.PI);
      if (Math.abs(angleDiff) < SHIP_TURN_SPEED / 2) {
        ship.angle = targetAngle;
      } else {
        if (angleDiff < 0) {
          ship.angle -= SHIP_TURN_SPEED;
        } else {
          ship.angle += SHIP_TURN_SPEED;
        }
      }
      turret.angle = ship.angle;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= SHIP_SPEED * timeDelta) {
        ship.location = { ...ship.target };
        ship.target = undefined;
      } else {
        ship.location.x += Math.cos(ship.angle) * SHIP_SPEED * timeDelta;
        ship.location.y += Math.sin(ship.angle) * SHIP_SPEED * timeDelta;
      }
    }

    // update turret angle
    if (turret.target) {
      const dx = turret.target.x - ship.location.x;
      const dy = turret.target.y - ship.location.y;
      turret.angle = Math.atan2(dy, dx);
    }

    // update enemies
    enemyShips.forEach((enemy) => {
      if (enemy.target === undefined) {
        enemy.target = randomLocation(ctx);
      }
      const dx = enemy.target.x - enemy.location.x;
      const dy = enemy.target.y - enemy.location.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const pixelsToMove = SHIP_SPEED * timeDelta;
      if (dist <= pixelsToMove) {
        enemy.location = { ...enemy.target };
        enemy.target = undefined;
      } else {
        enemy.location.x += (dx / dist) * pixelsToMove;
        enemy.location.y += (dy / dist) * pixelsToMove;
      }
      enemy.angle = Math.atan2(dy, dx);
    });

    if (enemyShips.some((enemy) => collides(enemy.location, SHIP_RADIUS, ship.location, SHIP_RADIUS))) {
      state.gameOver = true;
    }

    // update projectiles
    projectiles.forEach((projectile, projectileIdx) => {
      projectile.location.x += Math.cos(projectile.angle) * PROJECTILE_SPEED * timeDelta;
      projectile.location.y += Math.sin(projectile.angle) * PROJECTILE_SPEED * timeDelta;
      if (isOutOfBounds(projectile.location)) {
        projectiles.splice(projectileIdx, 1);
      }
      if (
        projectile.firedBy !== ship.id &&
        collides(ship.location, SHIP_RADIUS, projectile.location, PROJECTILE_RADIUS)
      ) {
        // collision with player ship
        projectiles.splice(projectileIdx, 1);
        ship.health -= projectile.attackPoints;

        if (ship.health <= 0) {
          state.gameOver = true;
        }
      }
      enemyShips.forEach((enemy, enemyIdx) => {
        if (
          projectile.firedBy !== enemy.id &&
          collides(enemy.location, SHIP_RADIUS, projectile.location, PROJECTILE_RADIUS)
        ) {
          // collision with enemy ship
          projectiles.splice(projectileIdx, 1);
          enemy.health -= projectile.attackPoints;
          if (enemy.health <= 0) {
            enemyShips.splice(enemyIdx, 1);
            state.score++;
          }
        }
      });
    });

    // spawn new projectiles on cooldown
    state.fireCooldown -= timeDelta;
    if (state.fireCooldown < 0) {
      state.fireCooldown += PROJECTILE_COOLDOWN;
      projectiles.push({
        id: ctx.chance.natural({ max: 1e6 }),
        location: { ...ship.location },
        angle: turret.angle,
        firedBy: ship.id,
        attackPoints: 100,
        health: 100,
      });
      enemyShips.forEach((enemy) => {
        projectiles.push({
          id: ctx.chance.natural({ max: 1e6 }),
          location: { ...enemy.location },
          angle: enemy.angle,
          firedBy: enemy.id,
          attackPoints: 33,
          health: 100,
        });
      });
    }

    // spawn new enemies on cooldown
    state.spawnCooldown -= timeDelta;
    if (state.spawnCooldown < 0) {
      state.spawnCooldown += ENEMY_SPAWN_COOLDOWN;
      enemyShips.push(newEnemy(ship, ctx));
    }
  }
  getUserState(state: InternalState, userId: UserId): GameState {
    const playerIdx = state.players.indexOf(userId);
    const role = playerIdx === 0 ? Role.Navigator : playerIdx === 1 ? Role.Gunner : Role.Spectator;
    return {
      ...state,
      turretAngle: state.turret.angle,
      role,
    };
  }
}

function isOutOfBounds(location: Point2D) {
  return location.x < 0 || location.x > GameArea.width || location.y < 0 || location.y > GameArea.height;
}

function collides(location1: Point2D, radius1: number, location2: Point2D, radius2: number) {
  const dx = location2.x - location1.x;
  const dy = location2.y - location1.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  return dist < radius1 + radius2;
}

function wrap(value: number, min: number, max: number) {
  const range = max - min;
  return min + ((((value - min) % range) + range) % range);
}

function newEnemy(playerShip: Entity2D, ctx: Context): Entity2D {
  const randomLoc = randomLocation(ctx);
  if (collides(randomLoc, SHIP_RADIUS, playerShip.location, SHIP_RADIUS * 2)) {
    return newEnemy(playerShip, ctx);
  }
  return {
    id: ctx.chance.natural({ max: 1e6 }),
    location: randomLoc,
    angle: 0,
    health: 100,
  };
}

function randomLocation(ctx: Context) {
  return {
    x: ctx.chance.natural({ max: GameArea.width }),
    y: ctx.chance.natural({ max: GameArea.height }),
  };
}
