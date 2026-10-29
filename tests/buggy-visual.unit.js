import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BuggyTemplate, splitWheelGeometry } from '../src/visuals/vehicles/BuggyTemplate.js';
import { BuggyVisualAdapter } from '../src/visuals/vehicles/BuggyVisualAdapter.js';
import { PAINTS } from '../src/data/vehicles.js';

function fixture() {
  const scene = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ name: 'main_body', color: 'gray' });
  const rubber = new THREE.MeshStandardMaterial({ name: 'rubber', color: '#111111' });
  const metal = new THREE.MeshStandardMaterial({ name: 'metal', color: '#999999' });
  const chassis = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.6, 2.5), paint);
  chassis.position.y = 0.8; scene.add(chassis);
  const pairs = [
    ['tyre_Material007_0', 1, 0.4, rubber], ['rims_rims_0', 1, 0.25, metal],
    ['tyre_back_Material007_0', -1, 0.4, rubber], ['rim_back_rims_0', -1, 0.25, metal],
  ];
  for (const [name, z, radius, material] of pairs) {
    const halves = [-1, 1].map(side => new THREE.CylinderGeometry(radius, radius, 0.25, 16)
      .rotateZ(Math.PI / 2).translate(side * 0.85, 0.4, z));
    const mesh = new THREE.Mesh(mergeGeometries(halves), material); mesh.name = name; scene.add(mesh);
    halves.forEach(g => g.dispose());
  }
  return { scene, animations: [] };
}

test('separa rodas sem cortar triângulos e preserva UVs/normais', () => {
  const source = fixture().scene.children[1].geometry;
  const halves = splitWheelGeometry(source, new THREE.Matrix4());
  assert.equal(halves.reduce((sum, g) => sum + g.index.count, 0), source.index.count);
  for (const half of halves) {
    assert.equal(half.getAttribute('normal').count, half.getAttribute('position').count);
    assert.equal(half.getAttribute('uv').count, half.getAttribute('position').count);
    assert.ok(half.boundingBox.max.x < 0 || half.boundingBox.min.x > 0);
    half.dispose();
  }
  const crossing = new THREE.BoxGeometry(2, 1, 1);
  assert.throws(() => splitWheelGeometry(crossing, new THREE.Matrix4()), /separação/);
});

test('Rift local: três pinturas isoladas, quatro pivôs e tamanho normalizado', () => {
  const template = new BuggyTemplate(fixture());
  const cars = PAINTS.map(paint => template.create(paint));
  for (const [index, car] of cars.entries()) {
    assert.equal(car.userData.paintMaterials[0].color.getHexString(), PAINTS[index].color.slice(1).toLowerCase());
    assert.ok(Math.abs(car.userData.size.z - 3.25) < 1e-10);
    for (let wheel = 0; wheel < 4; wheel++) assert.ok(car.getObjectByName(`wheel-spin-${wheel}`));
    assert.ok(car.getObjectByName('tire-emitter-3'));
  }
  assert.notEqual(cars[0].userData.paintMaterials[0], cars[1].userData.paintMaterials[0]);
  const meshes = []; cars[0].traverse(o => { if (o.isMesh) meshes.push(o); });
  assert.equal(meshes.filter(o => o.material.name === 'rubber').length, 4);
  assert.ok(meshes.filter(o => o.material.name === 'rubber').every(o => o.material.color.getHexString() === '111111'));
  cars.forEach(car => car.userData.ownedMaterials.forEach(m => m.dispose())); template.destroy();
});

test('rodas seguem v/r, ré, esterçamento e parada; body nunca escreve na raiz ou pose física', () => {
  const template = new BuggyTemplate(fixture()); const car = template.create(PAINTS[0]);
  const adapter = new BuggyVisualAdapter(car, template.wheels);
  const pose = Object.freeze({ longitudinalSpeed: 3, lateralSpeed: 0, steer: 1,
    longitudinalAcceleration: -12, impactSpeed: 3, nitroActive: true });
  car.position.set(12, 4, 8); car.rotation.y = 0.7;
  const before = car.position.clone();
  adapter.update(pose, 1 / 60);
  const wheel = adapter.wheels[0];
  assert.ok(Math.abs(wheel.spin.rotation.x - 3 / 60 / wheel.radius) < 1e-10);
  assert.ok(wheel.steer.rotation.y > 0);
  assert.equal(adapter.wheels[2].steer.rotation.y, 0);
  assert.ok(adapter.body.rotation.x > 0, 'frenagem abaixa o nariz (+Z)');
  assert.ok(adapter.flames.every(f => f.visible));
  adapter.update({ ...pose, longitudinalSpeed: -3, nitroActive: false }, 1 / 60);
  assert.ok(Math.abs(wheel.spin.rotation.x) < 1e-10);
  adapter.update({ ...pose, longitudinalSpeed: 0 }, 1 / 60);
  assert.ok(Math.abs(wheel.spin.rotation.x) < 1e-10);
  adapter.update({ ...pose, finished: true }, 1 / 60);
  assert.ok(Math.abs(wheel.spin.rotation.x) < 1e-10, 'a apresentação para após a chegada sem zerar velocidade física');
  assert.ok(adapter.flames.every(f => !f.visible));
  assert.ok(before.equals(car.position)); assert.equal(car.rotation.y, 0.7);
  for (let i = 0; i < 240; i++) adapter.update({ longitudinalSpeed: 0 }, 1 / 60);
  assert.ok(Math.abs(adapter.body.rotation.x) < 1e-10);
  assert.ok(Math.abs(adapter.body.rotation.z) < 1e-10);
  assert.ok(Math.abs(adapter.body.position.y - adapter.bodyRestY) < 1e-10, 'retorno não oscila nem desloca a raiz');
  adapter.destroy(); car.userData.ownedMaterials.forEach(m => m.dispose()); template.destroy();
});

test('template incompatível sem pintura falha no carregamento, antes de ser anunciado pronto', () => {
  const gltf = fixture();
  gltf.scene.children[0].material.name = 'unknown';
  assert.throws(() => new BuggyTemplate(gltf), /main_body/);
});

test('rotação das rodas equivalente a 30/60/120 Hz sem mixer concorrente', () => {
  const results = [];
  for (const fps of [30, 60, 120]) {
    const template = new BuggyTemplate(fixture()); const car = template.create(PAINTS[0]);
    const adapter = new BuggyVisualAdapter(car, template.wheels);
    for (let i = 0; i < fps; i++) adapter.update({ longitudinalSpeed: 2 }, 1 / fps);
    results.push(adapter.wheels[0].spin.rotation.x);
    adapter.destroy(); car.userData.ownedMaterials.forEach(m => m.dispose()); template.destroy();
  }
  assert.ok(Math.abs(results[0] - results[2]) < 1e-10);
});
