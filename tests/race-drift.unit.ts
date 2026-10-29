import test from 'node:test';
import assert from 'node:assert/strict';
import { RaceSimulation } from '../src/race/RaceSimulation.ts';
import type { RaceControls, RaceParticipant } from '../src/race/RaceSimulation.ts';
import { RACE_TRACKS } from '../src/data/raceTracks.ts';
import { VEHICLES } from '../src/data/vehicles.ts';

const DT = 1 / 60;
const neutral = { throttle: 0, brake: 0, steer: 0, handbrake: 0 };
const angleDelta = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle));

function setup(speed = 27, vehicle = VEHICLES[0], handling = 5) {
  // A wide test surface isolates tire forces from walls, contacts and AI.
  const race = new RaceSimulation({
    track: { ...RACE_TRACKS[0], width: 1000 },
    player: { id: 'player', name: 'Piloto', stats: { handling } },
    playerVehicle: vehicle,
    botPilots: [1, 2, 3].map(id => ({ id: `bot-${id}`, name: `Rival ${id}` })),
  });
  const car = race.participants[0];
  Object.assign(car, { x: 0, z: 0, heading: 0, velocityX: 0, velocityZ: speed, speed });
  return { race, car };
}

type DriftState = { race: RaceSimulation; car: RaceParticipant };
function drive(state: DriftState, frames: number, controls: RaceControls = {}) {
  for (let i = 0; i < frames; i += 1) {
    state.race._integrate(state.car, { ...neutral, ...controls }, DT);
  }
  return state.car;
}

const slip = (car: RaceParticipant) => angleDelta(car.heading - Math.atan2(car.velocityX, car.velocityZ));
const lateralSpeed = (car: RaceParticipant) => car.velocityX * Math.cos(car.heading) - car.velocityZ * Math.sin(car.heading);

test('drift natural: carroceria gira antes da trajetória sem freio de mão', () => {
  const state = setup();
  const car = drive(state, 1, { steer: 1 });
  const travelHeading = Math.atan2(car.velocityX, car.velocityZ);
  assert.ok(car.heading > 0);
  assert.ok(travelHeading > 0 && travelHeading < car.heading * 0.2,
    `a trajetória não pode girar instantaneamente com a carroceria: ${travelHeading}/${car.heading}`);
  drive(state, 29, { steer: 1 });
  assert.ok(slip(car) > 0.5, `curva normal deve soltar bastante a traseira (> 28°): ${slip(car)}`);
  assert.ok(Math.abs(lateralSpeed(car)) > 10);
  assert.ok(car.speed > 15, 'o carro deve carregar velocidade durante o drift');
});

test('drift natural: alta velocidade abre a curva e reduzir antes ajuda a fechá-la', () => {
  const fast = setup();
  const braked = setup();
  drive(braked, 40, { brake: 1 });
  // Same corner entry and steering after the braking zone, at different speeds.
  braked.car.x = 0; braked.car.z = 0;
  drive(fast, 40, { steer: 1 });
  drive(braked, 40, { steer: 1 });
  assert.ok(fast.car.z > braked.car.z * 1.5,
    `sem reduzir, o carro avança mais na direção antiga: ${fast.car.z}/${braked.car.z}`);
  assert.ok(slip(fast.car) > slip(braked.car) + 0.1);
  const fastTrajectory = Math.atan2(fast.car.velocityX, fast.car.velocityZ);
  const slowTrajectory = Math.atan2(braked.car.velocityX, braked.car.velocityZ);
  assert.ok(slowTrajectory > fastTrajectory + 0.2,
    'reduzir permite redirecionar mais a trajetória no mesmo tempo');
});

test('drift natural: virar tarde ultrapassa o limite de uma curva que a antecipação evita', () => {
  function corner(anticipate: boolean) {
    const state = setup();
    state.car.z = -15;
    // Virtual corner: the old straight ends at z=8. No physical wall masks overshoot.
    for (let i = 0; i < 240; i += 1) {
      const approaching = state.car.z < (anticipate ? -8 : 0);
      const turning = !approaching && state.car.heading < Math.PI / 2;
      drive(state, 1, { brake: anticipate && approaching ? 1 : 0, steer: turning ? 1 : 0 });
      if (state.car.x > 12) break;
    }
    return state.car;
  }
  const early = corner(true), late = corner(false);
  assert.ok(early.x > 12 && late.x > 12, 'as duas tentativas devem atravessar a saída virtual');
  assert.ok(early.z < 8, `antecipação mantém a saída dentro da curva: ${early.z}`);
  assert.ok(late.z > 8, `virar tarde deve passar reto do limite: ${late.z}`);
});

