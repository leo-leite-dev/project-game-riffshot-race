import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { LAB_FIXED_DT, LAB_TUNING, RapierVehicleLab, initializeRapierLab,
  type LabControls, type LabSnapshot } from '../src/physics-lab/RapierVehicleLab.ts';
import { createLabTrackChunks, DEFAULT_LAB_TRACK_CONFIG, LAB_TRACK_WIDTH } from '../src/physics-lab/trackGeometry.ts';

const neutral: LabControls = { throttle: 0, brake: 0, steer: 0 };
const forward: LabControls = { throttle: 1, brake: 0, steer: 0 };

test('a pista original tem seções contínuas, topo elevado e colisor correspondente à malha visual', () => {
  const chunks = createLabTrackChunks();
  assert.deepEqual(chunks.map(chunk => chunk.name), [
    'Reta de aproximação', 'Subida e rampa de salto', 'Superfície de aterrissagem',
    'Descida progressiva', 'Curva inclinada e reta final',
  ]);
  const firstVertex = (chunk: typeof chunks[number], end = false) => {
    const index = end ? chunk.vertices.length - 6 : 0;
    return { x: chunk.vertices[index]!, y: chunk.vertices[index + 1]!, z: chunk.vertices[index + 2]! };
  };
  const approachEnd = firstVertex(chunks[0]!, true), rampStart = firstVertex(chunks[1]!);
  const rampEnd = firstVertex(chunks[1]!, true), landingStart = firstVertex(chunks[2]!);
  const landingEnd = firstVertex(chunks[2]!, true), descentStart = firstVertex(chunks[3]!);
  const descentEnd = firstVertex(chunks[3]!, true), exitStart = firstVertex(chunks[4]!);
  assert.deepEqual(approachEnd, rampStart, 'reta e subida compartilham a mesma borda');
  assert.equal(rampEnd.z, DEFAULT_LAB_TRACK_CONFIG.launchLipEndZ);
  assert.ok(Math.abs(rampEnd.y - DEFAULT_LAB_TRACK_CONFIG.rampHeight) < 1e-5);
  assert.ok(Math.abs(landingStart.y - rampEnd.y) < 1e-5, 'o pouso está à altura do topo');
  assert.ok(landingStart.z > rampEnd.z, 'o vão de voo é intencional e curto');
  assert.deepEqual(landingEnd, descentStart, 'plataforma e descida não têm degrau');
  assert.deepEqual(descentEnd, exitStart, 'descida e curva final não têm degrau');
  const rampSamples = chunks[1]!.vertices;
  let maximumRampGrade = 0;
  for (let vertex = 6; vertex < rampSamples.length; vertex += 6) {
    const yBefore = rampSamples[vertex - 5]!, zBefore = rampSamples[vertex - 4]!;
    const yAfter = rampSamples[vertex + 1]!, zAfter = rampSamples[vertex + 2]!;
    maximumRampGrade = Math.max(maximumRampGrade, Math.abs((yAfter - yBefore) / (zAfter - zBefore)));
  }
    assert.ok(maximumRampGrade < 0.2, `a subida arcade não tem quina de lançamento: grade ${maximumRampGrade.toFixed(3)}`);
  for (const chunk of chunks) {
    assert.equal(chunk.vertices.length % 3, 0);
    assert.ok(chunk.indices.length > 0);
    for (let triangle = 0; triangle < chunk.indices.length; triangle += 3) {
      const [a, b, c] = Array.from(chunk.indices.slice(triangle, triangle + 3), index => Number(index) * 3);
      const abX = chunk.vertices[b]! - chunk.vertices[a]!, abZ = chunk.vertices[b + 2]! - chunk.vertices[a + 2]!;
      const acX = chunk.vertices[c]! - chunk.vertices[a]!, acZ = chunk.vertices[c + 2]! - chunk.vertices[a + 2]!;
      assert.ok(abZ * acX - abX * acZ > 0, `${chunk.name}: triângulo ${triangle / 3} tem normal voltada para cima`);
    }
  }
  const taller = createLabTrackChunks({ ...DEFAULT_LAB_TRACK_CONFIG, rampHeight: 4.5, width: 12 });
  assert.equal(firstVertex(taller[1]!, true).y, 4.5, 'altura do topo é configurável');
  assert.equal(Math.max(...Array.from(taller[0]!.vertices).filter((_, index) => index % 3 === 0)), 6,
    'largura da pista também é configurável');
  assert.throws(() => createLabTrackChunks({ ...DEFAULT_LAB_TRACK_CONFIG, landingStartZ: 20 }), RangeError);
});

function step(lab: RapierVehicleLab, frames: number, controls = neutral, assist = false): LabSnapshot {
  for (let frame = 0; frame < frames; frame += 1) lab.step(controls, assist);
  return lab.snapshot();
}

test('Rapier cria contato real nas quatro rodas e a suspensão reage ao acelerar', async () => {
  await initializeRapierLab();
  const lab = new RapierVehicleLab();
  try {
    const resting = step(lab, 90);
    assert.equal(resting.grounded, true);
    assert.ok(Math.abs(resting.massKg - LAB_TUNING.chassisMassKg) < 1e-4);
    assert.ok(Math.abs(resting.localCenterOfMass.y + LAB_TUNING.chassisCenterOfMassDropM) < 1e-5,
      'o centro de massa do chassi fica abaixo do centro geométrico');
    assert.ok(resting.principalInertia.x > 0 && resting.principalInertia.y > 0 && resting.principalInertia.z > 0,
      'a distribuição de massa fornece inércia nos três eixos');
    assert.equal(resting.wheels.length, 4);
    assert.ok(resting.wheels.every(wheel => wheel.inContact), 'todas as quatro rodas consultam o terreno');
    assert.ok(resting.wheels.some(wheel => wheel.suspensionForceN > 0), 'a suspensão aplica força, não só animação');
    const moving = step(lab, 45, forward);
    assert.ok(moving.horizontalSpeedMps > 2, `o chassi ganhou velocidade: ${moving.horizontalSpeedMps}`);
    assert.ok(moving.wheels.some(wheel => wheel.compressionM !== resting.wheels[wheel.index]!.compressionM),
      'o curso das rodas é consultado independentemente após movimento');
  } finally { lab.destroy(); }
});

async function runFirstJump(assist: boolean) {
  const lab = new RapierVehicleLab();
  let takeoff: LabSnapshot | null = null, inFlight: LabSnapshot | null = null, landing: LabSnapshot | null = null;
  let descending: LabSnapshot | null = null;
  let takeoffStep = -1, peakHeight = -Infinity, strongestAssist = 0;
  let previousZ = 0, landingStepDistance = Infinity;
  try {
    step(lab, 90);
    const settledY = lab.snapshot().position.y;
    lab.chassis.setTranslation({ x: 0, y: settledY, z: 18 }, true);
    lab.chassis.setLinvel({ x: 0, y: 0, z: 22 }, true);
    for (let stepIndex = 0; stepIndex < 540; stepIndex += 1) {
      const before = lab.snapshot();
      lab.step(neutral, assist);
      const after = lab.snapshot();
      if (!takeoff && before.grounded && after.airborne) {
        takeoff = after;
        takeoffStep = stepIndex;
        previousZ = before.position.z;
      } else if (takeoff && !landing && after.airborne) {
        peakHeight = Math.max(peakHeight, after.position.y);
        strongestAssist = Math.max(strongestAssist, Math.abs(after.assistTorqueNm));
        if (stepIndex === takeoffStep + 8) inFlight = after;
        if (after.verticalSpeedMps < 0) descending = after;
        previousZ = after.position.z;
      } else if (takeoff && after.grounded) {
        landing = after;
        landingStepDistance = Math.abs(after.position.z - previousZ);
        break;
      }
    }
    assert.ok(takeoff, 'a rampa faz o veículo perder contato por física, sem marcador de progresso');
    assert.ok(inFlight, 'o veículo permanece em voo por vários passos físicos');
    assert.ok(landing, 'as rodas voltam a tocar a malha física de aterrissagem');
    for (let frame = 0; frame < 18; frame += 1) lab.step(neutral, assist);
    const recovered = lab.snapshot();
    return { lab, takeoff, inFlight, descending, landing, recovered, peakHeight, strongestAssist, landingStepDistance };
  } catch (error) {
    lab.destroy();
    throw error;
  }
}

