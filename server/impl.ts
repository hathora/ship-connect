import { Response } from "../api/base";
import {
  GameState,
  UserId,
  Point2D,
  IThrustTowardsRequest,
  PlayerShip,
  Projectile,
  ISetTurretTargetRequest,
  Turret,
  EnemyShip,
} from "../api/types";
import { SafeArea } from "../shared/consts";

import { Methods, Context } from "./.hathora/methods";

type InternalShip = PlayerShip & { target?: Point2D };
type InternalTurret = Turret & { target?: Point2D };
type InternalState = {
  players: UserId[];
  playerShip: InternalShip;
  turret: InternalTurret;
  enemyShips: EnemyShip[];
  projectiles: Projectile[];
  fireCooldown: number;
};

const PROJECTILE_COOLDOWN = 1; // seconds
const SHIP_SPEED = 100; // pixels per second
const PROJECTILE_SPEED = 500; // pixels per second
const TURRET_TURN_SPEED = 0.05; // radians per second
const SHIP_RADIUS = 20; // pixels
const PROJECTILE_RADIUS = 2; // pixels

function wrap(value: number, min: number, max: number) {
  const range = max - min;

  return min + ((((value - min) % range) + range) % range);
}

export class Impl implements Methods<InternalState> {
  initialize(): InternalState {
    return {
      players: [],
      playerShip: { location: { x: 100, y: 100 }, angle: 0 },
      turret: { angle: 0 },
      enemyShips: [{ id: 0, location: { x: 300, y: 300 } }],
      projectiles: [],
      fireCooldown: PROJECTILE_COOLDOWN,
    };
  }
  joinGame(state: InternalState, userId: UserId): Response {
    if (state.players.some((player) => player === userId)) {
      return Response.error("Already joined");
    }
    state.players.push(userId);
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
    const { playerShip: ship, turret } = state;

    if (ship.target !== undefined) {
      const dx = ship.target.x - ship.location.x;
      const dy = ship.target.y - ship.location.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const pixelsToMove = SHIP_SPEED * timeDelta;
      if (dist <= pixelsToMove) {
        ship.location = { ...ship.target };
        ship.target = undefined;
      } else {
        ship.location.x += (dx / dist) * pixelsToMove;
        ship.location.y += (dy / dist) * pixelsToMove;
      }
      const newAngle = Math.atan2(dy, dx);
      const angleDiff = newAngle - ship.angle;
      ship.angle = newAngle;
      state.turret.angle += angleDiff;
    }

    // move turret angle towards target
    if (turret.target) {
      const dx = turret.target.x - ship.location.x;
      const dy = turret.target.y - ship.location.y;
      const targetAngle = Math.atan2(dy, dx);
      const diff = wrap(targetAngle - turret.angle, -Math.PI, Math.PI);

      if (Math.abs(diff) < TURRET_TURN_SPEED / 2) {
        // close enough so just snap to target
        turret.angle = targetAngle;
      } else {
        if (diff < 0) {
          turret.angle -= TURRET_TURN_SPEED;
        } else {
          turret.angle += TURRET_TURN_SPEED;
        }
      }
    }

    state.projectiles.forEach((projectile, idx) => {
      projectile.location.x += Math.cos(projectile.angle) * PROJECTILE_SPEED * timeDelta;
      projectile.location.y += Math.sin(projectile.angle) * PROJECTILE_SPEED * timeDelta;
      if (
        isOutOfBounds(projectile.location) ||
        state.enemyShips.some((enemy) => collides(enemy.location, SHIP_RADIUS, projectile.location, PROJECTILE_RADIUS))
      ) {
        state.projectiles.splice(idx, 1);
      }
    });

    state.fireCooldown -= timeDelta;
    if (state.fireCooldown < 0) {
      state.fireCooldown = PROJECTILE_COOLDOWN + state.fireCooldown;
      state.projectiles.push({
        id: ctx.chance.natural({ max: 1e6 }),
        location: { ...ship.location },
        angle: state.turret.angle,
      });
    }
  }
  getUserState(state: InternalState): GameState {
    return state;
  }
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
