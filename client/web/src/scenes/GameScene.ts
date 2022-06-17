import InputText from "phaser3-rex-plugins/plugins/inputtext";

import { EntityType, Role } from "../../../../api/types";
import { GameArea, SafeArea } from "../../../../shared/consts";
import { HathoraConnection } from "../../../.hathora/client";
import backgroundUrl from "../../assets/background.png";
import enemyUrl from "../../assets/enemy.png";
import laserBlueUrl from "../../assets/laser-blue.png";
import laserRedUrl from "../../assets/laser-red.png";
import playerUrl from "../../assets/player.png";
import turretUrl from "../../assets/turret.png";
import { GAME_WIDTH } from "../consts";
import { Event, eventsCenter } from "../events";
import { syncSprites } from "../utils";

let prevDragLoc = { x: -1, y: -1 };

export class GameScene extends Phaser.Scene {
  private connection!: HathoraConnection;

  private shipSprites: Map<number, Phaser.GameObjects.Sprite> = new Map();
  private projectileSprites: Map<number, Phaser.GameObjects.Image> = new Map();
  private turretAimLine!: Phaser.GameObjects.Line;

  private safeContainer!: Phaser.GameObjects.Container;

  constructor() {
    super("game");
  }

  preload() {
    this.load.image("background", backgroundUrl);
    this.load.image("enemy", enemyUrl);
    this.load.image("laser-blue", laserBlueUrl);
    this.load.image("laser-red", laserRedUrl);
    this.load.image("turret", turretUrl);
    this.load.image("player", playerUrl);

    this.load.atlas("explosion", "assets/explosion.png", "assets/explosion.json");
    this.load.image("heart-full", "assets/hud_heartFull.png");
    this.load.image("heart-empty", "assets/hud_heartEmpty.png");
    this.load.image("panel", "assets/grey_panel.png");
    this.load.image("button", "assets/green_button03.png");
  }

  init({ connection }: { connection: HathoraConnection }) {
    this.connection = connection;

    connection.onUpdate(({ events }) => {
      events.forEach((event) => {
        if (event === "hit") {
          this.cameras.main.shake(300, 0.03);
        }
      });
    });

    const winResize = () => eventsCenter.on(Event.Resized, this.handleResized);
    window.addEventListener("resize", winResize);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      eventsCenter.off(Event.Resized, this.handleResized);
      window.removeEventListener("resize", winResize);
    });
    this.events.once(Phaser.Scenes.Events.DESTROY, () => eventsCenter.removeAllListeners());
  }

  create() {
    this.add.tileSprite(0, 0, GameArea.width * 2, GameArea.height, "background").setOrigin(0, 0);

    this.safeContainer = this.add.container();

    eventsCenter.on(Event.Resized, this.handleResized);

    // this.scene.run("debug-scene", { safeContainer: this.safeContainer });
    this.scene.run("hud-scene", { connection: this.connection });

    this.turretAimLine = new Phaser.GameObjects.Line(this, 0, 0, 0, 0, 0, 0, 0xff0000, 0.5);
    this.safeContainer.add(this.turretAimLine);

    const role = this.connection.state.playerShip!.role;
    const pointerUpOrOut = () => {
      if (prevDragLoc.x !== -1 || prevDragLoc.y !== -1) {
        prevDragLoc = { x: -1, y: -1 };
        if (role === Role.Navigator) {
          this.connection?.thrustTowards({ location: undefined });
        }
      }
    };
    this.input.on("pointerup", pointerUpOrOut);
    this.input.on("gameout", pointerUpOrOut);

    this.anims.create({
      key: "explosion",
      frames: this.anims.generateFrameNames("explosion", {
        start: 0,
        end: 8,
        prefix: "regularExplosion0",
        suffix: ".png",
      }),
      frameRate: 15,
    });

    this.handleResized();
  }

  update(): void {
    if (this.connection === undefined) {
      return;
    }
    const { playerShip, ships, projectiles } = this.connection.state;
    if (playerShip === undefined) {
      return;
    }

    const pointer = this.input.activePointer;
    if (pointer.isDown) {
      // NOTE: need to calc this on update since as camera scrolls, the target position is changing
      const role = playerShip.role;
      const p = pointer.positionToCamera(this.cameras.main) as Phaser.Math.Vector2;
      const { x, y } = this.safeContainer.pointToContainer(p) as Phaser.Math.Vector2;
      if (x !== prevDragLoc.x || y !== prevDragLoc.y) {
        prevDragLoc = { x, y };
        if (role === Role.Navigator) {
          this.connection?.thrustTowards({ location: { x, y } });
        } else if (role === Role.Gunner) {
          this.connection?.setTurretTarget({ location: { x, y } });
        }
      }
    }

    // ships
    syncSprites(
      this.shipSprites,
      new Map(ships.map((ship) => [ship.id, ship])),
      (ship) => {
        const texture = ship.type === EntityType.Friendly ? "player" : "enemy";
        const sprite = new Phaser.GameObjects.Sprite(this, ship.location.x, ship.location.y, texture);
        sprite.setScale(0.5);
        this.safeContainer.add(sprite);
        if (playerShip.id === ship.id) {
          this.cameras.main.startFollow(sprite);
        }
        return sprite;
      },
      (shipSprite, ship) => {
        shipSprite.setPosition(ship.location.x, ship.location.y).setRotation(ship.angle);
        if (playerShip.id === ship.id && playerShip.lives <= 0) {
          shipSprite.setAlpha(0.5);
        } else {
          shipSprite.setAlpha(1);
        }
      },
      (shipSprite) => this.playExplosion(shipSprite.x, shipSprite.y)
    );

    // projectiles
    syncSprites(
      this.projectileSprites,
      new Map(projectiles.map((projectile) => [projectile.id, projectile])),
      (projectile) => {
        const texture = projectile.type === EntityType.Friendly ? "laser-blue" : "laser-red";
        const sprite = new Phaser.GameObjects.Sprite(this, projectile.location.x, projectile.location.y, texture);
        sprite.setScale(0.5);
        this.safeContainer.add(sprite);
        return sprite;
      },
      (projectileSprite, projectile) =>
        projectileSprite.setPosition(projectile.location.x, projectile.location.y).setRotation(projectile.angle)
    );
  }

  private playExplosion(x: number, y: number) {
    const explosion = this.add.sprite(x, y, "explosion");
    this.safeContainer.add(explosion);
    explosion.play("explosion");
    explosion.once(`${Phaser.Animations.Events.ANIMATION_COMPLETE_KEY}-explosion`, () => {
      explosion.destroy();
    });
  }

  private handleResized = () => {
    if (this.safeContainer !== undefined) {
      const { width } = this.scale;
      this.safeContainer.x = (width - SafeArea.width) * 0.5;
      this.safeContainer.y = 0;

      this.cameras.main.setFollowOffset(-this.safeContainer.x, -this.safeContainer.y);
      this.cameras.main.setBounds(0, 0, width, GameArea.height);
    }
  };
}