test('rampa produz voo balístico, pitch por torque assistido e aterrissagem com contato de rodas', async () => {
  await initializeRapierLab();
  const natural = await runFirstJump(false);
  const assisted = await runFirstJump(true);
  try {
    assert.ok(natural.takeoff.verticalSpeedMps > 0, 'a subida física fornece velocidade vertical ao decolar');
    assert.ok(natural.peakHeight > natural.takeoff.position.y + 0.1, 'a gravidade produz um salto arcade curto, mas observável');
    assert.ok(natural.inFlight.verticalSpeedMps < natural.takeoff.verticalSpeedMps,
      'a gravidade continua alterando a velocidade durante o voo');
    assert.ok(natural.inFlight.horizontalSpeedMps > natural.takeoff.horizontalSpeedMps * 0.75,
      'o chassi conserva a maior parte da velocidade horizontal no ar');
    assert.ok(natural.inFlight.angularVelocity.length() > 0.02,
      'a velocidade angular do chassi não é zerada ao perder contato');
    assert.equal(natural.landing.grounded, true);
    assert.ok(natural.landing.landingContactOrder.length > 0, 'o diagnóstico identifica quais rodas tocaram primeiro');
    assert.ok(natural.landing.wheels.some(wheel => wheel.inContact && wheel.contactPoint && wheel.contactPoint.y > 0),
      'a aterrissagem ocorre na pista física, não no piso de segurança');
    assert.ok(natural.landingStepDistance < 1.5, 'o pouso não teletransporta o chassi');
    assert.ok(Number.isFinite(natural.landing.position.y));

    assert.ok(assisted.strongestAssist > 0, 'a assistência atua por torque somente quando há aproximação de uma superfície');
    assert.ok(assisted.descending && assisted.descending.pitchRadians < 0,
      'o nariz inclina para baixo suavemente durante a descida antes do contato');
    assert.ok(assisted.descending.assistTargetPitch !== null && assisted.descending.assistTargetPitch < 0.05,
      'a assistência considera a superfície prevista sem forçar nariz baixo se o chassi já estiver inclinado');
    for (const result of [natural, assisted]) {
      assert.equal(result.recovered.grounded, true, 'a suspensão mantém contato após absorver o toque');
      assert.ok(Math.abs(result.recovered.pitchRadians) < 0.35 && Math.abs(result.recovered.rollRadians) < 0.35,
        'a carroceria recupera uma orientação controlável sem teletransporte');
      assert.ok(result.recovered.angularVelocity.length() < 5,
        `a rotação angular se estabiliza: ${result.recovered.angularVelocity.length()}`);
    }
  } finally {
    natural.lab.destroy();
    assisted.lab.destroy();
  }
});

test('passo físico fixo mantém trajetórias próximas em renders de 30, 60 e 120 Hz', async () => {
  await initializeRapierLab();
  const run = (renderHz: number, frames: number) => {
    const lab = new RapierVehicleLab();
    try {
      for (let frame = 0; frame < frames; frame += 1) lab.advance(1 / renderHz, { throttle: 0.65, brake: 0, steer: 0.1 }, false);
      return lab.snapshot();
    } finally { lab.destroy(); }
  };
  const at30 = run(30, 72), at60 = run(60, 144), at120 = run(120, 288);
  assert.ok(Math.abs(at30.position.distanceTo(at60.position)) < 0.08,
    `30/60 Hz: ${at30.position.distanceTo(at60.position)} m`);
  assert.ok(Math.abs(at60.position.distanceTo(at120.position)) < 0.08,
    `60/120 Hz: ${at60.position.distanceTo(at120.position)} m`);
  assert.equal(LAB_FIXED_DT, 1 / 60);
});

test('velocidades baixa, intermediária e alta produzem respostas diferentes e repetíveis na rampa', async () => {
  await initializeRapierLab();
  const low = new RapierVehicleLab();
  let lowPeakHeight = -Infinity;
  try {
    step(low, 90);
    const settledY = low.snapshot().position.y;
    low.chassis.setTranslation({ x: 0, y: settledY, z: 18 }, true);
    low.chassis.setLinvel({ x: 0, y: 0, z: 12 }, true);
    for (let frame = 0; frame < 180; frame += 1) {
      low.step(neutral, false);
      lowPeakHeight = Math.max(lowPeakHeight, low.snapshot().position.y);
    }
    const slow = low.snapshot();
    assert.equal(slow.takeoffCount, 0, 'aceleração baixa permite subir sem perder contato');
    assert.ok(slow.wheels.some(wheel => wheel.inContact), 'ao menos as rodas dianteiras apoiam a subida gradual');
    assert.ok(slow.position.z > DEFAULT_LAB_TRACK_CONFIG.approachEndZ,
      'a velocidade baixa chega à rampa sem provocar decolagem');
    assert.ok(lowPeakHeight > settledY + 0.4, `o chassi sobe pela rampa: altura máxima ${lowPeakHeight.toFixed(2)} m`);
  } finally { low.destroy(); }

  const runAtSpeed = (initialSpeedMps: number) => {
    const lab = new RapierVehicleLab();
    let takeoff: LabSnapshot | null = null, landing: LabSnapshot | null = null, takeoffFrame = -1, landingFrame = -1;
    let peakHeight = -Infinity;
    step(lab, 90);
    const startY = lab.snapshot().position.y;
    lab.chassis.setTranslation({ x: 0, y: startY, z: 18 }, true);
    lab.chassis.setLinvel({ x: 0, y: 0, z: initialSpeedMps }, true);
    for (let frame = 0; frame < 540; frame += 1) {
      const before = lab.snapshot();
      lab.step(neutral, true);
      const after = lab.snapshot();
      peakHeight = Math.max(peakHeight, after.position.y);
      if (!takeoff && before.grounded && after.airborne) { takeoff = after; takeoffFrame = frame; }
      else if (takeoff && after.grounded) { landing = after; landingFrame = frame; break; }
    }
    return { lab, takeoff, landing, takeoffFrame, landingFrame, peakHeight };
  };
  const medium = runAtSpeed(20), fast = runAtSpeed(22);
  try {
    for (const result of [medium, fast]) {
      assert.ok(result.takeoff, 'a rampa decola pela perda de contato das rodas');
      assert.ok(result.landing, 'a plataforma física recebe o veículo após o voo');
      assert.ok(result.landingFrame > result.takeoffFrame);
      assert.ok(result.takeoff!.takeoffTimeSeconds !== null);
      assert.ok(result.landing!.landingTimeSeconds !== null);
      assert.ok(result.landing!.lastAirTimeSeconds !== null);
      assert.ok(Math.abs(result.landing!.lastAirTimeSeconds!
        - (result.landing!.landingTimeSeconds! - result.takeoff!.takeoffTimeSeconds!)) < 1e-9,
      'os tempos de decolagem, voo e pouso são registrados no passo fixo');
      assert.ok(result.landing!.wheels.some(wheel => wheel.inContact && wheel.compressionM > 0),
        'a suspensão comprime em pelo menos uma roda no contato');
      assert.ok(result.landing!.position.y > 1.5, 'o veículo pousa na plataforma física, não no piso de segurança');
      assert.ok(result.landing!.peakPitchRadians * 180 / Math.PI < 24,
        `pitch de pico fica controlado durante o salto: ${(result.landing!.peakPitchRadians * 180 / Math.PI).toFixed(1)}°`);
      assert.ok(result.landing!.peakRollRadians * 180 / Math.PI < 12,
        `roll de pico fica controlado durante o salto: ${(result.landing!.peakRollRadians * 180 / Math.PI).toFixed(1)}°`);
      assert.ok(new THREE.Vector3(0, 1, 0).applyQuaternion(result.landing!.rotation).y > 0.8,
        'o veículo não passa de rodas para cima durante o salto');
    }
    const mediumAirTime = (medium.landingFrame - medium.takeoffFrame) * LAB_FIXED_DT;
    const fastAirTime = (fast.landingFrame - fast.takeoffFrame) * LAB_FIXED_DT;
    assert.ok(fast.takeoff!.horizontalSpeedMps > medium.takeoff!.horizontalSpeedMps);
    assert.ok(fast.peakHeight > medium.peakHeight, 'a velocidade alta amplia o arco físico');
    assert.ok(fast.landing!.position.z > medium.landing!.position.z, 'a velocidade alta amplia o deslocamento no ar');
    assert.ok(fastAirTime > mediumAirTime, 'o tempo de voo acompanha os resultados registrados');
  } finally {
    medium.lab.destroy();
    fast.lab.destroy();
  }
});

test('sinal de direção controla a curva para lados opostos sem inverter a orientação do chassi', async () => {
  await initializeRapierLab();
  const runSteering = (steer: number) => {
    const lab = new RapierVehicleLab();
    try {
      step(lab, 120);
      for (let frame = 0; frame < 60; frame += 1) lab.step({ throttle: 0.65, brake: 0, steer }, false);
      return lab.snapshot();
    } finally { lab.destroy(); }
  };
  const towardPositiveX = runSteering(1), towardNegativeX = runSteering(-1);
    assert.ok(towardPositiveX.position.x > 0.5, `steer +1 curva para +X: ${towardPositiveX.position.x}`);
    assert.ok(towardNegativeX.position.x < -0.5, `steer -1 curva para -X: ${towardNegativeX.position.x}`);
  assert.ok(towardPositiveX.wheels.filter(wheel => wheel.inContact).length >= 3);
  assert.ok(towardNegativeX.wheels.filter(wheel => wheel.inContact).length >= 3);
});

test('acelerar em curva aplica escorregamento de potência apenas ao eixo traseiro', async () => {
  await initializeRapierLab();
  const run = (throttle: number) => {
    const lab = new RapierVehicleLab();
    try {
      step(lab, 90);
      for (let frame = 0; frame < 45; frame += 1) {
        lab.step({ throttle, brake: 0, steer: 0.55 }, false);
      }
      return lab.snapshot();
    } finally { lab.destroy(); }
  };
  const coast = run(0), powered = run(1);
  assert.equal(coast.rearPowerSlip, 0, 'sem acelerador, não há power-oversteer');
  assert.ok(powered.rearPowerSlip > 0.01 && powered.rearPowerSlip <= 0.42,
    `acelerar ao virar reduz progressivamente a aderência traseira (${powered.rearPowerSlip.toFixed(3)})`);
  assert.ok(powered.horizontalSpeedMps > coast.horizontalSpeedMps,
    'a saída acelerada da curva conserva impulso maior que a curva em roda livre');
});

