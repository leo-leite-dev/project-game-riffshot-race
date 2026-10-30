import test from 'node:test';
import assert from 'node:assert/strict';
import { readAnalogVehicleControls, readVehicleControls } from '../src/race/PlayerController.ts';
import { RaceSimulation } from '../src/race/RaceSimulation.ts';
import type { RaceParticipant } from '../src/race/RaceSimulation.ts';
import { RACE_TRACKS } from '../src/data/raceTracks.ts';
import { RaceCameraRig } from '../src/visuals/race/RaceCameraRig.ts';

const keys = (...names: string[]) => Object.fromEntries(names.map(name => [name, { isDown: true }]));
const createRace = () => new RaceSimulation({
  track: RACE_TRACKS[0], player: { id: 'player', name: 'Piloto' },
  vehicleStats: { speed: 75, acceleration: 70, control: 65, armor: 60 },
  botPilots: [1, 2, 3].map(id => ({ id: `bot-${id}`, name: `Rival ${id}` })),
});
const setVelocity = (car: RaceParticipant, signedSpeed: number) => {
  car.velocityX = Math.sin(car.heading) * signedSpeed;
  car.velocityZ = Math.cos(car.heading) * signedSpeed;
  car.speed = Math.abs(signedSpeed);
};
const signedSpeed = (car: RaceParticipant) => car.velocityX * Math.sin(car.heading) + car.velocityZ * Math.cos(car.heading);

test('WASD e setas geram os mesmos comandos locais ao veículo', () => {
  for (const [letter, arrow] of [['W', 'UP'], ['S', 'DOWN'], ['A', 'LEFT'], ['D', 'RIGHT']]) {
    assert.deepEqual(readVehicleControls(keys(letter)), readVehicleControls(keys(arrow)));
  }
  assert.equal(readVehicleControls(keys('A')).steer, 1);
  assert.equal(readVehicleControls(keys('D')).steer, -1);
  assert.equal(readVehicleControls(keys('A', 'D')).steer, 0);
  assert.deepEqual(readVehicleControls(keys('W', 'S')), { throttle: 0, brake: 1, steer: 0, handbrake: 0, nitro: false });
  assert.equal(readVehicleControls(keys('SHIFT')).nitro, true);
});

test('analógico touch: cima acelera, diagonais viram e descida freia ou engata ré', () => {
  assert.deepEqual(readAnalogVehicleControls(0, -1), { throttle: 1, brake: 0, steer: 0 });
  assert.deepEqual(readAnalogVehicleControls(-0.75, -0.8), { throttle: 0.8, brake: 0, steer: 0.75 });
  assert.equal(readAnalogVehicleControls(0.7, -0.5).steer, -0.7);
  assert.deepEqual(readAnalogVehicleControls(0, 1), { throttle: -0.55, brake: 0, steer: 0 });
  const forward = { velocityX: 0, velocityZ: 8, heading: 0 };
  assert.deepEqual(readAnalogVehicleControls(0, 1, forward), { throttle: 0, brake: 1, steer: 0 });
});

test('A desloca para a esquerda e D para a direita do carro, inclusive ao dar ré', () => {
  for (const reverse of [false, true]) for (const key of ['A', 'D']) {
    const race = createRace(), car = race.participants[0];
    const original = { x: car.x, z: car.z, heading: car.heading };
    setVelocity(car, reverse ? -8 : 8);
    for (let i = 0; i < 5; i += 1) race._integrate(car, readVehicleControls(keys(key), car), 1 / 60);
    const rightward = (car.x - original.x) * -Math.cos(original.heading)
      + (car.z - original.z) * Math.sin(original.heading);
    assert.ok(key === 'D' ? rightward > 0 : rightward < 0, `${key} / ré=${reverse}: ${rightward}`);
    const yaw = car.heading - original.heading;
    assert.ok(key === 'A' ? (reverse ? yaw < 0 : yaw > 0) : (reverse ? yaw > 0 : yaw < 0));
  }
});

test('S freia antes de engatar a ré; W freia a ré antes de voltar à frente', () => {
  const race = createRace(), car = race.participants[0];
  setVelocity(car, 10);
  assert.deepEqual(readVehicleControls(keys('S'), car), { throttle: 0, brake: 1, steer: 0, handbrake: 0, nitro: false });
  for (let i = 0; i < 90; i += 1) race._integrate(car, readVehicleControls(keys('S'), car), 1 / 60);
  assert.ok(signedSpeed(car) < -1);
  assert.ok(Math.abs(signedSpeed(car)) <= car.vehicle.maxSpeed * 0.25 + 1e-6);
  assert.equal(readVehicleControls(keys('W'), car).brake, 1);
  for (let i = 0; i < 90; i += 1) race._integrate(car, readVehicleControls(keys('W'), car), 1 / 60);
  assert.ok(signedSpeed(car) > 1);
});

test('freio sozinho não atravessa zero nem provoca oscilação de marcha em baixa velocidade', () => {
  for (const initialSpeed of [-0.05, 0, 0.05]) {
    const race = createRace(), car = race.participants[0];
    setVelocity(car, initialSpeed);
    race._integrate(car, { throttle: 0, brake: 1, steer: 0, handbrake: 0 }, 1 / 60);
    assert.ok(Math.abs(signedSpeed(car)) < 1e-10);
    race._integrate(car, { throttle: 0, brake: 1, steer: 0, handbrake: 0 }, 1 / 60);
    assert.ok(Math.abs(signedSpeed(car)) < 1e-10);
  }
});

test('as duas câmeras e várias alternâncias não alteram inputs, trajetória ou classificação', () => {
  const reference = createRace().start(), viewed = createRace().start();
  const rig = new RaceCameraRig({ track: RACE_TRACKS[0] });
  for (let i = 0; i < 300; i += 1) {
    if (i % 90 === 0) rig.toggle();
    const keyboard = i < 160 ? keys('W', ...(i > 110 && i < 130 ? ['D'] : [])) : keys('S');
    const inputA = readVehicleControls(keyboard, reference.participants[0]);
    const inputB = readVehicleControls(keyboard, viewed.participants[0]);
    assert.deepEqual(inputB, inputA);
    reference.advance(1000 / 60, inputA);
    viewed.advance(1000 / 60, inputB);
    const car = viewed.participants[0];
    rig.update(car, 1 / 60);
    assert.equal(car.x, reference.participants[0].x);
    assert.equal(car.z, reference.participants[0].z);
    assert.equal(car.heading, reference.participants[0].heading);
    assert.deepEqual(viewed.getStandings().map(item => item.id), reference.getStandings().map(item => item.id));
  }
});
