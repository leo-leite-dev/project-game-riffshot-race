import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { RaceCameraRig } from '../src/visuals/race/RaceCameraRig.js';
import { sampleRaceTrack } from '../src/race/trackMath.js';
import { RACE_TRACKS } from '../src/data/raceTracks.js';

const pose = Object.freeze({ x: 0, y: 4, z: 0, heading: 0, speed: 0 });
const size = new THREE.Vector3(2.9, 1.8, 3.25);
const makeRig = (options = {}) => new RaceCameraRig({ vehicleSize: size, ...options });
const finishBlend = (rig, player = pose, hz = 60) => {
  for (let i = 0; i < hz * 2; i += 1) rig.update(player, 1 / hz);
};

test('isométrica explícita segue o jogador e não modifica o estado da simulação', () => {
  const rig = makeRig({ mode: 'isometric' });
  rig.update(pose, 1 / 60);
  assert.equal(rig.mode, 'isometric');
  assert.equal(rig.camera.isOrthographicCamera, true);
  assert.ok(rig.camera.position.distanceTo(new THREE.Vector3(21, 36, 21)) < 1e-6);
  const moved = Object.freeze({ ...pose, x: 25, z: 40 });
  finishBlend(rig, moved);
  assert.ok(rig.center.distanceTo(new THREE.Vector3(25, 4, 40)) < 0.01);
  assert.deepEqual(pose, { x: 0, y: 4, z: 0, heading: 0, speed: 0 });
});

test('terceira pessoa é padrão e uma nova instância não herda a isométrica da corrida anterior', () => {
  const previous = makeRig();
  assert.equal(previous.mode, 'chase');
  previous.update(pose, 1 / 60);
  previous.toggle();
  finishBlend(previous);
  assert.equal(previous.mode, 'isometric');
  const next = makeRig();
  next.update(pose, 1 / 60);
  assert.equal(next.mode, 'chase');
  assert.equal(next.camera.isPerspectiveCamera, true);
  assert.equal(makeRig({ mode: 'inválido' }).mode, 'chase');
});

test('terceira pessoa fica atrás e acima do carro, e mantém o carro na região inferior central', () => {
  const rig = makeRig({ mode: 'chase' });
  rig.resize(16 / 9);
  rig.update(pose, 1 / 60);
  assert.ok(rig.camera.position.z < pose.z);
  assert.ok(rig.camera.position.y > pose.y + size.y);
  const screen = new THREE.Vector3(0, pose.y + size.y / 2, 0).project(rig.camera);
  assert.ok(Math.abs(screen.x) < 0.02);
  assert.ok(screen.y > -0.95 && screen.y < 0, `projeção vertical ${screen.y}`);
});

test('transição contínua, matriz invertível, repetição bloqueada e preferência inicial validada', () => {
  const rig = makeRig({ mode: 'isometric' });
  rig.update(pose, 1 / 60);
  const before = rig.camera.position.clone();
  assert.equal(rig.toggle(), true);
  assert.equal(rig.toggle(), false);
  rig.update(pose, 1 / 60);
  assert.ok(rig.camera.position.distanceTo(before) < 0.1);
  for (let i = 0; i < 90; i += 1) {
    rig.update(pose, 1 / 60);
    assert.ok(rig.camera.projectionMatrix.elements.every(Number.isFinite));
    assert.ok(Math.abs(rig.camera.projectionMatrix.determinant()) > 1e-10);
  }
  assert.equal(rig.transitioning, false);
  assert.equal(rig.mode, 'chase');
  assert.equal(rig.toggle(), true);
  finishBlend(rig);
  assert.equal(rig.mode, 'isometric');
  assert.ok(rig.camera.position.distanceTo(before) < 1e-6);
});

test('acompanhamento é estável a 30/60/120 Hz e em parada/colisão/rotação de ±PI', () => {
  const final = [];
  for (const hz of [30, 60, 120]) {
    const rig = makeRig({ mode: 'chase' });
    rig.update({ ...pose, heading: Math.PI - 0.02 }, 1 / hz);
    finishBlend(rig, { ...pose, heading: -Math.PI + 0.02, x: 3 }, hz);
    final.push(rig.camera.position.clone());
    assert.ok(Math.abs(Math.atan2(Math.sin(rig.heading - Math.PI), Math.cos(rig.heading - Math.PI))) < 0.03);
    const previous = rig.heading;
    rig.update({ ...pose, heading: previous + Math.PI }, 1 / hz);
    assert.ok(Math.abs(rig.heading - previous) <= 2.4 / hz + 1e-7);
    assert.ok(rig.camera.position.toArray().every(Number.isFinite));
  }
  assert.ok(final[0].distanceTo(final[2]) < 0.02);
});

test('câmera se retrai antes de uma estrutura e limpa referências ao encerrar', () => {
  const wall = new THREE.Mesh(new THREE.BoxGeometry(30, 30, 0.4), new THREE.MeshBasicMaterial());
  wall.position.set(0, 10, -4);
  wall.updateMatrixWorld(true);
  const rig = makeRig({ mode: 'chase', obstacles: [wall] });
  rig.update(pose, 1 / 60);
  assert.ok(rig.camera.position.z > -4);
  wall.position.z = -0.7;
  wall.updateMatrixWorld(true);
  rig.update(pose, 1 / 60);
  assert.ok(rig.camera.position.z > -0.5, 'nem uma barreira próxima pode ficar entre carro e câmera');
  rig.destroy();
  assert.equal(rig.obstacles.length, 0);
  wall.geometry.dispose();
  wall.material.dispose();
});

test('elevação e resize em ambas as pistas mantêm projeção finita nas duas câmeras', () => {
  for (const track of RACE_TRACKS) for (const mode of ['isometric', 'chase']) {
    const rig = makeRig({ track: { ...sampleRaceTrack(track), width: track.width }, mode });
    for (const aspect of [16 / 9, 390 / 844, 844 / 390]) {
      rig.resize(aspect);
      for (const point of track.waypoints) {
        rig.update({ ...pose, ...point, heading: 0.4, speed: 25 }, 1 / 60);
        assert.ok(rig.camera.position.toArray().every(Number.isFinite));
        assert.ok(rig.camera.projectionMatrix.elements.every(Number.isFinite));
      }
    }
  }
});
