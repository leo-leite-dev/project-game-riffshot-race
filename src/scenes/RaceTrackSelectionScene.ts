import { TitleScene } from './TitleScene.ts';
import { getSelectedCharacter } from '../data/characters.ts';
import { getSelectedVehicle } from '../data/vehicles.ts';
import { RACE_TRACKS } from '../data/raceTracks.ts';
import { DIFFICULTIES } from '../data/raceDifficulty.ts';
import { MenuButton } from '../ui/MenuButton.ts';
import { COLORS, SCENES, text } from '../ui/theme.ts';
import type Phaser from 'phaser';

type Track = typeof RACE_TRACKS[number];

export class RaceTrackSelectionScene extends TitleScene {
  declare specialChoice: boolean;
  declare assignedTrack: Track;
  declare selectedIndex: number;
  declare focusIndex: number;
  declare kicker: Phaser.GameObjects.Text;
  declare title: Phaser.GameObjects.Text;
  declare trackName: Phaser.GameObjects.Text;
  declare trackDetails: Phaser.GameObjects.Text;
  declare trackFrame: Phaser.GameObjects.Graphics;
  declare difficultyLabel: Phaser.GameObjects.Text;
  declare pilotLabel: Phaser.GameObjects.Text;
  declare paintLabel: Phaser.GameObjects.Text;
  declare trackCards: MenuButton[];
  declare startButton: MenuButton;
  declare backButton: MenuButton;
  declare hint: Phaser.GameObjects.Text;
  constructor() { super(SCENES.tracks); }

  create() {
    const difficultyId = this.registry.get('selectedDifficultyId');
    if (!DIFFICULTIES[difficultyId as keyof typeof DIFFICULTIES]) {
      this.scene.start(SCENES.difficulty);
      return;
    }
    const championship = this.game.championship;
    if (championship.state.pendingResult) { this.scene.start(SCENES.results); return; }
    if (!championship.canRace) { this.scene.start(SCENES.preparation); return; }
    this.createShell('RIFFSHOT RACING. Confira a pista atribuída e confirme para largar.');
    this.specialChoice = championship.specialTrackChoice;
    this.assignedTrack = championship.assignedTrack()!;
    this.selectedIndex = RACE_TRACKS.findIndex(track => track.id === this.assignedTrack.id);
    this.focusIndex = this.specialChoice ? this.selectedIndex : 0;
    this.kicker = text(this, 0, 0, 'PIT CONTROL  /  CIRCUITO AUTOMÁTICO', 12, '#71f6ff');
    this.title = text(this, 0, 0, 'PISTA ATRIBUÍDA', 31, COLORS.white, true);
    if (this.specialChoice) {
      this.title.setText('ESCOLHA EXCEPCIONAL');
      this.kicker.setText('PRIMEIRA CORRIDA / NOVA TENTATIVA');
    }
    this.trackName = text(this, 0, 0, '', 25, '#ffb454', true);
    this.trackDetails = text(this, 0, 0, '', 13, COLORS.muted);
    this.trackFrame = this.add.graphics();
    this.difficultyLabel = text(this, 0, 0, '', 12, '#71f6ff');
    const character = getSelectedCharacter(this.registry);
    const selection = getSelectedVehicle(this.registry);
    this.pilotLabel = text(this, 0, 0, `PILOTO  /  ${character?.name ?? '—'}`, 13, COLORS.white, true);
    this.paintLabel = text(this, 0, 0, `COR  /  ${selection?.paint.name ?? '—'}`, 12, selection?.paint.color ?? COLORS.muted);
    this.trackCards = this.specialChoice ? RACE_TRACKS.map((track, index) => {
      const card = new MenuButton(this, { label: track.name, index: String(index + 1), width: 330, labelSize: 23,
        onSelect: () => this.selectTrack(index), onActivate: () => this.selectTrack(index) });
      card.detail.setText('');
      return card;
    }) : [];
    this.startButton = new MenuButton(this, {
      label: 'CONFIRMAR', index: '→', width: 390, labelSize: 20,
      onSelect: () => this.focusAction(this.trackCards.length), onActivate: () => this.startRace(),
    });
    this.startButton.detail.setText('ENTER');
    this.backButton = new MenuButton(this, {
      label: 'VOLTAR', index: '←', width: 390,
      onSelect: () => this.focusAction(this.trackCards.length + 1), onActivate: () => this.goTo(SCENES.preparation),
    });
    this.backButton.detail.setText('ESC');
    this.hint = text(this, 0, 0, this.specialChoice ? '← →  PISTA    ENTER  CONFIRMAR    ESC  VOLTAR'
      : 'TAB  AÇÕES     ENTER  CONFIRMAR     ESC  VOLTAR', 11, COLORS.muted);
    this.content.add([this.trackFrame, this.kicker, this.title, this.trackName, this.trackDetails,
      this.difficultyLabel, this.pilotLabel, this.paintLabel, ...this.trackCards, this.startButton, this.backButton, this.hint]);
    this.showAssignedTrack();
    this.resizeShell();
    this.input.keyboard?.addCapture(['SPACE', 'TAB', 'LEFT', 'RIGHT']);
    this.input.keyboard?.on('keydown', (event: KeyboardEvent) => {
      event.stopPropagation();
      if (this.transitioning || event.repeat) return;
      const key = event.key.toLowerCase();
      if (key === 'escape') this.goTo(SCENES.preparation);
      if (this.specialChoice && (key === 'arrowleft' || key === 'arrowright')) {
        this.selectTrack((this.selectedIndex + (key === 'arrowright' ? 1 : -1) + RACE_TRACKS.length) % RACE_TRACKS.length);
      }
      if (key === 'tab') {
        event.preventDefault();
        this.focusAction((this.focusIndex + (event.shiftKey ? -1 : 1) + this.trackCards.length + 2) % (this.trackCards.length + 2));
      }
      if (key === 'enter' || event.code === 'Space') {
        if (this.focusIndex === this.trackCards.length + 1) this.goTo(SCENES.preparation);
        else this.startRace();
      }
    });
    this.events.once('shutdown', () => this.input.keyboard?.removeCapture(['SPACE', 'TAB', 'LEFT', 'RIGHT']));
  }

