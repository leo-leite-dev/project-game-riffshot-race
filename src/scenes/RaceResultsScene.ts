import { TitleScene } from './TitleScene.ts';
import { MenuButton } from '../ui/MenuButton.ts';
import { COLORS, SCENES, text } from '../ui/theme.ts';
import { canRunOpening } from '../championship/championshipState.ts';
import type Phaser from 'phaser';
import type { ChampionshipReceipt } from '../championship/championshipState.ts';

type ActionButton = MenuButton & { onActivate: () => void };
type ResultRow = { position: Phaser.GameObjects.Text; name: Phaser.GameObjects.Text; tag: Phaser.GameObjects.Text; time: Phaser.GameObjects.Text };

const formatTime = (seconds: number | null) => {
  if (!Number.isFinite(seconds)) return '--:--.--';
  if (seconds === null) return '--:--.--';
  return `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toFixed(2).padStart(5, '0')}`;
};
const number = (value: number) => value.toLocaleString('pt-BR');

export class RaceResultsScene extends TitleScene {
  declare game: Phaser.Game & { championship: import('../championship/Championship.ts').Championship };
  declare content: Phaser.GameObjects.Container;
  declare toast: Phaser.GameObjects.Text;
  declare transitioning: boolean;
  declare reducedMotion: boolean;
  declare result: ChampionshipReceipt;
  declare canFarm: boolean;
  declare kicker: Phaser.GameObjects.Text;
  declare title: Phaser.GameObjects.Text;
  declare details: Phaser.GameObjects.Text;
  declare frame: Phaser.GameObjects.Graphics;
  declare rows: ResultRow[];
  declare summary: Phaser.GameObjects.Text;
  declare rewardLabel: Phaser.GameObjects.Text;
  declare challengeStatus: Phaser.GameObjects.Text;
  declare primaryScene: string;
  declare backScene: string;
  declare secondaryScene: string;
  declare replayButton: ActionButton;
  declare backButton: ActionButton;
  declare rewardButton: ActionButton | null;
  declare buttons: ActionButton[];
  declare buttonsAnnouncement: string;
  declare focusIndex: number;

  constructor() { super(SCENES.results); }

