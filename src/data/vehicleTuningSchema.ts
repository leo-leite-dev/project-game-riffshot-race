/** Stable data contract shared by the game and the local-only tuning endpoint. */
export const VEHICLE_TUNING_IDS = Object.freeze([
  'rift-blaze', 'volt-vector', 'iron-bastion', 'race-car-2', 'widowmaker',
] as const);
export type VehicleTuningId = (typeof VEHICLE_TUNING_IDS)[number];
export const VEHICLE_TUNING_FIELDS = Object.freeze([
  'speed', 'acceleration', 'control', 'tires', 'suspension', 'armor',
  'shotCount', 'bombCount', 'oilSlickCount',
] as const);
export type VehicleTuningField = (typeof VEHICLE_TUNING_FIELDS)[number];
