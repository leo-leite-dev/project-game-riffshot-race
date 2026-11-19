import Phaser from 'phaser';
import * as THREE from 'three';
import type { RaceParticipant } from '../race/RaceSimulation.ts';
import { readVehicleControls } from '../race/PlayerController.ts';
import { sampleRaceTrack, sampleTrackAtProgress } from '../race/trackMath.ts';
import { ArcadeVehicleLab, ARCADE_LAB_STEP_SECONDS, ARCADE_LAB_TRACK } from '../physics-lab/ArcadeVehicleLab.ts';
import { ArcadeJumpPresentation, ARCADE_LAB_RAMP_HEIGHT, ARCADE_LAB_RAMP_LENGTH } from '../visuals/race/ArcadeJumpPresentation.ts';
import { SCENES } from '../ui/theme.ts';

const FORWARD = new THREE.Vector3(0, 0, 1);
const UP = new THREE.Vector3(0, 1, 0);
const TRACK_RAIL_HEIGHT = 0.8;

/** Laboratório local que executa a integração horizontal real da corrida. */
export class ArcadePhysicsLabScene extends Phaser.Scene {
  private root: HTMLElement | null = null;
  private threeRenderer: THREE.WebGLRenderer | null = null;
  private world: THREE.Scene | null = null;
  private camera: THREE.PerspectiveCamera | null = null;
  private lab: ArcadeVehicleLab | null = null;
  private readonly jumpPresentation = new ArcadeJumpPresentation();
  private car: THREE.Group | null = null;
  private readonly materials: THREE.Material[] = [];
  private readonly geometries: THREE.BufferGeometry[] = [];
  private readonly heldKeys = new Set<string>();
  private returnToPreparation = false;
  private cameraMode: 'chase' | 'isometric' = 'chase';
  private paused = false;
  private resizeHandler: (() => void) | null = null;
  private keyDownHandler: ((event: KeyboardEvent) => void) | null = null;
  private keyUpHandler: ((event: KeyboardEvent) => void) | null = null;
  private blurHandler: (() => void) | null = null;

  constructor() { super({ key: 'ArcadePhysicsLab' }); }

  init(data?: { returnToPreparation?: boolean }): void {
    this.returnToPreparation = data?.returnToPreparation === true;
  }