  selectTrack(index: number): void {
    if (this.transitioning || !this.specialChoice) return;
    this.selectedIndex = index;
    this.focusIndex = index;
    this.assignedTrack = RACE_TRACKS[index]!;
    this.showAssignedTrack();
  }

  showAssignedTrack(): void {
    const track = this.assignedTrack;
    this.trackName.setText(track.name).setColor(track.theme.accent);
    this.trackDetails.setText(track.description);
    const difficulty = DIFFICULTIES[this.registry.get('selectedDifficultyId') as keyof typeof DIFFICULTIES];
    this.difficultyLabel.setText(`DIFICULDADE  /  ${difficulty.label}`);
    this.trackFrame.clear().lineStyle(2, Number.parseInt(track.theme.accent.slice(1), 16), 0.8)
      .strokePoints([{ x: -390, y: -115 }, { x: 375, y: -115 }, { x: 390, y: -99 },
        { x: 390, y: 115 }, { x: -370, y: 115 }, { x: -390, y: 95 }], true);
    this.updateActions();
    this.announce(`${this.specialChoice ? 'Escolha especial da primeira corrida: ' : 'Pista atribuída: '}${track.name}. ${track.description} Dificuldade ${difficulty.label}. Enter confirma. Escape volta à equipe.`);
  }

  focusAction(index: number): void {
    if (this.transitioning) return;
    this.focusIndex = index;
    if (index < this.trackCards.length) {
      this.selectedIndex = index;
    this.assignedTrack = RACE_TRACKS[index]!;
      this.showAssignedTrack();
      return;
    }
    this.updateActions();
  }

  updateActions(): void {
    this.trackCards.forEach((card, index) => card.setSelected(index === this.selectedIndex));
    this.startButton.setSelected(this.focusIndex === this.trackCards.length);
    this.backButton.setSelected(this.focusIndex === this.trackCards.length + 1);
  }

