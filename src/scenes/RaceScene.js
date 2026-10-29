import { GarageScene } from './GarageScene.js';
import { CHARACTERS, getSelectedCharacter } from '../data/characters.js';
import { INITIAL_VEHICLES, RIVAL_VEHICLE_ID, getSelectedVehicle } from '../data/vehicles.js';
import { DIFFICULTIES } from '../data/raceDifficulty.js';
import { getTrackById } from '../data/raceTracks.js';
import { RaceSimulation } from '../race/RaceSimulation.js';
import { PlayerController } from '../race/PlayerController.js';
import { RaceCanvasLayer } from '../visuals/race/RaceCanvasLayer.js';
import { DEFAULT_RACE_CAMERA_MODE, RACE_CAMERA_MODES } from '../data/raceCameras.js';
import { COLORS, SCENES, text } from '../ui/theme.js';
import { RaceEngineAudio } from '../audio/RaceEngineAudio.js';

export class RaceScene extends GarageScene {
  constructor() { super(SCENES.race); }

  create() {
    const championship = this.game.championship;
    if (championship.state.pendingResult) { this.scene.start(SCENES.results); return; }
    if (!championship.canRace) { this.scene.start(SCENES.preparation); return; }
    if (!championship.state.activeRace) { this.scene.start(SCENES.tracks); return; }
    this.character = getSelectedCharacter(this.registry);
    this.vehicleSelection = getSelectedVehicle(this.registry);
    this.difficulty = DIFFICULTIES[this.registry.get('selectedDifficultyId')];
    this.track = getTrackById(this.registry.get('selectedTrackId'));
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
    });
    this.ready = false;
    // A new race always starts from the default camera; camera mode is not a
    // persisted campaign selection.
    this.simulationStarted = false;
    this.raceLayer = null;
    this.raceId = championship.state.activeRace.id;
    this.attemptId = championship.state.attempt.id;
    this.countdownElapsed = 0;
    this.hudElapsed = 0;
    this.lastSimulationTime = null;
    this.resultRecorded = false;
    this.createGarageShell(`RIFFSHOT RACING. ${this.track.name}. Quatro competidores. Use WASD ou setas para dirigir.`);
    this.createHud();
    this.playerController = new PlayerController(this);
    this.engineAudio = new RaceEngineAudio(this.game, this.simulation.participants);
    this.content.add([this.hudFrame, this.trackLabel, this.difficultyLabel, this.positionLabel,
      this.lapLabel, this.speedLabel, this.speedValue, this.playerLabel, this.vehicleStatus, this.healthOrbs,
      this.leaderFrame, ...this.leaderRows, this.minimapFrame, this.minimap,
      this.countdownLabel, this.controlsHint, this.exitButton, this.cameraNotice]);
    if (this.diagnosticsText) this.content.add(this.diagnosticsText);
    const cleanup = () => {
      this.events.off('shutdown', cleanup);
      this.events.off('destroy', cleanup);
      this.raceLayer?.destroy();
      this.raceLayer = null;
      this.cameraNoticeTimer?.remove();
      this.engineAudio?.destroy();
      this.input.keyboard.removeCapture(['C', 'Z']);
      if (this.diagnosticsAvailable) this.input.keyboard.removeCapture(['F2', 'F3', 'F4']);
    };
    this.events.once('shutdown', cleanup);
    this.events.once('destroy', cleanup);
    this.input.keyboard.on('keydown', event => {
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
    this.input.keyboard.addCapture(['C', 'Z']);
    if (this.diagnosticsAvailable) this.input.keyboard.addCapture(['F2', 'F3', 'F4']);
    this.resizeShell();
    this.mountGarage({ mode: 'race', track: this.track, participants: this.simulation.participants,
      cameraMode: DEFAULT_RACE_CAMERA_MODE, diagnostics: this.diagnosticsAvailable });
  }

  createOpponents() {
    return CHARACTERS.filter(character => character.id !== this.character.id).slice(0, 3).map((character, index) => ({
      id: character.id, name: character.name, stats: character.stats,
      vehicleId: index === 0 ? RIVAL_VEHICLE_ID : INITIAL_VEHICLES[index % INITIAL_VEHICLES.length].id,
      paintColor: ['#ff634a', '#53d9ff', '#c486ff'][index],
    }));
  }

  async createGarageWorld(resources, options, version = this.loadVersion) {
    const { RaceWorld } = await import('../visuals/race/RaceWorld.js');
    if (!this.alive || version !== this.loadVersion || resources.disposed) return null;
    return new RaceWorld(resources, options);
  }

  mountPresentation() {
    // A session override keeps the old composition available for diagnosis or
    // a browser that cannot composite an alpha-enabled Phaser canvas.
    this.raceLayer = new RaceCanvasLayer(this);
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

  renderPresentation(elapsed) {
    if (this.raceLayer?.active) {
      this.garageView.update(elapsed);
    } else {
      super.renderPresentation(elapsed);
    }
  }

  toggleCamera() {
    if (!this.ready || this.transitioning || this.simulation.status === 'finished') return;
    const rig = this.garageView.cameraRig;
    if (!rig.toggle()) return;
    this.showCameraNotice();
  }

  showCameraNotice() {
    const rig = this.garageView.cameraRig;
    const label = RACE_CAMERA_MODES[rig.mode];
    this.cameraNotice.setText(`CÂMERA / ${label} [C]${rig.mode === 'chase' ? `\n${rig.zoomLabel} / APROXIMAR [Z]` : ''}`).setAlpha(1);
    this.cameraNoticeTimer?.remove();
    this.cameraNoticeTimer = this.time.delayedCall(2300, () => this.cameraNotice.setAlpha(0));
  }

  cycleCameraZoom() {
    if (!this.ready || this.transitioning || this.simulation.status === 'finished') return;
    if (this.garageView.cameraRig.cycleZoom()) this.showCameraNotice();
  }

  onGarageReady() {
    this.ready = true;
    this.loadingLabel.setVisible(false);
    this.drawMinimap();
    this.updateHud();
    this.showCameraNotice();
    this.announce(`${this.track.name}. Quatro competidores. A corrida começa em breve. WASD ou setas aceleram, freiam e dirigem.`);
  }

  createHud() {
    this.hudFrame = this.add.graphics();
    this.trackLabel = text(this, 0, 0, this.track.name, 16, '#ffb454', true).setOrigin(0, 0.5);
    this.difficultyLabel = text(this, 0, 0, `DIFICULDADE  /  ${this.difficulty.label}`, 11, '#71f6ff').setOrigin(0, 0.5);
    this.positionLabel = text(this, 0, 0, 'POSIÇÃO  — / 4', 22, COLORS.white, true).setOrigin(1, 0.5);
    this.lapLabel = text(this, 0, 0, `VOLTA  1 / ${this.track.laps}`, 16, COLORS.white, true).setOrigin(1, 0.5);
    this.speedLabel = text(this, 0, 0, 'VELOCIDADE', 11, COLORS.muted).setOrigin(0, 0.5);
    this.speedValue = text(this, 0, 0, '000', 35, '#ffb454', true).setOrigin(0, 0.5);
    this.playerLabel = text(this, 0, 0, this.character.name, 12, '#71f6ff', true).setOrigin(0, 0.5);
    this.vehicleStatus = text(this, 0, 0, '', 10, COLORS.white, true).setOrigin(0, 0.5);
    this.healthOrbs = this.add.graphics();
    this.diagnosticsText = this.diagnosticsAvailable
      ? text(this, 0, 0, '', 10, '#a9ffce', true).setOrigin(0, 0).setVisible(false)
      : null;
    this.leaderFrame = this.add.graphics();
    this.leaderRows = this.simulation.participants.map(() => text(this, 0, 0, '', 11, COLORS.white).setOrigin(0, 0.5));
    this.minimapFrame = this.add.graphics();
    this.minimap = this.add.graphics();
    this.countdownLabel = text(this, 0, 0, '3', 84, COLORS.white, true).setDepth(10).setAlpha(0);
    this.controlsHint = text(this, 0, 0, 'W / ↑ ACELERAR   S / ↓ FREAR/RÉ   A / D DIREÇÃO   ESPAÇO FREIO DE MÃO   SHIFT NITRO   C CÂMERA   Z APROXIMAR', 10, COLORS.white).setAlpha(0.88);
    this.cameraNotice = text(this, 0, 0, '', 15, '#ffb454', true).setAlpha(0);
    this.exitButton = text(this, 0, 0, '← EQUIPE [ESC]', 11, '#71f6ff').setOrigin(1, 0.5)
      .setInteractive({ useHandCursor: true }).on('pointerdown', () => this.goTo(SCENES.preparation));
  }

  drawMinimap() {
    if (!this.garageView) return;
    this.minimap.clear();
    this.minimapFrame.clear();
    const width = 154, height = 112, x = 480, y = 244;
    this.minimapFrame.fillStyle(0x07111c, 0.84).fillRoundedRect(x - width / 2, y - height / 2, width, height, 5);
    this.minimapFrame.lineStyle(1, 0x71f6ff, 0.68).strokeRoundedRect(x - width / 2, y - height / 2, width, height, 5);
    const points = this.simulation.track.points;
    const minX = Math.min(...points.map(point => point.x)), maxX = Math.max(...points.map(point => point.x));
    const minZ = Math.min(...points.map(point => point.z)), maxZ = Math.max(...points.map(point => point.z));
    const scale = Math.min((width - 28) / (maxX - minX), (height - 28) / (maxZ - minZ));
    const centerX = (minX + maxX) / 2, centerZ = (minZ + maxZ) / 2;
    const vertices = points.map(point => ({ x: x + (point.x - centerX) * scale, y: y - (point.z - centerZ) * scale }));
    this.minimapLayout = { x, y, width, height, centerX, centerZ, scale, vertices };
    this.minimap.lineStyle(2, Number.parseInt(this.track.theme.accent.slice(1), 16), 0.9).strokePoints(vertices, true);
    this.minimap.fillStyle(0xffb454, 1).fillCircle(x - width / 2 + 10, y - height / 2 + 10, 2);
  }

  update(time, delta) {
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
      if (!this.simulationStarted) {
        this.countdownElapsed += elapsed / 1000;
        const remaining = 3 - this.countdownElapsed;
        if (remaining > 0) this.countdownLabel.setText(String(Math.ceil(remaining))).setAlpha(1);
        else if (remaining > -0.7) this.countdownLabel.setText('GO!').setColor('#ffb454').setAlpha(1);
        else {
          this.countdownLabel.setAlpha(0);
          this.simulationStarted = true;
          this.simulation.start();
          this.announce(`${this.track.name}. Largada! ${this.character.name}. A corrida começou.`);
        }
      } else {
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
      this.updateDiagnostics(time);
    }
    this.engineAudio?.update(this.simulation.participants, this.simulation.status);
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

  updateDiagnostics(time) {
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
    const player = simulation.participants[0];
    const visual = simulation.getRenderPose(player);
    const renderFrames = world?.renderFrames ?? 0;
    const cameraUpdates = world?.cameraUpdates ?? 0;
    const fps = (renderFrames - this.diagnosticRenderFrames) * 1000 / sampleMs;
    const cameraRate = (cameraUpdates - this.diagnosticCameraUpdates) * 1000 / sampleMs;
    const position = pose => `${pose.x.toFixed(2)},${pose.y.toFixed(2)},${pose.z.toFixed(2)} / yaw ${pose.heading.toFixed(3)} / v ${pose.speed.toFixed(2)}`;
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
    const player = standings.find(participant => participant.isPlayer);
    this.positionLabel.setText(`POSIÇÃO  ${player.rank}º / 4`);
    const currentLap = Math.min(this.track.laps, player.lapsCompleted + 1);
    this.lapLabel.setText(`VOLTA  ${currentLap} / ${this.track.laps}`);
    this.speedValue.setText(String(Math.round(player.speed * 4)).padStart(3, '0'));
    const nitro = player.vehicle.nitroCharges > 0
      ? `NITRO ${player.nitroCharges}/${player.vehicle.nitroCharges}${player.nitroActive ? ` · ${player.nitroRemaining.toFixed(1)}s` : ''}`
      : 'NITRO —';
    this.vehicleStatus.setText(player.destroyed ? 'DESTRUÍDO / REAPARECENDO…'
      : `${player.respawnProtection > 0 ? 'PROTEÇÃO / ' : ''}VIDA ${Math.ceil(player.health / 20)}/${player.healthOrbs}   ${nitro}`);
    this.drawHealthOrbs(player);
    standings.forEach((participant, index) => {
      this.leaderRows[index].setText(`${index + 1}. ${participant.name.slice(0, 14)}${participant.isPlayer ? '  /  VOCÊ' : ''}`)
        .setColor(participant.isPlayer ? '#ffb454' : COLORS.white);
    });
  }

  drawHealthOrbs(player = this.simulation.participants[0]) {
    const graphics = this.healthOrbs;
    graphics.clear();
    for (let i = 0; i < player.healthOrbs; i += 1) {
      const x = i * 19;
      const fill = Math.max(0, Math.min(1, player.health / 20 - i));
      const color = player.health / player.maxHealth < 0.3 ? 0xff614e : 0x71f6ff;
      graphics.lineStyle(1.3, color, 0.95).strokeCircle(x, 0, 7);
      graphics.fillStyle(0x1c2939).fillCircle(x, 0, 5);
      if (fill > 0) graphics.fillStyle(color, 0.95).slice(x, 0, 5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * fill, false).fillPath();
    }
  }

  updateMinimapVehicles() {
    if (!this.minimapLayout) return;
    const { x, y, centerX, centerZ, scale, vertices } = this.minimapLayout;
    this.minimap.clear();
    this.minimap.lineStyle(2, Number.parseInt(this.track.theme.accent.slice(1), 16), 0.8).strokePoints(vertices, true);
    this.simulation.participants.forEach(participant => {
      const px = x + (participant.x - centerX) * scale;
      const py = y - (participant.z - centerZ) * scale;
      this.minimap.fillStyle(Number.parseInt(participant.paintColor.slice(1), 16), 1).fillCircle(px, py, participant.isPlayer ? 4 : 3);
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
        id: participant.id, name: participant.name, position: index + 1, isPlayer: participant.isPlayer,
        finishTime: participant.finishTime, lapsCompleted: participant.lapsCompleted, paintColor: participant.paintColor,
      })),
    };
    if (this.game.championship.finishRace(result)) this.goTo(SCENES.results);
    else {
      this.loadingLabel.setVisible(true).setText('RESULTADO INVÁLIDO — PROGRESSO PRESERVADO. ESC VOLTA.');
      this.announce('O resultado não pôde ser registrado. Progresso preservado. Escape volta à equipe.');
    }
  }

  layout(w, h) {
    const narrow = w < 700 && w < h;
    const compact = !narrow && h < 600;
    const designW = narrow ? 360 : compact ? 900 : 1200;
    const designH = narrow ? 700 : compact ? 360 : 700;
    this.fitContent(w, h, designW, designH);
    this.setPreviewBounds(0, 0, designW, designH);
    const left = -designW / 2, top = -designH / 2;
    const hudWidth = compact ? 360 : narrow ? 170 : 455;
    const hudHeight = compact ? 78 : 92;
    this.hudFrame.clear().lineStyle(1, 0x71f6ff, 0.62).strokePoints([
      { x: left + 20, y: top + 15 }, { x: left + hudWidth - 15, y: top + 15 },
      { x: left + hudWidth, y: top + 30 }, { x: left + hudWidth, y: top + hudHeight },
      { x: left + 20, y: top + hudHeight },
    ], true);
    this.trackLabel.setPosition(left + 36, top + (compact ? 29 : 34)).setFontSize(narrow ? 9 : compact ? 12 : 15);
    this.difficultyLabel.setPosition(left + 36, top + (compact ? 55 : 65)).setFontSize(narrow ? 7 : compact ? 9 : 10);
    this.positionLabel.setPosition(designW / 2 - 28, top + 26).setFontSize(narrow ? 16 : compact ? 19 : 23);
    this.lapLabel.setPosition(designW / 2 - 28, top + 57).setFontSize(narrow ? 11 : compact ? 13 : 16);
    this.speedLabel.setPosition(left + 38, designH / 2 - (compact ? 72 : 88)).setFontSize(narrow ? 8 : compact ? 9 : 11);
    this.speedValue.setPosition(left + 38, designH / 2 - (compact ? 46 : 53)).setFontSize(narrow ? 26 : compact ? 31 : 38);
    this.playerLabel.setPosition(left + 38, designH / 2 - (compact ? 19 : 24)).setFontSize(narrow ? 8 : compact ? 9 : 12);
    this.vehicleStatus.setPosition(left + 38, designH / 2 - (compact ? 104 : 120))
      .setFontSize(narrow ? 7 : compact ? 8 : 10);
    this.healthOrbs.setPosition(left + 47, designH / 2 - (compact ? 86 : 101));
    const leaderWidth = narrow ? 188 : 230;
    const leaderHeight = compact ? 112 : 132;
    const leaderX = designW / 2 - leaderWidth - (narrow ? 14 : 25);
    const leaderY = top + (compact ? 58 : 75);
    this.leaderFrame.clear().fillStyle(0x07111c, 0.78).fillRoundedRect(leaderX, leaderY, leaderWidth, leaderHeight, 4)
      .lineStyle(1, 0xffb454, 0.72).strokeRoundedRect(leaderX, leaderY, leaderWidth, leaderHeight, 4);
    this.leaderRows.forEach((row, index) => row.setPosition(leaderX + 12, leaderY + 16 + index * (compact ? 22 : 26))
      .setFontSize(narrow ? 7 : compact ? 9 : 11));
    this.minimapFrame.setVisible(!narrow && !compact);
    this.minimap.setVisible(!narrow && !compact);
    this.countdownLabel.setPosition(0, 0).setFontSize(narrow ? 60 : compact ? 68 : 84);
    this.controlsHint.setPosition(0, designH / 2 - (compact ? 12 : 24)).setFontSize(narrow ? 7 : compact ? 8 : 10);
    this.controlsHint.setText(narrow ? 'WASD / SETAS · C CÂMERA · Z ZOOM · SHIFT NITRO'
      : 'W / ↑ ACELERAR   S / ↓ FREAR/RÉ   A / D DIREÇÃO   ESPAÇO FREIO DE MÃO   SHIFT NITRO   C CÂMERA   Z APROXIMAR');
    this.exitButton.setPosition(designW / 2 - 26, designH / 2 - (compact ? 42 : 68)).setFontSize(narrow ? 9 : 11);
    this.cameraNotice.setPosition(0, -designH / 2 + (narrow ? 230 : compact ? 102 : 108)).setFontSize(narrow ? 10 : compact ? 11 : 15);
    this.diagnosticsText?.setPosition(left + 18, top + (compact ? 96 : 120))
      .setFontSize(narrow ? 7 : compact ? 8 : 10).setWordWrapWidth(designW - 36);
    if (this.minimapLayout) this.drawMinimap();
  }
}
