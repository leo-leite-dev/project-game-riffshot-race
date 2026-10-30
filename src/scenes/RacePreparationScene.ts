import { GarageScene } from './GarageScene.ts';
import { getSelectedCharacter } from '../data/characters.ts';
import { getSelectedVehicle, STATION_PRIMARY_ATTRIBUTES, STATION_DETAIL_ATTRIBUTES, RIVAL_VEHICLE_ID, getVehicleById, getVehicleDisplayName } from '../data/vehicles.ts';
import { getRaceState } from '../data/raceState.ts';
import { characterPortrait } from '../visuals/characterPortrait.ts';
import { COLORS, SCENES, text } from '../ui/theme.ts';
import { bindPreparationKeys } from '../ui/PreparationModules.ts';
import { StationButton as PreparationButton } from '../ui/StationButton.ts';
import { createStationStatPanel as createStatPanel } from '../ui/StationStats.ts';
import { StationSettings } from '../ui/StationSettings.ts';
import { createStationBackdrop, createStationTitle, createOpeningRivalPortrait } from '../visuals/preparation/StationArt.ts';
import { layoutStation } from '../ui/StationLayout.ts';
import { OPENING_RIVAL } from '../data/openingRival.ts';
import type Phaser from 'phaser';
import type { ChampionshipState } from '../championship/championshipState.ts';
import type { Vehicle, PAINTS } from '../data/vehicles.ts';

type Selection = { vehicle: Readonly<Vehicle>; paint: (typeof PAINTS)[number] };
type PrepButton = PreparationButton;
type PrepStatPanel = Phaser.GameObjects.Container & { arrange: (x: number, y: number, width: number, height: number) => unknown };
type LocalTuningEditor = { open(): void };
const number = (value: number) => Number(value).toLocaleString('pt-BR');

export class RacePreparationScene extends GarageScene {
  declare character: NonNullable<ReturnType<typeof getSelectedCharacter>>;
  declare selection: Selection;
  declare raceState: ChampionshipState;
  declare erasingProgress: boolean;
  declare stationBackdrop: Phaser.GameObjects.Image;
  declare title: Phaser.GameObjects.Image;
  declare settings: StationSettings & { button: HTMLButtonElement };
  declare vehicleTuningEditor: LocalTuningEditor | null;
  declare stationKicker: Phaser.GameObjects.Text;
  declare pilotPanel: Phaser.GameObjects.Container;
  declare pilotFrame: Phaser.GameObjects.Graphics;
  declare pilotPortrait: Phaser.GameObjects.Image;
  declare pilotTag: Phaser.GameObjects.Text;
  declare pilotName: Phaser.GameObjects.Text;
  declare rivalPanel: Phaser.GameObjects.Container;
  declare rivalFrame: Phaser.GameObjects.Graphics;
  declare rivalPortrait: Phaser.GameObjects.Image;
  declare rivalTag: Phaser.GameObjects.Text;
  declare rivalName: Phaser.GameObjects.Text;
  declare vehicleFrame: Phaser.GameObjects.Graphics;
  declare vehicleTitle: Phaser.GameObjects.Text;
  declare rivalVehicle: Phaser.GameObjects.Container;
  declare rivalVehicleFrame: Phaser.GameObjects.Graphics;
  declare rivalVehicleTitle: Phaser.GameObjects.Text;
  declare rivalVehicleSoon: Phaser.GameObjects.Text;
  declare rivalVehicleShape: Phaser.GameObjects.Graphics;
  declare rivalPreview: Phaser.GameObjects.Image | null;
  declare statValues: Record<string, Phaser.GameObjects.Text>;
  declare motor: PrepStatPanel;
  declare chassis: PrepStatPanel;
  declare armor: PrepStatPanel;
  declare vehicleAbility: Phaser.GameObjects.Text;
  declare playerInfo: Phaser.GameObjects.Container;
  declare rivalInfo: Phaser.GameObjects.Container;
  declare attributePopup: Phaser.GameObjects.Container;
  declare attributePopupTitle: Phaser.GameObjects.Text;
  declare attributePopupRows: Phaser.GameObjects.Text[];
  declare attributePopupValues: Phaser.GameObjects.Text[];
  declare campaign: Phaser.GameObjects.Container;
  declare campaignFrame: Phaser.GameObjects.Graphics;
  declare campaignDividers: Phaser.GameObjects.Graphics;
  declare seasonLabel: Phaser.GameObjects.Text;
  declare playerLabel: Phaser.GameObjects.Text;
  declare playerName: Phaser.GameObjects.Text;
  declare campaignFields: { label: Phaser.GameObjects.Text; value: Phaser.GameObjects.Text }[];
  declare scoreProgress: Phaser.GameObjects.Graphics;
  declare scoreStatus: Phaser.GameObjects.Text;
  declare modules: PrepButton[];
  declare backButton: PrepButton;
  declare startButton: PrepButton;
  declare rewardButton: PrepButton;
  declare focusIndex: number;
  declare toast: Phaser.GameObjects.Text;
  declare toastTimer: Phaser.Time.TimerEvent | undefined;
  constructor() { super(SCENES.preparation); }