test('toques curtos de direção em reta não provocam guinada brusca e curva mantida continua responsiva', async () => {
  await initializeRapierLab();
  const run = (steer: number, heldFrames: number) => {
    const lab = new RapierVehicleLab();
    try {
      step(lab, 90);
      const y = lab.snapshot().position.y;
      lab.chassis.setTranslation({ x: 0, y, z: 8 }, true);
      lab.chassis.setLinvel({ x: 0, y: 0, z: 20 }, true);
      const start = lab.snapshot();
      const startYaw = Math.atan2(new THREE.Vector3(1, 0, 0).applyQuaternion(start.rotation).x,
        new THREE.Vector3(1, 0, 0).applyQuaternion(start.rotation).z);
      let peakYawChange = 0, peakAngularRate = 0, minUp = 1;
      for (let frame = 0; frame < 90; frame += 1) {
        lab.step({ throttle: 0.25, brake: 0, steer: frame < heldFrames ? steer : 0 }, true);
        const state = lab.snapshot();
        const forwardAxis = new THREE.Vector3(1, 0, 0).applyQuaternion(state.rotation);
        const currentYaw = Math.atan2(forwardAxis.x, forwardAxis.z);
        peakYawChange = Math.max(peakYawChange, Math.abs(currentYaw - startYaw));
        peakAngularRate = Math.max(peakAngularRate, Math.abs(state.yawRateRadPerSecond));
        minUp = Math.min(minUp, new THREE.Vector3(0, 1, 0).applyQuaternion(state.rotation).y);
      }
      return { lab, peakYawChange, peakAngularRate, minUp, x: lab.snapshot().position.x };
    } catch (error) { lab.destroy(); throw error; }
  };

  const oneFrameLeft = run(-1, 1), oneFrameRight = run(1, 1);
  const shortLeft = run(-1, 6), shortRight = run(1, 6);
  const sustainedLeft = run(-1, 60), sustainedRight = run(1, 60);
  try {
    for (const [name, result] of [['tap A', oneFrameLeft], ['tap D', oneFrameRight]] as const) {
      assert.ok(result.peakYawChange < 0.04, `${name}: yaw de toque < 2.3° (${(result.peakYawChange * 180 / Math.PI).toFixed(2)}°)`);
      assert.ok(Math.abs(result.x) < 0.2, `${name}: deslocamento lateral de um toque ${result.x.toFixed(2)} m`);
      assert.ok(result.minUp > 0.9, `${name}: sem capotamento`);
    }
    assert.ok(shortLeft.x < -0.5 && shortRight.x > 0.5,
      `A/D curtos têm resposta simétrica e menor: ${shortLeft.x.toFixed(2)}/${shortRight.x.toFixed(2)} m`);
     assert.ok(shortLeft.peakYawChange < 0.14 && shortRight.peakYawChange < 0.14,
       `um toque curto continua moderado: ${(shortLeft.peakYawChange * 180 / Math.PI).toFixed(1)}°/${(shortRight.peakYawChange * 180 / Math.PI).toFixed(1)}°`);
     assert.ok(sustainedLeft.x < -0.8 && sustainedRight.x > 0.8,
       `direção mantida muda a trajetória: ${sustainedLeft.x.toFixed(2)}/${sustainedRight.x.toFixed(2)} m`);
    assert.ok(sustainedLeft.minUp > 0.8 && sustainedRight.minUp > 0.8,
      'curva normal mantida não rola o chassi de teto para baixo');
  } finally {
    oneFrameLeft.lab.destroy(); oneFrameRight.lab.destroy();
    shortLeft.lab.destroy(); shortRight.lab.destroy();
    sustainedLeft.lab.destroy(); sustainedRight.lab.destroy();
  }
});

test('A/D na aproximação da rampa mudam a trajetória sem induzir spin', async () => {
  await initializeRapierLab();
  const runRampEntry = (steer: number) => {
    const lab = new RapierVehicleLab();
    for (let frame = 0; frame < 90; frame += 1) lab.step(neutral, false);
    const height = lab.snapshot().position.y;
    lab.chassis.setTranslation({ x: 0, y: height, z: 18 }, true);
    lab.chassis.setLinvel({ x: 0, y: 0, z: 8 }, true);
    for (let frame = 0; frame < 65; frame += 1) lab.step({ throttle: 0.35, brake: 0, steer }, true);
    return lab;
  };
  const left = runRampEntry(0.2), right = runRampEntry(-0.2);
  try {
    const leftState = left.snapshot(), rightState = right.snapshot();
    for (const [name, state] of [['A/entrada esquerda', leftState], ['D/entrada direita', rightState]] as const) {
      const upY = new THREE.Vector3(0, 1, 0).applyQuaternion(state.rotation).y;
      assert.ok(upY > 0.9, `${name}: rodas para baixo, upY=${upY.toFixed(3)}`);
    assert.ok(state.peakPitchRadians * 180 / Math.PI < 16,
        `${name}: pitch máximo ${(state.peakPitchRadians * 180 / Math.PI).toFixed(1)}°`);
      assert.ok(state.peakRollRadians * 180 / Math.PI < 10,
        `${name}: roll máximo ${(state.peakRollRadians * 180 / Math.PI).toFixed(1)}°`);
      assert.ok(state.peakAngularSpeedRadPerSecond < 4,
        `${name}: omega máximo ${state.peakAngularSpeedRadPerSecond.toFixed(2)} rad/s`);
      assert.ok(state.position.z > 24 && state.position.z < 32, `${name}: cruza a subida em trajetória finita`);
    }
    assert.ok(leftState.position.x > 0.5 && rightState.position.x < -0.5,
      `as entradas opostas geram deslocamentos opostos: ${leftState.position.x}/${rightState.position.x}`);
  } finally { left.destroy(); right.destroy(); }

  const runFirmEntry = (steer: number) => {
    const lab = new RapierVehicleLab();
    step(lab, 90);
    const height = lab.snapshot().position.y;
    lab.chassis.setTranslation({ x: 0, y: height, z: 18 }, true);
    lab.chassis.setLinvel({ x: 0, y: 0, z: 10 }, true);
    for (let frame = 0; frame < 65; frame += 1) lab.step({ throttle: 0.4, brake: 0, steer }, true);
    return lab;
  };
  const hardLeft = runFirmEntry(-0.5), hardRight = runFirmEntry(0.5);
  try {
    for (const [name, lab] of [['A forte', hardLeft], ['D forte', hardRight]] as const) {
      const state = lab.snapshot();
      assert.ok(new THREE.Vector3(0, 1, 0).applyQuaternion(state.rotation).y > 0.9,
        `${name}: capotamento ausente na entrada alinhada à borda da pista`);
      assert.ok(state.peakPitchRadians * 180 / Math.PI < 20);
      assert.ok(state.peakRollRadians * 180 / Math.PI < 12);
      assert.ok(state.peakAngularSpeedRadPerSecond < 4);
      assert.ok(state.supportContactCount > 0);
    }
    assert.ok(hardLeft.snapshot().position.x < -0.5 && hardRight.snapshot().position.x > 0.5,
      'direção forte ainda produz curva para o lado escolhido');
    assert.ok(Math.abs(hardLeft.snapshot().position.x) < LAB_TRACK_WIDTH / 2
      && Math.abs(hardRight.snapshot().position.x) < LAB_TRACK_WIDTH / 2,
    'a assistência de borda impede uma saída repentina da pista reta');
  } finally { hardLeft.destroy(); hardRight.destroy(); }
});

test('entrada levemente desalinhada na subida recupera a trajetória sem cambalhota', async () => {
  await initializeRapierLab();
  for (const initialYaw of [-0.12, 0.12]) {
    const lab = new RapierVehicleLab();
    try {
      step(lab, 90);
      const start = lab.snapshot();
      const rotation = start.rotation.clone().multiply(
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), initialYaw));
      const forward = new THREE.Vector3(1, 0, 0).applyQuaternion(rotation).multiplyScalar(8);
      lab.chassis.setRotation({ x: rotation.x, y: rotation.y, z: rotation.z, w: rotation.w }, true);
      lab.chassis.setTranslation({ x: initialYaw > 0 ? 0.9 : -0.9, y: start.position.y, z: 18 }, true);
      lab.chassis.setLinvel({ x: forward.x, y: 0, z: forward.z }, true);
      for (let frame = 0; frame < 70; frame += 1) lab.step({ throttle: 0.25, brake: 0, steer: 0 }, true);
      const state = lab.snapshot();
      const upY = new THREE.Vector3(0, 1, 0).applyQuaternion(state.rotation).y;
      assert.ok(upY > 0.9, `entrada ${initialYaw}: orientação não vira de teto para baixo`);
      assert.ok(state.peakPitchRadians * 180 / Math.PI < 20);
      assert.ok(state.peakRollRadians * 180 / Math.PI < 8);
      assert.ok(state.peakAngularSpeedRadPerSecond < 3);
      assert.ok(state.position.z > 25, 'o carro continua cruzando a subida');
    } finally { lab.destroy(); }
  }
});

