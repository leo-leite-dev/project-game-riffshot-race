import test from 'node:test';
import assert from 'node:assert/strict';
import { ArcadeVehicleLab, ARCADE_LAB_TRACK, ARCADE_LAB_STEP_SECONDS } from '../src/physics-lab/ArcadeVehicleLab.ts';
import { ArcadeJumpPresentation, ARCADE_LAB_RAMP_HEIGHT, ARCADE_LAB_RAMP_LENGTH } from '../src/visuals/race/ArcadeJumpPresentation.ts';

test('laboratório reutiliza a simulação oficial de aceleração, frenagem e curvas', () => {
  const accelerating = new ArcadeVehicleLab();
  const left = new ArcadeVehicleLab();
  const right = new ArcadeVehicleLab();
  try {
    for (let frame = 0; frame < 45; frame += 1) accelerating.step({ throttle: 1 });
    const forwardSpeed = accelerating.car.speed;
    assert.ok(forwardSpeed > 8, `aceleração da corrida foi aplicada: ${forwardSpeed.toFixed(2)} m/s`);
    for (let frame = 0; frame < 35; frame += 1) accelerating.step({ brake: 1 });
    assert.ok(accelerating.car.speed < 0.2, 'freio da corrida reduz a velocidade sem alterar a física vertical');

    for (let frame = 0; frame < 90; frame += 1) {
      left.step({ throttle: 0.65, steer: -1 });
      right.step({ throttle: 0.65, steer: 1 });
    }
    assert.ok(left.car.x < -4 && right.car.x > 4, 'a lógica oficial gera curvas simétricas');
    assert.ok(left.car.heading < 0 && right.car.heading > 0);
  } finally {
    accelerating.reset(); left.reset(); right.reset();
  }
});

test('drift de potência usa o ganho de velocidade e os cálculos da corrida principal', () => {
  const lab = new ArcadeVehicleLab();
  try {
    for (let frame = 0; frame < 75; frame += 1) lab.step({ throttle: 1, steer: 0.35 });
    assert.ok(lab.car._driftBoost > 0.1 && lab.car._driftBoost <= 1,
      `o drift arcade é carregado gradualmente (${lab.car._driftBoost.toFixed(3)})`);
    assert.ok(lab.car.speed > 10, 'o carro mantém velocidade durante o drift');
  } finally { lab.reset(); }
});

test('rampa produz salto arcade com gravidade independente e aterrissagem controlada', () => {
  const lab = new ArcadeVehicleLab();
  let takeoffHeight = 0;
  let peakHeight = 0;
  let observedAirSteer = false;
  try {
    assert.equal(lab.race.track.jumps?.[0]?.id, ARCADE_LAB_TRACK.jumps?.[0]?.id);
    for (let frame = 0; frame < 300; frame += 1) {
      const wasAirborne = lab.car.airborne;
      lab.step({ throttle: 1, steer: lab.car.airborne ? 0.25 : 0 });
      if (!wasAirborne && lab.car.airborne) takeoffHeight = lab.car.y;
      if (lab.car.airborne) {
        peakHeight = Math.max(peakHeight, lab.car.y);
        observedAirSteer ||= Math.abs(lab.car.heading) > 0.01;
      }
      if (lab.takeoffs > 0 && lab.landings > 0) break;
    }
    assert.equal(lab.takeoffs, 1, 'a passagem pela rampa registra uma decolagem');
    assert.equal(lab.landings, 1, 'a zona de chegada registra uma aterrissagem');
    assert.ok(peakHeight > takeoffHeight + 0.5, 'a gravidade produz um arco vertical mensurável');
    assert.ok(observedAirSteer, 'o controle horizontal continua respondendo durante o voo');
    assert.equal(lab.car.airborne, false);
    assert.equal(ARCADE_LAB_STEP_SECONDS, 1 / 60);
  } finally { lab.reset(); }
});

