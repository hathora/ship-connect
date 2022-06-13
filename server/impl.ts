import { Response } from "../api/base";
import {
  GameState,
  UserId,
  IUpdateRotationRequest,
  IUpdateAcceleratingRequest,
  PlayerShip,
  Rotation,
} from "../api/types";

import { Methods, Context } from "./.hathora/methods";

type InternalShip = PlayerShip & {
  rotation: Rotation;
  accelerating: boolean;
};
type InternalState = {
  ships: InternalShip[];
};

const SHIP_ROTATION_SPEED = 0.01; // radians per second
const SHIP_SPEED = 100; // pixels per second

export class Impl implements Methods<InternalState> {
  initialize(): InternalState {
    return { ships: [] };
  }
  joinGame(state: InternalState, userId: UserId): Response {
    if (state.ships.some((s) => s.player === userId)) {
      return Response.error("Already joined");
    }
    state.ships.push({
      player: userId,
      location: { x: 100, y: 100 },
      angle: 0,
      rotation: Rotation.NONE,
      accelerating: false,
    });
    return Response.ok();
  }
  updateRotation(state: InternalState, userId: UserId, ctx: Context, request: IUpdateRotationRequest): Response {
    const ship = state.ships.find((s) => s.player === userId);
    if (ship === undefined) {
      return Response.error("Not joined");
    }
    ship.rotation = request.rotation;
    return Response.ok();
  }
  updateAccelerating(
    state: InternalState,
    userId: UserId,
    ctx: Context,
    request: IUpdateAcceleratingRequest
  ): Response {
    const ship = state.ships.find((s) => s.player === userId);
    if (ship === undefined) {
      return Response.error("Not joined");
    }
    ship.accelerating = request.accelerating;
    return Response.ok();
  }
  onTick(state: InternalState, ctx: Context, timeDelta: number): void {
    state.ships.forEach((ship) => {
      if (ship.rotation === Rotation.LEFT) {
        ship.angle -= SHIP_ROTATION_SPEED;
      } else if (ship.rotation === Rotation.RIGHT) {
        ship.angle += SHIP_ROTATION_SPEED;
      }
      if (ship.accelerating) {
        ship.location.x += Math.cos(ship.angle) * SHIP_SPEED * timeDelta;
        ship.location.y += Math.sin(ship.angle) * SHIP_SPEED * timeDelta;
      }
    });
  }
  getUserState(state: InternalState): GameState {
    return state;
  }
}
