import { GarageScene } from './GarageScene.ts';
import { getSelectedCharacter } from '../data/characters.ts';
import { getSelectedVehicle, VEHICLE_ATTRIBUTES, RIVAL_VEHICLE_ID, getVehicleDisplayName } from '../data/vehicles.ts';
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
const number = (value: number) => Number(value).toLocaleString('pt-BR');

export class RacePreparationScene extends GarageScene {
  declare character: NonNullable<ReturnType<typeof getSelectedCharacter>>;
  declare selection: Selection;
  declare raceState: ChampionshipState;
  declare erasingProgress: boolean;
  declare stationBackdrop: Phaser.GameObjects.Image;
  declare title: Phaser.GameObjects.Image;
  declare settings: StationSettings & { button: HTMLButtonElement };
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
  declare suspension: PrepStatPanel;
  declare armor: PrepStatPanel;
  declare vehicleAbility: Phaser.GameObjects.Text;
  declare campaign: Phaser.GameObjects.Container;
  declare campaignFrame: Phaser.GameObjects.Graphics;
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
    if (this.game.championship.state.pendingResult) { this.scene.start(SCENES.results); return; }
    this.character = getSelectedCharacter(this.registry)!;
    this.selection = getSelectedVehicle(this.registry)!;
    if (!this.character || !this.selection) {
      this.scene.start(this.character ? SCENES.vehicles : SCENES.characters);
      return;
    }
    this.raceState = getRaceState(this.registry);
    this.erasingProgress = false;
    this.createGarageShell('RIFFSHOT RACING. Estação de Equipe. Tab ou setas navegam; Enter confirma. A engrenagem abre Configurações, som e apagar progresso. Escape volta à loja e garagem.');
    this.stationBackdrop = createStationBackdrop(this).setDepth(-8);
    this.backdrop.image.setVisible(false); this.backdrop.motion.setVisible(false);
    this.title = createStationTitle(this);
    this.settings = new StationSettings(this, { onErase: () => this.requestEraseProgress() }) as StationSettings & { button: HTMLButtonElement };
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
    const statPanel = (heading: string, keys: string[]) => createStatPanel(this, heading, VEHICLE_ATTRIBUTES.filter(item => keys.includes(item.key)), this.selection.vehicle.stats, this.statValues);
    this.motor = statPanel('MOTOR', ['speed', 'acceleration']);
    this.suspension = statPanel('SUSPENSÃO', ['control']);
    this.armor = statPanel('RESISTÊNCIA', ['armor']);
    this.vehicleAbility = text(this, 0, 0, this.selection.vehicle.ability.nitroCharges
      ? 'NITRO / 2 CARGAS' : this.selection.vehicle.id === 'iron-bastion' ? 'BLINDAGEM REFORÇADA' : 'TRAÇÃO PRECISA',
    10, '#ffb454', true);
    this.createActions();
    this.content.add([this.title, this.stationKicker, this.pilotPanel, this.rivalPanel, this.campaign, this.vehicleFrame,
      this.vehicleTitle, this.vehicleAbility, this.rivalVehicle, this.motor, this.suspension, this.armor, ...this.modules, this.startButton, this.rewardButton]);
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
      this.scoreProgress, this.scoreStatus,
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
