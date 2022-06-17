import { Response } from "../api/base";
import {
  GameState,
  UserId,
  Point2D,
  IThrustTowardsRequest,
  ISetTurretTargetRequest,
  Role,
  Entity,
  EntityType,
} from "../api/types";
import { GameArea, SafeArea } from "../shared/consts";

import { Methods, Context } from "./.hathora/methods";

type InternalPlayerShip = Entity & {
  navigator: UserId;
  gunner?: UserId;
  lives: number;
  turretAngle: number;
  fireCooldown: number;
  target?: Point2D;
};
type InternalEnemyShip = Entity & { fireCooldown: number };
type InternalState = {
  friendlyShips: InternalPlayerShip[];
  enemyShips: InternalEnemyShip[];
  projectiles: Entity[];
  score: number;
  spawnCooldown: number;
};

const PLAYER_FIRE_COOLDOWN = 1; // seconds
const ENEMY_FIRE_COOLDOWN = 2; // seconds
const ENEMY_SPAWN_COOLDOWN = 15; // seconds
const PLAYER_SHIP_SPEED = 150; // pixels per second
const ENEMY_SHIP_SPEED = 50; // pixels per second
const PROJECTILE_SPEED = 400; // pixels per second
const SHIP_TURN_SPEED = 0.1; // radians per second
const SHIP_RADIUS = 20; // pixels
const PROJECTILE_RADIUS = 2; // pixels

export class Impl implements Methods<InternalState> {
  initialize(): InternalState {
    return {
      friendlyShips: [],
      enemyShips: [],
      projectiles: [],
      score: 0,
      spawnCooldown: ENEMY_SPAWN_COOLDOWN,
    };
  }
  joinGame(state: InternalState, userId: UserId, ctx: Context): Response {
    if (state.friendlyShips.some((ship) => ship.navigator === userId || ship.gunner === userId)) {
      return Response.error("Already joined");
    }
    state.friendlyShips.push({
      id: ctx.chance.natural({ max: 1e6 }),
      type: EntityType.Friendly,
      location: { x: 100, y: 100 },
      angle: 0,
      navigator: userId,
      lives: 3,
      turretAngle: 0,
      fireCooldown: PLAYER_FIRE_COOLDOWN,
    });
    state.enemyShips.push(newEnemy(state.friendlyShips, ctx));
    return Response.ok();
  }
  playAgain(state: InternalState): Response {
    if (state.friendlyShips.some((ship) => ship.lives > 0)) {
      return Response.error("Game in progress");
    }
    Object.assign(state, { ...this.initialize(), friendlyShips: state.friendlyShips });
    return Response.ok();
  }
  thrustTowards(state: InternalState, userId: string, ctx: Context, request: IThrustTowardsRequest): Response {
    const playerShip = state.friendlyShips.find((ship) => ship.navigator === userId);
    if (playerShip === undefined) {
      return Response.error("Not navigator");
    }
    playerShip.target = request.location;
    return Response.ok();
  }
  setTurretTarget(state: InternalState, userId: string, ctx: Context, request: ISetTurretTargetRequest): Response {
    const playerShip = state.friendlyShips.find((ship) => ship.navigator === userId);
    if (playerShip === undefined) {
      return Response.error("Not navigator");
    }
    const dx = request.location.x - playerShip.location.x;
    const dy = request.location.y - playerShip.location.y;
    playerShip.turretAngle = Math.atan2(dy, dx);
    return Response.ok();
  }
  onTick(state: InternalState, ctx: Context, timeDelta: number): void {
    const { friendlyShips, enemyShips, projectiles } = state;

    // update friendly ship
    friendlyShips.forEach((ship) => {
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
        ship.turretAngle = ship.angle;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist <= PLAYER_SHIP_SPEED * timeDelta) {
          ship.location = { ...ship.target };
          ship.target = undefined;
        } else {
          ship.location.x += Math.cos(ship.angle) * PLAYER_SHIP_SPEED * timeDelta;
          ship.location.y += Math.sin(ship.angle) * PLAYER_SHIP_SPEED * timeDelta;
        }
      }
    });

    // update enemies
    enemyShips.forEach((enemy) => {
      const cloestShip = closestFriendlyShip(enemy.location, friendlyShips);
      if (cloestShip === undefined) {
        return;
      }
      const dx = cloestShip.location.x - enemy.location.x;
      const dy = cloestShip.location.y - enemy.location.y;
      const targetAngle = Math.atan2(dy, dx);
      const angleDiff = wrap(targetAngle - enemy.angle, -Math.PI, Math.PI);
      if (Math.abs(angleDiff) < SHIP_TURN_SPEED / 2) {
        enemy.angle = targetAngle;
      } else {
        if (angleDiff < 0) {
          enemy.angle -= SHIP_TURN_SPEED;
        } else {
          enemy.angle += SHIP_TURN_SPEED;
        }
      }
      enemy.location.x += Math.cos(enemy.angle) * ENEMY_SHIP_SPEED * timeDelta;
      enemy.location.y += Math.sin(enemy.angle) * ENEMY_SHIP_SPEED * timeDelta;
    });

    // update projectiles
    projectiles.forEach((projectile, projectileIdx) => {
      projectile.location.x += Math.cos(projectile.angle) * PROJECTILE_SPEED * timeDelta;
      projectile.location.y += Math.sin(projectile.angle) * PROJECTILE_SPEED * timeDelta;
      if (isOutOfBounds(projectile.location)) {
        projectiles.splice(projectileIdx, 1);
      }
    });

    // friendly-enemy ship collisions
    friendlyShips.forEach((friendly) => {
      enemyShips.forEach((enemy, enemyIdx) => {
        if (collides(friendly.location, SHIP_RADIUS, enemy.location, SHIP_RADIUS)) {
          friendly.lives = 0;
          state.score++;
          enemyShips.splice(enemyIdx, 1);
        }
      });
    });

    // projectile collisions
    projectiles.forEach((projectile, projectileIdx) => {
      if (projectile.type === EntityType.Enemy) {
        friendlyShips.forEach((ship) => {
          if (collides(ship.location, SHIP_RADIUS, projectile.location, PROJECTILE_RADIUS)) {
            ship.lives -= 1;
            projectiles.splice(projectileIdx, 1);
          }
        });
      } else if (projectile.type === EntityType.Friendly) {
        enemyShips.forEach((enemy, enemyIdx) => {
          if (collides(enemy.location, SHIP_RADIUS, projectile.location, PROJECTILE_RADIUS)) {
            state.score++;
            enemyShips.splice(enemyIdx, 1);
            projectiles.splice(projectileIdx, 1);
          }
        });
      }
    });

    // spawn new projectiles on cooldown
    friendlyShips.forEach((ship) => {
      ship.fireCooldown -= timeDelta;
      if (ship.fireCooldown < 0) {
        ship.fireCooldown += PLAYER_FIRE_COOLDOWN;
        projectiles.push({
          id: ctx.chance.natural({ max: 1e6 }),
          type: EntityType.Friendly,
          location: { ...ship.location },
          angle: ship.turretAngle,
        });
      }
    });
    enemyShips.forEach((enemy) => {
      const closestShip = closestFriendlyShip(enemy.location, state.friendlyShips);
      if (closestShip !== undefined && distance(enemy.location, closestShip.location) < SafeArea.width) {
        enemy.fireCooldown -= timeDelta;
        if (enemy.fireCooldown < 0) {
          enemy.fireCooldown += ENEMY_FIRE_COOLDOWN;
          projectiles.push({
            id: ctx.chance.natural({ max: 1e6 }),
            type: EntityType.Enemy,
            location: { ...enemy.location },
            angle: enemy.angle,
          });
        }
      }
    });

    // spawn new enemies on cooldown
    state.spawnCooldown -= timeDelta;
    if (state.spawnCooldown < 0) {
      state.spawnCooldown += ENEMY_SPAWN_COOLDOWN;
      enemyShips.push(newEnemy(friendlyShips, ctx));
    }
  }
  getUserState(state: InternalState, userId: UserId): GameState {
    const playerShip = state.friendlyShips.find((ship) => ship.navigator === userId || ship.gunner === userId);
    const ships: Entity[] = [];
    state.friendlyShips.forEach((ship) => ships.push(ship));
    state.enemyShips.forEach((ship) => ships.push(ship));
    return {
      ships,
      projectiles: state.projectiles,
      score: state.score,
      playerShip:
        playerShip === undefined
          ? undefined
          : { ...playerShip, role: playerShip.navigator === userId ? Role.Navigator : Role.Gunner },
    };
  }
}

