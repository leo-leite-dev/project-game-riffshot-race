import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { TireSmoke, slipSmokeIntensity } from '../src/visuals/vehicles/TireSmoke.ts';

const position = Object.freeze(new THREE.Vector3(10, 2, -6));
const makeSmoke = (t: import('node:test').TestContext, options: ConstructorParameters<typeof TireSmoke>[1] = {}) => {
  const smoke = new TireSmoke(new THREE.Scene(), options);
  t.after(() => smoke.destroy());
  return smoke;
};

test('cria Points com buffers tipados fixos e mortos invisíveis, sem WebGL ou textura', t => {
  const scene = new THREE.Scene();
  const smoke = new TireSmoke(scene);
  t.after(() => smoke.destroy());
  assert.equal(smoke.capacity, 128);
  assert.equal(smoke.activeCount, 0);
  assert.equal(smoke.emittedCount, 0);
  assert.equal(smoke.points.isPoints, true);
  assert.equal(smoke.points.parent, scene);
  assert.equal(smoke.points.frustumCulled, false);
  for (const name of ['position', 'color', 'size', 'alpha']) {
    const attribute = smoke.geometry.getAttribute(name) as THREE.BufferAttribute;
    assert.equal(attribute.count, 128);
    assert.ok(attribute.array instanceof Float32Array);
    assert.equal(attribute.usage, THREE.DynamicDrawUsage);
  }
  assert.ok(smoke.geometry.attributes.alpha.array.every(value => value === 0));
  assert.equal(smoke.material.isShaderMaterial, true);
  assert.equal(smoke.material.transparent, true);
  assert.equal(smoke.material.depthWrite, false);
  assert.equal(smoke.material.depthTest, true);
  assert.equal(Object.values(smoke.material.uniforms).some(uniform => uniform.value?.isTexture), false);
});

test('intensidade zero/negativa não emite nem acumula uma emissão futura', t => {
  const smoke = makeSmoke(t);
  for (let frame = 0; frame < 120; frame += 1) {
    smoke.update(1 / 60);
    smoke.emit(position, frame % 2 ? 0 : -1, 1 / 60);
  }
  assert.equal(smoke.activeCount, 0);
  assert.equal(smoke.emittedCount, 0);
  smoke.emit(position, 1, 0.02);
  smoke.emit(position, 0, 1);
  smoke.emit(position, 1, 0.02);
  assert.equal(smoke.emittedCount, 0);
});

test('quatro emissores mantêm orçamentos independentes e aceitam o id padrão 0', t => {
  const smoke = makeSmoke(t);
  for (let id = 0; id < 4; id += 1) smoke.emit(position, 1, 1 / 64, id);
  assert.equal(smoke.emittedCount, 0, 'meias partículas não podem ser somadas entre pneus');
  smoke.emit(position, 1, 1 / 64);
  assert.equal(smoke.emittedCount, 1);
  for (let id = 1; id < 4; id += 1) smoke.emit(position, 1, 1 / 64, id);
  assert.equal(smoke.emittedCount, 4);
});

test('pool respeita capacidade, preserva vivos e descarta excesso sem rajada atrasada', t => {
  const smoke = makeSmoke(t, { capacity: 3 });
  smoke.emit(position, 1, 1);
  const originalPositions = smoke.geometry.attributes.position.array.slice();
  assert.equal(smoke.activeCount, 3);
  assert.equal(smoke.emittedCount, 3);
  smoke.emit(new THREE.Vector3(100, 100, 100), 1, 100);
  assert.deepEqual(smoke.geometry.attributes.position.array, originalPositions);
  assert.equal(smoke.emittedCount, 3);
  smoke.update(1.01);
  assert.equal(smoke.activeCount, 0);
  assert.ok(smoke.geometry.attributes.alpha.array.every(value => value === 0));
  smoke.emit(position, 1, 1 / 128);
  assert.equal(smoke.emittedCount, 3);
  smoke.emit(position, 1, 1 / 32);
  assert.equal(smoke.activeCount, 1);
  assert.equal(smoke.emittedCount, 4);
});