test('curva arcade mantida na subida não leva o carro para fora da pista nem o faz girar', async () => {
  await initializeRapierLab();
  const runs = [-0.35, 0.35].map(steer => {
    const lab = new RapierVehicleLab();
    step(lab, 90);
    const height = lab.snapshot().position.y;
    lab.chassis.setTranslation({ x: 0, y: height, z: 18 }, true);
    lab.chassis.setLinvel({ x: 0, y: 0, z: 18 }, true);
    let minimumRoadMargin = Infinity;
    let inputToEdgeScale = 1;
    for (let frame = 0; frame < 60; frame += 1) {
      lab.step({ throttle: 0.4, brake: 0, steer }, true);
      const state = lab.snapshot();
      minimumRoadMargin = Math.min(minimumRoadMargin,
        LAB_TRACK_WIDTH / 2 - LAB_TUNING.chassisHalfExtents.z - Math.abs(state.position.x));
      inputToEdgeScale = Math.min(inputToEdgeScale, state.steeringEdgeScale);
    }
    return { lab, steer, minimumRoadMargin, inputToEdgeScale };
  });
  try {
    for (const { lab, steer, minimumRoadMargin, inputToEdgeScale } of runs) {
      const state = lab.snapshot();
      const upY = new THREE.Vector3(0, 1, 0).applyQuaternion(state.rotation).y;
      assert.ok(minimumRoadMargin >= 0,
        `steer ${steer}: assistência de borda manteve a carroceria dentro da reta (${minimumRoadMargin.toFixed(2)} m)`);
      assert.ok(inputToEdgeScale < 1, 'a direção é suavizada quando o carro aproxima a borda exterior');
      assert.ok(upY > 0.9, 'o carro não gira nem capota ao virar durante a subida');
       assert.ok(state.supportContactCount > 0 || state.takeoffCount > 0 || state.airborne,
         'a transição da rampa é registrada como apoio, decolagem ou voo controlado');
      assert.ok(state.peakPitchRadians * 180 / Math.PI < 18);
      assert.ok(state.peakRollRadians * 180 / Math.PI < 10);
      assert.ok(state.peakAngularSpeedRadPerSecond < 4);
      assert.ok(state.position.z > 25, 'a curva mantém avanço controlável');
    }
    assert.ok(runs[0]!.lab.snapshot().position.x * runs[0]!.steer > 0);
    assert.ok(runs[1]!.lab.snapshot().position.x * runs[1]!.steer > 0);
  } finally { runs.forEach(({ lab }) => lab.destroy()); }
});

test('eixo dianteiro sobe antes e o traseiro recupera apoio sem levantar a cauda', async () => {
  await initializeRapierLab();
  const lab = new RapierVehicleLab();
  try {
    step(lab, 90);
    const startY = lab.snapshot().position.y;
    lab.chassis.setTranslation({ x: 0, y: startY, z: 18 }, true);
    lab.chassis.setLinvel({ x: 0, y: 0, z: 8 }, true);
    let frontSpringReacted = false, rearSpringReacted = false, bothAxlesSupported = false;
    let peakTailLiftProxy = 0;
    for (let frame = 0; frame < 90; frame += 1) {
      lab.step({ throttle: 0.35, brake: 0, steer: 0 }, true);
      const state = lab.snapshot();
      frontSpringReacted ||= state.wheels.slice(0, 2)
        .some(wheel => wheel.inContact && wheel.suspensionForceN > 0);
      rearSpringReacted ||= state.wheels.slice(2)
        .some(wheel => wheel.inContact && wheel.suspensionForceN > 0);
      bothAxlesSupported ||= state.wheels.slice(0, 2).some(wheel => wheel.inContact)
        && state.wheels.slice(2).some(wheel => wheel.inContact);
      // Positive local pitch means the front rises and rear drops; a strongly
      // negative pitch is the reported tail-up/nose-dive failure mode.
      peakTailLiftProxy = Math.max(peakTailLiftProxy, -state.pitchRadians);
      const upY = new THREE.Vector3(0, 1, 0).applyQuaternion(state.rotation).y;
      assert.ok(upY > 0.9, 'as rodas nunca ficam para cima na transição da subida');
    }
    const final = lab.snapshot();
    assert.ok(frontSpringReacted && rearSpringReacted, 'os dois eixos aplicam mola real no trecho de subida');
    assert.ok(bothAxlesSupported, 'a traseira volta a apoiar junto da dianteira antes da saída da rampa');
    assert.ok(peakTailLiftProxy < 0.25,
      `nose-dive/tail-lift máximo ${ (peakTailLiftProxy * 180 / Math.PI).toFixed(1) }°`);
    assert.equal(final.takeoffCount, 0, 'velocidade lenta não aciona um salto artificial');
  } finally { lab.destroy(); }
});

test('A/D no ar corrige trajetória sem girar o chassi nem perder o avanço do salto', async () => {
  await initializeRapierLab();
  const fly = (steer: number) => {
    const lab = new RapierVehicleLab();
    step(lab, 90);
    const startY = lab.snapshot().position.y;
    lab.chassis.setTranslation({ x: 0, y: startY, z: 18 }, true);
    lab.chassis.setLinvel({ x: 0, y: 0, z: 22 }, true);
    let takeoff: (LabSnapshot & { frame: number }) | null = null, landing: LabSnapshot | null = null;
    let yawAfterInput = 0, peakPitch = 0, peakRoll = 0, peakYawRate = 0;
    const yaw = (state: LabSnapshot) => {
      const forward = new THREE.Vector3(1, 0, 0).applyQuaternion(state.rotation);
      return Math.atan2(forward.x, forward.z);
    };
    for (let frame = 0; frame < 300; frame += 1) {
      const before = lab.snapshot();
      const controls = !takeoff ? neutral : { throttle: 0, brake: 0, steer: frame - takeoff.frame < 12 ? steer : 0 };
      lab.step(controls, true);
      const after = lab.snapshot();
      if (!takeoff && before.grounded && after.airborne) takeoff = { ...after, frame };
      if (takeoff && after.airborne) {
        peakPitch = Math.max(peakPitch, Math.abs(after.pitchRadians));
        peakRoll = Math.max(peakRoll, Math.abs(after.rollRadians));
        peakYawRate = Math.max(peakYawRate, Math.abs(after.yawRateRadPerSecond));
        if (frame === takeoff.frame + 12) yawAfterInput = yaw(after);
      } else if (takeoff && after.grounded) { landing = after; break; }
    }
    return { lab, takeoff, landing, yawAfterInput, peakPitch, peakRoll, peakYawRate };
  };
  const left = fly(-0.5), neutralAir = fly(0), right = fly(0.5);
  try {
    for (const result of [left, neutralAir, right]) {
      assert.ok(result.takeoff && result.landing, 'o carro completa o salto antes de comparar o controle aéreo');
      assert.ok(result.peakPitch < 0.4 && result.peakRoll < 0.25,
        `o voo não acumula pitch/roll excessivos: ${result.peakPitch}/${result.peakRoll} rad`);
      assert.ok(result.peakYawRate < 2.6, `yaw no ar continua amortecido: ${result.peakYawRate} rad/s`);
    }
    assert.ok(Math.abs(left.yawAfterInput - neutralAir.yawAfterInput) < 0.02,
      'A no ar ajusta a trajetória sem virar o chassi de lado');
    assert.ok(Math.abs(right.yawAfterInput - neutralAir.yawAfterInput) < 0.02,
      'D no ar ajusta a trajetória sem virar o chassi de lado');
    assert.ok(left.landing!.position.x < neutralAir.landing!.position.x - 0.02,
      'A no ar corrige suavemente a trajetória para a esquerda');
    assert.ok(right.landing!.position.x > neutralAir.landing!.position.x + 0.02,
      'D no ar corrige suavemente a trajetória para a direita');
    assert.ok(Math.abs(left.landing!.position.z - neutralAir.landing!.position.z) < 0.1
      && Math.abs(right.landing!.position.z - neutralAir.landing!.position.z) < 0.1,
    'a direção aérea não destrói o avanço principal do salto');
  } finally { left.lab.destroy(); neutralAir.lab.destroy(); right.lab.destroy(); }
});

