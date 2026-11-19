import test from 'node:test';
import assert from 'node:assert/strict';
import { CHARACTERS } from '../src/data/characters.ts';
import { ORIGIN_PLANETS } from '../src/data/originPlanets.ts';
import { getPlanetChallenge, PLANET_CHALLENGES } from '../src/data/planetChallenges/index.ts';

test('cada planeta de origem de piloto jogável tem um desafio JSON próprio', () => {
  assert.equal(PLANET_CHALLENGES.length, ORIGIN_PLANETS.length);
  for (const planet of ORIGIN_PLANETS) {
    const challenge = getPlanetChallenge(planet.id);
    assert.ok(challenge, `desafio ausente para ${planet.id}`);
    const pilot = CHARACTERS.find(character => character.id === challenge.pilotId);
    assert.ok(pilot, `piloto ausente para ${planet.id}`);
    assert.equal(pilot.originPlanetId, planet.id);
    assert.equal(challenge.challengeName, 'DESAFIO DE ORIGEM');
    assert.equal(challenge.races, 1);
    assert.equal(challenge.laps, 4);
    assert.ok(challenge.reward > 0);
    assert.ok(challenge.lesson.toLocaleLowerCase('pt-BR')
      .includes((pilot.name.split(' ')[0] ?? '').toLocaleLowerCase('pt-BR')));
  }
});
