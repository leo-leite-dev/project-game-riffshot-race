// Presentation and base balance only. No pilot bonus or physics is applied here.
export const VEHICLE = Object.freeze({
  id: 'air-blade', name: 'AIR BLADE',
  modelUrl: '/models/cars/air_blade_rock_n_roll_racing.glb',
  paintMaterial: 'AirBladeColor',
  stats: Object.freeze({ speed: 75, acceleration: 70, control: 65, armor: 60 }),
});

export const PAINTS = Object.freeze([
  Object.freeze({ id: 'inferno', name: 'INFERNO', color: '#E53935' }),
  Object.freeze({ id: 'neon', name: 'NEON', color: '#1677FF' }),
  Object.freeze({ id: 'volt', name: 'VOLT', color: '#FFD027' }),
]);

export const ORIGINAL_VEHICLE_NAME = 'ORIGINAL RACER';

// The Air Blade name is shown only with the development-only GLB. The public
// procedural design has a distinct neutral label.
export function getVehicleDisplayName(source) {
  return source === 'air-blade-local' ? VEHICLE.name : ORIGINAL_VEHICLE_NAME;
}

export const VEHICLE_ATTRIBUTES = Object.freeze([
  { key: 'speed', label: 'VELOCIDADE MÁXIMA' },
  { key: 'acceleration', label: 'ACELERAÇÃO' },
  { key: 'control', label: 'CONTROLE' },
  { key: 'armor', label: 'RESISTÊNCIA' },
]);

export function getSelectedVehicle(registry) {
  if (registry.get('selectedVehicleId') !== VEHICLE.id) return null;
  const paint = PAINTS.find(item => item.id === registry.get('selectedPaintId'));
  return paint ? { vehicle: VEHICLE, paint } : null;
}

export function confirmVehicle(registry, index) {
  const paint = PAINTS[index];
  if (!paint) return;
  registry.set('selectedVehicleId', VEHICLE.id);
  registry.set('selectedPaintId', paint.id);
}
