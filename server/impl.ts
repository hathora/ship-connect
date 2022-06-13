import { Response } from "../api/base";
import { GameState, UserId, Point2D, IStopThrustingRequest, IThrustTowardsRequest } from "../api/types";
import { SafeArea } from "../shared/consts";

import { Methods, Context } from "./.hathora/methods";

type InternalShip = Point2D & { angle: number; target?: Point2D };
type InternalProjectile = Point2D & { angle: number };
type InternalState = {
  players: UserId[];
  playerShip: InternalShip;
  projectiles: InternalProjectile[];
  fireCooldown: number;
};

const SHIP_SPEED = 100; // pixels per second
const PROJECTILE_SPEED = 500; // pixels per second

export class Impl implements Methods<InternalState> {
  initialize(): InternalState {
    return { players: [], projectiles: [], playerShip: { x: 100, y: 100, angle: 0 }, fireCooldown: 5 };
  }
  joinGame(state: InternalState, userId: UserId): Response {
    if (state.players.some((player) => player === userId)) {
      return Response.error("Already joined");
    }
    state.players.push(userId);
    return Response.ok();
  }
  thrustTowards(state: InternalState, userId: string, ctx: Context, request: IThrustTowardsRequest): Response {
    if (!state.players.includes(userId)) {
      return Response.error("Not joined");
    }
    state.playerShip.target = request.location;
    return Response.ok();
  }
  stopThrusting(state: InternalState, userId: string, ctx: Context, request: IStopThrustingRequest): Response {
    if (!state.players.includes(userId)) {
      return Response.error("Not joined");
    }
    state.playerShip.target = undefined;
    return Response.ok();
  }
  onTick(state: InternalState, ctx: Context, timeDelta: number): void {
    const ship = state.playerShip;

    if (ship.target !== undefined) {
      const dx = ship.target.x - ship.x;
      const dy = ship.target.y - ship.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const pixelsToMove = SHIP_SPEED * timeDelta;
      if (dist <= pixelsToMove) {
        ship.x = ship.target.x;
        ship.y = ship.target.y;
        ship.target = undefined;
      } else {
        ship.x += (dx / dist) * pixelsToMove;
        ship.y += (dy / dist) * pixelsToMove;
      }
      ship.angle = Math.atan2(dy, dx);
    }

    state.projectiles.forEach((projectile, idx) => {
      projectile.x += Math.cos(projectile.angle) * PROJECTILE_SPEED * timeDelta;
      projectile.y += Math.sin(projectile.angle) * PROJECTILE_SPEED * timeDelta;
      if (projectile.x < 0 || projectile.x > SafeArea.width || projectile.y < 0 || projectile.y > SafeArea.height) {
        state.projectiles.splice(idx, 1);
      }
    });

    state.fireCooldown - timeDelta;
    if (state.fireCooldown < 0) {
      state.fireCooldown = 5 + state.fireCooldown;
      state.projectiles.push({ x: ship.x, y: ship.y, angle: ship.angle });
    }
  }
  getUserState(state: InternalState): GameState {
    return state;
  }
}
