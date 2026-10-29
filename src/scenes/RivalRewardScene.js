import { TitleScene } from './TitleScene.js';
import { MenuButton } from '../ui/MenuButton.js';
import { COLORS, SCENES, text } from '../ui/theme.js';
import { RIVAL_VEHICLE_ID, getVehicleById } from '../data/vehicles.js';

const number = value => value.toLocaleString('pt-BR');

export class RivalRewardScene extends TitleScene {
  constructor() { super(SCENES.rivalReward); }

  create() {
    const championship = this.game.championship;
    const state = championship.state;
    if (state.pendingResult) { this.scene.start(SCENES.results); return; }
    this.rewardClaimed = state.rivalRewardChoice !== null;
    if (!championship.canClaimRivalReward && !this.rewardClaimed) {
      this.scene.start(SCENES.preparation);
      return;
    }
    this.rewardVehicle = getVehicleById(RIVAL_VEHICLE_ID);
    this.creditReward = Math.floor(this.rewardVehicle.price / 2);
    this.ownsRewardVehicle = championship.ownsVehicle(RIVAL_VEHICLE_ID);
    this.canFarm = championship.canRace;
    this.claiming = false;
    const rewardAnnouncement = this.rewardClaimed ? 'Prêmio já recebido; não é possível receber novamente. '
      : this.ownsRewardVehicle ? `Você já possui o ${this.rewardVehicle.name}. Escolha ${number(this.creditReward)} créditos. `
        : `Escolha um único prêmio: ${this.rewardVehicle.name}, no valor de ${number(this.rewardVehicle.price)} créditos, ou ${number(this.creditReward)} créditos. `;
    this.createShell('RIFFSHOT RACING. Premiação do desafio inicial. ' + rewardAnnouncement
      + 'Receber o prêmio encerra as corridas deste desafio. Fase 2 em desenvolvimento. '
      + 'Setas ou Tab navegam; Enter ou espaço confirma; Escape volta sem receber.');
    this.kicker = text(this, 0, 0, 'DESAFIO INICIAL  /  META ATINGIDA', 12, '#ffb454');
    this.title = text(this, 0, 0, 'ESCOLHA SEU PRÊMIO', 32, COLORS.white, true);
    this.description = text(this, 0, 0, 'UM ÚNICO PRÊMIO / ESCOLHA DEFINITIVA', 14, '#71f6ff');
    this.prizeLabel = text(this, 0, 0,
      `${this.rewardVehicle.name} / VALOR ${number(this.rewardVehicle.price)} CRÉDITOS\n`
      + `${this.ownsRewardVehicle ? 'PRÊMIO EM CRÉDITOS /' : 'OU'} ${number(this.creditReward)} CRÉDITOS / METADE DO VALOR`, 20, COLORS.white, true);
    const remaining = Math.max(0, state.maxRaces - state.racesRun);
    this.rulesLabel = text(this, 0, 0, this.rewardClaimed
      ? `PRÊMIO JÁ RECEBIDO / ${state.rivalRewardChoice === 'vehicle' ? this.rewardVehicle.name : `${number(this.creditReward)} CRÉDITOS`}\nNão é possível receber novamente.`
      : `${this.ownsRewardVehicle ? 'Você já possui o WIDOWMAKER. Escolha os créditos.\n' : ''}`
        + (this.canFarm ? `Ainda restam ${remaining} corrida(s). Você pode voltar e farmar antes de decidir.\n` : 'Limite de corridas alcançado.\n')
        + 'Receber o prêmio encerra este desafio e o farming.', 15, COLORS.muted);
    this.phaseNotice = text(this, 0, 0, 'FASE 2 EM DESENVOLVIMENTO\nA premiação não inicia uma corrida contra outro rival.', 15, '#ffb454', true);
    // Persistent, in-content feedback remains readable beside storage warnings.
    this.feedback = text(this, 0, 0, '', 14, '#71f6ff').setOrigin(0.5, 0);
    this.buttons = [];
    this.vehicleButton = null;
    this.creditsButton = null;
    if (!this.rewardClaimed && !this.ownsRewardVehicle) {
      this.vehicleButton = this.addAction('RECEBER WIDOWMAKER', '01', () => this.requestReward('vehicle'));
    }
    if (!this.rewardClaimed) {
      this.creditsButton = this.addAction(`RECEBER ${number(this.creditReward)} CRÉDITOS`, '02', () => this.requestReward('credits'));
    }
    this.backButton = this.addAction(this.canFarm ? 'VOLTAR / FARMAR' : 'VOLTAR À EQUIPE', '←', () => this.leaveWithoutReward());
    this.backButton.detail.setText('ESC');
    this.farmButton = this.canFarm ? this.backButton : null;
    this.content.add([this.kicker, this.title, this.description, this.prizeLabel, this.rulesLabel,
      this.phaseNotice, this.feedback, ...this.buttons]);
    this.focusAction(0);
    this.resizeShell();
    if (this.rewardClaimed) this.showFeedback('Prêmio já recebido. FASE 2 EM DESENVOLVIMENTO.');
    this.input.keyboard.addCapture(['UP', 'DOWN', 'LEFT', 'RIGHT', 'SPACE', 'TAB']);
    this.input.keyboard.on('keydown', event => {
      event.stopPropagation();
      if (this.transitioning || this.claiming || event.repeat) return;
      const key = event.key.toLowerCase();
      if (key === 'escape') this.leaveWithoutReward();
      else if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'tab'].includes(key)) {
        event.preventDefault();
        this.focusAction(this.focusIndex + ((key === 'arrowup' || key === 'arrowleft' || (key === 'tab' && event.shiftKey)) ? -1 : 1));
      } else if (key === 'enter' || event.code === 'Space') {
        event.preventDefault();
        this.buttons[this.focusIndex].onActivate();
      }
    });
    this.events.once('shutdown', () => this.input.keyboard.removeCapture(['UP', 'DOWN', 'LEFT', 'RIGHT', 'SPACE', 'TAB']));
  }

  addAction(label, index, onActivate) {
    const actionIndex = this.buttons.length;
    const button = new MenuButton(this, { label, index, width: 560, labelSize: 22,
      onSelect: () => this.focusAction(actionIndex), onActivate });
    button.detail.setText('↵');
    button.label.setWordWrapWidth(410);
    // MenuButton delegates pointer input; expose the same action to keyboard/automation.
    button.onActivate = onActivate;
    this.buttons.push(button);
    return button;
  }

  requestReward(choice) {
    if (this.transitioning || this.claiming) return;
    const championship = this.game.championship;
    if (!championship.canClaimRivalReward) {
      this.showFeedback(championship.state.rivalRewardChoice !== null
        ? 'Prêmio já recebido. FASE 2 EM DESENVOLVIMENTO.' : 'Prêmio indisponível. Volte à equipe para conferir o desafio.');
      return;
    }
    if (!['vehicle', 'credits'].includes(choice)) return;
    if (choice === 'vehicle' && championship.ownsVehicle(RIVAL_VEHICLE_ID)) {
      this.showFeedback('Você já possui o WIDOWMAKER. Escolha os créditos; não há prêmio duplicado.');
      return;
    }
    this.claiming = true;
    const prize = choice === 'vehicle' ? this.rewardVehicle.name : `${number(this.creditReward)} CRÉDITOS`;
    const confirmed = window.confirm(`RECEBER ${prize}?\n\nVocê pode receber somente um prêmio. Esta escolha é definitiva e encerra as corridas e o farming deste desafio.\n\nFASE 2 EM DESENVOLVIMENTO: nenhum novo rival será iniciado. Confirmar?`);
    if (!confirmed) {
      this.claiming = false;
      this.showFeedback('Escolha cancelada. Nenhum prêmio recebido; você pode continuar farmando se restam corridas.');
      return;
    }
    if (!championship.claimRivalReward(choice)) {
      this.claiming = false;
      this.showFeedback(championship.warning
        ? `Não foi possível salvar o prêmio. Nenhuma alteração aplicada. ${championship.warning}`
        : 'Não foi possível receber o prêmio. Nenhuma alteração aplicada. Confira se ele já foi recebido.');
      return;
    }
    this.rewardClaimed = true;
    this.openPreparation(`PRÊMIO RECEBIDO: ${prize}. FASE 2 EM DESENVOLVIMENTO.`,
      `Prêmio recebido e salvo: ${prize}. Desafio inicial concluído. Fase 2 em desenvolvimento; ainda não há outro rival disponível.`);
  }

  openPreparation(toastMessage, announcement) {
    // Deliver after the destination creates its shell, without changing that scene.
    const preparation = this.scene.get(SCENES.preparation);
    preparation.events.once('create', () => {
      preparation.announce(announcement);
      preparation.toast.setText(toastMessage)
        .setWordWrapWidth(Math.min(560, (preparation.scale.width - 40) / preparation.toast.scaleX)).setAlpha(1);
    });
    this.announce(announcement);
    this.goTo(SCENES.preparation);
  }

  leaveWithoutReward() {
    if (this.transitioning || this.claiming) return;
    this.goTo(SCENES.preparation);
  }

  showFeedback(message) {
    this.feedback.setText(message);
    this.announce(message);
    this.resizeShell();
  }

  focusAction(index) {
    if (this.transitioning || this.claiming) return;
    this.focusIndex = (index + this.buttons.length) % this.buttons.length;
    this.buttons.forEach((button, i) => button.setSelected(i === this.focusIndex));
  }

  layout(w, h) {
    const narrow = w < 700 && w < h;
    const compact = !narrow && h < 600;
    const width = narrow ? 360 : compact ? 820 : 760;
    const textWidth = width - 24;
    let y = 0;
    const place = (item, size, gap = 10, x = 0, wrapWidth = textWidth) => {
      item.setOrigin(0.5, 0).setFontSize(size).setWordWrapWidth(wrapWidth).setPosition(x, y);
      y += item.height + gap;
    };
    place(this.kicker, narrow ? 9 : compact ? 10 : 12, 5);
    place(this.title, narrow ? 23 : compact ? 25 : 32, 6);
    place(this.description, narrow ? 10 : 12, narrow ? 12 : 16);
    const actionsTop = y;
    const infoX = compact ? -190 : 0;
    const infoWidth = compact ? 420 : textWidth;
    place(this.prizeLabel, narrow ? 16 : compact ? 16 : 22, 12, infoX, infoWidth);
    place(this.rulesLabel, narrow ? 12 : compact ? 13 : 15, 10, infoX, infoWidth);
    place(this.phaseNotice, narrow ? 12 : 14, 8, infoX, infoWidth);
    place(this.feedback, narrow ? 12 : 14, this.feedback.text ? 12 : 0, infoX, infoWidth);
    const scale = narrow ? 0.61 : compact ? 0.65 : 0.85;
    if (compact) {
      // Landscape keeps actions beside the copy instead of shrinking a tall stack.
      this.buttons.forEach((button, index) => button.setScale(scale)
        .setPosition(222, actionsTop + 27 + index * 60));
      y = Math.max(y, actionsTop + this.buttons.length * 60);
    } else {
      this.buttons.forEach(button => {
        button.setScale(scale).setPosition(0, y + 39 * scale);
        y += 88 * scale;
      });
    }
    const height = y + 8;
    this.content.list.forEach(child => { child.y -= height / 2; });
    this.fitContent(w, h, width, height);
  }
}
