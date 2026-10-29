import * as THREE from 'three';
import { sampleRaceTrack, type RaceTrack, type RaceParticipant, type RenderPose } from '../../race/RaceSimulation.ts';
import { RaceCameraRig } from './RaceCameraRig.ts';
import { DEFAULT_RACE_CAMERA_MODE } from '../../data/raceCameras.ts';
import { PAINTS } from '../../data/vehicles.ts';
import { TireSmoke } from '../vehicles/TireSmoke.ts';
import { VehicleDamageEffects } from './VehicleDamageEffects.ts';
import type { GarageResources } from '../garage/GarageResources.ts';

type TrackData = RaceTrack & { width: number; theme: { sky: THREE.ColorRepresentation; road: THREE.ColorRepresentation; edge: THREE.ColorRepresentation; glow: THREE.ColorRepresentation }; scenery: readonly { width: number; height: number; depth: number; x: number; z: number }[] };
type Pose = RenderPose & Partial<RaceParticipant>;
type Vec3 = [number, number, number, number?];
type VehicleObject = THREE.Group & { userData: { size: THREE.Vector3; ownedMaterials?: THREE.Material[]; visualAdapter?: { destroy(): void } } };

export const RACE_VEHICLE_SCALE = 1.3;

// Phaser schedules every render. The canvas is presented directly during the
// race; the old CanvasTexture bridge remains available as a session fallback.
export class RaceWorld {
  resources: GarageResources;
  diagnostics: boolean;
  cameraFrozen = false;
  trackData: TrackData;
  track: ReturnType<typeof sampleRaceTrack>;
  scene: THREE.Scene;
  obstacles: THREE.Object3D[] = [];
  ownedGeometries = new Set<THREE.BufferGeometry>();
  ownedMaterials = new Set<THREE.Material>();
  vehicles: VehicleObject[] = [];
  renderPoses: Pose[] = [];
  elapsed = 0;
  renderElapsed = 1;
  trackMaterial!: THREE.MeshStandardMaterial;
  borderMaterial!: THREE.MeshStandardMaterial;
  neonMaterial!: THREE.MeshStandardMaterial;
  steelMaterial!: THREE.MeshStandardMaterial;
  darkSteelMaterial!: THREE.MeshStandardMaterial;
  startLightMaterial!: THREE.MeshStandardMaterial;
  startDarkMaterial!: THREE.MeshStandardMaterial;
  smoke!: TireSmoke;
  damageEffects!: VehicleDamageEffects;
  cameraRig!: RaceCameraRig;
  camera!: THREE.Camera;
  spotlight!: THREE.SpotLight;
  width = 0;
  height = 0;
  diagnosticsCounters = 0;
  cameraUpdates = 0;
  participantPoseUpdates = 0;
  participants: readonly RaceParticipant[] = [];
  lastAnimationMs = 0;
  lastRenderMs = 0;
  renderFrames = 0;
  lastPlayerRespawnSequence?: number;
  constructor(resources: GarageResources, { track, participants, cameraMode = DEFAULT_RACE_CAMERA_MODE, diagnostics = false }: {
    track: TrackData; participants: readonly RaceParticipant[]; cameraMode?: 'isometric' | 'chase'; diagnostics?: boolean;
  }) {
    this.resources = resources;
    this.diagnostics = diagnostics;
    this.cameraFrozen = false;
    if (diagnostics) {
      this.cameraUpdates = 0;
      this.participantPoseUpdates = 0;
    }
    this.trackData = track;
    this.track = sampleRaceTrack(track, 20);
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(track.theme.sky);
    this.scene.fog = new THREE.FogExp2(track.theme.sky, 0.0034);
    this.scene.environment = resources.environment.texture;
    this.obstacles = [];
    this.ownedGeometries = new Set();
    this.ownedMaterials = new Set();
    this.vehicles = [];
    this.renderPoses = [];
    this.elapsed = 0;
    this.renderElapsed = 1;
    this.trackMaterial = this.material(track.theme.road, 0.58, 0.76);
    this.borderMaterial = this.glow(track.theme.edge, 1.5);
    this.neonMaterial = this.glow(track.theme.glow, 2.0);
    this.steelMaterial = this.material(0x586878, 0.82, 0.34);
    this.darkSteelMaterial = this.material(0x1a2633, 0.7, 0.46);
    this.startLightMaterial = this.material(0xdce8f4, 0.28, 0.42);
    this.startDarkMaterial = this.material(0x101722, 0.42, 0.5);
    this.buildWorld();
    participants.forEach(participant => {
      const paint = PAINTS.find(item => item.color.toLowerCase() === participant.paintColor.toLowerCase())
        ?? { id: participant.vehicleId, color: participant.paintColor };
      const vehicle = resources.createVehicle(participant.vehicleId, paint, { experimental: participant.isPlayer });
      vehicle.scale.multiplyScalar(RACE_VEHICLE_SCALE);
      vehicle.userData.size.multiplyScalar(RACE_VEHICLE_SCALE);
      this.scene.add(vehicle);
      this.vehicles.push(vehicle);
    });
    this.setParticipants(participants);
    // One set of tire emitters for the player; damage has independent per-car
    // budgets. Official wheel adapters never depend on the old local experiment.
    this.smoke = new TireSmoke(this.scene);
    this.damageEffects = new VehicleDamageEffects(this.scene, { participantCount: participants.length });
    this.scene.updateMatrixWorld(true);
    const playerIndex = participants.findIndex(participant => participant.isPlayer);
    this.cameraRig = new RaceCameraRig({ track: { ...this.track, width: track.width },
      vehicleSize: this.vehicles[Math.max(0, playerIndex)].userData.size, obstacles: this.obstacles, mode: cameraMode });
    this.camera = this.cameraRig.camera;
    this.spotlight = new THREE.SpotLight(0xffffff, 72, 92, 0.65, 0.8, 1.1);
    this.spotlight.position.set(0, 34, 0);
    this.scene.add(this.spotlight, this.spotlight.target);
    this.scene.add(new THREE.HemisphereLight(0xc5ddff, 0x252438, 1.45));
    const key = new THREE.DirectionalLight(0xffe3c1, 2.4);
    key.position.set(-14, 38, 12);
    this.scene.add(key);
    this.resize(960, 540);
  }

