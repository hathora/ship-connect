import Phaser from "phaser";

export function syncSprites<T, SpriteType extends Phaser.GameObjects.GameObject>(
  clientSprites: Map<number, SpriteType>,
  serverSprites: Map<number, T>,
  onNew: (serverSprite: T) => SpriteType,
  onUpdate: (clientSprite: SpriteType, serverSprite: T) => void,
  onDelete?: (clientSprite: SpriteType) => void
) {
  clientSprites.forEach((clientSprite, id) => {
    const serverSprite = serverSprites.get(id);
    serverSprites.delete(id);
    if (serverSprite === undefined) {
      // sprite deleted on server
      onDelete?.(clientSprite);
      clientSprite.destroy();
      clientSprites.delete(id);
    } else {
      // sprite updated on server
      onUpdate(clientSprite, serverSprite);
    }
  });
  serverSprites.forEach((serverSprite, id) => {
    // sprite created on server
    const clientSprite = onNew(serverSprite);
    onUpdate(clientSprite, serverSprite);
    clientSprites.set(id, clientSprite);
  });
}