test('A/D mantidos durante o primeiro salto não descontrolam o carro por 2 s após o pouso', async () => {
  await initializeRapierLab();
  const run = (steerDirection: -1 | 1) => {
    const lab = new RapierVehicleLab();
    try {
      step(lab, 90);
      const startY = lab.snapshot().position.y;
      lab.chassis.setTranslation({ x: 0, y: startY, z: 18 }, true);
      lab.chassis.setLinvel({ x: 0, y: 0, z: 22 }, true);

      let takeoffFrame = -1;
      let landingFrame = -1;
      let peakHeight = -Infinity;
      let landingLateralSpeed = 0;
      let maximumLateralOffset = 0;
      let minimumUpY = 1;
      let maximumAngularSpeed = 0;
      let recovered: LabSnapshot | null = null;

      for (let frame = 0; frame < 360; frame += 1) {
        const before = lab.snapshot();
        const steer = takeoffFrame >= 0 && landingFrame < 0 ? steerDirection : 0;
        lab.step({ throttle: 0, brake: 0, steer }, true);
        const after = lab.snapshot();
        peakHeight = Math.max(peakHeight, after.position.y);

        if (takeoffFrame < 0 && before.grounded && after.airborne) takeoffFrame = frame;
        if (takeoffFrame >= 0 && landingFrame < 0 && after.grounded) {
          landingFrame = frame;
          landingLateralSpeed = Math.abs(after.linearVelocity.x);
        }
        if (landingFrame >= 0) {
          maximumLateralOffset = Math.max(maximumLateralOffset, Math.abs(after.position.x));
          minimumUpY = Math.min(minimumUpY, new THREE.Vector3(0, 1, 0).applyQuaternion(after.rotation).y);
          maximumAngularSpeed = Math.max(maximumAngularSpeed, after.angularVelocity.length());
          if (frame - landingFrame === 120) {
            recovered = after;
            break;
          }
        }
      }

      return { lab, takeoffFrame, landingFrame, peakHeight, landingLateralSpeed,
        maximumLateralOffset, minimumUpY, maximumAngularSpeed, recovered };
    } catch (error) {
      lab.destroy();
      throw error;
    }
  };

  const left = run(-1);
  const right = run(1);
  try {
    for (const [name, result] of [['A', left], ['D', right]] as const) {
      assert.ok(result.takeoffFrame >= 0, `${name}: a rampa produz voo físico`);
      assert.ok(result.landingFrame > result.takeoffFrame, `${name}: o veículo aterrissa na plataforma`);
      assert.ok(result.peakHeight > 2.9, `${name}: o salto mantém o arco vertical`);
      assert.ok(result.landingLateralSpeed < 3,
        `${name}: o toque não chega com impulso lateral extremo (${result.landingLateralSpeed.toFixed(2)} m/s)`);
      assert.ok(result.maximumLateralOffset < LAB_TRACK_WIDTH / 2 - LAB_TUNING.chassisHalfExtents.z,
        `${name}: o carro permanece dentro da pista após o pouso (${result.maximumLateralOffset.toFixed(2)} m)`);
      assert.ok(result.minimumUpY > 0.8, `${name}: o chassi não capota`);
      assert.ok(result.maximumAngularSpeed < 5,
        `${name}: a velocidade angular pós-pouso continua controlada (${result.maximumAngularSpeed.toFixed(2)} rad/s)`);
      assert.ok(result.recovered?.grounded, `${name}: rodas mantêm contato por 2 s após o pouso`);
      assert.equal(result.recovered.takeoffCount, 1, `${name}: não ocorre uma segunda decolagem descontrolada`);
      assert.equal(result.recovered.landingCount, 1, `${name}: há uma aterrissagem, sem ricochete artificial`);
      assert.ok(Math.abs(result.recovered.position.x) <= LAB_TRACK_WIDTH / 2,
        `${name}: a trajetória de voo termina dentro da contenção lateral`);
    }
    assert.ok(left.recovered!.position.x * right.recovered!.position.x < 0,
      'A e D corrigem a trajetória para lados opostos sem girar o chassi');
  } finally { left.lab.destroy(); right.lab.destroy(); }
});

test('A/D no ar e após o pouso centralizam ao soltar sem deixar guinada residual', async () => {
  await initializeRapierLab();
  for (const [name, steer] of [['A', -1], ['D', 1]] as const) {
    const lab = new RapierVehicleLab();
    try {
      step(lab, 90);
      const startY = lab.snapshot().position.y;
      lab.chassis.setTranslation({ x: 0, y: startY, z: 18 }, true);
      lab.chassis.setLinvel({ x: 0, y: 0, z: 22 }, true);

      let takeoffFrame = -1;
      let landingFrame = -1;
      let airSteeringObserved = false;
      let postLandingTurnObserved = false;
      let recoveryObserved = false;
      let landingX = 0;
      let turnedX = 0;
      for (let frame = 0; frame < 240; frame += 1) {
        const before = lab.snapshot();
        const airborneFrames = takeoffFrame < 0 ? -1 : frame - takeoffFrame;
        const steeringInAir = before.airborne && airborneFrames >= 8 && airborneFrames < 20;
        const steeringOnGround = landingFrame >= 0 && frame - landingFrame < 12;
        const steerCommand = steeringInAir || steeringOnGround ? steer : 0;
        lab.step({ throttle: 0, brake: 0, steer: steerCommand }, true);
        const after = lab.snapshot();

        if (takeoffFrame < 0 && before.grounded && after.airborne) takeoffFrame = frame;
        if (steeringInAir) airSteeringObserved ||= Math.abs(after.steeringApplied) > 0.05;
        if (landingFrame < 0 && takeoffFrame >= 0 && before.airborne && after.grounded) {
          landingFrame = frame;
          landingX = after.position.x;
        }
        if (landingFrame >= 0 && frame - landingFrame === 12) {
          turnedX = after.position.x;
          postLandingTurnObserved = Math.abs(after.steeringApplied) > 0.05;
        }
        if (landingFrame >= 0 && frame - landingFrame === 120) {
          recoveryObserved = true;
          const forwardAxis = new THREE.Vector3(1, 0, 0).applyQuaternion(after.rotation);
          const heading = Math.atan2(forwardAxis.x, forwardAxis.z);
          assert.ok(airSteeringObserved, `${name}: A/D altera a trajetória durante o voo`);
          assert.ok(postLandingTurnObserved, `${name}: A/D volta a responder com contato das rodas`);
          assert.ok((turnedX - landingX) * steer > 0.01,
            `${name}: a curva pós-pouso responde na direção pressionada`);
          assert.ok(Math.abs(after.steeringApplied) < 0.01, `${name}: o esterçamento retorna ao centro`);
          // A edge guard may add a small counter-steer near the road margin;
          // the driver's steering input must not remain latched on either wheel.
          assert.ok(Math.abs(lab.vehicle.wheelSteering(0) ?? 0) < 0.08
            && Math.abs(lab.vehicle.wheelSteering(1) ?? 0) < 0.08,
          `${name}: as rodas dianteiras não mantêm o esterçamento forte após soltar`);
          assert.ok(Math.abs(after.yawRateRadPerSecond) < 0.2,
            `${name}: a guinada residual é amortecida (${after.yawRateRadPerSecond.toFixed(2)} rad/s)`);
          assert.ok(Math.abs(heading) < 0.2, `${name}: o carro volta a apontar para a reta (${heading.toFixed(2)} rad)`);
          assert.ok(after.grounded, `${name}: mantém contato físico com a pista`);
          break;
        }
      }
      assert.ok(takeoffFrame >= 0, `${name}: o veículo decola`);
      assert.ok(landingFrame > takeoffFrame, `${name}: o veículo aterrissa`);
      assert.ok(postLandingTurnObserved, `${name}: houve janela para virar e soltar após o pouso`);
      assert.ok(recoveryObserved, `${name}: a simulação observou 2 s após a curva e a soltura`);
    } finally { lab.destroy(); }
  }
});

test('curva após o primeiro pouso termina em deslizamento controlado pela barreira lateral', async () => {
  await initializeRapierLab();
  const lab = new RapierVehicleLab();
  try {
    step(lab, 90);
    const startY = lab.snapshot().position.y;
    lab.chassis.setTranslation({ x: 0, y: startY, z: 18 }, true);
    lab.chassis.setLinvel({ x: 0, y: 0, z: 22 }, true);

    let takeoff = false;
    let landed = false;
    let landing: LabSnapshot | null = null;
    for (let frame = 0; frame < 120; frame += 1) {
      const before = lab.snapshot();
      lab.step(neutral, true);
      const after = lab.snapshot();
      takeoff ||= before.grounded && after.airborne;
      if (takeoff && after.grounded) {
        landed = true;
        landing = after;
        break;
      }
    }
    assert.ok(landed && landing, 'a rampa e a plataforma produzem decolagem e pouso reais');

    let maximumAngularSpeed = landing.angularVelocity.length();
    let minimumUpY = 1;
    let maximumHeight = landing.position.y;
    let maximumSidewaysTravel = 0;
    let barrierContactObserved = false;
    let previousXSpeed = Math.abs(landing.linearVelocity.x);
    for (let frame = 0; frame < 120; frame += 1) {
      lab.step({ throttle: 0.2, brake: 0, steer: 1 }, true);
      const state = lab.snapshot();
      maximumAngularSpeed = Math.max(maximumAngularSpeed, state.angularVelocity.length());
      minimumUpY = Math.min(minimumUpY, new THREE.Vector3(0, 1, 0).applyQuaternion(state.rotation).y);
      maximumHeight = Math.max(maximumHeight, state.position.y);
      maximumSidewaysTravel = Math.max(maximumSidewaysTravel, Math.abs(state.position.x));
      barrierContactObserved ||= Math.abs(state.position.x) >= LAB_TRACK_WIDTH / 2 - 2
        && Math.abs(state.linearVelocity.x) < previousXSpeed;
      previousXSpeed = Math.abs(state.linearVelocity.x);
    }
    assert.ok(maximumSidewaysTravel <= LAB_TRACK_WIDTH / 2 + 0.5,
      `o carro não atravessa o limite lateral da pista (${maximumSidewaysTravel.toFixed(2)} m)`);
    assert.ok(barrierContactObserved, 'a curva alcança a barreira e o impacto reduz a velocidade lateral');
    assert.ok(minimumUpY > 0.75, `o impacto não capota o carro (upY=${minimumUpY.toFixed(2)})`);
    assert.ok(maximumHeight < landing.position.y + 0.8,
      `a barreira não lança o carro para cima (${(maximumHeight - landing.position.y).toFixed(2)} m)`);
    assert.ok(maximumAngularSpeed < 6,
      `o carro permanece controlável após a curva e o impacto (${maximumAngularSpeed.toFixed(2)} rad/s)`);
    assert.ok(lab.getBarrierColliderHandles().size > 100,
      'as barreiras são formadas por segmentos físicos contínuos em toda a pista');
  } finally { lab.destroy(); }
});