  create() {
    const championship = this.game.championship;
    const state = championship.state;
    this.result = (state.pendingResult ?? this.registry.get('lastRaceResult')) as ChampionshipReceipt;
    const result = this.result;
    if (result?.standings?.length !== 4 || !['active', 'failed', 'qualified'].includes(result.outcome)
      || ![result.reward?.score, result.reward?.money, result.totals?.score,
        result.totals?.money, result.totals?.racesRun].every(Number.isFinite)) {
      this.scene.start(SCENES.menu);
      return;
    }
    // canRace includes the pending receipt gate. Preview only the existing rule;
    // the actual capability is checked again after acknowledgment on navigation.
    this.canFarm = canRunOpening(state) && championship.hasSelections;
    const qualified = result.outcome === 'qualified';
    const rewardClaimed = state.rivalRewardChoice !== null;
    const remaining = Math.max(0, state.maxRaces - state.racesRun);
    this.createShell(`RIFFSHOT RACING. Resultado final da corrida em ${this.result.trackName}.`);
    this.kicker = text(this, 0, 0, 'BANDEIRA QUADRICULADA  /  RESULTADO OFICIAL', 12, '#ffb454');
    this.title = text(this, 0, 0, 'CLASSIFICAÇÃO FINAL', 34, COLORS.white, true);
    this.details = text(this, 0, 0, `${this.result.trackName}  /  ${this.result.laps} VOLTAS  /  ${this.result.difficultyId.toUpperCase()}`, 13, '#71f6ff');
    this.frame = this.add.graphics();
    this.rows = this.result.standings.map((entrant, index) => ({
      position: text(this, 0, 0, `${entrant.position ?? index + 1}º`, 24, entrant.isPlayer ? '#ffb454' : COLORS.white, true),
      name: text(this, 0, 0, entrant.name, 17, entrant.isPlayer ? '#ffb454' : COLORS.white, true).setOrigin(0, 0.5),
      tag: text(this, 0, 0, entrant.isPlayer ? 'PLAYER 1' : 'RIVAL', 10, entrant.isPlayer ? '#71f6ff' : COLORS.muted).setOrigin(0, 0.5),
      time: text(this, 0, 0, formatTime(entrant.finishTime), 16, COLORS.white).setOrigin(1, 0.5),
    }));
    const player = this.result.standings.find(entrant => entrant.isPlayer);
    this.summary = text(this, 0, 0, player
      ? `SUA CHEGADA  /  ${player.position}º LUGAR  /  ${formatTime(player.finishTime)}`
      : 'CORRIDA ENCERRADA', 14, '#ffb454', true);
    // The receipt is already awarded and persisted by RaceScene. Presentation only.
    this.rewardLabel = text(this, 0, 0,
      `+${number(result.reward.score)} SCORE  +$${number(result.reward.money)} MONEY\n`
      + `TOTAL / ${number(result.totals.score)} SCORE / $${number(result.totals.money)} MONEY`,
      18, '#71f6ff', true).setOrigin(0.5, 0);
    const messages = {
      active: 'DESAFIO EM ANDAMENTO\nContinue rumo ao objetivo.',
      failed: 'META NÃO ATINGIDA\nReiniciar zerará SCORE, MONEY\ne upgrades.',
      qualified: rewardClaimed ? 'PRÊMIO JÁ RECEBIDO\nFASE 2 EM DESENVOLVIMENTO.'
        : this.canFarm ? `META ATINGIDA / PRÊMIO DISPONÍVEL\nFarme mais ${remaining} corrida(s) ou escolha o prêmio agora.\nNão é obrigatório completar as ${state.maxRaces} corridas.`
          : 'META ATINGIDA / LIMITE DE CORRIDAS ALCANÇADO\nEscolha o prêmio para concluir este desafio.',
    };
    this.challengeStatus = text(this, 0, 0,
      `CORRIDAS ${result.totals.racesRun}/${state.maxRaces} / META ${number(state.targetScore)} SCORE\n${messages[result.outcome]}`,
      16, result.outcome === 'failed' ? '#ffb454' : COLORS.white).setOrigin(0.5, 0);
    const primaryLabel = { active: 'PRÓXIMA CORRIDA', failed: 'REINICIAR DESAFIO',
      qualified: rewardClaimed ? 'VER EQUIPE' : this.canFarm ? 'CONTINUAR / FARMAR' : 'ESCOLHER PRÊMIO' };
    this.primaryScene = result.outcome === 'active' || (qualified && this.canFarm) ? SCENES.tracks
      : qualified && !rewardClaimed ? SCENES.rivalReward : SCENES.preparation;
    this.backScene = result.outcome === 'active' || (qualified && !rewardClaimed) ? SCENES.preparation : SCENES.menu;
    this.secondaryScene = qualified && this.canFarm ? SCENES.rivalReward : this.backScene;
    const secondaryLabel = qualified && this.canFarm ? 'ENFRENTAR PRÓXIMO RIVAL'
      : this.backScene === SCENES.preparation ? 'ESTAÇÃO DE EQUIPE' : 'MENU';
    this.replayButton = new MenuButton(this, {
      label: primaryLabel[result.outcome], index: '↻', width: 480, labelSize: 24,
      onSelect: () => this.focusAction(0), onActivate: () => this.continueTo(this.primaryScene),
    }) as ActionButton;
    this.replayButton.detail.setText('↵');
    this.replayButton.onActivate = () => this.continueTo(this.primaryScene);
    this.backButton = new MenuButton(this, {
      label: secondaryLabel, index: qualified && this.canFarm ? '◆' : '←', width: 480, labelSize: 24,
      onSelect: () => this.focusAction(1), onActivate: () => this.continueTo(this.secondaryScene),
    }) as ActionButton;
    this.backButton.detail.setText(qualified && this.canFarm ? 'PRÊMIO' : 'ESC');
    this.backButton.onActivate = () => this.continueTo(this.secondaryScene);
    if (qualified) {
      this.buttonsAnnouncement = `${messages.qualified} ${primaryLabel.qualified}. ${secondaryLabel}. `
        + 'Enfrentar o próximo rival abre somente a premiação. Fase 2 em desenvolvimento. Escape volta sem escolher o prêmio.';
      this.announce(`Resultado final. ${this.buttonsAnnouncement}`);
      this.replayButton.label.setFontSize(21).setWordWrapWidth(330);
      this.backButton.label.setFontSize(20).setWordWrapWidth(320);
    }
    this.rewardButton = qualified && !rewardClaimed ? (this.canFarm ? this.backButton : this.replayButton) : null;
    this.buttons = [this.replayButton, this.backButton];
    this.content.add([this.frame, this.kicker, this.title, this.details,
      ...this.rows.flatMap(row => [row.position, row.name, row.tag, row.time]),
      this.summary, this.rewardLabel, this.challengeStatus, ...this.buttons]);
    this.focusAction(0);
    this.resizeShell();
    this.input.keyboard!.addCapture(['UP', 'DOWN', 'SPACE', 'TAB']);
    this.input.keyboard!.on('keydown', (event: KeyboardEvent) => {
      event.stopPropagation();
      if (this.transitioning || event.repeat) return;
      const key = event.key.toLowerCase();
      if (key === 'escape') this.continueTo(this.backScene);
      if (key === 'arrowup' || key === 'arrowdown' || key === 'tab') {
        event.preventDefault();
        this.focusAction(this.focusIndex + ((key === 'arrowup' || (key === 'tab' && event.shiftKey)) ? -1 : 1));
      }
      if (key === 'enter' || event.code === 'Space') {
        event.preventDefault();
        this.buttons[this.focusIndex].onActivate();
      }
    });
    this.events.once('shutdown', () => this.input.keyboard!.removeCapture(['UP', 'DOWN', 'SPACE', 'TAB']));
  }

