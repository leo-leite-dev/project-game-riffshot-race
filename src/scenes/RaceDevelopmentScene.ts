import { TitleScene } from './TitleScene.ts';
import { getSelectedCharacter } from '../data/characters.ts';
import { getSelectedVehicle, getVehicleDisplayName } from '../data/vehicles.ts';
import { characterPortrait } from '../visuals/characterPortrait.ts';
import { COLORS, SCENES, text } from '../ui/theme.ts';
import { PreparationButton, preparationFrame, bindPreparationKeys } from '../ui/PreparationModules.ts';
import Phaser from 'phaser';
import type { Vehicle, PAINTS } from '../data/vehicles.ts';

type Selection = { vehicle: Readonly<Vehicle>; paint: (typeof PAINTS)[number] };

export class RaceDevelopmentScene extends TitleScene {
  declare character: NonNullable<ReturnType<typeof getSelectedCharacter>> | null;
  declare selection: Selection | null;
  declare frame: Phaser.GameObjects.Graphics;
  declare kicker: Phaser.GameObjects.Text;
  declare title: Phaser.GameObjects.Text;
  declare message: Phaser.GameObjects.Text;
  declare pilotPortrait: Phaser.GameObjects.Image | Phaser.GameObjects.Graphics;
  declare pilotName: Phaser.GameObjects.Text;
  declare vehicleName: Phaser.GameObjects.Text;
  declare backButton: PreparationButton;
  constructor() { super(SCENES.development); }

  create() {
    this.character = getSelectedCharacter(this.registry);
    this.selection = getSelectedVehicle(this.registry);
    this.createShell('Corrida em desenvolvimento. Sua seleção foi preservada. Enter ou Escape volta à preparação.');
    this.frame = this.add.graphics();
    this.kicker = text(this, 0, 0, 'PRÓXIMA ETAPA / EM BREVE', 14, '#71f6ff');
    this.title = text(this, 0, 0, 'Corrida em desenvolvimento', 31, COLORS.white, true);
    this.message = text(this, 0, 0, 'O próximo desafio está em construção.\nSua seleção continua pronta na garagem.', 17, '#afbdd0');
    this.pilotPortrait = this.character
      ? this.add.image(0, 0, characterPortrait(this, this.character)).setDisplaySize(96, 96)
      : this.add.graphics();
    this.pilotName = text(this, 0, 0, this.character?.name ?? 'PILOTO NÃO SELECIONADO', 20, COLORS.white, true);
    const vehicle = this.selection
      ? `${getVehicleDisplayName(this.selection.vehicle)} / ${this.selection.paint.name}`
      : 'VEÍCULO NÃO SELECIONADO';
    this.vehicleName = text(this, 0, 0, vehicle, 16, this.selection?.paint.color ?? COLORS.muted);
    this.backButton = new PreparationButton(this, {
      label: 'VOLTAR', detail: 'PREPARAÇÃO', icon: 'back', onSelect: () => this.backButton.setSelected(true),
      onActivate: () => this.goTo(SCENES.preparation),
    }).setSelected(true);
    this.content.add([this.frame, this.kicker, this.title, this.message, this.pilotPortrait, this.pilotName, this.vehicleName, this.backButton]);
    this.resizeShell();
    bindPreparationKeys(this, event => {
      if (['Escape', 'Enter', ' '].includes(event.key)) this.backButton.onActivate();
      else this.backButton.setSelected(true);
    });
  }

  layout(w: number, h: number): void {
    const narrow = w < 700 && w < h;
    const compact = !narrow && h < 600;
    const width = narrow ? 360 : 850;
    const height = narrow ? 480 : compact ? 310 : 460;
    this.content.setPosition(w / 2, (h + 6) / 2).setScale(Math.min((w - 24) / width, (h - 114) / height, 1.15));
    preparationFrame(this.frame, width, height);
    this.kicker.setPosition(0, -height / 2 + 26).setFontSize(narrow ? 12 : 14);
    this.title.setPosition(0, -height / 2 + (narrow ? 88 : 66)).setFontSize(narrow ? 29 : 31);
    this.title.setWordWrapWidth(width - 32);
    this.message.setPosition(0, narrow ? -49 : compact ? -32 : -53).setFontSize(narrow ? 15 : 17);
    this.message.setWordWrapWidth(width - 28);
    this.pilotPortrait.setPosition(narrow ? 0 : -195, narrow ? 43 : compact ? 42 : 54);
    if (this.character && this.pilotPortrait instanceof Phaser.GameObjects.Image) {
      this.pilotPortrait.setDisplaySize(narrow ? 84 : compact ? 68 : 96, narrow ? 84 : compact ? 68 : 96);
    }
    this.pilotName.setPosition(narrow ? 0 : 30, narrow ? 107 : compact ? 28 : 40).setFontSize(narrow ? 19 : 20);
    this.vehicleName.setPosition(narrow ? 0 : 30, narrow ? 137 : compact ? 58 : 73).setFontSize(narrow ? 14 : 16);
    this.backButton.arrange(0, height / 2 - 40, narrow ? 300 : 400, compact ? 46 : 58);
  }
}
