import test from 'node:test';
import assert from 'node:assert/strict';
import { RaceSimulation, sampleTrackAtProgress } from '../src/race/RaceSimulation.ts';
import { RACE_TRACKS } from '../src/data/raceTracks.ts';
import { CHARACTERS } from '../src/data/characters.ts';
import { OPENING_RIVAL } from '../src/data/openingRival.ts';

function race() {
  return new RaceSimulation({ track: RACE_TRACKS[0], difficulty: 'hard', player: CHARACTERS[3],
    botPilots: [OPENING_RIVAL, CHARACTERS[1], CHARACTERS[2]] }).start();
}

test('tiro integrado retira exatamente uma bolinha mesmo com piloto resistente e provoca tranco', () => {
  const sim = race(), car = sim.participants[0];
  const hp = car.health, multiplier = car.vehicle.collisionDamageMultiplier;
  assert.ok(multiplier < 1);
  assert.equal(sim.applyProjectileHit(car, 20, 1, 0), 20);
  assert.equal(car.health, hp - 20);
  assert.equal(car.health / 20, hp / 20 - 1);
  assert.ok(car.speed > 0);
  assert.equal(car.shotImpactSequence, 1);
  const afterShot = car.health;
  sim.applyDamage(car, 20);
  assert.equal(car.health, afterShot - 20 * multiplier, 'colisões preservam redução do piloto');
});

test('tiro integrado respeita proteção e chegada; destruição e respawn não dão munição', () => {
  const sim = race(), car = sim.participants[0], rival = sim.participants[1];
  assert.equal(rival.id, OPENING_RIVAL.id);
  assert.equal(rival.aiProfile, 'rival');
  assert.equal(sim.cannon.tryFire(rival, 0), true);
  assert.equal(sim.cannon.ammo, 4);
  car.respawnProtection = 1;
  assert.equal(sim.applyProjectileHit(car, 20, 1, 0), 0);
  assert.equal(car.shotImpactSequence, undefined);
  car.respawnProtection = 0;
  car.finished = true;
  assert.equal(sim.applyProjectileHit(car, 20, 1, 0), 0);
  car.finished = false;
  while (car.health > 0) sim.applyProjectileHit(car, 20, 1, 0);
  assert.equal(car.destroyed, true);
  assert.equal(car.destructionSequence, 1);
  for (let i = 0; i < 49; i++) sim.advance(1000 / 60);
  assert.equal(car.destroyed, false);
  assert.equal(car.health, car.maxHealth);
  assert.ok(car.respawnProtection > 0);
  assert.ok(sim.cannon.ammo <= 4);
});

test('chegada física do rival recarrega até cinco somente após volta por gates ordenados', () => {
  const sim = race(), rival = sim.participants[1];
  sim.cannon.tryFire(rival, 0);
  assert.equal(sim.cannon.ammo, 4);
  sim._resetMotion(rival);
  for (let gateIndex = 0; gateIndex < 4; gateIndex++) {
    const gate = sim.gates[gateIndex];
    const previous = sampleTrackAtProgress(sim.track, gate.distance - 0.1);
    const next = sampleTrackAtProgress(sim.track, gate.distance + 0.1);
    rival._prevX = previous.x; rival._prevZ = previous.z;
    rival.x = next.x; rival.z = next.z; rival.y = next.y;
    sim._updateProgress(rival);
  }
  assert.equal(rival.lapsCompleted, 1);
  sim.cannon.step(1 / 60, sim.participants, 1, () => {});
  assert.equal(sim.cannon.ammo, 5);
});
