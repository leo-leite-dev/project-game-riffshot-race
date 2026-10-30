import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { RivalCannonEffects } from '../src/visuals/race/RivalCannonEffects.ts';
import type { CannonEvent, CannonProjectile } from '../src/race/RivalCannon.ts';

function setup(t: import('node:test').TestContext) {
  const scene = new THREE.Scene();
  const effects = new RivalCannonEffects(scene);
  t.after(() => effects.destroy());
  return { effects, scene };
}
function event(id = 1, overrides: Partial<CannonEvent> = {}): Readonly<CannonEvent> {
  return Object.freeze({ id, projectileId: 1, kind: 'shot', x: 10, y: 2, z: -6,
    dirX: 0, dirZ: 1, ownerId: 'rival', time: 1, ...overrides });
}
function shell(slot = 0, overrides: Partial<CannonProjectile> = {}): Readonly<CannonProjectile> {
  return Object.freeze({ slot, id: 1, active: true, ownerId: 'rival',
    x: 10, y: 3, z: 8, previousX: 2, previousY: 1, previousZ: 4,
    dirX: 1, dirZ: 0, speed: 72, age: 0.1, distance: 7.2, spawnedAt: 1, ...overrides });
}
function object(effects: RivalCannonEffects, name: string): THREE.Object3D {
  const result = effects.root.getObjectByName(name);
  assert.ok(result, name);
  return result;
}
function sparks(effects: RivalCannonEffects): THREE.InstancedMesh {
  return object(effects, 'cannon-sparks') as THREE.InstancedMesh;
}
const near = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-6,
  `${actual} deveria ser ${expected}`);

test('Forja: pools fixos, materiais aditivos compartilhados, sem luz/textura/sombra', t => {
  const { effects, scene } = setup(t);
  assert.equal(effects.root.parent, scene);
  assert.equal(effects.projectileCapacity, 12);
  assert.equal(effects.flashCapacity, 12);
  assert.equal(effects.sparkCapacity, 96);
  assert.equal(effects.activeCount, 0);
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  effects.root.traverse(child => {
    assert.equal((child as THREE.Light).isLight, undefined);
    assert.equal(child.castShadow, false);
    assert.equal(child.receiveShadow, false);
    if (!(child instanceof THREE.Mesh)) return;
    geometries.add(child.geometry);
    assert.ok(child.material instanceof THREE.MeshBasicMaterial);
    const material = child.material;
    materials.add(material);
    assert.equal(material.blending, THREE.AdditiveBlending);
    assert.equal(material.depthWrite, false);
    assert.equal(material.depthTest, true);
    assert.equal(material.toneMapped, false);
    assert.equal(material.map, null);
  });
  assert.equal(geometries.size, 1);
  assert.equal(materials.size, 5);
  const instances = sparks(effects);
  assert.equal(instances.count, 96);
  assert.equal(instances.instanceMatrix.usage, THREE.DynamicDrawUsage);
  assert.ok(instances.instanceMatrix.array.every(Number.isFinite));
});

test('projéteis: primeiro/último slot interpolam endpoints finitos, clamp e direção fixa', t => {
  const { effects, scene } = setup(t);
  const projectiles = Object.freeze([shell(0), shell(11, { dirX: 0, dirZ: -2 })]);
  for (const alpha of [-1, 0, 0.5, 1, 2]) {
    effects.update(projectiles, [], 1, alpha, 0);
    assert.equal(effects.projectileCount, 2);
    scene.updateMatrixWorld(true);
    const clamped = Math.max(0, Math.min(1, alpha));
    for (const slot of [0, 11]) {
      const visual = object(effects, `cannon-projectile-${slot}`);
      assert.deepEqual(visual.position.toArray(), [2 + 8 * clamped, 1 + 2 * clamped, 4 + 4 * clamped]);
      assert.ok(visual.matrixWorld.elements.every(Number.isFinite));
      const direction = new THREE.Vector3(0, 0, 1).applyQuaternion(visual.quaternion);
      near(direction.x, slot === 0 ? 1 : 0);
      near(direction.z, slot === 0 ? 0 : -1);
      const tail = visual.getObjectByName('trail')!;
      assert.ok(tail.position.z < 0 && tail.scale.z < 1, 'rastro curto atrás do tiro');
    }
  }
  effects.update([shell(11, { id: 50, x: -10 })], [], 1, 1, 0);
  assert.equal(object(effects, 'cannon-projectile-0').visible, false);
  assert.equal(object(effects, 'cannon-projectile-11').position.x, -10);
  effects.update([], [], 1, 1, 0);
  assert.equal(effects.projectileCount, 0);
});