  create(): void {
    document.body.classList.add('physics-lab-active');
    this.game.canvas.style.visibility = 'hidden';
    this.lab = new ArcadeVehicleLab();
    this.createOverlay();
    if (this.root) {
      this.root.dataset.labEngine = 'arcade-race-simulation';
      this.root.dataset.labScene = 'ArcadePhysicsLab';
    }
    this.createWorld();
    this.installInput();
    this.resizeHandler = () => this.resize();
    window.addEventListener('resize', this.resizeHandler);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.cleanup, this);
    this.events.once(Phaser.Scenes.Events.DESTROY, this.cleanup, this);
  }

  update(_time: number, deltaMs: number): void {
    if (!this.lab || !this.threeRenderer || !this.world || !this.camera || !this.car) return;
    const keys = Object.fromEntries(['w', 'a', 's', 'd', 'arrowup', 'arrowleft', 'arrowdown', 'arrowright', 'space']
      .map(key => [key.toUpperCase() === 'SPACE' ? 'SPACE' : key.toUpperCase(),
        { isDown: this.heldKeys.has(key) }]));
    const controls = readVehicleControls(keys, this.lab.car);
    const deltaSeconds = Math.min(Math.max(deltaMs / 1000, 0), 0.1);
    if (!this.paused) this.lab.advance(deltaSeconds, controls);

    const participant = this.lab.car;
    const jump = ARCADE_LAB_TRACK.jumps![0]!;
    const visualPose = this.jumpPresentation.update({
      airborne: participant.airborne,
      airborneElapsed: participant._airborneElapsed,
      verticalVelocity: participant.verticalVelocity,
      speed: participant.speed,
      trackDistance: participant._distance,
      totalTrackLength: this.lab.race.track.totalLength,
      jump,
      deltaSeconds: this.paused ? 0 : deltaSeconds,
    });
    this.car.position.set(participant.x,
      participant.y + 0.55 + visualPose.rampOffset + visualPose.suspensionOffset, participant.z);
    this.car.rotation.y = participant.heading;
    this.car.rotation.x = visualPose.pitch;
    this.updateCamera(participant, deltaMs / 1000);
    this.updateReadout(controls, visualPose);
    this.threeRenderer.render(this.world, this.camera);
  }

  private createOverlay(): void {
    const root = document.createElement('main');
    root.dataset.physicsLabRoot = 'true';
    Object.assign(root.style, { position: 'fixed', inset: '0', zIndex: '10000', overflow: 'hidden',
      background: '#101923', color: '#e6f2fa', font: '14px/1.4 Consolas, monospace' });
    root.innerHTML = `<canvas data-physics-lab-canvas aria-label="Pista experimental arcade 3D"></canvas>
      <section data-physics-lab-panel aria-label="Laboratório de dirigibilidade arcade">
        <header><strong>LABORATÓRIO ARCADE / CORRIDA PRINCIPAL</strong><span data-physics-lab-status>RaceSimulation ativa · salto vertical arcade isolado</span></header>
        <p>W acelera · S freia/ré · A/D vira · C alterna câmera · R reinicia · P pausa</p>
        <nav><button type="button" data-camera-toggle>CÂMERA: TERCEIRA PESSOA [C]</button>
          <button type="button" data-pause-toggle>PAUSAR [P]</button>
          <button type="button" data-reset>REINICIAR [R]</button>
          <button type="button" data-close>SAIR DO LAB</button></nav>
        <pre data-physics-lab-readout></pre>
      </section>`;
    Object.assign(root.querySelector<HTMLElement>('[data-physics-lab-panel]')!.style,
      { position: 'absolute', top: '14px', left: '14px', width: 'min(520px, calc(100vw - 28px))',
        padding: '14px', zIndex: '2', background: 'rgba(4, 12, 20, 0.92)',
        border: '1px solid #477386', borderRadius: '8px', boxShadow: '0 8px 36px rgba(0,0,0,.45)' });
    Object.assign(root.querySelector<HTMLElement>('header')!.style,
      { display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '8px 18px' });
    Object.assign(root.querySelector<HTMLCanvasElement>('canvas')!.style,
      { position: 'absolute', inset: '0', width: '100%', height: '100%', zIndex: '1', pointerEvents: 'none' });
    root.querySelectorAll('button').forEach(button => Object.assign(button.style,
      { margin: '0 6px 6px 0', padding: '8px 10px', color: '#f0f7fb', background: '#183344',
        border: '1px solid #487286', borderRadius: '4px', cursor: 'pointer', font: 'bold 11px Consolas, monospace' }));
    Object.assign(root.querySelector<HTMLElement>('pre')!.style,
      { minHeight: '120px', color: '#bde8f5', whiteSpace: 'pre-wrap' });
    root.querySelector('[data-camera-toggle]')!.addEventListener('click', () => this.toggleCamera());
    root.querySelector('[data-pause-toggle]')!.addEventListener('click', () => this.togglePause());
    root.querySelector('[data-reset]')!.addEventListener('click', () => this.reset());
    root.querySelector('[data-close]')!.addEventListener('click', () => this.exitLab());
    document.body.append(root);
    this.root = root;
  }

  private createWorld(): void {
    const canvas = this.root!.querySelector<HTMLCanvasElement>('canvas')!;
    this.threeRenderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.threeRenderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.threeRenderer.outputColorSpace = THREE.SRGBColorSpace;
    this.threeRenderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.world = new THREE.Scene();
    this.world.background = new THREE.Color('#171d2a');
    this.world.fog = new THREE.Fog('#171d2a', 100, 270);
    this.camera = new THREE.PerspectiveCamera(55, 1, 0.1, 400);
    this.world.add(new THREE.HemisphereLight(0xd8ecff, 0x202735, 1.7));
    const keyLight = new THREE.DirectionalLight(0xffdfbd, 2.1);
    keyLight.position.set(-45, 70, 15);
    this.world.add(keyLight);
    this.addTrack();
    this.addCar();
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(360, 360), this.material(0x121923, 0.92));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.35;
    this.world.add(ground);
    this.addRamp(ARCADE_LAB_TRACK.jumps![0]!.takeoff, ARCADE_LAB_RAMP_LENGTH, ARCADE_LAB_RAMP_HEIGHT);
    this.addFeature(ARCADE_LAB_TRACK.jumps![0]!.landingStart + 0.02, 14, 0.18, 0x46d6b2);
    this.camera.position.set(0, 6.05, -13);
    this.camera.lookAt(0, 1.05, -3);
    this.resize();
  }

  private addTrack(): void {
    const sampled = sampleRaceTrack(ARCADE_LAB_TRACK, 24);
    const halfWidth = ARCADE_LAB_TRACK.width / 2;
    const railPoints: THREE.Vector3[][] = [[], []];
    sampled.points.forEach((point, index) => {
      const next = sampled.points[(index + 1) % sampled.points.length]!;
      const dx = next.x - point.x, dz = next.z - point.z;
      const length = Math.hypot(dx, dz) || 1;
      const sideX = -dz / length, sideZ = dx / length;
      const y = point.y;
      railPoints[0]!.push(new THREE.Vector3(point.x + sideX * halfWidth, y + TRACK_RAIL_HEIGHT, point.z + sideZ * halfWidth));
      railPoints[1]!.push(new THREE.Vector3(point.x - sideX * halfWidth, y + TRACK_RAIL_HEIGHT, point.z - sideZ * halfWidth));
    });
    const contours = railPoints.map(points => points.map(point => new THREE.Vector2(point.x, -point.z)));
    const [outer, inner] = contours.sort((a, b) => Math.abs(signedArea(b)) - Math.abs(signedArea(a)));
    const roadShape = new THREE.Shape(outer!);
    roadShape.holes.push(new THREE.Path(inner!));
    const roadGeometry = new THREE.ShapeGeometry(roadShape, 1);
    roadGeometry.rotateX(-Math.PI / 2);
    this.geometries.push(roadGeometry);
    const road = new THREE.Mesh(roadGeometry, this.material(0x394954, 0.72));
    road.material.side = THREE.DoubleSide;
    this.world!.add(road);

    const railMaterial = this.material(0x39d7db, 0.35, 0.65);
    for (const points of railPoints) {
      const railGeometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points, true), points.length * 2, 0.18, 6, true);
      this.geometries.push(railGeometry);
      this.world!.add(new THREE.Mesh(railGeometry, railMaterial));
    }
    const grid = new THREE.GridHelper(340, 80, 0x33505b, 0x243641);
    grid.position.y = -0.36;
    this.world!.add(grid);
    this.geometries.push(grid.geometry);
    for (const item of Array.isArray(grid.material) ? grid.material : [grid.material]) this.materials.push(item);
  }

  private addFeature(progress: number, length: number, height: number, color: number): void {
    const sampled = this.lab!.race.track;
    const center = sampleTrackAtProgress(sampled, sampled.totalLength * progress);
    const ahead = sampleTrackAtProgress(sampled, center.distance + 1);
    const angle = Math.atan2(ahead.tangentX, ahead.tangentZ);
    const ramp = new THREE.Mesh(new THREE.BoxGeometry(length, height, ARCADE_LAB_TRACK.width - 1.5),
      this.material(color, 0.42, 0.58));
    ramp.position.set(center.x, center.y + height / 2, center.z);
    ramp.rotation.y = angle;
    this.world!.add(ramp);
    this.geometries.push(ramp.geometry);
  }

  private addRamp(progress: number, length: number, height: number): void {
    const sampled = this.lab!.race.track;
    const center = sampleTrackAtProgress(sampled, sampled.totalLength * progress - length);
    const ahead = sampleTrackAtProgress(sampled, center.distance + 1);
    const angle = Math.atan2(ahead.tangentX, ahead.tangentZ);
    const halfWidth = ARCADE_LAB_TRACK.width / 2 - 1.2;
    const vertices = [
      -halfWidth, 0.08, 0, halfWidth, 0.08, 0,
      -halfWidth, height, length, halfWidth, height, length,
      -halfWidth, 0, 0, halfWidth, 0, 0,
      -halfWidth, 0, length, halfWidth, 0, length,
    ];
    const indices = [0, 2, 1, 1, 2, 3,
      0, 4, 6, 0, 6, 2, 1, 3, 7, 1, 7, 5,
      0, 1, 5, 0, 5, 4, 2, 6, 7, 2, 7, 3];
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    this.geometries.push(geometry);
    const ramp = new THREE.Mesh(geometry, this.material(0xffb347, 0.42, 0.58));
    ramp.position.set(center.x, center.y, center.z);
    ramp.rotation.y = angle;
    this.world!.add(ramp);
  }

  private addCar(): void {
    this.car = new THREE.Group();
    this.car.rotation.order = 'YXZ';
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.32, 0.58, 2.5), this.material(0xd74732, 0.32, 0.42));
    body.position.y = 0.05;
    this.car.add(body);
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.08, 0.5, 1.05), this.material(0x8bd0df, 0.18, 0.28));
    cabin.position.set(-0.1, 0.52, 0);
    this.car.add(cabin);
    const tireGeometry = new THREE.CylinderGeometry(0.38, 0.38, 0.24, 16);
    tireGeometry.rotateZ(Math.PI / 2);
    this.geometries.push(tireGeometry);
    const tireMaterial = this.material(0x11151b, 0.82, 0.85);
    for (const x of [-0.68, 0.68]) for (const z of [-0.78, 0.78]) {
      const tire = new THREE.Mesh(tireGeometry, tireMaterial);
      tire.position.set(x, -0.24, z);
      this.car.add(tire);
    }
    this.world!.add(this.car);
  }

  private material(color: THREE.ColorRepresentation, roughness: number, metalness = 0.1): THREE.MeshStandardMaterial {
    const result = new THREE.MeshStandardMaterial({ color, roughness, metalness });
    this.materials.push(result);
    return result;
  }

  private updateCamera(car: RaceParticipantView, deltaSeconds: number): void {
    if (!this.camera) return;
    const forward = FORWARD.clone().applyAxisAngle(UP, car.heading);
    const target = new THREE.Vector3(car.x, car.y + 0.5, car.z);
    const desired = this.cameraMode === 'chase'
      ? target.clone().addScaledVector(forward, -10).add(new THREE.Vector3(0, 5, 0))
      : target.clone().add(new THREE.Vector3(0, 82, 48));
    if (this.cameraMode === 'chase') this.camera.position.lerp(desired, 1 - Math.exp(-Math.min(deltaSeconds, 0.1) * 4));
    else this.camera.position.copy(desired);
    this.camera.lookAt(target);
  }

  private updateReadout(controls: ReturnType<typeof readVehicleControls>, visualPose: { pitch: number; suspensionOffset: number }): void {
    if (!this.lab || !this.root) return;
    const car = this.lab.car;
    this.root.dataset.speedMps = String(car.speed);
    this.root.dataset.airborne = String(car.airborne);
    this.root.dataset.paused = String(this.paused);
    this.root.dataset.takeoffs = String(this.lab.takeoffs);
    this.root.dataset.landings = String(this.lab.landings);
    this.root.dataset.steering = String(controls.steer);
    this.root.dataset.heading = String(car.heading);
    this.root.dataset.pitch = String(visualPose.pitch);
    this.root.dataset.suspensionOffset = String(visualPose.suspensionOffset);
    const jumpDiagnostics = this.jumpPresentation.diagnostics();
    this.root.dataset.takeoffPitch = String(jumpDiagnostics.takeoffPitch);
    this.root.dataset.maximumDescentPitch = String(jumpDiagnostics.maximumDescentPitch);
    this.root.dataset.maximumSuspensionCompression = String(jumpDiagnostics.maximumCompression);
    this.root.dataset.maximumSuspensionRecovery = String(jumpDiagnostics.maximumRecovery);
    this.root.dataset.simulationTimeSeconds = String(this.lab.timeSeconds);
    this.root.dataset.region = car.airborne ? 'air' : car.y > 0.4 ? 'ramp-or-platform' : 'track';
    this.root.querySelector<HTMLElement>('[data-physics-lab-readout]')!.textContent = [
      `ESTADO ${car.airborne ? 'NO AR' : 'NO SOLO'} · ${this.lab.takeoffs} saltos / ${this.lab.landings} aterrissagens · ${car._activeJumpId ?? '—'}`,
      `velocidade ${car.speed.toFixed(2)} m/s · altura ${car.y.toFixed(2)} m · v vertical ${car.verticalVelocity.toFixed(2)} m/s`,
      `aceleração ${controls.throttle.toFixed(2)} · freio ${controls.brake.toFixed(2)} · direção ${controls.steer.toFixed(2)} · drift ${car._driftBoost.toFixed(2)}`,
      `pitch visual ${(visualPose.pitch * 180 / Math.PI).toFixed(1)}° · curso da suspensão ${visualPose.suspensionOffset.toFixed(3)} m`,
      `tempo simulado ${this.lab.timeSeconds.toFixed(2)} s · passo fixo ${ARCADE_LAB_STEP_SECONDS.toFixed(4)} s`,
      `física horizontal: RaceSimulation oficial · gravidade/salto arcade separado no eixo vertical`,
    ].join('\n');
  }

  private installInput(): void {
    this.keyDownHandler = event => {
      const key = event.key.toLowerCase();
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowleft', 'arrowdown', 'arrowright', ' ', 'c', 'r', 'p'].includes(key)) event.preventDefault();
      this.heldKeys.add(key);
      if (event.repeat) return;
      if (key === 'c') this.toggleCamera();
      if (key === 'p') this.togglePause();
      if (key === 'r') this.reset();
    };
    this.keyUpHandler = event => this.heldKeys.delete(event.key.toLowerCase());
    this.blurHandler = () => this.heldKeys.clear();
    window.addEventListener('keydown', this.keyDownHandler);
    window.addEventListener('keyup', this.keyUpHandler);
    window.addEventListener('blur', this.blurHandler);
  }

  private toggleCamera(): void {
    this.cameraMode = this.cameraMode === 'chase' ? 'isometric' : 'chase';
    this.root?.querySelector('[data-camera-toggle]')?.replaceChildren(document.createTextNode(
      `CÂMERA: ${this.cameraMode === 'chase' ? 'TERCEIRA PESSOA' : 'ISOMÉTRICA'} [C]`));
  }

  private togglePause(): void {
    this.paused = !this.paused;
    this.root?.querySelector('[data-pause-toggle]')?.replaceChildren(document.createTextNode(this.paused ? 'CONTINUAR [P]' : 'PAUSAR [P]'));
  }

  private reset(): void {
    this.lab?.reset();
    this.jumpPresentation.reset();
    this.paused = false;
    this.heldKeys.clear();
    this.togglePauseLabel();
  }

  private togglePauseLabel(): void {
    this.root?.querySelector('[data-pause-toggle]')?.replaceChildren(document.createTextNode('PAUSAR [P]'));
  }

  private exitLab(): void {
    if (!this.returnToPreparation) {
      window.location.assign(window.location.pathname);
      return;
    }
    this.scene.stop('ArcadePhysicsLab');
    this.scene.stop('PhysicsLabBootstrap');
    this.scene.resume(SCENES.preparation);
  }

  private resize(): void {
    if (!this.threeRenderer || !this.camera) return;
    this.threeRenderer.setSize(Math.max(2, window.innerWidth), Math.max(2, window.innerHeight), false);
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
  }

  private cleanup(): void {
    if (this.keyDownHandler) window.removeEventListener('keydown', this.keyDownHandler);
    if (this.keyUpHandler) window.removeEventListener('keyup', this.keyUpHandler);
    if (this.blurHandler) window.removeEventListener('blur', this.blurHandler);
    if (this.resizeHandler) window.removeEventListener('resize', this.resizeHandler);
    this.heldKeys.clear();
    this.geometries.forEach(geometry => geometry.dispose());
    this.materials.forEach(material => material.dispose());
    this.threeRenderer?.dispose();
    this.root?.remove();
    this.game.canvas.style.visibility = '';
    document.body.classList.remove('physics-lab-active');
  }
}

type RaceParticipantView = Pick<RaceParticipant, 'x' | 'y' | 'z' | 'heading'>;

function signedArea(points: THREE.Vector2[]): number {
  let area = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index]!;
    const next = points[(index + 1) % points.length]!;
    area += current.x * next.y - next.x * current.y;
  }
  return area / 2;
}
