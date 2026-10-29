import { TitleScene } from './TitleScene.ts';
import { DIFFICULTIES } from '../data/raceDifficulty.ts';
import { MenuButton } from '../ui/MenuButton.ts';
import { COLORS, SCENES, text } from '../ui/theme.ts';
import type Phaser from 'phaser';

const OPTIONS = [
  { id: 'normal', details: 'Bots equilibrados, curvas acessíveis e pequenos erros de condução.' },
  { id: 'hard', details: 'Bots mais precisos, frenagem tardia e ultrapassagens calculadas — sem velocidade impossível.' },
];

export class DifficultySelectionScene extends TitleScene {
  declare selectedIndex: number;
  declare focusIndex: number;
  declare kicker: Phaser.GameObjects.Text;
  declare title: Phaser.GameObjects.Text;
  declare subtitle: Phaser.GameObjects.Text;
  declare cards: MenuButton[];
  declare backButton: MenuButton;
  declare hint: Phaser.GameObjects.Text;
  constructor() { super(SCENES.difficulty); }

  create() {
    this.createShell('RIFFSHOT RACING. Selecione a dificuldade do campeonato antes de escolher o piloto.');
    this.selectedIndex = OPTIONS.findIndex(option => option.id === this.registry.get('selectedDifficultyId'));
    if (this.selectedIndex < 0) this.selectedIndex = 0;
    this.kicker = text(this, 0, 0, '01 / CAMPEONATO  —  CALIBRAÇÃO RIVAL', 12, '#71f6ff');
    this.title = text(this, 0, 0, 'ESCOLHA A DIFICULDADE', 30, COLORS.white, true);
    this.subtitle = text(this, 0, 0, '', 13, COLORS.muted);
    this.cards = OPTIONS.map((option, index) => new MenuButton(this, {
      label: option.id === 'normal' ? 'NORMAL' : 'DIFÍCIL', index: `0${index + 1}`, width: 510,
      labelSize: 23, onSelect: () => this.select(index), onActivate: () => this.confirm(index),
    }));
    this.backButton = new MenuButton(this, {
      label: 'VOLTAR', index: '←', width: 510,
      onSelect: () => this.focusAction(2), onActivate: () => this.goTo(SCENES.menu),
    });
    this.backButton.detail.setText('ESC');
    this.hint = text(this, 0, 0, '↑ ↓  ESCOLHER     ENTER  CONFIRMAR     ESC  VOLTAR', 12, COLORS.muted);
    this.content.add([this.kicker, this.title, this.subtitle, ...this.cards, this.backButton, this.hint]);
    this.select(this.selectedIndex);
    this.resizeShell();
    this.input.keyboard?.addCapture(['UP', 'DOWN', 'SPACE', 'TAB']);
    this.input.keyboard?.on('keydown', (event: KeyboardEvent) => {
      event.stopPropagation();
      if (this.transitioning || event.repeat) return;
      const key = event.key.toLowerCase();
      if (key === 'escape') this.goTo(SCENES.menu);
      if (key === 'arrowup' || key === 'arrowdown') this.select(this.selectedIndex + (key === 'arrowup' ? -1 : 1));
      if (key === 'tab') {
        event.preventDefault();
        this.focusAction((this.focusIndex + (event.shiftKey ? -1 : 1) + 3) % 3);
      }
      if (key === 'enter' || event.code === 'Space') {
        if (this.focusIndex === 2) this.goTo(SCENES.menu); else this.confirm(this.selectedIndex);
      }
    });
    this.events.once('shutdown', () => this.input.keyboard?.removeCapture(['UP', 'DOWN', 'SPACE', 'TAB']));
  }

  select(index: number): void {
    if (this.transitioning) return;
    this.selectedIndex = (index + OPTIONS.length) % OPTIONS.length;
    this.focusIndex = this.selectedIndex;
    this.cards.forEach((card, i) => card.setSelected(i === this.selectedIndex));
    this.subtitle.setText(OPTIONS[this.selectedIndex].details);
    this.updateBack();
    const difficulty = DIFFICULTIES[OPTIONS[this.selectedIndex].id as keyof typeof DIFFICULTIES];
    this.announce(`Dificuldade ${difficulty.label}. ${OPTIONS[this.selectedIndex].details}`);
  }

  focusAction(index: number): void {
    if (this.transitioning) return;
    this.focusIndex = index;
    this.cards.forEach((card, i) => card.setSelected(i === index));
    this.updateBack();
  }

  updateBack(): void { this.backButton.setSelected(this.focusIndex === 2); }

  confirm(index: number): void {
    if (this.transitioning) return;
    this.game.championship.select({ difficultyId: OPTIONS[index].id });
    this.goTo(SCENES.characters);
  }

  layout(w: number, h: number): void {
    const narrow = w < 620 && w < h;
    const compact = !narrow && h < 600;
    this.fitContent(w, h, narrow ? 560 : compact ? 840 : 700, narrow ? 620 : compact ? 310 : 660);
    this.kicker.setPosition(0, narrow ? -230 : compact ? -139 : -230).setVisible(!compact);
    this.title.setPosition(0, narrow ? -185 : compact ? -112 : -177).setFontSize(narrow ? 25 : compact ? 22 : 30);
    this.subtitle.setPosition(0, narrow ? -130 : compact ? -68 : -126)
      .setWordWrapWidth(narrow ? 500 : compact ? 390 : 680).setFontSize(compact ? 11 : 13);
    this.cards.forEach((card, index) => {
      card.setPosition(compact ? (index ? 205 : -205) : 0,
        compact ? 5 : (narrow ? -24 : -16) + index * (narrow ? 108 : 112));
      card.setScale(compact ? 0.62 : 1);
    });
    this.backButton.setPosition(0, narrow ? 220 : compact ? 105 : 222).setScale(compact ? 0.72 : 1);
    this.hint.setPosition(0, narrow ? 285 : compact ? 147 : 290).setFontSize(narrow ? 10 : compact ? 9 : 12);
  }
}