test('reiniciar após a rampa zera velocidade, forças e comandos armazenados nas rodas', async () => {
  await initializeRapierLab();
  const lab = new RapierVehicleLab();
  try {
    step(lab, 180, forward);
    const moving = lab.snapshot();
    assert.ok(moving.horizontalSpeedMps > 5, 'o cenário chega ao reset com movimento real');

    lab.reset();
    const reset = lab.snapshot();
    assert.ok(reset.position.distanceTo(new THREE.Vector3(0, 0.9, 6)) < 1e-5);
    assert.ok(reset.linearVelocity.length() < 1e-6);
    assert.ok(reset.angularVelocity.length() < 1e-6);
    for (let wheel = 0; wheel < 4; wheel += 1) {
      assert.equal(lab.vehicle.wheelEngineForce(wheel), 0, `roda ${wheel}: sem força motriz residual`);
      assert.equal(lab.vehicle.wheelSteering(wheel), 0, `roda ${wheel}: direção centralizada`);
      assert.equal(lab.vehicle.wheelBrake(wheel), 0, `roda ${wheel}: sem freio residual`);
    }

    const settled = step(lab, 30, neutral);
    assert.ok(settled.horizontalSpeedMps < 0.2,
      `o veículo não deve acelerar sem comando após reiniciar (${settled.horizontalSpeedMps.toFixed(3)} m/s)`);
    assert.ok(settled.wheels.every(wheel => wheel.inContact), 'as quatro rodas recuperam apoio na largada');
  } finally { lab.destroy(); }
});

test('barreira lateral acompanha a rampa e contém o carro sem ressalto vertical', async () => {
  await initializeRapierLab();
  const lab = new RapierVehicleLab();
  try {
    step(lab, 90);
    const { approachEndZ, rampEndZ, rampHeight } = lab.trackConfig;
    const z = (approachEndZ + rampEndZ) / 2;
    const progress = (z - approachEndZ) / (rampEndZ - approachEndZ);
    const roadHeight = rampHeight * progress ** 2 * (3 - 2 * progress);
    const startY = roadHeight + lab.snapshot().position.y;
    lab.chassis.setTranslation({ x: 3.5, y: startY, z }, true);
    lab.chassis.setLinvel({ x: 8, y: 0, z: 0 }, true);

    let maximumLateralOffset = 0;
    let maximumHeight = startY;
    let minimumUpY = 1;
    let maximumAngularSpeed = 0;
    for (let frame = 0; frame < 60; frame += 1) {
      lab.step(neutral, true);
      const state = lab.snapshot();
      maximumLateralOffset = Math.max(maximumLateralOffset, Math.abs(state.position.x));
      maximumHeight = Math.max(maximumHeight, state.position.y);
      minimumUpY = Math.min(minimumUpY, new THREE.Vector3(0, 1, 0).applyQuaternion(state.rotation).y);
      maximumAngularSpeed = Math.max(maximumAngularSpeed, state.angularVelocity.length());
    }
    const recovered = lab.snapshot();
    assert.ok(lab.getBarrierColliderHandles().size > 100,
      'a pista, incluindo os segmentos elevados, tem colliders dedicados de barreira');
    const barrierAcrossJumpGap = [...lab.getBarrierColliderHandles()].some(handle => {
      const position = lab.world.getCollider(handle).translation();
      return Math.abs(position.x) > LAB_TRACK_WIDTH / 2
        && Math.abs(position.x) < LAB_TRACK_WIDTH / 2 + 0.5
        && Math.abs(position.z - (lab.trackConfig.launchLipEndZ + lab.trackConfig.landingStartZ) / 2) < 0.1;
    });
    assert.ok(barrierAcrossJumpGap, 'as barreiras também conectam as bordas do lábio e da plataforma de pouso');
    assert.ok(maximumLateralOffset < LAB_TRACK_WIDTH / 2,
      `o carro não atravessa a borda da rampa (${maximumLateralOffset.toFixed(2)} m)`);
    assert.ok(Math.abs(recovered.linearVelocity.x) < 1,
      `o impacto absorve a velocidade contra a lateral (${recovered.linearVelocity.x.toFixed(2)} m/s)`);
    assert.ok(maximumHeight < startY + 0.6,
      `o impacto não dá impulso vertical exagerado (${(maximumHeight - startY).toFixed(2)} m)`);
    assert.ok(minimumUpY > 0.85, `o veículo desliza sem capotar (upY=${minimumUpY.toFixed(2)})`);
    assert.ok(maximumAngularSpeed < 4,
      `a velocidade angular após o contato com a rampa permanece controlada (${maximumAngularSpeed.toFixed(2)} rad/s)`);
    assert.ok(recovered.grounded, 'a suspensão mantém apoio após o impacto na barreira');

    const beforeEscape = recovered.position.x;
    for (let frame = 0; frame < 60; frame += 1) {
      lab.step({ throttle: 1, brake: 0, steer: -1 }, true);
    }
    const escaped = lab.snapshot();
    assert.ok(escaped.position.x < beforeEscape - 0.5,
      `o volante para dentro e o acelerador liberam o carro da lateral (${beforeEscape.toFixed(2)} → ${escaped.position.x.toFixed(2)} m)`);
    assert.ok(escaped.position.z > recovered.position.z + 2,
      'o veículo volta a avançar depois de se afastar da barreira');
  } finally { lab.destroy(); }
});

test('salto próximo à borda não recebe força lateral oculta que inverta o controle A/D', async () => {
  await initializeRapierLab();
  const run = (airSteer: -1 | 0 | 1) => {
    const lab = new RapierVehicleLab();
    try {
      step(lab, 90);
      const settledY = lab.snapshot().position.y;
      lab.chassis.setTranslation({ x: 3, y: settledY, z: 18 }, true);
      lab.chassis.setLinvel({ x: 0, y: 0, z: 22 }, true);

      let takeoffFrame = -1;
      let velocityAfterAirInput = 0;
      let xAfterAirInput = 0;
      let landing: LabSnapshot | null = null;
      let maximumAngularSpeed = 0;
      for (let frame = 0; frame < 120; frame += 1) {
        const before = lab.snapshot();
        const inAirAfterTakeoff = takeoffFrame >= 0 && frame - takeoffFrame < 8;
        lab.step({ throttle: 0, brake: 0, steer: inAirAfterTakeoff ? airSteer : 0 }, true);
        const state = lab.snapshot();
        if (takeoffFrame < 0 && before.grounded && state.airborne) takeoffFrame = frame;
        if (takeoffFrame >= 0 && frame - takeoffFrame === 7) {
          velocityAfterAirInput = state.linearVelocity.x;
          xAfterAirInput = state.position.x;
        }
        maximumAngularSpeed = Math.max(maximumAngularSpeed, state.angularVelocity.length());
        if (takeoffFrame >= 0 && state.grounded && frame > takeoffFrame) {
          landing = state;
          break;
        }
      }
      return { lab, airSteer, takeoffFrame, velocityAfterAirInput, xAfterAirInput, landing, maximumAngularSpeed };
    } catch (error) {
      lab.destroy();
      throw error;
    }
  };

  const neutralAir = run(0);
  const steerTowardEdge = run(1);
  const steerTowardCenter = run(-1);
  try {
    for (const [name, result] of [['neutro', neutralAir], ['A/D para fora', steerTowardEdge],
      ['A/D para dentro', steerTowardCenter]] as const) {
      assert.ok(result.takeoffFrame >= 0 && result.landing,
        `${name}: o veículo completa voo e aterrissagem físicos`);
      if (result.airSteer === 0) {
        assert.ok(Math.abs(result.velocityAfterAirInput) < 0.35,
          `neutro: sem aceleração lateral invisível (${result.velocityAfterAirInput.toFixed(2)} m/s)`);
      }
      assert.ok(result.maximumAngularSpeed < 5,
        `${name}: contato não amplifica rotação (${result.maximumAngularSpeed.toFixed(2)} rad/s)`);
      assert.ok(Math.abs(result.landing.position.x) < LAB_TRACK_WIDTH / 2,
        `${name}: pousa dentro da pista física`);
    }
    assert.ok(steerTowardEdge.velocityAfterAirInput > neutralAir.velocityAfterAirInput + 0.03,
      'A/D para a borda acelera nessa direção em vez de ser invertido por uma força de centro');
    assert.ok(steerTowardCenter.velocityAfterAirInput < neutralAir.velocityAfterAirInput - 0.03,
      'A/D para o centro produz resposta oposta e controlável');
    assert.ok(Math.abs(neutralAir.xAfterAirInput - 3) < 0.1,
      `a trajetória neutra conserva o alinhamento lateral (${neutralAir.xAfterAirInput.toFixed(2)} m)`);
  } finally {
    neutralAir.lab.destroy();
    steerTowardEdge.lab.destroy();
    steerTowardCenter.lab.destroy();
  }
});

