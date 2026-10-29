import * as THREE from 'three';
import type Phaser from 'phaser';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { VEHICLE, VEHICLES, getVehicleById, type Vehicle } from '../../data/vehicles.ts';
import { VehicleModelCache } from '../vehicles/loadVehicleModels.ts';
import type { VehicleModelAsset } from '../vehicles/vehicleModels.ts';
import type { VehicleGlbTemplate, VehiclePaint } from '../vehicles/VehicleGlbTemplate.ts';

type Vec3 = [number, number, number];
type VehicleNode = THREE.Group & { userData: {
  paintId?: string; source?: string; vehicleId?: string; ownedMaterials?: THREE.Material[];
  paintMaterials?: THREE.MeshStandardMaterial[]; size: THREE.Vector3; visualAdapter?: { destroy(): void };
} };
type ModelFailure = Readonly<{ source: 'vehicle-glb'; url: string | null; modelFile: string | null; reason: string; fallback: 'procedural' }>;

// The game owns one renderer and cached GLB templates. Geometry/textures are
// shared; procedural vehicles remain the safe fallback for individual failures.
export class GarageResources {
  renderer: THREE.WebGLRenderer;
  environment: THREE.WebGLRenderTarget;
  models = new Map<string, THREE.Group>();
  sharedGeometries = new Set<THREE.BufferGeometry>();
  sharedMaterials = new Set<THREE.Material>();
  promise: Promise<this> | null = null;
  disposed = false;
  source: 'procedural' | 'vehicle-glb' | 'procedural-fallback' = 'procedural';
  modelFailures: ModelFailure[] = [];
  vehicleModels: VehicleModelCache;
  experimentalPromise?: Promise<this>;
  experimentalStatus?: 'loading' | 'ready' | 'fallback';
  experimentalTemplate?: {
    create(paint: VehiclePaint): THREE.Group;
    createAdapter?: (root: THREE.Object3D) => { destroy(): void };
    destroy(): void;
  };

