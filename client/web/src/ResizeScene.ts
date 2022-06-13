import Phaser from "phaser";

import { GAME_HEIGHT, GAME_WIDTH } from "./consts";

export class ResizeScene extends Phaser.Scene {
  constructor() {
    super("resize-scene");
  }

  init() {
    window.addEventListener("resize", this.handleResize);
    this.events.once(Phaser.Scenes.Events.DESTROY, () => {
      window.removeEventListener("resize", this.handleResize);
    });

    this.handleResize();
  }

  private handleResize = () => {
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;

    if (windowWidth > 768) {
      // NOTE: this is just for responsiveness
      const { width, height } = this.scale;
      if (width !== GAME_WIDTH || height !== GAME_HEIGHT) {
        this.scale.resize(GAME_WIDTH, GAME_HEIGHT);
      }
      return;
    }

    this.scale.resize(windowWidth, windowHeight);
  };
}
