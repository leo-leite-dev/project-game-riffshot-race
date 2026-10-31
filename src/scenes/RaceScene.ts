import { GarageScene } from './GarageScene.ts';
import { CHARACTERS, getSelectedCharacter } from '../data/characters.ts';
import { INITIAL_VEHICLES, RIVAL_VEHICLE_ID, getSelectedVehicle } from '../data/vehicles.ts';
import { DIFFICULTIES } from '../data/raceDifficulty.ts';
import { getTrackById } from '../data/raceTracks.ts';
import { RaceSimulation } from '../race/RaceSimulation.ts';
import { loadDevRaceAIBonus } from '../race/DevRaceAIBonus.ts';
import { PlayerController } from '../race/PlayerController.ts';
import { RaceCanvasLayer } from '../visuals/race/RaceCanvasLayer.ts';
import { DEFAULT_RACE_CAMERA_MODE, RACE_CAMERA_MODES } from '../data/raceCameras.ts';
import { COLORS, SCENES, text } from '../ui/theme.ts';
import { RaceEngineAudio } from '../audio/RaceEngineAudio.ts';
import { RaceEffectsAudio } from '../audio/RaceEffectsAudio.ts';
import { OPENING_RIVAL } from '../data/openingRival.ts';
import { characterPortrait } from '../visuals/characterPortrait.ts';
import { drawHudPlate } from '../ui/RaceHudArt.ts';
import { RadioRaceWidget } from '../ui/RadioRaceWidget.ts';
import Phaser from 'phaser';
import type { Championship } from '../championship/Championship.ts';
import type { ChampionshipResult } from '../championship/championshipState.ts';
import type { RaceDifficulty, RaceParticipant, RacePilot, RenderPose } from '../race/RaceSimulation.ts';
import type { RaceWorld } from '../visuals/race/RaceWorld.ts';
import type { GarageResources } from '../visuals/garage/GarageResources.ts';
import type { GarageOptions } from './GarageScene.ts';
import type { Vehicle } from '../data/vehicles.ts';

export class RaceScene extends GarageScene {
  declare game: Phaser.Game & { championship: Championship };
  declare character: NonNullable<ReturnType<typeof getSelectedCharacter>>;
  declare vehicleSelection: { vehicle: Readonly<Vehicle>; paint: (typeof import('../data/vehicles.ts').PAINTS)[number] };
  declare difficulty: RaceDifficulty;
  declare track: NonNullable<ReturnType<typeof getTrackById>>;
  declare diagnosticsAvailable: boolean;
  declare diagnosticsEnabled: boolean;
  declare speedBarSegments: number;
  declare simulation: RaceSimulation;
  declare ready: boolean;
  declare simulationStarted: boolean;
  /** Kept as a hidden compatibility hook for the existing combat test harness; no countdown is displayed. */
  declare countdownLabel: Phaser.GameObjects.Text;
  declare raceLayer: RaceCanvasLayer | null;
  declare garageView: RaceWorld | null;
  declare raceId: string;
  declare attemptId: string;
  declare startPending: boolean;
  declare countdownElapsed: number;
  declare hudElapsed: number;
  declare lastSimulationTime: number | null;
  declare resultRecorded: boolean;
  declare presentationMode: 'direct' | 'texture';
  declare playerController: PlayerController;
  declare engineAudio: RaceEngineAudio;
  declare effectsAudio: RaceEffectsAudio;
  declare radioWidget: RadioRaceWidget;
  declare cameraNoticeTimer: Phaser.Time.TimerEvent | undefined;
  declare hudFrame: Phaser.GameObjects.Graphics;
  declare hudLayer: Phaser.GameObjects.Container;
  declare hudLayout: {
    map: { x: number; y: number; width: number; height: number };
    pilot: { x: number; y: number; width: number; height: number };
    lap: { x: number; y: number; width: number; height: number };
    compact: boolean;
  };
  declare trackLabel: Phaser.GameObjects.Text;
  declare difficultyLabel: Phaser.GameObjects.Text;
  declare positionLabel: Phaser.GameObjects.Text;
  declare lapLabel: Phaser.GameObjects.Text;
  declare lapFrame: Phaser.GameObjects.Graphics;
  declare lapPips: Phaser.GameObjects.Graphics;
  declare speedLabel: Phaser.GameObjects.Text;
  declare speedValue: Phaser.GameObjects.Text;
  declare playerLabel: Phaser.GameObjects.Text;
  declare vehicleStatus: Phaser.GameObjects.Text;
  declare healthOrbs: Phaser.GameObjects.Graphics;
  declare playerHudFrame: Phaser.GameObjects.Graphics;
  declare playerHudPortrait: Phaser.GameObjects.Image;
  declare lifeLabel: Phaser.GameObjects.Text;
  declare nitroLabel: Phaser.GameObjects.Text;
  declare lifeValue: Phaser.GameObjects.Text;
  declare nitroValue: Phaser.GameObjects.Text;
  declare nitroBars: Phaser.GameObjects.Graphics;
  declare speedBars: Phaser.GameObjects.Graphics;
  declare leaderFrame: Phaser.GameObjects.Graphics;
  declare leaderHighlight: Phaser.GameObjects.Graphics;
  declare leaderCars: Phaser.GameObjects.Graphics;
  declare leaderBounds: { x: number; y: number; width: number; rowHeight: number };
  declare leaderRows: Phaser.GameObjects.Text[];
  declare minimapFrame: Phaser.GameObjects.Graphics;
  declare minimap: Phaser.GameObjects.Graphics;
  declare minimapTitle: Phaser.GameObjects.Text;
  declare minimapSubtitle: Phaser.GameObjects.Text;
  declare weaponFrame: Phaser.GameObjects.Graphics;
  declare weaponLabels: Phaser.GameObjects.Text[];
  declare weaponNames: Phaser.GameObjects.Text[];
  declare weaponIcons: Phaser.GameObjects.Image[];
  declare controlsHint: Phaser.GameObjects.Text;
  declare controlsFrame: Phaser.GameObjects.Graphics;
  declare controlKeys: Phaser.GameObjects.Text[];
  declare controlCaptions: Phaser.GameObjects.Text[];
  declare exitButton: Phaser.GameObjects.Text;
  declare cameraNotice: Phaser.GameObjects.Text;
  declare touchControls: Phaser.GameObjects.Container;
  declare touchStickBase: Phaser.GameObjects.Graphics;
  declare touchStickKnob: Phaser.GameObjects.Graphics;
  declare touchStickPointerId: number | null;
  declare touchStickLocalPoint: Phaser.Math.Vector2;
  declare diagnosticsText: Phaser.GameObjects.Text | null;
  declare minimapLayout: { x: number; y: number; width: number; height: number; centerX: number; centerZ: number; scale: number; vertices: { x: number; y: number }[] } | undefined;
  declare diagnosticSampleTime: number | null;
  declare diagnosticRenderFrames: number;
  declare diagnosticCameraUpdates: number;
  declare diagnosticPhaserDeltaMs: number;
  declare diagnosticSimulationDeltaMs: number;
  constructor() { super(SCENES.race); }

