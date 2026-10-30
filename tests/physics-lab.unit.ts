import test from 'node:test';
import assert from 'node:assert/strict';
import { LAB_FIXED_DT, RapierVehicleLab, initializeRapierLab, type LabControls, type LabSnapshot } from '../src/physics-lab/RapierVehicleLab.ts';

const neutral: LabControls = { throttle: 0, brake: 0, steer: 0 };
const forward: LabControls = { throttle: 1, brake: 0, steer: 0 };

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
  let takeoffStep = -1, peakHeight = -Infinity, strongestAssist = 0;
  let previousZ = 0, landingStepDistance = Infinity;
  try {
    for (let stepIndex = 0; stepIndex < 540; stepIndex += 1) {
      const before = lab.snapshot();
      lab.step(stepIndex < 30 || takeoff ? neutral : forward, assist);
      const after = lab.snapshot();
      if (!takeoff && before.grounded && after.airborne) {
        takeoff = after;
        takeoffStep = stepIndex;
        previousZ = before.position.z;
      } else if (takeoff && !landing && after.airborne) {
        peakHeight = Math.max(peakHeight, after.position.y);
        strongestAssist = Math.max(strongestAssist, Math.abs(after.assistTorqueNm));
        if (stepIndex === takeoffStep + 8) inFlight = after;
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
    return { lab, takeoff, inFlight, landing, recovered, peakHeight, strongestAssist, landingStepDistance };
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
    assert.ok(natural.peakHeight > natural.takeoff.position.y + 0.3, 'a gravidade produz um arco observável');
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
    assert.ok(assisted.landing.pitchRadians < 0, 'a assistência pode apontar o nariz para baixo antes do toque');
    assert.ok(assisted.landing.pitchRadians < natural.landing.pitchRadians - 0.05,
      `a assistência altera progressivamente o pitch antes do toque: ${assisted.landing.pitchRadians}/${natural.landing.pitchRadians}`);
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
