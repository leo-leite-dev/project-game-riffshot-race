import test from 'node:test';
import assert from 'node:assert/strict';
import { RACE_TRACKS, getTrackById } from '../src/data/raceTracks.js';
import { DIFFICULTIES } from '../src/data/raceDifficulty.js';
import { deriveHandlingStats, findNearestTrackPoint, RaceSimulation, sampleRaceTrack, sampleTrackAtProgress } from '../src/race/RaceSimulation.js';

const bots = [
  { id: 'bot-a', name: 'Bot A', stats: { speed: 5, acceleration: 5, handling: 5, endurance: 5, aggression: 5 } },
  { id: 'bot-b', name: 'Bot B', stats: { speed: 6, acceleration: 5, handling: 6, endurance: 5, aggression: 5 } },
  { id: 'bot-c', name: 'Bot C', stats: { speed: 5, acceleration: 6, handling: 5, endurance: 5, aggression: 6 } },
];
const player = { id: 'player', name: 'Piloto', stats: { speed: 6, acceleration: 6, handling: 6, endurance: 6, aggression: 6 } };
const makeRace = (track = RACE_TRACKS[0], difficulty = 'normal') => new RaceSimulation({ track, difficulty, player, vehicleStats: { speed: 75, acceleration: 70, control: 65, armor: 60 }, botPilots: bots });

test('tracks are unique, closed, finite and have distinct layouts with elevated voltage route', () => {
  assert.equal(RACE_TRACKS.length, 2);
  assert.deepEqual(RACE_TRACKS.map(track => track.id), ['neon-furnace', 'voltage-run']);
  assert.equal(getTrackById('missing'), null);
  for (const track of RACE_TRACKS) {
    assert.equal(track.laps, 4);
    assert.equal(track.startGrid.length, 4);
    assert.ok(track.waypoints.every(point => [point.x, point.z, point.y ?? 0].every(Number.isFinite)));
    const sampled = sampleRaceTrack(track);
    assert.ok(sampled.totalLength > 0);
    assert.ok(sampled.points.every(point => [point.x, point.z, point.y, point.tangentX, point.tangentZ].every(Number.isFinite)));
    assert.ok(Math.hypot(sampled.points[0].x - sampled.points.at(-1).x, sampled.points[0].z - sampled.points.at(-1).z) < 10);
  }
  assert.ok(Math.max(...RACE_TRACKS[1].waypoints.map(point => point.y)) > Math.max(...RACE_TRACKS[0].waypoints.map(point => point.y)));
});

test('difficulty changes AI behavior configuration, not physical vehicle caps', () => {
  assert.notEqual(DIFFICULTIES.normal.lookahead, DIFFICULTIES.hard.lookahead);
  assert.notEqual(DIFFICULTIES.normal.steeringError, DIFFICULTIES.hard.steeringError);
  assert.notEqual(DIFFICULTIES.normal.overtakeDesire, DIFFICULTIES.hard.overtakeDesire);
  const normal = makeRace(RACE_TRACKS[0], 'normal'); const hard = makeRace(RACE_TRACKS[0], 'hard');
  assert.deepEqual(normal.participants.map(car => car.vehicle.maxSpeed), hard.participants.map(car => car.vehicle.maxSpeed));
  assert.ok(deriveHandlingStats({ speed: 80 }, { speed: 10 }).maxSpeed > deriveHandlingStats({ speed: 80 }, { speed: 1 }).maxSpeed);
  assert.ok(deriveHandlingStats({}, { aggression: 10 }).collisionShove > deriveHandlingStats({}, { aggression: 1 }).collisionShove);
});

