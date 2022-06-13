import Phaser from "phaser";

export function syncSprites<T>(
  clientSprites: Map<number, Phaser.GameObjects.Sprite>,
  serverSprites: Map<number, T>,
  onNew: (serverSprite: T) => Phaser.GameObjects.Sprite,
  onUpdate: (clientSprite: Phaser.GameObjects.Sprite, serverSprite: T) => void
) {
  clientSprites.forEach((sprite, id) => {
    const serverSprite = serverSprites.get(id);
    serverSprites.delete(id);
    if (serverSprite === undefined) {
      // sprite deleted on server
      sprite.destroy();
      clientSprites.delete(id);
    } else {
      // sprite updated on server
      onUpdate(sprite, serverSprite);
    }
  });
  serverSprites.forEach((serverSprite, id) => {
    // sprite created on server
    const clientSprite = onNew(serverSprite);
    onUpdate(clientSprite, serverSprite);
    clientSprites.set(id, clientSprite);
  });
}
