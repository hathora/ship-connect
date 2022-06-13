import Phaser from "phaser";

import { SafeArea } from "../../../server/shared/consts";

import { eventsCenter, Event } from "./events";

type Options = {
  safeContainer: Phaser.GameObjects.Container;
};

const LINE_WIDTH = 2;

export class DebugScene extends Phaser.Scene {
  private safeRect?: Phaser.GameObjects.Rectangle;
  private safeContainer?: Phaser.GameObjects.Container;

  constructor() {
    super("debug-scene");
  }

  init() {
    this.events.on(Phaser.Scenes.Events.SHUTDOWN, () => {
      eventsCenter.off(Event.Resized, this.handleResized);
    });
  }

  create({ safeContainer }: Options) {
    if (!safeContainer) {
      return;
    }

    this.safeContainer = safeContainer;

    this.safeRect = this.add
      .rectangle(safeContainer.x, safeContainer.y, SafeArea.width, SafeArea.height, 0, 0)
      .setOrigin(0);
    this.safeRect.setStrokeStyle(LINE_WIDTH, 0x00ff00, 0.7);

    eventsCenter.on(Event.Resized, this.handleResized);
  }

  private handleResized = () => {
    if (!this.safeRect || !this.safeContainer) {
      return;
    }

    this.safeRect.x = this.safeContainer.x;
    this.safeRect.y = this.safeContainer.y;
  };
}