  preload() {
    const assets = [
      ['race-hud-weapon-shots', '/assets/hud/icons/shots.png'],
      ['race-hud-weapon-bomb', '/assets/hud/icons/bomb.png'],
      ['race-hud-weapon-oil', '/assets/hud/icons/oil.png'],
    ];
    for (const [key, path] of assets) {
      if (!this.textures.exists(key)) this.load.image(key, encodeURI(path));
    }
  }

  create() {
    const championship = this.game.championship;
    if (championship.state.pendingResult) { this.scene.start(SCENES.results); return; }
    if (!championship.canRace) { this.scene.start(SCENES.preparation); return; }
    if (!championship.state.activeRace) { this.scene.start(SCENES.tracks); return; }
    this.character = getSelectedCharacter(this.registry)!;
    this.vehicleSelection = getSelectedVehicle(this.registry)!;
    this.difficulty = DIFFICULTIES[this.registry.get('selectedDifficultyId') as keyof typeof DIFFICULTIES];
    this.track = getTrackById(this.registry.get('selectedTrackId'))!;
    this.diagnosticsAvailable = import.meta.env.DEV;
    this.diagnosticsEnabled = false;
    if (!this.character || !this.vehicleSelection || !this.difficulty || !this.track) {
      const fallback = !this.difficulty ? SCENES.difficulty
        : !this.character ? SCENES.characters
          : !this.vehicleSelection ? SCENES.vehicles : SCENES.tracks;
      this.scene.start(fallback);
      return;
    }

    const opponents = this.createOpponents();
    this.simulation = new RaceSimulation({
      track: this.track,
      difficulty: this.difficulty.id,
      player: this.character,
      playerVehicle: this.vehicleSelection.vehicle,
      vehicleStats: this.vehicleSelection.vehicle.stats,
      playerPaint: this.vehicleSelection.paint.color,
      botPilots: opponents,
      laps: this.track.laps,
      diagnostics: this.diagnosticsAvailable,
      ...(this.diagnosticsAvailable ? { devRaceAIBonus: loadDevRaceAIBonus() } : {}),
    });
    this.ready = false;
    // A new race always starts from the default camera; camera mode is not a
    // persisted campaign selection.
    this.simulationStarted = false;
    this.raceLayer = null;
    this.raceId = championship.state.activeRace.id;
    this.attemptId = championship.state.attempt.id;
    this.startPending = false;
    this.countdownElapsed = 0;
    this.hudElapsed = 0;
    this.lastSimulationTime = null;
    this.resultRecorded = false;
    this.createGarageShell(`RIFFSHOT RACING. ${this.track.name}. Quatro competidores. Use WASD ou setas para dirigir.`);
    document.body.classList.add('race-ui-active');
    this.createHud();
    this.countdownLabel = text(this, 0, 0, '', 1, COLORS.white, true).setDepth(10).setAlpha(0).setVisible(false);
    this.loadingLabel.setText('CARREGANDO CARROS E PISTA…').setDepth(20).setOrigin(0.5).setColor('#71f6ff');
    this.playerController = new PlayerController(this);
    this.engineAudio = new RaceEngineAudio(this.game, this.simulation.participants);
    this.effectsAudio = new RaceEffectsAudio(this.game, this.simulation.participants);
    this.hudLayer = this.add.container(0, 0).setDepth(6);
    this.hudLayer.add([this.hudFrame, this.minimapFrame, this.minimap, this.minimapTitle, this.minimapSubtitle,
      this.trackLabel, this.difficultyLabel, this.weaponFrame, ...this.weaponIcons,
      ...this.weaponNames, ...this.weaponLabels, this.lapFrame, this.lapPips,
      this.leaderFrame, this.leaderHighlight, this.leaderCars, ...this.leaderRows,
      this.positionLabel, this.lapLabel,
      this.playerHudFrame, this.playerHudPortrait, this.playerLabel, this.vehicleStatus,
      this.lifeLabel, this.lifeValue, this.nitroLabel, this.nitroValue, this.healthOrbs, this.nitroBars, this.speedBars,
      this.speedLabel, this.speedValue, this.controlsFrame, this.controlsHint,
      ...this.controlKeys, ...this.controlCaptions, this.exitButton]);
    this.radioWidget = new RadioRaceWidget(this, this.game.riffshotRadio, this.game.menuMusic);
    this.hudLayer.add(this.radioWidget.container);
    this.content.add(this.cameraNotice);
    this.touchControls.setDepth(7);
    if (this.diagnosticsText) this.hudLayer.add(this.diagnosticsText);
    const cleanup = () => {
      this.events.off('shutdown', cleanup);
      this.events.off('destroy', cleanup);
      this.raceLayer?.destroy();
      this.raceLayer = null;
      this.cameraNoticeTimer?.remove();
      document.body.classList.remove('race-ui-active');
      this.engineAudio?.destroy();
      this.effectsAudio?.destroy();
      this.radioWidget?.destroy();
      this.game.menuMusic.cancelRaceAnnouncer();
      this.game.menuMusic.stopRaceTrackMusic();
      this.input.keyboard!.removeCapture(['C', 'Z']);
      if (this.diagnosticsAvailable) this.input.keyboard!.removeCapture(['F2', 'F3', 'F4']);
    };
    this.events.once('shutdown', cleanup);
    this.events.once('destroy', cleanup);
    this.input.keyboard!.on('keydown', (event: KeyboardEvent) => {
      if (event.repeat || this.transitioning) return;
      if (this.diagnosticsAvailable && (event.key === 'F2' || event.code === 'F2')) {
        event.preventDefault();
        this.toggleDiagnostics();
        return;
      }
      if (this.diagnosticsAvailable && this.diagnosticsEnabled && (event.key === 'F3' || event.code === 'F3')) {
        event.preventDefault();
        this.garageView?.setCameraFrozen(!event.shiftKey);
        return;
      }
      if (this.diagnosticsAvailable && this.diagnosticsEnabled && (event.key === 'F4' || event.code === 'F4')) {
        event.preventDefault();
        this.simulation.setVehicleContactsEnabled(event.shiftKey);
        return;
      }
      if (event.key === 'Escape') this.goTo(SCENES.preparation);
      if (event.key.toLowerCase() === 'c') this.toggleCamera();
      if (event.key.toLowerCase() === 'z') this.cycleCameraZoom();
    });
    this.input.keyboard!.addCapture(['C', 'Z']);
    if (this.diagnosticsAvailable) this.input.keyboard!.addCapture(['F2', 'F3', 'F4']);
    this.resizeShell();
    this.mountGarage({ mode: 'race', track: this.track, participants: this.simulation.participants,
      cameraMode: DEFAULT_RACE_CAMERA_MODE, diagnostics: this.diagnosticsAvailable });
  }

  createOpponents(): RacePilot[] {
    const opponents = CHARACTERS.filter(character => character.id !== this.character.id).slice(0, 2);
    // Stable for this attempt at the race, including abandonment/reload. This
    // varies driving decisions, never chooses a winner or changes vehicle caps.
    const aiSeed = Array.from(this.game.championship.state.activeRace!.id)
      .reduce((hash, letter) => (Math.imul(hash, 31) + letter.charCodeAt(0)) | 0, 0);
    return [{ ...OPENING_RIVAL, aiSeed, vehicleId: RIVAL_VEHICLE_ID, paintColor: '#ff634a' },
      ...opponents.map((character, index) => ({
        ...character, vehicleId: INITIAL_VEHICLES[0].id,
        aiProfile: index === 0 ? 'challenger' as const : 'opportunist' as const, aiSeed,
        paintColor: ['#53d9ff', '#c486ff'][index],
      }))];
  }

