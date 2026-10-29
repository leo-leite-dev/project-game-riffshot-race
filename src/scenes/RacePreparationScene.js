import { GarageScene } from './GarageScene.js';
import { CHARACTERS, getSelectedCharacter } from '../data/characters.js';
import { getSelectedVehicle, VEHICLE_ATTRIBUTES, RIVAL_VEHICLE_ID, getVehicleDisplayName } from '../data/vehicles.js';
import { getRaceState } from '../data/raceState.js';
import { characterPortrait } from '../visuals/characterPortrait.js';
import { COLORS, SCENES, text } from '../ui/theme.js';
import { PreparationButton, preparationFrame, createRivalPortrait, createStatPanel, bindPreparationKeys } from '../ui/PreparationModules.js';

const number = value => Number(value).toLocaleString('pt-BR');

export class RacePreparationScene extends GarageScene {
  constructor() { super(SCENES.preparation); }

  create() {
    if (this.game.championship.state.pendingResult) { this.scene.start(SCENES.results); return; }
    this.character = getSelectedCharacter(this.registry);
    this.selection = getSelectedVehicle(this.registry);
    if (!this.character || !this.selection) {
      this.scene.start(this.character ? SCENES.vehicles : SCENES.characters);
      return;
    }
    this.raceState = getRaceState(this.registry);
    this.erasingProgress = false;
    this.createGarageShell('RIFFSHOT RACING. Estação de Equipe. Preparação da corrida. Tab ou setas navegam; Enter confirma. Escape volta à seleção do veículo.');
    this.title = text(this, 0, 0, 'ESTAÇÃO DE EQUIPE', 26, COLORS.white, true).setOrigin(0, 0.5);
    this.stationKicker = text(this, 0, 0, 'PIT CONTROL  /  TELEMETRIA ORBITAL', 11, '#71f6ff');
    this.pilotPanel = this.add.container();
    this.pilotFrame = this.add.graphics();
    this.pilotPortrait = this.add.image(0, 0, characterPortrait(this, this.character));
    this.pilotTag = text(this, 0, 0, 'PILOTO', 13, '#71f6ff');
    this.pilotName = text(this, 0, 0, this.character.name, 14, COLORS.white, true);
    this.pilotPanel.add([this.pilotFrame, this.pilotPortrait, this.pilotTag, this.pilotName]);
    this.rivalPanel = this.add.container();
    this.rivalFrame = this.add.graphics();
    this.rivalPortrait = createRivalPortrait(this);
    this.rivalTag = text(this, 0, 0, 'RIVAL', 13, '#ff78ae');
    this.rivalName = text(this, 0, 0, CHARACTERS.find(character => character.id !== this.character.id).name, 14, COLORS.white, true);
    this.rivalPanel.add([this.rivalFrame, this.rivalPortrait, this.rivalTag, this.rivalName]);
    this.createCampaign();
    this.vehicleFrame = this.add.graphics();
    this.vehicleTitle = text(this, 0, 0, `${getVehicleDisplayName(this.selection.vehicle)} / ${this.selection.paint.name}`, 16, this.selection.paint.color, true);
    this.rivalVehicle = this.add.container();
    this.rivalVehicleFrame = this.add.graphics();
    this.rivalVehicleTitle = text(this, 0, 0, 'VEÍCULO RIVAL', 13, '#a7b6cb');
    this.rivalVehicleSoon = text(this, 0, 0, 'WIDOWMAKER', 12, '#ff78ae');
    this.rivalVehicleShape = this.add.graphics().lineStyle(2, 0x40536c, 0.7);
    this.rivalVehicleShape.strokePoints([{ x: -54, y: 16 }, { x: -46, y: -8 }, { x: -19, y: -24 },
      { x: 23, y: -24 }, { x: 50, y: -4 }, { x: 57, y: 16 }], true);
    this.rivalVehicleShape.strokeRoundedRect(-45, 12, 20, 13, 3).strokeRoundedRect(28, 12, 20, 13, 3);
    this.rivalVehicleShape.lineBetween(-27, -6, 30, -6);
    this.rivalVehicle.add([this.rivalVehicleFrame, this.rivalVehicleShape, this.rivalVehicleTitle, this.rivalVehicleSoon]);
    this.statValues = {};
    const statPanel = (heading, keys) => createStatPanel(this, heading, VEHICLE_ATTRIBUTES.filter(item => keys.includes(item.key)), this.selection.vehicle.stats, this.statValues);
    this.motor = statPanel('MOTOR', ['speed', 'acceleration']);
    this.suspension = statPanel('SUSPENSÃO', ['control']);
    this.armor = statPanel('RESISTÊNCIA', ['armor']);
    this.vehicleAbility = text(this, 0, 0, this.selection.vehicle.ability.nitroCharges
      ? 'NITRO / 2 CARGAS' : this.selection.vehicle.id === 'iron-bastion' ? 'BLINDAGEM REFORÇADA' : 'TRAÇÃO PRECISA',
    10, '#ffb454', true);
    this.createActions();
    this.content.add([this.title, this.stationKicker, this.pilotPanel, this.rivalPanel, this.campaign, this.vehicleFrame,
      this.vehicleTitle, this.vehicleAbility, this.rivalVehicle, this.motor, this.suspension, this.armor, ...this.modules, this.startButton, this.eraseButton, this.rewardButton]);
    // Keep the base's ready/error feedback; handle an uncaught loader rejection too.
    const loadingLabel = this.loadingLabel;
    this.mountGarage({ mode: 'preparation', vehicleId: this.selection.vehicle.id,
      paintId: this.selection.paint.id }).catch(() => {
      if (!this.sys.isActive() || this.loadingLabel !== loadingLabel) return;
      this.loadingLabel?.setText('PREVIEW INDISPONÍVEL');
      this.announce('Preview 3D indisponível. Sua seleção foi preservada.');
    });
    this.focusAction(5);
    this.resizeShell();
    bindPreparationKeys(this, event => this.handleKey(event));
  }

