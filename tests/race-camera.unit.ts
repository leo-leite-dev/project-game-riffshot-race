import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { RaceCameraRig } from '../src/visuals/race/RaceCameraRig.ts';
import { sampleRaceTrack } from '../src/race/trackMath.ts';
import { RACE_TRACKS } from '../src/data/raceTracks.ts';
import { RACE_CAMERA_SETTINGS, ZOOM_LABELS } from '../src/data/raceCameras.ts';
import type { RenderPose } from '../src/race/RaceSimulation.ts';

const pose: Readonly<RenderPose> = Object.freeze({ x: 0, y: 4, z: 0, heading: 0, speed: 0 });
const size = new THREE.Vector3(2.9, 1.8, 3.25);
const scaledSize = size.clone().multiplyScalar(1.3);
type RigOptions = Omit<Partial<ConstructorParameters<typeof RaceCameraRig>[0]>, 'mode'> & { mode?: string };
const makeRig = (options: RigOptions = {}) => new RaceCameraRig(
  { track: RACE_TRACKS[0], vehicleSize: size, ...options } as ConstructorParameters<typeof RaceCameraRig>[0]);
const finishBlend = (rig: RaceCameraRig, player: Readonly<RenderPose> = pose, hz = 60) => {
  for (let i = 0; i < hz * 2; i += 1) rig.update(player, 1 / hz);
};

test('câmera arcade padrão: vista oblíqua mais baixa segue o jogador sem alterar simulação', () => {
  const defaultRig = makeRig();
  defaultRig.update(pose, 1 / 60);
  assert.equal(defaultRig.mode, 'isometric');
  assert.equal(defaultRig.camera.isOrthographicCamera, true);
  assert.ok(defaultRig.camera.position.distanceTo(new THREE.Vector3(18, 12, 27.5)) < 1e-6);
  assert.ok(Math.atan2(defaultRig.camera.position.y - defaultRig.isometricTarget.y,
    Math.hypot(defaultRig.camera.position.x - defaultRig.isometricTarget.x,
      defaultRig.camera.position.z - defaultRig.isometricTarget.z)) < THREE.MathUtils.degToRad(16),
  'o ângulo fica baixo e revela a lateral do veículo');
  assert.deepEqual(pose, { x: 0, y: 4, z: 0, heading: 0, speed: 0 });
});

test('isométrica explícita segue o jogador e não modifica o estado da simulação', () => {
  const rig = makeRig({ mode: 'isometric' });
  rig.update(pose, 1 / 60);
  assert.equal(rig.mode, 'isometric');
  assert.equal(rig.camera.isOrthographicCamera, true);
  assert.ok(rig.camera.position.distanceTo(new THREE.Vector3(18, 12, 27.5)) < 1e-6);
  assert.equal(rig.isometric.top - rig.isometric.bottom, 26);
  const moved = Object.freeze({ ...pose, x: 25, z: 40 });
  finishBlend(rig, moved);
  assert.ok(rig.center.distanceTo(new THREE.Vector3(25, 4, 40)) < 0.01);
  finishBlend(rig, { ...moved, heading: Math.PI / 2, speed: 40 });
  assert.ok(rig.isometricTarget.x > rig.center.x + 4);
  assert.ok(rig.isometric.position.clone().sub(rig.isometricTarget).distanceTo(new THREE.Vector3(18, 8, 25)) < 1e-6,
    'a antecipação acompanha o carro sem girar o ângulo isométrico fixo');
  assert.deepEqual(pose, { x: 0, y: 4, z: 0, heading: 0, speed: 0 });
});

test('correção de ângulo: câmera arcade mostra mais lateral e menos teto que a vista elevada antiga', () => {
  const low = makeRig({ mode: 'isometric' });
  low.update(pose, 1 / 60);
  const lowAngle = Math.atan2(low.camera.position.y - low.isometricTarget.y,
    Math.hypot(low.camera.position.x - low.isometricTarget.x, low.camera.position.z - low.isometricTarget.z));
  const oldAngle = Math.atan2(22, Math.hypot(18, 25));
  assert.ok(lowAngle < oldAngle - 0.15, `novo ${lowAngle}, anterior ${oldAngle}`);
  assert.ok(lowAngle < THREE.MathUtils.degToRad(16));
});

