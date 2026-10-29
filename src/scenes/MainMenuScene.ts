import { TitleScene } from './TitleScene.ts';
import { createLogo } from '../visuals/logo.ts';
import { MenuButton } from '../ui/MenuButton.ts';
import { COLORS, SCENES, text } from '../ui/theme.ts';
import type Phaser from 'phaser';

const MODES = [
  { label: '1 JOGADOR', locked: false },
  { label: 'CO-OP', locked: true },
  { label: 'ONLINE', locked: true },
];

export class MainMenuScene extends TitleScene {
  declare selectedIndex: number;
  declare logo: Phaser.GameObjects.Image;
  declare kicker: Phaser.GameObjects.Text;
  declare buttons: MenuButton[];
  declare hint: Phaser.GameObjects.Text;
  constructor() { super(SCENES.menu); }

  create() {
    this.createShell('RIFFSHOT RACING. Menu principal. 1 JOGADOR inicia ou continua o campeonato. CO-OP e ONLINE seguem bloqueados.');
    this.selectedIndex = 0;
    this.logo = createLogo(this, 0, -206, 600);
    this.kicker = text(this, 0, -62, 'ESCOLHA SEU MODO', 13, COLORS.muted);
    this.buttons = MODES.map((mode, index) => new MenuButton(this, {
      ...mode,
      index: String(index + 1).padStart(2, '0'),
      onSelect: () => this.select(index),
      onActivate: () => this.activate(index),
    }));
    this.buttons[0].detail.setText(this.game.championship.hasSelections ? 'CONTINUAR' : 'INICIAR');
    this.hint = text(this, 0, 272, '↑ ↓  NAVEGAR      ENTER  CONFIRMAR', 12, COLORS.muted);
    this.content.add([this.logo, this.kicker, ...this.buttons, this.hint]);
    this.select(0);
    this.resizeShell();
    this.input.keyboard?.addCapture(['UP', 'DOWN', 'SPACE', 'TAB']);
    this.input.keyboard?.on('keydown', (event: KeyboardEvent) => {
      // Mark this queued Phaser event consumed, including fast inputs in the
      // same frame, so it cannot be replayed or reach the following scene.
      event.stopPropagation();
      if (this.transitioning || event.repeat) return;
      if (['ArrowUp', 'ArrowDown', 'Tab'].includes(event.key)) {
        event.preventDefault();
        this.select(this.selectedIndex + (event.key === 'ArrowUp' || (event.key === 'Tab' && event.shiftKey) ? -1 : 1));
      }
      if (event.key === 'Enter' || event.code === 'Space') this.activate(this.selectedIndex);
    });
    this.events.once('shutdown', () => this.input.keyboard?.removeCapture(['UP', 'DOWN', 'SPACE', 'TAB']));
  }

  select(index: number): void {
    if (this.transitioning) return;
    this.selectedIndex = (index + MODES.length) % MODES.length;
    this.buttons.forEach((button, i) => button.setSelected(i === this.selectedIndex));
  }

  activate(index: number): void {
    if (MODES[index].locked) this.showSoon();
    else if (this.game.championship.state.pendingResult) this.goTo(SCENES.results);
    else this.goTo(this.game.championship.hasSelections ? SCENES.preparation : SCENES.difficulty);
  }

  layout(w: number, h: number): void {
    const compact = h < 580 && w > h * 1.5;
    this.fitContent(w, h, compact ? 1040 : 600, compact ? 370 : 650);
    this.logo.setPosition(compact ? -265 : 0, compact ? -30 : -206);
    this.logo.setDisplaySize(compact ? 480 : 600, (compact ? 480 : 600) * 0.375);
    this.kicker.setPosition(compact ? 260 : 0, compact ? -146 : -62);
    this.buttons.forEach((button, index) => button.setPosition(compact ? 260 : 0, (compact ? -80 : 20) + index * 88));
    this.hint.setPosition(0, compact ? 156 : 272);
    this.hint.setText(w < 600 && !compact ? 'TOQUE PARA ESCOLHER  /  ENTER CONFIRMA' : '↑ ↓  NAVEGAR      ENTER  CONFIRMAR');
  }
}
