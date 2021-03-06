import Phaser from "phaser";
import InputText from "phaser3-rex-plugins/plugins/inputtext";

import { Entity, EntityType, Role } from "../../../../api/types";
import { SafeArea } from "../../../../shared/consts";
import { Event, eventsCenter } from "../events";

import type { HathoraConnection } from "../../../.hathora/client";

enum State {
  Playing,
  GameOver,
  Restarting,
}

function roleAsString(role?: Role) {
  switch (role) {
    case Role.Gunner:
      return "Gunner";
    case Role.Navigator:
      return "Navigator";
    default:
    case Role.Spectator:
      return "Spectator";
  }
}

export class HUDScene extends Phaser.Scene {
  private connection!: HathoraConnection;

  private hearts: Phaser.GameObjects.Image[] = [];
  private scoreText!: Phaser.GameObjects.Text;

  private gameOverContainer!: Phaser.GameObjects.Container;
  private finalScoreText!: Phaser.GameObjects.Text;

  private roleText!: Phaser.GameObjects.Text;

  private lastHealth = 0;

  private state = State.Playing;

  constructor() {
    super("hud-scene");
  }

  create({ connection }: { connection: HathoraConnection }) {
    this.connection = connection;
    const { width, height } = this.scale;

    this.hearts.push(
      this.add.image(20, 20, "heart-full").setScale(0.5),
      this.add.image(50, 20, "heart-full").setScale(0.5),
      this.add.image(80, 20, "heart-full").setScale(0.5)
    );

    this.scoreText = this.add
      .text(width - 20, 20, "0 kills", { color: "white", fontFamily: "futura", fontSize: "20px" })
      .setOrigin(1, 0.5)
      .setAlign("right")
      .setStroke("black", 4);

    this.roleText = this.add
      .text(width * 0.5, 20, roleAsString(this.connection.state.playerShip?.role), {
        color: "#fca050",
        fontFamily: "futura",
        fontSize: "20px",
      })
      .setOrigin(0.5)
      .setStroke("black", 4);

    this.gameOverContainer = this.add.container(width * 0.5, height * 0.5);
    this.gameOverContainer.setVisible(false);

    const panelHeight = SafeArea.height * 0.8;
    this.gameOverContainer.add(
      this.add
        .nineslice(0, 0, width * 0.8, panelHeight, "panel", 16)
        .setOrigin(0.5)
        .setAlpha(0.9)
        .setTint(0x162144)
    );

    this.finalScoreText = this.add
      .text(0, 0, "0", {
        color: "#ff3086",
        fontFamily: "futura",
        fontSize: "100px",
      })
      .setOrigin(0.5)
      .setStroke("black", 4);

    this.gameOverContainer.add([
      this.add
        .text(0, -panelHeight * 0.4, "GAME OVER", { color: "white", fontFamily: "futura", fontSize: "40px" })
        .setOrigin(0.5)
        .setStroke("black", 4),
      this.add
        .text(0, -panelHeight * 0.2, "Your final score is:", {
          color: "#86ff30",
          fontFamily: "futura",
          fontSize: "25px",
        })
        .setOrigin(0.5)
        .setStroke("black", 4),
      this.finalScoreText,
      this.add
        .text(0, panelHeight * 0.15, "kills", {
          color: "white",
          fontFamily: "futura",
          fontSize: "20px",
        })
        .setOrigin(0.5)
        .setStroke("black", 4),
    ]);
    const replayButton = this.add
      .image(0, panelHeight * 0.3, "button")
      .setInteractive()
      .on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, () => {
        replayButton.alpha = 0.7;
      })
      .on(Phaser.Input.Events.GAMEOBJECT_POINTER_OUT, () => {
        replayButton.alpha = 1;
      })
      .on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => {
        this.connection.playAgain({});
        this.gameOverContainer.setVisible(false);
      });
    this.gameOverContainer.add([
      replayButton,
      this.add
        .text(replayButton.x, replayButton.y, "Play again", {
          color: "black",
          fontFamily: "futura",
          fontSize: "20px",
        })
        .setOrigin(0.5),
    ]);

    const roomCodeConfig: InputText.IConfig = {
      text: `Room Code: ${this.connection.stateId}`,
      color: "white",
      fontFamily: "futura",
      fontSize: "20px",
      readOnly: true,
    };

    const inputText = new InputText(this, width * 0.5, height - 40, 300, 50, roomCodeConfig).setOrigin(0.5);
    inputText.setStyle("cursor", "pointer");
    inputText.on("click", async () => {
      try {
        await navigator.clipboard.writeText(this.connection.stateId);
        const old = inputText.text;
        inputText.setText("Room Code: COPIED!");
        this.time.delayedCall(1000, () => {
          inputText.setText(old);
        });
      } catch (_err) {
        /** */
      }
    });
    this.add.existing(inputText);
  }

  update() {
    if (!this.connection) {
      return;
    }

    const { playerShip, score, ships } = this.connection.state;

    if (playerShip === undefined) {
      return;
    }

    this.roleText.text = roleAsString(playerShip.role);

    switch (this.state) {
      case State.GameOver: {
        if (playerShip.lives > 0) {
          this.state = State.Playing;
        }
        return;
      }

      case State.Playing: {
        // score
        this.scoreText.text = `${score} kill${score === 1 ? "" : "s"}`;

        if (playerShip.lives <= 0 && numFriendlyShips(ships) === 1 && !this.gameOverContainer.visible) {
          this.state = State.GameOver;
          this.finalScoreText.text = score.toLocaleString();
          this.gameOverContainer.setVisible(true);
          this.gameOverContainer.y += SafeArea.height;
          this.gameOverContainer.alpha = 0;
          this.tweens.add({
            targets: this.gameOverContainer,
            y: this.scale.height * 0.5,
            alpha: 1,
            ease: Phaser.Math.Easing.Sine.InOut,
            duration: 500,
          });
        } else {
          this.gameOverContainer.alpha = 0;
        }

        const health = playerShip.lives ?? 0;
        if (this.lastHealth === health) {
          return;
        }

        if (health < this.lastHealth) {
          eventsCenter.emit(Event.PlayerDamager);
        }

        for (let i = 0; i < this.hearts.length; ++i) {
          const heart = this.hearts[i];
          if (i < health) {
            heart.setTexture("heart-full");
          } else {
            heart.setTexture("heart-empty");
          }

          heart.setVisible(playerShip.role !== Role.Spectator);
        }

        this.lastHealth = health;
      }
    }
  }
}

function numFriendlyShips(ships: Entity[]) {
  return ships.filter((ship) => ship.type === EntityType.Friendly).length;
}