  async createGarageWorld(resources: GarageResources, options: GarageOptions, version = this.loadVersion): Promise<RaceWorld | null> {
    const { RaceWorld } = await import('../visuals/race/RaceWorld.ts');
    if (!this.alive || version !== this.loadVersion || resources.disposed) return null;
    if (!this.alive || version !== this.loadVersion || resources.disposed) return null;
    return new RaceWorld(resources, { track: this.track, participants: this.simulation.participants,
      cameraMode: options.cameraMode, diagnostics: options.diagnostics });
  }

  mountPresentation() {
    // A session override keeps the old composition available for diagnosis or
    // a browser that cannot composite an alpha-enabled Phaser canvas.
    this.raceLayer = new RaceCanvasLayer(this as unknown as ConstructorParameters<typeof RaceCanvasLayer>[0]);
    const forceTexture = this.registry.get('racePresentationMode') === 'texture'
      || new URLSearchParams(window.location.search).get('raceRenderer') === 'texture';
    if (!forceTexture && this.raceLayer.mount()) {
      this.presentationMode = 'direct';
    } else {
      this.presentationMode = 'texture';
      super.mountPresentation();
    }
  }

  applyPreviewBounds() {
    if (this.raceLayer?.active) this.raceLayer.resize();
    else super.applyPreviewBounds();
  }

  renderPresentation(elapsed: number): void {
    if (this.raceLayer?.active) {
      this.garageView!.update(elapsed);
    } else {
      super.renderPresentation(elapsed);
    }
  }

  toggleCamera() {
    if (!this.ready || this.transitioning || this.simulation.status === 'finished') return;
    const rig = this.garageView!.cameraRig;
    if (!rig.toggle()) return;
    this.showCameraNotice();
  }

  showCameraNotice() {
    const rig = this.garageView!.cameraRig;
    const label = RACE_CAMERA_MODES[rig.mode];
    this.cameraNotice.setText(`CÂMERA / ${label} [C]${rig.mode === 'chase' ? `\n${rig.zoomLabel} / APROXIMAR [Z]` : ''}`).setAlpha(1);
    this.cameraNoticeTimer?.remove();
    this.cameraNoticeTimer = this.time.delayedCall(2300, () => this.cameraNotice.setAlpha(0));
  }

  cycleCameraZoom() {
    if (!this.ready || this.transitioning || this.simulation.status === 'finished') return;
    if (this.garageView!.cameraRig.cycleZoom()) this.showCameraNotice();
  }

  onGarageReady() {
    if (this.startPending || this.simulationStarted) return;
    this.ready = true;
    this.loadingLabel.setVisible(false);
    this.drawMinimap();
    this.updateHud();
    this.showCameraNotice();
    void this.beginRace();
  }

  private async beginRace(): Promise<void> {
    if (this.startPending || this.simulationStarted || this.transitioning) return;
    this.startPending = true;
    await this.game.menuMusic.playRaceAnnouncer(this.track.id, this.raceId);
    if (!this.ready || this.transitioning || !this.sys.isActive()) return;
    this.simulationStarted = true;
    this.simulation.start();
    this.setControlHintOpacity();
    this.announce(`${this.track.name}. Largada! ${this.character.name}. A corrida começou.`);
  }

  createHud() {
    this.hudFrame = this.add.graphics();
    this.trackLabel = text(this, 0, 0, this.track.name, 16, '#ffb454', true).setOrigin(0, 0.5);
    this.difficultyLabel = text(this, 0, 0, `DIFICULDADE  /  ${this.difficulty.label}`, 11, '#71f6ff').setOrigin(0, 0.5);
    this.positionLabel = text(this, 0, 0, 'POSIÇÃO  — / 4', 22, COLORS.white, true).setOrigin(1, 0.5);
    this.lapLabel = text(this, 0, 0, `VOLTA  1 / ${this.track.laps}`, 16, COLORS.white, true).setOrigin(1, 0.5);
    this.lapFrame = this.add.graphics();
    this.lapPips = this.add.graphics();
    this.speedLabel = text(this, 0, 0, 'VELOCIDADE', 11, COLORS.muted).setOrigin(0, 0.5);
    this.speedValue = text(this, 0, 0, '000', 35, '#ffb454', true).setOrigin(0, 0.5);
    this.playerLabel = text(this, 0, 0, this.character.name, 12, '#71f6ff', true).setOrigin(0, 0.5);
    this.vehicleStatus = text(this, 0, 0, '', 10, COLORS.white, true).setOrigin(0, 0.5);
    this.healthOrbs = this.add.graphics();
    this.nitroBars = this.add.graphics();
    this.speedBars = this.add.graphics();
    this.lifeLabel = text(this, 0, 0, '♥  VIDA', 11, '#ff5d62', true).setOrigin(0, 0.5);
    this.nitroLabel = text(this, 0, 0, 'ϟ  NITRO', 11, '#71f6ff', true).setOrigin(0, 0.5);
    this.lifeValue = text(this, 0, 0, '', 12, COLORS.white, true).setOrigin(1, 0.5);
    this.nitroValue = text(this, 0, 0, '', 12, COLORS.white, true).setOrigin(1, 0.5);
    this.playerHudFrame = this.add.graphics();
    this.playerHudPortrait = this.add.image(0, 0, characterPortrait(this, this.character));
    this.diagnosticsText = this.diagnosticsAvailable
      ? text(this, 0, 0, '', 10, '#a9ffce', true).setOrigin(0, 0).setVisible(false)
      : null;
    this.leaderFrame = this.add.graphics();
    this.leaderHighlight = this.add.graphics();
    this.leaderCars = this.add.graphics();
    this.leaderRows = this.simulation.participants.map(() => text(this, 0, 0, '', 11, COLORS.white).setOrigin(0, 0.5));
    this.minimapFrame = this.add.graphics();
    this.minimap = this.add.graphics();
    this.minimapTitle = text(this, 0, 0, 'RIFFSHOT', 14, '#f0f6fc', true).setOrigin(0, 0.5);
    this.minimapSubtitle = text(this, 0, 0, 'RACING', 11, '#ff5452', true).setOrigin(0, 0.5);
    this.weaponFrame = this.add.graphics();
    this.weaponLabels = [
      text(this, 0, 0, '', 19, '#edf7ff', true).setOrigin(1, 0.5),
      text(this, 0, 0, '', 19, '#edf7ff', true).setOrigin(1, 0.5),
      text(this, 0, 0, '', 19, '#edf7ff', true).setOrigin(1, 0.5),
    ];
    this.weaponNames = ['TIROS', 'BOMBAS', 'ÓLEO'].map(label => text(this, 0, 0, label, 8, '#a9bac9', true).setOrigin(0, 0.5));
    this.weaponIcons = ['race-hud-weapon-shots', 'race-hud-weapon-bomb', 'race-hud-weapon-oil']
      .map(key => this.add.image(0, 0, key).setBlendMode(Phaser.BlendModes.ADD));
    this.controlsHint = text(this, 0, 0, 'W / ↑ ACELERAR   S / ↓ FREAR/RÉ   A / D DIREÇÃO   ESPAÇO FREIO DE MÃO   SHIFT NITRO   C CÂMERA   Z APROXIMAR', 10, COLORS.white).setAlpha(0.88);
    this.controlsFrame = this.add.graphics();
    this.controlKeys = Array.from({ length: 8 }, () => text(this, 0, 0, '', 11, COLORS.white, true));
    this.controlCaptions = Array.from({ length: 8 }, () => text(this, 0, 0, '', 9, '#d6edf2'));
    this.cameraNotice = text(this, 0, 0, '', 15, '#ffb454', true).setAlpha(0);
    this.exitButton = text(this, 0, 0, '← EQUIPE [ESC]', 11, '#71f6ff').setOrigin(1, 0.5)
      .setInteractive({ useHandCursor: true }).on('pointerdown', () => this.goTo(SCENES.preparation));
    this.createTouchControls();
  }