  continueTo(sceneKey: string): void {
    if (this.transitioning) return;
    const outcome = this.result.outcome;
    const championship = this.game.championship;
    const allowed = outcome === 'active' ? [SCENES.tracks, SCENES.preparation]
      : outcome === 'qualified' ? [SCENES.tracks, SCENES.rivalReward, SCENES.preparation, SCENES.menu]
        : [SCENES.preparation, SCENES.menu];
    if (!allowed.includes(sceneKey)) return;
    // Leaving a failed attempt for the menu is not confirmation of a restart.
    if (outcome !== 'failed' || sceneKey !== SCENES.menu) {
      championship.acknowledgeResult();
      if (championship.state.pendingResult) {
        this.navigationFeedback('Não foi possível reconhecer o resultado. Seu recibo foi preservado.');
        return;
      }
    }
    if (sceneKey === SCENES.tracks && !championship.canRace) {
      this.navigationFeedback('Não há corridas disponíveis neste desafio. Volte à equipe ou escolha o prêmio.');
      return;
    }
    if (sceneKey === SCENES.rivalReward && !championship.canClaimRivalReward) {
      this.navigationFeedback('Prêmio indisponível ou já recebido. Volte à estação de equipe.');
      return;
    }
    this.goTo(sceneKey);
  }

  navigationFeedback(message: string): void {
    this.announce(message);
    this.toast.setText(message).setWordWrapWidth(Math.min(600, this.scale.width - 40)).setAlpha(1);
  }

  focusAction(index: number): void {
    if (this.transitioning) return;
    this.focusIndex = (index + this.buttons.length) % this.buttons.length;
    this.buttons.forEach((button, i) => button.setSelected(i === this.focusIndex));
  }

