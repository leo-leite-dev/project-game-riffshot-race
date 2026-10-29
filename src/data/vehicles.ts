import type Phaser from 'phaser';

// Stable IDs preserve existing careers; visual assets and shop rules are data.
export interface VehicleStats { speed: number; acceleration: number; control: number; armor: number }
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
    { speed: 76, acceleration: 84, control: 72, armor: 55 },
    { body: 'coupe', width: 1.72, length: 3.2, height: 0.42, wheelbase: 0.95 },
    { nitroCharges: 2, nitroSeconds: 3, nitroMultiplier: 1.35 },
    { price: 2000, initialSelection: true, modelFile: 'thunder_bug.glb' }),
  defineVehicle('volt-vector', 'CAMARO',
    { speed: 62, acceleration: 76, control: 84, armor: 35 },
    { body: 'streamliner', width: 1.52, length: 3.65, height: 0.34, wheelbase: 1.02 }, {},
    { price: 800, initialSelection: true, modelFile: 'camaro.glb' }),
  defineVehicle('iron-bastion', 'ARMORED CAR',
    { speed: 58, acceleration: 52, control: 56, armor: 100 },
    { body: 'armored', width: 2.18, length: 2.85, height: 0.76, wheelbase: 0.84 }, {},
    { price: 7500, initialSelection: true, modelFile: 'armored_car_death_race.glb' }),
  defineVehicle('race-car-2', 'RACE CAR 2',
    { speed: 94, acceleration: 92, control: 82, armor: 70 },
    { body: 'coupe', width: 1.72, length: 3.2, height: 0.42, wheelbase: 0.95 },
    { nitroCharges: 2, nitroSeconds: 3, nitroMultiplier: 1.35 },
    { price: 15000, initialSelection: false, modelFile: 'race_car2.glb', purchaseLocked: true,
      unlockMessage: 'CHEFÃO DA FASE 2 / AINDA NÃO LIBERADO' }),
  defineVehicle('widowmaker', 'WIDOWMAKER',
    { speed: 88, acceleration: 78, control: 65, armor: 90 },
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
  { key: 'armor', label: 'RESISTÊNCIA' },
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