test('drift natural: soltar direção recupera aderência e Espaço prolonga o deslizamento', () => {
  const normal = setup(), handbrake = setup();
  drive(normal, 30, { steer: 1 });
  drive(handbrake, 30, { steer: 1 });
  const initialSlip = Math.abs(slip(normal.car));
  drive(normal, 45);
  drive(handbrake, 45, { handbrake: 1 });
  // Recovery is intentionally slower than the old half-second realignment.
  assert.ok(Math.abs(slip(normal.car)) > 0.12, 'a traseira ainda desliza após 0,75 s sem direção');
  assert.ok(Math.abs(slip(normal.car)) < initialSlip * 0.5);
  assert.ok(Math.abs(slip(handbrake.car)) > Math.abs(slip(normal.car)) * 2);
  assert.ok(handbrake.car.speed < normal.car.speed, 'freio de mão também reduz a velocidade');
  drive(normal, 90);
  assert.ok(Math.abs(slip(normal.car)) < 0.02, 'o drift deve terminar gradualmente, não virar gelo permanente');
});

test('drift natural: aderência não cria energia nem excede a força lateral disponível', () => {
  const state = setup();
  let previousSpeed = state.car.speed;
  for (let i = 0; i < 180; i += 1) {
    drive(state, 1, { steer: i < 90 ? 1 : -1 });
    assert.ok(Number.isFinite(state.car.speed));
    assert.ok(state.car.speed <= previousSpeed + 1e-10, 'direção sem acelerar não gera velocidade');
    previousSpeed = state.car.speed;
  }
  const sideways = setup(12);
  sideways.car.velocityX = 20;
  drive(sideways, 1);
  const correction = 20 - sideways.car.velocityX;
  assert.ok(correction > 0 && correction <= sideways.car.vehicle.grip * 28 * DT + 1e-10);
});

test('drift natural: controle do veículo e habilidade do piloto preservam vantagem de aderência', () => {
  const blaze = setup(), vector = setup(27, VEHICLES[1]);
  const novice = setup(27, VEHICLES[0], 1), expert = setup(27, VEHICLES[0], 10);
  for (const state of [blaze, vector, novice, expert]) {
    // Equal misalignment isolates grip from the different steering ratings.
    state.car.heading = 0.5;
    drive(state, 20);
  }
  assert.ok(Math.abs(lateralSpeed(vector.car)) < Math.abs(lateralSpeed(blaze.car)));
  assert.ok(Math.abs(lateralSpeed(expert.car)) < Math.abs(lateralSpeed(novice.car)));
});

test('drift traseiro: acelerar na curva sustenta deslizamento e soltar o acelerador ajuda a recuperar', () => {
  const powered = setup(), lifted = setup();
  for (const state of [powered, lifted]) state.car.heading = 0.6;
  drive(powered, 30, { throttle: 1 });
  drive(lifted, 30);
  assert.ok(Math.abs(lateralSpeed(powered.car)) > Math.abs(lateralSpeed(lifted.car)) * 1.3,
    'acelerar deve manter mais velocidade lateral na traseira que tirar o pé');
  assert.ok(Math.abs(slip(powered.car)) > Math.abs(slip(lifted.car)),
    'a perda de aderência sob potência deve superar o realinhamento causado pelo motor');

  const state = setup();
  drive(state, 36, { throttle: 1, steer: 1 });
  assert.ok(slip(state.car) > 0.6, 'o drift acelerando deve superar 34° após 0,6 s de curva');
  assert.ok(state.car.speed > 24, 'o drift forte não deve apagar a sensação de velocidade');
  drive(state, 45);
  assert.ok(slip(state.car) > 0.15, 'a traseira não pode se alinhar sozinha imediatamente');
});

test('drift traseiro: contraesterçar recupera o carro antes de apenas soltar a direção', () => {
  const countersteer = setup(), neutralSteer = setup();
  for (const state of [countersteer, neutralSteer]) drive(state, 36, { throttle: 1, steer: 1 });
  drive(countersteer, 15, { steer: -0.6 });
  drive(neutralSteer, 15);
  assert.ok(Math.abs(slip(countersteer.car)) < Math.abs(slip(neutralSteer.car)) * 0.65,
    'corrigir para o lado contrário deve ajudar a dominar a traseira');
  assert.ok(countersteer.car.speed > 15);
});

