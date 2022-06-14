import { HathoraClient } from "../../../.hathora/client";
import { GAME_HEIGHT, GAME_WIDTH } from "../consts";

export class LobbyScene extends Phaser.Scene {
  constructor() {
    super("lobby");
  }

  create() {
    const createButton = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 4, "Create New Game", {
        fontSize: "20px",
        fontFamily: "futura",
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
      .setPadding(10)
      .setStyle({ backgroundColor: "#111" })
      .setInteractive({ useHandCursor: true })
      .on("pointerover", () => createButton.setStyle({ fill: "#f39c12" }))
      .on("pointerout", () => createButton.setStyle({ fill: "#FFF" }))
      .on("pointerdown", async () => {
        const client = new HathoraClient();
        if (sessionStorage.getItem("token") === null) {
          const newToken = await client.loginAnonymous();
          sessionStorage.setItem("token", newToken);
        }
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const token = sessionStorage.getItem("token")!;
        const stateId = await client.create(token, {});
        const connection = await client.connect(token, stateId);
        this.scene.start("game", { connection });
      });
  }
}
