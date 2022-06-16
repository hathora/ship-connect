import Phaser from "phaser";
import { Plugin as NineSlicePlugin } from "phaser3-nineslice";

import { GAME_HEIGHT, GAME_WIDTH } from "./consts";
import { DebugScene } from "./scenes/DebugScene";
import { GameScene } from "./scenes/GameScene";
import { HUDScene } from "./scenes/HUDScene";
import { LobbyScene } from "./scenes/LobbyScene";
import { ResizeScene } from "./scenes/ResizeScene";

new Phaser.Game({
  type: Phaser.AUTO,
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  scene: [LobbyScene, GameScene, HUDScene, ResizeScene, DebugScene],
  parent: "root",
  dom: { createContainer: true },
  scale: { mode: Phaser.Scale.ScaleModes.NONE },
  plugins: {
    global: [NineSlicePlugin.DefaultCfg],
  },
});
