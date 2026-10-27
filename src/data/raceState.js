// Temporary, in-memory campaign information. Future systems can replace values here.
const INITIAL_STATE = Object.freeze({
  player: 'PLAYER 1', credits: 2000, division: 'B', racesCompleted: 0,
  racesTotal: 8, requiredPoints: 1400, points: 0,
});

export function getRaceState(registry) {
  if (!registry.has('racePreparation')) registry.set('racePreparation', { ...INITIAL_STATE });
  return registry.get('racePreparation');
}