test('drift traseiro: bônus limitado a 6% não acumula sobre o nitro e termina gradualmente', () => {
  for (const nitroActive of [false, true]) {
    const state = setup();
    state.car.nitroActive = nitroActive;
    const limit = state.car.vehicle.maxSpeed * (nitroActive ? state.car.vehicle.nitroMultiplier : 1.06);
    let peakSpeed = 0;
    for (let i = 0; i < 240; i += 1) {
      drive(state, 1, { throttle: 1, steer: i < 120 ? 0.7 : -0.7 });
      peakSpeed = Math.max(peakSpeed, state.car.speed);
      assert.ok(state.car.speed <= limit + 1e-10, 'o ganho de drift tem teto e não acumula sobre o nitro');
      assert.ok(Number.isFinite(state.car.x) && Number.isFinite(state.car.z));
    }
    if (nitroActive) assert.ok(peakSpeed > state.car.vehicle.maxSpeed * 1.06 + 1, 'nitro continua mais forte que o bônus de drift');
    else assert.ok(peakSpeed > state.car.vehicle.maxSpeed * 1.02, 'drift permite pequeno ganho além da máxima de reta');
  }

  const recovery = setup();
  const car = recovery.car;
  Object.assign(car, { nitroActive: true, nitroRemaining: DT, heading: 0.4,
    velocityZ: car.vehicle.maxSpeed * car.vehicle.nitroMultiplier });
  car.speed = car.velocityZ;
  const controls = { ...neutral, throttle: 1, steer: 0.2, nitro: false };
  recovery.race._updateNitro(car, controls, DT);
  drive(recovery, 1, controls);
  assert.equal(car.nitroActive, false);
  assert.ok(car.speed > car.vehicle.maxSpeed + 1, 'terminar o nitro não corta o drift imediatamente ao limite normal');
  for (let i = 0; i < 60; i += 1) {
    const previousSpeed = car.speed;
    recovery.race._updateNitro(car, controls, DT);
    drive(recovery, 1, controls);
    assert.ok(previousSpeed - car.speed < 1, 'recuperação do limite durante drift deve ser gradual');
  }
  assert.ok(car.speed <= car.vehicle.maxSpeed * 1.06 + 1e-10);
  const boostBeforeLift = car._driftBoost;
  const speedBeforeLift = car.speed;
  // Once the body aligns with the trajectory, the longitudinal cap must also
  // honor the fading bonus instead of cutting all excess speed in one step.
  car.heading = Math.atan2(car.velocityX, car.velocityZ);
  drive(recovery, 1);
  assert.ok(car.speed >= speedBeforeLift - 0.2, 'sair do drift não corta o bônus inteiro instantaneamente');
  drive(recovery, 180);
  assert.ok(car._driftBoost < boostBeforeLift * 0.01);
  assert.ok(car.speed <= car.vehicle.maxSpeed, 'sem tração, o bônus se dissipa');
});

test('drift traseiro: reta e manobra lenta continuam previsíveis, sem desvio lateral espontâneo', () => {
  const straight = setup(0);
  drive(straight, 180, { throttle: 1 });
  assert.equal(straight.car.x, 0);
  assert.equal(straight.car.heading, 0);
  assert.equal(lateralSpeed(straight.car), 0);
  const slow = setup(3);
  drive(slow, 30, { steer: 1 });
  assert.ok(Math.abs(slip(slow.car)) < 0.3, 'a baixa velocidade não deve herdar o drift extremo de corrida');
});

test('drift sob tração: acelerar mantém e ganha velocidade real durante uma curva forte', () => {
  for (const steer of [-1, 1]) {
    const state = setup();
    const initialSpeed = state.car.speed;
    let previousSpeed = initialSpeed;
    for (let i = 0; i < 36; i += 1) {
      drive(state, 1, { throttle: 1, steer });
      assert.ok(state.car.speed >= previousSpeed - 1e-10, 'drift acelerando não pode desacelerar por arrasto lateral');
      assert.ok(Math.abs(state.car.speed - Math.hypot(state.car.velocityX, state.car.velocityZ)) < 1e-10);
      previousSpeed = state.car.speed;
    }
    assert.ok(state.car.speed > initialSpeed + 1, 'deve existir ganho perceptível e limitado, não só alteração do velocímetro');
    assert.ok(Math.abs(slip(state.car)) > 0.6, 'preservar velocidade não pode apagar o drift');
  }
});

test('drift sob tração: freio, freio de mão, embalo e ré não ativam ganho de drift', () => {
  for (const controls of [{}, { throttle: 1, brake: 1 }, { throttle: 1, handbrake: 1 }, { throttle: -1 }]) {
    const state = setup();
    state.car.heading = 0.6;
    const initialSpeed = state.car.speed;
    drive(state, 30, controls);
    assert.equal(state.car._driftBoost, 0, 'ganho exige aceleração para frente sem freios');
    assert.ok(state.car.speed < initialSpeed, 'deslizamento sem tração ou com freio deve perder energia');
  }
  const slow = setup(3);
  drive(slow, 10, { throttle: 1, steer: 1 });
  assert.equal(slow.car._driftBoost, 0, 'manobras lentas não dão bônus');
});
