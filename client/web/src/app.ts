import Phaser from "phaser";

import { GAME_HEIGHT, GAME_WIDTH } from "./consts";
import { DebugScene } from "./scenes/DebugScene";
import { GameScene } from "./scenes/GameScene";
import { ResizeScene } from "./scenes/ResizeScene";

new Phaser.Game({
  type: Phaser.AUTO,
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  scene: [GameScene, ResizeScene, DebugScene],
  parent: "root",
  dom: { createContainer: true },
  scale: { mode: Phaser.Scale.ScaleModes.NONE },
});