  createCampaign() {
    const state = this.raceState;
    this.campaign = this.add.container();
    this.campaignFrame = this.add.graphics();
    this.seasonLabel = text(this, 0, 0, state.attempt.status === 'qualified'
      ? state.rivalRewardChoice ? 'DESAFIO CONCLUÍDO / PRÊMIO RECEBIDO' : 'META ATINGIDA / VOCÊ ESCOLHE QUANDO AVANÇAR'
      : `TEMPORADA / TENTATIVA ${state.attempt.number}`, 11, '#ffb454', true).setPadding(0);
    this.playerLabel = text(this, 0, 0, 'PLAYER 1', 14, '#71f6ff', true).setPadding(0);
    this.playerName = text(this, 0, 0, this.character.name, 23, COLORS.white, true).setPadding(0);
    this.campaignFields = [
      ['MONEY', `$ ${number(state.money)}`], ['DIVISION', state.division],
      ['RACES RUN', `${state.racesRun} OF ${state.maxRaces}`],
      ['SCORE NEED', number(state.targetScore)], ['SCORE HAVE', number(state.score)],
    ].map(([label, value]) => ({
      label: text(this, 0, 0, label, 12, COLORS.muted).setPadding(0),
      value: text(this, 0, 0, String(value), 21, COLORS.white, true).setPadding(0),
    }));
    this.scoreProgress = this.add.graphics();
    this.scoreStatus = text(this, 0, 0, state.attempt.status === 'qualified'
      ? state.rivalRewardChoice ? 'FASE 2 EM DESENVOLVIMENTO / CARROS E CRÉDITOS PRESERVADOS'
        : state.racesRun < state.maxRaces ? 'CONTINUE FARMANDO ATÉ A 8ª CORRIDA OU ESCOLHA SEU PRÊMIO'
          : 'OITO CORRIDAS CONCLUÍDAS / ESCOLHA SEU PRÊMIO'
      : `META SCORE / ${Math.min(100, Math.floor(state.score / state.targetScore * 100))}%`, 10, '#ffb454');
    this.campaign.add([this.campaignFrame, this.seasonLabel, this.playerLabel, this.playerName,
      this.scoreProgress, this.scoreStatus,
      ...this.campaignFields.flatMap(field => [field.label, field.value])]);
  }

