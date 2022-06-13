import { Response } from "../api/base";
import { GameState, UserId, Point2D, IStopThrustingRequest, IThrustTowardsRequest } from "../api/types";

import { Methods, Context } from "./.hathora/methods";

type InternalState = {
  players: UserId[];
  playerShip: Point2D & { target?: Point2D };
};

const SHIP_SPEED = 100; // pixels per second

export class Impl implements Methods<InternalState> {
  initialize(): InternalState {
    return { players: [], playerShip: { x: 100, y: 100 } };
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
  }
  getUserState(state: InternalState): GameState {
    return state;
  }
}