  constructor(game: Phaser.Game) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.95;
    const environmentScene = new RoomEnvironment();
    const generator = new THREE.PMREMGenerator(this.renderer);
    this.environment = generator.fromScene(environmentScene, 0.04);
    environmentScene.dispose();
    generator.dispose();
    this.models = new Map();
    this.sharedGeometries = new Set();
    this.sharedMaterials = new Set();
    this.promise = null;
    this.disposed = false;
    this.source = 'procedural';
    this.modelFailures = [];
    this.vehicleModels = new VehicleModelCache({
      onFailure: (asset, error) => this.recordModelFailure(asset, error),
    });
    game.events.once('destroy', () => this.destroy());
  }

  load(vehicleIds: readonly string[] = VEHICLES.map(vehicle => vehicle.id)): Promise<this> {
    // Cache promises per canonical model, rather than freezing the first subset.
    // Existing load() callers still load all; later subsets can extend the cache.
    const vehicles = [...new Set(vehicleIds)].map(id => getVehicleById(id)).filter((vehicle): vehicle is Readonly<Vehicle> => vehicle !== null);
    const loading = (async () => {
      await Promise.all(vehicles.map(vehicle => this.vehicleModels.load(vehicle.modelFile!)));
      if (this.disposed) return this;
      this.source = this.vehicleModels.templates.size ? 'vehicle-glb' : 'procedural-fallback';
      if (import.meta.env?.DEV && new URLSearchParams(window.location.search).get('localRiftBlaze') === '1') {
        if (this.experimentalPromise) { await this.experimentalPromise; return this; }
        this.experimentalPromise = this.loadExperimental();
        await this.experimentalPromise;
      }
      return this;
    })();
    this.promise = loading;
    return loading;
  }

  async loadExperimental(): Promise<this> {
    this.experimentalStatus = 'loading';
    try {
      const { loadLocalRiftBlaze } = await import('../vehicles/loadLocalRiftBlaze.ts');
      const template = await loadLocalRiftBlaze();
      if (this.disposed) { template.destroy(); return this; }
      this.experimentalTemplate = template;
      this.experimentalStatus = 'ready';
    } catch (_error) {
      this.experimentalStatus = 'fallback';
      // Expected local-file failures must never block the official garage.
    }
    return this;
  }

  get metrics() {
    return Object.freeze({ source: this.source,
      models: Object.freeze([...this.vehicleModels.templates.values()].map(template => Object.freeze({
        modelFile: template.asset.fileName, fileBytes: template.fileBytes ?? null,
        loadMs: template.loadMs ?? null, ...template.metrics,
      }))),
      failures: Object.freeze([...this.modelFailures]),
    });
  }

  sharedMaterial<T extends THREE.Material>(material: T): T {
    this.sharedMaterials.add(material);
    return material;
  }

  recordModelFailure(asset: VehicleModelAsset | null, error: unknown): void {
    const url = asset?.url ?? null;
    if (this.modelFailures.some(failure => failure.url === url)) return;
    const reason = error instanceof Error ? error.message : 'Falha desconhecida no modelo GLB.';
    const failure: ModelFailure = Object.freeze({ source: 'vehicle-glb', url, modelFile: asset?.fileName ?? null, reason, fallback: 'procedural' });
    this.modelFailures.push(failure);
    console.warn('[vehicle-glb:fallback]', failure.modelFile, failure.reason);
  }

  sharedGeometry<T extends THREE.BufferGeometry>(geometry: T): T {
    this.sharedGeometries.add(geometry);
    return geometry;
  }

  buildModel(vehicle: Readonly<Vehicle>): THREE.Group {
    const design = vehicle.design;
    const scene = new THREE.Group();
    const paint = this.sharedMaterial(new THREE.MeshPhysicalMaterial({
      name: 'ProjectVehiclePaint', color: 0xffffff, metalness: 0.78,
      roughness: 0.28, clearcoat: 0.85, clearcoatRoughness: 0.18,
    }));
    const chassis = this.sharedMaterial(new THREE.MeshStandardMaterial({ color: 0x202d3b, metalness: 0.8, roughness: 0.38 }));
    const glass = this.sharedMaterial(new THREE.MeshPhysicalMaterial({ color: 0x162a42, metalness: 0.48, roughness: 0.2, clearcoat: 0.9 }));
    const tire = this.sharedMaterial(new THREE.MeshStandardMaterial({ color: 0x11151c, roughness: 0.82 }));
    const alloy = this.sharedMaterial(new THREE.MeshStandardMaterial({ color: 0x9ab4c9, metalness: 0.9, roughness: 0.24 }));
    const lamp = this.sharedMaterial(new THREE.MeshStandardMaterial({ color: 0xbafaff, emissive: 0x71f6ff, emissiveIntensity: 2.2 }));
    const add = (geometry: THREE.BufferGeometry, material: THREE.Material, position: Vec3,
      rotation: Vec3 | null = null, paintable = false): THREE.Mesh => {
      const mesh = new THREE.Mesh(this.sharedGeometry(geometry), material);
      mesh.position.set(...position);
      if (rotation) mesh.rotation.set(...rotation);
      if (paintable) mesh.userData.paintable = true;
      scene.add(mesh);
      return mesh;
    };
    const box = (size: Vec3, position: Vec3, material: THREE.Material, rotation: Vec3 | null = null, paintable = false): THREE.Mesh =>
      add(new THREE.BoxGeometry(...size), material, position, rotation, paintable);
    const { width, length, height, wheelbase, body } = design;

    if (body === 'coupe') {
      box([width, height, length * 0.58], [0, 0.67, -0.02], paint, null, true);
      add(new THREE.ConeGeometry(width * 0.46, length * 0.43, 6), paint,
        [0, 0.69, length * 0.35], [Math.PI / 2, 0, 0], true);
      box([width * 1.16, 0.34, 0.35], [0, 0.64, -length * 0.42], paint, null, true);
      add(new THREE.SphereGeometry(width * 0.39, 12, 8), glass,
        [0, 1.02, -0.08], [0, 0, 0]);
      box([width * 1.16, 0.1, 0.42], [0, 1.0, -length * 0.48], chassis);
      for (const side of [-1, 1]) box([0.24, 0.28, 1.1], [side * width * 0.54, 0.58, -0.02], paint, null, true);
    } else if (body === 'streamliner') {
      box([width, height, length * 0.62], [0, 0.58, -0.03], paint, null, true);
      add(new THREE.ConeGeometry(width * 0.43, length * 0.44, 5), paint,
        [0, 0.59, length * 0.34], [Math.PI / 2, 0, 0], true);
      add(new THREE.SphereGeometry(width * 0.34, 12, 8), glass,
        [0, 0.85, -0.12], [0, 0, 0]);
      for (const side of [-1, 1]) {
        box([0.14, 0.22, length * 0.62], [side * width * 0.56, 0.56, -0.04], chassis);
        box([0.08, 0.6, 0.12], [side * width * 0.5, 0.86, -length * 0.43], paint,
          [side * -0.12, 0, side * 0.08], true);
      }
      box([width * 0.8, 0.1, 0.36], [0, 0.91, -length * 0.43], paint, null, true);
    } else {
      box([width, height, length * 0.68], [0, 0.79, -0.03], paint, null, true);
      box([width * 0.84, height * 0.7, length * 0.34], [0, 1.3, -0.12], chassis);
      box([width * 1.12, 0.45, 0.38], [0, 0.67, length * 0.49], chassis);
      box([width * 1.06, 0.24, 0.28], [0, 0.86, length * 0.5], paint, null, true);
      for (const side of [-1, 1]) {
        box([0.25, height * 0.66, length * 0.62], [side * width * 0.51, 0.88, -0.02], paint, null, true);
        box([0.13, 0.14, 0.4], [side * width * 0.48, 1.02, -length * 0.49], lamp);
      }
      box([0.18, 0.18, 0.9], [0, 1.42, -0.08], chassis);
    }

    const wheelX = width * 0.48;
    for (const x of [-wheelX, wheelX]) for (const z of [-wheelbase, wheelbase]) {
      add(new THREE.CylinderGeometry(0.38, 0.38, 0.28, 16), tire,
        [x, 0.42, z], [0, 0, Math.PI / 2]);
      add(new THREE.CylinderGeometry(0.21, 0.21, 0.3, 12), alloy,
        [x * 1.01, 0.42, z], [0, 0, Math.PI / 2]);
    }
    for (const x of [-width * 0.3, width * 0.3]) {
      box([0.32, 0.1, 0.1], [x, 0.78, length * 0.49], lamp);
      box([0.1, 0.12, 0.08], [x, 0.72, -length * 0.5], lamp);
    }
    return scene;
  }

  getModel(vehicle: Readonly<Vehicle>): THREE.Group {
    if (!this.models.has(vehicle.id)) this.models.set(vehicle.id, this.buildModel(vehicle));
    return this.models.get(vehicle.id)!;
  }

  createVehicle(vehicleId: string | VehiclePaint, paint?: VehiclePaint, { experimental = false }: { experimental?: boolean } = {}): VehicleNode {
    // Accept the prior paint-only signature as a small compatibility bridge.
    if (vehicleId && typeof vehicleId === 'object' && !paint) {
      paint = vehicleId;
      vehicleId = VEHICLE.id;
    }
    const model = getVehicleById(typeof vehicleId === 'string' ? vehicleId : null) ?? VEHICLE;
    if (!paint?.color || !paint.id) throw new TypeError('Pintura de veículo inválida.');
    if (experimental && model.id === 'rift-blaze' && this.experimentalStatus === 'ready') {
      let vehicle;
      try {
        vehicle = this.experimentalTemplate!.create(paint) as VehicleNode;
        if (this.experimentalTemplate!.createAdapter) vehicle.userData.visualAdapter = this.experimentalTemplate!.createAdapter(vehicle);
        return vehicle;
      } catch (_error) {
        vehicle?.userData.visualAdapter?.destroy();
        for (const material of vehicle?.userData.ownedMaterials ?? []) material.dispose();
        this.experimentalStatus = 'fallback';
      }
    }
    const template = this.vehicleModels.get(model.modelFile!);
    if (template) {
      try { return template.create(model.id, paint) as VehicleNode; }
      catch (error) { this.recordModelFailure(template.asset, error); }
    }
    const root = this.getModel(model).clone(true);
    const ownedMaterials: THREE.Material[] = [];
    root.traverse((object: THREE.Object3D) => {
      if (!(object instanceof THREE.Mesh) || !object.userData.paintable) return;
      const material = object.material.clone();
      material.color.set(paint.color);
      object.material = material;
      ownedMaterials.push(material);
    });
    if (!ownedMaterials.length) throw new Error(`Modelo procedural sem peças pintáveis: ${model.id}`);
    root.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(root);
    const size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());
    const scale = 3.25 / Math.max(size.x, size.z);
    const normalization = new THREE.Group();
    normalization.scale.setScalar(scale);
    root.position.sub(new THREE.Vector3(center.x, bounds.min.y, center.z));
    normalization.add(root);
    const vehicle = new THREE.Group();
    vehicle.add(normalization);
    vehicle.userData = { source: 'procedural-fallback', vehicleId: model.id, paintId: paint.id,
      ownedMaterials, paintMaterials: ownedMaterials, size: size.multiplyScalar(scale) };
    return vehicle as VehicleNode;
  }

  paintVehicle(vehicle: VehicleNode, paint: VehiclePaint): void {
    for (const material of vehicle.userData.paintMaterials ?? (vehicle.userData.ownedMaterials as THREE.MeshStandardMaterial[])) material.color.set(paint.color);
    vehicle.userData.paintId = paint.id;
  }

  destroy() {
    if (this.disposed) return;
    this.disposed = true;
    this.vehicleModels.destroy();
    this.experimentalTemplate?.destroy();
    for (const model of this.models.values()) model.clear();
    this.models.clear();
    for (const geometry of this.sharedGeometries) geometry.dispose();
    for (const material of this.sharedMaterials) material.dispose();
    this.sharedGeometries.clear();
    this.sharedMaterials.clear();
    this.environment.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}

export function getGarageResources(game: Phaser.Game & { garageResources?: GarageResources }): GarageResources {
  if (!game.garageResources) game.garageResources = new GarageResources(game);
  return game.garageResources;
}
