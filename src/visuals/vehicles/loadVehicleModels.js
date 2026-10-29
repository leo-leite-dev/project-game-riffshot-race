import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { getVehicleModelAsset } from './vehicleModels.js';
import { VehicleGlbTemplate, disposeVehicleGltf } from './VehicleGlbTemplate.js';

function reviewedFan(json, data, asset, binStart) {
  if (asset?.fileName !== 'thunder_bug.glb' || json.animations.length !== 1) return false;
  const clip = json.animations[0], channel = clip.channels?.[0], sampler = clip.samplers?.[0];
  if (clip.name !== 'Fan' || clip.channels?.length !== 1 || clip.samplers?.length !== 1
    || channel.sampler !== 0 || channel.target?.node !== 8 || channel.target.path !== 'rotation'
    || json.nodes?.[8]?.name !== 'EngineFan_Engine_0_000_5' || sampler.interpolation !== 'LINEAR') return false;
  const fingerprint = (index, type, width) => {
    const a = json.accessors?.[index], view = json.bufferViews?.[a?.bufferView];
    if (!a || !view || a.type !== type || a.componentType !== 5126 || a.count !== 101
      || a.sparse || a.normalized || view.buffer !== 0) return null;
    let hash = 2166136261;
    const bytes = new Uint8Array(data);
    for (let i = 0; i < a.count; i++) for (let j = 0; j < width; j++) {
      const offset = (view.byteOffset ?? 0) + (a.byteOffset ?? 0) + i * (view.byteStride ?? width) + j;
      if (offset < (view.byteOffset ?? 0) || offset >= (view.byteOffset ?? 0) + view.byteLength
        || binStart + offset >= data.byteLength) return null;
      hash = Math.imul(hash ^ bytes[binStart + offset], 16777619) >>> 0;
    }
    return hash;
  };
  // Fingerprints of the reviewed 101 original time/quaternion keys (2 seconds).
  // Accessor numbers may change during lossless repacking, key bytes may not.
  return fingerprint(sampler.input, 'SCALAR', 4) === 741869065
    && fingerprint(sampler.output, 'VEC4', 16) === 3614141978;
}

export function inspectVehicleGlb(data, asset = null) {
  if (!(data instanceof ArrayBuffer) || data.byteLength < 20) throw new Error('GLB incompleto.');
  const view = new DataView(data);
  const jsonLength = view.getUint32(12, true);
  if (view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2
    || view.getUint32(8, true) !== data.byteLength || view.getUint32(16, true) !== 0x4e4f534a
    || jsonLength > data.byteLength - 20) throw new Error('GLB inválido.');
  const json = JSON.parse(new TextDecoder().decode(new Uint8Array(data, 20, jsonLength)).trim());
  if ([...(json.buffers ?? []), ...(json.images ?? [])].some(item => item.uri !== undefined)) {
    throw new Error('GLB com recursos externos bloqueado.');
  }
  const materialExtensions = new Set(asset?.fileName === 'armored_car_death_race.glb'
    ? ['KHR_materials_specular', 'KHR_materials_transmission']
    : asset?.fileName === 'widowmaker_-_death_race_2000.glb' ? ['KHR_materials_specular'] : []);
  const materials = new Set(json.materials ?? []);
  const checkExtensions = value => {
    if (!value || typeof value !== 'object') return;
    if (value.extensions && (!materials.has(value)
      || Object.keys(value.extensions).some(key => !materialExtensions.has(key)))) throw new Error('Estrutura GLB não aprovada.');
    for (const child of Object.values(value)) checkExtensions(child);
  };
  checkExtensions(json);
  if (json.skins?.length || json.nodes?.some(node => node.skin !== undefined || node.weights !== undefined)
    || json.meshes?.some(mesh => mesh.weights !== undefined || mesh.primitives?.some(p => p.targets !== undefined))
    || [...(json.extensionsUsed ?? []), ...(json.extensionsRequired ?? [])].some(key => !materialExtensions.has(key))) throw new Error('Estrutura GLB não aprovada.');
  const binHeader = 20 + jsonLength;
  if (json.animations?.length && (binHeader + 8 > data.byteLength
    || view.getUint32(binHeader + 4, true) !== 0x004e4942
    || view.getUint32(binHeader, true) !== data.byteLength - binHeader - 8
    || !reviewedFan(json, data, asset, binHeader + 8))) throw new Error('Animação GLB não aprovada.');
  return json;
}

export async function loadVehicleGlb(asset) {
  const start = performance.now();
  const response = await fetch(asset.url);
  if (!response.ok) throw new Error(`Veículo GLB indisponível (HTTP ${response.status}).`);
  const data = await response.arrayBuffer();
  inspectVehicleGlb(data, asset);
  const manager = new THREE.LoadingManager();
  let imageFailed = false;
  manager.onError = () => { imageFailed = true; };
  manager.setURLModifier(url => {
    if (!url.startsWith('blob:')) throw new Error('Recurso externo bloqueado.');
    return url;
  });
  const gltf = await new GLTFLoader(manager).parseAsync(data, '');
  try {
    // GLTFLoader may resolve the scene after a failed image, using a null map.
    // Treat that as an asset failure instead of displaying an untextured car.
    if (imageFailed) throw new Error('Falha ao decodificar texturas do veículo GLB.');
    const template = new VehicleGlbTemplate(gltf, asset);
    template.fileBytes = data.byteLength;
    template.loadMs = performance.now() - start;
    return template;
  } catch (error) {
    disposeVehicleGltf(gltf);
    throw error;
  }
}

// One cache per GarageResources/game. Pending requests are cached too, including
// failures, so duplicate IDs and repeated load() calls cannot hammer the server.
export class VehicleModelCache {
  constructor({ loader = loadVehicleGlb, onFailure = () => {} } = {}) {
    this.loader = loader;
    this.onFailure = onFailure;
    this.pending = new Map();
    this.templates = new Map();
    this.disposed = false;
  }

  load(modelFile) {
    const asset = getVehicleModelAsset(modelFile);
    if (this.disposed || !asset) return Promise.resolve(null);
    if (!this.pending.has(asset.url)) {
      const promise = Promise.resolve().then(() => this.loader(asset)).then(template => {
        if (this.disposed) { template.destroy(); return null; }
        this.templates.set(asset.url, template);
        return template;
      }).catch(error => {
        if (!this.disposed) this.onFailure(asset, error);
        return null;
      });
      this.pending.set(asset.url, promise);
    }
    return this.pending.get(asset.url);
  }

  get(modelFile) {
    return this.templates.get(getVehicleModelAsset(modelFile)?.url) ?? null;
  }

  destroy() {
    if (this.disposed) return;
    this.disposed = true;
    for (const template of this.templates.values()) template.destroy();
    this.templates.clear();
    this.pending.clear();
  }
}
