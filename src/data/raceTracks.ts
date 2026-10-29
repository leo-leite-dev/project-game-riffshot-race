const theme = (road: string, edge: string, glow: string, sky: string, accent: string, secondary: string) => ({ road, edge, glow, sky, accent, secondary });

const makeGrid = () => [-3.3, 3.3, -3.3, 3.3].map((lane, index) => ({ row: index < 2 ? 0 : 1, lane }));

// Original course layouts and descriptions, created for RIFFSHOT RACING.
export const RACE_TRACKS = [
  {
    id: 'neon-furnace', name: 'NEON FURNACE',
    description: 'Um circuito industrial amplo entre chaminés e arcos de luz.',
    theme: theme('#252932', '#ff503b', '#ff8a3d', '#211317', '#ff7043', '#ffb454'),
    width: 14, laps: 4,
    waypoints: [
      { x: 0, z: 0, y: 0 }, { x: 52, z: 3, y: 1 }, { x: 95, z: 20, y: 2 },
      { x: 112, z: 57, y: 1 }, { x: 94, z: 91, y: 0 }, { x: 55, z: 108, y: 2 },
      { x: 12, z: 98, y: 1 }, { x: -31, z: 107, y: 0 }, { x: -74, z: 91, y: 2 },
      { x: -98, z: 57, y: 1 }, { x: -89, z: 19, y: 0 }, { x: -55, z: -6, y: 1 },
    ],
    startGrid: makeGrid(),
    scenery: [
      { x: 126, z: 15, height: 24, width: 8, depth: 8 }, { x: 122, z: 90, height: 17, width: 7, depth: 7 },
      { x: -118, z: 85, height: 21, width: 9, depth: 9 }, { x: -116, z: 7, height: 15, width: 7, depth: 7 },
    ],
  },
  {
    id: 'voltage-run', name: 'VOLTAGE RUN',
    description: 'Curvas elevadas atravessam plataformas suspensas e vales de energia.',
    theme: theme('#202b35', '#38d6e8', '#a245ff', '#101629', '#54e6ff', '#b66cff'),
    width: 13, laps: 4,
    waypoints: [
      { x: 0, z: 0, y: 4 }, { x: 46, z: -4, y: 8 }, { x: 83, z: 11, y: 12 },
      { x: 104, z: 43, y: 16 }, { x: 91, z: 77, y: 20 }, { x: 55, z: 96, y: 24 },
      { x: 13, z: 86, y: 20 }, { x: -27, z: 102, y: 14 }, { x: -67, z: 87, y: 9 },
      { x: -91, z: 54, y: 6 }, { x: -79, z: 19, y: 3 }, { x: -45, z: -7, y: 2 },
    ],
    startGrid: makeGrid(),
    scenery: [
      { x: 116, z: 7, height: 18, width: 7, depth: 7 }, { x: 108, z: 96, height: 24, width: 8, depth: 8 },
      { x: -106, z: 101, height: 20, width: 8, depth: 8 }, { x: -105, z: 9, height: 16, width: 7, depth: 7 },
    ],
  },
];

export function getTrackById(id: string | null) {
  return RACE_TRACKS.find(track => track.id === id) ?? null;
}
