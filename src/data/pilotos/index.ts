import axelRyder from './axel-ryder.json' with { type: 'json' };
import neonKira from './neon-kira.json' with { type: 'json' };
import brokThorn from './brok-thorn.json' with { type: 'json' };
import leonardLyon from './leonard-lyon.json' with { type: 'json' };
import roxZ7 from './rox-z7.json' with { type: 'json' };
import vyraNoctis from './vyra-noctis.json' with { type: 'json' };
import daggerRaven from './dagger-raven.json' with { type: 'json' };
import cyberDragon from './cyber-dragon.json' with { type: 'json' };
import draxMare from './drax-mare.json' with { type: 'json' };
import { getOriginPlanet } from '../originPlanets.ts';
import { canonicalPilotId } from '../pilotIds.ts';
import { getUltimate, type UltimateId } from '../ultimates.ts';
import { VEHICLE_TUNING_FIELDS, type VehicleTuningField } from '../vehicleTuningSchema.ts';

export interface PilotProfile {
  readonly id: string;
  readonly originPlanetId: string;
  readonly ultimateIds: readonly UltimateId[];
  readonly identityIconKey: string;
  readonly portraitKey: string;
  readonly fullBodyPortraitKey: string;
  readonly nome: string;
  readonly titulo: string;
  readonly themeColor: string;
  readonly bonusAttributes: readonly {
    readonly id: VehicleTuningField;
    readonly value: number;
  }[];
  readonly resumo: string;
  readonly lore: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function loadPilotProfile(value: unknown): PilotProfile {
  if (!isRecord(value)
    || typeof value.id !== 'string' || typeof value.originPlanetId !== 'string'
    || typeof value.identityIconKey !== 'string' || typeof value.portraitKey !== 'string'
    || typeof value.fullBodyPortraitKey !== 'string'
    || typeof value.nome !== 'string' || typeof value.titulo !== 'string'
    || typeof value.themeColor !== 'string' || typeof value.resumo !== 'string'
    || typeof value.lore !== 'string' || !Array.isArray(value.ultimateIds)
    || !Array.isArray(value.bonusAttributes)) {
    throw new Error('JSON de perfil de piloto inválido.');
  }
  const ultimateIds: UltimateId[] = [];
  for (const id of value.ultimateIds) {
    if (typeof id !== 'string' || !getUltimate(id)) {
      throw new Error(`Ultimate desconhecida no perfil "${value.id}".`);
    }
    ultimateIds.push(id as UltimateId);
  }
  const bonusAttributes: PilotProfile['bonusAttributes'][number][] = [];
  for (const attribute of value.bonusAttributes) {
    if (!isRecord(attribute) || typeof attribute.id !== 'string'
      || !(VEHICLE_TUNING_FIELDS as readonly string[]).includes(attribute.id)
      || typeof attribute.value !== 'number') {
      throw new Error(`Bônus inválido no perfil "${value.id}".`);
    }
    bonusAttributes.push(Object.freeze({ id: attribute.id as VehicleTuningField, value: attribute.value }));
  }
  return Object.freeze({
    id: value.id,
    originPlanetId: value.originPlanetId,
    ultimateIds: Object.freeze(ultimateIds),
    identityIconKey: value.identityIconKey,
    portraitKey: value.portraitKey,
    fullBodyPortraitKey: value.fullBodyPortraitKey,
    nome: value.nome,
    titulo: value.titulo,
    themeColor: value.themeColor,
    bonusAttributes: Object.freeze(bonusAttributes),
    resumo: value.resumo,
    lore: value.lore,
  });
}

export const PILOT_PROFILES: readonly PilotProfile[] = Object.freeze([
  axelRyder, neonKira, brokThorn, leonardLyon, roxZ7,
  vyraNoctis, daggerRaven, cyberDragon, draxMare,
].map(loadPilotProfile));

const profilesById = new Map(PILOT_PROFILES.map(profile => [profile.id, profile]));

if (profilesById.size !== PILOT_PROFILES.length) {
  throw new Error('Os perfis dos pilotos precisam ter IDs únicos.');
}

for (const profile of PILOT_PROFILES) {
  if (!profile.id.trim() || !profile.originPlanetId.trim() || !getOriginPlanet(profile.originPlanetId)
    || profile.ultimateIds.length === 0
    || !profile.identityIconKey.startsWith('pilot-symbol-')
    || !profile.portraitKey.startsWith('pilot-card-portrait-')
    || !profile.fullBodyPortraitKey.startsWith('pilot-fullbody-')
    || profile.ultimateIds.some(id => getUltimate(id)?.pilotId !== profile.id)
    || new Set(profile.ultimateIds).size !== profile.ultimateIds.length
    || !profile.nome.trim() || !profile.titulo.trim()
    || !/^#[\da-fA-F]{6}$/.test(profile.themeColor)
    || profile.bonusAttributes.length !== 2
    || new Set(profile.bonusAttributes.map(attribute => attribute.id)).size !== 2
    || profile.bonusAttributes.some(attribute =>
       !(VEHICLE_TUNING_FIELDS as readonly string[]).includes(attribute.id)
        || attribute.value !== 1)
    || !profile.resumo.trim() || !profile.lore.trim()) {
    throw new Error(`Perfil incompleto para o piloto "${profile.id}".`);
  }
}

export function getPilotProfile(id: string): PilotProfile | undefined {
  return profilesById.get(canonicalPilotId(id));
}
