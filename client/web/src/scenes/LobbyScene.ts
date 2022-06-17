import InputText from "phaser3-rex-plugins/plugins/inputtext";

import { HathoraClient } from "../../../.hathora/client";

export class LobbyScene extends Phaser.Scene {
  constructor() {
    super("lobby");
  }

  create() {
    const client = new HathoraClient();

    const { width, height } = this.scale;
    const createButton = this.add
      .text(width / 2, height / 4, "Create New Game", {
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
        if (sessionStorage.getItem("token") === null) {
          const newToken = await client.loginAnonymous();
          sessionStorage.setItem("token", newToken);
        }
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const token = sessionStorage.getItem("token")!;
        const stateId = await client.create(token, {});
        const connection = await client.connect(token, stateId);
        await connection.joinGame({});
        this.scene.start("game", { connection });
      });

    const joinButton = this.add
      .text(width / 2, (height * 3) / 4, "Join Existing Game", {
        fontSize: "20px",
        fontFamily: "futura",
      })
      .setInteractive({ useHandCursor: true })
      .setOrigin(0.5)
      .setPadding(10)
      .setStyle({ backgroundColor: "#111" })
      .setInteractive({ useHandCursor: true })
      .on("pointerover", () => joinButton.setStyle({ fill: "#f39c12" }))
      .on("pointerout", () => joinButton.setStyle({ fill: "#FFF" }))
      .on("pointerdown", async () => {
        const stateId = inputText.text?.trim();
        if (stateId === undefined || stateId === "") {
          alert("Please enter an existing room code or create a new game!");
          return;
        }
        if (sessionStorage.getItem("token") === null) {
          const newToken = await client.loginAnonymous();
          sessionStorage.setItem("token", newToken);
        }
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const token = sessionStorage.getItem("token")!;
        const connection = await client.connect(token, stateId);
        await connection.joinGame({});
        this.scene.start("game", { connection });
      });

    const inputTextConfig: InputText.IConfig = {
      border: 10,
      borderColor: "black",
      backgroundColor: "white",
      placeholder: "Room Code",
      color: "black",
      fontFamily: "futura",
      fontSize: "16px",
    };
    const inputText = new InputText(this, joinButton.x, joinButton.y - 40, 100, 30, inputTextConfig);
    this.add.existing(inputText);
  }
}