  onGarageReady() {
    // The model sits above the panel's opaque background, below its labels.
    this.content.moveTo(this.preview, this.content.getIndex(this.vehicleFrame) + 1);
    this.vehicleTitle.setText(`${getVehicleDisplayName(this.selection.vehicle)} / ${this.selection.paint.name}`);
    this.mountRivalPreview().catch(() => {
      // The player's live preview must keep working if this optional thumbnail fails.
      if (this.alive) this.rivalVehicleShape.setVisible(true);
    });
  }

  async mountRivalPreview() {
    const version = this.loadVersion;
    await this.garageView.resources.load([RIVAL_VEHICLE_ID]);
    if (!this.alive || version !== this.loadVersion) return;
    const world = await this.createGarageWorld(this.garageView.resources,
      { mode: 'preparation', vehicleId: RIVAL_VEHICLE_ID, paintId: 'inferno' }, version);
    if (!world) return;
    try {
      world.resize(240, 240);
      world.update(0);
      const key = 'preparation-rival-preview';
      const texture = this.textures.createCanvas(key, world.width, world.height);
      texture.context.drawImage(world.resources.renderer.domElement, 0, 0);
      texture.refresh();
      this.rivalPreview = this.add.image(0, 0, key);
      this.rivalVehicle.addAt(this.rivalPreview, 1);
      this.rivalVehicleShape.setVisible(false);
      this.events.once('shutdown', () => { this.rivalPreview = null; this.textures.remove(key); });
      this.resizeShell();
    } finally {
      world.destroy();
      // Both previews share one renderer; restore the live player's dimensions.
      this.garageView.resources.renderer.setSize(this.garageView.width, this.garageView.height, false);
      this.applyPreviewBounds();
    }
  }

  createActions() {
    const definitions = [
      ['PISTA / CORRIDA', 'track', () => this.startNextRace()],
      ['MELHORIAS', 'upgrade', () => this.showSoon()],
      ['REPAROS', 'repair', () => this.showSoon()],
      ['VEÍCULO', 'vehicle', () => this.goTo(SCENES.vehicles)],
      ['SAIR / VOLTAR', 'back', () => this.goTo(SCENES.vehicles)],
    ];
    this.modules = definitions.map(([label, icon, onActivate], index) => new PreparationButton(this, {
      label, icon, detail: index === 0 ? 'CIRCUITO' : index < 3 ? 'Em breve' : index === 3 ? 'LOJA DE VEÍCULOS' : 'ESC',
      onSelect: () => this.focusAction(index), onActivate,
    }));
    this.backButton = this.modules[4];
    this.startButton = new PreparationButton(this, {
      label: 'START RACE', icon: 'start', onSelect: () => this.focusAction(5),
      onActivate: () => this.startNextRace(),
    });
    this.startButton.detail.setText('CORRIDA');
    this.eraseButton = new PreparationButton(this, {
      label: 'APAGAR PROGRESSO', detail: 'RECOMEÇAR DO INÍCIO', icon: 'back',
      onSelect: () => this.focusAction(6), onActivate: () => this.requestEraseProgress(),
    });
    this.rewardButton = new PreparationButton(this, {
      label: 'PRÓXIMO RIVAL / PRÊMIO', detail: 'WIDOWMAKER OU 12.000 CR', icon: 'vehicle',
      onSelect: () => this.focusAction(7), onActivate: () => {
        if (this.game.championship.canClaimRivalReward) this.goTo(SCENES.rivalReward);
      },
    });
    this.rewardButton.setVisible(this.game.championship.canClaimRivalReward);
    if (this.raceState.attempt.status === 'qualified' && !this.raceState.rivalRewardChoice) {
      const farming = this.game.championship.canRace;
      this.startButton.label.setText(farming ? 'CONTINUAR / FARMAR' : 'ESCOLHER PRÊMIO').setFontSize(14);
      this.startButton.detail.setText(farming ? `ATÉ ${this.raceState.maxRaces} CORRIDAS` : 'RIVAL SUPERADO');
      this.modules[0].label.setText(farming ? 'PISTA / FARMAR' : 'PRÊMIO DO RIVAL');
    } else if (this.raceState.rivalRewardChoice) {
      this.modules[0].label.setText('PRÓXIMO RIVAL').setFontSize(12);
      this.modules[0].detail.setText('Fase 2 em desenvolvimento');
      this.startButton.label.setText('FASE 2 EM DESENVOLVIMENTO').setFontSize(12);
      this.startButton.detail.setText('PRÊMIO RECEBIDO');
      this.modules[0].locked = this.startButton.locked = true;
    }
  }

