import assert from 'node:assert/strict';
import test from 'node:test';
import { ATTRIBUTE_SCALE, CHARACTERS, getCharacterById, getEffectivePilotBonusAttributes, getEffectivePilotSpecialties, getEffectivePilotStats } from '../src/data/characters.ts';
import { getPilotProfile, PILOT_PROFILES } from '../src/data/pilotos/index.ts';
import { ULTIMATES } from '../src/data/ultimates.ts';
import { LEGACY_PILOT_ID_ALIASES } from '../src/data/pilotIds.ts';
import { pilotIconTextureKey, pilotPortraitTextureKey } from '../src/data/pilotIcons.ts';
import type { PilotId } from '../src/data/pilotIds.ts';
import {
  getOriginPlanet,
  getOriginPlanetArtworkKey,
  getOriginPlanetTrackPreview,
  ORIGIN_PLANETS,
} from '../src/data/originPlanets.ts';
import { VEHICLE_TUNING_FIELDS } from '../src/data/vehicleTuningSchema.ts';

const expectedBonuses = {
  'axel-ryder': ['speed', 'shotCount'],
  'neon-kira': ['acceleration', 'oilSlickCount'],
  'brok-thorn': ['armor', 'suspension'],
  'leonard-lyon': ['control', 'tires'],
  'rox-z7': ['speed', 'acceleration'],
  'vyra-noctis': ['control', 'bombCount'],
  'dagger-raven': ['shotCount', 'oilSlickCount'],
  'cyber-dragon': ['armor', 'bombCount'],
  'drax-mare': ['tires', 'suspension'],
} as const;

const expectedThemeColors = {
  'axel-ryder': '#F32427',
  'neon-kira': '#FF29AE',
  'brok-thorn': '#50CFFF',
  'leonard-lyon': '#F6B72C',
  'rox-z7': '#00F2E5',
  'vyra-noctis': '#B65AFF',
  'dagger-raven': '#AD222C',
  'cyber-dragon': '#388BFF',
  'drax-mare': '#18BE8A',
} as const;

const expectedOrigins: Record<PilotId, {
  planetId: string; name: string; artwork: string; emblem?: string; track?: string;
}> = {
  'axel-ryder': { planetId: 'voltaris', name: 'VOLTARIS', artwork: 'pilot-world-voltaris-globe', emblem: 'pilot-emblem-voltaris', track: 'pilot-track-axel-ryder' },
  'neon-kira': { planetId: 'nyra-7', name: 'NYRA-7', artwork: 'pilot-world-neon-kira', emblem: 'pilot-emblem-nyra-7', track: 'pilot-track-neon-kira' },
  'brok-thorn': { planetId: 'thorgar', name: 'THORGAR', artwork: 'pilot-world-brok-thorn', emblem: 'pilot-emblem-thorgar', track: 'pilot-track-brok-thorn-selected' },
  'leonard-lyon': { planetId: 'kaelith', name: 'KAELITH', artwork: 'pilot-world-leonard-lyon', emblem: 'pilot-emblem-kaelith', track: 'pilot-track-leonard-lyon' },
  'rox-z7': { planetId: 'solkar', name: 'SOLKAR', artwork: 'pilot-world-rox-z7', emblem: 'pilot-emblem-solkar', track: 'pilot-track-rox-z7' },
  'vyra-noctis': { planetId: 'noctis-prime', name: 'NOCTIS PRIME', artwork: 'pilot-world-vyra-noctis', track: 'pilot-track-vyra-noctis' },
  'dagger-raven': { planetId: 'eclipsis', name: 'ECLIPSIS', artwork: 'pilot-world-dagger-raven', emblem: 'pilot-emblem-eclipsis' },
  'cyber-dragon': { planetId: 'drakoryn', name: 'DRAKORYN', artwork: 'pilot-world-cyber-dragon', track: 'pilot-track-cyber-dragon' },
  'drax-mare': { planetId: 'tidaris', name: 'TIDARIS', artwork: 'pilot-world-drax-mare', track: 'pilot-track-drax-mare' },
};

test('cada piloto carrega nome, título e lore do JSON correspondente ao ID canônico', () => {
  assert.deepEqual(PILOT_PROFILES.map(profile => profile.id), CHARACTERS.map(character => character.id));
  for (const character of CHARACTERS) {
    const profile = getPilotProfile(character.id);
    assert(profile, `perfil ausente para ${character.id}`);
    assert.equal(character.name, profile.nome);
    assert.equal(character.profile, profile.titulo);
    assert.equal(character.description, profile.lore);
    assert.equal(profile.themeColor, expectedThemeColors[character.id as keyof typeof expectedThemeColors]);
    assert(profile.resumo.length >= 100 && profile.resumo.length <= 240,
      `resumo fora do tamanho esperado para ${character.id}`);
    assert(profile.lore.length > 200, `lore incompleta para ${character.id}`);
  }
});

