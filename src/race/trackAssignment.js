import { RACE_TRACKS, getTrackById } from '../data/raceTracks.js';

export const TRACK_ASSIGNMENT_KEY = 'trackAssignment';

export function createTrackAssignmentState() {
  return {
    remainingTrackIds: [], pendingTrackId: null, lastCompletedTrackId: null,
    completedRaceIds: [], freeChoiceAvailable: false,
  };
}

// Pure transitions: callers own the state; only allocating a new cycle uses RNG.
export function assignTrack(state = createTrackAssignmentState(), rng = Math.random) {
  if (state.pendingTrackId) return state;
  let remainingTrackIds = state.remainingTrackIds;
  if (!remainingTrackIds.length) {
    remainingTrackIds = RACE_TRACKS.map(track => track.id);
    for (let i = remainingTrackIds.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rng() * (i + 1));
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

export function completeAssignment(state, raceId, trackId) {
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

export function getAssignedTrack(registry, rng = Math.random) {
  const previous = registry.get(TRACK_ASSIGNMENT_KEY);
  const state = assignTrack(previous, rng);
  if (state !== previous) registry.set(TRACK_ASSIGNMENT_KEY, state);
  return getTrackById(state.pendingTrackId);
}

// Integration contract: call only from finishRace, using a unique session race ID.
// Confirmation, returning to menus and aborting must never call this function.
export function completeTrackAssignment(registry, raceId, trackId) {
  const previous = registry.get(TRACK_ASSIGNMENT_KEY);
  const state = completeAssignment(previous, raceId, trackId);
  if (state === previous) return false;
  registry.set(TRACK_ASSIGNMENT_KEY, state);
  return true;
}

export function canChooseTrack(registry) {
  // Reserved for the first race after a future failed eight-race/money goal.
  // No current UI grants this flag; campaign/economy integration comes later.
  return registry.get(TRACK_ASSIGNMENT_KEY)?.freeChoiceAvailable === true;
}
