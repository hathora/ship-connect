import Phaser from "phaser";

import type { HathoraConnection } from "../../../.hathora/client";

export class HUDScene extends Phaser.Scene {
  private connection!: HathoraConnection;

  private hearts: Phaser.GameObjects.Image[] = [];
  private scoreText!: Phaser.GameObjects.Text;

  private lastHealth = 0;

  constructor() {
    super("hud-scene");
  }

  create({ connection }: { connection: HathoraConnection }) {
    this.connection = connection;

    this.hearts.push(
      this.add.image(20, 20, "heart-full").setScale(0.5),
      this.add.image(50, 20, "heart-full").setScale(0.5),
      this.add.image(80, 20, "heart-full").setScale(0.5)
    );

    this.scoreText = this.add
      .text(this.scale.width - 20, 20, "Score: 0", { color: "white", fontFamily: "futura", fontSize: "20px" })
      .setOrigin(1, 0.5)
      .setAlign("right")
      .setStroke("black", 4);
  }

  update() {
    if (!this.connection) {
      return;
    }

    const { playerShip, score } = this.connection.state;

    // score
    this.scoreText.text = `Score: ${score}`;

    if (!playerShip) {
      return;
    }

    const health = playerShip.health ?? 0;
    if (this.lastHealth === health) {
      return;
    }

    for (let i = 0; i < this.hearts.length; ++i) {
      const v = (i + 1) * 33;
      const heart = this.hearts[i];
      if (v <= health) {
        heart.setTexture("heart-full");
      } else {
        heart.setTexture("heart-empty");
      }
    }

    this.lastHealth = health;
  }
}