test('nova corrida usa vista arcade e não herda a terceira pessoa da corrida anterior', () => {
  const previous = makeRig();
  assert.equal(previous.mode, 'isometric');
  previous.update(pose, 1 / 60);
  previous.toggle();
  finishBlend(previous);
  assert.equal(previous.mode, 'chase');
  const next = makeRig();
  next.update(pose, 1 / 60);
  assert.equal(next.mode, 'isometric');
  assert.equal(next.camera.isOrthographicCamera, true);
  assert.equal(makeRig({ mode: 'inválido' }).mode, 'isometric');
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

test('zoom oferece três níveis próximos proporcionais ao carro e reinicia por instância', () => {
  assert.deepEqual(ZOOM_LABELS, ['PRÓXIMA', 'MAIS PRÓXIMA', 'BEM PRÓXIMA']);
  for (const vehicleSize of [undefined, size, scaledSize]) {
    const rig = makeRig({ vehicleSize, mode: 'chase' });
    rig.update(pose, 1 / 60);
    let previousDistance = Infinity;
    for (let index = 0; index < 3; index += 1) {
      finishBlend(rig);
      assert.equal(rig.zoomIndex, index);
      assert.equal(rig.zoomLabel, ZOOM_LABELS[index]);
      const distance = pose.z - rig.camera.position.z;
      assert.ok(distance < previousDistance, 'cada nível aproxima o carro');
      assert.ok(Math.abs(distance - rig.size.z * RACE_CAMERA_SETTINGS.chase.presets[index].distance) < 0.01);
      assert.ok(distance > rig.size.z / 2 + rig.camera.near);
      if (vehicleSize === scaledSize && index === 0) assert.ok(Math.abs(distance - 5.915) < 0.001);
      previousDistance = distance;
      const before = rig.camera.position.clone();
      assert.equal(rig.cycleZoom(), true);
      assert.ok(rig.camera.position.equals(before), 'a seleção não salta a posição');
      rig.update(pose, 1 / 60);
      assert.ok(rig.camera.position.distanceTo(before) < 0.05, 'aproximação/retorno suave');
    }
    finishBlend(rig);
    assert.equal(rig.zoomIndex, 0, 'a terceira pressão retorna ao zoom base');
    assert.ok(Math.abs(pose.z - rig.camera.position.z - rig.size.z * 1.4) < 0.01);
  }
  const previous = makeRig({ mode: 'chase' });
  previous.cycleZoom();
  assert.equal(makeRig({ mode: 'chase' }).zoomIndex, 0);
});

test('zoom preserva carro inteiro e near clip em retrato/paisagem nos três níveis e velocidades', () => {
  const rig = makeRig({ vehicleSize: scaledSize, mode: 'chase' });
  for (let index = 0; index < 3; index += 1) {
    for (const aspect of [16 / 9, 390 / 844, 844 / 390]) {
      rig.resize(aspect);
      for (const speed of [0, 40]) {
        finishBlend(rig, { ...pose, speed });
        for (const x of [-scaledSize.x / 2, scaledSize.x / 2]) {
          for (const y of [0.08, scaledSize.y + 0.08]) {
            for (const z of [-scaledSize.z / 2, scaledSize.z / 2]) {
              const screen = new THREE.Vector3(x, pose.y + y, z).project(rig.camera);
              assert.ok(screen.toArray().every(Number.isFinite));
              assert.ok(Math.abs(screen.x) < 1 && Math.abs(screen.y) < 1 && Math.abs(screen.z) < 1,
                `nível ${index}, aspecto ${aspect}, velocidade ${speed}: ${screen.toArray()}`);
            }
          }
        }
      }
      assert.equal(rig.zoomIndex, index, 'resize preserva seleção');
    }
    rig.cycleZoom();
  }
});

test('Thunder real: oito cantos e centro do corpo ficam enquadrados após update estável nos três zooms mobile', t => {
  const thunderSize = new THREE.Vector3(3.08247, 1.97125, 4.225);
  // The normalized GLB is centered in X/Z, rests on Y=0 and the race root
  // receives +0.08 Y. Use the body midpoint, not the root resting on the road.
  const localBounds = new THREE.Box3(
    new THREE.Vector3(-thunderSize.x / 2, 0, -thunderSize.z / 2),
    new THREE.Vector3(thunderSize.x / 2, thunderSize.y, thunderSize.z / 2));
  const localCenter = localBounds.getCenter(new THREE.Vector3());
  const corners = [];
  for (const x of [localBounds.min.x, localBounds.max.x]) {
    for (const y of [localBounds.min.y, localBounds.max.y]) {
      for (const z of [localBounds.min.z, localBounds.max.z]) corners.push(new THREE.Vector3(x, y, z));
    }
  }
  assert.equal(corners.length, 8);
  for (const aspect of [16 / 9, 390 / 844]) {
    for (const heading of [0, 0.4, Math.PI / 2, -2.4]) {
      const player = Object.freeze({ ...pose, x: 21, y: 8, z: -35, heading });
      const rig = makeRig({ vehicleSize: thunderSize, mode: 'isometric' });
      rig.resize(16 / 9);
      finishBlend(rig, player);
      // Reproduce resize in isometric followed by C -> chase, then explicitly
      // wait in simulation time. A screenshot during blending is a different state.
      rig.resize(aspect);
      assert.equal(rig.toggle(), true);
      finishBlend(rig, player);
      const actorMatrix = new THREE.Matrix4().makeRotationY(heading);
      actorMatrix.setPosition(player.x, player.y + 0.08, player.z);
      for (let index = 0; index < 3; index += 1) {
        for (const speed of [0, 40]) {
          const moving = { ...player, speed };
          finishBlend(rig, moving);
          // Measure the camera produced by update(), including its projection
          // and world inverse, rather than constructing an ideal camera in test.
          rig.update(moving, 1 / 60);
          assert.equal(rig.transitioning, false);
          assert.equal(rig.zoomIndex, index);
          assert.ok(Math.abs(rig.zoomLevel - index) < 1e-5);
          const projectedCorners = corners.map(corner => corner.clone().applyMatrix4(actorMatrix).project(rig.camera));
          const projectedBounds = new THREE.Box3().setFromPoints(projectedCorners);
          const bodyCenter = localCenter.clone().applyMatrix4(actorMatrix).project(rig.camera);
          const context = `zoom=${index}, aspecto=${aspect}, heading=${heading}, speed=${speed}, bounds=${JSON.stringify(projectedBounds)}`;
          for (const corner of projectedCorners) assert.ok(corner.toArray().every(Number.isFinite), context);
          assert.ok(projectedBounds.min.x > -0.98 && projectedBounds.max.x < 0.98, `horizontal: ${context}`);
          assert.ok(projectedBounds.min.y > -0.98 && projectedBounds.max.y < 0.98, `vertical: ${context}`);
          assert.ok(projectedBounds.min.z > -1 && projectedBounds.max.z < 1, `near/far clip: ${context}`);
          assert.ok(Math.abs(bodyCenter.x) < 0.02 && bodyCenter.y > -0.85 && bodyCenter.y < 0,
            `centro do corpo: ${bodyCenter.toArray()}, ${context}`);
          if (aspect < 1 && heading === 0 && speed === 0) {
            t.diagnostic(`Thunder mobile zoom ${index}: X=[${projectedBounds.min.x.toFixed(3)}, ${projectedBounds.max.x.toFixed(3)}], Y=[${projectedBounds.min.y.toFixed(3)}, ${projectedBounds.max.y.toFixed(3)}], centroY=${bodyCenter.y.toFixed(3)}`);
          }
        }
        assert.equal(rig.cycleZoom(), true);
      }
    }
  }
});

test('transição contínua, matriz invertível, repetição bloqueada e preferência inicial validada', () => {
  const rig = makeRig({ mode: 'isometric' });
  rig.update(pose, 1 / 60);
  const before = rig.camera.position.clone();
  assert.equal(rig.toggle(), true);
  assert.equal(rig.toggle(), false);
  assert.equal(rig.cycleZoom(), false);
  rig.update(pose, 1 / 60);
  assert.ok(rig.camera.position.distanceTo(before) < 0.1);
  for (let i = 0; i < 90; i += 1) {
    rig.update(pose, 1 / 60);
    if (i === 30) rig.resize(390 / 844);
    assert.ok(rig.camera.projectionMatrix.elements.every(Number.isFinite));
    assert.ok(Math.abs(rig.camera.projectionMatrix.determinant()) > 1e-10);
  }
  assert.equal(rig.transitioning, false);
  assert.equal(rig.mode, 'chase');
  assert.equal(rig.cycleZoom(), true);
  finishBlend(rig);
  assert.equal(rig.toggle(), true);
  assert.equal(rig.cycleZoom(), false);
  finishBlend(rig);
  assert.equal(rig.mode, 'isometric');
  assert.equal(rig.cycleZoom(), false);
  assert.equal(rig.zoomIndex, 1);
  assert.ok(rig.camera.position.distanceTo(before) < 1e-6);
  assert.equal(rig.toggle(), true);
  finishBlend(rig);
  assert.equal(rig.zoomIndex, 1, 'trocar o modo conserva o zoom desta corrida');
});

test('acompanhamento é estável a 30/60/120 Hz e em parada/colisão/rotação de ±PI', () => {
  const final = [];
  for (const hz of [30, 60, 120]) {
    const rig = makeRig({ mode: 'chase', vehicleSize: scaledSize });
    rig.update({ ...pose, heading: Math.PI - 0.02 }, 1 / hz);
    rig.cycleZoom();
    rig.cycleZoom();
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

test('feedback de velocidade e drift na perseguição é sutil, progressivo e não muda a isométrica', () => {
  const rig = makeRig({ mode: 'chase', vehicleSize: scaledSize });
  rig.update({ ...pose, speed: 0, lateralSpeed: 0 }, 1 / 60);
  const idleFov = rig.zoomFov, idleRoll = rig.chaseRoll;
  for (let frame = 0; frame < 30; frame += 1) rig.update({ ...pose, speed: 32, lateralSpeed: 14 }, 1 / 60);
  assert.ok(rig.zoomFov > idleFov && rig.zoomFov - idleFov <= 3.5);
  assert.ok(rig.chaseRoll > 0 && rig.chaseRoll <= 0.014);
  const speedFov = rig.zoomFov;
  for (let frame = 0; frame < 60; frame += 1) rig.update({ ...pose, speed: 0, lateralSpeed: 0 }, 1 / 60);
  assert.ok(rig.zoomFov < speedFov && Math.abs(rig.chaseRoll) < 0.002);
  rig.destroy();

  const isometric = makeRig({ mode: 'isometric', vehicleSize: scaledSize });
  isometric.update({ ...pose, speed: 0, lateralSpeed: 0 }, 1 / 60);
  const isoPose = isometric.camera.position.clone(), isoProjection = isometric.isometric.projectionMatrix.clone();
  isometric.update({ ...pose, x: 12, speed: 35, lateralSpeed: -22 }, 1 / 60);
  assert.ok(isometric.camera.position.distanceTo(isoPose) > 0);
  assert.ok(isometric.camera.projectionMatrix.elements.every(Number.isFinite));
  assert.equal(isometric.camera.isOrthographicCamera, true);
  assert.deepEqual(isometric.isometric.projectionMatrix.elements, isoProjection.elements,
    'seguir el carro não deve introduzir projeção perspectiva na isométrica');
  isometric.destroy();
});

test('câmera se retrai antes de uma estrutura e limpa referências ao encerrar', () => {
  const wall = new THREE.Mesh(new THREE.BoxGeometry(30, 30, 0.4), new THREE.MeshBasicMaterial());
  wall.position.set(0, 10, -4);
  wall.updateMatrixWorld(true);
  const rig = makeRig({ mode: 'chase', vehicleSize: scaledSize, obstacles: [wall] });
  for (let index = 0; index < 3; index += 1) {
    finishBlend(rig);
    assert.ok(rig.camera.position.z > -3.8 - 1e-6);
    assert.ok(rig.camera.position.y > pose.y + scaledSize.y + rig.camera.near);
    rig.cycleZoom();
  }
  wall.position.z = -0.7;
  wall.updateMatrixWorld(true);
  rig.update(pose, 1 / 60);
  assert.ok(rig.camera.position.z > -0.5, 'nem uma barreira próxima pode ficar entre carro e câmera');
  assert.ok(rig.camera.position.y > pose.y + scaledSize.y + rig.camera.near, 'retração não entra no teto');
  wall.position.z = -40;
  wall.updateMatrixWorld(true);
  const contracted = rig.camera.position.clone();
  rig.update(pose, 1 / 60);
  assert.ok(rig.camera.position.distanceTo(contracted) < 1, 'o braço se recupera suavemente');
  finishBlend(rig);
  assert.ok(Math.abs(rig.camera.position.z + scaledSize.z * 1.4) < 0.01);
  // The chase boom continues checking collisions during a mode blend.
  wall.position.z = -3;
  wall.updateMatrixWorld(true);
  rig.toggle();
  for (let i = 0; i < 60; i += 1) {
    rig.update(pose, 1 / 60);
    assert.ok(rig.chasePosition.z > -2.8);
    assert.ok(rig.camera.position.y > pose.y + scaledSize.y + rig.camera.near);
  }
  rig.destroy();
  assert.equal(rig.obstacles.length, 0);
  wall.geometry.dispose();
  wall.material.dispose();
});

test('piso é respeitado após suavização em subida e resize não produz matrizes inválidas', () => {
  const track = { width: 30, points: [{ x: 0, y: 0, z: 0 }, { x: 0, y: 12, z: -5 }] };
   const rig = makeRig({ vehicleSize: scaledSize, mode: 'chase', track: track as unknown as ConstructorParameters<typeof RaceCameraRig>[0]['track'] });
  rig.update(pose, 1 / 60);
  assert.ok(rig.camera.position.y >= 12 + RACE_CAMERA_SETTINGS.chase.groundClearance);
  track.points[1].y = 18;
  rig.update(pose, 1 / 120);
  assert.ok(rig.camera.position.y >= 18 + RACE_CAMERA_SETTINGS.chase.groundClearance,
    'não interpola por baixo do piso mais alto');
  for (const aspect of [NaN, 0, Infinity, -1, 390 / 844, 16 / 9]) {
    rig.resize(aspect);
    assert.ok(rig.camera.projectionMatrix.elements.every(Number.isFinite));
    assert.ok(Math.abs(rig.camera.projectionMatrix.determinant()) > 1e-10);
  }
});

test('reset após respawn elimina perseguição antiga preservando modo/zoom e segurança', () => {
  for (const mode of ['chase', 'isometric'] as const) {
    const rig = makeRig({ vehicleSize: scaledSize, mode: 'chase' });
    rig.update(pose, 1 / 60);
    rig.cycleZoom();
    rig.cycleZoom();
    finishBlend(rig);
    if (mode === 'isometric') rig.toggle();
    const respawn = Object.freeze({ x: 200, y: 18, z: -180, heading: Math.PI / 2, speed: 0 });
    rig.resetAfterRespawn(respawn);
    const fresh = makeRig({ vehicleSize: scaledSize, mode });
    fresh.zoomIndex = 2;
    fresh.update(respawn, 0);
    assert.equal(rig.transitioning, false);
    assert.equal(rig.mode, mode);
    assert.equal(rig.zoomIndex, 2);
    assert.equal(rig.heading, respawn.heading);
    assert.ok(rig.camera.position.distanceTo(fresh.camera.position) < 1e-6);
    assert.ok(rig.camera.quaternion.angleTo(fresh.camera.quaternion) < 1e-6);
    assert.ok(rig.center.distanceTo(new THREE.Vector3(respawn.x, respawn.y, respawn.z)) < 1e-6);
    assert.ok(rig.camera.projectionMatrix.elements.every(Number.isFinite));
  }
});

test('elevação e resize em ambas as pistas mantêm projeção finita nas duas câmeras', () => {
  for (const track of RACE_TRACKS) for (const mode of ['isometric', 'chase']) {
    const cameraTrack = mode === 'isometric' ? track : { ...sampleRaceTrack(track), width: track.width };
    const rig = makeRig({ vehicleSize: scaledSize, track: cameraTrack as unknown as ConstructorParameters<typeof RaceCameraRig>[0]['track'], mode });
    for (const aspect of [16 / 9, 390 / 844, 844 / 390]) {
      rig.resize(aspect);
      assert.ok(rig.isometric.right - rig.isometric.left >= 22 - 1e-6);
      for (const point of track.waypoints) {
        rig.update({ ...pose, ...point, heading: 0.4, speed: 25 }, 1 / 60);
        assert.ok(rig.camera.position.toArray().every(Number.isFinite));
        assert.ok(rig.camera.projectionMatrix.elements.every(Number.isFinite));
      }
    }
  }
});
