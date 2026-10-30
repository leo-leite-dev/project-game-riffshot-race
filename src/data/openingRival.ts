// Non-playable opening rival. Ratings use the same 30-point budget and shared
// handling derivation as playable pilots, independently of chosen difficulty.
export const OPENING_RIVAL = Object.freeze({
  id: 'ravik-ferro', name: 'RAVIK FERRO', title: 'O FUNDIDOR', vehicleId: 'widowmaker',
  stats: Object.freeze({ speed: 8, acceleration: 7, handling: 7, endurance: 5, aggression: 3 }),
  specialties: Object.freeze(['speed', 'handling'] as const),
  aiProfile: 'rival' as const,
});
