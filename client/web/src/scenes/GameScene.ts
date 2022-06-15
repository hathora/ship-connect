import InputText from "phaser3-rex-plugins/plugins/inputtext";

import { Role } from "../../../../api/types";
import { SafeArea } from "../../../../shared/consts";
import { HathoraConnection } from "../../../.hathora/client";
import backgroundUrl from "../../assets/background.png";
import crosshairUrl from "../../assets/crosshair.png";
import enemyUrl from "../../assets/enemy.png";
import laserUrl from "../../assets/laser.png";
import playerUrl from "../../assets/player.png";
import turretUrl from "../../assets/turret.png";
import { GAME_WIDTH, GAME_HEIGHT } from "../consts";
import { Event, eventsCenter } from "../events";
import { syncSprites } from "../utils";

export class GameScene extends Phaser.Scene {
  private connection!: HathoraConnection;

  private shipSprite?: Phaser.GameObjects.Image;
  private shipTurret?: Phaser.GameObjects.Image;
  private turretCrosshair?: Phaser.GameObjects.Image;
  private enemySprites: Map<number, Phaser.GameObjects.Image> = new Map();
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
    this.load.image("crosshair", crosshairUrl);
  }

  init({ connection }: { connection: HathoraConnection }) {
    this.connection = connection;

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => eventsCenter.off(Event.Resized, this.handleResized));
    this.events.once(Phaser.Scenes.Events.DESTROY, () => eventsCenter.removeAllListeners());
  }

  create() {
    // NOTE: using 2x width/height so that it covers space when in a mobile resolution
    // that could be slightly bigger; 2x _should_ cover all the cases
    this.add.tileSprite(0, 0, GAME_WIDTH * 2, GAME_HEIGHT * 2, "background").setOrigin(0, 0);

    this.safeContainer = this.add.container();

    eventsCenter.on(Event.Resized, this.handleResized);

    this.scene.run("debug-scene", { safeContainer: this.safeContainer });
    this.scene.run("resize-scene");

    const roomCodeConfig: InputText.IConfig = {
      border: 10,
      text: `Room Code: ${this.connection.stateId}`,
      color: "black",
      fontFamily: "futura",
      readOnly: true,
    };
    const inputText = new InputText(this, GAME_WIDTH - 100, 20, 200, 50, roomCodeConfig).setScrollFactor(0);
    this.add.existing(inputText);

    const role = this.connection.state.role;

    // only the gunner gets the crosshairs
    if (role === Role.Gunner) {
      this.turretCrosshair = this.add.image(0, 0, "crosshair").setVisible(false);
      this.add.existing(this.turretCrosshair);
    }

    let prevDragLoc = { x: -1, y: -1 };
    const pointerDown = (pointer: Phaser.Input.Pointer) => {
      if (!pointer.isDown) {
        return;
      }
      const p = this.safeContainer.pointToContainer(pointer) as Phaser.Math.Vector2;
      const { x, y } = p;
      if (role === Role.Navigator) {
        if (x !== prevDragLoc.x || y !== prevDragLoc.y) {
          this.connection?.thrustTowards({ location: { x, y } });
        }
        prevDragLoc = { x, y };
      } else if (role === Role.Gunner) {
        this.turretCrosshair?.setPosition(pointer.x, pointer.y);
        this.turretCrosshair?.setVisible(true);
        this.connection?.setTurretTarget({ location: { x, y } });
      }
    };
    const pointerUpOrOut = () => {
      if (role === Role.Navigator) {
        if (prevDragLoc.x !== -1 || prevDragLoc.y !== -1) {
          this.connection?.thrustTowards({ location: undefined });
          prevDragLoc = { x: -1, y: -1 };
        }
      } else if (role === Role.Gunner) {
        this.turretCrosshair?.setVisible(false);
        this.connection?.setTurretTarget({ location: undefined });
      }
    };

    this.input.on("pointermove", pointerDown);
    this.input.on("pointerdown", pointerDown);
    this.input.on("pointerup", pointerUpOrOut);
    this.input.on("gameout", pointerUpOrOut);
  }

  update(): void {
    if (this.connection === undefined) {
      return;
    }
    const { playerShip: ship, enemyShips, projectiles, turretAngle, score, gameOver } = this.connection.state;
    if (gameOver) {
      alert("Game over: " + score);
      return;
    }

    // ship
    if (this.shipSprite === undefined || this.shipTurret === undefined) {
      this.shipSprite = new Phaser.GameObjects.Image(this, ship.location.x, ship.location.y, "player");
      this.shipSprite.setScale(0.5);
      this.safeContainer.add(this.shipSprite);
      this.shipTurret = this.add
        .image(this.shipSprite.x, this.shipSprite.y, "turret")
        .setScale(0.6)
        .setOrigin(0.2, 0.5);
      this.safeContainer.add(this.shipTurret);
    }
    this.shipSprite.setRotation(ship.angle);
    this.shipSprite.setPosition(ship.location.x, ship.location.y);

    // turret
    this.shipTurret.setPosition(this.shipSprite.x, this.shipSprite.y);
    this.shipTurret.rotation = turretAngle;

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
      (enemySprite, enemy) => enemySprite.setPosition(enemy.location.x, enemy.location.y).setRotation(enemy.angle)
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
      const { width, height } = this.scale;
      this.safeContainer.x = (width - SafeArea.width) * 0.5;
      this.safeContainer.y = (height - SafeArea.height) * 0.5;
    }
  };
}
