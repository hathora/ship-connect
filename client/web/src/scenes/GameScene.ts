import InputText from "phaser3-rex-plugins/plugins/inputtext";

import { Role } from "../../../../api/types";
import { GameArea, SafeArea } from "../../../../shared/consts";
import { HathoraConnection } from "../../../.hathora/client";
import backgroundUrl from "../../assets/background.png";
import crosshairUrl from "../../assets/crosshair.png";
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
  private turretCrosshair?: Phaser.GameObjects.Image;
  private enemySprites: Map<number, Phaser.GameObjects.Image> = new Map();
  private projectileSprites: Map<number, Phaser.GameObjects.Image> = new Map();

  private safeContainer!: Phaser.GameObjects.Container;
  private scoreText!: Phaser.GameObjects.Text;

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
    // NOTE: using 2x width/height so that it covers space when in a mobile resolution
    // that could be slightly bigger; 2x _should_ cover all the cases
    this.add.tileSprite(0, 0, GameArea.width * 2, GameArea.height * 2, "background").setOrigin(0, 0);

    this.safeContainer = this.add.container();

    eventsCenter.on(Event.Resized, this.handleResized);

    this.scene.run("debug-scene", { safeContainer: this.safeContainer });
    this.scene.run("resize-scene");

    const roomCodeConfig: InputText.IConfig = {
      text: `Room Code: ${this.connection.stateId}`,
      color: "black",
      fontFamily: "futura",
      fontSize: "20px",
      readOnly: true,
    };
    const inputText = new InputText(this, GAME_WIDTH - 150, 20, 300, 50, roomCodeConfig);
    this.add.existing(inputText).setScrollFactor(0);

    this.scoreText = this.add
      .text(10, 10, "Score: 0", { color: "black", fontFamily: "futura", fontSize: "20px" })
      .setScrollFactor(0);

    const role = this.connection.state.role;

    // only the gunner gets the crosshairs
    if (role === Role.Gunner) {
      this.turretCrosshair = this.add.image(0, 0, "crosshair").setVisible(false);
      this.add.existing(this.turretCrosshair);
    }

    const pointerUpOrOut = () => {
      if (prevDragLoc.x !== -1 || prevDragLoc.y !== -1) {
        prevDragLoc = { x: -1, y: -1 };
        if (role === Role.Navigator) {
          this.connection?.thrustTowards({ location: undefined });
        } else if (role === Role.Gunner) {
          this.turretCrosshair?.setVisible(false);
          this.connection?.setTurretTarget({ location: undefined });
        }
      }
    };
    this.input.on("pointerup", pointerUpOrOut);
    this.input.on("gameout", pointerUpOrOut);
  }

  update(): void {
    if (this.connection === undefined) {
      return;
    }
    const { playerShip: ship, enemyShips, projectiles, turretAngle, score, gameOver } = this.connection.state;
    if (gameOver) {
      alert("Game over! Your final score was: " + score);
      return;
    }

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
          this.turretCrosshair?.setPosition(p.x, p.y);
          this.turretCrosshair?.setVisible(true);
          this.connection?.setTurretTarget({ location: { x, y } });
        }
      }
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
      this.cameras.main.startFollow(this.shipSprite);
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

    // score
    this.scoreText.text = `Score: ${score}`;
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
