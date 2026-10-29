import test from 'node:test';
import type { TestContext } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { VehicleDamageEffects, getDamageSmokeIntensity } from '../src/visuals/race/VehicleDamageEffects.ts';

type Pose = {
  x: number; y: number; z: number; heading: number; health: number; maxHealth: number;
  destroyed: boolean; destructionSequence: number; respawnSequence: number; respawnProtection: number;
  speed: number; longitudinalSpeed: number; lateralSpeed: number;
};
type Vehicle = THREE.Group & { userData: { size: THREE.Vector3 } };

function fixture(t: TestContext, options: { capacity?: number; participantCount?: number } = {}) {
  const scene = new THREE.Scene();
  const effects = new VehicleDamageEffects(scene, options);
  t.after(() => effects.destroy());
  const poses: Pose[] = Array.from({ length: effects.participantCount }, (_, id) => ({
    x: id * 20, y: 2, z: -10, heading: 0, health: 100, maxHealth: 100,
    destroyed: false, destructionSequence: 0, respawnSequence: 0, respawnProtection: 0,
    speed: 0, longitudinalSpeed: 0, lateralSpeed: 0,
  }));
  const vehicles: Vehicle[] = poses.map(() => {
    const root = new THREE.Group() as Vehicle;
    root.userData.size = new THREE.Vector3(2, 2, 4);
    return root;
  });
  return { scene, effects, poses, vehicles, update: (dt: number) => effects.update(poses, vehicles, dt) };
}

test('intensidade finita começa abaixo de 75%, cresce até crítico e aceita HP de capacidades diferentes', () => {
  for (const health of [100, 80, 75]) assert.equal(getDamageSmokeIntensity(health, 100), 0);
  assert.ok(getDamageSmokeIntensity(74.99, 100) > 0);
  assert.equal(getDamageSmokeIntensity(37.5, 100), 0.5);
  assert.equal(getDamageSmokeIntensity(75, 200), 0.5);
  assert.equal(getDamageSmokeIntensity(0, 100), 1);
  assert.equal(getDamageSmokeIntensity(-100, 100), 1);
  for (const invalid of [NaN, Infinity, -Infinity, undefined, '100'] as unknown[]) {
    assert.equal(getDamageSmokeIntensity(typeof invalid === 'number' ? invalid : NaN, 100), 0);
    assert.equal(getDamageSmokeIntensity(10, typeof invalid === 'number' ? invalid : NaN), 0);
  }
  for (const max of [0, -100]) assert.equal(getDamageSmokeIntensity(10, max), 0);
  assert.equal(getDamageSmokeIntensity(-Number.MAX_VALUE, Number.MIN_VALUE), 1);
  assert.equal(getDamageSmokeIntensity(Number.MAX_VALUE, Number.MIN_VALUE), 0);
});

test('pool pré-alocado usa um Points, buffers fixos e shader próprio sem texturas ou listeners', t => {
  const { effects, scene } = fixture(t);
  assert.equal(effects.capacity, 512);
  assert.equal(effects.activeCount, 0);
  assert.equal(effects.emittedCount, 0);
  assert.equal(effects.explosionCount, 0);
  assert.deepEqual(scene.children, [effects.points]);
  assert.equal(effects.points.isPoints, true);
  assert.equal(effects.points.frustumCulled, false);
  assert.equal(effects.material.isShaderMaterial, true);
  assert.equal(effects.material.transparent, true);
  assert.equal(effects.material.depthWrite, false);
  assert.equal(effects.material.depthTest, true);
  assert.equal(Object.values(effects.material.uniforms).some(uniform => uniform.value?.isTexture), false);
  for (const name of ['position', 'color', 'size', 'alpha']) {
    const attr = effects.geometry.getAttribute(name);
    assert.equal(attr.count, effects.capacity);
    assert.ok(attr.array instanceof Float32Array);
     assert.equal((attr as THREE.BufferAttribute).usage, THREE.DynamicDrawUsage);
  }
  assert.ok(effects.geometry.attributes.alpha.array.every(value => value === 0));
});