  material(color: THREE.ColorRepresentation, metalness: number, roughness: number): THREE.MeshStandardMaterial {
    const material = new THREE.MeshStandardMaterial({ color, metalness, roughness });
    this.ownedMaterials.add(material);
    return material;
  }

  glow(color: THREE.ColorRepresentation, intensity: number): THREE.MeshStandardMaterial {
    const material = new THREE.MeshStandardMaterial({
      color, emissive: color, emissiveIntensity: intensity, metalness: 0.28, roughness: 0.3,
    });
    this.ownedMaterials.add(material);
    return material;
  }

  mesh(geometry: THREE.BufferGeometry, material: THREE.Material, position: [number, number, number] = [0, 0, 0]): THREE.Mesh {
    this.ownedGeometries.add(geometry);
    const object = new THREE.Mesh(geometry, material);
    object.position.set(...position);
    this.scene.add(object);
    return object;
  }

  box(size: [number, number, number], position: [number, number, number], material: THREE.Material, rotationY = 0): THREE.Mesh {
    const object = this.mesh(new THREE.BoxGeometry(...size), material, position);
    object.rotation.y = rotationY;
    return object;
  }

  addInstances(size: [number, number, number], material: THREE.Material, positions: Vec3[]): void {
    const geometry = new THREE.BoxGeometry(...size);
    this.ownedGeometries.add(geometry);
    const mesh = new THREE.InstancedMesh(geometry, material, positions.length);
    const transform = new THREE.Object3D();
    positions.forEach((position, index) => {
      transform.position.set(position[0], position[1], position[2]);
      transform.rotation.y = position[3] ?? 0;
      transform.updateMatrix();
      mesh.setMatrixAt(index, transform.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    this.scene.add(mesh);
  }

  buildWorld() {
    const extent = Math.max(...this.track.points.map(point => Math.max(Math.abs(point.x), Math.abs(point.z)))) + 42;
    const floor = new THREE.PlaneGeometry(extent * 6, extent * 6, 1, 1);
    const floorMesh = this.mesh(floor, this.darkSteelMaterial, [0, -1, 0]);
    floorMesh.rotation.x = -Math.PI / 2;
    const grid = new THREE.GridHelper(extent * 2, Math.ceil(extent / 3), this.trackData.theme.edge, 0x263548);
    grid.position.y = -0.94;
    this.ownedGeometries.add(grid.geometry);
    this.ownedMaterials.add(grid.material);
    this.scene.add(grid);
    this.buildRoad();
    this.buildScenery();
  }

  buildRoad() {
    const { points } = this.track;
    const halfWidth = this.trackData.width / 2;
    const positions = [];
    const indices = [];
    const leftEdge = [];
    const rightEdge = [];
    for (let i = 0; i < points.length; i += 1) {
      const point = points[i];
      const nx = -point.tangentZ, nz = point.tangentX;
      const lx = point.x + nx * halfWidth, lz = point.z + nz * halfWidth;
      const rx = point.x - nx * halfWidth, rz = point.z - nz * halfWidth;
      positions.push(lx, point.y + 0.05, lz, rx, point.y + 0.05, rz);
      leftEdge.push(new THREE.Vector3(lx, point.y + 0.18, lz));
      rightEdge.push(new THREE.Vector3(rx, point.y + 0.18, rz));
      const next = (i + 1) % points.length;
      const a = i * 2, b = a + 1, c = next * 2, d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
    const roadGeometry = new THREE.BufferGeometry();
    roadGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    roadGeometry.setIndex(indices);
    roadGeometry.computeVertexNormals();
    this.ownedGeometries.add(roadGeometry);
    const road = new THREE.Mesh(roadGeometry, this.trackMaterial);
    road.material.side = THREE.DoubleSide;
    this.scene.add(road);
    this.obstacles.push(road);
    // A real deck/fascia closes the elevated ribbon from low camera angles.
    const sides: number[] = [], sideIndices: number[] = [];
    [leftEdge, rightEdge].forEach(edge => {
      const base = sides.length / 3;
      edge.forEach(point => sides.push(point.x, point.y - 0.13, point.z, point.x, point.y - 1.0, point.z));
      edge.forEach((_point, i) => {
        const a = base + i * 2, b = base + ((i + 1) % edge.length) * 2;
        sideIndices.push(a, a + 1, b, a + 1, b + 1, b);
      });
    });
    const fascia = new THREE.BufferGeometry();
    fascia.setAttribute('position', new THREE.Float32BufferAttribute(sides, 3));
    fascia.setIndex(sideIndices);
    fascia.computeVertexNormals();
    const fasciaMaterial = this.material(0x253345, 0.72, 0.52);
    fasciaMaterial.side = THREE.DoubleSide;
    this.obstacles.push(this.mesh(fascia, fasciaMaterial));
    this.addTube(leftEdge, this.borderMaterial, 0.26);
    this.addTube(rightEdge, this.borderMaterial, 0.26);
    const railLeft = leftEdge.map(point => point.clone().add(new THREE.Vector3(0, 1.15, 0)));
    const railRight = rightEdge.map(point => point.clone().add(new THREE.Vector3(0, 1.15, 0)));
    this.obstacles.push(this.addTube(railLeft, this.steelMaterial, 0.22));
    this.obstacles.push(this.addTube(railRight, this.steelMaterial, 0.22));
    this.addStartLine(points[0], halfWidth);
  }

  addTube(points: THREE.Vector3[], material: THREE.Material, radius: number): THREE.Mesh {
    const curve = new THREE.CatmullRomCurve3(points, true, 'centripetal');
    return this.mesh(new THREE.TubeGeometry(curve, points.length, radius, 6, true), material);
  }

  addStartLine(point: ReturnType<typeof sampleRaceTrack>['points'][number], halfWidth: number): void {
    const nx = -point.tangentZ, nz = point.tangentX;
    const pieceWidth = (halfWidth * 2) / 12;
    const lightTiles: Vec3[] = [], darkTiles: Vec3[] = [];
    for (let i = 0; i < 12; i += 1) {
      const offset = -halfWidth + pieceWidth * (i + 0.5);
      const x = point.x + nx * offset;
      const z = point.z + nz * offset;
      (i % 2 ? lightTiles : darkTiles).push([x, point.y + 0.12, z, Math.atan2(point.tangentX, point.tangentZ)]);
    }
    this.addInstances([pieceWidth + 0.05, 0.055, 0.5], this.startLightMaterial, lightTiles);
    this.addInstances([pieceWidth + 0.05, 0.055, 0.5], this.startDarkMaterial, darkTiles);
  }

  buildScenery() {
    for (const prop of this.trackData.scenery) {
      this.obstacles.push(this.box([prop.width, prop.height, prop.depth], [prop.x, prop.height / 2 - 0.9, prop.z], this.darkSteelMaterial));
      const strip = this.box([prop.width * 0.72, 0.15, prop.depth * 1.02], [prop.x, prop.height * 0.7, prop.z], this.neonMaterial);
      strip.rotation.y = Math.PI / 4;
    }
    const sampleStep = Math.max(1, Math.floor(this.track.points.length / 28));
    const supports = [], lamps = [];
    for (let i = 0; i < this.track.points.length; i += sampleStep) {
      const point = this.track.points[i];
      const nx = -point.tangentZ, nz = point.tangentX;
      for (const side of [-1, 1]) {
        const x = point.x + nx * side * (this.trackData.width / 2 + 2.1);
        const y = point.y + 1.4;
        const z = point.z + nz * side * (this.trackData.width / 2 + 2.1);
        supports.push([x, y, z]);
        lamps.push([x, y + 0.65, z]);
      }
    }
    // Repeated barrier posts and lamps share instanced geometry to keep the
    // render cost proportional to track detail, not the number of supports.
    this.addInstances([0.3, 2.8, 0.3], this.steelMaterial, supports as Vec3[]);
    this.addInstances([0.16, 0.35, 0.16], this.neonMaterial, lamps as Vec3[]);
    // Deck pillars run down to the floor, rather than hovering beside elevated
    // Voltage Run. A handful is enough to communicate the industrial structure.
    for (let i = 0; i < this.track.points.length; i += sampleStep * 2) {
      const point = this.track.points[i];
      const height = Math.max(0.2, point.y + 0.2);
      for (const side of [-1, 1]) {
        const width = this.trackData.width * 0.36;
        this.box([1.3, height, 1.3], [point.x - point.tangentZ * width * side,
          -0.9 + height / 2, point.z + point.tangentX * width * side], this.darkSteelMaterial);
      }
    }
  }

  setParticipants(participants: readonly RaceParticipant[], getRenderPose: (participant: RaceParticipant, pose: Pose) => Pose = participant => participant): void {
    if (this.diagnostics) this.participantPoseUpdates += 1;
    participants.forEach((participant, index) => {
      const vehicle = this.vehicles[index];
      if (!vehicle) return;
      // Interpolation writes into this reusable buffer, never the physical car.
      // Sharing the participant here would undo movement on every rendered frame.
      const renderPose = this.renderPoses[index] ??= { ...participant };
      Object.assign(renderPose, participant);
      const pose = getRenderPose(participant, renderPose);
      Object.assign(renderPose, pose);
      vehicle.position.set(pose.x, pose.y + 0.08, pose.z);
      vehicle.rotation.y = pose.heading;
    });
    this.participants = participants;
  }

  setCameraFrozen(frozen: boolean): void { this.cameraFrozen = Boolean(frozen); }

  resize(width: number, height: number, limits = { width: 1100, height: 620 }): void {
    const ratio = Math.min(1, limits.width / width, limits.height / height);
    const nextWidth = Math.max(2, Math.round(width * ratio));
    const nextHeight = Math.max(2, Math.round(height * ratio));
    if (this.width === nextWidth && this.height === nextHeight) return;
    this.width = nextWidth;
    this.height = nextHeight;
    this.resources.renderer.setSize(nextWidth, nextHeight, false);
    this.cameraRig.resize(nextWidth / nextHeight);
    this.renderElapsed = 1;
  }

  update(delta: number): boolean {
    const dt = Math.min(delta / 1000, 0.25);
    this.elapsed += dt;
    this.renderElapsed += dt;
    const player = this.renderPoses.find(participant => participant.isPlayer) ?? this.renderPoses[0];
    this.smoke.update(dt);
    const animationStart = performance.now();
    for (let index = 0; index < this.vehicles.length; index += 1) {
      const vehicle = this.vehicles[index];
      const pose = this.renderPoses[index];
      const protection = pose.respawnProtection ?? 0;
      vehicle.visible = !pose.destroyed && (!(protection > 0) || Math.floor(protection * 8) % 2 === 0);
      const adapter = vehicle.userData.visualAdapter as { update(pose: Pose, dt: number, smoke: TireSmoke | null): void } | undefined;
      adapter?.update(pose, dt, pose.isPlayer && !pose.destroyed ? this.smoke : null);
    }
    this.damageEffects.update(this.renderPoses, this.vehicles, dt);
    this.lastAnimationMs = performance.now() - animationStart;
    if (player && !this.cameraFrozen) {
      if (player.respawnSequence !== this.lastPlayerRespawnSequence) {
        if (this.lastPlayerRespawnSequence !== undefined) this.cameraRig.resetAfterRespawn(player);
        this.lastPlayerRespawnSequence = player.respawnSequence;
      }
      this.cameraRig.update(player, dt);
      if (this.diagnostics) this.cameraUpdates += 1;
    }
    if (player) {
      this.spotlight.position.set(player.x - 4, player.y + 24, player.z + 6);
      this.spotlight.target.position.set(player.x, player.y, player.z);
    }
    // One render per Phaser frame, including 59.9 Hz. Throttling here used to
    // skip boundary frames even though Phaser already schedules the refresh.
    const start = performance.now();
    this.resources.renderer.render(this.scene, this.camera);
    this.lastRenderMs = performance.now() - start;
    this.renderFrames = (this.renderFrames ?? 0) + 1;
    return true;
  }

  destroy() {
    this.cameraRig.destroy();
    this.smoke?.destroy();
    this.damageEffects.destroy();
    for (const vehicle of this.vehicles) {
      vehicle.userData.visualAdapter?.destroy();
      for (const material of vehicle.userData.ownedMaterials ?? []) material.dispose();
      const skeletons = new Set();
      vehicle.traverse((object: THREE.Object3D) => { if (object instanceof THREE.SkinnedMesh) object.skeleton.dispose(); });
    }
    for (const geometry of this.ownedGeometries) geometry.dispose();
    for (const material of this.ownedMaterials) material.dispose();
    this.scene.traverse((object: THREE.Object3D) => { if (object instanceof THREE.InstancedMesh) object.dispose(); });
    this.scene.clear();
    this.resources.renderer.renderLists.dispose();
  }
}
