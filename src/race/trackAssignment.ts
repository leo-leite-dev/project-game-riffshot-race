import { OPENING_RACE_TRACK_ID, RACE_TRACKS, getTrackById } from '../data/raceTracks.ts';
import type Phaser from 'phaser';

export const TRACK_ASSIGNMENT_KEY = 'trackAssignment';

export interface TrackAssignmentState {
  remainingTrackIds: string[];
  pendingTrackId: string | null;
  lastCompletedTrackId: string | null;
  completedRaceIds: (string | number)[];
  freeChoiceAvailable: boolean;
}

export function createTrackAssignmentState(): TrackAssignmentState {
  return {
    remainingTrackIds: [], pendingTrackId: null, lastCompletedTrackId: null,
    completedRaceIds: [], freeChoiceAvailable: false,
  };
}

// Pure transitions: callers own the state; only allocating a new cycle uses RNG.
export function assignTrack(state: TrackAssignmentState = createTrackAssignmentState(), rng = Math.random): TrackAssignmentState {
  if (state.pendingTrackId) return state;
  let remainingTrackIds = state.remainingTrackIds;
  if (!remainingTrackIds.length) {
    remainingTrackIds = RACE_TRACKS.map(track => track.id);
    const openingRace = state.completedRaceIds.length === 0 && state.lastCompletedTrackId === null;
    if (openingRace) {
      const openingIndex = remainingTrackIds.indexOf(OPENING_RACE_TRACK_ID);
      if (openingIndex > 0) [remainingTrackIds[0], remainingTrackIds[openingIndex]] = [remainingTrackIds[openingIndex]!, remainingTrackIds[0]!];
    }
    for (let i = remainingTrackIds.length - 1; i > (openingRace ? 1 : 0); i -= 1) {
      const j = openingRace ? 1 + Math.floor(rng() * i) : Math.floor(rng() * (i + 1));
      [remainingTrackIds[i], remainingTrackIds[j]] = [remainingTrackIds[j], remainingTrackIds[i]];
    }
    if (remainingTrackIds.length > 1 && remainingTrackIds[0] === state.lastCompletedTrackId) {
      const next = 1 + Math.floor(rng() * (remainingTrackIds.length - 1));
      [remainingTrackIds[0], remainingTrackIds[next]] = [remainingTrackIds[next], remainingTrackIds[0]];
    }
  }
  // The pending track stays in the cycle until a real race finishes.
  return { ...state, remainingTrackIds, pendingTrackId: remainingTrackIds[0] };
}

export function completeAssignment(state: TrackAssignmentState | undefined, raceId: string | number, trackId: string): TrackAssignmentState | undefined {
  const validRaceId = (typeof raceId === 'string' && raceId.trim().length > 0)
    || (typeof raceId === 'number' && Number.isFinite(raceId));
  if (!state || !validRaceId || state.completedRaceIds.includes(raceId)
    || !trackId || trackId !== state.pendingTrackId) return state;
  return {
    ...state,
    remainingTrackIds: state.remainingTrackIds.filter(id => id !== trackId),
    pendingTrackId: null,
    lastCompletedTrackId: trackId,
    completedRaceIds: [...state.completedRaceIds, raceId],
    freeChoiceAvailable: false,
  };
}

export function getAssignedTrack(registry: Phaser.Data.DataManager, rng = Math.random) {
  const previous = registry.get(TRACK_ASSIGNMENT_KEY) as TrackAssignmentState | undefined;
  const state = assignTrack(previous, rng);
  if (state !== previous) registry.set(TRACK_ASSIGNMENT_KEY, state);
  return getTrackById(state.pendingTrackId);
}

// Integration contract: call only from finishRace, using a unique session race ID.
// Confirmation, returning to menus and aborting must never call this function.
export function completeTrackAssignment(registry: Phaser.Data.DataManager, raceId: string | number, trackId: string) {
  const previous = registry.get(TRACK_ASSIGNMENT_KEY) as TrackAssignmentState | undefined;
  const state = completeAssignment(previous, raceId, trackId);
  if (state === previous) return false;
  registry.set(TRACK_ASSIGNMENT_KEY, state);
  return true;
}

export function canChooseTrack(registry: Phaser.Data.DataManager) {
  // Reserved for the first race after a future failed eight-race/money goal.
  // No current UI grants this flag; campaign/economy integration comes later.
  return registry.get(TRACK_ASSIGNMENT_KEY)?.freeChoiceAvailable === true;
}
