import test from 'node:test';
import assert from 'node:assert/strict';
import { Group, Vector3 } from 'three';
import { RaceWorld } from '../src/visuals/race/RaceWorld.ts';
import { RaceSimulation } from '../src/race/RaceSimulation.ts';
import { RACE_TRACKS } from '../src/data/raceTracks.ts';
import { CHARACTERS } from '../src/data/characters.ts';

const createRace = () => new RaceSimulation({
  track: RACE_TRACKS[0], player: CHARACTERS[0], botPilots: CHARACTERS.slice(1, 4),
});

// Exercise the real pose bridge without a renderer, GLB loading or WebGL.
function createPoseBridge(race: RaceSimulation) {
  const world = Object.create(RaceWorld.prototype) as RaceWorld;
  world.diagnostics = false;
  world.renderPoses = [];
  world.vehicles = race.participants.map(() => Object.assign(new Group(), {
    userData: { size: new Vector3(2, 1, 4) },
  }));
  world.setParticipants(race.participants);
  return world;
}

function present(world: RaceWorld, race: RaceSimulation) {
  world.setParticipants(race.participants, (car, output) =>
    race.getVisualTelemetry(car, race.getRenderPose(car, undefined, output)));
}

test('ponte visual mantém poses independentes e não sobrescreve a física de jogador ou bots', () => {
  const race = createRace().start();
  const world = createPoseBridge(race);
  race.advance(1000 / 60, { throttle: 1 });
  const physicalState = structuredClone(race.participants);
  present(world, race);
  assert.deepEqual(race.participants, physicalState, 'apresentar um frame não pode reescrever estado físico');
  for (const [index, car] of race.participants.entries()) {
    assert.notEqual(world.renderPoses[index], car);
    assert.equal(Object.hasOwn(car, 'longitudinalSpeed'), false, 'telemetria fica só na pose visual');
  }
  const poseBuffers = [...world.renderPoses];
  present(world, race);
  world.renderPoses.forEach((pose, index) => assert.equal(pose, poseBuffers[index], 'reutiliza o buffer por carro'));
});

test('apresentação entre passos não segura os quatro carros em 30, 60, 120 ou 144 Hz', () => {
  for (const fps of [30, 60, 120, 144]) {
    const race = createRace().start();
    const reference = createRace().start();
    const world = createPoseBridge(race);
    const start = race.participants.map(car => ({ x: car.x, z: car.z }));
    for (let frame = 0; frame < fps; frame++) {
      race.advance(1000 / fps, { throttle: 1 });
      reference.advance(1000 / fps, { throttle: 1 });
      present(world, race);
    }
    assert.deepEqual(race.participants, reference.participants, `${fps} Hz: apresentação não realimenta a física`);
    for (const [index, car] of race.participants.entries()) {
      assert.ok(Math.hypot(car.x - start[index].x, car.z - start[index].z) > 2, `${fps} Hz: ${car.id} avança`);
      assert.ok(car.speed > 4, `${fps} Hz: ${car.id} acelera`);
    }
  }
});
