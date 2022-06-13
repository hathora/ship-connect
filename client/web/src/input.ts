import Phaser from "phaser";

import { Rotation } from "../../../api/types";

import type { HathoraConnection } from "../../.hathora/client";

export function createKeyboardInput(scene: Phaser.Scene, connection: HathoraConnection) {
  const keysDown: Set<string> = new Set();

  const handleKeyDown = (e: KeyboardEvent) => keysDown.add(e.key);
  const handleKeyUp = (e: KeyboardEvent) => keysDown.delete(e.key);

  scene.input.keyboard.on("keydown", handleKeyDown);
  scene.input.keyboard.on("keyup", handleKeyUp);

  const update = () => {
    if (keysDown.has("ArrowUp")) {
      connection?.updateAccelerating({ accelerating: true });
    } else {
      connection?.updateAccelerating({ accelerating: false });
    }
    if (keysDown.has("ArrowLeft")) {
      connection?.updateRotation({ rotation: Rotation.LEFT });
    } else if (keysDown.has("ArrowRight")) {
      connection?.updateRotation({ rotation: Rotation.RIGHT });
    } else {
      connection?.updateRotation({ rotation: Rotation.NONE });
    }
  };

  const dispose = () => {
    scene.input.keyboard.off("keydown", handleKeyDown);
    scene.input.keyboard.off("keyup", handleKeyUp);
  };

  return {
    update,
    dispose,
  };
}
