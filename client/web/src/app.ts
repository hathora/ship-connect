import Phaser from "phaser";

import { UserId } from "../../../api/types";
import { HathoraClient, HathoraConnection } from "../../.hathora/client";
import backgroundUrl from "../assets/background.png";
import shipUrl from "../assets/ship.png";

import { GAME_HEIGHT, GAME_WIDTH } from "./consts";
import { createKeyboardInput } from "./input";
import { ResizeScene } from "./ResizeScene";

export class GameScene extends Phaser.Scene {
  private connection: HathoraConnection | undefined;
  private players: Map<UserId, Phaser.GameObjects.Sprite> = new Map();

  private keyboardInput?: ReturnType<typeof createKeyboardInput>;

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

          this.keyboardInput = createKeyboardInput(this, connection);
        });
      });
    });

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.keyboardInput?.dispose();
    });
  }

  create() {
    // NOTE: using 2x width/height so that it covers space when in a mobile resolution
    // that could be slightly bigger; 2x _should_ cover all the cases
    this.add.tileSprite(0, 0, GAME_WIDTH * 2, GAME_HEIGHT * 2, "background").setOrigin(0, 0);
  }

  update(): void {
    if (this.connection === undefined) {
      return;
    }

    const { state } = this.connection;

    // process key input on update
    this.keyboardInput?.update();

    state.ships.forEach((ship) => {
      if (!this.players.has(ship.player)) {
        const sprite = new Phaser.GameObjects.Sprite(this, ship.location.x, ship.location.y, "player");
        sprite.setRotation(ship.angle);
        sprite.setScale(0.5, 0.5);
        this.players.set(ship.player, sprite);
        this.add.existing(sprite);
      } else {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const sprite = this.players.get(ship.player)!;
        sprite.setPosition(ship.location.x, ship.location.y);
        sprite.setRotation(ship.angle);
      }
    });
  }
}

const game = new Phaser.Game({
  type: Phaser.AUTO,
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  scene: [GameScene, ResizeScene],
  parent: "root",
  dom: { createContainer: true },
  scale: {
    mode: Phaser.Scale.ScaleModes.NONE,
  },
});

game.scene.start("resize-scene");