  startRace(): void {
    if (this.transitioning) return;
    if (this.game.championship.startRace(this.specialChoice ? this.assignedTrack.id : undefined)) this.goTo(SCENES.race);
  }

  layout(w: number, h: number): void {
    const narrow = w < 700 && w < h;
    const compact = !narrow && h < 590;
    const designW = narrow ? 620 : compact ? 820 : 950;
    const designH = narrow ? 850 : compact ? 460 : 740;
    this.content.setPosition(w / 2, (h + 6) / 2).setScale(Math.min((w - 24) / designW, (h - 114) / designH, 1.05));
    this.kicker.setPosition(0, narrow ? -380 : compact ? -139 : -265).setVisible(!compact);
    this.title.setPosition(0, narrow ? -325 : compact ? -112 : -215).setFontSize(narrow ? 25 : compact ? 22 : 31);
    this.trackName.setPosition(narrow ? 0 : compact ? -205 : -145, narrow ? -249 : compact ? -74 : -141).setFontSize(narrow ? 20 : compact ? 19 : 25);
    this.trackDetails.setPosition(narrow ? 0 : compact ? -205 : -145, narrow ? -205 : compact ? -31 : -103)
      .setWordWrapWidth(narrow ? 560 : compact ? 370 : 385).setFontSize(narrow ? 12 : compact ? 10 : 13);
    const frameW = narrow ? 580 : compact ? 380 : 780;
    const frameH = narrow ? 265 : compact ? 178 : 240;
    this.trackFrame.clear().fillStyle(0x091321, 0.3).fillPoints([
      { x: -frameW / 2, y: -frameH / 2 }, { x: frameW / 2 - 15, y: -frameH / 2 },
      { x: frameW / 2, y: -frameH / 2 + 15 }, { x: frameW / 2, y: frameH / 2 - 15 },
      { x: frameW / 2 - 15, y: frameH / 2 }, { x: -frameW / 2, y: frameH / 2 },
    ], true).lineStyle(1, Number.parseInt(this.assignedTrack.theme.accent.slice(1), 16), 0.65).strokePoints([
      { x: -frameW / 2, y: -frameH / 2 }, { x: frameW / 2 - 15, y: -frameH / 2 },
      { x: frameW / 2, y: -frameH / 2 + 15 }, { x: frameW / 2, y: frameH / 2 - 15 },
      { x: frameW / 2 - 15, y: frameH / 2 }, { x: -frameW / 2, y: frameH / 2 },
    ], true);
    this.trackFrame.setPosition(compact ? -205 : 0, narrow ? -220 : compact ? -25 : -102);
    const infoX = narrow ? 0 : compact ? 205 : 225;
    this.difficultyLabel.setPosition(infoX, narrow ? 60 : compact ? -60 : -141).setFontSize(narrow ? 10 : compact ? 9 : 12);
    this.pilotLabel.setPosition(infoX, narrow ? 0 : compact ? -22 : -102)
      .setWordWrapWidth(narrow ? 560 : compact ? 310 : 270).setFontSize(compact ? 11 : 13);
    this.paintLabel.setPosition(infoX, narrow ? 30 : compact ? 16 : -64).setFontSize(compact ? 10 : 12);
    this.trackCards.forEach((card, index) => card.setPosition((index - 0.5) * (narrow ? 312 : 360), compact ? 58 : 90).setScale(compact ? 0.7 : 0.8));
    this.startButton.setPosition(0, narrow ? 210 : compact ? 111 : 194).setScale(narrow ? 0.7 : compact ? 0.62 : 1);
    this.backButton.setPosition(0, narrow ? 290 : compact ? 170 : 285).setScale(narrow ? 0.7 : compact ? 0.62 : 1);
    this.hint.setPosition(0, narrow ? 346 : compact ? 218 : 350).setFontSize(narrow ? 9 : compact ? 8 : 11);
  }
}
