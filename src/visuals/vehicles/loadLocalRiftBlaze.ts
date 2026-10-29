import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { BuggyTemplate } from './BuggyTemplate.ts';
import { BuggyVisualAdapter } from './BuggyVisualAdapter.ts';
import { TireSmoke } from './TireSmoke.ts';

interface LocalGlbJson {
  buffers?: Array<{ uri?: string }>;
  images?: Array<{ uri?: string }>;
  animations?: unknown[];
  skins?: unknown[];
}

export async function loadLocalRiftBlaze() {
  const start = performance.now();
  const response = await fetch('/__local-models/rift-blaze.glb', { cache: 'no-store' });
  if (!response.ok) throw new Error('Modelo local indisponível');
  const data = await response.arrayBuffer();
  // Embedded GLB only: do not allow the model to request arbitrary remote/local
  // resources through image/buffer URIs, even if the file is later replaced.
  if (data.byteLength < 20) throw new Error('GLB incompleto');
  const view = new DataView(data);
  if (view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2
    || view.getUint32(8, true) !== data.byteLength || view.getUint32(16, true) !== 0x4e4f534a) throw new Error('GLB inválido');
  const json: LocalGlbJson = JSON.parse(new TextDecoder().decode(new Uint8Array(data, 20, view.getUint32(12, true))).trim());
  if ([...(json.buffers ?? []), ...(json.images ?? [])].some(item => item.uri)) throw new Error('GLB com recursos externos bloqueado');
  if ((json.animations?.length ?? 0) || (json.skins?.length ?? 0)) throw new Error('Estrutura diferente da inspeção aprovada');
  const manager = new THREE.LoadingManager();
  manager.setURLModifier(url => {
    if (!url.startsWith('blob:')) throw new Error('Recurso externo bloqueado');
    return url;
  });
  const gltf = await new GLTFLoader(manager).parseAsync(data, '');
  const template = new BuggyTemplate(gltf);
  template.loadMs = performance.now() - start;
  template.fileBytes = data.byteLength;
  template.createAdapter = root => new BuggyVisualAdapter(root, template.wheels);
  template.createSmoke = scene => new TireSmoke(scene);
  return template;
}