function isOutOfBounds(location: Point2D) {
  return location.x < 0 || location.x > GameArea.width || location.y < 0 || location.y > GameArea.height;
}

function collides(location1: Point2D, radius1: number, location2: Point2D, radius2: number) {
  return distance(location1, location2) < radius1 + radius2;
}

function distance(location1: Point2D, location2: Point2D) {
  const dx = location2.x - location1.x;
  const dy = location2.y - location1.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function wrap(value: number, min: number, max: number) {
  const range = max - min;
  return min + ((((value - min) % range) + range) % range);
}

function newEnemy(friendlyShips: InternalPlayerShip[], ctx: Context): InternalEnemyShip {
  const randomLoc = randomLocation(ctx);
  const closestShip = closestFriendlyShip(randomLoc, friendlyShips);
  if (closestShip !== undefined && distance(randomLoc, closestShip.location) < 2 * SHIP_RADIUS) {
    return newEnemy(friendlyShips, ctx);
  }
  return {
    id: ctx.chance.natural({ max: 1e6 }),
    type: EntityType.Enemy,
    location: randomLoc,
    angle: 0,
    fireCooldown: ENEMY_FIRE_COOLDOWN,
  };
}

function randomLocation(ctx: Context): Point2D {
  return {
    x: ctx.chance.natural({ max: GameArea.width }),
    y: ctx.chance.natural({ max: GameArea.height }),
  };
}

function closestFriendlyShip(location: Point2D, friendlyShips: InternalPlayerShip[]): InternalPlayerShip | undefined {
  let minDist = Number.POSITIVE_INFINITY;
  let closestShip = undefined;
  friendlyShips.forEach((ship) => {
    const dist = distance(ship.location, location);
    if (dist < minDist) {
      minDist = dist;
      closestShip = ship;
    }
  });
  return closestShip;
}