test('eventos: shot/hit uma vez entre frames; expire não inventa impacto', t => {
  const { effects } = setup(t);
  const events = Object.freeze([event(), event(2, { kind: 'hit' }), event(3, { kind: 'expire' })]);
  effects.update([], events, 1, 0, 0);
  assert.equal(effects.shotCount, 1);
  assert.equal(effects.impactCount, 1);
  assert.equal(effects.flashCount, 2);
  assert.equal(effects.sparkCount, 26);
  const firstMatrices = sparks(effects).instanceMatrix.array.slice();
  effects.update([], events, 1, 0, 0);
  assert.equal(effects.shotCount, 1);
  assert.equal(effects.impactCount, 1);
  assert.deepEqual(sparks(effects).instanceMatrix.array, firstMatrices);
  effects.update([], events, 3, 0, 2);
  assert.equal(effects.activeCount, 0);
  effects.update([], events, 1, 0, 0);
  assert.equal(effects.activeCount, 0, 'IDs antigos não ressuscitam após expirar ou voltar relógio');
});

test('flash branco-dourado com chama curta e impacto sem chama de boca', t => {
  const { effects } = setup(t);
  effects.update([], [event(), event(2, { kind: 'hit' })], 1, 0, 0);
  const muzzle = object(effects, 'cannon-flash-0');
  assert.deepEqual(muzzle.position.toArray(), [10, 2, -6]);
  assert.equal(muzzle.getObjectByName('flame')!.visible, true);
  assert.ok(muzzle.getObjectByName('flame')!.scale.z < 0.7);
  const core = muzzle.getObjectByName('core') as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  const glow = muzzle.getObjectByName('glow') as typeof core;
  assert.ok(core.material.color.b > glow.material.color.b);
  assert.equal(object(effects, 'cannon-flash-1').getObjectByName('flame')!.visible, false);
  const matrix = new THREE.Matrix4();
  sparks(effects).getMatrixAt(4, matrix);
  assert.deepEqual(new THREE.Vector3().setFromMatrixPosition(matrix).toArray(), [10, 2, -6]);
  effects.update([], [], 1.08, 0, 0.08);
  assert.ok(core.scale.x < 0.27);
  assert.ok(sparks(effects).instanceMatrix.array.every(Number.isFinite));
  effects.update([], [], 1.17, 0, 0.09);
  assert.equal(effects.flashCount, 0);
  assert.ok(effects.sparkCount > 0);
  effects.update([], [], 1.51, 0, 0.34);
  assert.equal(effects.activeCount, 0);
});

test('eventos atrasados envelhecem na chegada; shots >0.3 e hits >0.5 são consumidos', t => {
  const { effects } = setup(t);
  effects.update([], [event(1, { time: 0.69 }), event(2, { kind: 'hit', time: 0.49 })], 1, 0, 0);
  assert.equal(effects.activeCount, 0);
  assert.equal(effects.shotCount, 0);
  assert.equal(effects.impactCount, 0);
  effects.update([], [event(1), event(2, { kind: 'hit' })], 1, 0, 0);
  assert.equal(effects.activeCount, 0, 'nem uma cópia rejuvenescida do ID é aceita');
  effects.update([], [event(3, { time: 0.79 }), event(4, { kind: 'hit', time: 0.79 })], 1, 0, 0.21);
  assert.equal(effects.shotCount, 1);
  assert.equal(effects.impactCount, 1);
  assert.equal(effects.flashCount, 0, 'flash já terminou; dt não é aplicado duas vezes aos novos');
  assert.ok(effects.sparkCount > 22 && effects.sparkCount < 26);
  effects.update([], [], 2, 0, 0);
  assert.equal(effects.activeCount, 0, 'elapsed também expira efeitos com dt zero');
});

