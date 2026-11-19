import { canonicalPilotId, type PilotId } from './pilotIds.ts';

export type PlanetTrackPreview = {
  artworkKey: string;
  showArtwork: boolean;
};

export type OriginPlanet = {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly artworkKey?: string;
  readonly emblemKey?: string;
  /** Artes de prévia já existentes; não representam IDs de corridas cadastradas. */
  readonly trackPreviewsByPilotId?: Partial<Record<PilotId, PlanetTrackPreview>>;
};

/** Catálogo único de planetas de origem, com descrições e artes já presentes no projeto. */
export const ORIGIN_PLANETS: readonly OriginPlanet[] = Object.freeze([
  {
    id: 'voltaris', name: 'VOLTARIS',
    description: 'Voltaris é um mundo de megafábricas e fornalhas colossais, onde rios de lava cruzam cidades industriais. As pistas passam por cânions rochosos e complexos siderúrgicos, sob fumaça e calor extremo. Seus pilotos enfrentam curvas perigosas sem perder velocidade.',
    artworkKey: 'pilot-world-voltaris-globe', emblemKey: 'pilot-emblem-voltaris',
    trackPreviewsByPilotId: {
      'axel-ryder': { artworkKey: 'pilot-track-axel-ryder', showArtwork: true },
    },
  },
  {
    id: 'nyra-7', name: 'NYRA-7',
    description: 'Montanhas violeta cortadas por fendas de energia.',
    artworkKey: 'pilot-world-neon-kira', emblemKey: 'pilot-emblem-nyra-7',
    trackPreviewsByPilotId: {
      'neon-kira': { artworkKey: 'pilot-track-neon-kira', showArtwork: true },
    },
  },
  {
    id: 'thorgar', name: 'THORGAR',
    description: 'Picos gelados e cordilheiras de minério dominam Thorgar. Ventos extremos varrem as montanhas, onde veios incandescentes atravessam o gelo.',
    artworkKey: 'pilot-world-brok-thorn', emblemKey: 'pilot-emblem-thorgar',
    trackPreviewsByPilotId: {
      'brok-thorn': { artworkKey: 'pilot-track-brok-thorn-selected', showArtwork: true },
    },
  },
  {
    id: 'kaelith', name: 'KAELITH',
    description: 'Florestas verdejantes, desertos minerais e rios oceânicos se encontram em Kaelith. Leonard domina as cordilheiras selvagens deste planeta de biomas extremos.',
    artworkKey: 'pilot-world-leonard-lyon', emblemKey: 'pilot-emblem-kaelith',
    trackPreviewsByPilotId: {
      'leonard-lyon': { artworkKey: 'pilot-track-leonard-lyon', showArtwork: true },
    },
  },
  {
    id: 'solkar', name: 'SOLKAR',
    description: 'Tempestades elétricas azuis cruzam as cordilheiras de Solkar. Nuvens densas e fendas de energia percorrem este mundo, onde Rox desafia os limites.',
    artworkKey: 'pilot-world-rox-z7', emblemKey: 'pilot-emblem-solkar',
    trackPreviewsByPilotId: {
      'rox-z7': { artworkKey: 'pilot-track-rox-z7', showArtwork: true },
    },
  },
  {
    id: 'noctis-prime', name: 'NOCTIS PRIME',
    description: 'Montanhas violetas e tempestades de energia envolvem Noctis Prime. Um vórtice luminoso corta as nuvens sobre cordilheiras escuras.',
    artworkKey: 'pilot-world-vyra-noctis',
    trackPreviewsByPilotId: {
      'vyra-noctis': { artworkKey: 'pilot-track-vyra-noctis', showArtwork: true },
    },
  },
  {
    id: 'eclipsis', name: 'ECLIPSIS',
    description: 'Cinzas vulcânicas cobrem as planícies negras de Eclipsis. Rios de lava atravessam crateras e montanhas sob densas nuvens de fumaça.',
    artworkKey: 'pilot-world-dagger-raven', emblemKey: 'pilot-emblem-eclipsis',
  },
  {
    id: 'drakoryn', name: 'DRAKORYN',
    description: 'Cidades fortificadas brilham entre montanhas violetas e fendas de energia azul. Tempestades de plasma atravessam este mundo cibernético.',
    artworkKey: 'pilot-world-cyber-dragon',
    trackPreviewsByPilotId: {
      'cyber-dragon': { artworkKey: 'pilot-track-cyber-dragon', showArtwork: true },
    },
  },
  {
    id: 'tidaris', name: 'TIDARIS',
    description: 'Oceanos azuis envolvem arquipélagos verdejantes e montanhas costeiras. Correntes e tempestades moldam este planeta de mares profundos.',
    artworkKey: 'pilot-world-drax-mare',
    trackPreviewsByPilotId: {
      'drax-mare': { artworkKey: 'pilot-track-drax-mare', showArtwork: true },
    },
  },
]);

const originPlanetsById = new Map(ORIGIN_PLANETS.map(planet => [planet.id, planet]));

if (originPlanetsById.size !== ORIGIN_PLANETS.length) {
  throw new Error('Os IDs dos planetas de origem precisam ser únicos.');
}

export function getOriginPlanet(planetId: string): OriginPlanet | undefined {
  return originPlanetsById.get(planetId);
}

export function getOriginPlanetArtworkKey(planet: OriginPlanet): string | undefined {
  return planet.artworkKey;
}

export function getOriginPlanetTrackPreview(
  planet: OriginPlanet,
  pilotId: string,
): PlanetTrackPreview | undefined {
  return planet.trackPreviewsByPilotId?.[canonicalPilotId(pilotId) as PilotId];
}