test('cenários arcade reproduzíveis mantêm o chassi em pé em curva, frenagem e rampas', async () => {
  await initializeRapierLab();
  const assertUpright = (name: string, lab: RapierVehicleLab, limits = { pitch: 28, roll: 22, angular: 10 }) => {
    const state = lab.snapshot();
    const upY = new THREE.Vector3(0, 1, 0).applyQuaternion(state.rotation).y;
    assert.ok(upY > 0.75, `${name}: chassi segue com as rodas para baixo (upY=${upY.toFixed(3)})`);
    assert.ok(state.peakPitchRadians * 180 / Math.PI < limits.pitch,
      `${name}: pitch de pico ${ (state.peakPitchRadians * 180 / Math.PI).toFixed(1) }°`);
    assert.ok(state.peakRollRadians * 180 / Math.PI < limits.roll,
      `${name}: roll de pico ${ (state.peakRollRadians * 180 / Math.PI).toFixed(1) }°`);
    assert.ok(state.peakAngularSpeedRadPerSecond < limits.angular,
      `${name}: velocidade angular de pico ${state.peakAngularSpeedRadPerSecond.toFixed(2)} rad/s`);
    assert.ok(Number.isFinite(state.peakSuspensionForceN)
      && Number.isFinite(state.peakForwardImpulse) && Number.isFinite(state.peakSideImpulse),
    `${name}: telemetria de molas e impulsos registrada`);
    return state;
  };

  const runCurve = (steer: number) => {
    const lab = new RapierVehicleLab();
    step(lab, 90);
    for (let frame = 0; frame < 100; frame += 1) lab.step({ throttle: 0.45, brake: 0, steer }, true);
    return lab;
  };
  const left = runCurve(-0.2), right = runCurve(0.2);
  try {
    const leftState = assertUpright('curva esquerda', left, { pitch: 8, roll: 8, angular: 2 });
    const rightState = assertUpright('curva direita', right, { pitch: 8, roll: 8, angular: 2 });
    assert.ok(leftState.position.x < -0.2 && rightState.position.x > 0.2);
    assert.equal(leftState.wheels.filter(wheel => wheel.inContact).length, 4);
    assert.equal(rightState.wheels.filter(wheel => wheel.inContact).length, 4);
  } finally { left.destroy(); right.destroy(); }

  const braking = new RapierVehicleLab();
  try {
    step(braking, 90);
    const accelerated = step(braking, 60, forward);
    let peakPitch = 0;
    for (let frame = 0; frame < 45; frame += 1) {
      braking.step({ throttle: 0, brake: 1, steer: 0 }, true);
      peakPitch = Math.max(peakPitch, Math.abs(braking.snapshot().pitchRadians));
    }
    const stopped = assertUpright('frenagem progressiva', braking, { pitch: 18, roll: 8, angular: 4 });
    assert.ok(stopped.horizontalSpeedMps < accelerated.horizontalSpeedMps * 0.8,
      `a frenagem reduz a velocidade ${accelerated.horizontalSpeedMps.toFixed(2)} → ${stopped.horizontalSpeedMps.toFixed(2)} m/s`);
    assert.ok(peakPitch < 18, `a frenagem não lança o nariz: ${ (peakPitch * 180 / Math.PI).toFixed(1) }°`);
    assert.ok(stopped.wheels.filter(wheel => wheel.inContact).length >= 2,
      'ao menos um eixo mantém contato durante e depois da frenagem');
  } finally { braking.destroy(); }

  const slowRamp = new RapierVehicleLab();
  try {
    step(slowRamp, 90);
    const rampStartY = slowRamp.snapshot().position.y;
    slowRamp.chassis.setTranslation({ x: 0, y: rampStartY, z: 18 }, true);
    slowRamp.chassis.setLinvel({ x: 0, y: 0, z: 12 }, true);
    let observedPartialSupport = false;
    for (let frame = 0; frame < 180; frame += 1) {
      slowRamp.step(neutral, true);
      observedPartialSupport ||= slowRamp.snapshot().uprightMode === 'partial';
    }
    const slow = assertUpright('rampa lenta', slowRamp, { pitch: 20, roll: 8, angular: 4 });
    assert.equal(slow.takeoffCount, 0, 'a baixa velocidade acompanha a subida sem um salto obrigatório');
    assert.ok(slow.position.z > DEFAULT_LAB_TRACK_CONFIG.approachEndZ);
    assert.ok(slow.supportContactCount >= 2, 'ao menos um eixo continua apoiado na aproximação lenta');
    assert.ok(observedPartialSupport, 'o apoio de um eixo é exposto como parcial durante a subida');
    assert.notEqual(slow.uprightMode, 'air', 'rodas em contato não são tratadas como voo completo');
  } finally { slowRamp.destroy(); }

  const descent = new RapierVehicleLab();
  try {
    const initial = descent.chassis.rotation();
    const rotation = new THREE.Quaternion(initial.x, initial.y, initial.z, initial.w)
      .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -0.18));
    // Isolated test setup on the raised landing platform; the downhill run and
    // all wheel support afterward are simulated normally by Rapier.
    descent.chassis.setRotation({ x: rotation.x, y: rotation.y, z: rotation.z, w: rotation.w }, true);
    descent.chassis.setTranslation({ x: 0, y: 2.7, z: 96 }, true);
    for (let frame = 0; frame < 60; frame += 1) descent.step(neutral, true);
    const settled = descent.snapshot();
    assert.equal(settled.wheels.filter(wheel => wheel.inContact).length, 4);
    const descentStartZ = settled.position.z;
    for (let frame = 0; frame < 300 && descent.snapshot().position.z < DEFAULT_LAB_TRACK_CONFIG.descentEndZ; frame += 1) {
      descent.step({ throttle: 0.35, brake: 0, steer: 0 }, true);
    }
    const downhill = assertUpright('descida progressiva', descent, { pitch: 23, roll: 12, angular: 4 });
    assert.ok(downhill.position.z >= DEFAULT_LAB_TRACK_CONFIG.descentEndZ);
    assert.ok(downhill.position.z > descentStartZ + 4.5, 'o carro percorre a descida, sem reposicionamento');
    assert.ok(downhill.supportContactCount >= 2, 'ao menos um eixo continua apoiado durante a descida');
    assert.notEqual(downhill.uprightMode, 'air', 'apoio parcial na descida não é tratado como voo completo');
    assert.ok(downhill.linearVelocity.z > 0, 'a descida conserva deslocamento para a frente');
  } finally { descent.destroy(); }

  for (const [name, speed] of [['salto intermediário', 20], ['salto rápido', 22]] as const) {
    const run = await runFirstJumpWithMetrics(speed);
    try {
      assert.ok(run.takeoff && run.landing, `${name}: decolagem e aterrissagem físicas registradas`);
      assertUpright(name, run.lab, { pitch: 25, roll: 12, angular: 8 });
      assert.ok(run.takeoff.verticalSpeedMps > 0 && run.landing.lastAirTimeSeconds! > 0);
      assert.ok(run.landing.position.y > 1.5, `${name}: pouso na plataforma real, y=${run.landing.position.y.toFixed(2)} m`);
      assert.ok(run.landing.wheels.some(wheel => wheel.inContact && wheel.compressionM > 0),
        `${name}: suspensão comprime ao aterrissar`);
      assert.ok(run.peakHeight > run.takeoff.position.y, `${name}: gravidade forma um arco de voo`);
    } finally { run.lab.destroy(); }
  }
});

async function runFirstJumpWithMetrics(initialSpeedMps: number) {
  const lab = new RapierVehicleLab();
  let takeoff: LabSnapshot | null = null, landing: LabSnapshot | null = null;
  let peakHeight = -Infinity;
  step(lab, 90);
  const startY = lab.snapshot().position.y;
  lab.chassis.setTranslation({ x: 0, y: startY, z: 18 }, true);
  lab.chassis.setLinvel({ x: 0, y: 0, z: initialSpeedMps }, true);
  for (let frame = 0; frame < 300; frame += 1) {
    const before = lab.snapshot();
    lab.step(neutral, true);
    const after = lab.snapshot();
    if (!takeoff && before.grounded && after.airborne) takeoff = after;
    if (takeoff && after.airborne) peakHeight = Math.max(peakHeight, after.position.y);
    else if (takeoff && after.grounded) { landing = after; break; }
  }
  if (!takeoff || !landing) {
    const failure = { lab, takeoff, landing, peakHeight };
    lab.destroy();
    throw new Error(`A condição ${initialSpeedMps} m/s não completou o salto físico.`);
  }
  return { lab, takeoff, landing, peakHeight };
}

