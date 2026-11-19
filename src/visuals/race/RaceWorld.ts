import * as THREE from 'three';
import { sampleRaceTrack, sampleTrackAtProgress, type RaceTrack, type RaceParticipant, type RenderPose } from '../../race/RaceSimulation.ts';
import { RaceCameraRig } from './RaceCameraRig.ts';
import { DEFAULT_RACE_CAMERA_MODE } from '../../data/raceCameras.ts';
import { PAINTS } from '../../data/vehicles.ts';
import { TireSmoke } from '../vehicles/TireSmoke.ts';
import { VehicleDamageEffects } from './VehicleDamageEffects.ts';
import { RivalCannonEffects } from './RivalCannonEffects.ts';
import { CANNON_MOUNT, type RivalCannon, type CannonEvent } from '../../race/RivalCannon.ts';
import { sampleTrackSurface, trackHeadingAlignment, RACE_TRACK_SAMPLES_PER_SEGMENT,
  type TrackJump } from '../../race/trackMath.ts';
import { getRampFeatureSpan } from '../../race/rampLibrary.ts';
import { ArcadeJumpPresentation, type ArcadeJumpPresentationPose,
  ARCADE_LAB_RAMP_LENGTH } from './ArcadeJumpPresentation.ts';
import type { GarageResources } from '../garage/GarageResources.ts';

