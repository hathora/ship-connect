import Phaser from "phaser";

export class BootScene extends Phaser.Scene {
  constructor() {
    super("boot-scene");
  }

  create() {
    this.scene.run("lobby");
    this.scene.run("resize-scene");
  }
}
