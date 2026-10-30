import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PAINTS, INITIAL_VEHICLES, VEHICLE, getVehicleById, type Vehicle } from '../../data/vehicles.ts';
import { MechanicalArm } from './MechanicalArm.ts';
import type { GarageResources } from './GarageResources.ts';

type Mode = 'selection' | 'preparation';
type Stage = 'vehicle' | 'paint';
type Vec3 = [number, number, number];
type VehicleObject = THREE.Group & { userData: { size: THREE.Vector3; ownedMaterials?: THREE.Material[]; visualAdapter?: { destroy(): void } } };
type Platform = { neon: THREE.MeshStandardMaterial; ring: THREE.Mesh; group: THREE.Group };

export class GarageWorld {
  resources: GarageResources;
  mode: Mode;
  reducedMotion: boolean;
  stationColor: number;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  ownedMaterials = new Set<THREE.Material>();
  ownedGeometries = new Set<THREE.BufferGeometry>();
  elapsed = 0;
  renderElapsed = 1;
  vehicleOptions: readonly Readonly<Vehicle>[];
  vehicleIndex = 0;
  paintIndex = 0;
  selectionStage: Stage = 'vehicle';
  vehicles: VehicleObject[] = [];
  platforms: Platform[] = [];
  raycaster = new THREE.Raycaster();
  arm?: MechanicalArm;
  spot!: THREE.SpotLight;
  focusIndex = 0;
  focusX = 0;
  cameraFocus = 0;
  confirming = false;
  width = 0;
  height = 0;

  constructor(resources: GarageResources, { mode = 'selection', vehicleId = VEHICLE.id, paintId = 'inferno',
    vehicleIds = INITIAL_VEHICLES.map(vehicle => vehicle.id), reducedMotion = false, stationAccent = 'player' }: {
      mode?: Mode; vehicleId?: string; paintId?: string; vehicleIds?: readonly string[];
      reducedMotion?: boolean; stationAccent?: 'player' | 'rival';
    } = {}) {
    this.resources = resources;
    this.mode = mode;
    this.reducedMotion = reducedMotion;
    this.stationColor = stationAccent === 'rival' ? 0xd336ff : 0xff371a;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#080e1a');
    this.scene.fog = new THREE.FogExp2(0x080e1a, 0.025);
    this.scene.environment = resources.environment.texture;
    this.camera = new THREE.PerspectiveCamera(42, 2, 0.1, 90);
    if (mode === 'preparation') { this.camera.fov = 32; this.camera.zoom = 1.4; }
    this.ownedMaterials = new Set();
    this.ownedGeometries = new Set();
    this.elapsed = 0;
    this.renderElapsed = 1;
    this.vehicleOptions = mode === 'selection' ? vehicleIds.map(getVehicleById).filter((vehicle): vehicle is Readonly<Vehicle> => vehicle !== null)
      : [getVehicleById(vehicleId) ?? VEHICLE];
    this.vehicleIndex = Math.max(0, this.vehicleOptions.findIndex(vehicle => vehicle.id === vehicleId));
    this.paintIndex = Math.max(0, PAINTS.findIndex(paint => paint.id === paintId));
    this.selectionStage = 'vehicle';
    this.vehicles = [];
    this.platforms = [];
    this.raycaster = new THREE.Raycaster();
    this.buildRoom();
    const vehicleOptions = this.vehicleOptions;
    vehicleOptions.forEach((vehicleData, i) => {
      const x = mode === 'selection' ? (i - (vehicleOptions.length - 1) / 2) * 5 : 0;
      const paint = PAINTS[this.paintIndex];
      const vehicle = resources.createVehicle(vehicleData.id, paint, { experimental: true });
      vehicle.scale.multiplyScalar(1.1);
      vehicle.userData.size.multiplyScalar(1.1);
      vehicle.position.set(x, 0.34, 0);
      vehicle.rotation.y = -0.5;
      this.scene.add(vehicle);
      this.vehicles.push(vehicle);
      const platform = new THREE.Group();
      platform.position.x = x;
      this.scene.add(platform);
      const metal = this.material(0x283545, 0.8, 0.36);
      const neon = this.glow(mode === 'preparation' ? this.stationColor : paint.color, 0.9);
      const base = this.mesh(new THREE.CylinderGeometry(2.9, 3.08, 0.38, 72), metal);
      base.position.y = 0.12;
      platform.add(base);
      const ring = this.mesh(new THREE.TorusGeometry(2.76, 0.075, 10, 96), neon);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.29;
      platform.add(ring);
      const underglow = this.mesh(new THREE.TorusGeometry(2.94, 0.13, 8, 96), neon);
      underglow.rotation.x = Math.PI / 2;
      underglow.position.y = -0.02;
      platform.add(underglow);
      const contactShadowMaterial = new THREE.MeshBasicMaterial({ color: 0x020407, transparent: true, opacity: 0.38, depthWrite: false });
      this.ownedMaterials.add(contactShadowMaterial);
      const contactShadow = this.mesh(new THREE.CircleGeometry(2.15, 40), contactShadowMaterial);
      contactShadow.rotation.x = -Math.PI / 2;
      contactShadow.position.y = 0.315;
      platform.add(contactShadow);
      const segmented = this.glow(0xffb248, 1.25);
      for (let mark = 0; mark < 24; mark++) {
        const angle = mark * Math.PI / 12;
        const piece = this.box(platform, [0.12, 0.028, 0.33], [Math.sin(angle) * 2.6, 0.31, Math.cos(angle) * 2.6], mark % 3 ? neon : segmented);
        piece.rotation.y = angle;
      }
      this.platforms.push({ neon, ring, group: platform });
      this.batchStaticMeshes(platform);
    });
    if (mode === 'selection') {
      this.arm = new MechanicalArm(this, this.vehicles[this.vehicleIndex].userData.size.y + 0.34);
      // Keep the showroom silhouette unobstructed; the existing mechanical
      // arm appears only when a player actually confirms an equipment change.
      this.arm.group.visible = false;
    }
    this.spot = new THREE.SpotLight(0xfff0dc, 105, 34, 0.43, 0.72, 1.25);
    this.spot.position.set(0, 11, 5);
    this.scene.add(this.spot, this.spot.target);
    if (mode === 'selection') this.setSelectionStage('vehicle', this.vehicleIndex, this.paintIndex);
    else { this.focusIndex = 0; this.focusX = 0; }
    this.cameraFocus = this.focusX;
    this.resize(960, 470);
  }