test('pools saturados preservam vivos, descartam excesso e reutilizam mesmos recursos/buffers', t => {
  const { effects } = setup(t);
  const nodes: THREE.Object3D[] = [];
  effects.root.traverse(child => nodes.push(child));
  const matrices = sparks(effects).instanceMatrix.array;
  const colors = sparks(effects).instanceColor!.array;
  const allShells = Object.freeze(Array.from({ length: 20 }, (_, i) => shell(i)));
  effects.update(allShells, Array.from({ length: 30 }, (_, i) => event(i + 1, { kind: 'hit' })), 1, 1, 0);
  assert.equal(effects.projectileCount, 12);
  assert.equal(effects.flashCount, 12);
  assert.equal(effects.sparkCount, 96);
  assert.equal(effects.activeCount, 120);
  assert.equal(effects.impactCount, 30);
  const fullMatrices = matrices.slice();
  effects.update(allShells, [event(31, { kind: 'hit', x: 900 })], 1, 1, 0);
  assert.deepEqual(matrices, fullMatrices, 'excesso não sobrescreve partículas vivas');
  assert.equal(effects.impactCount, 31);
  effects.update([], [], 2, 1, 1);
  assert.equal(effects.activeCount, 0);
  effects.update([], [], 2, 1, 0);
  assert.equal(effects.activeCount, 0, 'sem fila de emissão atrasada');
  for (let cycle = 0; cycle < 20; cycle += 1) {
    const time = 3 + cycle;
    effects.update([], [event(32 + cycle, { time, kind: 'hit' })], time, 1, 0);
    assert.equal(effects.sparkCount, 22);
    effects.update([], [], time + 0.6, 1, 0.6);
    assert.equal(effects.activeCount, 0);
  }
  assert.equal(sparks(effects).instanceMatrix.array, matrices);
  assert.equal(sparks(effects).instanceColor!.array, colors);
  assert.ok(matrices.every(Number.isFinite));
  const after: THREE.Object3D[] = [];
  effects.root.traverse(child => after.push(child));
  assert.deepEqual(after, nodes);
});

test('origem visual é snapshot mundial, mesmo sob Scene transformada; direção e shell físicos intactos', t => {
  const { effects, scene } = setup(t);
  scene.position.set(100, 20, -30);
  scene.rotation.y = 0.8;
  scene.scale.setScalar(2);
  let calls = 0;
  const origin = new THREE.Vector3(-7, 5, 11);
  const shot = event(1, { dirX: 2, dirZ: 0 });
  const projectile = shell();
  const resolve = (received: CannonEvent, target: THREE.Vector3) => {
    assert.equal(received, shot);
    calls += 1;
    target.copy(origin);
  };
  effects.update([projectile], [shot], 1, 1, 0, resolve);
  scene.updateMatrixWorld(true);
  const muzzle = object(effects, 'cannon-flash-0');
  assert.deepEqual(muzzle.getWorldPosition(new THREE.Vector3()).toArray(), [-7, 5, 11]);
  near(muzzle.rotation.y, Math.PI / 2);
  assert.deepEqual(object(effects, 'cannon-projectile-0').getWorldPosition(new THREE.Vector3()).toArray(), [10, 3, 8]);
  origin.set(500, 500, 500);
  effects.update([projectile], [shot, event(2, { kind: 'hit' })], 1.01, 1, 0.01, resolve);
  assert.equal(calls, 1, 'resolver somente para novos shots, não para hits');
  assert.deepEqual(muzzle.position.toArray(), [-7, 5, 11]);
  assert.deepEqual(object(effects, 'cannon-flash-1').position.toArray(), [10, 2, -6]);
});

test('dt: trajetórias analíticas independem de 30/60/120 FPS, inclusive com elapsed pausado', t => {
  const snapshots: number[][] = [];
  for (const hz of [30, 60, 120]) {
    const { effects } = setup(t);
    effects.update([], [event(1, { kind: 'hit' })], 1, 0, 0);
    for (let frame = 0; frame < hz / 5; frame += 1) effects.update([], [], 1, 0, 1 / hz);
    assert.equal(effects.sparkCount, 22);
    snapshots.push(Array.from(sparks(effects).instanceMatrix.array));
  }
  for (let i = 0; i < snapshots[0].length; i += 1) {
    near(snapshots[0][i], snapshots[1][i]);
    near(snapshots[1][i], snapshots[2][i]);
  }
});

