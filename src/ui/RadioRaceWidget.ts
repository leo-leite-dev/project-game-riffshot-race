import Phaser from 'phaser';
import type { RiffshotRadio } from '../audio/RiffshotRadio.ts';
import type { MenuMusic } from '../audio/MenuMusic.ts';
import { COLORS } from './theme.ts';
import { drawHudPlate } from './RaceHudArt.ts';

/** Small scene-local controls for the app-lifetime radio player. */
export class RadioRaceWidget {
  readonly container: Phaser.GameObjects.Container;
  private readonly scene: Phaser.Scene;
  private readonly radio: RiffshotRadio;
  private readonly music: MenuMusic;
  private readonly frame: Phaser.GameObjects.Graphics;
  private readonly brand: Phaser.GameObjects.Text;
  private readonly station: Phaser.GameObjects.Text;
  private readonly status: Phaser.GameObjects.Text;
  private readonly previous: Phaser.GameObjects.Text;
  private readonly play: Phaser.GameObjects.Text;
  private readonly next: Phaser.GameObjects.Text;
  private readonly collapse: Phaser.GameObjects.Text;
  private readonly onRadioState: () => void;
  private readonly onMusicSource: () => void;
  private collapsed = false;
  private destroyed = false;
  private compact = false;
  private portrait = false;
  private width = 380;
  private height = 46;
  private viewWidth = 0;
  private viewHeight = 0;

  constructor(scene: Phaser.Scene, radio: RiffshotRadio, music: MenuMusic) {
    this.scene = scene;
    this.radio = radio;
    this.music = music;
    this.container = scene.add.container(0, 0).setVisible(false);
    this.frame = scene.add.graphics();
    this.brand = scene.add.text(0, 0, 'RIFFSHOT RADIO', { color: '#ff6b5d', fontFamily: 'Arial', fontSize: '9px',
      fontStyle: 'bold', letterSpacing: 1.2 });
    this.station = scene.add.text(0, 0, '', { color: COLORS.white, fontFamily: 'Arial', fontSize: '11px',
      fontStyle: 'bold' });
    this.status = scene.add.text(0, 0, '', { color: '#a9bfcc', fontFamily: 'Arial', fontSize: '8px' });
    this.previous = this.makeButton('◀', 'Estação anterior', () => radio.playAdjacent(-1));
    this.play = this.makeButton('▶', 'Reproduzir ou pausar rádio', () => radio.togglePlayback());
    this.next = this.makeButton('▶', 'Próxima estação', () => radio.playAdjacent(1));
    this.collapse = this.makeButton('−', 'Minimizar controles da rádio', () => {
      this.collapsed = !this.collapsed;
      this.layout(this.viewWidth, this.viewHeight);
    });
    const children = [this.frame, this.brand, this.station, this.status,
      this.previous, this.play, this.next, this.collapse];
    // Factory-created objects start on the Scene display list. Remove them
    // explicitly before parenting, so none of the radio text is also painted
    // at the canvas origin while the container renders it in the HUD.
    for (const child of children) scene.children.remove(child);
    this.container.add(children);
    this.onRadioState = () => this.refresh();
    this.onMusicSource = () => this.refresh();
    scene.game.events.on('riffshot-radio-state', this.onRadioState);
    scene.game.events.on('music-source', this.onMusicSource);
    scene.events.once('shutdown', () => this.destroy());
    this.refresh();
  }

  private makeButton(label: string, accessibleName: string, action: () => void) {
    return this.scene.add.text(0, 0, label, { color: '#edf7ff', fontFamily: 'Arial', fontSize: '15px',
      fontStyle: 'bold', align: 'center', backgroundColor: '#0b1722' })
      .setOrigin(0.5).setPadding(5, 2).setInteractive({ useHandCursor: true })
      .setData('aria-label', accessibleName).on('pointerdown', action);
  }

