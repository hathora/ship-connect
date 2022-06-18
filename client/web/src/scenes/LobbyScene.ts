import InputText from "phaser3-rex-plugins/plugins/inputtext";

import { HathoraClient } from "../../../.hathora/client";

export class LobbyScene extends Phaser.Scene {
  constructor() {
    super("lobby");
  }

  create() {
    const client = new HathoraClient();

    const url = window.location === window.parent.location ? document.location.href : document.referrer;
    if (url.includes("?")) {
      const queryString = url.split("?")[1];
      const queryParams = new URLSearchParams(queryString);
      const stateId = queryParams.get("roomId");
      if (stateId !== null) {
        getToken(client).then((token) => this.scene.start("loading", { client, token, stateId }));
        return;
      }
    }

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
        const token = await getToken(client);
        const stateId = await client.create(token, {});
        this.scene.start("loading", { client, token, stateId });
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
        const token = await getToken(client);
        const stateId = inputText.text?.trim();
        if (stateId === undefined || stateId === "") {
          alert("Please enter an existing room code or create a new game!");
          return;
        }
        this.scene.start("loading", { client, token, stateId });
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

async function getToken(client: HathoraClient) {
  if (sessionStorage.getItem("token") === null) {
    const newToken = await client.loginAnonymous();
    sessionStorage.setItem("token", newToken);
  }
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  return sessionStorage.getItem("token")!;
}
