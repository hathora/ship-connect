import { Response } from "../api/base";
import { GameState, UserId, Point2D, IThrustTowardsRequest, PlayerShip, Projectile } from "../api/types";
import { SafeArea } from "../shared/consts";

import { Methods, Context } from "./.hathora/methods";

type InternalShip = PlayerShip & { target?: Point2D };
type InternalState = {
  players: UserId[];
  playerShip: InternalShip;
  projectiles: Projectile[];
  fireCooldown: number;
};

const PROJECTILE_COOLDOWN = 1; // second
const SHIP_SPEED = 100; // pixels per second
const PROJECTILE_SPEED = 500; // pixels per second

export class Impl implements Methods<InternalState> {
  initialize(): InternalState {
    return {
      players: [],
      projectiles: [],
      playerShip: { location: { x: 100, y: 100 }, angle: 0 },
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
    if (!state.players.includes(userId)) {
      return Response.error("Not joined");
    }
    state.playerShip.target = request.location;
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
      ship.angle = Math.atan2(dy, dx);
    }

    state.projectiles.forEach((projectile, idx) => {
      projectile.location.x += Math.cos(projectile.angle) * PROJECTILE_SPEED * timeDelta;
      projectile.location.y += Math.sin(projectile.angle) * PROJECTILE_SPEED * timeDelta;
      if (
        projectile.location.x < 0 ||
        projectile.location.x > SafeArea.width ||
        projectile.location.y < 0 ||
        projectile.location.y > SafeArea.height
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
        angle: ship.angle,
      });
    }
  }
  getUserState(state: InternalState): GameState {
    return state;
  }
}
