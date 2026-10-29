const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export const DESTRUCTION_SECONDS = 0.8;
export const RESPAWN_PROTECTION_SECONDS = 1.5;

export function healthCapacity(armor = 60) {
  const healthOrbs = 3 + Math.floor(clamp(Number(armor) - 20, 0, 80) / 20);
  return { healthOrbs, maxHealth: healthOrbs * 20 };
}

// Ignore gentle scrapes; a 20-unit normal approach costs 21 HP, regardless
// of tangential speed. Armor adds capacity, never another damage reduction.
export function impactDamage(normalApproachSpeed: number) {
  return Math.max(0, normalApproachSpeed - 2.5) * 1.2;
}

export function damageHandling(car: { health: number; maxHealth: number }) {
  const damage = 1 - clamp(car.health / car.maxHealth, 0, 1);
  return { grip: 1 - damage * 0.35, steering: 1 - damage * 0.25 };
}