  requestEraseProgress() {
    if (this.transitioning || this.erasingProgress) return;
    this.erasingProgress = true;
    const confirmed = window.confirm('APAGAR TODO O PROGRESSO?\n\nDinheiro, SCORE, corridas, carros comprados, prêmio do rival, melhorias, histórico, piloto, veículo e pintura serão apagados, incluindo os backups do campeonato.\n\nEsta ação não pode ser desfeita. Deseja voltar ao início com uma carreira nova?');
    if (!confirmed) {
      this.erasingProgress = false;
      this.announce('Exclusão cancelada. Seu progresso foi preservado.');
      return;
    }
    if (!this.game.championship.eraseProgress()) {
      this.erasingProgress = false;
      this.toast.setText('NÃO FOI POSSÍVEL APAGAR O SAVE. VEJA O AVISO.').setAlpha(1);
      return;
    }
    this.announce('Progresso apagado. Voltando à abertura.');
    this.goTo(SCENES.splash);
  }

  startNextRace() {
    if (this.game.championship.canRace) this.goTo(SCENES.tracks);
    else if (this.game.championship.canClaimRivalReward) this.goTo(SCENES.rivalReward);
    else {
      this.announce('Meta de SCORE atingida. Próximo rival em desenvolvimento. Dinheiro e melhorias preservados.');
      this.toastTimer?.remove();
      this.tweens.killTweensOf(this.toast);
      this.toast.setText('◇  PRÓXIMO RIVAL EM DESENVOLVIMENTO').setAlpha(1);
      this.toastTimer = this.time.delayedCall(2300, () => this.tweens.add({
        targets: this.toast, alpha: 0, duration: this.reducedMotion ? 1 : 240,
      }));
    }
  }

  focusAction(index) {
    if (this.transitioning) return;
    const count = this.rewardButton.visible ? 8 : 7;
    this.focusIndex = (index + count) % count;
    [...this.modules, this.startButton, this.eraseButton, this.rewardButton].forEach((button, i) => button.setSelected(i === this.focusIndex));
  }

  handleKey(event) {
    if (event.key === 'Escape') this.goTo(SCENES.vehicles);
    else if (event.key === 'Enter' || event.key === ' ') [...this.modules, this.startButton, this.eraseButton, this.rewardButton][this.focusIndex].onActivate();
    else {
      const step = event.key === 'Tab' ? (event.shiftKey ? -1 : 1)
        : { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -1, ArrowDown: 1 }[event.key];
      if (step) this.focusAction(this.focusIndex + step);
    }
  }