test('quatro carros saudáveis não emitem; todos os danificados emitem parados sem adaptadores', t => {
  const { effects, poses, vehicles, update } = fixture(t);
  for (let frame = 0; frame < 60; frame += 1) update(1 / 60);
  assert.equal(effects.emittedCount, 0);
  for (const pose of poses) pose.health = 37.5;
  const before = structuredClone(poses);
  for (const root of vehicles) root.scale.setScalar(7);
  for (let frame = 0; frame < 60; frame += 1) update(1 / 60);
  assert.equal(effects.emittedCount, 48);
  for (let id = 0; id < 4; id += 1) {
    assert.ok(effects.geometry.attributes.position.array.some((x, index) => index % 3 === 0
      && effects.geometry.attributes.alpha.array[index / 3] > 0 && Math.abs(x - id * 20) < 1));
    assert.equal(vehicles[id].visible, true);
    assert.equal(vehicles[id].userData.visualAdapter, undefined);
  }
  assert.deepEqual(poses, before, 'telemetria somente leitura');
});

test('capô usa +Z local, heading e dimensões world sem multiplicar escala; deriva e expande no mundo', t => {
  t.mock.method(Math, 'random', () => 0.75);
  const { effects, poses, vehicles, update } = fixture(t);
  Object.assign(poses[0], { x: 10, y: 3, z: -6, heading: Math.PI / 2, health: 0 });
  vehicles[0].scale.setScalar(10);
  update(1 / 24);
  const { position, size, alpha, color } = effects.geometry.attributes;
  assert.equal(effects.emittedCount, 1);
  assert.ok(Math.abs(position.array[0] - 11) < 0.00001);
  assert.ok(Math.abs(position.array[1] - 4.8) < 0.00001);
  assert.ok(Math.abs(position.array[2] + 6) < 0.00001);
  assert.ok(color.array[0] < 0.15 && color.array[0] === color.array[1]);
  const initialSize = size.array[0];
  const initialAlpha = alpha.array[0];
  Object.assign(poses[0], { x: 500, health: 100, speed: 50 });
  update(0.3);
  assert.ok(position.array[0] > 11 && position.array[0] < 11.2);
  assert.ok(position.array[1] > 4.8 && position.array[1] < 5.1);
  assert.ok(size.array[0] > initialSize);
  assert.ok(alpha.array[0] > 0 && alpha.array[0] < initialAlpha);
  update(1.5);
  assert.equal(effects.activeCount, 0);
});

test('dano maior aumenta emissão, tamanho e opacidade e escurece fumaça, sem depender da velocidade', t => {
  t.mock.method(Math, 'random', () => 0.5);
  const mild = fixture(t, { participantCount: 1 });
  const critical = fixture(t, { participantCount: 1 });
  mild.poses[0].health = 60;
  critical.poses[0].health = 0;
  critical.poses[0].speed = 40;
  mild.update(1);
  critical.update(1);
  assert.equal(mild.effects.emittedCount, 4);
  assert.equal(critical.effects.emittedCount, 24);
  const a = mild.effects.geometry.attributes;
  const b = critical.effects.geometry.attributes;
  assert.ok(b.size.array[0] > a.size.array[0]);
  assert.ok(b.alpha.array[0] > a.alpha.array[0]);
  assert.ok(b.color.array[0] < a.color.array[0]);
});

test('orçamento fracionário é separado por carro e não acumula emissão durante saúde plena', t => {
  const { effects, poses, update } = fixture(t);
  for (const pose of poses) pose.health = 0;
  update(1 / 48);
  assert.equal(effects.emittedCount, 0);
  poses[1].health = 100;
  update(1 / 48);
  assert.equal(effects.emittedCount, 3);
  poses[1].health = 0;
  update(1 / 48);
  assert.equal(effects.emittedCount, 3);
  update(1 / 48);
  assert.equal(effects.emittedCount, 7);
});

test('uma explosão por incremento observado, anima até 0.8 s e nunca repete o mesmo sequence', t => {
  t.mock.method(Math, 'random', () => 0.75);
  const { effects, poses, vehicles, update } = fixture(t);
  Object.assign(poses[0], { health: 0, destroyed: true, destructionSequence: 1 });
  update(0);
  assert.equal(effects.explosionCount, 1);
  assert.equal(effects.emittedCount, 40);
  const { size, alpha, color, position } = effects.geometry.attributes;
  const flashSize = size.array[0];
  const sparkY = position.array[4];
  assert.ok(color.array[0] > 0.9 && color.array[1] > 0.8);
  assert.ok(color.array[13 * 3 + 1] > color.array[13 * 3 + 2]);
  update(0.07);
  assert.ok(size.array[0] > flashSize, 'pop/flash expande');
  assert.ok(alpha.array[0] > 0 && alpha.array[0] < 0.6);
  assert.ok(position.array[4] > sparkY, 'faísca se desloca');
  update(0.08);
  assert.equal(alpha.array[0], 0, 'flash é breve');
  update(0.65);
  assert.equal(effects.activeCount, 0);
  for (let i = 0; i < 30; i += 1) update(1 / 60);
  assert.equal(effects.explosionCount, 1);
  assert.equal(effects.emittedCount, 40);
  poses[0].destructionSequence = 2;
  update(0);
  assert.equal(effects.explosionCount, 2, 'novo evento mesmo após ficar destruído por mais de 0.8 s');
  assert.equal(effects.emittedCount, 80);
  assert.equal(vehicles[0].visible, true, 'ocultação pertence ao chamador');
});