test('posição de entrada é somente leitura e fumaça deriva no mundo, com subida pequena e fade', t => {
  t.mock.method(Math, 'random', () => 0.75);
  const smoke = makeSmoke(t);
  const movingPosition = position.clone();
  smoke.emit(movingPosition, 1, 1 / 32);
  const { position: positions, alpha, size } = smoke.geometry.attributes;
  const initialAlpha = alpha.array[0];
  const initialSize = size.array[0];
  assert.deepEqual(Array.from(positions.array.slice(0, 3)), [10, 2, -6]);
  assert.deepEqual(movingPosition, position);
  movingPosition.set(500, 500, 500);
  smoke.update(0.3);
  assert.ok(positions.array[0] > 10 && positions.array[0] < 10.2);
  assert.ok(positions.array[1] > 2 && positions.array[1] < 2.2);
  assert.ok(positions.array[2] > -6 && positions.array[2] < -5.8);
  assert.ok(alpha.array[0] > 0 && alpha.array[0] < initialAlpha);
  assert.ok(size.array[0] > initialSize);
  smoke.emit(position, 0, 0.6);
  smoke.update(0.61);
  assert.equal(smoke.activeCount, 0, 'partículas envelhecem mesmo com o carro parado');
  assert.equal(alpha.array[0], 0);
});

test('vida fica entre 0.6 e 1 segundo, inclusive com um delta longo', t => {
  for (const random of [0, 0.999999]) {
    t.mock.method(Math, 'random', () => random);
    const smoke = makeSmoke(t);
    smoke.emit(position, 1, 1 / 32);
    smoke.update(0.599);
    assert.equal(smoke.activeCount, 1);
    smoke.update(0.002);
    assert.equal(smoke.activeCount, random === 0 ? 0 : 1);
    smoke.update(5);
    assert.equal(smoke.activeCount, 0);
    assert.ok(smoke.geometry.attributes.alpha.array.every(value => value === 0));
  }
});

test('emissão, duração e deriva são aproximadamente independentes de 30/60/120 FPS', t => {
  t.mock.method(Math, 'random', () => 0.75);
  const counts = [];
  const distances = [];
  for (const hz of [30, 60, 120]) {
    const smoke = makeSmoke(t);
    for (let frame = 0; frame < hz * 3; frame += 1) {
      smoke.update(1 / hz);
      for (let id = 0; id < 4; id += 1) smoke.emit(position, 0.5, 1 / hz, id);
      assert.ok(smoke.activeCount <= smoke.capacity);
    }
    assert.equal(smoke.emittedCount, 192);
    counts.push(smoke.activeCount);
    smoke.update(1.01);
    assert.equal(smoke.activeCount, 0);

    smoke.emit(position, 1, 1 / 32);
    for (let frame = 0; frame < hz / 2; frame += 1) smoke.update(1 / hz);
    const live = smoke.geometry.attributes.alpha.array.findIndex(alpha => alpha > 0);
    assert.notEqual(live, -1);
    distances.push(smoke.geometry.attributes.position.array[live * 3 + 1]);
  }
  assert.ok(Math.max(...counts) - Math.min(...counts) <= 4, `vivos por FPS: ${counts}`);
  assert.ok(Math.max(...distances) - Math.min(...distances) < 0.0001);
});

test('emissão proporcional à intensidade, limitada a 1', t => {
  const half = makeSmoke(t);
  const full = makeSmoke(t);
  half.emit(position, 0.5, 0.5);
  full.emit(position, 10, 0.5);
  assert.equal(half.emittedCount, 8);
  assert.equal(full.emittedCount, 16);
});

