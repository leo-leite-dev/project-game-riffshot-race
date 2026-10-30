import Phaser from 'phaser';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { LAB_TUNING, RapierVehicleLab, initializeRapierLab, type LabControls, type LabSnapshot } from '../physics-lab/RapierVehicleLab.ts';

type LabWheelView = { mesh: THREE.Mesh; debugRay: THREE.Line; contact: THREE.Mesh };
const LAB_LOCAL_FORWARD = new THREE.Vector3(1, 0, 0);

/** Entirely isolated local sandbox: no RaceSimulation, Championship, or save access. */
export class PhysicsLabScene extends Phaser.Scene {
  private root: HTMLElement | null = null;
  private threeRenderer: THREE.WebGLRenderer | null = null;
  private labScene: THREE.Scene | null = null;
  private camera: THREE.PerspectiveCamera | null = null;
  private simulation: RapierVehicleLab | null = null;
  private vehicleRoot: THREE.Group | null = null;
  private wheelViews: LabWheelView[] = [];
  private readonly ownedGeometries = new Set<THREE.BufferGeometry>();
  private readonly ownedMaterials = new Set<THREE.Material>();
  private debugLines: THREE.LineSegments | null = null;
  private readonly heldKeys = new Set<string>();
  private pitchAssistEnabled = true;
  private debugEnabled = true;
  private pauseOnEventsEnabled = false;
  private paused = false;
  private uiElapsed = 0;
  private resizeHandler: (() => void) | null = null;
  private keyDownHandler: ((event: KeyboardEvent) => void) | null = null;
  private keyUpHandler: ((event: KeyboardEvent) => void) | null = null;
  private blurHandler: (() => void) | null = null;

  constructor() { super({ key: 'PhysicsLab3D' }); }

