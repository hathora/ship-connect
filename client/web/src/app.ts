import Phaser from "phaser";

import { SafeArea } from "../../../server/shared/consts";
import { HathoraClient, HathoraConnection } from "../../.hathora/client";
import backgroundUrl from "../assets/background.png";
import shipUrl from "../assets/ship.png";

import { GAME_HEIGHT, GAME_WIDTH } from "./consts";
import { DebugScene } from "./DebugScene";
import { Event, eventsCenter } from "./events";
import { ResizeScene } from "./ResizeScene";

export class GameScene extends Phaser.Scene {
  private connection: HathoraConnection | undefined;
  private shipSprite: Phaser.GameObjects.Sprite | undefined;

  private safeContainer!: Phaser.GameObjects.Container;

  constructor() {
    super("game");
  }

  preload() {
    this.load.image("background", backgroundUrl);
    this.load.image("ship", shipUrl);
  }

  init() {
    const client = new HathoraClient();
    client.loginAnonymous().then((token) => {
      client.create(token, {}).then((stateId) => {
        client.connect(token, stateId).then((connection) => {
          this.connection = connection;
          connection.joinGame({});
        });
      });
    });
  }

  create() {
    // NOTE: using 2x width/height so that it covers space when in a mobile resolution
    // that could be slightly bigger; 2x _should_ cover all the cases
    this.add.tileSprite(0, 0, GAME_WIDTH * 2, GAME_HEIGHT * 2, "background").setOrigin(0, 0);

    this.safeContainer = this.add.container();

    eventsCenter.on(Event.Resized, this.handleResized);

    this.scene.run("debug-scene", { safeContainer: this.safeContainer });
    this.scene.run("resize-scene");

    let prevDragLoc = { x: -1, y: -1 };
    this.input.on("pointermove", (pointer) => {
      if (pointer.isDown) {
        const { x, y } = pointer;
        if (x !== prevDragLoc.x || y !== prevDragLoc.y) {
          this.connection?.thrustTowards({ location: { x, y } });
        }
        prevDragLoc = { x, y };
      }
    });
    this.input.on("pointerdown", (pointer) => {
      const { x, y } = pointer;
      if (x !== prevDragLoc.x || y !== prevDragLoc.y) {
        this.connection?.thrustTowards({ location: { x, y } });
      }
      prevDragLoc = { x, y };
    });
    this.input.on("pointerup", () => {
      if (prevDragLoc.x !== -1 || prevDragLoc.y !== -1) {
        this.connection?.stopThrusting({});
        prevDragLoc = { x: -1, y: -1 };
      }
    });
    this.input.on("gameout", () => {
      if (prevDragLoc.x !== -1 || prevDragLoc.y !== -1) {
        this.connection?.stopThrusting({});
        prevDragLoc = { x: -1, y: -1 };
      }
    });
  }

  update(): void {
    if (this.connection === undefined) {
      return;
    }

    const { state } = this.connection;
    const { playerShip: ship } = state;

    if (this.shipSprite === undefined) {
      this.shipSprite = new Phaser.GameObjects.Sprite(this, ship.location.x, ship.location.y, "ship");
      this.shipSprite.setScale(0.5, 0.5);
      this.add.existing(this.shipSprite);
    }
    this.shipSprite.setPosition(ship.location.x, ship.location.y);
    this.shipSprite.setRotation(ship.angle);
  }

  private addChild(go: Phaser.GameObjects.GameObject) {
    if (this.safeContainer) {
      this.safeContainer.add(go);
    } else {
      this.add.existing(go);
    }
  }

  private positionSafeContainer() {
    if (!this.safeContainer) {
      return;
    }

    const { width, height } = this.scale;
    const x = (width - SafeArea.width) * 0.5;
    const y = (height - SafeArea.height) * 0.5;

    this.safeContainer.x = x;
    this.safeContainer.y = y;
  }

  private handleResized = () => {
    this.positionSafeContainer();
  };
}

new Phaser.Game({
  type: Phaser.AUTO,
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  scene: [GameScene, ResizeScene, DebugScene],
  parent: "root",
  dom: { createContainer: true },
  scale: {
    mode: Phaser.Scale.ScaleModes.NONE,
  },
});
