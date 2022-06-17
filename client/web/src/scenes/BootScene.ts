import Phaser from "phaser";

export class BootScene extends Phaser.Scene {
  constructor() {
    super("boot-scene");
  }

  create() {
    this.scene.run("resize-scene");
    this.scene.run("lobby");
  }
}
