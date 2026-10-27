import { GarageScene } from './GarageScene.js';
import { getSelectedCharacter } from '../data/characters.js';
import { getSelectedVehicle, VEHICLE_ATTRIBUTES, getVehicleDisplayName } from '../data/vehicles.js';
import { getRaceState } from '../data/raceState.js';
import { characterPortrait } from '../visuals/characterPortrait.js';
import { COLORS, SCENES, text } from '../ui/theme.js';
import { PreparationButton, preparationFrame, createRivalPortrait, createStatPanel, bindPreparationKeys } from '../ui/PreparationModules.js';

const number = value => Number(value).toLocaleString('pt-BR');

export class RacePreparationScene extends GarageScene {
  constructor() { super(SCENES.preparation); }

  create() {
    this.character = getSelectedCharacter(this.registry);
    this.selection = getSelectedVehicle(this.registry);
    if (!this.character || !this.selection) {
      this.scene.start(this.character ? SCENES.vehicles : SCENES.characters);
      return;
    }
    this.raceState = getRaceState(this.registry);
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
    this.rivalName = text(this, 0, 0, 'EM BREVE', 14, COLORS.muted, true);
    this.rivalPanel.add([this.rivalFrame, this.rivalPortrait, this.rivalTag, this.rivalName]);
    this.createCampaign();
    this.vehicleFrame = this.add.graphics();
    this.vehicleTitle = text(this, 0, 0, `${getVehicleDisplayName(this.game.garageResources?.source)} / ${this.selection.paint.name}`, 16, this.selection.paint.color, true);
    this.rivalVehicle = this.add.container();
    this.rivalVehicleFrame = this.add.graphics();
    this.rivalVehicleTitle = text(this, 0, 0, 'VEÍCULO RIVAL', 13, '#a7b6cb');
    this.rivalVehicleSoon = text(this, 0, 0, 'EM BREVE', 14, COLORS.muted);
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
    this.armor = statPanel('BLINDAGEM', ['armor']);
    this.createActions();
    this.content.add([this.title, this.stationKicker, this.pilotPanel, this.rivalPanel, this.campaign, this.vehicleFrame,
      this.vehicleTitle, this.rivalVehicle, this.motor, this.suspension, this.armor, ...this.modules, this.startButton]);
    // Keep the base's ready/error feedback; handle an uncaught loader rejection too.
    const loadingLabel = this.loadingLabel;
    this.mountGarage({ mode: 'preparation', paintId: this.selection.paint.id }).catch(() => {
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
    this.seasonLabel = text(this, 0, 0, 'TEMPORADA  /  PAINEL DE EQUIPE', 11, '#ffb454', true).setPadding(0);
    this.playerLabel = text(this, 0, 0, state.player, 14, '#71f6ff', true).setPadding(0);
    this.playerName = text(this, 0, 0, this.character.name, 23, COLORS.white, true).setPadding(0);
    this.campaignFields = [
      ['CRÉDITOS', number(state.credits)], ['DIVISÃO', state.division],
      ['CORRIDAS', `${state.racesCompleted} de ${state.racesTotal}`],
      ['PONTOS NECESSÁRIOS', number(state.requiredPoints)], ['PONTOS ATUAIS', number(state.points)],
    ].map(([label, value]) => ({
      label: text(this, 0, 0, label, 12, COLORS.muted).setPadding(0),
      value: text(this, 0, 0, String(value), 21, COLORS.white, true).setPadding(0),
    }));
    this.campaign.add([this.campaignFrame, this.seasonLabel, this.playerLabel, this.playerName,
      ...this.campaignFields.flatMap(field => [field.label, field.value])]);
  }

  onGarageReady() {
    // The model sits above the panel's opaque background, below its labels.
    this.content.moveTo(this.preview, this.content.getIndex(this.vehicleFrame) + 1);
    this.vehicleTitle.setText(`${getVehicleDisplayName(this.garageView.resources.source)} / ${this.selection.paint.name}`);
  }

  createActions() {
    const definitions = [
      ['PISTA / CORRIDA', 'track', () => this.showSoon()],
      ['MELHORIAS', 'upgrade', () => this.showSoon()],
      ['REPAROS', 'repair', () => this.showSoon()],
      ['VEÍCULO', 'vehicle', () => this.goTo(SCENES.vehicles)],
      ['SAIR / VOLTAR', 'back', () => this.goTo(SCENES.vehicles)],
    ];
    this.modules = definitions.map(([label, icon, onActivate], index) => new PreparationButton(this, {
      label, icon, detail: index < 3 ? 'Em breve' : index === 3 ? 'SELEÇÃO' : 'ESC',
      onSelect: () => this.focusAction(index), onActivate,
    }));
    this.backButton = this.modules[4];
    this.startButton = new PreparationButton(this, {
      label: 'START RACE', icon: 'start', onSelect: () => this.focusAction(5),
      onActivate: () => this.goTo(SCENES.development),
    });
  }

  focusAction(index) {
    if (this.transitioning) return;
    this.focusIndex = (index + 6) % 6;
    [...this.modules, this.startButton].forEach((button, i) => button.setSelected(i === this.focusIndex));
  }

  handleKey(event) {
    if (event.key === 'Escape') this.goTo(SCENES.vehicles);
    else if (event.key === 'Enter' || event.key === ' ') [...this.modules, this.startButton][this.focusIndex].onActivate();
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
    const designH = narrow ? 550 : compact ? 330 : 700;
    this.content.setPosition(w / 2, (h + 6) / 2).setScale(Math.min((w - 24) / designW, (h - 114) / designH, 1.15));
    const titleY = narrow ? -258 : compact ? -151 : -319;
    this.title.setFontSize(narrow ? 19 : compact ? 20 : 25);
    this.title.setPosition(narrow ? -this.title.width / 2 : compact ? -365 : -510, titleY);
    this.stationKicker.setPosition(narrow ? 0 : compact ? 370 : 510, titleY).setFontSize(narrow ? 9 : 11).setVisible(!narrow);
    const portraitY = narrow ? -207 : compact ? -84 : -174;
    const portraitW = narrow ? 104 : compact ? 142 : 180;
    const portraitH = narrow ? 76 : compact ? 104 : 178;
    const pilotX = narrow ? -126 : compact ? -414 : -500;
    const rivalX = narrow ? 128 : compact ? 430 : 495;
    this.layoutPortrait(this.pilotPanel, this.pilotFrame, this.pilotPortrait, this.pilotTag, this.pilotName,
      pilotX, portraitY, portraitW, portraitH);
    this.layoutPortrait(this.rivalPanel, this.rivalFrame, this.rivalPortrait, this.rivalTag, this.rivalName,
      rivalX, portraitY - (narrow ? 4 : 12), portraitW, portraitH, true);
    const campaignX = narrow ? 0 : compact ? -12 : -10;
    const campaignY = narrow ? -119 : compact ? -84 : -172;
    const campaignW = narrow ? 360 : compact ? 640 : 710;
    const campaignH = narrow ? 126 : compact ? 120 : 190;
    this.layoutCampaign(narrow, compact, campaignX, campaignY, campaignW, campaignH);
    const vehicleX = narrow ? -52 : compact ? -104 : -125;
    const vehicleY = narrow ? -8 : compact ? 37 : 60;
    const vehicleW = narrow ? 244 : compact ? 350 : 500;
    const vehicleH = narrow ? 104 : compact ? 126 : 230;
    this.vehicleFrame.setPosition(vehicleX, vehicleY);
    preparationFrame(this.vehicleFrame, vehicleW, vehicleH);
    this.vehicleTitle.setPosition(vehicleX, vehicleY - vehicleH / 2 + 12).setFontSize(narrow ? 12 : compact ? 13 : 16);
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
    this.motor.arrange(narrow ? -92 : compact ? -414 : -500, narrow ? 81 : compact ? 44 : 54,
      narrow ? 176 : compact ? 164 : 180, narrow ? 92 : compact ? 118 : 220);
    this.suspension.arrange(narrow ? 94 : compact ? 382 : 485, narrow ? 57 : compact ? -12 : -10,
      narrow ? 172 : compact ? 160 : 180, narrow ? 44 : compact ? 58 : 84);
    this.armor.arrange(narrow ? 94 : compact ? 382 : 485, narrow ? 105 : compact ? 54 : 90,
      narrow ? 172 : compact ? 160 : 180, narrow ? 44 : compact ? 58 : 84);
    this.modules.forEach((button, i) => {
      if (narrow) button.arrange(i < 3 ? (i - 1) * 122 : (i - 3.5) * 184, i < 3 ? 162 : 218, i < 3 ? 116 : 176, i < 3 ? 58 : 42);
      else button.arrange((i - 2) * (compact ? 178 : 232), compact ? 104 : 232, compact ? 164 : 220, compact ? 50 : 68);
    });
    const startY = narrow ? 258 : compact ? 152 : 296;
    this.startButton.arrange(narrow ? -70 : 0, startY, narrow ? 220 : compact ? 340 : 400, narrow ? 34 : compact ? 38 : 46, true);
    // Reserve feedback space beside START, including on portrait phones.
    this.toast.setPosition(w / 2 + (narrow ? 112 : 350) * this.content.scaleX, this.content.y + startY * this.content.scaleY);
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
      const fieldX = narrow
        ? first ? (i - 1) * 118 : (i - 3.5) * 164
        : first ? (i - 1) * (compact ? 174 : 180) : (i - 3.5) * (compact ? 250 : 270);
      const labelY = narrow ? (first ? -8 : 30) : (first ? -20 : 42);
      label.setPosition(fieldX, labelY).setFontSize(narrow ? 8 : compact ? 10 : 11);
      value.setPosition(fieldX, labelY + (narrow ? 16 : 22)).setFontSize(narrow ? 14 : compact ? 18 : 20);
    });
  }
}
