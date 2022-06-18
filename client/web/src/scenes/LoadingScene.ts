import { HathoraClient, StateId } from "../../../.hathora/client";

export class LoadingScene extends Phaser.Scene {
  private client!: HathoraClient;
  private token!: string;
  private stateId!: string;

  constructor() {
    super("loading");
  }

  init({ client, token, stateId }: { client: HathoraClient; token: string; stateId: StateId }) {
    this.client = client;
    this.token = token;
    this.stateId = stateId;
  }

  create() {
    const { width, height } = this.scale;
    this.add
      .text(width / 2, height / 2, "Loading...", {
        fontSize: "32px",
        fontFamily: "futura",
      })
      .setOrigin(0.5);

    this.client
      .connect(this.token, this.stateId)
      .then((connection) => connection.joinGame({}).then(() => this.scene.start("game", { connection })));
  }
}