test('buffers mantêm identidade e tamanho após muitas emissões e reutilizações', t => {
  const smoke = makeSmoke(t, { capacity: 4 });
  const attributes = Object.values(smoke.geometry.attributes);
  const buffers = attributes.map(attribute => attribute.array);
  for (let cycle = 0; cycle < 20; cycle += 1) {
    smoke.emit(position, 1, 1);
    assert.equal(smoke.activeCount, 4);
    smoke.update(1.01);
    assert.equal(smoke.activeCount, 0);
  }
  assert.equal(smoke.emittedCount, 80);
  attributes.forEach((attribute, i) => {
    assert.equal(attribute.array, buffers[i]);
    assert.equal(attribute.count, 4);
  });
});

test('hook de render reutiliza viewport e atualiza escala em pixels físicos', t => {
  const smoke = makeSmoke(t);
  let target: THREE.Vector4 | undefined;
  const renderer = {
    getCurrentViewport(viewport: THREE.Vector4) {
      if (target) assert.equal(viewport, target);
      target = viewport;
      return viewport.set(0, 0, 1920, 1080);
    },
  };
  const renderTarget = renderer as unknown as THREE.WebGLRenderer;
  smoke.points.onBeforeRender(renderTarget, new THREE.Scene(), new THREE.Camera(), smoke.geometry, smoke.material, new THREE.Group());
  smoke.points.onBeforeRender(renderTarget, new THREE.Scene(), new THREE.Camera(), smoke.geometry, smoke.material, new THREE.Group());
  assert.equal(smoke.material.uniforms.viewportHeight.value, 1080);
  assert.equal(smoke.material.uniforms.maxPointSize.value, 64);
});

test('destroy remove da cena e libera recursos exatamente uma vez', () => {
  const scene = new THREE.Scene();
  const smoke = new TireSmoke(scene);
  let geometryDisposals = 0;
  let materialDisposals = 0;
  smoke.geometry.addEventListener('dispose', () => { geometryDisposals += 1; });
  smoke.material.addEventListener('dispose', () => { materialDisposals += 1; });
  smoke.emit(position, 1, 0.1);
  const emittedCount = smoke.emittedCount;
  smoke.destroy();
  smoke.destroy();
  smoke.update(0.1);
  smoke.emit(position, 1, 0.1);
  assert.equal(scene.children.length, 0);
  assert.equal(smoke.points.parent, null);
  assert.equal(smoke.activeCount, 0);
  assert.equal(smoke.emittedCount, emittedCount);
  assert.equal(geometryDisposals, 1);
  assert.equal(materialDisposals, 1);
});

test('entradas inválidas não envenenam pool e capacidade inválida é rejeitada', t => {
  const smoke = makeSmoke(t);
  for (const dt of [0, -1, NaN, Infinity]) {
    smoke.emit(position, 1, dt);
    smoke.update(dt);
  }
  for (const id of [-1, 4, 0.5, NaN]) smoke.emit(position, 1, 1, id);
  for (const intensity of [NaN, Infinity]) smoke.emit(position, intensity, 1);
  smoke.emit(new THREE.Vector3(NaN, 0, 0), 1, 1);
  assert.equal(smoke.emittedCount, 0);
  smoke.emit(position, 1, 1 / 32);
  assert.equal(smoke.activeCount, 1);
  for (const capacity of [0, -1, 1.5, NaN, Infinity]) {
    assert.throws(() => new TireSmoke(new THREE.Scene(), { capacity }), RangeError);
  }
});

test('helper exige velocidade longitudinal > 3 e lateral > 2 e retorna 0..1', () => {
  for (const [forward, sideways] of [[0, 10], [3, 10], [10, 0], [10, 2], [-3, -10], [10, -2]]) {
    assert.equal(slipSmokeIntensity(forward, sideways), 0);
  }
  assert.ok(slipSmokeIntensity(3.01, 2.01) > 0);
  assert.equal(slipSmokeIntensity(5.5, 4), 0.25);
  assert.equal(slipSmokeIntensity(-5.5, -4), 0.25);
  assert.equal(slipSmokeIntensity(8, 6), 1);
  assert.equal(slipSmokeIntensity(100, 100), 1);
  assert.equal(slipSmokeIntensity(NaN, 5), 0);
  assert.equal(slipSmokeIntensity(10, Infinity), 0);
});