test('entradas inválidas não envenenam primeiro/último slot; resolver inválido volta ao evento', t => {
  const { effects } = setup(t);
  for (const [elapsed, alpha, dt] of [[NaN, 0, 0], [Infinity, 0, 0], [-1, 0, 0],
    [1, NaN, 0], [1, Infinity, 0], [1, 0, NaN], [1, 0, Infinity], [1, 0, -1]]) {
    effects.update([shell()], [event()], elapsed, alpha, dt);
    assert.equal(effects.activeCount, 0);
  }
  effects.update([shell(0, { x: NaN }), shell(11, { previousZ: Infinity }),
    shell(-1), shell(12), shell(1, { dirX: 0, dirZ: 0 })], [
    event(1, { x: NaN }), event(2, { dirZ: Infinity }),
    event(3, { time: Infinity }), event(4, { time: 2 }),
  ], 1, 0, 0);
  assert.equal(effects.activeCount, 0);
  assert.equal(effects.shotCount, 0);
  effects.update([], [event(5)], 1, 0, 0, (_event, target) => { target.set(NaN, Infinity, 0); });
  assert.equal(effects.shotCount, 1);
  assert.deepEqual(object(effects, 'cannon-flash-0').position.toArray(), [10, 2, -6]);
  assert.ok(sparks(effects).instanceMatrix.array.every(Number.isFinite));
  effects.update([], [], 1, 0, Number.MAX_VALUE);
  assert.equal(effects.activeCount, 0);
  assert.ok(sparks(effects).instanceMatrix.array.every(Number.isFinite));
});

test('destroy idempotente libera exclusivamente recursos próprios; update posterior inerte', t => {
  const { effects, scene } = setup(t);
  const foreignGeometry = new THREE.BoxGeometry();
  const foreignMaterial = new THREE.MeshBasicMaterial();
  const foreign = new THREE.Mesh(foreignGeometry, foreignMaterial);
  scene.add(foreign);
  t.after(() => { foreignGeometry.dispose(); foreignMaterial.dispose(); });
  let foreignDisposals = 0;
  foreignGeometry.addEventListener('dispose', () => { foreignDisposals += 1; });
  foreignMaterial.addEventListener('dispose', () => { foreignDisposals += 1; });
  const resources = new Set<THREE.BufferGeometry | THREE.Material | THREE.InstancedMesh>();
  effects.root.traverse(child => {
    if (child instanceof THREE.Mesh) {
      resources.add(child.geometry);
      assert.ok(child.material instanceof THREE.Material);
      resources.add(child.material);
    }
    if (child instanceof THREE.InstancedMesh) resources.add(child);
  });
  const disposals = new Map<object, number>();
  for (const resource of resources) {
    disposals.set(resource, 0);
    const onDispose = () => { disposals.set(resource, disposals.get(resource)! + 1); };
    if (resource instanceof THREE.InstancedMesh) resource.addEventListener('dispose', onDispose);
    else if (resource instanceof THREE.Material) resource.addEventListener('dispose', onDispose);
    else resource.addEventListener('dispose', onDispose);
  }
  effects.update([shell(0), shell(11)], [event(), event(2, { kind: 'hit' })], 1, 1, 0);
  assert.ok(effects.activeCount > 0);
  effects.destroy();
  effects.destroy();
  effects.update([shell()], [event(3)], 1, 0, 0, () => assert.fail('resolver após destroy'));
  assert.equal(effects.root.parent, null);
  assert.equal(effects.root.visible, false);
  assert.equal(effects.activeCount, 0);
  assert.equal(effects.shotCount, 1);
  assert.equal(effects.impactCount, 1);
  assert.deepEqual(scene.children, [foreign]);
  assert.equal(foreignDisposals, 0);
  assert.ok([...disposals.values()].every(count => count === 1));
  assert.ok(sparks(effects).instanceMatrix.array.every(Number.isFinite));
});