  layout(w, h) {
    const narrow = w < 700 && w < h;
    const compact = !narrow && h < 600;
    const designW = narrow ? 360 : compact ? 1000 : 1200;
    const designH = narrow ? (this.rewardButton.visible ? 760 : 660) : compact ? 330 : 700;
    this.content.setPosition(w / 2, (h + 6) / 2).setScale(Math.min((w - 24) / designW, (h - 114) / designH, 1.15));
    const titleY = narrow ? -258 : compact ? -151 : -319;
    this.title.setFontSize(narrow ? 19 : compact ? 20 : 25);
    this.title.setPosition(narrow ? -this.title.width / 2 : compact ? -365 : -510, titleY);
    this.stationKicker.setPosition(narrow ? 0 : compact ? 370 : 510, titleY).setFontSize(narrow ? 9 : 11).setVisible(!narrow);
    const portraitY = narrow ? -207 : compact ? -84 : -174;
    const portraitW = narrow ? 104 : compact ? 142 : 180;
    const portraitH = narrow ? 68 : compact ? 104 : 178;
    const pilotX = narrow ? -126 : compact ? -414 : -500;
    const rivalX = narrow ? 128 : compact ? 430 : 495;
    this.layoutPortrait(this.pilotPanel, this.pilotFrame, this.pilotPortrait, this.pilotTag, this.pilotName,
      pilotX, portraitY, portraitW, portraitH);
    this.layoutPortrait(this.rivalPanel, this.rivalFrame, this.rivalPortrait, this.rivalTag, this.rivalName,
      rivalX, portraitY - (narrow ? 4 : 12), portraitW, portraitH, true);
    const campaignX = narrow ? 0 : compact ? -12 : -10;
    const campaignY = narrow ? -106 : compact ? -84 : -172;
    const campaignW = narrow ? 360 : compact ? 640 : 710;
    const campaignH = narrow ? 108 : compact ? 120 : 190;
    this.layoutCampaign(narrow, compact, campaignX, campaignY, campaignW, campaignH);
    const vehicleX = narrow ? -52 : compact ? -104 : -125;
    const vehicleY = narrow ? 4 : compact ? 37 : 60;
    const vehicleW = narrow ? 244 : compact ? 350 : 500;
    const vehicleH = narrow ? 96 : compact ? 126 : 230;
    this.vehicleFrame.setPosition(vehicleX, vehicleY);
    preparationFrame(this.vehicleFrame, vehicleW, vehicleH);
    this.vehicleTitle.setPosition(vehicleX, vehicleY - vehicleH / 2 + 12).setFontSize(narrow ? 12 : compact ? 13 : 16);
    this.vehicleAbility.setPosition(vehicleX, vehicleY + vehicleH / 2 - 30).setFontSize(narrow ? 8 : compact ? 9 : 10);
    // Local content coordinates; the base owns the offscreen renderer and lifecycle.
    this.setPreviewBounds(vehicleX, vehicleY + 1, vehicleW - 12, vehicleH - 44);
    this.loadingLabel?.setOrigin(0.5).setPosition(vehicleX, vehicleY + vehicleH / 2 - 10).setFontSize(narrow ? 10 : compact ? 11 : 13);
    if (this.loadingLabel?.parentContainer === this.content) this.content.bringToTop(this.loadingLabel);
    const rivalW = narrow ? 104 : compact ? 150 : 180;
    this.rivalVehicle.setPosition(narrow ? 128 : compact ? 218 : 275, vehicleY);
    preparationFrame(this.rivalVehicleFrame, rivalW, vehicleH, COLORS.pink);
    this.rivalVehicleTitle.setPosition(0, -vehicleH / 2 + 12).setFontSize(narrow ? 10 : 13);
    this.rivalVehicleSoon.setPosition(0, vehicleH / 2 - 13).setFontSize(narrow ? 12 : 14);
    this.rivalVehicleShape.setScale(narrow ? 0.6 : compact ? 0.65 : 1.5);
    this.rivalPreview?.setPosition(0, 3).setDisplaySize(rivalW - 12, vehicleH - 55);
    this.motor.arrange(narrow ? -92 : compact ? -414 : -500, narrow ? 107 : compact ? 44 : 54,
      narrow ? 176 : compact ? 164 : 180, narrow ? 92 : compact ? 118 : 220);
    this.suspension.arrange(narrow ? 94 : compact ? 382 : 485, narrow ? 84 : compact ? -12 : -10,
      narrow ? 172 : compact ? 160 : 180, narrow ? 44 : compact ? 58 : 84);
    this.armor.arrange(narrow ? 94 : compact ? 382 : 485, narrow ? 132 : compact ? 54 : 90,
      narrow ? 172 : compact ? 160 : 180, narrow ? 44 : compact ? 58 : 84);
    this.modules.forEach((button, i) => {
      if (narrow) button.arrange(i < 3 ? (i - 1) * 122 : (i - 3.5) * 184, i < 3 ? 191 : 250, i < 3 ? 116 : 176, i < 3 ? 58 : 42);
      else button.arrange((i - 2) * (compact ? 178 : 232), compact ? 104 : 232, compact ? 164 : 220, compact ? 50 : 68);
    });
    const startY = narrow ? 292 : compact ? 152 : 296;
    this.startButton.arrange(narrow ? -70 : 0, startY, narrow ? 220 : compact ? 340 : 400, narrow ? 34 : compact ? 38 : 46, true);
    this.eraseButton.label.setText(narrow ? 'APAGAR\nPROGRESSO' : 'APAGAR PROGRESSO');
    this.eraseButton.detail.setText(narrow ? '' : 'RECOMEÇAR DO INÍCIO');
    this.eraseButton.arrange(narrow ? 114 : compact ? -360 : -390, startY,
      narrow ? 128 : compact ? 240 : 270, narrow ? 34 : compact ? 38 : 46);
    this.rewardButton.arrange(narrow ? 0 : compact ? 360 : 390, narrow ? 344 : startY,
      narrow ? 360 : compact ? 260 : 340, narrow ? 44 : compact ? 38 : 46);
    // Reserve feedback space beside START, including on portrait phones.
    this.toast.setPosition(w / 2 + (narrow ? 0 : 350) * this.content.scaleX,
      narrow ? h - 66 : this.content.y + startY * this.content.scaleY);
    this.toast.setFontSize(14).setScale(this.content.scaleX);
  }

