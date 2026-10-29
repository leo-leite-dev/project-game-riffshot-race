import test from 'node:test';
import assert from 'node:assert/strict';
import { RaceSimulation, sampleTrackAtProgress, findNearestTrackPoint } from '../src/race/RaceSimulation.ts';
import type { RaceParticipant } from '../src/race/RaceSimulation.ts';
import { RACE_TRACKS } from '../src/data/raceTracks.ts';

const controls = { throttle: 0, brake: 0, steer: 0, handbrake: 0 };
const DT = 1 / 60;

function setup(track = RACE_TRACKS[0]) {
  const race = new RaceSimulation({ track, player: { id: 'player', name: 'Piloto' },
    botPilots: [1, 2, 3].map(id => ({ id: `bot-${id}`, name: `Rival ${id}` })) });
  const car = race.participants[0];
  const center = sampleTrackAtProgress(race.track, race.track.totalLength * 0.12);
  const edge = track.width / 2 - 1.2;
  const place = (side = 1, along = 12, outward = 5, offset = 0.05) => {
    const nx = -center.tangentZ * side, nz = center.tangentX * side;
    Object.assign(car, { x: center.x + nx * (edge + offset), z: center.z + nz * (edge + offset),
      heading: Math.atan2(center.tangentX, center.tangentZ),
      velocityX: center.tangentX * along + nx * outward,
      velocityZ: center.tangentZ * along + nz * outward });
    car.speed = Math.hypot(car.velocityX, car.velocityZ);
  };
  const step = () => {
    // The paired free step measures speed after the SAME drive/tire forces,
    // isolating the collision's 50% penalty from drag or propulsion.
    const freeCar = { ...car };
    race.track.width = 1000;
    race._integrate(freeCar, controls, DT);
    race.track.width = track.width;
     const contact = findNearestTrackPoint(race.track, freeCar.x, freeCar.z);
     if (!contact) throw new Error('contato de parede ausente');
    race._integrate(car, controls, DT);
     return { freeSpeed: freeCar.speed, contact };
  };
  return { race, car, center, edge, place, step };
}

test('parede: batidas frontais, oblíquas e rasantes tiram metade da velocidade em ambas as pistas', () => {
  for (const track of RACE_TRACKS) for (const side of [-1, 1]) {
    for (const [along, outward] of [[0, 20], [12, 5], [20, 0.2]]) {
      const state = setup(track);
      state.place(side, along, outward);
      const { freeSpeed, contact } = state.step();
      const { car, edge, race } = state;
      assert.ok(Math.abs(car.speed - freeSpeed * 0.5) < 1e-10, `${track.id}/${side}/${along}/${outward}`);
      const outwardAfter = car.velocityX * -contact.tangentZ * side + car.velocityZ * contact.tangentX * side;
      assert.ok(outwardAfter < 0, 'a resposta devolve o carro para dentro');
       const nearest = findNearestTrackPoint(race.track, car.x, car.z);
       assert.ok(nearest);
       assert.ok(Math.abs(nearest.lateral) <= edge + 0.01);
      assert.equal(car._wallContactSide, side);
    }
  }
});

test('parede: contato contínuo não repete a penalidade de metade a cada passo', () => {
  const state = setup();
  state.place();
  state.step();
  for (let frame = 0; frame < 5; frame += 1) {
    // Model continued pressure against the same wall without leaving contact.
    state.place(1, 12, 0.2);
    const { freeSpeed } = state.step();
    assert.ok(state.car.speed > freeSpeed * 0.9, 'raspar continuamente não aplica sucessivos cortes de 50%');
    assert.equal(state.car._wallContactSide, 1);
  }
});

test('parede: afastar e bater de novo, ou atingir o lado oposto, aplica nova penalidade', () => {
  const state = setup();
  state.place();
  state.step();
  state.place(1, 0, 0, -0.5);
  state.step();
  assert.equal(state.car._wallContactSide, 0);
  state.place();
  let { freeSpeed } = state.step();
  assert.ok(Math.abs(state.car.speed - freeSpeed * 0.5) < 1e-10);
  state.place(-1);
  ({ freeSpeed } = state.step());
  assert.ok(Math.abs(state.car.speed - freeSpeed * 0.5) < 1e-10);
  assert.equal(state.car._wallContactSide, -1);
});

test('parede: corrigir posição já saindo da barreira não pune nem inverte a recuperação', () => {
  const state = setup();
  state.place(1, 12, -2);
  const { freeSpeed } = state.step();
  assert.ok(Math.abs(state.car.speed - freeSpeed) < 1e-10);
  assert.equal(state.car._wallContactSide, 0);
  assert.ok(Number.isFinite(state.car.x) && Number.isFinite(state.car.z));
});