type TrackData = RaceTrack & { width: number; theme: { sky: THREE.ColorRepresentation; road: THREE.ColorRepresentation; edge: THREE.ColorRepresentation; glow: THREE.ColorRepresentation; accent: THREE.ColorRepresentation }; scenery: readonly { width: number; height: number; depth: number; x: number; z: number }[] };
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
  ownedTextures = new Set<THREE.Texture>();
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
  cannonEffects: RivalCannonEffects;
  private cannon: RivalCannon | null = null;
  private cannonElapsed = 0;
  private cannonAlpha = 0;
  cameraRig!: RaceCameraRig;
  camera!: THREE.Camera;
  spotlight!: THREE.SpotLight;
  width = 0;
  height = 0;
  diagnosticsCounters = 0;
  cameraUpdates = 0;
  participantPoseUpdates = 0;
  participants: readonly RaceParticipant[] = [];
  private jumpPresentations: ArcadeJumpPresentation[] = [];
  private jumpPresentationPoses: ArcadeJumpPresentationPose[] = [];
  private previousRespawnSequences: number[] = [];
  private readonly cameraPose: RenderPose = { x: 0, y: 0, z: 0, heading: 0, speed: 0 };
  lastAnimationMs = 0;
  lastRenderMs = 0;
  renderFrames = 0;
  lastPlayerRespawnSequence?: number;
  constructor(resources: GarageResources, { track, participants, cameraMode = DEFAULT_RACE_CAMERA_MODE, diagnostics = false,
    }: {
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
    this.track = sampleRaceTrack(track, RACE_TRACK_SAMPLES_PER_SEGMENT);
    this.jumpPresentations = participants.map(() => new ArcadeJumpPresentation());
    this.jumpPresentationPoses = participants.map(() => ({ pitch: 0, rampOffset: 0, suspensionOffset: 0 }));
    this.previousRespawnSequences = participants.map(participant => participant.respawnSequence);
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(track.theme.sky);
    this.scene.fog = new THREE.FogExp2(track.theme.sky, 0.0034);
    this.scene.environment = resources.environment.texture;
    this.obstacles = [];
    this.ownedGeometries = new Set();
    this.ownedMaterials = new Set();
    this.ownedTextures = new Set();
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
      if (track.jumps?.length) vehicle.rotation.order = 'YXZ';
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
    this.cannonEffects = new RivalCannonEffects(this.scene);
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
    const groundRows: boolean[] = [];
    for (let i = 0; i < points.length; i += 1) {
      const point = points[i];
      const surface = this.trackData.jumps?.length
        ? sampleTrackSurface(this.track, this.trackData.jumps, point.distance) : null;
      const surfaceY = surface?.y ?? point.y;
      groundRows.push(surface?.hasGround ?? true);
      const nx = -point.tangentZ, nz = point.tangentX;
      const lx = point.x + nx * halfWidth, lz = point.z + nz * halfWidth;
      const rx = point.x - nx * halfWidth, rz = point.z - nz * halfWidth;
      positions.push(lx, surfaceY + 0.05, lz, rx, surfaceY + 0.05, rz);
      leftEdge.push(new THREE.Vector3(lx, surfaceY + 0.18, lz));
      rightEdge.push(new THREE.Vector3(rx, surfaceY + 0.18, rz));
      const next = (i + 1) % points.length;
      if (!groundRows[i] || !(this.trackData.jumps?.length
        ? sampleTrackSurface(this.track, this.trackData.jumps, points[next]!.distance).hasGround : true)) continue;
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
    this.buildJumpRamps();
    // A real deck/fascia closes the elevated ribbon from low camera angles.
    const sides: number[] = [], sideIndices: number[] = [];
    [leftEdge, rightEdge].forEach(edge => {
      const base = sides.length / 3;
      edge.forEach(point => sides.push(point.x, point.y - 0.13, point.z, point.x, point.y - 1.0, point.z));
      edge.forEach((_point, i) => {
        const next = (i + 1) % edge.length;
        if (!groundRows[i] || !groundRows[next]) return;
        const a = base + i * 2, b = base + next * 2;
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
    const leftSegments = splitGroundSegments(leftEdge, groundRows), rightSegments = splitGroundSegments(rightEdge, groundRows);
    for (const [sideIndex, segments] of [leftSegments, rightSegments].entries()) {
      for (const segment of segments) {
        if (segment.length < 2) continue;
        const edgeTube = this.addTube(segment, this.borderMaterial, 0.26, segment.length === points.length);
        this.obstacles.push(edgeTube);
        const rail = segment.map(point => point.clone().add(new THREE.Vector3(0, 1.15, 0)));
        this.obstacles.push(this.addTube(rail, this.steelMaterial, 0.22, segment.length === points.length));
      }
      const spikeConfig = this.trackData.edgeSpikes;
      if (spikeConfig) this.addPointedSpikes(segments, sideIndex === 0 ? 1 : -1, spikeConfig);
    }
    this.addStartLine(points[0], halfWidth);
  }

  private buildJumpRamps(): void {
    const jumps = this.trackData.jumps;
    if (!jumps?.length) return;
    const rampMaterial = this.material(this.trackData.theme.accent, 0.38, 0.42);
    rampMaterial.side = THREE.DoubleSide;
    const landingMaterial = this.glow(0x56e6b8, 1.05);
    for (const [index, jump] of jumps.entries()) {
      const span = getRampFeatureSpan(jump);
      const rampLength = span.approach;
      const takeoffDistance = jump.takeoff * this.track.totalLength;
      const halfWidth = Math.max(2, this.trackData.width / 2 - 0.9);
      const meshLength = rampLength + span.afterTakeoff;
      const rows = Math.max(2, Math.ceil(meshLength));
      const positions: number[] = [];
      const basePositions: number[] = [];
      const indices: number[] = [];
      const groundRows: boolean[] = [];
      for (let row = 0; row <= rows; row += 1) {
        const distance = takeoffDistance - rampLength + meshLength * row / rows;
        const point = sampleTrackAtProgress(this.track, distance);
        const surface = sampleTrackSurface(this.track, jumps, distance);
        groundRows.push(surface.hasGround);
        const normalX = -point.tangentZ, normalZ = point.tangentX;
        const leftX = point.x - normalX * halfWidth, leftZ = point.z - normalZ * halfWidth;
        const rightX = point.x + normalX * halfWidth, rightZ = point.z + normalZ * halfWidth;
        positions.push(leftX, surface.y + 0.07, leftZ, rightX, surface.y + 0.07, rightZ);
        const fasciaBaseY = Math.min(point.y - 0.06, surface.y - 0.06);
        basePositions.push(leftX, fasciaBaseY, leftZ, rightX, fasciaBaseY, rightZ);
        if (row < rows && groundRows[row] && sampleTrackSurface(this.track, jumps,
          takeoffDistance - rampLength + meshLength * (row + 1) / rows).hasGround) {
          const left = row * 2;
          indices.push(left, left + 2, left + 1, left + 1, left + 2, left + 3);
        }
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geometry.setIndex(indices);
      geometry.computeVertexNormals();
      this.ownedGeometries.add(geometry);
      const ramp = new THREE.Mesh(geometry, rampMaterial);
      ramp.name = `race-jump-ramp:${jump.id}`;
      this.scene.add(ramp);
      this.obstacles.push(ramp);
      if (jump.lavaGap && jump.kind === 'jump') this.addLavaGap(jump, takeoffDistance, halfWidth);

      const sideGeometry = new THREE.BufferGeometry();
      sideGeometry.setAttribute('position', new THREE.Float32BufferAttribute([...positions, ...basePositions], 3));
      const topVertexCount = positions.length / 3;
      const sideIndices: number[] = [];
      for (let row = 0; row < rows; row += 1) {
        if (!groundRows[row] || !groundRows[row + 1]) continue;
        const leftTop = row * 2, rightTop = leftTop + 1;
        const nextLeftTop = leftTop + 2, nextRightTop = leftTop + 3;
        const leftBottom = topVertexCount + leftTop, rightBottom = leftBottom + 1;
        const nextLeftBottom = topVertexCount + nextLeftTop, nextRightBottom = nextLeftBottom + 1;
        sideIndices.push(leftTop, nextLeftTop, leftBottom, leftBottom, nextLeftTop, nextLeftBottom,
          rightTop, rightBottom, nextRightTop, rightBottom, nextRightBottom, nextRightTop);
        if (jump.kind === 'double') {
          sideIndices.push(leftBottom, nextLeftBottom, rightBottom,
            rightBottom, nextLeftBottom, nextRightBottom);
        }
      }
      sideGeometry.setIndex(sideIndices);
      sideGeometry.computeVertexNormals();
      this.ownedGeometries.add(sideGeometry);
      const sideMaterial = this.material(0x273644, 0.62, 0.5);
      sideMaterial.side = THREE.DoubleSide;
      const sideMesh = new THREE.Mesh(sideGeometry, sideMaterial);
      sideMesh.name = `race-jump-ramp-fascia:${jump.id}`;
      this.scene.add(sideMesh);
      this.obstacles.push(sideMesh);

      for (const progress of [jump.landingStart, jump.landingEnd]) {
        const marker = sampleTrackAtProgress(this.track, progress * this.track.totalLength);
        const surface = sampleTrackSurface(this.track, jumps, marker.distance);
        const markerMesh = this.box([this.trackData.width - 1.4, 0.055, 0.7],
          [marker.x, surface.y + 0.13, marker.z], landingMaterial,
          Math.atan2(marker.tangentX, marker.tangentZ));
        markerMesh.rotation.order = 'YXZ';
        markerMesh.rotation.x = -Math.atan(surface.grade);
      }
      this.addRampSign(jump, takeoffDistance - rampLength - 2, halfWidth + 5, index + 1);
    }
  }

  private addLavaGap(ramp: TrackJump, takeoffDistance: number, halfWidth: number): void {
    const gapLength = Math.max(1, ramp.gapLength ?? 11);
    const rows = Math.max(4, Math.ceil(gapLength / 2));
    const positions: number[] = [];
    const indices: number[] = [];
    for (let row = 0; row <= rows; row += 1) {
      const point = sampleTrackAtProgress(this.track, takeoffDistance + gapLength * row / rows);
      const normalX = -point.tangentZ, normalZ = point.tangentX;
      const lavaY = point.y - 0.38;
      positions.push(point.x - normalX * halfWidth, lavaY, point.z - normalZ * halfWidth,
        point.x + normalX * halfWidth, lavaY, point.z + normalZ * halfWidth);
      if (row < rows) {
        const left = row * 2;
        indices.push(left, left + 2, left + 1, left + 1, left + 2, left + 3);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const material = this.glow(0x8e1805, 1.7);
    material.side = THREE.DoubleSide;
    material.roughness = 0.68;
    const lava = new THREE.Mesh(geometry, material);
    lava.name = `race-lava-gap:${ramp.id}`;
    lava.userData.hazard = 'lava';
    this.scene.add(lava);

    const flowPositions: number[] = [];
    const flowIndices: number[] = [];
    const flowCount = 3;
    const flowRows = Math.max(6, rows);
    for (let flow = 0; flow < flowCount; flow += 1) {
      const flowBase = flowPositions.length / 3;
      for (let row = 0; row <= flowRows; row += 1) {
        const progress = row / flowRows;
        const point = sampleTrackAtProgress(this.track, takeoffDistance + gapLength * progress);
        const surfaceY = point.y - 0.34;
        const normalX = -point.tangentZ, normalZ = point.tangentX;
        const lateral = (flow - 1) * halfWidth * 0.52 + Math.sin(progress * Math.PI * 3 + flow) * 0.7;
        const halfFlowWidth = 0.22;
        flowPositions.push(point.x + normalX * (lateral - halfFlowWidth), surfaceY,
          point.z + normalZ * (lateral - halfFlowWidth),
          point.x + normalX * (lateral + halfFlowWidth), surfaceY,
          point.z + normalZ * (lateral + halfFlowWidth));
        if (row < flowRows) {
          const left = flowBase + row * 2;
          flowIndices.push(left, left + 2, left + 1, left + 1, left + 2, left + 3);
        }
      }
    }
    const flowGeometry = new THREE.BufferGeometry();
    flowGeometry.setAttribute('position', new THREE.Float32BufferAttribute(flowPositions, 3));
    flowGeometry.setIndex(flowIndices);
    flowGeometry.computeVertexNormals();
    const flowMaterial = this.glow(0xff8a16, 2.2);
    flowMaterial.side = THREE.DoubleSide;
    const flows = new THREE.Mesh(flowGeometry, flowMaterial);
    flows.name = `race-lava-flow:${ramp.id}`;
    this.scene.add(flows);
  }

  private addRampSign(ramp: TrackJump, distance: number, offset: number, instanceNumber: number): void {
    const point = sampleTrackAtProgress(this.track, distance);
    const surface = sampleTrackSurface(this.track, this.trackData.jumps, distance);
    const normalX = -point.tangentZ, normalZ = point.tangentX;
    const sign = new THREE.Group();
    sign.name = `race-ramp-sign:${ramp.id}`;
    sign.position.set(point.x + normalX * offset, surface.y, point.z + normalZ * offset);
    sign.rotation.y = Math.atan2(-point.tangentX, -point.tangentZ);

    const labels = {
      bump: ['QUEBRA-MOLAS', '#ffd34a'],
      jump: ['SALTO', '#ff6048'],
      platform: ['PLATAFORMA', '#58e6ff'],
      double: ['DOIS NÍVEIS', '#c48cff'],
    } as const;
    const [description, accent] = labels[ramp.kind];
    const type = `RAMPA ${String(instanceNumber).padStart(2, '0')}`;
    sign.userData.rampType = type;
    sign.userData.rampKind = ramp.kind;
    const canvas = document.createElement('canvas');
    canvas.width = 600;
    canvas.height = 220;
    const context = canvas.getContext('2d');
    if (!context) return;
    context.fillStyle = '#101820';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = accent;
    context.lineWidth = 12;
    context.strokeRect(8, 8, canvas.width - 16, canvas.height - 16);
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillStyle = '#f5fbff';
    context.font = 'bold 82px Arial, sans-serif';
    context.fillText(type, canvas.width / 2, 92);
    context.fillStyle = accent;
    context.font = 'bold 42px Arial, sans-serif';
    context.fillText(description, canvas.width / 2, 166);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    this.ownedTextures.add(texture);
    const faceMaterial = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide, toneMapped: false });
    this.ownedMaterials.add(faceMaterial);
    const backing = new THREE.Mesh(new THREE.BoxGeometry(3.6, 1.35, 0.16), this.darkSteelMaterial);
    backing.position.y = 2.2;
    sign.add(backing);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(3.38, 1.13), faceMaterial);
    face.name = `race-ramp-sign-label:${ramp.id}`;
    face.position.set(0, 2.2, 0.09);
    sign.add(face);
    const reverseFace = face.clone();
    reverseFace.name = `race-ramp-sign-label-back:${ramp.id}`;
    reverseFace.position.z = -0.09;
    reverseFace.rotation.y = Math.PI;
    sign.add(reverseFace);
    for (const x of [-1.45, 1.45]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.7, 0.12), this.steelMaterial);
      post.position.set(x, 0.85, 0);
      sign.add(post);
      this.ownedGeometries.add(post.geometry);
    }
    this.ownedGeometries.add(backing.geometry);
    this.ownedGeometries.add(face.geometry);
    this.scene.add(sign);
  }

  addTube(points: THREE.Vector3[], material: THREE.Material, radius: number, closed = true): THREE.Mesh {
    const curve = new THREE.CatmullRomCurve3(points, closed, 'centripetal');
    return this.mesh(new THREE.TubeGeometry(curve, points.length, radius, 6, closed), material);
  }

  private addPointedSpikes(segments: THREE.Vector3[][], side: 1 | -1,
    config: NonNullable<TrackData['edgeSpikes']>): void {
    const spacing = Math.max(1, config.spacing), step = Math.max(1, Math.round(spacing / (this.track.totalLength / this.track.points.length)));
    const transforms: { position: THREE.Vector3; direction: THREE.Vector3 }[] = [];
    for (const segment of segments) {
      for (let i = 0; i < segment.length; i += step) {
        const before = segment[Math.max(0, i - 1)]!, after = segment[Math.min(segment.length - 1, i + 1)]!;
        const tangent = new THREE.Vector3(after.x - before.x, 0, after.z - before.z).normalize();
        const normal = new THREE.Vector3(-tangent.z * side, 0.28, tangent.x * side).normalize();
        transforms.push({
          position: segment[i]!.clone().addScaledVector(normal, config.baseWidth * 0.34),
          direction: normal,
        });
      }
    }
    if (!transforms.length) return;
    const create = (radius: number, height: number, material: THREE.Material, offset: number) => {
      const geometry = new THREE.ConeGeometry(radius, height, 4, 1);
      this.ownedGeometries.add(geometry);
      const mesh = new THREE.InstancedMesh(geometry, material, transforms.length);
      const object = new THREE.Object3D(), up = new THREE.Vector3(0, 1, 0);
      transforms.forEach(({ position, direction }, index) => {
        object.position.copy(position).addScaledVector(direction, offset);
        object.quaternion.setFromUnitVectors(up, direction);
        object.updateMatrix();
        mesh.setMatrixAt(index, object.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
      this.scene.add(mesh);
    };
    create(config.baseWidth * 0.5, config.height, this.steelMaterial, 0);
    const tip = this.glow(this.trackData.theme.accent, 1.7);
    create(config.baseWidth * 0.16, config.height * 0.42, tip, config.height * 0.28);
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

  setCannon(cannon: RivalCannon, elapsed: number, alpha: number): void {
    this.cannon = cannon;
    this.cannonElapsed = elapsed;
    this.cannonAlpha = alpha;
  }

  private jumpForPresentation(pose: Pose): TrackJump {
    const jumps = this.trackData.jumps!;
    if (pose.airborne && pose._activeJumpId) {
      const active = jumps.find(jump => jump.id === pose._activeJumpId);
      if (active) return active;
    }
    let next: TrackJump | undefined;
    let nextDistance = Infinity;
    const distance = pose._lastPathDistance ?? 0;
    for (const jump of jumps) {
      const takeoff = jump.takeoff * this.track.totalLength;
      const untilTakeoff = (takeoff - distance + this.track.totalLength) % this.track.totalLength;
      const rampLength = jump.rampLength ?? ARCADE_LAB_RAMP_LENGTH;
      if (untilTakeoff <= rampLength + 0.5 && untilTakeoff < nextDistance) {
        next = jump;
        nextDistance = untilTakeoff;
      }
    }
    return next ?? jumps[0]!;
  }

  private resolveMuzzle = (event: CannonEvent, target: THREE.Vector3): void => {
    const index = this.participants.findIndex(car => car.id === event.ownerId);
    const pose = this.renderPoses[index];
    if (!pose) { target.set(event.x, event.y, event.z); return; }
    const sin = Math.sin(pose.heading), cos = Math.cos(pose.heading);
    target.set(pose.x + CANNON_MOUNT.x * cos + CANNON_MOUNT.z * sin,
      pose.y + CANNON_MOUNT.y, pose.z - CANNON_MOUNT.x * sin + CANNON_MOUNT.z * cos);
  };

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
    const playerIndex = Math.max(0, this.renderPoses.findIndex(participant => participant.isPlayer));
    const player = this.renderPoses[playerIndex];
    this.smoke.update(dt);
    const animationStart = performance.now();
    for (let index = 0; index < this.vehicles.length; index += 1) {
      const vehicle = this.vehicles[index];
      const pose = this.renderPoses[index];
      // Short body shudder communicates an impact; these transforms never feed physics.
      const hit = pose.shotImpactRemaining ?? 0;
      vehicle.rotation.z = hit > 0 ? Math.sin(hit * 65) * 0.055 * hit / 0.35 : 0;
      const respawnSequence = pose.respawnSequence ?? 0;
      if (this.previousRespawnSequences[index] !== respawnSequence) {
        this.jumpPresentations[index]?.reset(pose._landingSequence ?? 0);
        this.previousRespawnSequences[index] = respawnSequence;
      }
      const jump = this.trackData.jumps?.length ? this.jumpForPresentation(pose) : undefined;
      const surface = this.trackData.jumps?.length
        ? sampleTrackSurface(this.track, this.trackData.jumps, pose._lastPathDistance ?? 0) : null;
      const jumpPose = jump
        ? this.jumpPresentations[index]!.update({ airborne: Boolean(pose.airborne),
          airborneElapsed: pose._airborneElapsed ?? 0, verticalVelocity: pose.verticalVelocity ?? 0,
          speed: pose.speed, trackDistance: pose._lastPathDistance ?? 0,
          totalTrackLength: this.track.totalLength, jump, deltaSeconds: dt, physicalSurface: true,
          surfacePitchRadians: surface
            ? -Math.atan(surface.grade) * trackHeadingAlignment(pose.heading, surface.tangentX, surface.tangentZ) : 0,
          landingSequence: pose._landingSequence ?? 0,
          landingImpactSpeed: pose._landingImpactSpeed ?? 0,
          landingSurfaceSlope: pose._landingSurfaceSlope ?? 0 })
        : null;
      const cachedJumpPose = this.jumpPresentationPoses[index]!;
      if (jumpPose) {
        cachedJumpPose.pitch = jumpPose.pitch;
        cachedJumpPose.rampOffset = jumpPose.rampOffset;
        cachedJumpPose.suspensionOffset = jumpPose.suspensionOffset;
        vehicle.rotation.x = cachedJumpPose.pitch;
      }
      else {
        cachedJumpPose.pitch = 0;
        cachedJumpPose.rampOffset = 0;
        cachedJumpPose.suspensionOffset = 0;
        const verticalVelocity = pose.verticalVelocity ?? 0;
        const flightPitch = !pose.airborne ? 0 : verticalVelocity >= 0
          ? -0.16 - THREE.MathUtils.clamp(verticalVelocity / Math.max(1, pose.speed) * 0.2, 0, 0.12)
          : 0.18 + THREE.MathUtils.clamp(-verticalVelocity / Math.max(1, pose.speed) * 0.28, 0, 0.16);
        vehicle.rotation.x = THREE.MathUtils.clamp(flightPitch, -0.3, 0.34);
      }
      const rampOffset = cachedJumpPose.rampOffset;
      const suspensionOffset = cachedJumpPose.suspensionOffset;
      vehicle.position.y = pose.y + 0.08 + rampOffset + suspensionOffset
        + (hit > 0 ? Math.abs(Math.sin(hit * 40)) * 0.07 * hit / 0.35 : 0);
      const protection = pose.respawnProtection ?? 0;
      vehicle.visible = !pose.destroyed && (!(protection > 0) || Math.floor(protection * 8) % 2 === 0);
      const adapter = vehicle.userData.visualAdapter as { update(pose: Pose, dt: number, smoke: TireSmoke | null): void } | undefined;
      adapter?.update(pose, dt, pose.isPlayer && !pose.destroyed ? this.smoke : null);
    }
    this.damageEffects.update(this.renderPoses, this.vehicles, dt);
    if (this.cannon) this.cannonEffects.update(this.cannon.projectiles,
      this.cannon.consumeEvents(), this.cannonElapsed, this.cannonAlpha, dt, this.resolveMuzzle);
    this.lastAnimationMs = performance.now() - animationStart;
    if (player && !this.cameraFrozen) {
      if (player.respawnSequence !== this.lastPlayerRespawnSequence) {
        if (this.lastPlayerRespawnSequence !== undefined) this.cameraRig.resetAfterRespawn(player);
        this.lastPlayerRespawnSequence = player.respawnSequence;
      }
      const playerJumpPose = this.jumpPresentationPoses[playerIndex];
      this.cameraPose.x = player.x;
      this.cameraPose.y = player.y + (playerJumpPose?.rampOffset ?? 0) + (playerJumpPose?.suspensionOffset ?? 0);
      this.cameraPose.z = player.z;
      this.cameraPose.heading = player.heading;
      this.cameraPose.speed = player.speed;
      this.cameraPose.longitudinalAcceleration = player.longitudinalAcceleration ?? 0;
      this.cameraRig.update(this.cameraPose, dt);
      if (this.diagnostics) this.cameraUpdates += 1;
    }
    if (player) {
      this.spotlight.position.set(player.x - 4, player.y + 24, player.z + 6);
      const playerJumpPose = this.jumpPresentationPoses[playerIndex];
      this.spotlight.target.position.set(player.x,
        player.y + (playerJumpPose?.rampOffset ?? 0) + (playerJumpPose?.suspensionOffset ?? 0), player.z);
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
    this.cannonEffects.destroy();
    for (const vehicle of this.vehicles) {
      vehicle.userData.visualAdapter?.destroy();
      for (const material of vehicle.userData.ownedMaterials ?? []) material.dispose();
      const skeletons = new Set();
      vehicle.traverse((object: THREE.Object3D) => { if (object instanceof THREE.SkinnedMesh) object.skeleton.dispose(); });
    }
    for (const geometry of this.ownedGeometries) geometry.dispose();
    for (const texture of this.ownedTextures) texture.dispose();
    for (const material of this.ownedMaterials) material.dispose();
    this.scene.traverse((object: THREE.Object3D) => { if (object instanceof THREE.InstancedMesh) object.dispose(); });
    this.scene.clear();
    this.resources.renderer.renderLists.dispose();
  }
}

function splitGroundSegments(points: THREE.Vector3[], groundRows: readonly boolean[]): THREE.Vector3[][] {
  const firstGap = groundRows.indexOf(false);
  if (firstGap < 0) return [points];
  const segments: THREE.Vector3[][] = [];
  let segment: THREE.Vector3[] = [];
  for (let step = 1; step <= points.length; step += 1) {
    const index = (firstGap + step) % points.length;
    if (groundRows[index]) segment.push(points[index]!);
    else if (segment.length) {
      segments.push(segment);
      segment = [];
    }
  }
  if (segment.length) segments.push(segment);
  return segments;
}
