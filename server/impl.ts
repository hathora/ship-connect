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
import { SafeArea } from "../shared/consts";

import { Methods, Context } from "./.hathora/methods";

type InternalShip = Entity2D & { target?: Point2D };
type InternalProjectile = Entity2D & { firedBy: number };
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
};

const PROJECTILE_COOLDOWN = 1; // seconds
const SHIP_SPEED = 100; // pixels per second
const PROJECTILE_SPEED = 500; // pixels per second
const SHIP_TURN_SPEED = 0.05; // radians per second
const SHIP_RADIUS = 20; // pixels
const PROJECTILE_RADIUS = 2; // pixels

export class Impl implements Methods<InternalState> {
  initialize(): InternalState {
    return { players: [], ...initializeState({}) };
  }
  joinGame(state: InternalState, userId: UserId): Response {
    if (state.players.some((player) => player === userId)) {
      return Response.error("Already joined");
    }
    state.players.push(userId);
    return Response.ok();
  }
  playAgain(state: InternalState): Response {
    if (!state.gameOver) {
      return Response.error("Game in progress");
    }
    initializeState(state);
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
    projectiles.forEach((projectile, idx) => {
      projectile.location.x += Math.cos(projectile.angle) * PROJECTILE_SPEED * timeDelta;
      projectile.location.y += Math.sin(projectile.angle) * PROJECTILE_SPEED * timeDelta;
      if (isOutOfBounds(projectile.location)) {
        projectiles.splice(idx, 1);
      }
      if (
        projectile.firedBy !== ship.id &&
        collides(ship.location, SHIP_RADIUS, projectile.location, PROJECTILE_RADIUS)
      ) {
        // collision with player ship
        projectiles.splice(idx, 1);
        state.gameOver = true;
      }
      if (
        enemyShips.some(
          (enemy) =>
            projectile.firedBy !== enemy.id &&
            collides(enemy.location, SHIP_RADIUS, projectile.location, PROJECTILE_RADIUS)
        )
      ) {
        // collision with enemy ship
        projectiles.splice(idx, 1);
        state.score++;
      }
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
      });
      enemyShips.forEach((enemy) => {
        projectiles.push({
          id: ctx.chance.natural({ max: 1e6 }),
          location: { ...enemy.location },
          angle: enemy.angle,
          firedBy: enemy.id,
        });
      });
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

function initializeState(state: Partial<InternalState>): Omit<InternalState, "players"> {
  state.playerShip = { id: 0, location: { x: 100, y: 100 }, angle: 0 };
  state.turret = { angle: 0 };
  state.enemyShips = [{ id: 1, location: { x: 300, y: 300 }, angle: 0 }];
  state.projectiles = [];
  state.score = 0;
  state.gameOver = false;
  state.fireCooldown = PROJECTILE_COOLDOWN;
  return state as Omit<InternalState, "players">;
}

function isOutOfBounds(location: Point2D) {
  return location.x < 0 || location.x > SafeArea.width || location.y < 0 || location.y > SafeArea.height;
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

function randomLocation(ctx: Context) {
  return {
    x: ctx.chance.natural({ max: SafeArea.width }),
    y: ctx.chance.natural({ max: SafeArea.height }),
  };
}
