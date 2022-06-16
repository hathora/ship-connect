import Phaser from "phaser";

export const eventsCenter = new Phaser.Events.EventEmitter();

export enum Event {
  Resized = "resized",
  PlayerDamager = "player-damaged",
}
