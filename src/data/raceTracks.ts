import type { TrackRamp } from '../race/rampLibrary.ts';

const theme = (road: string, edge: string, glow: string, sky: string, accent: string, secondary: string) => ({ road, edge, glow, sky, accent, secondary });

const makeGrid = () => [-5.1, -1.7, 1.7, 5.1].map(lane => ({ row: 0, lane }));
export const OPENING_RACE_TRACK_ID = 'neon-furnace';

// Original course layouts and descriptions, created for RIFFSHOT RACING.
export const RACE_TRACKS = [
  {
    id: 'neon-furnace', name: 'NEON FURNACE',
    description: 'Um circuito industrial amplo entre chaminés e arcos de luz.',
    theme: theme('#252932', '#ff503b', '#ff8a3d', '#211317', '#ff7043', '#ffb454'),
    width: 20, laps: 4,
    waypoints: [
      { x: -160, z: -115, y: 0 }, { x: 0, z: -115, y: 0 }, { x: 160, z: -115, y: 0 },
      { x: 190, z: -115, y: 0 }, { x: 210, z: -90, y: 0 }, { x: 210, z: 0, y: 0 },
      { x: 210, z: 90, y: 0 }, { x: 190, z: 115, y: 0 }, { x: 160, z: 115, y: 0 },
      { x: 0, z: 115, y: 0 }, { x: -160, z: 115, y: 0 }, { x: -190, z: 115, y: 0 },
      { x: -210, z: 90, y: 0 }, { x: -210, z: 0, y: 0 }, { x: -210, z: -90, y: 0 },
      { x: -190, z: -115, y: 0 },
    ],
    jumps: [
      { id: 'furnace-ramp-01', kind: 'bump', takeoff: 0.08, landingStart: 0.0812, regionId: 'furnace-south-run',
        landingEnd: 0.103, launchAngleDegrees: 7, minimumSpeed: 12, maximumVerticalSpeed: 4.2,
        rampLength: 6.5, rampHeight: 0.85, receiverLength: 6 },
      { id: 'furnace-ramp-02', kind: 'jump', takeoff: 0.18, landingStart: 0.1887, regionId: 'furnace-south-run',
        landingEnd: 0.21, launchAngleDegrees: 16, minimumSpeed: 10, maximumVerticalSpeed: 8.2,
        rampLength: 14, rampHeight: 2.4, gapLength: 11, receiverLength: 27, lavaGap: true },
      { id: 'furnace-ramp-03', kind: 'platform', takeoff: 0.32, landingStart: 0.324, regionId: 'furnace-east-run',
        landingEnd: 0.346, launchAngleDegrees: 14, minimumSpeed: 0, maximumVerticalSpeed: 8.2,
        rampLength: 14, rampHeight: 3.15, receiverLength: 33, platformLength: 23, descentLength: 9.5 },
      { id: 'furnace-ramp-04', kind: 'double', takeoff: 0.385, landingStart: 0.3953, regionId: 'furnace-east-run',
        landingEnd: 0.4112, launchAngleDegrees: 14, minimumSpeed: 0, maximumVerticalSpeed: 8.2,
        rampLength: 11, rampHeight: 2.05, receiverLength: 33, firstPlatformLength: 3,
        gapLength: 6, secondRampLength: 4, secondPlatformLength: 20, descentLength: 10 },
      { id: 'furnace-ramp-05', kind: 'jump', takeoff: 0.53, landingStart: 0.5387, regionId: 'furnace-north-run',
        landingEnd: 0.56, launchAngleDegrees: 16, minimumSpeed: 10, maximumVerticalSpeed: 8.2,
        rampLength: 14, rampHeight: 2.4, gapLength: 11, receiverLength: 27, lavaGap: true },
      { id: 'furnace-ramp-06', kind: 'double', takeoff: 0.64, landingStart: 0.6505, regionId: 'furnace-north-run',
        landingEnd: 0.666, launchAngleDegrees: 14, minimumSpeed: 0, maximumVerticalSpeed: 8.2,
        rampLength: 11, rampHeight: 2.05, receiverLength: 33, firstPlatformLength: 3,
        gapLength: 6, secondRampLength: 4, secondPlatformLength: 20, descentLength: 10 },
      { id: 'furnace-ramp-07', kind: 'bump', takeoff: 0.83, landingStart: 0.8312, regionId: 'furnace-west-run',
        landingEnd: 0.843, launchAngleDegrees: 7, minimumSpeed: 12, maximumVerticalSpeed: 4.2,
        rampLength: 6.5, rampHeight: 0.85, receiverLength: 6 },
      { id: 'furnace-ramp-08', kind: 'platform', takeoff: 0.89, landingStart: 0.894, regionId: 'furnace-west-run',
        landingEnd: 0.916, launchAngleDegrees: 14, minimumSpeed: 0, maximumVerticalSpeed: 8.2,
        rampLength: 14, rampHeight: 3.15, receiverLength: 33, platformLength: 23, descentLength: 9.5 },
    ] satisfies TrackRamp[],
    rampCount: 8,
    rampRegions: [
      { id: 'furnace-south-run', start: 0.04, end: 0.25, minimumCurveRadius: 45 },
      { id: 'furnace-east-run', start: 0.285, end: 0.445, minimumCurveRadius: 45 },
      { id: 'furnace-north-run', start: 0.50, end: 0.70, minimumCurveRadius: 45 },
      { id: 'furnace-west-run', start: 0.81, end: 0.945, minimumCurveRadius: 45 },
    ],
    startGrid: [-7.2, -2.4, 2.4, 7.2].map(lane => ({ row: 0, lane })),
    scenery: [
      { x: 250, z: -145, height: 24, width: 8, depth: 8 }, { x: 250, z: 145, height: 17, width: 7, depth: 7 },
      { x: -250, z: 145, height: 21, width: 9, depth: 9 }, { x: -250, z: -145, height: 15, width: 7, depth: 7 },
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
    rampCount: 3,
    rampRegions: [
      { id: 'voltage-north-run', start: 0.10, end: 0.20, minimumCurveRadius: 28 },
      { id: 'voltage-west-bridge', start: 0.29, end: 0.40, minimumCurveRadius: 28 },
      { id: 'voltage-south-run', start: 0.59, end: 0.72, minimumCurveRadius: 30 },
      { id: 'voltage-east-bridge', start: 0.79, end: 0.91, minimumCurveRadius: 28 },
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