  create() {
    document.body.classList.add('team-station-active');
    this.events.once('shutdown', () => document.body.classList.remove('team-station-active'));
    if (this.game.championship.state.pendingResult) { this.scene.start(SCENES.results); return; }
    this.character = getSelectedCharacter(this.registry)!;
    this.selection = getSelectedVehicle(this.registry)!;
    if (!this.character || !this.selection) {
      this.scene.start(this.character ? SCENES.vehicles : SCENES.characters);
      return;
    }
    this.raceState = getRaceState(this.registry);
    this.erasingProgress = false;
    this.vehicleTuningEditor = null;
    this.createGarageShell('RIFFSHOT RACING. Estação de Equipe. Tab ou setas navegam; Enter confirma. A engrenagem abre Configurações, som e apagar progresso. Escape volta à loja e garagem.');
    this.stationBackdrop = createStationBackdrop(this).setDepth(-8);
    this.backdrop.image.setVisible(false); this.backdrop.motion.setVisible(false);
    this.title = createStationTitle(this);
    const onVehicleTuning = import.meta.env.DEV ? () => {
      this.settings?.close();
      if (this.vehicleTuningEditor) { this.vehicleTuningEditor.open(); return; }
      void import('../ui/VehicleTuningEditor.ts').then(({ VehicleTuningEditor }) => {
        if (!this.sys.isActive()) return;
        this.vehicleTuningEditor = new VehicleTuningEditor(this);
        this.vehicleTuningEditor.open();
      }).catch(() => this.announce('O editor local de veículos não pôde ser aberto.'));
    } : undefined;
    this.settings = new StationSettings(this, {
      onErase: () => this.requestEraseProgress(),
      ...(onVehicleTuning ? { onVehicleTuning } : {}),
    }) as StationSettings & { button: HTMLButtonElement };
    this.stationKicker = text(this, 0, 0, 'PIT CONTROL  /  TELEMETRIA ORBITAL', 11, '#71f6ff');
    this.pilotPanel = this.add.container();
    this.pilotFrame = this.add.graphics();
    this.pilotPortrait = this.add.image(0, 0, characterPortrait(this, this.character));
    this.pilotTag = text(this, 0, 0, 'PILOTO', 13, '#71f6ff');
    this.pilotName = text(this, 0, 0, this.character.name, 14, COLORS.white, true);
    this.pilotPanel.add([this.pilotFrame, this.pilotPortrait, this.pilotTag, this.pilotName]);
    this.rivalPanel = this.add.container();
    this.rivalFrame = this.add.graphics();
    this.rivalPortrait = createOpeningRivalPortrait(this);
    this.rivalTag = text(this, 0, 0, 'RIVAL', 13, '#ff78ae');
    this.rivalName = text(this, 0, 0, OPENING_RIVAL.name, 14, COLORS.white, true);
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
    const rivalVehicle = getVehicleById(RIVAL_VEHICLE_ID)!;
    this.motor = createStatPanel(this, 'PLAYER / ATRIBUTOS', STATION_PRIMARY_ATTRIBUTES, this.selection.vehicle.stats, this.statValues, 0x19eaff);
    this.chassis = createStatPanel(this, 'RIVAL / ATRIBUTOS', STATION_PRIMARY_ATTRIBUTES, rivalVehicle.stats, {}, 0xff3d68);
    this.createAttributeInfo();
    this.vehicleAbility = text(this, 0, 0, this.selection.vehicle.ability.nitroCharges
      ? 'NITRO / 2 CARGAS' : this.selection.vehicle.id === 'iron-bastion' ? 'BLINDAGEM REFORÇADA' : 'TRAÇÃO PRECISA',
    10, '#ffb454', true);
    this.createActions();
    this.content.add([this.title, this.stationKicker, this.pilotPanel, this.rivalPanel, this.campaign, this.vehicleFrame,
      this.vehicleTitle, this.vehicleAbility, this.rivalVehicle, this.motor, this.chassis,
      this.playerInfo, this.rivalInfo, this.attributePopup, ...this.modules, this.startButton, this.rewardButton]);
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

  createAttributeInfo() {
    const makeInfo = (accent: number, title: string, stats: Record<string, number>) => {
      const button = this.add.container();
      const icon = this.add.graphics().fillStyle(0x03111b, 0.98).lineStyle(3, accent, 1).fillCircle(0, 0, 20)
        .strokeCircle(0, 0, 20);
      const label = text(this, 0, 0, 'i', 25, '#ffffff', true).setOrigin(0.5);
      button.add([icon, label]).setSize(44, 44);
      button.setInteractive({ useHandCursor: true });
      button.on('pointerover', () => this.showAttributeInfo(title, stats, accent));
      button.on('pointerout', () => this.attributePopup.setVisible(false));
      return button;
    };
    const rival = getVehicleById(RIVAL_VEHICLE_ID)!;
    this.playerInfo = makeInfo(0x19eaff, 'ATRIBUTOS DO SEU VEÍCULO', this.selection.vehicle.stats as Record<string, number>);
    this.rivalInfo = makeInfo(0xff3d68, 'ATRIBUTOS DO RIVAL', rival.stats as Record<string, number>);
    this.attributePopup = this.add.container().setVisible(false).setDepth(40);
    const frame = this.add.graphics();
    const segments = this.add.graphics();
    this.attributePopupTitle = text(this, 0, 0, '', 15, '#71f6ff', true).setOrigin(0.5);
    this.attributePopupRows = STATION_DETAIL_ATTRIBUTES.map(() => text(this, 0, 0, '', 13, '#e8f7ff').setOrigin(0, 0.5));
    this.attributePopupValues = STATION_DETAIL_ATTRIBUTES.map(() => text(this, 0, 0, '', 12, '#f0f6fc', true).setOrigin(1, 0.5));
    this.attributePopup.add([frame, segments, this.attributePopupTitle, ...this.attributePopupRows, ...this.attributePopupValues]);
    this.attributePopup.setData('frame', frame);
    this.attributePopup.setData('segments', segments);
  }

  showAttributeInfo(title: string, stats: Record<string, number>, accent: number) {
    const popup = this.attributePopup;
    const frame = popup.getData('frame') as Phaser.GameObjects.Graphics;
    const segments = popup.getData('segments') as Phaser.GameObjects.Graphics;
    const width = 310, height = 170;
    frame.clear().fillStyle(0x06121c, 0.98).lineStyle(2, accent, 1)
      .fillRoundedRect(-width / 2, -height / 2, width, height, 8)
      .strokeRoundedRect(-width / 2, -height / 2, width, height, 8);
    segments.clear();
    this.attributePopupTitle.setText(title).setPosition(0, -height / 2 + 22).setFontSize(13);
    STATION_DETAIL_ATTRIBUTES.forEach((attribute, index) => {
      const y = -height / 2 + 52 + index * 25;
      const value = stats[attribute.key];
      const label = attribute.key === 'speed' ? 'VELOCIDADE' : attribute.key === 'acceleration' ? 'ACELERAÇÃO'
        : attribute.key === 'suspension' ? 'SUSPENSÃO' : attribute.label;
      this.attributePopupRows[index].setText(label).setFontSize(11).setPosition(-width / 2 + 12, y);
      this.attributePopupValues[index].setText(Number.isFinite(value) ? String(value) : '—').setPosition(width / 2 - 12, y);
      const barX = 18, barY = y - 6, slotWidth = 12, slotHeight = 11, gap = 3;
      for (let slot = 0; slot < 5; slot += 1) {
        const x = barX + slot * (slotWidth + gap);
        const fill = Number.isFinite(value) ? Math.max(0, Math.min(1, (value - slot * 20) / 20)) : 0;
        segments.fillStyle(0x142632).fillRect(x, barY, slotWidth, slotHeight)
          .lineStyle(1, 0x425967, 0.75).strokeRect(x, barY, slotWidth, slotHeight);
        if (fill > 0) segments.fillStyle(accent, 0.25).fillRect(x - 1, barY - 1, slotWidth * fill + 2, slotHeight + 2)
          .fillStyle(accent).fillRect(x, barY, slotWidth * fill, slotHeight)
          .fillStyle(0xffe49d, 0.75).fillRect(x + 1, barY + 1, Math.max(0, slotWidth * fill - 2), 2);
      }
    });
    popup.setPosition(accent === 0x19eaff ? -350 : 350, 95).setVisible(true);
    this.content.bringToTop(popup);
  }

  createCampaign() {
    const state = this.raceState;
    this.campaign = this.add.container();
    this.campaignFrame = this.add.graphics();
    this.campaignDividers = this.add.graphics();
    this.seasonLabel = text(this, 0, 0, state.attempt.status === 'qualified'
      ? state.rivalRewardChoice ? 'DESAFIO CONCLUÍDO / PRÊMIO RECEBIDO' : 'META ATINGIDA / VOCÊ ESCOLHE QUANDO AVANÇAR'
      : `TEMPORADA / TENTATIVA ${state.attempt.number}`, 11, '#ffb454', true).setPadding(0);
    this.playerLabel = text(this, 0, 0, 'PLAYER 1', 14, '#71f6ff', true).setPadding(0);
    this.playerName = text(this, 0, 0, this.character.name, 23, COLORS.white, true).setPadding(0);
    this.campaignFields = [
      ['MONEY', `$ ${number(state.money)}`], ['DIVISÃO', state.division],
      ['CORRIDAS', `${state.racesRun} DE ${state.maxRaces}`],
      ['PONTUAÇÃO NECESSÁRIA', number(state.targetScore)], ['PONTUAÇÃO ATUAL', number(state.score)],
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
      this.scoreProgress, this.campaignDividers, this.scoreStatus,
      ...this.campaignFields.flatMap(field => [field.label, field.value])]);
  }

