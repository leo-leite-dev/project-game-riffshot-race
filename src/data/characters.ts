import type Phaser from 'phaser';
import { getPilotProfile } from './pilotos/index.ts';
import { canonicalPilotId } from './pilotIds.ts';
import { VEHICLE_TUNING_FIELDS, type VehicleTuningField } from './vehicleTuningSchema.ts';
import { TEAM_VEHICLE_ATTRIBUTES } from './vehicles.ts';

// Scores are design ratings (1–10), not speeds or physical units. Every pilot
// has 30 points; only the two listed specialties affect this pilot's handling.
export const ATTRIBUTE_SCALE = 10;
/** Atributos oficiais usados pelos bônus declarados nos perfis JSON. */
export type PilotAttribute = VehicleTuningField;
/** Especialidades internas da física oficial; não são os bônus exibidos no elenco. */
export type PilotHandlingAttribute = 'speed' | 'acceleration' | 'handling' | 'endurance' | 'aggression';
export const ATTRIBUTES = TEAM_VEHICLE_ATTRIBUTES;
const GAMEPLAY_CHARACTERS = [
  {
    id: 'axel-ryder',
    specialties: ['speed', 'handling'] as const satisfies readonly PilotHandlingAttribute[],
    stats: { speed: 6, acceleration: 6, handling: 6, endurance: 6, aggression: 6 },
    portrait: { accent: '#71f6ff', skin: '#b87556', hair: '#201c37', style: 'crest', visor: '#ffb66b' },
  },
  {
    id: 'neon-kira',
    specialties: ['speed', 'acceleration'] as const satisfies readonly PilotHandlingAttribute[],
    stats: { speed: 9, acceleration: 8, handling: 5, endurance: 4, aggression: 4 },
    portrait: { accent: '#ffbe55', skin: '#e8b19a', hair: '#26364b', style: 'solar-cowl', visor: '#71f6ff' },
  },
  {
    id: 'brok-thorn',
    specialties: ['acceleration', 'aggression'] as const satisfies readonly PilotHandlingAttribute[],
    stats: { speed: 6, acceleration: 5, handling: 4, endurance: 6, aggression: 9 },
    portrait: { accent: '#ffb454', skin: '#a66f55', hair: '#252434', style: 'resonance', visor: '#71f6ff' },
  },
  {
    id: 'leonard-lyon',
    specialties: ['endurance', 'aggression'] as const satisfies readonly PilotHandlingAttribute[],
    stats: { speed: 4, acceleration: 3, handling: 5, endurance: 10, aggression: 8 },
    portrait: { accent: '#ffb769', skin: '#895d4e', hair: '#25263b', style: 'hauler', visor: '#ffdf9c' },
  },
  {
    id: 'rox-z7',
    specialties: ['handling', 'endurance'] as const satisfies readonly PilotHandlingAttribute[],
    stats: { speed: 5, acceleration: 6, handling: 9, endurance: 6, aggression: 4 },
    portrait: { accent: '#a6a0ff', skin: '#7e90ad', hair: '#35415a', style: 'salvage', visor: '#b6ffea' },
  },
  {
    id: 'vyra-noctis',
    specialties: ['acceleration', 'handling'] as const satisfies readonly PilotHandlingAttribute[],
    stats: { speed: 6, acceleration: 10, handling: 7, endurance: 3, aggression: 4 },
    portrait: { accent: '#a9f477', skin: '#6f443e', hair: '#242237', style: 'ponytail', visor: '#c6ff9b' },
  },
  {
    id: 'dagger-raven',
    specialties: ['aggression', 'endurance'] as const satisfies readonly PilotHandlingAttribute[],
    stats: { speed: 5, acceleration: 5, handling: 6, endurance: 6, aggression: 8 },
    portrait: { accent: '#ff354d', skin: '#895947', hair: '#171522', style: 'spikes', visor: '#ff354d' },
  },
  {
    id: 'cyber-dragon',
    specialties: ['speed', 'handling'] as const satisfies readonly PilotHandlingAttribute[],
    stats: { speed: 7, acceleration: 6, handling: 7, endurance: 5, aggression: 5 },
    portrait: { accent: '#16dcff', skin: '#7185a4', hair: '#123d8b', style: 'android', visor: '#16dcff' },
  },
  {
    id: 'drax-mare',
    specialties: ['endurance', 'aggression'] as const satisfies readonly PilotHandlingAttribute[],
    stats: { speed: 5, acceleration: 6, handling: 5, endurance: 8, aggression: 6 },
    portrait: { accent: '#ffc642', skin: '#c78a54', hair: '#b56b20', style: 'hauler', visor: '#72e6ff' },
  },
];

export const CHARACTERS = Object.freeze(GAMEPLAY_CHARACTERS.map(character => {
  const profile = getPilotProfile(character.id);
  if (!profile) throw new Error(`Falta o perfil narrativo do piloto "${character.id}".`);
  profile.bonusAttributes.forEach(({ id }) => {
    if (!(VEHICLE_TUNING_FIELDS as readonly string[]).includes(id)) {
      throw new Error(`Atributo de bônus desconhecido "${id}" no piloto "${character.id}".`);
    }
  });
  const bonusAttributes = Object.freeze(Object.fromEntries(
    profile.bonusAttributes.map(({ id, value }) => [id, value]),
  ) as Partial<Record<PilotAttribute, number>>);
  return Object.freeze({
    ...character,
    originPlanetId: profile.originPlanetId,
    ultimateIds: profile.ultimateIds,
    identityIconKey: profile.identityIconKey,
    portraitKey: profile.portraitKey,
    fullBodyPortraitKey: profile.fullBodyPortraitKey,
    bonusAttributes,
    name: profile.nome,
    profile: profile.titulo,
    description: profile.lore,
    stats: Object.freeze(character.stats),
    specialties: Object.freeze(character.specialties),
    portrait: Object.freeze(character.portrait),
  });
}));

export type PilotCharacter = (typeof CHARACTERS)[number];
export type PilotRatings = PilotCharacter['stats'];

/** Lê os +1 declarados sem alterar tuning, upgrades ou veículo base. */
export function getEffectivePilotBonusAttributes(
  character: Pick<PilotCharacter, 'bonusAttributes'>,
): Partial<Record<PilotAttribute, number>> {
  return { ...character.bonusAttributes };
}

/** Retains the pilot's existing race ratings; official bonus data is separate. */
export function getEffectivePilotStats(character: Pick<PilotCharacter, 'stats'>): PilotRatings {
  return { ...character.stats };
}

/** Retains existing specialties while enabling the two bonus ratings in race physics. */
export function getEffectivePilotSpecialties(
  character: Pick<PilotCharacter, 'specialties'>,
): readonly PilotHandlingAttribute[] {
  return [...new Set<PilotHandlingAttribute>(character.specialties)];
}

export function getCharacterById(id: string | null) {
  return CHARACTERS.find(character => character.id === canonicalPilotId(id ?? '')) ?? null;
}

export function getSelectedCharacter(registry: Pick<Phaser.Data.DataManager, 'get'>) {
  return getCharacterById(registry.get('selectedCharacterId'));
}
