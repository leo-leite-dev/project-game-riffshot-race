import type Phaser from 'phaser';
import vehicleTuning from './vehicleTuning.json' with { type: 'json' };
import { VEHICLE_TUNING_FIELDS, VEHICLE_TUNING_IDS } from './vehicleTuningSchema.ts';
import type { VehicleTuningId } from './vehicleTuningSchema.ts';

// Stable IDs preserve existing careers; visual assets and shop rules are data.
export interface VehicleStats {
  speed: number; acceleration: number; control: number; armor: number;
  /** Tire grip, independent of steering control. Optional only for old test/adaptor fixtures. */
  tires?: number;
  /** Impact-energy damping; also ready for future jump/fall surfaces. */
  suspension?: number;
  shotCount?: number;
  bombCount?: number;
  oilSlickCount?: number;
}
export { VEHICLE_TUNING_FIELDS, VEHICLE_TUNING_IDS } from './vehicleTuningSchema.ts';
export type { VehicleTuningId } from './vehicleTuningSchema.ts';
export type VehicleTuning = Record<VehicleTuningId, Readonly<VehicleStats>>;
export const VEHICLE_TUNING = vehicleTuning as VehicleTuning;
export interface VehicleDesign { body: string; width: number; length: number; height: number; wheelbase: number }
export interface VehicleAbility { nitroCharges?: number; nitroSeconds?: number; nitroMultiplier?: number }
export interface VehicleShop { price?: number; initialSelection?: boolean; modelFile?: string; purchaseLocked?: boolean; unlockMessage?: string }
export interface Vehicle extends VehicleShop { id: string; name: string; stats: Readonly<VehicleStats>; design: Readonly<VehicleDesign>; ability: Readonly<VehicleAbility> }

const defineVehicle = (id: string, name: string, stats: VehicleStats, design: VehicleDesign, ability: VehicleAbility = {}, shop: VehicleShop = {}): Readonly<Vehicle> => Object.freeze({
  id, name, stats: Object.freeze(stats), design: Object.freeze(design), ability: Object.freeze(ability),
  ...shop,
});

export const VEHICLES = Object.freeze([
  defineVehicle('rift-blaze', 'THUNDER BUG',
    VEHICLE_TUNING['rift-blaze'],
    { body: 'coupe', width: 1.72, length: 3.2, height: 0.42, wheelbase: 0.95 },
    { nitroCharges: 2, nitroSeconds: 3, nitroMultiplier: 1.35 },
    { price: 2000, initialSelection: true, modelFile: 'thunder_bug.glb' }),
  defineVehicle('volt-vector', 'CAMARO',
    VEHICLE_TUNING['volt-vector'],
    { body: 'streamliner', width: 1.52, length: 3.65, height: 0.34, wheelbase: 1.02 }, {},
    { price: 800, initialSelection: true, modelFile: 'camaro.glb' }),
  defineVehicle('iron-bastion', 'ARMORED CAR',
    VEHICLE_TUNING['iron-bastion'],
    { body: 'armored', width: 2.18, length: 2.85, height: 0.76, wheelbase: 0.84 }, {},
    { price: 7500, initialSelection: true, modelFile: 'armored_car_death_race.glb' }),
  defineVehicle('race-car-2', 'RACE CAR 2',
    VEHICLE_TUNING['race-car-2'],
    { body: 'coupe', width: 1.72, length: 3.2, height: 0.42, wheelbase: 0.95 },
    { nitroCharges: 2, nitroSeconds: 3, nitroMultiplier: 1.35 },
    { price: 15000, initialSelection: false, modelFile: 'race_car2.glb', purchaseLocked: true,
      unlockMessage: 'CHEFÃO DA FASE 2 / AINDA NÃO LIBERADO' }),
  defineVehicle('widowmaker', 'WIDOWMAKER',
    VEHICLE_TUNING.widowmaker,
    { body: 'armored', width: 2.18, length: 2.85, height: 0.76, wheelbase: 0.84 }, {},
    { price: 24000, initialSelection: false, modelFile: 'widowmaker_-_death_race_2000.glb' }),
]);

export const INITIAL_VEHICLES = Object.freeze(VEHICLES.filter(vehicle => vehicle.initialSelection));
export const RIVAL_VEHICLE_ID = 'widowmaker';

export const VEHICLE = VEHICLES[0];

export const PAINTS = Object.freeze([
  Object.freeze({ id: 'inferno', name: 'VERMELHO', color: '#E53935' }),
  Object.freeze({ id: 'neon', name: 'AZUL ELÉTRICO', color: '#1677FF' }),
  Object.freeze({ id: 'volt', name: 'AMARELO', color: '#FFD027' }),
]);

export const VEHICLE_ATTRIBUTES = Object.freeze([
  { key: 'speed', label: 'VELOCIDADE MÁXIMA' },
  { key: 'acceleration', label: 'ACELERAÇÃO' },
  { key: 'control', label: 'CONTROLE' },
  { key: 'tires', label: 'PNEUS' },
  { key: 'suspension', label: 'SUSPENSÃO' },
  { key: 'armor', label: 'RESISTÊNCIA' },
]);

export const TEAM_VEHICLE_ATTRIBUTES = Object.freeze([
  ...VEHICLE_ATTRIBUTES,
  { key: 'shotCount', label: 'QUANTIDADE DE TIROS' },
  { key: 'bombCount', label: 'QUANTIDADE DE BOMBAS' },
  { key: 'oilSlickCount', label: 'POÇAS DE ÓLEO' },
]);

export const STATION_PRIMARY_ATTRIBUTES = Object.freeze([
  VEHICLE_ATTRIBUTES[0], VEHICLE_ATTRIBUTES[5],
  TEAM_VEHICLE_ATTRIBUTES[6], TEAM_VEHICLE_ATTRIBUTES[7], TEAM_VEHICLE_ATTRIBUTES[8],
]);

export const STATION_DETAIL_ATTRIBUTES = Object.freeze([
  VEHICLE_ATTRIBUTES[1], VEHICLE_ATTRIBUTES[2], VEHICLE_ATTRIBUTES[3], VEHICLE_ATTRIBUTES[4],
]);

export function getVehicleById(id: string | null) {
  return VEHICLES.find(vehicle => vehicle.id === id) ?? null;
}

export function getSelectedVehicle(registry: Pick<Phaser.Data.DataManager, 'get'>) {
  const vehicle = getVehicleById(registry.get('selectedVehicleId'));
  const paint = PAINTS.find(item => item.id === registry.get('selectedPaintId'));
  return vehicle && paint ? { vehicle, paint } : null;
}

export function getVehicleDisplayName(vehicle: Vehicle | null | undefined) {
  return vehicle?.name ?? VEHICLE.name;
}