  layout(viewWidth: number, viewHeight: number): void {
    this.viewWidth = viewWidth;
    this.viewHeight = viewHeight;
    this.compact = viewWidth < 1000 || viewHeight < 600;
    this.portrait = viewWidth < 700 && viewWidth < viewHeight;
    this.width = this.portrait ? 264 : this.compact ? 280 : 380;
    this.height = this.collapsed ? 30 : this.compact ? 40 : 46;
    const centerX = viewWidth / 2;
    const centerY = this.portrait ? 214 : this.compact ? 162 : 180;
    this.container.setPosition(centerX, centerY).setVisible(this.music.musicMode === 'radio');
    this.frame.clear();
    drawHudPlate(this.frame, -this.width / 2, -this.height / 2, this.width, this.height, 0xff5145);
    const buttonY = this.collapsed ? 0 : this.height * 0.1;
    const actionRight = this.width / 2 - 22;
    this.collapse.setPosition(actionRight, buttonY).setFontSize(this.compact ? 12 : 14)
      .setText(this.collapsed ? '+' : '−').setData('aria-label', this.collapsed ? 'Expandir rádio' : 'Minimizar rádio');
    this.play.setPosition(actionRight - 30, buttonY).setFontSize(this.compact ? 11 : 14);
    this.next.setPosition(actionRight - 58, buttonY).setFontSize(this.compact ? 10 : 13);
    this.previous.setPosition(actionRight - 84, buttonY).setFontSize(this.compact ? 10 : 13);
    if (this.collapsed) {
      this.brand.setVisible(false);
      this.station.setPosition(-this.width / 2 + 12, 0).setFontSize(this.compact ? 8 : 10);
      this.status.setVisible(false);
    } else {
      this.brand.setVisible(true).setPosition(-this.width / 2 + 12, -this.height / 2 + 7)
        .setFontSize(this.compact ? 7 : 9);
      this.station.setPosition(-this.width / 2 + 12, -this.height / 2 + 25)
        .setFontSize(this.compact ? 8 : 11);
      this.status.setVisible(true).setPosition(-this.width * 0.05, -this.height / 2 + 10)
        .setFontSize(this.compact ? 7 : 8).setWordWrapWidth(this.width * 0.23);
    }
    this.refresh();
  }

  private refresh(): void {
    if (!this.container || !this.radio) return;
    const state = this.radio.state;
    const active = this.music.musicMode === 'radio';
    this.container.setVisible(active);
    this.brand.setText('RIFFSHOT RADIO');
    const stationName = state.station?.name ?? (state.resumeAfterGesture ? 'TOQUE PARA RETOMAR' : 'ESCOLHA UMA ESTAÇÃO NAS CONFIGURAÇÕES');
    const maxNameLength = this.collapsed ? 22 : 32;
    this.station.setText(stationName.length > maxNameLength ? `${stationName.slice(0, maxNameLength - 1)}…` : stationName)
      .setWordWrapWidth(this.collapsed ? this.width - 164 : this.width * 0.43);
    const statusLabel = state.status === 'playing' ? 'AO VIVO'
      : state.status === 'connecting' ? 'CONECTANDO…'
        : state.status === 'unavailable' ? 'INDISPONÍVEL'
          : state.resumeAfterGesture ? 'PAUSADA · INTERAÇÃO NECESSÁRIA' : 'PRONTA';
    this.status.setText(statusLabel).setColor(state.status === 'playing' ? '#79efb1'
      : state.status === 'unavailable' ? '#ff9c91' : '#a9bfcc');
    this.play.setText(state.status === 'playing' || state.status === 'connecting' ? 'Ⅱ' : '▶');
    this.play.setAlpha(state.station ? 1 : 0.5);
    this.previous.setAlpha(state.previousAvailable ? 1 : 0.45);
    this.next.setAlpha(state.nextAvailable ? 1 : 0.45);
    const currentName = state.station?.name ?? 'rádio';
    this.play.setData('aria-label', state.status === 'playing' ? 'Pausar rádio' : `Reproduzir ${currentName}`);
    this.previous.setData('aria-label', `Estação anterior — ${currentName}`);
    this.next.setData('aria-label', `Próxima estação — ${currentName}`);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.scene.game.events.off('riffshot-radio-state', this.onRadioState);
    this.scene.game.events.off('music-source', this.onMusicSource);
    this.container.destroy(true);
  }
}
