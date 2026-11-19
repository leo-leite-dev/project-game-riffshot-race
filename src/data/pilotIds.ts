/** IDs históricos aceitos apenas para leitura e normalização de dados antigos. */
export const LEGACY_PILOT_ID_ALIASES = Object.freeze({
  'vera-volt': 'axel-ryder',
  'kira-comet': 'neon-kira',
  'dax-voltage': 'brok-thorn',
  'atlas-knox': 'leonard-lyon',
  'echo-7': 'rox-z7',
  'zuri-spark': 'vyra-noctis',
  'blade-raven': 'dagger-raven',
  'drak-mare': 'drax-mare',
} as const);

export type LegacyPilotId = keyof typeof LEGACY_PILOT_ID_ALIASES;
export type PilotId = (typeof LEGACY_PILOT_ID_ALIASES)[LegacyPilotId] | 'cyber-dragon';

export function canonicalPilotId(id: string): string {
  return LEGACY_PILOT_ID_ALIASES[id as LegacyPilotId] ?? id;
}