  create(): void {
    document.body.classList.add('physics-lab-active');
    this.game.canvas.style.visibility = 'hidden';
    this.createOverlay();
    this.installInput();
    this.resizeHandler = () => this.resize();
    window.addEventListener('resize', this.resizeHandler);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.cleanup, this);
    this.events.once(Phaser.Scenes.Events.DESTROY, this.cleanup, this);
    void this.loadPhysics();
  }

  update(_time: number, deltaMs: number): void {
    if (!this.simulation || !this.threeRenderer || !this.labScene || !this.camera || !this.vehicleRoot) return;
    const controls = this.readControls();
    let interpolation = this.simulation.accumulator / this.simulation.fixedStep;
    if (!this.paused) {
      const before = this.simulation.snapshot();
      interpolation = this.simulation.advance(deltaMs / 1000, controls, this.pitchAssistEnabled);
      const after = this.simulation.snapshot();
      if (this.pauseOnEventsEnabled && (after.takeoffCount > before.takeoffCount || after.landingCount > before.landingCount)) {
        this.paused = true;
        this.refreshButtons();
      }
    }
    const snapshot = this.simulation.snapshot();
    const pose = this.simulation.interpolatedPose(interpolation);
    this.vehicleRoot.position.copy(pose.position);
    this.vehicleRoot.quaternion.copy(pose.rotation);
    this.vehicleRoot.updateMatrixWorld(true);
    this.updateWheels(snapshot);
    this.updateCamera(snapshot, deltaMs / 1000);
    if (this.debugLines) this.debugLines.visible = this.debugEnabled;
    if (this.debugEnabled && this.uiElapsed >= 1 / 12) this.updateDebugGeometry();
    this.threeRenderer.render(this.labScene, this.camera);
    this.uiElapsed += Math.min(deltaMs / 1000, 0.1);
    if (this.uiElapsed >= 0.1) {
      this.uiElapsed %= 0.1;
      this.updateReadout(snapshot, controls);
    }
  }

  private async loadPhysics(): Promise<void> {
    this.setStatus('INICIALIZANDO RAPier / WebAssembly…');
    try {
      await initializeRapierLab();
      if (!this.sys.isActive()) return;
      this.simulation = new RapierVehicleLab();
      this.createThreeScene();
      this.setStatus(`v${RAPIER.version()} · 4 raycasts de roda · passo fixo 1/60 s`);
      this.updateReadout(this.simulation.snapshot(), { throttle: 0, brake: 0, steer: 0 });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.setStatus(`FALHA AO INICIAR RAPier: ${message}`);
    }
  }

  private createOverlay(): void {
    const root = document.createElement('main');
    root.dataset.physicsLabRoot = 'true';
    Object.assign(root.style, { position: 'fixed', inset: '0', zIndex: '10000', overflow: 'hidden',
      background: '#101923', color: '#e6f2fa', font: '14px/1.35 Consolas, monospace' });
    root.innerHTML = `
      <canvas data-physics-lab-canvas aria-label="Pista de teste 3D com física Rapier"></canvas>
      <section data-physics-lab-panel aria-label="Diagnóstico da física experimental">
        <header><strong>LABORATÓRIO 3D / RAPIER</strong><span data-physics-lab-status>Carregando…</span></header>
        <p>PISTA SINTÉTICA · sem campeonato ou save · W/S acelera/freia/ré · A/D vira · R reinicia</p>
        <nav>
          <button type="button" data-assist-toggle>ASSISTÊNCIA DE PITCH: LIGADA</button>
          <button type="button" data-debug-toggle>DEBUG FÍSICO: LIGADO</button>
          <button type="button" data-pause-events-toggle>PAUSA NOS EVENTOS: DESLIGADA [E]</button>
          <button type="button" data-pause-toggle>PAUSAR FÍSICA [P]</button>
          <button type="button" data-reset>REINICIAR VEÍCULO</button>
          <button type="button" data-close>SAIR DO LAB</button>
        </nav>
        <pre data-physics-lab-readout>Esperando Rapier…</pre>
        <details><summary>AJUSTES DE SUSPENSÃO / VEÍCULO</summary><pre data-physics-lab-tuning></pre></details>
      </section>`;
    Object.assign(root.querySelector<HTMLElement>('[data-physics-lab-panel]')!.style,
      { position: 'absolute', top: '14px', left: '14px', width: 'min(570px, calc(100vw - 28px))',
        maxHeight: 'calc(100vh - 28px)', overflow: 'auto', padding: '14px', zIndex: '2',
        background: 'rgba(4, 12, 20, 0.93)', border: '1px solid #477386', borderRadius: '8px',
        boxShadow: '0 8px 36px rgba(0,0,0,.45)' });
    Object.assign(root.querySelector<HTMLElement>('header')!.style,
      { display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '8px 18px' });
    const canvas = root.querySelector<HTMLCanvasElement>('[data-physics-lab-canvas]')!;
    Object.assign(canvas.style, { position: 'absolute', inset: '0', width: '100%', height: '100%',
      zIndex: '1', pointerEvents: 'none' });
    const buttons = root.querySelectorAll('button');
    buttons.forEach(button => Object.assign(button.style, { margin: '0 6px 6px 0', padding: '8px 10px',
      color: '#f0f7fb', background: '#183344', border: '1px solid #487286', borderRadius: '4px',
      cursor: 'pointer', font: 'bold 11px Consolas, monospace' }));
    const readout = root.querySelector<HTMLElement>('[data-physics-lab-readout]')!;
    Object.assign(readout.style, { minHeight: '142px', color: '#bde8f5', whiteSpace: 'pre-wrap' });
    root.querySelector<HTMLElement>('[data-physics-lab-status]')!.style.color = '#7ce8b0';
    root.querySelector<HTMLElement>('[data-physics-lab-tuning]')!.textContent = Object.entries(LAB_TUNING)
      .map(([name, value]) => `${name}: ${typeof value === 'number' ? value : JSON.stringify(value)}`).join('\n');
    root.querySelector<HTMLButtonElement>('[data-assist-toggle]')!.addEventListener('click', () => {
      this.pitchAssistEnabled = !this.pitchAssistEnabled;
      this.refreshButtons();
    });
    root.querySelector<HTMLButtonElement>('[data-debug-toggle]')!.addEventListener('click', () => {
      this.debugEnabled = !this.debugEnabled;
      this.refreshButtons();
    });
    root.querySelector<HTMLButtonElement>('[data-pause-events-toggle]')!.addEventListener('click', () => {
      this.pauseOnEventsEnabled = !this.pauseOnEventsEnabled;
      this.refreshButtons();
    });
    root.querySelector<HTMLButtonElement>('[data-pause-toggle]')!.addEventListener('click', () => this.togglePause());
    root.querySelector<HTMLButtonElement>('[data-reset]')!.addEventListener('click', () => this.simulation?.reset());
    root.querySelector<HTMLButtonElement>('[data-close]')!.addEventListener('click', () => {
      window.location.assign(window.location.pathname);
    });
    document.body.append(root);
    this.root = root;
  }

  private createThreeScene(): void {
    if (!this.simulation || !this.root) return;
    const canvas = this.root.querySelector<HTMLCanvasElement>('[data-physics-lab-canvas]')!;
    this.threeRenderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.threeRenderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.threeRenderer.outputColorSpace = THREE.SRGBColorSpace;
    this.threeRenderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.threeRenderer.toneMappingExposure = 1;
    this.labScene = new THREE.Scene();
    this.labScene.background = new THREE.Color('#18222d');
    this.labScene.fog = new THREE.Fog('#18222d', 70, 180);
    this.camera = new THREE.PerspectiveCamera(54, 1, 0.1, 250);
    this.camera.position.set(0, 6, -9);

    const ambient = new THREE.HemisphereLight(0xe4f4ff, 0x202c38, 1.8);
    this.labScene.add(ambient);
    const sun = new THREE.DirectionalLight(0xffffff, 2.3);
    sun.position.set(-15, 25, -5);
    this.labScene.add(sun);
    this.addTrackMeshes();
    this.addVehicleMeshes();
    this.addDebugObjects();
    this.resize();
  }

  private addTrackMeshes(): void {
    const scene = this.labScene!;
    const roadMaterial = new THREE.MeshStandardMaterial({ color: 0x455b65,
      roughness: 0.86, metalness: 0.12, side: THREE.DoubleSide });
    this.ownedMaterials.add(roadMaterial);
    const track = new THREE.Group();
    track.name = 'lab-original-physical-track';
    for (const chunk of this.simulation!.trackChunks) {
      const geometry = new THREE.BufferGeometry();
      this.ownedGeometries.add(geometry);
      geometry.setAttribute('position', new THREE.BufferAttribute(chunk.vertices, 3));
      geometry.setIndex(new THREE.BufferAttribute(chunk.indices, 1));
      geometry.computeVertexNormals();
      const surface = new THREE.Mesh(geometry, roadMaterial);
      surface.name = `visual-${chunk.name}`;
      track.add(surface);
    }
    const floorGeometry = new THREE.PlaneGeometry(180, 190);
    const floorMaterial = new THREE.MeshStandardMaterial({ color: 0x15212a, roughness: 0.95 });
    this.ownedGeometries.add(floorGeometry);
    this.ownedMaterials.add(floorMaterial);
    const catchFloor = new THREE.Mesh(floorGeometry, floorMaterial);
    catchFloor.rotation.x = -Math.PI / 2;
    catchFloor.position.set(0, -16.55, 55);
    track.add(catchFloor);
    scene.add(track);
    const grid = new THREE.GridHelper(160, 80, 0x3c5a66, 0x253944);
    this.ownedGeometries.add(grid.geometry);
    for (const material of Array.isArray(grid.material) ? grid.material : [grid.material]) this.ownedMaterials.add(material);
    scene.add(grid);
  }

  private addVehicleMeshes(): void {
    const scene = this.labScene!;
    this.vehicleRoot = new THREE.Group();
    this.vehicleRoot.name = 'lab-rapier-chassis-visual';
    const bodyGeometry = new THREE.BoxGeometry(2.3, 0.5, 1.15);
    const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0x2fb3c9, metalness: 0.55, roughness: 0.34 });
    this.ownedGeometries.add(bodyGeometry);
    this.ownedMaterials.add(bodyMaterial);
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.position.y = 0.04;
    this.vehicleRoot.add(body);
    const cabinGeometry = new THREE.BoxGeometry(0.9, 0.42, 0.9);
    const cabinMaterial = new THREE.MeshStandardMaterial({ color: 0xbce9ef, metalness: 0.25, roughness: 0.25 });
    this.ownedGeometries.add(cabinGeometry);
    this.ownedMaterials.add(cabinMaterial);
    const cabin = new THREE.Mesh(cabinGeometry, cabinMaterial);
    cabin.position.set(-0.12, 0.42, 0);
    this.vehicleRoot.add(cabin);
    const bumperGeometry = new THREE.BoxGeometry(0.13, 0.18, 1.24);
    const bumperMaterial = new THREE.MeshStandardMaterial({ color: 0xdba24a, metalness: 0.55, roughness: 0.3 });
    this.ownedGeometries.add(bumperGeometry);
    this.ownedMaterials.add(bumperMaterial);
    const bumper = new THREE.Mesh(bumperGeometry, bumperMaterial);
    bumper.position.x = 1.17;
    this.vehicleRoot.add(bumper);

    const wheelGeometry = new THREE.CylinderGeometry(LAB_TUNING.wheelRadiusM,
      LAB_TUNING.wheelRadiusM, 0.23, 18);
    wheelGeometry.rotateX(Math.PI / 2);
    const wheelMaterial = new THREE.MeshStandardMaterial({ color: 0x11171d, roughness: 0.9 });
    const contactMaterial = new THREE.MeshBasicMaterial({ color: 0x55ef99 });
    this.ownedGeometries.add(wheelGeometry);
    this.ownedMaterials.add(wheelMaterial);
    this.ownedMaterials.add(contactMaterial);
    this.wheelViews = [];
    for (let index = 0; index < 4; index += 1) {
      const wheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
      this.vehicleRoot.add(wheel);
      const contactGeometry = new THREE.SphereGeometry(0.09, 8, 6);
      this.ownedGeometries.add(contactGeometry);
      const contact = new THREE.Mesh(contactGeometry, contactMaterial);
      this.labScene!.add(contact);
      const rayGeometry = new THREE.BufferGeometry();
      rayGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
      const rayMaterial = new THREE.LineBasicMaterial({ color: 0xff7b68 });
      this.ownedGeometries.add(rayGeometry);
      this.ownedMaterials.add(rayMaterial);
      const ray = new THREE.Line(rayGeometry, rayMaterial);
      this.labScene!.add(ray);
      this.wheelViews.push({ mesh: wheel, debugRay: ray, contact });
    }
    scene.add(this.vehicleRoot);
  }

  private addDebugObjects(): void {
    const geometry = new THREE.BufferGeometry();
    const material = new THREE.LineBasicMaterial({ color: 0x74e9aa, transparent: true, opacity: 0.9 });
    this.ownedGeometries.add(geometry);
    this.ownedMaterials.add(material);
    this.debugLines = new THREE.LineSegments(geometry, material);
    this.debugLines.name = 'rapier-collider-debug-render';
    this.labScene!.add(this.debugLines);
  }

  private updateWheels(state: LabSnapshot): void {
    if (!this.vehicleRoot) return;
    this.vehicleRoot.updateMatrixWorld(true);
    for (const wheel of state.wheels) {
      const view = this.wheelViews[wheel.index]!;
      const center = wheel.contactPoint && wheel.contactNormal
        ? wheel.contactPoint.clone().addScaledVector(wheel.contactNormal, LAB_TUNING.wheelRadiusM)
        : wheel.hardPoint.clone().addScaledVector(wheel.rayDirection,
          wheel.suspensionLengthM + LAB_TUNING.wheelRadiusM);
      const local = this.vehicleRoot.worldToLocal(center);
      view.mesh.position.copy(local);
      view.mesh.rotation.z = wheel.rotation;
      view.contact.visible = wheel.inContact && this.debugEnabled;
      if (view.contact.visible) view.contact.position.copy(wheel.contactPoint!);
      view.debugRay.visible = this.debugEnabled;
      const rayEnd = wheel.contactPoint
        ?? wheel.hardPoint.clone().addScaledVector(wheel.rayDirection,
          LAB_TUNING.suspensionRestLengthM + LAB_TUNING.wheelRadiusM + LAB_TUNING.suspensionMaxTravelM);
      const positions = view.debugRay.geometry.getAttribute('position') as THREE.BufferAttribute;
      positions.setXYZ(0, wheel.hardPoint.x, wheel.hardPoint.y, wheel.hardPoint.z);
      positions.setXYZ(1, rayEnd.x, rayEnd.y, rayEnd.z);
      positions.needsUpdate = true;
      (view.debugRay.material as THREE.LineBasicMaterial).color.set(wheel.inContact ? 0x54ec93 : 0xff7868);
    }
  }

  private updateDebugGeometry(): void {
    if (!this.simulation || !this.debugLines) return;
    const buffers = this.simulation.debugRenderBuffers();
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(buffers.vertices), 3));
    const previous = this.debugLines.geometry;
    this.debugLines.geometry = geometry;
    this.ownedGeometries.delete(previous);
    this.ownedGeometries.add(geometry);
    previous.dispose();
  }

  private updateCamera(state: LabSnapshot, deltaSeconds: number): void {
    if (!this.camera) return;
    const forward = LAB_LOCAL_FORWARD.clone().applyQuaternion(state.rotation).normalize();
    const desired = state.position.clone().addScaledVector(forward, -8).add(new THREE.Vector3(0, 4.5, 0));
    const follow = 1 - Math.exp(-Math.max(0, Math.min(deltaSeconds, 0.1)) * 4.5);
    this.camera.position.lerp(desired, follow);
    const target = state.position.clone().addScaledVector(forward, 3).add(new THREE.Vector3(0, 0.8, 0));
    this.camera.lookAt(target);
  }

  private readControls(): LabControls {
    const accelerate = this.heldKeys.has('w') || this.heldKeys.has('arrowup');
    const reverseOrBrake = this.heldKeys.has('s') || this.heldKeys.has('arrowdown');
    const speed = this.simulation?.vehicle.currentVehicleSpeed() ?? 0;
    return {
      throttle: accelerate ? 1 : reverseOrBrake && Math.abs(speed) < 0.75 ? -1 : 0,
      brake: reverseOrBrake && Math.abs(speed) >= 0.75 ? 1 : 0,
      steer: (this.heldKeys.has('d') || this.heldKeys.has('arrowright') ? 1 : 0)
        - (this.heldKeys.has('a') || this.heldKeys.has('arrowleft') ? 1 : 0),
    };
  }

  private installInput(): void {
    this.keyDownHandler = event => {
      const key = event.key.toLowerCase();
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowleft', 'arrowdown', 'arrowright', 'r', 't', 'b', 'e', 'p'].includes(key)) {
        event.preventDefault();
      }
      this.heldKeys.add(key);
      if (event.repeat) return;
      if (key === 'r') this.simulation?.reset();
      if (key === 't') { this.pitchAssistEnabled = !this.pitchAssistEnabled; this.refreshButtons(); }
      if (key === 'b') { this.debugEnabled = !this.debugEnabled; this.refreshButtons(); }
      if (key === 'e') { this.pauseOnEventsEnabled = !this.pauseOnEventsEnabled; this.refreshButtons(); }
      if (key === 'p') this.togglePause();
    };
    this.keyUpHandler = event => this.heldKeys.delete(event.key.toLowerCase());
    this.blurHandler = () => this.heldKeys.clear();
    window.addEventListener('keydown', this.keyDownHandler);
    window.addEventListener('keyup', this.keyUpHandler);
    window.addEventListener('blur', this.blurHandler);
  }

  private updateReadout(state: LabSnapshot, controls: LabControls): void {
    if (!this.root) return;
    const degrees = (radians: number) => (radians * 180 / Math.PI).toFixed(1);
    this.root.dataset.airborne = String(state.airborne);
    this.root.dataset.paused = String(this.paused);
    this.root.dataset.pitchDegrees = degrees(state.pitchRadians);
    this.root.dataset.speedMps = String(state.horizontalSpeedMps);
    this.root.dataset.worldZ = String(state.position.z);
    this.root.dataset.lastEvent = state.lastEvent;
    this.root.dataset.takeoffs = String(state.takeoffCount);
    this.root.dataset.landings = String(state.landingCount);
    this.root.dataset.region = state.position.z < 22 ? 'flat'
      : state.position.z < 37 ? 'ramp' : state.position.z < 46 ? 'jump-gap'
        : state.position.z < 70 ? 'landing' : state.position.z < 82 ? 'descent' : 'banked-turn';
    const wheelLines = state.wheels.map(wheel => `${wheel.label.padEnd(21)} ${wheel.inContact ? 'CONTATO' : 'NO AR   '}`
      + ` · curso ${wheel.suspensionLengthM.toFixed(2)} m · comp. ${wheel.compressionM.toFixed(2)} m`
      + ` · força ${wheel.suspensionForceN.toFixed(1)} N`).join('\n');
    this.root.querySelector<HTMLElement>('[data-physics-lab-readout]')!.textContent = [
      `ESTADO ${state.airborne ? 'AIRBORNE' : state.grounded ? 'NO SOLO' : 'SEM CONTATO INICIAL'} · ${state.lastEvent}`,
      `v horizontal ${state.horizontalSpeedMps.toFixed(2)} m/s · v vertical ${state.verticalSpeedMps.toFixed(2)} m/s · ω ${state.angularVelocity.length().toFixed(2)} rad/s`,
      `pitch ${degrees(state.pitchRadians)}° · roll ${degrees(state.rollRadians)}° · assistência ${this.pitchAssistEnabled ? 'LIGADA' : 'DESLIGADA'}`,
      `assist target ${state.assistTargetPitch === null ? '—' : `${degrees(state.assistTargetPitch)}°`}`
        + ` · torque ${state.assistTorqueNm.toFixed(2)} Nm · controles T${controls.throttle.toFixed(0)} B${controls.brake.toFixed(0)} D${controls.steer.toFixed(0)}`,
      `perda por limite de substeps ${state.droppedSimulationSeconds.toFixed(3)} s`,
      `saltos completos ${state.takeoffCount}/${state.landingCount}`,
      wheelLines,
    ].join('\n');
  }

  private setStatus(message: string): void {
    this.root?.querySelector<HTMLElement>('[data-physics-lab-status]')?.replaceChildren(document.createTextNode(message));
  }

  private refreshButtons(): void {
    if (!this.root) return;
    this.root.querySelector('[data-assist-toggle]')!.textContent = `ASSISTÊNCIA DE PITCH: ${this.pitchAssistEnabled ? 'LIGADA' : 'DESLIGADA'} [T]`;
    this.root.querySelector('[data-debug-toggle]')!.textContent = `DEBUG FÍSICO: ${this.debugEnabled ? 'LIGADO' : 'DESLIGADO'} [B]`;
    this.root.querySelector('[data-pause-events-toggle]')!.textContent = `PAUSA NOS EVENTOS: ${this.pauseOnEventsEnabled ? 'LIGADA' : 'DESLIGADA'} [E]`;
    this.root.querySelector('[data-pause-toggle]')!.textContent = `${this.paused ? 'CONTINUAR' : 'PAUSAR'} FÍSICA [P]`;
  }

  private togglePause(): void {
    this.paused = !this.paused;
    this.refreshButtons();
  }

  private resize(): void {
    if (!this.threeRenderer || !this.camera) return;
    const width = Math.max(2, window.innerWidth), height = Math.max(2, window.innerHeight);
    this.threeRenderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  private cleanup(): void {
    if (this.keyDownHandler) window.removeEventListener('keydown', this.keyDownHandler);
    if (this.keyUpHandler) window.removeEventListener('keyup', this.keyUpHandler);
    if (this.blurHandler) window.removeEventListener('blur', this.blurHandler);
    if (this.resizeHandler) window.removeEventListener('resize', this.resizeHandler);
    this.heldKeys.clear();
    this.simulation?.destroy();
    this.simulation = null;
    this.ownedGeometries.forEach(geometry => geometry.dispose());
    this.ownedMaterials.forEach(material => material.dispose());
    this.ownedGeometries.clear();
    this.ownedMaterials.clear();
    this.threeRenderer?.dispose();
    this.threeRenderer?.domElement.remove();
    this.root?.remove();
    this.game.canvas.style.visibility = '';
    document.body.classList.remove('physics-lab-active');
  }
}