test('IDs oficiais normalizam aliases legados sem criar personagens duplicados e resolvem assets oficiais', () => {
  assert.equal(CHARACTERS.length, 9);
  assert.equal(new Set(CHARACTERS.map(character => character.id)).size, 9);
  for (const [legacyId, canonicalId] of Object.entries(LEGACY_PILOT_ID_ALIASES)) {
    assert.equal(getCharacterById(legacyId)?.id, canonicalId);
    assert.equal(getPilotProfile(legacyId)?.id, canonicalId);
    assert.deepEqual(getPilotProfile(legacyId), getPilotProfile(canonicalId));
  }
  for (const character of CHARACTERS) {
    assert(character.identityIconKey.startsWith('pilot-symbol-'));
    assert(character.portraitKey.startsWith('pilot-card-portrait-'));
    assert.equal(pilotIconTextureKey(character.id), character.identityIconKey);
    assert.equal(pilotPortraitTextureKey(character.id), character.portraitKey);
    assert(!character.identityIconKey.startsWith('pilot-ui-icon-'));
  }
});

test('os nove pilotos resolvem IDs de origem e apresentações existentes pelo catálogo de planetas', () => {
  assert.equal(ORIGIN_PLANETS.length, 9);
  for (const character of CHARACTERS) {
    const expected = expectedOrigins[character.id as keyof typeof expectedOrigins];
    const profile = getPilotProfile(character.id);
    assert(profile);
    assert.equal(profile.originPlanetId, expected.planetId);
    assert.equal(character.originPlanetId, expected.planetId);
    const planet = getOriginPlanet(character.originPlanetId);
    assert(planet, `planeta não cadastrado para ${character.id}`);
    assert.equal(planet.id, expected.planetId);
    assert.equal(planet.name, expected.name);
    assert.equal(getOriginPlanetArtworkKey(planet), expected.artwork);
    assert.equal(planet.emblemKey, 'emblem' in expected ? expected.emblem : undefined);
    assert.equal(getOriginPlanetTrackPreview(planet, character.id)?.artworkKey, expected.track);
    assert(planet.description.length > 0);
    assert(character.ultimateIds.length > 0);
    const profileUltimates = character.ultimateIds.map(id =>
      ULTIMATES.find(ultimate => ultimate.id === id));
    assert(profileUltimates.every((ultimate, index) =>
      ultimate?.pilotId === character.id
      && ultimate.iconKey === `ultimate-icon-${character.ultimateIds[index]}`
      && ultimate.iconPath === `/assets/characters/ultimate-icons/${character.ultimateIds[index]}.png`));
  }
  const draxUltimates = ULTIMATES.filter(ultimate => ultimate.pilotId === 'drax-mare');
  assert.equal(draxUltimates.length, 2);
  assert.equal(new Set(draxUltimates.map(ultimate => ultimate.sharedChargeGroup)).size, 1);
  assert.equal(new Set(ULTIMATES.map(ultimate => ultimate.iconKey)).size, ULTIMATES.length);
  assert.deepEqual(CHARACTERS.find(character => character.id === 'drax-mare')?.ultimateIds,
    ['drax-mare-spin-shot', 'drax-mare-water-shield']);
});

test('cada piloto tem exatamente os dois bônus aprovados e ratings efetivos limitados a 10', () => {
  assert.equal(VEHICLE_TUNING_FIELDS.length, 9);
  for (const character of CHARACTERS) {
    const expected = expectedBonuses[character.id as keyof typeof expectedBonuses];
    assert.deepEqual(Object.keys(character.bonusAttributes).sort(), [...expected].sort());
    assert.equal(Object.keys(character.bonusAttributes).length, 2);
    assert.equal(new Set(Object.keys(character.bonusAttributes)).size, 2);
    const raceSpecialties = getEffectivePilotSpecialties(character);
    assert.equal(new Set(raceSpecialties).size, raceSpecialties.length);
    for (const specialty of character.specialties) assert(raceSpecialties.includes(specialty));
    const effectiveBonuses = getEffectivePilotBonusAttributes(character);
    assert.deepEqual(Object.entries(effectiveBonuses).sort(), expected.map(key => [key, 1]).sort());

    const effective = getEffectivePilotStats(character);
    for (const [attribute, baseRating] of Object.entries(character.stats) as Array<[
      keyof typeof character.stats,
      number,
    ]>) {
      assert.equal(effective[attribute], baseRating, `${character.id} / bônus não muda rating interno da corrida`);
      assert(effective[attribute] <= ATTRIBUTE_SCALE);
    }
    assert.notEqual(effective, character.stats);
  }
});

test('bônus de um piloto não alteram as avaliações-base nem reaplicam +1 ao recalcular', () => {
  const character = CHARACTERS.find(pilot => pilot.id === 'axel-ryder');
  assert(character);
  const once = getEffectivePilotStats(character);
  const again = getEffectivePilotStats(character);
  assert.deepEqual(once, again);
  assert.deepEqual(character.stats, { speed: 6, acceleration: 6, handling: 6, endurance: 6, aggression: 6 });
  assert.equal(once.speed, 6);
  assert.equal(once.aggression, 6);
  assert.deepEqual(getEffectivePilotBonusAttributes(character), { speed: 1, shotCount: 1 });
});
