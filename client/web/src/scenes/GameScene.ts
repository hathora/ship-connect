import InputText from "phaser3-rex-plugins/plugins/inputtext";

import { Role } from "../../../../api/types";
import { GameArea, SafeArea } from "../../../../shared/consts";
import { HathoraConnection } from "../../../.hathora/client";
import backgroundUrl from "../../assets/background.png";
import enemyUrl from "../../assets/enemy.png";
import laserUrl from "../../assets/laser.png";
import playerUrl from "../../assets/player.png";
import turretUrl from "../../assets/turret.png";
import { GAME_WIDTH } from "../consts";
import { Event, eventsCenter } from "../events";
import { syncSprites } from "../utils";

let prevDragLoc = { x: -1, y: -1 };

export class GameScene extends Phaser.Scene {
  private connection!: HathoraConnection;

  private shipSprite?: Phaser.GameObjects.Image;
  private shipTurret?: Phaser.GameObjects.Image;
  private turretAimLine!: Phaser.GameObjects.Line;
  private enemySprites: Map<number, Phaser.GameObjects.Sprite> = new Map();
  private projectileSprites: Map<number, Phaser.GameObjects.Image> = new Map();

  private safeContainer!: Phaser.GameObjects.Container;

  constructor() {
    super("game");
  }

  preload() {
    this.load.image("background", backgroundUrl);
    this.load.image("enemy", enemyUrl);
    this.load.image("laser", laserUrl);
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

    const winResize = () => {
      eventsCenter.on(Event.Resized, this.handleResized);
    };
    window.addEventListener("resize", winResize);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      eventsCenter.off(Event.Resized, this.handleResized);
      window.removeEventListener("resize", winResize);
    });
    this.events.once(Phaser.Scenes.Events.DESTROY, () => eventsCenter.removeAllListeners());
  }

  create() {
    this.add.tileSprite(0, 0, GameArea.width, GameArea.height * 2, "background").setOrigin(0, 0);

    this.safeContainer = this.add.container();

    eventsCenter.on(Event.Resized, this.handleResized);

    this.scene.run("debug-scene", { safeContainer: this.safeContainer });
    this.scene.run("resize-scene");
    this.scene.run("hud-scene", { connection: this.connection });

    this.turretAimLine = new Phaser.GameObjects.Line(this, 0, 0, 0, 0, 0, 0, 0xff0000, 0.5);
    this.safeContainer.add(this.turretAimLine);

    const roomCodeConfig: InputText.IConfig = {
      text: `Room Code: ${this.connection.stateId}`,
      color: "black",
      fontFamily: "futura",
      fontSize: "20px",
      readOnly: true,
    };
    const inputText = new InputText(this, GAME_WIDTH - 150, 20, 300, 50, roomCodeConfig);
    this.add.existing(inputText).setScrollFactor(0);

    const role = this.connection.state.role;

    const pointerUpOrOut = () => {
      if (prevDragLoc.x !== -1 || prevDragLoc.y !== -1) {
        prevDragLoc = { x: -1, y: -1 };
        if (role === Role.Navigator) {
          this.connection?.thrustTowards({ location: undefined });
        } else if (role === Role.Gunner) {
          this.connection?.setTurretTarget({ location: undefined });
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
  }

  update(): void {
    if (this.connection === undefined) {
      return;
    }
    const { playerShip: ship, enemyShips, projectiles, turretAngle } = this.connection.state;

    const pointer = this.input.activePointer;
    if (pointer.isDown) {
      // NOTE: need to update this since as camera scrolls, the target position is changing
      const role = this.connection.state.role;
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

    // ship
    if (this.shipSprite === undefined || this.shipTurret === undefined) {
      this.shipSprite = new Phaser.GameObjects.Image(this, ship.location.x, ship.location.y, "player");
      this.shipSprite.setScale(0.5);
      this.safeContainer.add(this.shipSprite);
      this.shipTurret = this.add.image(ship.location.x, ship.location.y, "turret").setScale(0.6).setOrigin(0.2, 0.5);
      this.safeContainer.add(this.shipTurret);
      this.cameras.main.startFollow(this.shipSprite);
    }
    this.shipSprite.setRotation(ship.angle);
    this.shipSprite.setPosition(ship.location.x, ship.location.y);

    // turret
    this.shipTurret.setPosition(this.shipSprite.x, this.shipSprite.y);
    this.shipTurret.rotation = turretAngle;
    this.turretAimLine.setTo(
      ship.location.x,
      ship.location.y,
      ship.location.x + Math.cos(turretAngle) * GAME_WIDTH,
      ship.location.y + Math.sin(turretAngle) * GAME_WIDTH
    );

    // enemies
    syncSprites(
      this.enemySprites,
      new Map(enemyShips.map((enemy) => [enemy.id, enemy])),
      (enemy) => {
        const sprite = new Phaser.GameObjects.Sprite(this, enemy.location.x, enemy.location.y, "enemy");
        sprite.setScale(0.5);
        this.safeContainer.add(sprite);
        return sprite;
      },
      (enemySprite, enemy) => enemySprite.setPosition(enemy.location.x, enemy.location.y).setRotation(enemy.angle),
      (enemySprite) => {
        const explosion = this.add.sprite(enemySprite.x, enemySprite.y, "explosion");
        this.safeContainer.add(explosion);
        explosion.play("explosion");
        explosion.once(`${Phaser.Animations.Events.ANIMATION_COMPLETE_KEY}-explosion`, () => {
          explosion.destroy();
        });
      }
    );

    // projectiles
    syncSprites(
      this.projectileSprites,
      new Map(projectiles.map((projectile) => [projectile.id, projectile])),
      (projectile) => {
        const sprite = new Phaser.GameObjects.Sprite(this, projectile.location.x, projectile.location.y, "laser");
        sprite.setScale(0.5);
        this.safeContainer.add(sprite);
        if (this.shipTurret !== undefined) {
          this.safeContainer.moveBelow(sprite, this.shipTurret);
        }
        return sprite;
      },
      (projectileSprite, projectile) =>
        projectileSprite.setPosition(projectile.location.x, projectile.location.y).setRotation(projectile.angle)
    );
  }

  private handleResized = () => {
    if (this.safeContainer !== undefined) {
      const { height } = this.scale;
      this.safeContainer.x = 0;
      this.safeContainer.y = (height - SafeArea.height) * 0.5;

      this.cameras.main.setFollowOffset(0, -this.safeContainer.y);
      this.cameras.main.setBounds(0, 0, GameArea.width, height);
    }
  };
}