  layoutPortrait(panel, frame, portrait, tag, name, x, y, width, height, rival = false) {
    panel.setPosition(x, y);
    preparationFrame(frame, width, height, rival ? COLORS.pink : COLORS.cyan);
    const small = height < 110;
    tag.setPosition(0, -height / 2 + (small ? 9 : 18)).setFontSize(small ? 10 : 13);
    name.setPosition(0, height / 2 - (small ? 10 : 17)).setFontSize(small ? 11 : 14);
    const size = small ? height - 34 : 130;
    if (rival) portrait.setScale(size / 110, size / 110);
    else portrait.setDisplaySize(size, size);
    portrait.setPosition(0, -1);
  }

  layoutCampaign(narrow, compact, x, y, width, height) {
    this.campaign.setPosition(x, y);
    preparationFrame(this.campaignFrame, width, height, '#ffb454');
    this.seasonLabel.setPosition(0, -height / 2 + (narrow ? 10 : 13)).setFontSize(narrow ? 9 : 11);
    if (narrow) {
      this.playerLabel.setPosition(-width / 2 + 14, -height / 2 + 34).setOrigin(0, 0.5).setFontSize(10);
      this.playerName.setPosition(width / 2 - 14, -height / 2 + 34).setOrigin(1, 0.5).setFontSize(12);
      this.playerName.setWordWrapWidth(160);
    } else {
      this.playerLabel.setPosition(-width / 2 + 20, -height / 2 + 40).setOrigin(0, 0.5).setFontSize(compact ? 11 : 13);
      this.playerName.setPosition(-width / 2 + 20, -height / 2 + 65).setOrigin(0, 0.5).setFontSize(compact ? 16 : 19);
      this.playerName.setWordWrapWidth(compact ? 150 : 190);
    }
    this.campaignFields.forEach(({ label, value }, i) => {
      const first = i < 3;
      const fieldX = narrow ? first ? (i - 1) * 118 : (i - 3.5) * 164
        : first ? [-15, compact ? 140 : 135, compact ? 270 : 275][i]
          : compact ? [-15, 175][i - 3] : [-100, 130][i - 3];
      const labelY = narrow ? (first ? -8 : 27) : compact ? (first ? -21 : 22) : (first ? -47 : 22);
      label.setPosition(fieldX, labelY).setFontSize(narrow ? 8 : compact ? 10 : 11);
      value.setPosition(fieldX, labelY + (narrow ? 16 : compact ? 17 : 22)).setFontSize(narrow ? 14 : compact ? 16 : 20);
    });
    const barWidth = width - (narrow ? 28 : 40);
    const barY = height / 2 - 7;
    this.scoreProgress.clear().fillStyle(0x26364a).fillRect(-barWidth / 2, barY, barWidth, 4)
      .fillStyle(0xffb454).fillRect(-barWidth / 2, barY, barWidth * Math.min(1, this.raceState.score / this.raceState.targetScore), 4);
    this.scoreStatus.setPosition(0, height / 2 - 19).setFontSize(9).setVisible(!narrow && !compact);
  }
}