test('salto grande de sequence produz só uma rajada e quatro destruições independentes funcionam', t => {
  const { effects, poses, update } = fixture(t);
  for (const pose of poses) Object.assign(pose, { destroyed: true, destructionSequence: Number.MAX_SAFE_INTEGER });
  update(0);
  assert.equal(effects.explosionCount, 4);
  assert.equal(effects.emittedCount, 160);
  update(0);
  assert.equal(effects.explosionCount, 4);
  assert.equal(effects.emittedCount, 160);
});

test('respawn com eventos perdidos não explode fantasma nem repete sequence consumido', t => {
  const { effects, poses, vehicles, update } = fixture(t);
  Object.assign(poses[0], { destructionSequence: 3, respawnSequence: 3, respawnProtection: 1.5 });
  update(0.1);
  assert.equal(effects.explosionCount, 0);
  assert.equal(effects.emittedCount, 0);
  poses[0].destroyed = true;
  update(0.1);
  assert.equal(effects.explosionCount, 0);
  poses[0].destructionSequence = 4;
  update(0);
  assert.equal(effects.explosionCount, 1);
  Object.assign(poses[0], { destroyed: false, health: 100, respawnSequence: 4 });
  vehicles[0].visible = false;
  update(0.81);
  assert.equal(effects.activeCount, 0);
  assert.equal(effects.emittedCount, 40);
  assert.equal(vehicles[0].visible, false, 'proteção/pisca também pertence ao chamador');
});

test('respawn limpa fumaça e orçamento do próprio carro preservando a fumaça dos demais', t => {
  const { effects, poses, update } = fixture(t);
  poses[0].health = 0;
  poses[1].health = 0;
  update(1 / 16);
  assert.equal(effects.activeCount, 2);
  Object.assign(poses[0], { health: 100, respawnSequence: 1, destructionSequence: 1 });
  update(0);
  assert.equal(effects.activeCount, 1);
  assert.equal(effects.explosionCount, 0);
  assert.equal(effects.geometry.attributes.alpha.array[0], 0);
  assert.ok(effects.geometry.attributes.alpha.array[1] > 0);
  poses[0].health = 0;
  update(1 / 48);
  assert.equal(effects.emittedCount, 3, 'só o outro carro completa seu orçamento');
});

test('capacidade trunca fumaça/rajada sem sobrescrever vivos ou adiar explosão', t => {
  const { effects, poses, update } = fixture(t, { capacity: 3 });
  poses[0].health = 0;
  update(1);
  assert.equal(effects.activeCount, 3);
  const positions = effects.geometry.attributes.position.array.slice();
  Object.assign(poses[1], { x: 900, destroyed: true, destructionSequence: 1 });
  update(0);
  assert.equal(effects.explosionCount, 1);
  assert.equal(effects.emittedCount, 3);
  assert.deepEqual(effects.geometry.attributes.position.array, positions);
  poses[0].health = 100;
  update(2);
  assert.equal(effects.activeCount, 0);
  assert.ok(effects.geometry.attributes.alpha.array.every(value => value === 0));
  update(0);
  assert.equal(effects.emittedCount, 3, 'rajada descartada não retorna quando abre espaço');
  poses[1].destructionSequence = 2;
  update(0);
  assert.equal(effects.activeCount, 3);
  assert.equal(effects.emittedCount, 6);
});

