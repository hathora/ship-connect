import { Response } from "../api/base";
import {
  GameState,
  UserId,
  Point2D,
  IThrustTowardsRequest,
  PlayerShip,
  Projectile,
  ISetTurretStateRequest,
  Turret,
  TurretState,
  EnemyShip,
} from "../api/types";
import { SafeArea } from "../shared/consts";

import { Methods, Context } from "./.hathora/methods";

type InternalShip = PlayerShip & { target?: Point2D };
type InternalTurret = Turret & { state: TurretState };
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
const SHIP_RADIUS = 20; // pixels
const PROJECTILE_RADIUS = 2; // pixels

export class Impl implements Methods<InternalState> {
  initialize(): InternalState {
    return {
      players: [],
      playerShip: { location: { x: 100, y: 100 }, angle: 0 },
      turret: { angle: 0, state: TurretState.IDLE },
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
  setTurretState(state: InternalState, userId: string, ctx: Context, request: ISetTurretStateRequest): Response {
    const playerIdx = state.players.indexOf(userId);
    if (playerIdx !== 1) {
      return Response.error("Not turret controller");
    }
    state.turret.state = request.state;
    return Response.ok();
  }
  onTick(state: InternalState, ctx: Context, timeDelta: number): void {
    const ship = state.playerShip;

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

    switch (state.turret.state) {
      default:
      case TurretState.IDLE:
        break;
      case TurretState.MOVE_LEFT:
        state.turret.angle -= 0.05;
        break;
      case TurretState.MOVE_RIGHT:
        state.turret.angle += 0.05;
        break;
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