  material(color: THREE.ColorRepresentation, metalness = 0.4, roughness = 0.5): THREE.MeshStandardMaterial {
    const material = new THREE.MeshStandardMaterial({ color, metalness, roughness });
    this.ownedMaterials.add(material);
    return material;
  }

  glow(color: THREE.ColorRepresentation, intensity = 1): THREE.MeshStandardMaterial {
    const material = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: intensity, roughness: 0.35 });
    this.ownedMaterials.add(material);
    return material;
  }

  mesh(geometry: THREE.BufferGeometry, material: THREE.Material): THREE.Mesh {
    this.ownedGeometries.add(geometry);
    return new THREE.Mesh(geometry, material);
  }

  box(parent: THREE.Object3D, size: Vec3, position: Vec3, material: THREE.Material): THREE.Mesh {
    const object = this.mesh(new THREE.BoxGeometry(...size), material);
    object.position.set(...position);
    parent.add(object);
    return object;
  }

  batchStaticMeshes(parent: THREE.Object3D): void {
    // Merge static workshop pieces by material: fewer draw calls, same geometry
    // and appearance. Vehicles and the articulated arm remain independent.
    const groups = new Map();
    for (const child of parent.children) {
      if (!(child instanceof THREE.Mesh)) continue;
      if (!groups.has(child.material)) groups.set(child.material, []);
      groups.get(child.material)!.push(child);
    }
    for (const [material, meshes] of groups) {
      if (meshes.length < 2) continue;
      const pieces = meshes.map((mesh: THREE.Mesh) => {
        mesh.updateMatrix();
        return mesh.geometry.clone().applyMatrix4(mesh.matrix);
      });
      const merged = mergeGeometries(pieces);
      pieces.forEach((piece: THREE.BufferGeometry) => piece.dispose());
      if (!merged) continue;
      for (const mesh of meshes) {
        parent.remove(mesh);
        this.ownedGeometries.delete(mesh.geometry);
        mesh.geometry.dispose();
      }
      parent.add(this.mesh(merged, material));
    }
  }

  buildRoom() {
    const steel = this.material(0x182431, 0.88, 0.3);
    const dark = this.material(0x080f18, 0.68, 0.43);
    const panel = this.material(0x101b28, 0.78, 0.36);
    const cyan = this.glow(0x12c9ee, 2.5);
    const red = this.glow(this.mode === 'preparation' ? this.stationColor : 0xff263c, 3.3);
    const coolRed = this.glow(0xa71124, 1.6);

    const floor = this.box(this.scene, [48, 0.16, 38], [0, -0.22, 0], this.material(0x0d131c, 0.82, 0.42));
    floor.receiveShadow = true;
    for (let row = -8; row <= 8; row += 1) this.box(this.scene, [46, 0.008, 0.018], [0, -0.133, row * 1.05], steel);
    const grid = new THREE.GridHelper(44, 44, 0x244357, 0x172a39);
    grid.position.y = -0.124;
    this.ownedGeometries.add(grid.geometry);
    this.ownedMaterials.add(grid.material);
    this.scene.add(grid);

    // Original 3D skyline visible through an open sunset-red portal in the bay.
    this.box(this.scene, [18, 11, 0.5], [-15, 4.7, -12], steel);
    this.box(this.scene, [18, 11, 0.5], [15, 4.7, -12], steel);
    this.box(this.scene, [12, 0.7, 0.5], [0, 10.05, -12], dark);
    this.box(this.scene, [12, 1.2, 0.5], [0, 1.6, -12], dark);
    const cityDisc = this.mesh(new THREE.CircleGeometry(3.75, 48), this.glow(0xff394c, 1.45));
    cityDisc.position.set(0, 5.35, -14.2);
    this.scene.add(cityDisc);
    const cityMaterial = this.material(0x2a1d32, 0.52, 0.7), windowGlow = this.glow(0xb63850, 0.75);
    const towers = [[-3.6, 1.7, 1.0], [-2.6, 2.7, 0.75], [-1.6, 1.35, 1.1], [-0.55, 3.2, 0.82],
      [0.45, 1.9, 1.05], [1.55, 2.6, 0.8], [2.55, 1.55, 1.0], [3.45, 2.4, 0.7]] as const;
    towers.forEach(([x, height, width], index) => {
      this.box(this.scene, [width, height, 0.24], [x, 1.3 + height / 2, -14.05], cityMaterial);
      for (let window = 0; window < 3; window += 1) this.box(this.scene, [0.08, 0.12, 0.025],
        [x + (window - 1) * width * 0.24, 1.5 + (window % 2) * Math.min(0.55, height * 0.35), -13.89],
        index % 2 ? windowGlow : cyan);
    });
    this.box(this.scene, [12.2, 0.15, 0.18], [0, 9.65, -11.65], red);
    this.box(this.scene, [12.2, 0.15, 0.18], [0, 2.2, -11.65], red);
    this.box(this.scene, [0.13, 7.45, 0.18], [-5.95, 5.9, -11.65], dark);
    this.box(this.scene, [0.13, 7.45, 0.18], [5.95, 5.9, -11.65], dark);
    this.box(this.scene, [0.055, 5.9, 0.08], [-5.86, 5.9, -11.52], cyan);
    this.box(this.scene, [0.055, 5.9, 0.08], [5.86, 5.9, -11.52], red);
    for (const side of [-1, 1]) {
      const accent = side < 0 ? red : cyan, x = side * 7.35;
      this.box(this.scene, [0.24, 5.8, 0.28], [x, 3.15, -8.6], steel);
      this.box(this.scene, [0.075, 4.6, 0.08], [x - side * 0.17, 3.15, -8.4], accent);
      this.box(this.scene, [3.4, 0.16, 0.3], [x + side * 1.5, 5.75, -8.6], dark);
      this.box(this.scene, [2.8, 0.05, 0.08], [x + side * 1.5, 5.65, -8.4], accent);
    }
    this.box(this.scene, [8, 0.035, 0.08], [-5.2, -0.115, -3.8], red);
    this.box(this.scene, [8, 0.035, 0.08], [5.2, -0.115, -3.8], cyan);

    // Trusses, service conduits and alternating industrial light strips.
    this.box(this.scene, [48, 0.22, 0.32], [0, 10.8, -11], dark);
    for (let i = -5; i <= 5; i += 1) {
      const x = i * 4.2;
      if (Math.abs(x) >= 12.6) {
        this.box(this.scene, [0.28, 9.7, 0.36], [x, 4.7, -8.4], steel);
        this.box(this.scene, [0.2, 0.2, 12], [x, 9.7, -2], steel);
        this.box(this.scene, [0.075, 2.5, 0.12], [x, 6.3, -7.9], i % 2 ? coolRed : cyan);
      }
      this.box(this.scene, [1.2, 0.07, 0.3], [x, 9.25, 0.3], dark);
      this.box(this.scene, [0.95, 0.035, 0.09], [x, 9.18, 0.3], i % 2 ? cyan : red);
    }
    for (const side of [-1, 1]) {
      const x = side * 8.4, accent = side < 0 ? red : cyan;
      this.box(this.scene, [4.1, 2.65, 0.38], [x, 3.5, -8.2], panel);
      this.box(this.scene, [3.35, 0.09, 0.08], [x, 4.35, -7.97], accent);
      for (let line = 0; line < 4; line += 1) {
        this.box(this.scene, [1.25 + (line % 2) * 0.5, 0.045, 0.06],
          [x - 0.6, 3.75 - line * 0.35, -7.96], line === 0 ? accent : steel);
      }
      this.box(this.scene, [18, 0.04, 0.12], [x, 0.015, 2.5], accent);
    }
    for (const side of [-1, 1]) {
      const x = side * 18.6;
      this.box(this.scene, [0.5, 9.4, 24], [x, 4.55, 1], dark);
      for (let bay = 0; bay < 4; bay += 1) {
        const z = -7 + bay * 5.5;
        this.box(this.scene, [0.7, 3.2, 3.8], [side * 17.9, 1.55, z], panel);
        this.box(this.scene, [0.05, 2.1, 2.7], [side * 17.5, 1.7, z], bay % 2 ? cyan : red);
        this.box(this.scene, [1.2, 0.13, 4.2], [side * 16.9, 3.25, z], steel);
      }
      this.box(this.scene, [0.22, 0.22, 29], [side * 17.35, 7.4, 0], side < 0 ? red : cyan);
    }
    this.addTireStacks(-10.2, -5.5, dark, steel);
    this.addToolCabinet(10.2, -5.4, panel, red, cyan);
    this.batchStaticMeshes(this.scene);
    this.scene.add(new THREE.HemisphereLight(0xb6d5f4, 0x25191f, 0.95));
    const key = new THREE.DirectionalLight(0xeaf3ff, 1.45);
    key.position.set(-4, 11, 8);
    this.scene.add(key);
    const fill = new THREE.DirectionalLight(0x43caff, 0.75);
    fill.position.set(12, 7, 2);
    this.scene.add(fill);
    [[0xff263c, -8, 6, 3], [0x10c9ef, 8, 5, 1], [0xff513a, 0, 4, -7]].forEach(([color, x, y, z]) => {
      const light = new THREE.PointLight(color, 17, 25, 1.8);
      light.position.set(x, y, z);
      this.scene.add(light);
    });
  }

  addTireStacks(x: number, z: number, dark: THREE.Material, steel: THREE.Material): void {
    const rubber = this.material(0x090d13, 0.12, 0.82);
    for (let stack = 0; stack < 3; stack += 1) for (let layer = 0; layer < 3; layer += 1) {
      const tire = this.mesh(new THREE.TorusGeometry(0.58, 0.18, 8, 20), rubber);
      tire.rotation.x = Math.PI / 2;
      tire.position.set(x + stack * 1.15, 0.2 + layer * 0.37, z);
      this.scene.add(tire);
      if (layer === 1) {
        const hub = this.mesh(new THREE.TorusGeometry(0.23, 0.045, 6, 16), steel);
        hub.rotation.x = Math.PI / 2;
        hub.position.set(tire.position.x, tire.position.y + 0.04, tire.position.z);
        this.scene.add(hub);
      }
    }
    this.box(this.scene, [4.1, 0.16, 2.2], [x + 1.1, 0.05, z], dark);
  }

  addToolCabinet(x: number, z: number, panel: THREE.Material, red: THREE.Material, cyan: THREE.Material): void {
    this.box(this.scene, [4.2, 2.6, 1.4], [x, 1.2, z], panel);
    for (let drawer = 0; drawer < 3; drawer += 1) {
      const y = 0.48 + drawer * 0.7;
      this.box(this.scene, [3.65, 0.05, 0.06], [x, y, z + 0.73], drawer % 2 ? cyan : red);
      this.box(this.scene, [0.62, 0.07, 0.08], [x, y - 0.22, z + 0.77], this.material(0x657b8a, 0.85, 0.3));
    }
    this.box(this.scene, [4.8, 0.18, 1.7], [x, 2.63, z], this.material(0x1b2733, 0.8, 0.33));
  }

  setFocus(index: number): void {
    if (this.confirming) return;
    if (this.mode === 'selection') {
      if (this.selectionStage === 'vehicle') this.setSelectionStage('vehicle', index, this.paintIndex);
      else this.setSelectionStage('paint', this.vehicleIndex, index);
      return;
    }
    this.focusIndex = index;
    this.focusX = 0;
    this.arm?.focus(this.focusX);
  }

  setSelectionStage(stage: Stage, vehicleIndex: number, paintIndex: number): void {
    if (this.mode !== 'selection' || this.confirming) return;
    this.selectionStage = stage === 'paint' ? 'paint' : 'vehicle';
    this.vehicleIndex = THREE.MathUtils.clamp(Math.floor(vehicleIndex), 0, this.vehicles.length - 1);
    this.paintIndex = THREE.MathUtils.clamp(Math.floor(paintIndex), 0, PAINTS.length - 1);
    this.focusIndex = this.selectionStage === 'vehicle' ? this.vehicleIndex : this.paintIndex;
    const selectedPaint = PAINTS[this.paintIndex];
    this.vehicles.forEach((vehicle, index) => {
      const selected = index === this.vehicleIndex;
      const visible = selected;
      const x = 0;
      vehicle.position.x = x;
      vehicle.visible = visible;
      this.platforms[index].group.position.x = x;
      this.platforms[index].group.visible = visible;
      this.platforms[index].group.scale.setScalar(selected ? 1 : 0.72);
      this.resources.paintVehicle(vehicle, selected ? selectedPaint : PAINTS[0]);
      this.platforms[index].neon.color.set(selected ? selectedPaint.color : PAINTS[0].color);
      this.platforms[index].neon.emissive.set(selected ? selectedPaint.color : PAINTS[0].color);
      this.platforms[index].neon.emissiveIntensity = selected ? 2.4 : 0.25;
    });
    this.focusX = 0;
    this.arm?.focus(this.focusX);
  }

  /** Render small real-model thumbs once for the shop cards using the shared renderer. */
  captureVehicleThumbnails(width = 160, height = 84): HTMLCanvasElement[] {
    if (this.mode !== 'selection' || this.resources.disposed) return [];
    const priorWidth = this.width, priorHeight = this.height;
    const visibility = this.vehicles.map((vehicle, index) => ({ vehicle: vehicle.visible,
      platform: this.platforms[index].group.visible }));
    const thumbnailCamera = new THREE.PerspectiveCamera(34, width / height, 0.1, 90);
    const canvases: HTMLCanvasElement[] = [];
    try {
      this.resources.renderer.setSize(width, height, false);
      for (let index = 0; index < this.vehicles.length; index += 1) {
        const vehicle = this.vehicles[index]!;
        this.vehicles.forEach((candidate, candidateIndex) => {
          candidate.visible = candidateIndex === index;
          this.platforms[candidateIndex]!.group.visible = candidateIndex === index;
        });
        const x = vehicle.position.x;
        thumbnailCamera.position.set(x + 2.5, 2.5, 4.9);
        thumbnailCamera.lookAt(x, 0.72, 0);
        this.resources.renderer.render(this.scene, thumbnailCamera);
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        canvas.getContext('2d')?.drawImage(this.resources.renderer.domElement, 0, 0, width, height);
        canvases.push(canvas);
      }
    } finally {
      this.vehicles.forEach((vehicle, index) => {
        vehicle.visible = visibility[index]!.vehicle;
        this.platforms[index]!.group.visible = visibility[index]!.platform;
      });
      this.resources.renderer.setSize(priorWidth, priorHeight, false);
      thumbnailCamera.clear();
      this.renderElapsed = 1;
    }
    return canvases;
  }

  confirm(done: () => void): void {
    if (this.confirming || !this.arm) return;
    this.confirming = true;
    this.arm.group.visible = true;
    const vehicleHeight = this.vehicles[this.vehicleIndex].userData.size.y + 0.34;
    this.arm.gripY = vehicleHeight + 0.65;
    this.arm.homeY = Math.max(3.65, vehicleHeight + 1.6);
    this.arm.confirm(this.vehicles[this.vehicleIndex], done);
  }

  pick(u: number, v: number): number | null {
    this.raycaster.setFromCamera(new THREE.Vector2(u * 2 - 1, 1 - v * 2), this.camera);
    const hits = this.raycaster.intersectObjects(this.vehicles, true);
    if (!hits.length) return null;
    let object: THREE.Object3D | null = hits[0].object;
    while (object && !this.vehicles.includes(object as VehicleObject)) object = object.parent;
    const index = object ? this.vehicles.indexOf(object as VehicleObject) : -1;
    return index >= 0 ? index : null;
  }

  resize(width: number, height: number): void {
    // One bounded offscreen render target, composited into the Phaser canvas.
    const ratio = Math.min(1, 1100 / width, 600 / height);
    const nextWidth = Math.max(2, Math.round(width * ratio));
    const nextHeight = Math.max(2, Math.round(height * ratio));
    if (this.width === nextWidth && this.height === nextHeight) return;
    this.width = nextWidth;
    this.height = nextHeight;
    this.resources.renderer.setSize(this.width, this.height, false);
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
    this.renderElapsed = 1;
  }

  update(delta: number): boolean {
    const dt = Math.min(delta / 1000, 0.25);
    this.elapsed += dt;
    this.renderElapsed += dt;
    const focused = this.mode === 'selection' ? this.vehicleIndex : 0;
    // Keep the requested turntable active, but quieter with reduced motion.
    if (!this.confirming) this.vehicles[focused].rotation.y += dt * (this.reducedMotion ? 0.07 : 0.24);
    this.arm?.update(dt);
    this.cameraFocus = THREE.MathUtils.lerp(this.cameraFocus, this.focusX, 1 - Math.exp(-dt * 2.8));
    if (this.mode === 'selection') {
      // Keep the whole focused car in view, including on a tall preview area.
      const distance = Math.max(7.8, 5.2 / this.camera.aspect);
      this.camera.position.set(this.cameraFocus + 3.1, 4.2, distance);
      this.camera.lookAt(this.cameraFocus, 1.0, 0);
      if (this.selectionStage === 'paint') {
        // A single bay gives a closer view without altering model proportions.
        this.camera.position.set(4.1, 2.8, Math.max(5.8, 4.5 / this.camera.aspect));
        this.camera.lookAt(0, 0.9, 0);
      }
    } else {
      this.camera.position.set(4, 2.5, Math.max(5.5, 3.8 / this.camera.aspect));
      this.camera.lookAt(0, 1, 0);
    }
    this.spot.position.x = this.cameraFocus;
    this.spot.target.position.set(this.cameraFocus, 0, 0);
    // 30 fps preview; input and UI retain Phaser's normal refresh rate.
    if (this.renderElapsed < 1 / 30) return false;
    this.renderElapsed %= 1 / 30;
    this.resources.renderer.render(this.scene, this.camera);
    return true;
  }

  destroy(): void {
    if (this.arm) this.arm.done = null;
    for (const vehicle of this.vehicles) {
      vehicle.userData.visualAdapter?.destroy();
      for (const material of vehicle.userData.ownedMaterials ?? []) material.dispose();
      vehicle.traverse((object: THREE.Object3D) => { if (object instanceof THREE.SkinnedMesh) object.skeleton.dispose(); });
    }
    for (const geometry of this.ownedGeometries) geometry.dispose();
    for (const material of this.ownedMaterials) material.dispose();
    this.scene.clear();
    this.resources.renderer.renderLists.dispose();
  }
}
