import Phaser from "phaser";

import { UserId } from "../../../api/types";
import { SafeArea } from "../../../server/shared/consts";
import { HathoraClient, HathoraConnection } from "../../.hathora/client";
import backgroundUrl from "../assets/background.png";
import shipUrl from "../assets/ship.png";

import { GAME_HEIGHT, GAME_WIDTH } from "./consts";
import { DebugScene } from "./DebugScene";
import { Event, eventsCenter } from "./events";
import { createKeyboardInput } from "./input";
import { ResizeScene } from "./ResizeScene";

export class GameScene extends Phaser.Scene {
  private connection: HathoraConnection | undefined;
  private players: Map<UserId, Phaser.GameObjects.Sprite> = new Map();

  private keyboardInput?: ReturnType<typeof createKeyboardInput>;

  private safeContainer!: Phaser.GameObjects.Container;

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
      eventsCenter.off(Event.Resized, this.handleResized);
    });

    this.events.once(Phaser.Scenes.Events.DESTROY, () => {
      eventsCenter.removeAllListeners();
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
        this.addChild(sprite);
      } else {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const sprite = this.players.get(ship.player)!;
        sprite.setPosition(ship.location.x, ship.location.y);
        sprite.setRotation(ship.angle);
      }
    });
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
