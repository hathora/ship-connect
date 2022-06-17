import { Response } from "../api/base";
import {
  GameState,
  UserId,
  IThrustTowardsRequest,
  ISetTurretTargetRequest,
  Role,
  Entity,
  EntityType,
} from "../api/types";
import { SafeArea } from "../shared/consts";

import { Methods, Context } from "./.hathora/methods";
import {
  InternalPlayerShip,
  InternalEnemyShip,
  isGameOver,
  newEnemy,
  wrap,
  closestFriendlyShip,
  isOutOfBounds,
  collides,
  distance,
  ENEMY_FIRE_COOLDOWN,
  ENEMY_SHIP_SPEED,
  ENEMY_SPAWN_COOLDOWN,
  PLAYER_FIRE_COOLDOWN,
  PLAYER_SHIP_SPEED,
  PROJECTILE_RADIUS,
  PROJECTILE_SPEED,
  SHIP_RADIUS,
  SHIP_TURN_SPEED,
} from "./utils";

type InternalState = {
  friendlyShips: InternalPlayerShip[];
  enemyShips: InternalEnemyShip[];
  projectiles: Entity[];
  score: number;
  spawnCooldown: number;
};

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
    if (isGameOver(state.friendlyShips)) {
      return Response.error("Game is over");
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
    if (!isGameOver(state.friendlyShips)) {
      return Response.error("Game in progress");
    }
    Object.assign(state, {
      ...this.initialize(),
      friendlyShips: state.friendlyShips.map((ship) => ({ ...ship, target: undefined, lives: 3 })),
    });
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
    const playerShip = state.friendlyShips.find((ship) => ship.gunner === userId);
    if (playerShip === undefined) {
      return Response.error("Not gunner");
    }
    const dx = request.location.x - playerShip.location.x;
    const dy = request.location.y - playerShip.location.y;
    playerShip.turretAngle = Math.atan2(dy, dx);
    return Response.ok();
  }
  onTick(state: InternalState, ctx: Context, timeDelta: number): void {
    const { friendlyShips, enemyShips, projectiles } = state;
    if (isGameOver(friendlyShips)) {
      return;
    }

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
      const closestShip = closestFriendlyShip(enemy.location, friendlyShips);
      if (closestShip === undefined) {
        return;
      }
      const dx = closestShip.location.x - enemy.location.x;
      const dy = closestShip.location.y - enemy.location.y;
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
      if (friendly.lives > 0) {
        enemyShips.forEach((enemy, enemyIdx) => {
          if (collides(friendly.location, SHIP_RADIUS, enemy.location, SHIP_RADIUS)) {
            friendly.lives = 0;
            state.score++;
            enemyShips.splice(enemyIdx, 1);
          }
        });
      }
    });

    // friendly-friendly ship collision
    [...friendlyShips].forEach((friendly1) => {
      if (friendly1.lives > 0 && friendly1.gunner === undefined) {
        friendlyShips.forEach((friendly2, idx) => {
          if (
            friendly1.id !== friendly2.id &&
            friendly2.lives > 0 &&
            friendly2.gunner === undefined &&
            collides(friendly1.location, SHIP_RADIUS, friendly2.location, SHIP_RADIUS)
          ) {
            friendly1.gunner = friendly2.navigator;
            friendlyShips.splice(idx, 1);
          }
        });
      }
    });

    // projectile collisions
    projectiles.forEach((projectile, projectileIdx) => {
      if (projectile.type === EntityType.Enemy) {
        friendlyShips.forEach((ship) => {
          if (collides(ship.location, SHIP_RADIUS, projectile.location, PROJECTILE_RADIUS)) {
            ship.lives -= 1;
            projectiles.splice(projectileIdx, 1);
            ctx.sendEvent("hit", ship.navigator);
            if (ship.gunner !== undefined) {
              ctx.sendEvent("hit", ship.gunner);
            }
          }
        });
      } else if (projectile.type === EntityType.Friendly) {
        enemyShips.forEach((enemy, enemyIdx) => {
          if (collides(enemy.location, SHIP_RADIUS, projectile.location, PROJECTILE_RADIUS)) {
            state.score++;
            enemyShips.splice(enemyIdx, 1);
            projectiles.splice(projectileIdx, 1);
            enemyShips.push(newEnemy(friendlyShips, ctx));
          }
        });
      }
    });

    // spawn new projectiles on cooldown
    friendlyShips.forEach((ship) => {
      if (ship.lives > 0) {
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
    state.friendlyShips.forEach((ship) => {
      if (ship.lives > 0 || ship.id === playerShip?.id) {
        ships.push(ship);
      }
    });
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