test('aterrissagens dianteira, traseira e lateral preservam contato e estabilidade', async () => {
  await initializeRapierLab();
  const impactCases = [
    { name: 'dianteira primeiro', pitch: -0.14, roll: 0, expected: 'DIANTEIRA' },
    { name: 'traseira primeiro', pitch: 0.14, roll: 0, expected: 'TRASEIRA' },
    { name: 'lateral moderada', pitch: 0, roll: 0.1, expected: 'DIANTEIRA' },
  ] as const;
  for (const scenario of impactCases) {
    const lab = new RapierVehicleLab();
    try {
      step(lab, 90);
      const initial = lab.chassis.rotation();
      const rotation = new THREE.Quaternion(initial.x, initial.y, initial.z, initial.w)
        .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), scenario.pitch))
        .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), scenario.roll));
      // Test-fixture placement only: after release, gravity, wheel rays,
      // suspension, collision response and the landing are entirely simulated.
      lab.chassis.setRotation({ x: rotation.x, y: rotation.y, z: rotation.z, w: rotation.w }, true);
      lab.chassis.setTranslation({ x: 0, y: 3.2, z: 46 }, true);
      lab.chassis.setLinvel({ x: 0, y: -2, z: 4 }, true);
      let landing: LabSnapshot | null = null;
      for (let frame = 0; frame < 120; frame += 1) {
        lab.step(neutral, true);
        const state = lab.snapshot();
        if (state.landingCount > 0) { landing = state; break; }
      }
      assert.ok(landing, `${scenario.name}: contato detectado pelas rodas`);
      assert.ok(landing.landingContactOrder.some(label => label.startsWith(scenario.expected)),
        `${scenario.name}: primeira roda registrada (${landing.landingContactOrder.join(', ')})`);
      const upright = lab.snapshot();
      const upY = new THREE.Vector3(0, 1, 0).applyQuaternion(upright.rotation).y;
      assert.ok(upY > 0.75, `${scenario.name}: rodas seguem voltadas para baixo (upY=${upY.toFixed(3)})`);
      assert.ok(upright.peakPitchRadians * 180 / Math.PI < 12,
        `${scenario.name}: pitch máximo ${(upright.peakPitchRadians * 180 / Math.PI).toFixed(1)}°`);
      assert.ok(upright.peakRollRadians * 180 / Math.PI < 9,
        `${scenario.name}: roll máximo ${(upright.peakRollRadians * 180 / Math.PI).toFixed(1)}°`);
      assert.ok(upright.peakAngularSpeedRadPerSecond < 3,
        `${scenario.name}: velocidade angular máxima ${upright.peakAngularSpeedRadPerSecond.toFixed(2)} rad/s`);
      assert.ok(landing.position.y > 1.5, `${scenario.name}: não atravessa a plataforma`);
      assert.ok(landing.wheels.some(wheel => wheel.inContact && wheel.compressionM > 0),
        `${scenario.name}: suspensão absorve o impacto`);
      for (let frame = 0; frame < 20; frame += 1) lab.step(neutral, false);
      const recovered = lab.snapshot();
      assert.ok(recovered.grounded, `${scenario.name}: recupera apoio após o impacto`);
      assert.ok(recovered.horizontalSpeedMps > 2.5,
        `${scenario.name}: mantém impulso para acelerar logo após estabilizar (${recovered.horizontalSpeedMps.toFixed(2)} m/s)`);
      const postLandingSteer = scenario.name === 'traseira primeiro' ? -0.2 : 0.2;
      const xBeforeDrive = recovered.position.x;
      for (let frame = 0; frame < 60; frame += 1) {
        lab.step({ throttle: 0.5, brake: 0, steer: postLandingSteer }, true);
      }
      const driven = lab.snapshot();
      assert.ok(driven.horizontalSpeedMps > 3, `${scenario.name}: acelera novamente após o pouso`);
      assert.ok((driven.position.x - xBeforeDrive) * postLandingSteer > 0.05,
        `${scenario.name}: direção volta a responder após o pouso`);
    } finally { lab.destroy(); }
  }
});

test('A/D pressionados no lábio da primeira rampa não causam guinada tardia no pouso', async () => {
  await initializeRapierLab();
  for (const [name, steer] of [['A', 1], ['D', -1]] as const) {
    const lab = new RapierVehicleLab();
    try {
      let takeoff = false;
      let landing: LabSnapshot | null = null;
      let peakRollDegrees = 0;
      let peakAngularSpeed = 0;
      let minimumUpY = 1;
      let maximumLateralOffset = 0;
      for (let frame = 0; frame < 900; frame += 1) {
        const before = lab.snapshot();
        const crossingFirstLip = before.position.z >= 38 && before.position.z < 42;
        lab.step({ throttle: 1, brake: 0, steer: crossingFirstLip ? steer : 0 }, true);
        const state = lab.snapshot();
        takeoff ||= before.grounded && state.airborne;
        if (takeoff && !landing && state.grounded && state.position.z > 40) landing = state;
        peakRollDegrees = Math.max(peakRollDegrees, state.peakRollRadians * 180 / Math.PI);
        peakAngularSpeed = Math.max(peakAngularSpeed, state.peakAngularSpeedRadPerSecond);
        minimumUpY = Math.min(minimumUpY, new THREE.Vector3(0, 1, 0).applyQuaternion(state.rotation).y);
        maximumLateralOffset = Math.max(maximumLateralOffset, Math.abs(state.position.x));
        if (landing && state.position.z >= 85) break;
      }
      assert.ok(takeoff, `${name}: a velocidade de corrida gera decolagem na pista normal`);
      assert.ok(landing, `${name}: as rodas retomam contato depois do vão`);
      assert.ok(peakRollDegrees < 10,
        `${name}: sem inclinação lateral tardia (${peakRollDegrees.toFixed(1)}°)`);
      assert.ok(peakAngularSpeed < 3.5,
        `${name}: rotação controlada após o pouso (${peakAngularSpeed.toFixed(2)} rad/s)`);
      assert.ok(minimumUpY > 0.9, `${name}: o chassi permanece com as rodas voltadas para baixo`);
      assert.ok(maximumLateralOffset < LAB_TRACK_WIDTH / 2 - LAB_TUNING.chassisHalfExtents.z,
        `${name}: a trajetória permanece dentro da pista (${maximumLateralOffset.toFixed(2)} m)`);
    } finally { lab.destroy(); }
  }
});

test('A/D na subida da primeira rampa preservam avanço e estabilidade até o pouso', async () => {
  await initializeRapierLab();
  const finalOffsets: number[] = [];
  for (const [name, steer] of [['A', 1], ['D', -1]] as const) {
    const lab = new RapierVehicleLab();
    try {
      let takeoff = false;
      let landing: LabSnapshot | null = null;
      let peakRollDegrees = 0;
      let peakAngularSpeed = 0;
      let minimumUpY = 1;
      let maximumLateralOffset = 0;
      for (let frame = 0; frame < 900; frame += 1) {
        const before = lab.snapshot();
        const steeringOnRamp = before.position.z >= 27 && before.position.z < 42;
        lab.step({ throttle: 1, brake: 0, steer: steeringOnRamp ? steer : 0 }, true);
        const state = lab.snapshot();
        takeoff ||= before.grounded && state.airborne;
        if (takeoff && !landing && state.grounded && state.position.z > 40) landing = state;
        peakRollDegrees = Math.max(peakRollDegrees, state.peakRollRadians * 180 / Math.PI);
        peakAngularSpeed = Math.max(peakAngularSpeed, state.peakAngularSpeedRadPerSecond);
        minimumUpY = Math.min(minimumUpY, new THREE.Vector3(0, 1, 0).applyQuaternion(state.rotation).y);
        maximumLateralOffset = Math.max(maximumLateralOffset, Math.abs(state.position.x));
        if (landing && state.position.z >= 85) break;
      }
      assert.ok(takeoff, `${name}: a trajetória real desde a largada alcança a rampa`);
      assert.ok(landing, `${name}: o carro aterrissa depois da rampa`);
      assert.ok(peakRollDegrees < 8,
        `${name}: direção na subida não gera giro tardio (${peakRollDegrees.toFixed(1)}°)`);
      assert.ok(peakAngularSpeed < 5,
        `${name}: velocidade angular permanece controlável (${peakAngularSpeed.toFixed(2)} rad/s)`);
      assert.ok(minimumUpY > 0.9, `${name}: carro permanece com as rodas para baixo`);
      assert.ok(maximumLateralOffset < LAB_TRACK_WIDTH / 2 - LAB_TUNING.chassisHalfExtents.z,
        `${name}: mantém a carroceria dentro da pista (${maximumLateralOffset.toFixed(2)} m)`);
      finalOffsets.push(lab.snapshot().position.x);
    } finally { lab.destroy(); }
  }
  assert.ok(finalOffsets[0]! * finalOffsets[1]! < 0,
    'A/D ainda produzem trajetórias opostas depois da rampa');
});