test('grid starts four cars beside the finish/start gate, following centerline tangent and grid lanes', () => {
  const race = makeRace();
  const start = sampleTrackAtProgress(race.track, race.track.totalLength * 0.985);
  const cars = race.participants;
  assert.equal(cars.length, 4);
  assert.ok(cars.every(car => Math.hypot(car.x - start.x, car.z - start.z) < 12));
  const tangentHeading = Math.atan2(start.tangentX, start.tangentZ);
  assert.ok(cars.every(car => Math.abs(Math.atan2(Math.sin(car.heading - tangentHeading), Math.cos(car.heading - tangentHeading))) < 0.12));
  assert.ok(new Set(cars.map(car => Math.round(car.x * 10) / 10)).size > 1);
  assert.ok(cars.every(car => car.nextCheckpoint === 1 && car._nextGate === 0));
});

test('player controls alter speed and heading and input is ignored until race starts', () => {
  const race = makeRace();
  const car = race.participants[0];
  race.advance(1000, { throttle: 1, steer: 1 });
  assert.equal(car.speed, 0);
  race.start();
  race.advance(1000, { throttle: 1, steer: 1 });
  assert.ok(car.speed > 0);
  assert.notEqual(car.heading, 0);
});

test('três bots e o piloto completam as duas pistas em Normal e Difícil, com quatro resultados válidos', () => {
  for (const track of RACE_TRACKS) for (const difficulty of ['normal', 'hard']) {
    const race = makeRace(track, difficulty).start();
    for (let i = 0; i < 120 * 60 && race.status !== 'finished'; i += 1) {
      race.advance(1000 / 60, race.getBotControls(race.participants[0], 1 / 60));
    }
    assert.equal(race.status, 'finished', `${track.id}/${difficulty} não terminou: ${JSON.stringify(race.getStandings().map(car => ({ id: car.id, laps: car.lapsCompleted })))}`);
    const standings = race.getStandings();
    assert.deepEqual(standings.map(car => car.rank), [1, 2, 3, 4]);
    assert.ok(standings.every(car => car.finished && car.lapsCompleted === 4 && Number.isFinite(car.finishTime)));
    assert.deepEqual(standings.map(car => car.finishTime), [...standings.map(car => car.finishTime)].sort((a, b) => a - b));
    for (const car of race.participants) {
      const nearest = findNearestTrackPoint(race.track, car.x, car.z);
      assert.ok(Math.abs(nearest.lateral) <= race.track.width / 2 + 0.1, `${track.id}/${difficulty}/${car.name} saiu da pista`);
    }
  }
});

test('sequenced geometric gates reject reverse and skipped crossings, player can complete full ordered laps', () => {
  const race = makeRace().start(); const car = race.participants[0];
  const gate = race.gates[0];
  car._prevX = gate.x + gate.tangentX; car._prevZ = gate.z + gate.tangentZ;
  car.x = gate.x - gate.tangentX; car.z = gate.z - gate.tangentZ;
  race._updateProgress(car);
  assert.equal(car.nextCheckpoint, 1, 'crossing the first gate backwards is rejected');

  const finishGate = race.gates[3];
  car._prevX = finishGate.x - finishGate.tangentX * 2; car._prevZ = finishGate.z - finishGate.tangentZ * 2;
  car.x = finishGate.x + finishGate.tangentX * 2; car.z = finishGate.z + finishGate.tangentZ * 2;
  race._updateProgress(car);
  assert.equal(car.lapsCompleted, 0, 'crossing the finish gate out of sequence is rejected');
  assert.equal(car.nextCheckpoint, 1);

  const orderedGates = race.gates;
  for (let gateIndex = 0; gateIndex < orderedGates.length; gateIndex += 1) {
    const currentGate = orderedGates[gateIndex];
    const direction = 2;
      car._prevX = currentGate.x - currentGate.tangentX * direction;
      car._prevZ = currentGate.z - currentGate.tangentZ * direction;
      car.x = currentGate.x + currentGate.tangentX * direction;
      car.z = currentGate.z + currentGate.tangentZ * direction;
      race._updateProgress(car);
    assert.equal(car.nextCheckpoint, gateIndex === 3 ? 1 : gateIndex + 2);
    assert.equal(car.lapsCompleted, gateIndex === 3 ? 1 : 0);
  }
  assert.ok(car.progress > 0);
});
