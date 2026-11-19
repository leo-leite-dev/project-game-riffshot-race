import Phaser from 'phaser';

const SPRITE_WIDTH = 1322;
const SPRITE_HEIGHT = 184;

export class MenuButtonArtwork extends Phaser.GameObjects.Container {
  readonly sprite: Phaser.GameObjects.Image;

  constructor(
    scene: Phaser.Scene,
    texture: string,
    designWidth: number,
    sourceWidth = SPRITE_WIDTH,
    sourceHeight = SPRITE_HEIGHT,
  ) {
    super(scene, 0, 0);
    this.sprite = scene.add.image(0, 0, texture)
      .setDisplaySize(designWidth, designWidth * sourceHeight / sourceWidth);
    this.add(this.sprite);
  }

  setTexture(texture: string): this {
    this.sprite.setTexture(texture);
    return this;
  }

  setArtworkVisible(visible: boolean): this {
    this.sprite.setVisible(visible);
    return this;
  }
}