test('pitch visual acompanha a rampa, preserva a decolagem e nivela progressivamente na subida', () => {
  const presentation = new ArcadeJumpPresentation();
  const jump = ARCADE_LAB_TRACK.jumps![0]!;
  const totalTrackLength = 1000;
  const base = { totalTrackLength, jump, deltaSeconds: ARCADE_LAB_STEP_SECONDS,
    speed: 24, airborneElapsed: 0, verticalVelocity: 0, airborne: false };
  let pose = presentation.update({ ...base, trackDistance: jump.takeoff * totalTrackLength - ARCADE_LAB_RAMP_LENGTH });
  assert.ok(Math.abs(pose.pitch) < 0.01, 'a entrada da rampa não provoca inclinação brusca');
  for (let frame = 0; frame < 40; frame += 1) {
    pose = presentation.update({ ...base, trackDistance: jump.takeoff * totalTrackLength - ARCADE_LAB_RAMP_LENGTH / 2 });
  }
  const pitchHalfwayUpRamp = pose.pitch;
  assert.ok(pose.rampOffset > ARCADE_LAB_RAMP_HEIGHT * 0.45
    && pose.rampOffset < ARCADE_LAB_RAMP_HEIGHT * 0.55,
  'a posição acompanha a altura da superfície na metade da rampa');
  for (let frame = 0; frame < 40; frame += 1) {
    pose = presentation.update({ ...base, trackDistance: jump.takeoff * totalTrackLength });
  }
  const takeoffPitch = pose.pitch;
  assert.ok(takeoffPitch < pitchHalfwayUpRamp, 'o nariz acompanha a subida de forma progressiva');
  assert.ok(Math.abs(takeoffPitch) <= Math.atan2(ARCADE_LAB_RAMP_HEIGHT, ARCADE_LAB_RAMP_LENGTH) + 0.02,
    'a inclinação da rampa permanece moderada');
  assert.ok(Math.abs(pose.rampOffset - ARCADE_LAB_RAMP_HEIGHT) < 0.01,
    'a altura visual chega ao topo da rampa sem alterar a altura da simulação');

  pose = presentation.update({ ...base, airborne: true, trackDistance: jump.takeoff * totalTrackLength,
    airborneElapsed: ARCADE_LAB_STEP_SECONDS, verticalVelocity: 7.5 });
  assert.ok(Math.abs(pose.pitch - takeoffPitch) < 0.03, 'a decolagem preserva a inclinação sem salto visual');
  assert.ok(Math.abs(pose.rampOffset - ARCADE_LAB_RAMP_HEIGHT) < 0.02,
    'a altura da rampa se mantém na decolagem para preservar a inércia visual');
  for (let frame = 0; frame < 16; frame += 1) {
    pose = presentation.update({ ...base, airborne: true, trackDistance: jump.takeoff * totalTrackLength + 3,
      airborneElapsed: 0.22, verticalVelocity: 4.1 });
  }
  assert.ok(pose.pitch > takeoffPitch && pose.pitch < 0,
    'na subida, o nariz começa elevado e nivela gradualmente');
  assert.ok(Math.abs(pose.pitch) <= 0.24, 'o voo limita o pitch para evitar giros involuntários');
});

test('descida inclina moderadamente o nariz e a aterrissagem comprime e recupera visualmente', () => {
  const presentation = new ArcadeJumpPresentation();
  const jump = ARCADE_LAB_TRACK.jumps![0]!;
  const totalTrackLength = 1000;
  const takeoffDistance = jump.takeoff * totalTrackLength;
  const base = { totalTrackLength, jump, deltaSeconds: ARCADE_LAB_STEP_SECONDS,
    speed: 24, airborne: true, trackDistance: takeoffDistance, airborneElapsed: ARCADE_LAB_STEP_SECONDS,
    verticalVelocity: 7.5 };
  presentation.update(base);
  let pose = presentation.update({ ...base, airborneElapsed: 0.68, verticalVelocity: -4.7,
    trackDistance: jump.landingStart * totalTrackLength + 10 });
  for (let frame = 0; frame < 12; frame += 1) {
    pose = presentation.update({ ...base, airborneElapsed: 0.68 + frame * ARCADE_LAB_STEP_SECONDS,
      verticalVelocity: -4.7, trackDistance: jump.landingStart * totalTrackLength + 10 });
  }
  assert.ok(pose.pitch > 0.03 && pose.pitch < 0.24,
    'a descida aproxima suavemente o nariz da atitude de aterrissagem');
  assert.ok(pose.rampOffset < ARCADE_LAB_RAMP_HEIGHT * 0.6,
    'a altura visual da rampa diminui gradualmente na aproximação da aterrissagem');

  let minimumCompression = 0;
  let maximumRecovery = 0;
  for (let frame = 0; frame < 30; frame += 1) {
    pose = presentation.update({ ...base, airborne: false, airborneElapsed: 0, verticalVelocity: 0,
      trackDistance: jump.landingEnd * totalTrackLength });
    minimumCompression = Math.min(minimumCompression, pose.suspensionOffset);
    maximumRecovery = Math.max(maximumRecovery, pose.suspensionOffset);
  }
  assert.ok(minimumCompression < -0.02, 'o carro apresenta compressão perceptível, mas sutil');
  assert.ok(maximumRecovery > 0.005, 'a suspensão recupera com um pequeno rebote');
  assert.ok(maximumRecovery < 0.04, 'o rebote permanece limitado');
});

test('barreiras da simulação oficial limitam saída de pista e reset não toca save/campeonato', () => {
  const lab = new ArcadeVehicleLab();
  try {
    assert.equal(lab.race.track.width, ARCADE_LAB_TRACK.width);
    const car = lab.car;
    car.x = 0;
    car.z = 48;
    car.heading = 0;
    car.velocityX = 0;
    car.velocityZ = 20;
    car.speed = 20;
    for (let frame = 0; frame < 20; frame += 1) lab.step({ throttle: 0, steer: 1 });
    assert.ok(Number.isFinite(car.x) && Number.isFinite(car.z));
    assert.ok(Math.abs(car.x) < 30, 'a contenção de pista do jogo impede uma fuga sem limite');
    lab.reset();
    assert.equal(lab.takeoffs, 0);
    assert.equal(lab.landings, 0);
    assert.ok(lab.car.speed < 0.01, 'reset local não modifica armazenamento persistente');
  } finally { lab.reset(); }
});
