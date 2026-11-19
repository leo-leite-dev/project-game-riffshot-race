import voltaris from './voltaris.json' with { type: 'json' };
import nyra7 from './nyra-7.json' with { type: 'json' };
import thorgar from './thorgar.json' with { type: 'json' };
import kaelith from './kaelith.json' with { type: 'json' };
import solkar from './solkar.json' with { type: 'json' };
import noctisPrime from './noctis-prime.json' with { type: 'json' };
import eclipsis from './eclipsis.json' with { type: 'json' };
import drakoryn from './drakoryn.json' with { type: 'json' };
import tidaris from './tidaris.json' with { type: 'json' };

export type PlanetChallenge = {
  readonly planetId: string;
  readonly pilotId: string;
  readonly challengeName: string;
  readonly races: number;
  readonly laps: number;
  readonly reward: number;
  readonly lesson: string;
};

export const PLANET_CHALLENGES: readonly PlanetChallenge[] = Object.freeze([
  voltaris, nyra7, thorgar, kaelith, solkar, noctisPrime, eclipsis, drakoryn, tidaris,
]);

const challengesByPlanetId = new Map(PLANET_CHALLENGES.map(challenge => [challenge.planetId, challenge]));

if (challengesByPlanetId.size !== PLANET_CHALLENGES.length
  || PLANET_CHALLENGES.some(challenge => !challenge.planetId || !challenge.pilotId
    || !challenge.challengeName || !challenge.lesson.trim()
    || !Number.isInteger(challenge.races) || challenge.races < 1
    || !Number.isInteger(challenge.laps) || challenge.laps < 1
    || !Number.isFinite(challenge.reward) || challenge.reward < 0)) {
  throw new Error('Os dados dos desafios planetários são inválidos ou possuem IDs duplicados.');
}

export function getPlanetChallenge(planetId: string): PlanetChallenge | undefined {
  return challengesByPlanetId.get(planetId);
}
