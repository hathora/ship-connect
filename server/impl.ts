import { Response } from "../api/base";
import { GameState, UserId, PlayerShip, Point2D, IStopThrustingRequest, IThrustTowardsRequest } from "../api/types";

import { Methods, Context } from "./.hathora/methods";

type InternalState = {
  players: UserId[];
  playerShip: PlayerShip & { target?: Point2D };
};

const SHIP_ROTATION_SPEED = 0.01; // radians per second
const SHIP_SPEED = 100; // pixels per second

export class Impl implements Methods<InternalState> {
  initialize(): InternalState {
    return { players: [], playerShip: { location: { x: 100, y: 100 }, angle: 0 } };
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
    if (ship.target === undefined) {
      return;
    }
    const dx = ship.target.x - ship.location.x;
    const dy = ship.target.y - ship.location.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const pixelsToMove = SHIP_SPEED * timeDelta;
    if (dist <= pixelsToMove) {
      ship.location = ship.target;
      ship.target = undefined;
    } else {
      ship.location.x += (dx / dist) * pixelsToMove;
      ship.location.y += (dy / dist) * pixelsToMove;
    }
  }
  getUserState(state: InternalState): GameState {
    return state;
  }
}