  onGarageReady() {
    // The model sits above the panel's opaque background, below its labels.
    this.content.moveTo(this.preview!, this.content.getIndex(this.vehicleFrame) + 1);
      this.vehicleTitle.setText(`${getVehicleDisplayName(this.selection.vehicle)} / ${this.selection.paint.name}`);
    this.mountRivalPreview().catch(() => {
      // The player's live preview must keep working if this optional thumbnail fails.
      if (this.alive) this.rivalVehicleShape.setVisible(true);
    });
  }

  async mountRivalPreview(): Promise<void> {
    const version = this.loadVersion;
    const view = this.garageView!;
    await view.resources.load([RIVAL_VEHICLE_ID]);
    if (!this.alive || version !== this.loadVersion) return;
    const world = await this.createGarageWorld(view.resources,
      { mode: 'preparation', vehicleId: RIVAL_VEHICLE_ID, paintId: 'inferno', stationAccent: 'rival' }, version);
    if (!world) return;
    try {
      world.resize(460, 300);
      world.update(0);
      const key = 'preparation-rival-preview';
      const texture = this.textures.createCanvas(key, world.width, world.height);
      texture!.context.drawImage(world.resources.renderer.domElement, 0, 0);
      texture!.refresh();
      this.rivalPreview = this.add.image(0, 0, key);
      this.rivalVehicle.addAt(this.rivalPreview, 1);
      this.rivalVehicleShape.setVisible(false);
      this.events.once('shutdown', () => { this.rivalPreview = null; this.textures.remove(key); });
      this.resizeShell();
    } finally {
      world.destroy();
      // Both previews share one renderer; restore the live player's dimensions.
      view.resources.renderer.setSize(view.width, view.height, false);
      this.applyPreviewBounds();
    }
  }

