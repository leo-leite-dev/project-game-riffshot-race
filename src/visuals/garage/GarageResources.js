import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { VEHICLE } from '../../data/vehicles.js';

// One resource owner per game: no animation loop, no DOM canvas, one GLB request.
export class GarageResources {
  constructor(game) {
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
    this.loads = 0;
    this.promise = null;
    this.disposed = false;
    game.events.once('destroy', () => this.destroy());
  }

  load() {
    if (!this.promise) {
      this.promise = (import.meta.env.DEV ? this.loadLocalModel() : Promise.resolve(null))
        .catch(() => null)
        .then(gltf => {
          // The Air Blade is a local-only development asset. Production builds
          // never request it; they always use this original procedural vehicle.
          this.model = gltf ?? this.createOriginalModel();
          this.source = gltf ? 'air-blade-local' : 'original';
          if (this.disposed) { this.releaseModel(); throw new Error('Jogo encerrado'); }
          return this.model;
        }).catch(error => { this.promise = null; throw error; });
    }
    return this.promise;
  }

  async loadLocalModel() {
    this.loads += 1;
    return new GLTFLoader().loadAsync(VEHICLE.modelUrl);
  }

  createOriginalModel() {
    const scene = new THREE.Group();
    const painted = new THREE.MeshPhysicalMaterial({
      name: VEHICLE.paintMaterial, color: 0xffffff, metalness: 0.78,
      roughness: 0.28, clearcoat: 0.85, clearcoatRoughness: 0.18,
    });
    const chassis = new THREE.MeshStandardMaterial({ color: 0x202d3b, metalness: 0.8, roughness: 0.38 });
    const glass = new THREE.MeshPhysicalMaterial({ color: 0x162a42, metalness: 0.48, roughness: 0.2, clearcoat: 0.9 });
    const tire = new THREE.MeshStandardMaterial({ color: 0x11151c, roughness: 0.82 });
    const alloy = new THREE.MeshStandardMaterial({ color: 0x9ab4c9, metalness: 0.9, roughness: 0.24 });
    const lamp = new THREE.MeshStandardMaterial({ color: 0xbafaff, emissive: 0x71f6ff, emissiveIntensity: 2.2 });
    const add = (geometry, material, position, rotation = null, scale = null) => {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(...position);
      if (rotation) mesh.rotation.set(...rotation);
      if (scale) mesh.scale.set(...scale);
      scene.add(mesh);
      return mesh;
    };

    // Original low-poly electric rally coupe made from project-owned geometry:
    // tapered nose, armored fenders, canopy, visible mechanical wheels and lamps.
    add(new THREE.BoxGeometry(1.65, 0.35, 2.25), painted, [0, 0.68, 0]);
    add(new THREE.ConeGeometry(0.84, 1.1, 6), painted, [0, 0.72, 1.38], [Math.PI / 2, 0, 0], [1, 0.48, 1]);
    add(new THREE.BoxGeometry(1.98, 0.32, 0.62), painted, [0, 0.65, -1.18]);
    add(new THREE.SphereGeometry(0.68, 12, 8), glass, [0, 1.04, -0.08], null, [0.78, 0.48, 1.05]);
    add(new THREE.BoxGeometry(1.98, 0.12, 0.12), chassis, [0, 0.43, 0]);
    add(new THREE.BoxGeometry(1.8, 0.1, 0.46), chassis, [0, 0.98, -1.42]);
    add(new THREE.BoxGeometry(0.1, 0.38, 0.08), chassis, [-0.72, 0.9, -1.42]);
    add(new THREE.BoxGeometry(0.1, 0.38, 0.08), chassis, [0.72, 0.9, -1.42]);
    for (const x of [-0.92, 0.92]) {
      for (const z of [-0.9, 0.95]) {
        add(new THREE.CylinderGeometry(0.43, 0.43, 0.28, 16), tire, [x, 0.43, z], [0, 0, Math.PI / 2]);
        add(new THREE.CylinderGeometry(0.23, 0.23, 0.3, 12), alloy, [x * 1.01, 0.43, z], [0, 0, Math.PI / 2]);
      }
    }
    for (const x of [-0.54, 0.54]) {
      add(new THREE.BoxGeometry(0.34, 0.1, 0.1), lamp, [x, 0.78, 1.93]);
      add(new THREE.BoxGeometry(0.1, 0.12, 0.08), lamp, [x, 0.72, -1.51]);
    }

    this.originalMaterials = [painted, chassis, glass, tire, alloy, lamp];
    this.originalGeometries = new Set();
    scene.traverse(object => { if (object.geometry) this.originalGeometries.add(object.geometry); });
    return { scene, animations: [], parser: null, asset: { generator: 'RIFFSHOT RACING procedural vehicle' } };
  }

  createVehicle(paint) {
    // SkeletonUtils is necessary: the supplied GLB has skinned wheel meshes.
    const root = clone(this.model.scene);
    const ownedMaterials = [];
    root.traverse(object => {
      if (!object.isMesh) return;
      const recolor = material => {
        if (material.name !== VEHICLE.paintMaterial) return material;
        const independent = material.clone();
        independent.color.set(paint.color);
        ownedMaterials.push(independent);
        return independent;
      };
      object.material = Array.isArray(object.material) ? object.material.map(recolor) : recolor(object.material);
    });
    if (!ownedMaterials.length) throw new Error('Material de pintura não encontrado no modelo');
    root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const scale = 3.25 / Math.max(size.x, size.z);
    const normalization = new THREE.Group();
    normalization.scale.setScalar(scale);
    root.position.sub(new THREE.Vector3(center.x, box.min.y, center.z));
    normalization.add(root);
    const vehicle = new THREE.Group();
    vehicle.add(normalization);
    vehicle.userData = { paintId: paint.id, ownedMaterials, size: size.multiplyScalar(scale) };
    return vehicle;
  }

  releaseModel() {
    if (!this.model) return;
    if (this.source === 'original') {
      for (const geometry of this.originalGeometries ?? []) geometry.dispose();
      for (const material of this.originalMaterials ?? []) material.dispose();
      this.originalGeometries?.clear();
      this.originalMaterials = null;
      this.model = null;
      return;
    }
    const geometries = new Set(), materials = new Set(), textures = new Set();
    this.model.scene.traverse(object => {
      if (object.geometry) geometries.add(object.geometry);
      if (object.material) for (const material of [object.material].flat()) materials.add(material);
    });
    for (const material of materials) {
      for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
      material.dispose();
    }
    for (const geometry of geometries) geometry.dispose();
    for (const texture of textures) { texture.dispose(); texture.source.data?.close?.(); }
    this.model.scene.traverse(object => object.skeleton?.dispose());
    this.model = null;
  }

  destroy() {
    if (this.disposed) return;
    this.disposed = true;
    this.releaseModel();
    this.environment.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}

export function getGarageResources(game) {
  if (!game.garageResources) game.garageResources = new GarageResources(game);
  return game.garageResources;
}
