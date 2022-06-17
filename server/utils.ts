import { Point2D, EntityType, Entity, UserId } from "../api/types";
import { GameArea } from "../shared/consts";

import { Context } from "./.hathora/methods";

export type InternalPlayerShip = Entity & {
  navigator: UserId;
  gunner?: UserId;
  lives: number;
  turretAngle: number;
  fireCooldown: number;
  target?: Point2D;
};
export type InternalEnemyShip = Entity & { fireCooldown: number };

export const PLAYER_FIRE_COOLDOWN = 1; // seconds
export const ENEMY_FIRE_COOLDOWN = 2; // seconds
export const ENEMY_SPAWN_COOLDOWN = 15; // seconds
export const PLAYER_SHIP_SPEED = 150; // pixels per second
export const ENEMY_SHIP_SPEED = 50; // pixels per second
export const PROJECTILE_SPEED = 400; // pixels per second
export const SHIP_TURN_SPEED = 0.1; // radians per second
export const SHIP_RADIUS = 20; // pixels
export const PROJECTILE_RADIUS = 2; // pixels

export function isOutOfBounds(location: Point2D) {
  return location.x < 0 || location.x > GameArea.width || location.y < 0 || location.y > GameArea.height;
}

export function collides(location1: Point2D, radius1: number, location2: Point2D, radius2: number) {
  return distance(location1, location2) < radius1 + radius2;
}

export function distance(location1: Point2D, location2: Point2D) {
  const dx = location2.x - location1.x;
  const dy = location2.y - location1.y;
  return Math.sqrt(dx * dx + dy * dy);
}

export function wrap(value: number, min: number, max: number) {
  const range = max - min;
  return min + ((((value - min) % range) + range) % range);
}

export function newEnemy(friendlyShips: InternalPlayerShip[], ctx: Context): InternalEnemyShip {
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

export function randomLocation(ctx: Context): Point2D {
  return {
    x: ctx.chance.natural({ max: GameArea.width }),
    y: ctx.chance.natural({ max: GameArea.height }),
  };
}

export function closestFriendlyShip(
  location: Point2D,
  friendlyShips: InternalPlayerShip[]
): InternalPlayerShip | undefined {
  let minDist = Number.POSITIVE_INFINITY;
  let closestShip = undefined;
  friendlyShips.forEach((ship) => {
    const dist = distance(ship.location, location);
    if (ship.lives > 0 && dist < minDist) {
      minDist = dist;
      closestShip = ship;
    }
  });
  return closestShip;
}

export function isGameOver(friendlyShips: InternalPlayerShip[]) {
  return friendlyShips.length > 0 && friendlyShips.every((ship) => ship.lives === 0);
}