test('emissão é aproximadamente independente de 30/60/120 FPS e buffers sobrevivem à reutilização', t => {
  t.mock.method(Math, 'random', () => 0.75);
  const counts = [];
  for (const hz of [30, 60, 120]) {
    const { effects, poses, update } = fixture(t);
    const buffers = Object.values(effects.geometry.attributes).map(attr => attr.array);
    for (const pose of poses) pose.health = 37.5;
    for (let frame = 0; frame < hz * 3; frame += 1) {
      update(1 / hz);
      assert.ok(effects.activeCount <= effects.capacity);
    }
    assert.equal(effects.emittedCount, 144);
    counts.push(effects.activeCount);
    for (const pose of poses) pose.health = 100;
    update(2);
    assert.equal(effects.activeCount, 0);
    for (const pose of poses) pose.health = 37.5;
    update(1);
    assert.equal(effects.emittedCount, 192);
    Object.values(effects.geometry.attributes).forEach((attr, index) => {
      assert.equal(attr.array, buffers[index]);
      assert.ok(attr.array.every(Number.isFinite));
      assert.equal(attr.count, effects.capacity);
    });
  }
  assert.ok(Math.max(...counts) - Math.min(...counts) <= 4, `vivos por FPS: ${counts}`);
});

test('delta enorme continua limitado à capacidade e entradas inválidas não contaminam buffers', t => {
  const { effects, poses, vehicles, update } = fixture(t, { capacity: 5 });
  poses[0].health = 0;
  for (const dt of [-1, NaN, Infinity]) update(dt);
  assert.equal(effects.emittedCount, 0);
  poses[0].x = NaN;
  update(1);
  assert.equal(effects.emittedCount, 0);
  poses[0].x = 0;
  update(Number.MAX_VALUE);
  assert.equal(effects.activeCount, 5);
  assert.equal(effects.emittedCount, 5);
  poses[0].health = 100;
  update(Number.MAX_VALUE);
  assert.equal(effects.activeCount, 0);
  effects.update([], [], 1);
  Object.assign(poses[0], { destroyed: true, destructionSequence: 1 });
  effects.update(poses, [], 0);
  effects.update(poses, vehicles, 0);
  assert.equal(effects.explosionCount, 0, 'root ausente não causa explosão atrasada');
  for (const attr of Object.values(effects.geometry.attributes)) assert.ok(attr.array.every(Number.isFinite));
  for (const invalid of [0, -1, 1.5, NaN, Infinity]) {
    assert.throws(() => new VehicleDamageEffects(new THREE.Scene(), { capacity: invalid }), RangeError);
    assert.throws(() => new VehicleDamageEffects(new THREE.Scene(), { participantCount: invalid }), RangeError);
  }
});

test('hook de viewport reutiliza vetor, respeita pixels físicos e projeções ortográfica/perspectiva', t => {
  const { effects } = fixture(t);
  let target: THREE.Vector4 | undefined;
  let height = 1080;
  const renderer = {
    getCurrentViewport(viewport: THREE.Vector4) {
      if (target) assert.equal(viewport, target);
      target = viewport;
      return viewport.set(0, 0, 1920, height);
    },
  };
  for (const camera of [new THREE.PerspectiveCamera(60, 16 / 9), new THREE.OrthographicCamera(-10, 10, 5, -5)]) {
    (effects.points.onBeforeRender as unknown as (renderer: unknown, scene: unknown, camera: THREE.Camera) => void)(renderer, null, camera);
    assert.equal(effects.material.uniforms.viewportHeight.value, height);
    const clip = new THREE.Vector4(0, 0, -10, 1).applyMatrix4(camera.projectionMatrix);
    const pixels = 0.5 * height * Math.abs(camera.projectionMatrix.elements[5]) / (2 * clip.w);
    assert.ok(Number.isFinite(pixels) && pixels > 0);
    height = 540;
  }
  assert.equal(effects.material.uniforms.maxPointSize.value, 64);
});

test('destroy idempotente remove Points, libera GPU uma vez e torna update inerte', () => {
  const scene = new THREE.Scene();
  const effects = new VehicleDamageEffects(scene);
  const pose = { x: 0, y: 0, z: 0, heading: 0, health: 0, maxHealth: 100 };
  const root = new THREE.Group();
  let geometries = 0;
  let materials = 0;
  effects.geometry.addEventListener('dispose', () => { geometries += 1; });
  effects.material.addEventListener('dispose', () => { materials += 1; });
  effects.update([pose], [root], 1);
  const emitted = effects.emittedCount;
  effects.destroy();
  effects.destroy();
  effects.update([pose], [root], 1);
  assert.equal(effects.activeCount, 0);
  assert.equal(effects.emittedCount, emitted);
  assert.equal(effects.points.parent, null);
  assert.equal(effects.points.onBeforeRender, null);
  assert.equal(scene.children.length, 0);
  assert.ok(effects.geometry.attributes.alpha.array.every(value => value === 0));
  assert.equal(geometries, 1);
  assert.equal(materials, 1);
});