  createActions() {
    const definitions: [string, string, () => void][] = [
      ['PISTA / CORRIDA', 'track', () => this.startNextRace()],
      ['MELHORIAS', 'upgrade', () => this.showSoon()],
      ['REPAROS', 'repair', () => this.showSoon()],
      ['LOJA / GARAGEM', 'vehicle', () => this.goTo(SCENES.vehicles)],
      ['SAIR / VOLTAR', 'back', () => this.goTo(SCENES.vehicles)],
    ];
    this.modules = definitions.map(([label, icon, onActivate], index) => new PreparationButton(this, {
      label, icon, detail: index === 0 ? 'CIRCUITO' : index < 3 ? 'Em breve' : index === 3 ? 'COMPRAR OU EQUIPAR' : 'ESC',
      onSelect: () => this.focusAction(index), onActivate,
    }));
    this.backButton = this.modules[4];
    this.startButton = new PreparationButton(this, {
      label: 'START RACE', icon: 'start', onSelect: () => this.focusAction(5),
      onActivate: () => this.startNextRace(),
    });
    this.startButton.detail.setText('CORRIDA');
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
    if (this.transitioning || this.erasingProgress || !this.settings?.isOpen) return;
    this.erasingProgress = true;
    const confirmed = window.confirm('APAGAR TODO O PROGRESSO?\n\nDinheiro, SCORE, corridas, carros comprados, prêmio do rival, melhorias, histórico, piloto, veículo e pintura serão apagados, incluindo os backups do campeonato.\n\nEsta ação não pode ser desfeita. Deseja voltar ao início com uma carreira nova?');
    if (!confirmed) {
      this.erasingProgress = false;
      this.settings.setFeedback('Exclusão cancelada. Seu progresso foi preservado.');
      this.announce('Exclusão cancelada. Seu progresso foi preservado.');
      return;
    }
    if (!this.game.championship.eraseProgress()) {
      this.erasingProgress = false;
      this.settings.showError(`Não foi possível concluir a exclusão. ${this.game.championship.warning ?? 'Seu progresso foi preservado.'}`);
      this.toast.setText('NÃO FOI POSSÍVEL APAGAR O SAVE. VEJA O AVISO.').setAlpha(1);
      return;
    }
    this.announce('Progresso apagado. Voltando à abertura.');
    this.settings.close();
    this.goTo(SCENES.menu);
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

  focusAction(index: number): void {
    if (this.transitioning || this.settings?.isOpen) return;
    const count = this.rewardButton.visible ? 8 : 7;
    this.focusIndex = (index + count) % count;
    [...this.modules, this.startButton].forEach((button, i) => button.setSelected(i === this.focusIndex));
    this.rewardButton.setSelected(this.focusIndex === 7);
     this.settings.button.dataset.keyboardSelected = String(this.focusIndex === 6);
    if (this.focusIndex === 6) this.announce('Configurações. Enter abre som e gerenciamento de progresso.');
  }

  handleKey(event: KeyboardEvent): void {
    if (this.settings?.isOpen) return;
    if (event.key === 'Escape') this.goTo(SCENES.vehicles);
    else if (event.key === 'Enter' || event.key === ' ') {
      if (this.focusIndex === 6) this.settings.open();
      else if (this.focusIndex === 7) this.rewardButton.onActivate();
      else [...this.modules, this.startButton][this.focusIndex].onActivate();
    }
    else {
      const step = event.key === 'Tab' ? (event.shiftKey ? -1 : 1)
        : { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -1, ArrowDown: 1 }[event.key];
      if (step) this.focusAction(this.focusIndex + step);
    }
  }

  layout(w: number, h: number): void { layoutStation(this, w, h); }
}
