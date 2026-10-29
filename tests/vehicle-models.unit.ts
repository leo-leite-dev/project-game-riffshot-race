import test from 'node:test';
import type { TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import type { BufferAttribute, BufferGeometry, Mesh, Object3D } from 'three';
import { VEHICLE_MODEL_ASSETS, getVehicleModelAsset } from '../src/visuals/vehicles/vehicleModels.ts';
import { VehicleGlbTemplate } from '../src/visuals/vehicles/VehicleGlbTemplate.ts';
import { VehicleModelCache, inspectVehicleGlb, loadVehicleGlb } from '../src/visuals/vehicles/loadVehicleModels.ts';
import { GarageResources } from '../src/visuals/garage/GarageResources.ts';
import type { VehicleWheelSpec } from '../src/visuals/vehicles/vehicleWheelGeometry.ts';

const paint = { id: 'red', color: '#e53935' };
const blue = { id: 'blue', color: '#1677ff' };
const near = (a: number, b: number): void => assert.ok(Math.abs(a - b) < 1e-5, `${a} ≠ ${b}`);

type Fixture = GLTF & { texture: THREE.Texture; materials: THREE.MeshStandardMaterial[]; geometry: THREE.BoxGeometry };
type Wheel = VehicleWheelSpec & { steer: THREE.Object3D; spin: THREE.Object3D };
function fixture(names: string[] = ['body', 'tire']): Fixture {
  const scene = new THREE.Group();
  const geometry = new THREE.BoxGeometry(2, 1, 4);
  const texture = new THREE.Texture();
  const materials = names.map(name => new THREE.MeshStandardMaterial({ name, map: texture }));
  scene.add(new THREE.Mesh(geometry, materials));
  scene.position.set(8, 4, -5);
  return { scene, scenes: [scene], animations: [], cameras: [], asset: { version: '2.0' }, parser: {}, userData: {}, texture, materials, geometry } as unknown as Fixture;
}

const expected = {
  'thunder_bug.glb': { width: 2.37114, height: 1.51635, front: [0, 0, 1] },
  'race_car.glb': { width: 1.9475463, height: 1.1717128, front: [-1, 0, 0] },
  'camaro.glb': { width: 1.3191726, height: 0.8978968, front: [0, 0, 1] },
  'armored_car_death_race.glb': { width: 1.3727246, height: 0.9888740, front: [1, 0, 0] },
  'widowmaker_-_death_race_2000.glb': { width: 1.27542, height: 1.012406, front: [0.5667, 0, 0.8239] },
} as const;
type ExpectedAsset = keyof typeof expected;
for (const asset of VEHICLE_MODEL_ASSETS) {
  test(`GLB real ${asset.fileName}: dimensões, triângulos/UVs, pivôs independentes e rodas em escala world`, async t => {
    const bytes = await readFile(new URL(`../referencias-locais/Vehicles/${asset.fileName}`, import.meta.url));
    const data = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const json = inspectVehicleGlb(data, asset);
    assert.match(String(json.asset?.extras?.license), /CC-BY-4\.0/);
    // Decode real geometry/materials but replace image decoding only. Node has
    // no browser image/GPU APIs; this is not a visual or texture-render test.
    const loader = new GLTFLoader();
    loader.register(() => ({ name: 'node-texture-fixture', loadTexture: () => Promise.resolve(new THREE.Texture()) }));
    const gltf = await loader.parseAsync(data, '');
    gltf.scene.updateMatrixWorld(true);
    const sourceMeshes: Mesh[] = [];
    gltf.scene.traverse(object => { if (object instanceof THREE.Mesh) sourceMeshes.push(object); });
    const sourceAttributes = sourceMeshes.map(mesh => Object.fromEntries(Object.entries(mesh.geometry.attributes)
       .map(([name, a]) => [name, Array.from(a instanceof THREE.InterleavedBufferAttribute ? a.data.array : a.array)])));
    const sourceMatrices = sourceMeshes.map(mesh => mesh.matrixWorld.clone());
    const template = new VehicleGlbTemplate(gltf, asset);
    try {
      const vehicle = template.create('real-fixture', paint);
      const other = template.create('independent', blue);
      t.after(() => { vehicle.userData.visualAdapter.destroy(); other.userData.visualAdapter.destroy(); });
      const bounds = new THREE.Box3().setFromObject(vehicle, true);
      const size = bounds.getSize(new THREE.Vector3());
      near(size.z, 3.25);
      near(bounds.min.y, 0);
      near(bounds.getCenter(new THREE.Vector3()).x, 0);
      near(bounds.getCenter(new THREE.Vector3()).z, 0);
      near(size.x, vehicle.userData.size.x);
      near(size.y, vehicle.userData.size.y);
       const dimensions = expected[asset.fileName as ExpectedAsset];
       assert.ok(Math.abs(size.x - dimensions.width) < 0.002);
       assert.ok(Math.abs(size.y - dimensions.height) < 0.002);
       const front = new THREE.Vector3(...dimensions.front)
        .applyAxisAngle(new THREE.Vector3(0, 1, 0), asset.yaw).normalize();
      assert.ok(front.z > 0.999 && Math.abs(front.x) < 0.002, 'Frente inspecionada deve apontar +Z');
      assert.equal(vehicle.userData.source, 'vehicle-glb');
      assert.equal(vehicle.userData.paintSupported, false);
      assert.deepEqual(vehicle.userData.ownedMaterials, []);
      assert.deepEqual(vehicle.userData.paintMaterials, []);
      assert.equal(template.metrics.triangles, asset.triangles);
      assert.equal(template.metrics.meshes, asset.meshes);
       const instanceMeshes: Mesh[] = [];
       vehicle.traverse(object => { if (object instanceof THREE.Mesh) instanceMeshes.push(object); });
      // Every original triangle appears once, with its original winding, UVs,
      // colors and other attributes; transformed position/normal/tangent only.
       const triangles: string[][] = sourceMeshes.map(() => []);
       const keys = (geometry: BufferGeometry): string[] => {
         const result: string[] = [];
        for (let i = 0; i < (geometry.index?.count ?? geometry.attributes.position.count); i += 3) {
          result.push([0, 1, 2].map(j => {
            const index = geometry.index ? geometry.index.getX(i + j) : i + j;
            return geometry.userData.sourceVertices?.[index] ?? index;
          }).join(','));
        }
        return result;
      };
      const p = new THREE.Vector3(), actual = new THREE.Vector3();
      const normalization = template.root.children[0].matrix.clone()
        .multiply(new THREE.Matrix4().makeRotationY(asset.yaw));
      for (const mesh of instanceMeshes) {
         const index = mesh.userData.sourceMeshIndex as number, source = sourceMeshes[index];
        assert.equal(mesh.material, source.material);
        triangles[index].push(...keys(mesh.geometry));
        for (const [name, attribute] of Object.entries(mesh.geometry.attributes)) {
          const original = source.geometry.attributes[name];
          assert.equal(attribute.itemSize, original.itemSize);
          assert.equal(attribute.normalized, original.normalized);
          for (let vertex = 0; vertex < attribute.count; vertex++) {
            const originalVertex = mesh.geometry.userData.sourceVertices?.[vertex] ?? vertex;
            if (name === 'position') {
              p.fromBufferAttribute(original, originalVertex).applyMatrix4(sourceMatrices[index]).applyMatrix4(normalization);
              actual.fromBufferAttribute(attribute, vertex).applyMatrix4(mesh.matrixWorld);
              assert.ok(actual.distanceTo(p) < 1e-5, 'Pose de repouso preserva transforms importados');
            } else if (!['normal', 'tangent'].includes(name)) {
              for (let component = 0; component < attribute.itemSize; component++) {
                assert.equal(attribute.getComponent(vertex, component), original.getComponent(originalVertex, component));
              }
            }
          }
        }
      }
      sourceMeshes.forEach((source, index) => assert.deepEqual(triangles[index].sort(), keys(source.geometry).sort()));
      const adapter = vehicle.userData.visualAdapter, otherAdapter = other.userData.visualAdapter;
      assert.equal(vehicle.userData.wheelsAnimated, true);
      assert.equal(vehicle.userData.wheelCount, 4);
       assert.equal(adapter.wheels.filter((wheel: Wheel) => wheel.front).length, 2);
       assert.ok(adapter.wheels.every((wheel: Wheel) => wheel.radius > 0.2 && wheel.radius < 0.4));
      assert.ok(Object.isFrozen(vehicle.userData.modelMetrics));
      assert.ok(Object.isFrozen(vehicle.userData.wheelSpecs));
      adapter.update({ longitudinalSpeed: 0, steer: 0 }, 0.1);
      for (const wheel of adapter.wheels) {
        assert.equal(wheel.spin.rotation.x, 0, 'Parado não gira');
        assert.notEqual(wheel.spin, otherAdapter.wheels[wheel.index].spin);
        if (asset.fileName === 'armored_car_death_race.glb' && wheel.front) {
          near(wheel.spin.parent.rotation.y, Math.PI / 9);
          assert.equal(wheel.spin.parent.parent, wheel.steer);
        } else assert.equal(wheel.spin.parent, wheel.steer);
        assert.equal(wheel.steer.parent, vehicle);
      }
      // Signed speed / real world radius, including the main's race scale 1.3.
      vehicle.scale.setScalar(1.3);
       const rootPose: [THREE.Vector3, THREE.Quaternion, THREE.Vector3] = [vehicle.position.clone(), vehicle.quaternion.clone(), vehicle.scale.clone()];
      adapter.update({ longitudinalSpeed: 2, steer: 0.6 }, 0.1);
      for (const wheel of adapter.wheels) {
        near(wheel.spin.rotation.x, 2 * 0.1 / (wheel.radius * 1.3));
        near(wheel.steer.rotation.y, wheel.front ? 0.6 * 0.42 : 0);
        near(otherAdapter.wheels[wheel.index].spin.rotation.x, 0);
      }
      assert.ok(vehicle.position.equals(rootPose[0]) && vehicle.quaternion.equals(rootPose[1]) && vehicle.scale.equals(rootPose[2]));
      adapter.update({ longitudinalSpeed: -2, steer: 0 }, 0.1);
       adapter.wheels.forEach((wheel: Wheel) => near(wheel.spin.rotation.x, 0));
       const emission: unknown[][] = [];
       adapter.update({ longitudinalSpeed: 2, lateralSpeed: 5 }, 0.1, { emit: (...args: unknown[]) => emission.push(args) });
      assert.equal(emission.length, 4);
       if (asset.fileName === 'thunder_bug.glb') {
         const calipers = instanceMeshes.filter(mesh => mesh.userData.wheelPart === 'caliper');
         assert.equal(calipers.length, 4);
         for (const part of calipers) {
           assert.ok(part.parent);
           assert.match(part.parent.name, /^vehicle-wheel-steer-/);
         }
         const fan = vehicle.getObjectByName('EngineFan_Engine_0_000_5');
         const otherFan = other.getObjectByName('EngineFan_Engine_0_000_5');
         assert.ok(fan && otherFan);
         assert.ok(!fan.quaternion.equals(otherFan.quaternion), 'Somente a instância atualiza Fan');
       }
       if (asset.fileName === 'race_car.glb') {
         const spare = instanceMeshes.find(mesh => mesh.userData.sourceMeshIndex === 6);
         assert.ok(spare);
         assert.equal(spare.userData.wheelPart, 'body', 'Estepe permanece fixo');
         assert.deepEqual(adapter.wheels.map((w: Wheel) => w.rotatingTriangles), [1904, 1066, 1904, 1066]);
      }
       if (asset.fileName === 'camaro.glb') assert.deepEqual(adapter.wheels.map((w: Wheel) => w.rotatingTriangles), [178, 178, 178, 178]);
      if (asset.fileName.startsWith('widowmaker')) {
        const body = instanceMeshes.filter(mesh => mesh.userData.wheelPart === 'body');
        assert.equal(body.length, 3);
         assert.ok(adapter.wheels.every((wheel: Wheel) => wheel.rotatingTriangles > 2500));
         assert.ok(body.every(mesh => mesh.geometry.index !== null));
         assert.ok(body.reduce((n, m) => n + m.geometry.index!.count / 3, 0) > 170000, 'Carroceria não é cortada por quadrantes');
      }
      sourceMeshes.forEach((mesh, index) => {
        assert.ok(mesh.matrixWorld.equals(sourceMatrices[index]));
        for (const [name, a] of Object.entries(mesh.geometry.attributes)) {
           assert.deepEqual(Array.from(a instanceof THREE.InterleavedBufferAttribute ? a.data.array : a.array), sourceAttributes[index][name]);
        }
      });
      const disposed = new Map([...template.derivedGeometries].map(geometry => [geometry, 0]));
       for (const geometry of disposed.keys()) geometry.addEventListener('dispose', () => disposed.set(geometry, (disposed.get(geometry) ?? 0) + 1));
      adapter.destroy(); adapter.destroy();
      assert.ok([...disposed.values()].every(count => count === 0), 'Adaptador não possui geometrias compartilhadas');
      template.destroy(); template.destroy();
      assert.ok([...disposed.values()].every(count => count === 1), 'Geometrias derivadas descartadas uma vez');
    } finally { template.destroy(); }
  });
}

test('Race Car 2 mantém ID e alias sem depender do original race_car2 ausente', async () => {
  await assert.rejects(readFile(new URL('../referencias-locais/Vehicles/race_car2.glb', import.meta.url)), { code: 'ENOENT' });
  assert.equal(getVehicleModelAsset('race_car2.glb'), getVehicleModelAsset('race_car.glb'));
  let calls = 0;
  const gltf = fixture();
   const cache = new VehicleModelCache({ loader: async asset => { calls++; return new VehicleGlbTemplate(gltf, asset); } });
  const [first, second] = await Promise.all([cache.load('race_car.glb'), cache.load('race_car2.glb')]);
  assert.equal(calls, 1);
  assert.ok(first && second);
  assert.equal(first, second);
  const a = first.create('alias-fixture', paint), b = second.create('race-car-2', blue);
  assert.equal(a.userData.vehicleId, 'alias-fixture');
  assert.equal(b.userData.vehicleId, 'race-car-2');
  assert.notEqual(a.userData.size, b.userData.size);
  a.position.x = 10;
  assert.equal(b.position.x, 0);
  cache.destroy();
});

test('pintura clona somente material explicitamente isolado; instâncias não alteram template ou pneus', () => {
  const gltf = fixture();
  const camaro = getVehicleModelAsset('camaro.glb');
  assert.ok(camaro);
  const template = new VehicleGlbTemplate(gltf, { ...camaro, paintMaterialNames: ['body'] });
  const a = template.create('a', paint), b = template.create('b', blue);
   const meshes = (root: Object3D): Mesh[] => { const result: Mesh[] = []; root.traverse(object => { if (object instanceof THREE.Mesh) result.push(object); }); return result; };
   const aMesh = meshes(a)[0], bMesh = meshes(b)[0];
   assert.ok(aMesh && bMesh);
   const am = aMesh.material as THREE.MeshStandardMaterial[], bm = bMesh.material as THREE.MeshStandardMaterial[];
   assert.ok(Array.isArray(am) && Array.isArray(bm));
  assert.notEqual(am[0], bm[0]);
  assert.equal(am[1], gltf.materials[1]);
  assert.equal(am[0].map, gltf.texture);
  assert.equal(gltf.materials[0].color.getHex(), 0xffffff);
  GarageResources.prototype.paintVehicle(a as Parameters<GarageResources['paintVehicle']>[0], blue);
  assert.equal(am[0].color.getHexString(), '1677ff');
  assert.equal(am[1].color.getHex(), 0xffffff);
  assert.equal(a.userData.paintId, blue.id);
  for (const material of [...a.userData.ownedMaterials, ...b.userData.ownedMaterials]) material.dispose();
  template.destroy();
});

test('destroy descarta recursos compartilhados uma vez e fecha imagem; clone não possui textura/geometria', () => {
  const gltf = fixture();
  let geometries = 0, textures = 0, materials = 0, images = 0;
  gltf.geometry.addEventListener('dispose', () => geometries++);
  gltf.texture.addEventListener('dispose', () => textures++);
  gltf.texture.source.data = { close() { images++; } };
  gltf.materials.forEach(material => material.addEventListener('dispose', () => materials++));
   const camaro = getVehicleModelAsset('camaro.glb');
   assert.ok(camaro);
   const template = new VehicleGlbTemplate(gltf, camaro);
  const vehicle = template.create('a', paint);
  assert.deepEqual(vehicle.userData.ownedMaterials, []);
  template.destroy(); template.destroy();
  assert.deepEqual({ geometries, textures, materials, images }, { geometries: 1, textures: 1, materials: 2, images: 1 });
  assert.throws(() => template.create('a', paint), /descartado/);
});

test('cache retém falha sem repetir fetch, carrega outros modelos e destrói resultado tardio', async () => {
  let calls = 0, failures = 0, destroyed = 0;
  let finish: ((template: VehicleGlbTemplate) => void) | undefined;
  const cache = new VehicleModelCache({
    loader: async asset => {
      calls++;
      if (asset.fileName === 'race_car.glb') throw new Error('HTTP 404');
      return new Promise(resolve => { finish = resolve; });
    },
    onFailure: () => failures++,
  });
  assert.equal(await cache.load('race_car.glb'), null);
  assert.equal(await cache.load('race_car2.glb'), null);
  assert.equal(failures, 1);
  assert.equal(await cache.load('../private.glb'), null);
  const pending = cache.load('camaro.glb');
  await Promise.resolve();
  cache.destroy();
  assert.ok(finish);
  const lateTemplate = Object.create(VehicleGlbTemplate.prototype) as VehicleGlbTemplate;
  lateTemplate.destroy = () => { destroyed++; };
  finish(lateTemplate);
  assert.equal(await pending, null);
  assert.equal(cache.get('camaro.glb'), null);
  assert.equal(await cache.load('camaro.glb'), null);
  assert.equal(destroyed, 1);
  assert.equal(calls, 2);
});

test('resources.load(ids) carrega só solicitados, compartilha promises e amplia cache; default continua todos', async () => {
  const resource = Object.create(GarageResources.prototype) as GarageResources, calls: string[] = [];
  Object.assign(resource, { disposed: false, source: 'procedural', modelFailures: [] });
   resource.vehicleModels = new VehicleModelCache({ loader: async asset => {
     calls.push(asset.fileName);
     return { asset, metrics: Object.freeze({ triangles: asset.triangles }), destroy() {} } as unknown as VehicleGlbTemplate;
  } });
  await Promise.all([resource.load(['rift-blaze', 'rift-blaze']), resource.load(['rift-blaze', 'unknown'])]);
  assert.deepEqual(calls, ['thunder_bug.glb']);
  await resource.load(['race-car-2']);
  assert.deepEqual(calls, ['thunder_bug.glb', 'race_car.glb']);
  const snapshot = resource.metrics;
  assert.ok(Object.isFrozen(snapshot) && Object.isFrozen(snapshot.models) && Object.isFrozen(snapshot.failures));
  await resource.load();
  assert.equal(calls.length, 5);
  assert.equal(snapshot.models.length, 2, 'Snapshot anterior é imutável');
  assert.equal(resource.metrics.models.length, 5);
  resource.vehicleModels.destroy();
});

test('fábrica usa GLB oficial e falha de criação retorna fallback seguro com aviso distinguível', async t => {
  const resource = Object.create(GarageResources.prototype) as GarageResources;
  Object.assign(resource, { models: new Map(), sharedGeometries: new Set(), sharedMaterials: new Set(), modelFailures: [] });
   resource.vehicleModels = new VehicleModelCache({ loader: async asset => new VehicleGlbTemplate(fixture(), asset) });
   await resource.vehicleModels.load('camaro.glb');
  const official = resource.createVehicle('volt-vector', paint);
  assert.equal(official.userData.source, 'vehicle-glb');
  assert.equal(official.userData.vehicleId, 'volt-vector');
   const template = resource.vehicleModels.get('camaro.glb');
   assert.ok(template);
   template.destroy();
   const warnings: unknown[][] = [];
   t.mock.method(console, 'warn', (...args: unknown[]) => warnings.push(args));
   const fallback = resource.createVehicle('volt-vector', paint);
   const secondFallback = resource.createVehicle('volt-vector', paint);
   const secondFallbackMaterials = secondFallback.userData.ownedMaterials;
   assert.ok(secondFallbackMaterials);
   secondFallbackMaterials.forEach(material => material.dispose());
  assert.equal(fallback.userData.source, 'procedural-fallback');
  assert.equal(resource.modelFailures.length, 1);
  assert.equal(resource.modelFailures[0].modelFile, 'camaro.glb');
  assert.equal(resource.modelFailures[0].fallback, 'procedural');
  assert.ok(Object.isFrozen(resource.metrics.failures));
  assert.ok(Object.isFrozen(resource.metrics.failures[0]));
   const warning = warnings[0]?.[0];
   if (typeof warning !== 'string') throw new TypeError('Aviso de fallback ausente');
   assert.match(warning, /vehicle-glb:fallback/);
  assert.equal(warnings.length, 1);
   const fallbackMaterials = fallback.userData.ownedMaterials;
   assert.ok(fallbackMaterials);
   fallbackMaterials.forEach(material => material.dispose());
  resource.vehicleModels.destroy();
  resource.sharedGeometries.forEach(geometry => geometry.dispose());
  resource.sharedMaterials.forEach(material => material.dispose());
});

function glb(json: Record<string, unknown>): ArrayBuffer {
  const text = JSON.stringify(json).padEnd(Math.ceil(JSON.stringify(json).length / 4) * 4, ' ');
  const data = new ArrayBuffer(20 + text.length), view = new DataView(data);
  [0x46546c67, 2, data.byteLength, text.length, 0x4e4f534a].forEach((value, i) => view.setUint32(i * 4, value, true));
  new Uint8Array(data, 20).set(new TextEncoder().encode(text));
  return data;
}

test('inspeção bloqueia arquivos corrompidos, URIs de buffers/imagens e rigs antes do parser', () => {
  assert.throws(() => inspectVehicleGlb(new ArrayBuffer(5)), /incompleto/);
  const invalid = glb({}); new DataView(invalid).setUint32(12, 0xffffffff, true);
  assert.throws(() => inspectVehicleGlb(invalid), /inválido/);
  for (const json of [
    { images: [{ uri: 'https://example.com/private.png' }] },
    { buffers: [{ uri: '../../private.bin' }] },
    { images: [{ uri: 'data:image/png;base64,AAAA' }] },
    { skins: [{}] }, { animations: [{}] }, { meshes: [{ primitives: [{ targets: [] }] }] },
    { nodes: [{ skin: 0 }] }, { extensionsUsed: ['KHR_draco_mesh_compression'] },
  ]) assert.throws(() => inspectVehicleGlb(glb(json)), /bloqueado|não aprovada/);
  assert.deepEqual(inspectVehicleGlb(glb({ buffers: [{ byteLength: 4 }], images: [{ bufferView: 0 }] })),
    { buffers: [{ byteLength: 4 }], images: [{ bufferView: 0 }] });
});

test('loader transforma falhas HTTP e de imagem em erro; descarta cena parcialmente carregada', async (t: TestContext) => {
  const asset = getVehicleModelAsset('camaro.glb');
  assert.ok(asset);
  const fetch = t.mock.method(globalThis, 'fetch', async (url: string | URL | Request) => {
    assert.equal(url, asset.url);
    return { ok: false, status: 404 };
  });
  await assert.rejects(loadVehicleGlb(asset), /HTTP 404/);
  fetch.mock.mockImplementation(async () => ({ ok: true, arrayBuffer: async () => glb({}) }) as Response);
  const gltf = fixture();
  let disposed = 0;
  gltf.geometry.addEventListener('dispose', () => disposed++);
  t.mock.method(GLTFLoader.prototype, 'parseAsync', async function (this: GLTFLoader) {
    this.manager.onError('blob:synthetic-image');
    return gltf;
  });
  await assert.rejects(loadVehicleGlb(asset), /decodificar texturas/);
  assert.equal(disposed, 1);
});