  createTouchControls() {
    this.touchControls = this.add.container().setDepth(30)
      .setVisible(this.sys.game.device.input.touch);
    this.touchStickPointerId = null;
    this.touchStickLocalPoint = new Phaser.Math.Vector2();
    this.touchStickBase = this.add.graphics().fillStyle(0x06111e, 0.62).lineStyle(2, 0x71f6ff, 0.9)
      .fillCircle(0, 0, 68).strokeCircle(0, 0, 68)
      .lineStyle(1, 0x71f6ff, 0.25).lineBetween(-47, 0, 47, 0).lineBetween(0, -47, 0, 47);
    this.touchStickBase.setInteractive(new Phaser.Geom.Circle(0, 0, 68), Phaser.Geom.Circle.Contains);
    this.touchStickKnob = this.add.graphics().fillStyle(0x173d4b, 0.88).lineStyle(2, 0x71f6ff, 1)
      .fillCircle(0, 0, 27).strokeCircle(0, 0, 27);
    this.touchControls.add([this.touchStickBase, this.touchStickKnob]);
    this.touchStickBase.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      pointer.event.preventDefault?.();
      this.touchStickPointerId = pointer.id;
      this.updateTouchStick(pointer);
    });
    this.input.on('pointermove', this.handleTouchStickMove, this);
    this.input.on('pointerup', this.handleTouchStickEnd, this);
    this.input.on('pointerupoutside', this.handleTouchStickEnd, this);
    const definitions = [['handbrake', 'DRIFT'], ['nitro', 'N₂O']] as const;
    for (const [control, label] of definitions) {
      const button = this.add.container();
      const isAction = control === 'nitro';
      const color = isAction ? 0xffa52d : 0x71f6ff;
      const radius = 29;
      const shape = this.add.graphics().fillStyle(0x06111e, 0.78).lineStyle(2, color, 0.92)
        .fillCircle(0, 0, radius).strokeCircle(0, 0, radius);
      const caption = text(this, 0, 0, label, control === 'handbrake' ? 10 : 20, '#f0f6fc', true).setOrigin(0.5);
      button.add([shape, caption]).setSize(radius * 2, radius * 2);
      button.setInteractive(new Phaser.Geom.Circle(0, 0, radius), Phaser.Geom.Circle.Contains);
      button.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
        pointer.event.preventDefault?.();
        this.playerController.setTouchControl(control, true);
      });
      const release = () => this.playerController.setTouchControl(control, false);
      button.on('pointerup', release).on('pointerupoutside', release).on('pointerout', release);
      this.touchControls.add(button);
    }
    this.events.once('shutdown', () => {
      this.input.off('pointermove', this.handleTouchStickMove, this);
      this.input.off('pointerup', this.handleTouchStickEnd, this);
      this.input.off('pointerupoutside', this.handleTouchStickEnd, this);
      this.playerController?.setAnalogControl(0, 0, false);
    });
  }

  handleTouchStickMove(pointer: Phaser.Input.Pointer): void {
    if (pointer.id === this.touchStickPointerId) this.updateTouchStick(pointer);
  }

  handleTouchStickEnd(pointer: Phaser.Input.Pointer): void {
    if (pointer.id !== this.touchStickPointerId) return;
    this.touchStickPointerId = null;
    this.touchStickKnob.setPosition(this.touchStickBase.x, this.touchStickBase.y);
    this.playerController.setAnalogControl(0, 0, false);
  }

  updateTouchStick(pointer: Phaser.Input.Pointer): void {
    this.touchStickBase.getWorldTransformMatrix().applyInverse(pointer.x, pointer.y, this.touchStickLocalPoint);
    const dx = this.touchStickLocalPoint.x, dy = this.touchStickLocalPoint.y;
    const distance = Math.hypot(dx, dy), radius = 49;
    const scale = distance > radius ? radius / distance : 1;
    const x = dx * scale, y = dy * scale;
    this.touchStickKnob.setPosition(this.touchStickBase.x + x, this.touchStickBase.y + y);
    this.playerController.setAnalogControl(x / radius, y / radius, true);
  }

  drawMinimap() {
    if (!this.garageView || !this.hudLayout) return;
    this.minimap.clear();
    this.minimapFrame.clear();
    const { x: l, y: t, width, height } = this.hudLayout.map;
    const compact = this.hudLayout.compact;
    const x = l + width / 2, y = t + height / 2;
    drawHudPlate(this.minimapFrame, l, t, width, height);
    this.minimapTitle.setPosition(l + 15, t + (compact ? 14 : 19)).setFontSize(compact ? 9 : 14);
    this.minimapSubtitle.setPosition(l + 15, t + (compact ? 25 : 34)).setFontSize(compact ? 7 : 10);
    const points = this.simulation.track.points;
    const minX = Math.min(...points.map(point => point.x)), maxX = Math.max(...points.map(point => point.x));
    const minZ = Math.min(...points.map(point => point.z)), maxZ = Math.max(...points.map(point => point.z));
    const scale = Math.min((width - (compact ? 36 : 54)) / (maxX - minX),
      (height - (compact ? 42 : 64)) / (maxZ - minZ));
    const centerX = (minX + maxX) / 2, centerZ = (minZ + maxZ) / 2;
    const vertices = points.map(point => ({ x: x + (point.x - centerX) * scale,
      y: y + (compact ? 5 : 9) - (point.z - centerZ) * scale }));
    this.minimapLayout = { x, y, width, height, centerX, centerZ, scale, vertices };
    this.updateMinimapVehicles();
  }

  update(time: number, delta: number): void {
    // Phaser's UI delta is smoothed on slow frames. The monotonic loop clock
    // keeps countdown and simulation pacing independent from that smoothing.
    // The fixed-step integrator retains its own bounded catch-up protection.
    const elapsed = this.lastSimulationTime === null ? delta : Math.max(0, Math.min(time - this.lastSimulationTime, 250));
    this.lastSimulationTime = time;
    if (this.diagnosticsAvailable) {
      this.diagnosticPhaserDeltaMs = delta;
      this.diagnosticSimulationDeltaMs = elapsed;
    }
    if (this.ready && !this.transitioning) {
      if (this.simulationStarted) {
        this.simulation.advance(elapsed, this.playerController.read(this.simulation.participants[0]));
        this.hudElapsed += elapsed;
        if (this.hudElapsed >= 100) {
          this.hudElapsed %= 100;
          this.updateHud();
          this.updateMinimapVehicles();
        }
        if (this.simulation.status === 'finished') this.finishRace();
      }
      this.garageView?.setParticipants(this.simulation.participants,
        (participant, output) => {
          const pose = this.simulation.getRenderPose(participant, undefined, output);
          return this.simulation.getVisualTelemetry(participant, pose);
        });
      this.garageView?.setCannon(this.simulation.cannon, this.simulation.elapsedTime,
        this.simulation.accumulator * 60);
      this.updateDiagnostics(time);
    }
    this.engineAudio?.update(this.simulation.participants, this.simulation.status);
    // Read before presentation drains the queue; audio tracks IDs and never
    // consumes the visual events, including on frames without a texture render.
    this.effectsAudio?.update(this.simulation.participants, this.simulation.status,
      this.simulation.elapsedTime, this.simulation.cannon.events);
    super.update(time, delta);
  }

  toggleDiagnostics() {
    this.diagnosticsEnabled = !this.diagnosticsEnabled;
    this.diagnosticsText?.setVisible(this.diagnosticsEnabled);
    this.diagnosticSampleTime = null;
    this.diagnosticRenderFrames = this.garageView?.renderFrames ?? 0;
    this.diagnosticCameraUpdates = this.garageView?.cameraUpdates ?? 0;
    if (this.diagnosticsEnabled) this.updateDiagnostics(this.time.now);
  }

  updateDiagnostics(time: number): void {
    if (!this.diagnosticsAvailable || !this.diagnosticsEnabled || !this.diagnosticsText) return;
    if (this.diagnosticSampleTime === null) {
      this.diagnosticSampleTime = time;
      this.diagnosticRenderFrames = this.garageView?.renderFrames ?? 0;
      this.diagnosticCameraUpdates = this.garageView?.cameraUpdates ?? 0;
      return;
    }
    const sampleMs = time - this.diagnosticSampleTime;
    if (sampleMs < 250) return;
    const world = this.garageView;
    const simulation = this.simulation;
    const player = simulation.participants[0]!;
    const visual = simulation.getRenderPose(player);
    const renderFrames = world?.renderFrames ?? 0;
    const cameraUpdates = world?.cameraUpdates ?? 0;
    const fps = (renderFrames - this.diagnosticRenderFrames) * 1000 / sampleMs;
    const cameraRate = (cameraUpdates - this.diagnosticCameraUpdates) * 1000 / sampleMs;
    const position = (pose: RenderPose) => `${pose.x.toFixed(2)},${pose.y.toFixed(2)},${pose.z.toFixed(2)} / yaw ${pose.heading.toFixed(3)} / v ${pose.speed.toFixed(2)}`;
    const cameraRig = world?.cameraRig;
    const target = cameraRig?.mode === 'chase' ? cameraRig.chaseTarget : cameraRig?.center;
    const cameraPosition = cameraRig?.camera.position;
    this.diagnosticsText.setText([
      'DIAG F2 · F3 congela câmera / Shift+F3 segue · F4 desliga contatos / Shift+F4 liga',
      `Render ${fps.toFixed(1)} FPS · Three ${world?.lastRenderMs?.toFixed(2) ?? '—'} ms · dt Phaser ${this.diagnosticPhaserDeltaMs?.toFixed(2) ?? '—'} / sim ${this.diagnosticSimulationDeltaMs?.toFixed(2) ?? '—'} ms`,
      `Física ${simulation.lastAdvanceSteps ?? 0} passos neste frame · advances ${simulation.diagnosticAdvanceCalls ?? 0} · poses ${world?.participantPoseUpdates ?? 0}`,
      `REAL x,y,z/yaw  ${position(player)}`,
      `VIS  x,y,z/yaw  ${position(visual)}`,
      `Correções: parede ${simulation.lastAdvanceBarrierCorrections ?? 0} · carro ${simulation.lastAdvanceContactCorrections ?? 0} · câmera ${cameraRate.toFixed(1)}/s (${world?.cameraFrozen ? 'fixa' : 'seguindo'})`,
      `GPU env: ${world?.resources.renderer.info.render.calls ?? 0} draws / ${world?.resources.renderer.info.render.triangles ?? 0} tri · rodas/efeitos ${world?.lastAnimationMs?.toFixed(2) ?? '—'} ms · partículas ${world?.damageEffects.activeCount ?? 0}`,
      `Alvo ${target ? `${target.x.toFixed(2)},${target.y.toFixed(2)},${target.z.toFixed(2)}` : '—'} · cam ${cameraPosition ? `${cameraPosition.x.toFixed(2)},${cameraPosition.y.toFixed(2)},${cameraPosition.z.toFixed(2)}` : '—'} · contatos ${simulation.vehicleContactsEnabled ? 'ON' : 'OFF'} · alpha ${(simulation.accumulator * 60).toFixed(2)}`,
    ]);
    this.diagnosticSampleTime = time;
    this.diagnosticRenderFrames = renderFrames;
    this.diagnosticCameraUpdates = cameraUpdates;
  }

  updateHud() {
    const standings = this.simulation.getStandings();
    const player = standings.find(participant => participant.isPlayer)!;
    this.positionLabel.setText(String(this.track.laps));
    this.lapLabel.setText('LAPS');
    this.speedValue.setText(String(Math.round(player.speed * 4)).padStart(3, '0'));
    const nitro = player.vehicle.nitroCharges > 0 ? `${player.nitroCharges}/${player.vehicle.nitroCharges}` : 'N/A';
    this.vehicleStatus.setText(player.destroyed ? 'DESTRUÍDO / REAPARECENDO…'
      : `VIDA ${Math.ceil(player.health / 20)}/${player.healthOrbs}   NITRO ${nitro}${player.nitroActive ? ' · ATIVO' : ''}`);
    this.lifeValue.setText(`${Math.ceil(player.health / 20)}/${player.healthOrbs}`);
    this.nitroValue.setText(nitro);
    const stats = this.vehicleSelection.vehicle.stats;
    this.weaponLabels[0].setText(String(stats.shotCount ?? 0));
    this.weaponLabels[1].setText(String(stats.bombCount ?? 0));
    this.weaponLabels[2].setText(String(stats.oilSlickCount ?? 0));
    this.drawHealthOrbs(player);
    this.nitroBars.clear();
    const charges = player.vehicle.nitroCharges;
    for (let i = 0; i < 5; i += 1) {
      const fill = charges ? Math.min(1, Math.max(0, player.nitroCharges / charges * 5 - i)) : 0;
      const width = this.hudLayout.pilot.width * 0.04;
      const gap = this.hudLayout.pilot.width * 0.0526;
      const height = this.hudLayout.pilot.height * 0.105;
      this.nitroBars.fillStyle(0x122535, 1).fillRect(i * gap, 0, width, height);
      if (fill) this.nitroBars.fillStyle(0x38dafa, 1).fillRect(i * gap, 0, width * fill, height);
    }
    this.drawSpeedBars(player);
    this.lapPips.clear();
    for (let lap = 0; lap < this.track.laps; lap += 1) {
      const completed = lap < player.lapsCompleted;
      const active = lap === player.lapsCompleted;
      const px = lap * (this.hudLayout.compact ? 22 : 28), radius = this.hudLayout.compact ? 6 : 9;
      this.lapPips.fillStyle(completed || active ? 0x34f45b : 0x162530, 1)
        .fillCircle(px, 0, radius)
        .lineStyle(2, completed || active ? 0xbaffc4 : 0x7c939e, 0.95).strokeCircle(px, 0, radius);
    }
    this.setControlHintOpacity();
    if (this.leaderBounds) {
      const { x, y, width, rowHeight } = this.leaderBounds;
      this.leaderHighlight.clear().fillStyle(0x9f1923, 0.68)
        .fillRect(x + 5, y + 6 + (player.rank - 1) * rowHeight, width - 10, rowHeight);
      this.leaderCars.clear();
      standings.forEach((participant, index) => {
        const carX = x + width - 24;
        const carY = y + 17 + index * rowHeight;
        const color = Number.parseInt(participant.paintColor.slice(1), 16);
        this.leaderCars.lineStyle(2, color, 1)
          .strokeRoundedRect(carX - 9, carY - 4, 18, 7, 2)
          .fillStyle(0x9db1bd, 1).fillCircle(carX - 5, carY + 4, 2)
          .fillCircle(carX + 5, carY + 4, 2);
      });
    }
    standings.forEach((participant, index) => {
      this.leaderRows[index].setText(`${index + 1}. ${participant.name.slice(0, 14)}${participant.isPlayer ? '  /  VOCÊ' : ''}`)
        .setColor(participant.isPlayer ? '#ffffff' : COLORS.white);
    });
  }

  drawHealthOrbs(player: RaceParticipant = this.simulation.participants[0]): void {
    const graphics = this.healthOrbs;
    graphics.clear();
    for (let i = 0; i < Math.min(player.healthOrbs, 3); i += 1) {
      const x = i * this.hudLayout.pilot.width * 0.08;
      const fill = Math.max(0, Math.min(1, player.health / 20 - i));
      const radius = this.hudLayout.pilot.width * 0.031;
      graphics.fillStyle(0x253139, 1).fillCircle(x, 0, radius)
        .lineStyle(1, 0xff7671, 0.9).strokeCircle(x, 0, radius);
      if (fill > 0) graphics.fillStyle(0xff2836, 1).slice(x, 0, radius - 1,
        -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * fill, false).fillPath();
    }
  }

  setControlHintOpacity(): void {
    const alpha = this.simulationStarted ? 0.35 : 1;
    this.controlsFrame.setAlpha(alpha);
    this.controlsHint.setAlpha(alpha);
    for (const item of [...this.controlKeys, ...this.controlCaptions]) item.setAlpha(alpha);
  }

  drawSpeedBars(player: RaceParticipant): void {
    const graphics = this.speedBars;
    graphics.clear();
    const fraction = Phaser.Math.Clamp(player.speed / Math.max(1, player.vehicle.maxSpeed), 0, 1);
    this.speedBarSegments = Math.ceil(fraction * 7);
    const width = this.hudLayout.pilot.width * 0.033;
    const height = this.hudLayout.pilot.height * 0.105;
    const step = this.hudLayout.pilot.width * 0.038;
    for (let index = 0; index < 7; index += 1) {
      const fill = Phaser.Math.Clamp(fraction * 7 - index, 0, 1);
      if (fill <= 0) continue;
      const x = index * step;
      graphics.fillStyle(0xffbd3c, 0.96)
        .beginPath().moveTo(x, height)
        .lineTo(x + width * 0.36, 0)
        .lineTo(x + width, 0)
        .lineTo(x + width * 0.64, height)
        .closePath().fillPath();
    }
  }

  drawPlayerHudFrame(pilot: { x: number; y: number; width: number; height: number }): void {
    const graphics = this.playerHudFrame;
    const { x, y, width, height } = pilot;
    const contentX = x + width * 0.29;
    const contentWidth = width * 0.68;
    const rowHeight = height * 0.19;
    const rows = [0.35, 0.55, 0.75];
    const countX = x + width * 0.895;
    const countWidth = width * 0.15;
    const cutBox = (left: number, top: number, boxWidth: number, boxHeight: number, inset = 0) => {
      const bx = left + inset, by = top + inset;
      const bw = boxWidth - inset * 2, bh = boxHeight - inset * 2;
      const cut = Math.min(5, bh * 0.24);
      return [
        { x: bx + cut, y: by }, { x: bx + bw - cut, y: by }, { x: bx + bw, y: by + cut },
        { x: bx + bw, y: by + bh - cut }, { x: bx + bw - cut, y: by + bh },
        { x: bx + cut, y: by + bh }, { x: bx, y: by + bh - cut }, { x: bx, y: by + cut },
      ];
    };

    graphics.clear();
    drawHudPlate(graphics, x, y, width, height, 0xff5145);

    // Match the cut-metal plate used by the map, lap and standings panels.
    const portraitX = x + width * 0.035;
    const portraitY = y + height * 0.14;
    const portraitWidth = width * 0.235;
    const portraitHeight = height * 0.72;
    const portraitBox = cutBox(portraitX, portraitY, portraitWidth, portraitHeight);
    graphics.fillStyle(0x06101a, 0.98).fillPoints(portraitBox, true)
      .lineStyle(1.5, 0x8296a3, 0.95).strokePoints(portraitBox, true)
      .lineStyle(1, 0xff5145, 0.9).lineBetween(portraitX + 5, portraitY + 7,
        portraitX + portraitWidth * 0.52, portraitY + 7);

    const headerY = y + height * 0.08;
    const headerBox = cutBox(contentX, headerY, contentWidth, height * 0.22);
    graphics.fillStyle(0x07121c, 0.96).fillPoints(headerBox, true)
      .lineStyle(1, 0x526775, 0.9).strokePoints(headerBox, true)
      .lineStyle(2, 0xff5145, 0.95).lineBetween(contentX + 8, headerY + 2,
        contentX + Math.min(contentWidth * 0.42, 90), headerY + 2);

    rows.forEach(row => {
      const rowY = y + height * row;
      graphics.fillStyle(0x07101a, 0.72).fillRect(contentX, rowY, contentWidth, rowHeight)
        .lineStyle(1, 0x354957, 0.9).lineBetween(contentX, rowY, contentX + contentWidth, rowY)
        .lineBetween(contentX, rowY + rowHeight, contentX + contentWidth, rowY + rowHeight);
      const counterBox = cutBox(countX - countWidth / 2, rowY + 2, countWidth, rowHeight - 4);
      graphics.fillStyle(0x050c14, 0.98).fillPoints(counterBox, true)
        .lineStyle(1, 0x83949e, 0.95).strokePoints(counterBox, true)
        .lineStyle(2, 0xff5145, 0.95).lineBetween(countX - countWidth / 2 + 2, rowY + 6,
          countX - countWidth / 2 + 2, rowY + rowHeight - 6);
    });

    const speedX = x + width * 0.52;
    const segmentWidth = width * 0.033;
    const segmentStep = width * 0.038;
    const segmentHeight = height * 0.105;
    const speedY = y + height * 0.79;
    for (let index = 0; index < 7; index += 1) {
      const sx = speedX + index * segmentStep;
      const points = [
        { x: sx, y: speedY + segmentHeight },
        { x: sx + segmentWidth * 0.36, y: speedY },
        { x: sx + segmentWidth, y: speedY },
        { x: sx + segmentWidth * 0.64, y: speedY + segmentHeight },
      ];
      graphics.fillStyle(0x121d26, 1).fillPoints(points, true)
        .lineStyle(1, 0x52616b, 0.9).strokePoints(points, true);
    }

    graphics.fillStyle(0xff5145, 0.9)
      .fillRect(x + 12, y + height - 5, width * 0.27, 2)
      .fillRect(x + width * 0.72, y + 5, width * 0.11, 2);
  }

  updateMinimapVehicles() {
    if (!this.minimapLayout) return;
    const { x, y, centerX, centerZ, scale, vertices } = this.minimapLayout;
    this.minimap.clear();
    this.minimap.lineStyle(this.hudLayout.compact ? 6 : 8, 0x475563, 1).strokePoints(vertices, true)
      .lineStyle(this.hudLayout.compact ? 2 : 3, 0xd9e3e8, 1).strokePoints(vertices, true);
    this.simulation.participants.forEach(participant => {
      const px = x + (participant.x - centerX) * scale;
      const py = y + (this.hudLayout.compact ? 5 : 9) - (participant.z - centerZ) * scale;
      if (participant.isPlayer) this.minimap.fillStyle(0xff493d, 0.35).fillCircle(px, py, 9);
      this.minimap.fillStyle(participant.isPlayer ? 0xff493d : 0xe9f4f8, 1)
        .fillCircle(px, py, participant.isPlayer ? 4 : 2.5);
    });
  }

  finishRace() {
    if (this.resultRecorded) return;
    this.resultRecorded = true;
    const standings = this.simulation.getStandings();
    const result = {
      raceId: this.raceId,
      attemptId: this.attemptId,
      trackId: this.track.id, trackName: this.track.name, difficultyId: this.difficulty.id,
      laps: this.track.laps, elapsedTime: this.simulation.elapsedTime,
      standings: standings.map((participant, index) => ({
        id: participant.id, name: participant.name, position: (index + 1) as 1 | 2 | 3 | 4, isPlayer: participant.isPlayer,
        finishTime: participant.finishTime ?? this.simulation.elapsedTime, lapsCompleted: participant.lapsCompleted, paintColor: participant.paintColor,
      })),
    };
    if (this.game.championship.finishRace(result as ChampionshipResult)) this.goTo(SCENES.results);
    else {
      this.loadingLabel.setVisible(true).setText('RESULTADO INVÁLIDO — PROGRESSO PRESERVADO. ESC VOLTA.');
      this.announce('O resultado não pôde ser registrado. Progresso preservado. Escape volta à equipe.');
    }
  }

  layout(w: number, h: number): void {
    const portrait = w < 700 && w < h;
    const compact = w < 1000 || h < 600;
    const hudScale = Math.max(1, Math.min(w / 1920, h / 1080));
    const hudW = w / hudScale, hudH = h / hudScale;
    // The 3D preview keeps its existing fitted camera. Only the HUD uses screen pixels.
    const worldW = portrait ? 360 : h < 600 ? 900 : 1600;
    const worldH = portrait ? 700 : h < 600 ? 360 : 900;
    this.fitContent(w, h, worldW, worldH);
    this.setPreviewBounds(0, 0, worldW, worldH);
    if (!this.ready) this.loadingLabel.setPosition(0, 0).setVisible(true);
    for (const item of [this.chrome, this.brand, this.edition, this.system, this.footerLeft, this.footerRight]) item.setVisible(false);
    const margin = compact ? 12 : 24;
    const map = { x: margin, y: portrait ? 56 : compact ? 12 : 24,
      width: compact ? 148 : 224, height: compact ? 100 : 144 };
    const lap = { x: hudW - margin - (compact ? 166 : 206), y: portrait ? 56 : compact ? 12 : 24,
      width: compact ? 166 : 206, height: compact ? 54 : 62 };
    const pilot = { x: margin, y: hudH - (compact ? 136 : 180),
      width: compact ? 300 : 380, height: compact ? 123 : 156 };
    this.hudLayout = { map, pilot, lap, compact };
    this.hudLayer.setPosition(0, 0).setScale(hudScale);
    this.radioWidget?.layout(hudW, hudH);
    this.minimapFrame.setVisible(true);
    this.minimap.setVisible(true);
    this.minimapTitle.setVisible(true);
    this.trackLabel.setOrigin(0, 0.5).setPosition(map.x + 14, map.y + map.height - (compact ? 10 : 15))
      .setFontSize(compact ? 8 : 12).setColor('#71f6ff').setScale(1).setVisible(true);
    this.trackLabel.setScale(Math.min(1, (map.width - 72) / Math.max(1, this.trackLabel.width)));
    this.difficultyLabel.setText(this.difficulty.label.toUpperCase()).setOrigin(1, 0.5)
      .setPosition(map.x + map.width - 12, map.y + map.height - (compact ? 10 : 15))
      .setFontSize(compact ? 7 : 8).setColor('#aec2cb').setVisible(true);
    this.weaponFrame.clear();
    const weaponWidth = portrait ? 88 : compact ? 78 : 112;
    const weaponGap = portrait ? 6 : compact ? 8 : 12;
    const weaponHeight = portrait ? 62 : compact ? 56 : 72;
    const weaponStart = (hudW - 3 * weaponWidth - 2 * weaponGap) / 2;
    const weaponY = portrait ? 154 : compact ? 16 : 24;
    this.weaponLabels.forEach((label, index) => {
      const x = weaponStart + index * (weaponWidth + weaponGap);
      drawHudPlate(this.weaponFrame, x, weaponY, weaponWidth, weaponHeight, 0xff5145);
      this.weaponIcons[index]!.setPosition(x + weaponWidth * 0.31, weaponY + weaponHeight * 0.43)
        .setDisplaySize(compact ? (portrait ? 30 : 28) : 40, compact ? (portrait ? 30 : 28) : 40);
      const countX = x + weaponWidth * 0.77;
      const countY = weaponY + weaponHeight * 0.42;
      this.weaponNames[index]!.setPosition(x + weaponWidth * 0.12, weaponY + weaponHeight * 0.82)
        .setFontSize(compact ? 6 : 9).setColor('#b6c5ce').setVisible(true);
      label.setOrigin(0.5).setPosition(countX, countY)
        .setFontSize(compact ? 15 : 20).setColor(COLORS.white);
    });
    this.lapFrame.clear();
    drawHudPlate(this.lapFrame, lap.x, lap.y, lap.width, lap.height);
    this.lapLabel.setOrigin(0, 0.5).setPosition(lap.x + 13, lap.y + (compact ? 15 : 21))
      .setFontSize(compact ? 14 : 21);
    this.positionLabel.setOrigin(1, 0.5).setPosition(lap.x + lap.width - 13, lap.y + (compact ? 15 : 21))
      .setFontSize(compact ? 16 : 26);
    this.lapPips.setPosition(lap.x + 25, lap.y + (compact ? 38 : 45));
    const leaderY = portrait ? 220 : lap.y + lap.height + (compact ? 7 : 12);
    const leaderH = compact ? 94 : 116;
    this.leaderFrame.clear();
    drawHudPlate(this.leaderFrame, lap.x, leaderY, lap.width, leaderH, 0xff4b46);
    const rowHeight = compact ? 20 : 27;
    this.leaderBounds = { x: lap.x, y: leaderY, width: lap.width, rowHeight };
    this.leaderRows.forEach((row, index) => {
      const y = leaderY + 17 + index * rowHeight;
      row.setPosition(lap.x + 15, y).setFontSize(compact ? 9 : 12);
    });
    this.drawPlayerHudFrame(pilot);
    const portraitW = pilot.width * 0.21;
    this.playerHudPortrait.setPosition(pilot.x + pilot.width * 0.152, pilot.y + pilot.height * 0.5)
      .setDisplaySize(portraitW, pilot.height * 0.64);
    this.playerLabel.setOrigin(0.5, 0.5)
      .setPosition(pilot.x + pilot.width * 0.625, pilot.y + pilot.height * 0.19)
      .setFontSize(compact ? 11 : 15).setColor(COLORS.white);
    const labelX = pilot.x + pilot.width * 0.315;
    this.lifeLabel.setVisible(true).setOrigin(0, 0.5).setPosition(labelX, pilot.y + pilot.height * 0.445)
      .setFontSize(compact ? 8 : 11).setColor('#ff5965');
    this.nitroLabel.setVisible(true).setOrigin(0, 0.5).setPosition(labelX, pilot.y + pilot.height * 0.645)
      .setFontSize(compact ? 8 : 11).setColor('#59e6ff');
    this.lifeValue.setVisible(true).setOrigin(0.5).setPosition(pilot.x + pilot.width * 0.895,
      pilot.y + pilot.height * 0.445).setFontSize(compact ? 8 : 11);
    this.nitroValue.setVisible(true).setOrigin(0.5).setPosition(pilot.x + pilot.width * 0.895,
      pilot.y + pilot.height * 0.645).setFontSize(compact ? 8 : 11);
    this.healthOrbs.setPosition(pilot.x + pilot.width * 0.56, pilot.y + pilot.height * 0.445);
    this.nitroBars.setPosition(pilot.x + pilot.width * 0.52, pilot.y + pilot.height * 0.595);
    this.speedBars.setPosition(pilot.x + pilot.width * 0.52, pilot.y + pilot.height * 0.79);
    this.vehicleStatus.setVisible(false);
    this.speedLabel.setVisible(true).setOrigin(0, 0.5).setPosition(labelX, pilot.y + pilot.height * 0.845)
      .setFontSize(compact ? 7 : 9).setColor('#ffbf4a');
    this.speedValue.setPosition(pilot.x + pilot.width * 0.895, pilot.y + pilot.height * 0.845)
      .setOrigin(0.5, 0.5).setFontSize(compact ? 12 : 17);
    const hintWidth = portrait ? hudW - 24 : compact ? 280 : 660;
    const hintX = hudW - margin - hintWidth;
    const hintY = portrait ? pilot.y - 44 : hudH - (compact ? 42 : 60);
    this.controlsFrame.clear();
    drawHudPlate(this.controlsFrame, hintX, hintY, hintWidth, compact ? 30 : 36, 0x71f6ff);
    const keyboardHint = !compact && !this.sys.game.device.input.touch;
    this.controlsHint.setVisible(!keyboardHint).setOrigin(1, 0.5).setAlign('right')
      .setPosition(hintX + hintWidth - 11, hintY + (compact ? 15 : 18))
      .setFontSize(compact ? 7 : 9).setWordWrapWidth(hintWidth - 20)
      .setText(this.sys.game.device.input.touch ? 'ANALÓGICO  •  N₂O NITRO  •  DRIFT FREIO DE MÃO'
        : 'W ACELERAR   S FREAR   A/D DIREÇÃO   C CÂMERA   SHIFT NITRO   ESPAÇO DRIFT');
    const bindings = [
      ['W', 'ACELERAR', 82], ['S', 'FREAR', 72], ['A', 'ESQ.', 58], ['D', 'DIR.', 58],
      ['C', 'CÂMERA', 84], ['Z', 'ZOOM', 69], ['SHIFT', 'NITRO', 90], ['SPACE', 'DRIFT', 94],
    ] as const;
    const totalBindingWidth = bindings.reduce((total, [, , width]) => total + width, 0);
    let slotX = hintX + (hintWidth - totalBindingWidth) / 2;
    bindings.forEach(([key, caption, slotWidth], index) => {
      const keyWidth = key.length > 1 ? (key === 'SPACE' ? 42 : 35) : 18;
      const keyX = slotX + keyWidth / 2;
      const keyText = this.controlKeys[index]!;
      const captionText = this.controlCaptions[index]!;
      keyText.setVisible(keyboardHint).setText(key).setPosition(keyX, hintY + 18).setFontSize(10);
      captionText.setVisible(keyboardHint).setText(caption).setOrigin(0, 0.5)
        .setPosition(slotX + keyWidth + 6, hintY + 18).setFontSize(9);
      if (keyboardHint) this.controlsFrame.fillStyle(0x061624, 0.95)
        .fillRoundedRect(slotX, hintY + 8, keyWidth, 20, 3)
        .lineStyle(1, 0x7a9cad, 0.85).strokeRoundedRect(slotX, hintY + 8, keyWidth, 20, 3);
      slotX += slotWidth;
    });
    this.exitButton.setPosition(hudW - margin, hintY - (compact ? 15 : 22))
      .setFontSize(compact ? 9 : 11);
    this.cameraNotice.setPosition(0, -worldH / 2 + (portrait ? 230 : compact ? 102 : 108))
      .setFontSize(portrait ? 10 : compact ? 11 : 15);
    this.touchControls.setVisible(this.sys.game.device.input.touch);
    if (this.touchControls.visible) {
      this.touchStickBase.setPosition(margin + (portrait ? 75 : 105), h - (portrait ? 250 : 181));
      this.touchStickKnob.setPosition(this.touchStickBase.x, this.touchStickBase.y);
      (this.touchControls.list.slice(2) as Phaser.GameObjects.Container[]).forEach((control, index) => {
        control.setPosition(w - margin - 65 - index * 76, h - (portrait ? 205 : 132)).setScale(compact ? 0.9 : 1);
      });
    }
    this.diagnosticsText?.setPosition(20, 230).setFontSize(compact ? 8 : 10).setWordWrapWidth(w - 40);
    if (this.garageView) this.drawMinimap();
    this.updateHud();
  }
}
