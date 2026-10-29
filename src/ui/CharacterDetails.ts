import Phaser from 'phaser';
import { ATTRIBUTES, ATTRIBUTE_SCALE } from '../data/characters.ts';
import { characterPortrait } from '../visuals/characterPortrait.ts';
import { COLORS, text } from './theme.ts';
import type { RacingCharacter } from './CharacterCard.ts';

type StatAttribute = { key: keyof RacingCharacter['stats']; label: string };

const attributes = ATTRIBUTES as readonly StatAttribute[];

export class CharacterDetails extends Phaser.GameObjects.Container {
  character!: RacingCharacter;
  frame: Phaser.GameObjects.Graphics;
  portrait: Phaser.GameObjects.Image;
  // Phaser reserves GameObject.name as a string; this game keeps the Text there.
  name: string & Phaser.GameObjects.Text;
  profile: Phaser.GameObjects.Text;
  description: Phaser.GameObjects.Text;
  statBars: Phaser.GameObjects.Graphics;
  statValues: Phaser.GameObjects.Text[];

  constructor(scene: Phaser.Scene) {
    super(scene, 0, 0);
    scene.add.existing(this);
    this.frame = scene.add.graphics();
    this.portrait = scene.add.image(-178, -99, '__WHITE').setDisplaySize(154, 154);
    this.name = text(scene, -77, -156, '', 25, COLORS.white, true).setOrigin(0, 0.5) as string & Phaser.GameObjects.Text;
    this.profile = text(scene, -77, -119, '', 13, '#71f6ff').setOrigin(0, 0.5);
    this.description = text(scene, -77, -92, '', 17, '#afbdd0').setOrigin(0, 0);
    this.description.setStyle({ align: 'left', wordWrap: { width: 325 }, lineSpacing: 4 });
    this.statBars = scene.add.graphics();
    this.statValues = attributes.map((attribute, i) => {
      const label = text(scene, -250, 24 + i * 33, attribute.label, 16, COLORS.muted).setOrigin(0, 0.5);
      const value = text(scene, 252, 24 + i * 33, '', 18, COLORS.white).setOrigin(1, 0.5);
      this.add([label, value]);
      return value;
    });
    this.addAt([this.frame, this.portrait, this.name, this.profile, this.description, this.statBars], 0);
    this.setSize(548, 380);
  }

  setCharacter(character: RacingCharacter) {
    this.character = character;
    const accent = Number.parseInt(character.portrait.accent.slice(1), 16);
    this.frame.clear().fillStyle(0x0a1422, 0.96).fillRect(-274, -190, 548, 380);
    this.frame.lineStyle(1, 0x314154).strokeRect(-274, -190, 548, 380);
    this.frame.lineStyle(2, accent, 1).lineBetween(-274, -190, -208, -190);
    this.frame.lineStyle(1, accent, 0.2).lineBetween(-250, -4, 250, -4);
    this.portrait.setTexture(characterPortrait(this.scene, character)).setDisplaySize(154, 154);
    this.name.setText(character.name);
    this.profile.setText(character.profile).setColor(character.portrait.accent);
    this.description.setText(character.description);
    this.statBars.clear();
    attributes.forEach(({ key }, i) => {
      const value = character.stats[key];
      this.statValues[i].setText(String(value).padStart(2, '0'));
      for (let segment = 0; segment < ATTRIBUTE_SCALE; segment += 1) {
        this.statBars.fillStyle(segment < value ? accent : 0x263449, segment < value ? 0.9 : 0.65);
        this.statBars.fillRect(-89 + segment * 29, 18 + i * 33, 23, 11);
      }
    });
  }
}