  layout(w: number, h: number): void {
    const narrow = w < 700 && w < h;
    const compact = !narrow && h < 600;
    const width = narrow ? 360 : compact ? 800 : 760;
    this.kicker.setPosition(0, 0).setOrigin(0.5, 0).setFontSize(narrow ? 8 : compact ? 9 : 12);
    this.title.setPosition(0, this.kicker.height + 4).setOrigin(0.5, 0).setFontSize(narrow ? 18 : compact ? 21 : 34)
      .setWordWrapWidth(width - 18);
    this.details.setPosition(0, this.title.y + this.title.height + 4).setOrigin(0.5, 0)
      .setFontSize(narrow ? 8 : compact ? 10 : 13).setWordWrapWidth(width - 20);
    const panelTop = this.details.y + this.details.height + (narrow ? 5 : 12);
    const panelWidth = narrow ? 350 : compact ? 398 : 710;
    const panelHeight = narrow ? 146 : compact ? 172 : 256;
    const panelX = compact ? -198 : 0;
    const panelY = panelTop + panelHeight / 2;
    const points = [
      { x: -panelWidth / 2, y: panelY - panelHeight / 2 + 14 },
      { x: -panelWidth / 2 + 14, y: panelY - panelHeight / 2 },
      { x: panelWidth / 2, y: panelY - panelHeight / 2 },
      { x: panelWidth / 2, y: panelY + panelHeight / 2 - 14 },
      { x: panelWidth / 2 - 14, y: panelY + panelHeight / 2 },
      { x: -panelWidth / 2, y: panelY + panelHeight / 2 },
    ];
    this.frame.setPosition(panelX, 0).clear().fillStyle(0x081321, 0.92).fillPoints(points, true)
      .lineStyle(1, 0x45627a, 0.9).strokePoints(points, true);
    this.rows.forEach((row, index) => {
      const small = narrow || compact;
      const y = panelY + (index - 1.5) * (panelHeight / 4);
      const left = panelX - panelWidth / 2;
      row.position.setPosition(left + (small ? 20 : 40), y).setFontSize(small ? 15 : 23);
      row.name.setPosition(left + (small ? 55 : 104), y - 6).setFontSize(small ? 11 : 17);
      row.name.setWordWrapWidth(panelWidth - (small ? 150 : 230));
      row.tag.setPosition(left + (small ? 56 : 105), y + 11).setFontSize(small ? 7 : 10);
      row.time.setPosition(panelX + panelWidth / 2 - 10, y).setFontSize(small ? 10 : 16);
    });
    this.summary.setPosition(panelX, panelTop + panelHeight + (narrow ? 9 : 18)).setFontSize(narrow ? 9 : compact ? 10 : 14);
    const receiptX = compact ? 212 : 0;
    const receiptWidth = compact ? 350 : width - 20;
    const receiptTop = compact ? panelTop : this.summary.y + this.summary.height / 2 + (narrow ? 4 : 10);
    this.rewardLabel.setPosition(receiptX, receiptTop).setFontSize(narrow ? 12 : compact ? 16 : 20)
      .setWordWrapWidth(receiptWidth);
    this.challengeStatus.setPosition(receiptX, receiptTop + this.rewardLabel.height + 10)
      .setFontSize(narrow ? 9 : compact ? 13 : 16).setWordWrapWidth(receiptWidth);
    const statusBottom = this.challengeStatus.y + this.challengeStatus.height;
    const buttonTop = (compact ? Math.max(statusBottom, this.summary.y + this.summary.height / 2) : statusBottom) + (narrow ? 7 : 16);
    this.buttons.forEach((button, index) => {
      button.setScale(narrow ? 0.64 : compact ? 0.6 : 0.7).setPosition(narrow ? 0 : (index - 0.5) * (compact ? 350 : 370),
        buttonTop + (narrow ? 26 + index * 56 : compact ? 24 : 29));
    });
    // Measure wrapped text before fitting; children use local scale exactly once.
    const height = Math.max(this.backButton.y + (narrow ? 30 : 36), this.summary.y + this.summary.height / 2 + 8);
    this.content.list.forEach(child => { (child as Phaser.GameObjects.GameObject & { y: number }).y -= height / 2; });
    this.fitContent(w, h, width, height);
  }
}
