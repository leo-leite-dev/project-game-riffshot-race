import { TitleScene } from './TitleScene.ts';
import { CHARACTERS, getSelectedCharacter } from '../data/characters.ts';
import { CharacterCard } from '../ui/CharacterCard.ts';
import { CharacterDetails } from '../ui/CharacterDetails.ts';
import { MenuButton } from '../ui/MenuButton.ts';
import { COLORS, SCENES, text } from '../ui/theme.ts';
import type Phaser from 'phaser';
import type { CharacterCard as CharacterCardType } from '../ui/CharacterCard.ts';
import type { CharacterDetails as CharacterDetailsType } from '../ui/CharacterDetails.ts';
import type { MenuButton as MenuButtonType } from '../ui/MenuButton.ts';

export class CharacterSelectionScene extends TitleScene {
  declare selectedIndex: number;
  declare focusIndex: number;
  declare kicker: Phaser.GameObjects.Text;
  declare title: Phaser.GameObjects.Text;
  declare roster: Phaser.GameObjects.Container;
  declare cards: CharacterCardType[];
  declare details: CharacterDetailsType;
  declare confirmButton: MenuButtonType;
  declare backButton: MenuButtonType;
  declare hint: Phaser.GameObjects.Text;
  constructor() { super(SCENES.characters); }

  create() {
    this.createShell('Seleção de Personagem. Escolha seu piloto e confirme com Enter.');
    const previous = getSelectedCharacter(this.registry);
    this.selectedIndex = Math.max(0, CHARACTERS.findIndex(character => character.id === previous?.id));
    this.kicker = text(this, 0, -300, '1 JOGADOR  /  01 — PILOTO  /  02 — VEÍCULO', 13, '#71f6ff');
    this.title = text(this, 0, -251, 'Seleção de Personagem', 36, COLORS.white, true);
    this.roster = this.add.container(0, 0);
    this.cards = CHARACTERS.map((character, index) => new CharacterCard(this, character, index, i => this.select(i)));
    this.roster.add(this.cards);
    this.details = new CharacterDetails(this);
    this.confirmButton = new MenuButton(this, {
      label: 'CONFIRMAR', index: '→', width: 274, labelSize: 20,
      onSelect: () => this.focusAction(CHARACTERS.length), onActivate: () => this.confirm(),
    });
    this.confirmButton.detail.setText('ENTER');
    this.backButton = new MenuButton(this, {
      label: 'VOLTAR', index: '←', width: 274, labelSize: 20,
      onSelect: () => this.focusAction(CHARACTERS.length + 1), onActivate: () => this.goTo(SCENES.menu),
    });
    this.backButton.detail.setText('ESC');
    this.hint = text(this, 0, 316, '← ↑ ↓ →  PILOTO     ENTER  CONFIRMAR     ESC  MENU', 12, COLORS.muted);
    this.content.add([this.kicker, this.title, this.roster, this.details, this.confirmButton, this.backButton, this.hint]);
    this.select(this.selectedIndex);
    this.resizeShell();

    this.input.keyboard?.addCapture(['UP', 'DOWN', 'LEFT', 'RIGHT', 'SPACE', 'TAB']);
    this.input.keyboard?.on('keydown', (event: KeyboardEvent) => {
      event.stopPropagation();
      if (this.transitioning || event.repeat) return;
      if (event.key === 'Escape') this.goTo(SCENES.menu);
      if (event.key === 'Tab') {
        event.preventDefault();
        const next = (this.focusIndex + (event.shiftKey ? -1 : 1) + CHARACTERS.length + 2) % (CHARACTERS.length + 2);
        if (next < CHARACTERS.length) this.select(next);
        else this.focusAction(next);
      }
      const offset = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -3, ArrowDown: 3 }[event.key];
      if (offset) this.select(this.selectedIndex + offset);
      if (event.key === 'Enter' || event.code === 'Space') {
        if (this.focusIndex === CHARACTERS.length + 1) this.goTo(SCENES.menu);
        else this.confirm();
      }
    });
     this.events.once('shutdown', () => this.input.keyboard?.removeCapture(['UP', 'DOWN', 'LEFT', 'RIGHT', 'SPACE', 'TAB']));
  }

  select(index: number): void {
    if (this.transitioning) return;
    this.selectedIndex = (index + CHARACTERS.length) % CHARACTERS.length;
    this.focusIndex = this.selectedIndex;
    this.cards.forEach((card, i) => card.setSelected(i === this.selectedIndex));
    const character = CHARACTERS[this.selectedIndex];
    this.details.setCharacter(character);
    this.updateActions();
    this.announce(`Seleção de Personagem. ${character.name}. ${character.profile}. ${character.description}`);
  }

  focusAction(index: number): void {
    if (this.transitioning) return;
    this.focusIndex = index;
    this.updateActions();
  }

  updateActions(): void {
    this.backButton.setSelected(this.focusIndex === CHARACTERS.length + 1);
    this.confirmButton.setSelected(this.focusIndex !== CHARACTERS.length + 1);
  }

  confirm(): void {
    if (this.transitioning) return;
    this.game.championship.select({ pilotId: CHARACTERS[this.selectedIndex].id });
    this.goTo(SCENES.vehicles);
  }

  layout(w: number, h: number): void {
    const narrow = w < 700 && w < h;
    const compact = !narrow && h < 600;
    this.fitContent(w, h, narrow ? 600 : 1140, narrow ? 1100 : compact ? 510 : 710);
    this.title.setPosition(0, narrow ? -478 : compact ? -205 : -251);
    this.kicker.setPosition(0, narrow ? -526 : -300).setVisible(!compact);
    this.roster.setPosition(narrow ? 0 : -300, narrow ? -250 : 0).setScale(compact ? 0.79 : 1);
    this.cards.forEach((card, i) => card.setPosition((i % 3 - 1) * 182, (Math.floor(i / 3) - 0.5) * 206));
    this.details.setPosition(narrow ? 0 : 284, narrow ? 165 : 0).setScale(compact ? 0.85 : 1);
    this.backButton.setPosition(-148, narrow ? 425 : compact ? 205 : 252);
    this.confirmButton.setPosition(148, narrow ? 425 : compact ? 205 : 252);
    this.hint.setPosition(0, narrow ? 496 : 316).setVisible(!compact);
    this.hint.setText(narrow ? 'TOQUE NO PILOTO E CONFIRME  /  ESC VOLTA' : '← ↑ ↓ →  PILOTO     ENTER  CONFIRMAR     ESC  MENU');
  }
}
