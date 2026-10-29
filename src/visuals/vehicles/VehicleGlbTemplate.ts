import * as THREE from 'three';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { prepareVehicleWheels, type VehicleWheelSpec } from './vehicleWheelGeometry.ts';
import { VehicleVisualAdapter } from './VehicleVisualAdapter.ts';
import type { VehicleModelAsset } from './vehicleModels.ts';

const isMeshObject = (object: THREE.Object3D): object is THREE.Mesh => object instanceof THREE.Mesh;
const isSkinnedMeshObject = (object: THREE.Object3D): object is THREE.SkinnedMesh => object instanceof THREE.SkinnedMesh;

export interface VehiclePaint {
  id: string;
  color: string;
}

interface VehicleGlbMetrics {
  readonly meshes: number;
  readonly triangles: number;
  readonly yaw: number;
  readonly scale: number;
}

// Templates own GPU resources. Instances share geometry/textures and non-paint
// materials; only explicitly isolated body materials may be cloned/recolored.
export function disposeVehicleGltf(gltf: GLTF) {
  const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>(),
    textures = new Set<THREE.Texture>(), images = new Set<{ close?: () => void }>();
  for (const scene of new Set([gltf.scene, ...(gltf.scenes ?? [])])) scene?.traverse(object => {
    if (!isMeshObject(object)) return;
    geometries.add(object.geometry);
    for (const material of [object.material].flat()) if (material) materials.add(material);
  });
  for (const material of materials) {
    for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
    material.dispose();
  }
  for (const geometry of geometries) geometry.dispose();
  for (const texture of textures) {
    for (const image of [texture.source?.data].flat() as Array<{ close?: () => void } | undefined>) if (image) images.add(image);
    texture.dispose();
  }
  for (const image of images) image.close?.();
}

export class VehicleGlbTemplate {
  gltf: GLTF | null;
  asset: VehicleModelAsset;
  disposed = false;
  root: THREE.Group;
  size: THREE.Vector3;
  metrics: Readonly<VehicleGlbMetrics>;
  paintNames: Set<string>;
  derivedGeometries = new Set<THREE.BufferGeometry>();
  wheels!: readonly VehicleWheelSpec[];
  fileBytes?: number;
  loadMs?: number;

  constructor(gltf: GLTF, asset: VehicleModelAsset) {
    this.gltf = gltf;
    this.asset = asset;
    this.root = new THREE.Group();
    this.root.name = `vehicle-glb:${asset.fileName}`;
    const orientation = new THREE.Group();
    orientation.rotation.y = asset.yaw;
    orientation.add(gltf.scene.clone(true));
    this.root.add(orientation);
    this.root.updateMatrixWorld(true);
    let meshes = 0, triangles = 0;
    gltf.scene.traverse(object => {
      if (!isMeshObject(object)) return;
      if (isSkinnedMeshObject(object)) throw new Error('Rig de veículo não suportado.');
      meshes += 1;
      triangles += (object.geometry.index?.count ?? object.geometry.attributes.position?.count ?? 0) / 3;
    });
    const bounds = new THREE.Box3().setFromObject(orientation, true);
    const size = bounds.getSize(new THREE.Vector3());
    if (!meshes || ![size.x, size.y, size.z].every(value => Number.isFinite(value) && value > 0)) {
      throw new Error('Dimensões inválidas do veículo GLB.');
    }
    const scale = 3.25 / size.z;
    const center = bounds.getCenter(new THREE.Vector3());
    // Translation outside orientation keeps the model's original hierarchy intact.
    this.root.scale.setScalar(scale);
    this.root.position.set(-center.x * scale, -bounds.min.y * scale, -center.z * scale);
    const normalized = new THREE.Group();
    normalized.add(this.root);
    this.root = normalized;
    this.size = size.multiplyScalar(scale);
    this.metrics = Object.freeze({ meshes, triangles, yaw: asset.yaw, scale });
    this.paintNames = new Set(asset.paintMaterialNames);
    try {
      this.wheels = Object.freeze(prepareVehicleWheels(this.root, asset, this.metrics, this.derivedGeometries));
    } catch (error) {
      for (const geometry of this.derivedGeometries) geometry.dispose();
      throw error;
    }
  }

  create(vehicleId: string, paint: VehiclePaint) {
    if (this.disposed) throw new Error('Template GLB descartado.');
    const root = this.root.clone(true);
    const copies = new Map<THREE.Material, THREE.Material>();
    root.traverse(object => {
      if (!isMeshObject(object)) return;
      const recolor = (material: THREE.Material): THREE.Material => {
        if (!this.paintNames.has(material.name)) return material;
        if (!copies.has(material)) {
          const copy = material.clone();
          (copy as THREE.MeshStandardMaterial).color.set(paint.color);
          copies.set(material, copy);
        }
        return copies.get(material)!;
      };
      object.material = Array.isArray(object.material) ? object.material.map(recolor) : recolor(object.material);
    });
    const paintMaterials = [...copies.values()];
    root.userData = {
      source: 'vehicle-glb', vehicleId, paintId: paint.id, size: this.size.clone(),
      ownedMaterials: paintMaterials, paintMaterials,
      paintSupported: paintMaterials.length > 0,
      paintUnavailableReason: paintMaterials.length ? null : 'mixed-texture-atlas',
      modelFile: this.asset.fileName, modelUrl: this.asset.url,
      wheelsAnimated: this.wheels.length === 4, wheelCount: this.wheels.length,
      wheelRadii: Object.freeze(this.wheels.map(wheel => wheel.radius)),
      wheelRadius: this.wheels.length ? this.wheels.reduce((n, wheel) => n + wheel.radius, 0) / this.wheels.length : null,
      wheelSpecs: this.wheels, modelMetrics: this.metrics,
    };
    root.userData.visualAdapter = new VehicleVisualAdapter(root, this.wheels,
      this.asset.fileName === 'thunder_bug.glb' ? this.gltf!.animations : []);
    return root;
  }

  destroy() {
    if (this.disposed) return;
    this.disposed = true;
    disposeVehicleGltf(this.gltf!);
    for (const geometry of this.derivedGeometries) geometry.dispose();
    this.derivedGeometries.clear();
    this.gltf = null;
    this.root.clear();
  }
}
