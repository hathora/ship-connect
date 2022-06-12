import Phaser from "phaser";

import { Rotation, UserId } from "../../../api/types";
import { HathoraClient, HathoraConnection } from "../../.hathora/client";
import backgroundUrl from "../assets/background.png";
import shipUrl from "../assets/ship.png";

export class GameScene extends Phaser.Scene {
  private connection: HathoraConnection | undefined;
  private players: Map<UserId, Phaser.GameObjects.Sprite> = new Map();

  constructor() {
    super("game");
  }

  preload() {
    this.load.image("background", backgroundUrl);
    this.load.image("player", shipUrl);
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
    this.cameras.main.setBounds(0, 0, 8000, 6000);
    this.add.tileSprite(0, 0, 8000, 8000, "background").setOrigin(0, 0);

    const keysDown: Set<string> = new Set();
    const processInput = () => {
      if (keysDown.has("ArrowUp")) {
        this.connection?.updateAccelerating({ accelerating: true });
      } else {
        this.connection?.updateAccelerating({ accelerating: false });
      }
      if (keysDown.has("ArrowLeft")) {
        this.connection?.updateRotation({ rotation: Rotation.LEFT });
      } else if (keysDown.has("ArrowRight")) {
        this.connection?.updateRotation({ rotation: Rotation.RIGHT });
      } else {
        this.connection?.updateRotation({ rotation: Rotation.NONE });
      }
    };
    this.input.keyboard.on("keydown", (e: KeyboardEvent) => {
      keysDown.add(e.key);
      processInput();
    });
    this.input.keyboard.on("keyup", (e: KeyboardEvent) => {
      keysDown.delete(e.key);
      processInput();
    });
  }

  update(): void {
    if (this.connection === undefined) {
      return;
    }

    const { state } = this.connection;

    state.ships.forEach((ship) => {
      if (!this.players.has(ship.player)) {
        const sprite = new Phaser.GameObjects.Sprite(this, ship.location.x, ship.location.y, "player");
        sprite.setRotation(ship.angle + Math.PI * 0.75);
        this.players.set(ship.player, sprite);
        this.add.existing(sprite);
        this.cameras.main.startFollow(sprite);
      } else {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const sprite = this.players.get(ship.player)!;
        sprite.setPosition(ship.location.x, ship.location.y);
        sprite.setRotation(ship.angle + Math.PI * 0.5);
      }
    });
  }
}

new Phaser.Game({
  type: Phaser.AUTO,
  width: 800,
  height: 600,
  scene: [GameScene],
  parent: "root",
  dom: { createContainer: true },
});
