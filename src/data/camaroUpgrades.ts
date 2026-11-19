import type { VehicleStats } from './vehicles.ts';

export const CAMARO_UPGRADE = Object.freeze({
  vehicleId: 'volt-vector',
  maximumLevel: 8,
  baseSpeed: 36,
  maximumSpeed: 100,
  baseSpeedKmh: 110,
  maximumSpeedKmh: 220,
  prices: Object.freeze([500, 800, 1100, 1400, 1800, 2200, 2700, 3300]),
});

export const CAMARO_UPGRADE_ATTRIBUTES = Object.freeze({
  speed: Object.freeze({ base: 36, pointsPerLevel: 8, maximum: 100 }),
  acceleration: Object.freeze({ base: 36, pointsPerLevel: 8, maximum: 100 }),
  armor: Object.freeze({ base: 68, pointsPerLevel: 1, maximum: 76 }),
  control: Object.freeze({ base: 68, pointsPerLevel: 4, maximum: 100 }),
  tires: Object.freeze({ base: 68, pointsPerLevel: 4, maximum: 100 }),
  suspension: Object.freeze({ base: 68, pointsPerLevel: 4, maximum: 100 }),
  shotCount: Object.freeze({ base: 2, pointsPerLevel: 1, maximum: 10 }),
  bombCount: Object.freeze({ base: 2, pointsPerLevel: 1, maximum: 10 }),
  oilSlickCount: Object.freeze({ base: 2, pointsPerLevel: 1, maximum: 10 }),
});

export type CamaroUpgradeAttribute = keyof typeof CAMARO_UPGRADE_ATTRIBUTES;
export const CAMARO_UPGRADE_ATTRIBUTE_KEYS = Object.freeze(Object.keys(CAMARO_UPGRADE_ATTRIBUTES) as CamaroUpgradeAttribute[]);

export function camaroUpgradeValue(attribute: CamaroUpgradeAttribute, level: number): number {
  const definition = CAMARO_UPGRADE_ATTRIBUTES[attribute];
  const boundedLevel = Math.min(CAMARO_UPGRADE.maximumLevel, Math.max(0, Math.floor(level)));
  return Math.min(definition.maximum, definition.base + boundedLevel * definition.pointsPerLevel);
}

export function camaroUpgradedStats(
  baseStats: Readonly<VehicleStats>, levels: Readonly<Record<CamaroUpgradeAttribute, number>>,
): VehicleStats {
  const stats = { ...baseStats };
  for (const attribute of CAMARO_UPGRADE_ATTRIBUTE_KEYS) stats[attribute] = camaroUpgradeValue(attribute, levels[attribute]);
  return stats;
}

export function camaroSpeedPoints(level: number): number {
  return camaroUpgradeValue('speed', level);
}

/** A DEV tuning value is a temporary simulation override, never player progress. */
export function camaroRaceSpeedPoints(purchasedLevel: number, devOverride?: number): number {
  if (devOverride !== undefined && Number.isFinite(devOverride)) {
    return Math.min(CAMARO_UPGRADE.maximumSpeed, Math.max(CAMARO_UPGRADE.baseSpeed, devOverride));
  }
  return camaroSpeedPoints(purchasedLevel);
}

export function camaroTopSpeedKmh(points: number): number {
  const total = Math.min(CAMARO_UPGRADE.maximumSpeed, Math.max(CAMARO_UPGRADE.baseSpeed, points));
  const progress = (total - CAMARO_UPGRADE.baseSpeed)
    / (CAMARO_UPGRADE.maximumSpeed - CAMARO_UPGRADE.baseSpeed);
  return CAMARO_UPGRADE.baseSpeedKmh
    + progress * (CAMARO_UPGRADE.maximumSpeedKmh - CAMARO_UPGRADE.baseSpeedKmh);
}
