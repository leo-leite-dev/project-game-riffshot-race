import { CHARACTERS } from '../data/characters.js';
import { VEHICLE, PAINTS } from '../data/vehicles.js';
import { DIFFICULTIES } from '../data/raceDifficulty.js';
import { RACE_TRACKS } from '../data/raceTracks.js';
import { CHAMPIONSHIP_RULES } from '../data/championshipRules.js';
import { createTrackAssignmentState, assignTrack, completeAssignment } from '../race/trackAssignment.js';

const selectionIds = {
  pilotId: CHARACTERS.map(item => item.id),
  vehicleId: [VEHICLE.id],
  paintId: PAINTS.map(item => item.id),
  difficultyId: Object.values(DIFFICULTIES).map(item => item.id),
};
const trackIds = RACE_TRACKS.map(item => item.id);
const forbiddenKeys = new Set(['__proto__', 'constructor', 'prototype']);
const stateKeys = ['schemaVersion', 'revision', 'id', 'money', 'score', 'targetScore', 'division',
  'rivalId', 'rivalName', 'racesRun', 'maxRaces', 'upgrades', 'selections', 'attempt', 'tracks',
  'awardedRaceIds', 'activeRace', 'pendingResult', 'previousAttempts'];
const resultKeys = ['raceId', 'trackId', 'trackName', 'difficultyId', 'laps', 'elapsedTime', 'standings'];
const text = value => typeof value === 'string' && value.trim().length > 0;
const integer = (value, min = 0, max = Number.MAX_SAFE_INTEGER) => Number.isSafeInteger(value) && value >= min && value <= max;
const time = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const keys = (value, required, optional = []) => record(value)
  && required.every(key => Object.hasOwn(value, key))
  && Object.keys(value).every(key => required.includes(key) || optional.includes(key));
const list = (value, predicate, unique = true) => Array.isArray(value) && value.every(predicate)
  && (!unique || new Set(value).size === value.length);
const sameSelections = (a, b) => Object.keys(selectionIds).every(key => a[key] === b[key]);
const validSelections = (value, nullable = true) => keys(value, Object.keys(selectionIds))
  && Object.entries(selectionIds).every(([key, ids]) => (nullable && value[key] === null) || ids.includes(value[key]));
const outcome = (score, racesRun, targetScore) => score >= targetScore ? 'qualified'
  : racesRun >= CHAMPIONSHIP_RULES.maximumRacesPerRival ? 'failed' : 'active';

// Validate JSON data before reading schemas: no accessors, custom prototypes,
// cycles, non-JSON values or prototype-pollution keys, even in unused branches.
function safeJson(value, ancestors = new Set()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'object' || ancestors.has(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (Array.isArray(value) ? prototype !== Array.prototype
    : prototype !== Object.prototype && prototype !== null) return false;
  ancestors.add(value);
  const ownKeys = Reflect.ownKeys(value);
  let valid = true;
  for (const key of ownKeys) {
    if (Array.isArray(value) && key === 'length') continue;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (typeof key !== 'string' || forbiddenKeys.has(key) || !descriptor.enumerable
      || !Object.hasOwn(descriptor, 'value') || !safeJson(descriptor.value, ancestors)) {
      valid = false;
      break;
    }
  }
  if (Array.isArray(value) && (Object.keys(value).length !== value.length
    || Object.keys(value).some((key, index) => key !== String(index)))) valid = false;
  ancestors.delete(value);
  return valid;
}

function validResult(value, receipt = false) {
  if (!keys(value, receipt ? [...resultKeys, 'reward', 'totals', 'outcome'] : resultKeys, ['attemptId'])
    || !text(value.raceId) || !trackIds.includes(value.trackId) || !text(value.trackName)
    || !selectionIds.difficultyId.includes(value.difficultyId) || !integer(value.laps, 1)
    || !time(value.elapsedTime) || (Object.hasOwn(value, 'attemptId') && !text(value.attemptId))
    || !Array.isArray(value.standings) || value.standings.length !== 4) return false;
  const standings = value.standings;
  if (!standings.every((entry, index) => keys(entry,
    ['id', 'name', 'position', 'isPlayer', 'finishTime', 'lapsCompleted', 'paintColor'])
    && text(entry.id) && text(entry.name) && entry.position === index + 1
    && typeof entry.isPlayer === 'boolean' && time(entry.finishTime)
    && (index === 0 || entry.finishTime >= standings[index - 1].finishTime)
    && entry.lapsCompleted === value.laps && typeof entry.paintColor === 'string'
    && /^#[0-9a-f]{6}$/i.test(entry.paintColor))) return false;
  const players = standings.filter(entry => entry.isPlayer);
  if (new Set(standings.map(entry => entry.id)).size !== 4 || players.length !== 1
    || !selectionIds.pilotId.includes(players[0].id)) return false;
  if (!receipt) return true;
  const reward = CHAMPIONSHIP_RULES.rewardsByPosition[players[0].position];
  return keys(value.reward, ['score', 'money']) && value.reward.score === reward.score
    && value.reward.money === reward.money && keys(value.totals, ['money', 'score', 'racesRun'])
    && integer(value.totals.money, reward.money) && integer(value.totals.score, reward.score)
    && integer(value.totals.racesRun, 1, CHAMPIONSHIP_RULES.maximumRacesPerRival)
    && ['active', 'qualified', 'failed'].includes(value.outcome);
}

function validState(value) {
  if (!keys(value, stateKeys) || value.schemaVersion !== 1 || !integer(value.revision)
    || !text(value.id) || !integer(value.money) || !integer(value.score)
    || !integer(value.targetScore, 1, 1e6) || value.division !== 'B'
    || value.rivalId !== 'opening-b' || value.rivalName !== 'DESAFIO INICIAL'
    || value.maxRaces !== CHAMPIONSHIP_RULES.maximumRacesPerRival
    || !integer(value.racesRun, 0, value.maxRaces) || !validSelections(value.selections)
    || !record(value.upgrades) || !Object.entries(value.upgrades).every(([key, level]) => text(key) && integer(level))
    || !keys(value.attempt, ['id', 'number', 'status']) || !text(value.attempt.id)
    || !integer(value.attempt.number, 1)
    || value.attempt.status !== outcome(value.score, value.racesRun, value.targetScore)
    || !Array.isArray(value.previousAttempts) || value.previousAttempts.length !== value.attempt.number - 1
    || !list(value.awardedRaceIds, text)) return false;
  const previousIds = new Set([value.attempt.id]);
  for (const [index, previous] of value.previousAttempts.entries()) {
    if (!keys(previous, ['id', 'number', 'score', 'racesRun', 'status', 'tracks'])
      || !text(previous.id) || previousIds.has(previous.id) || previous.number !== index + 1
      || !integer(previous.score, 0, value.targetScore - 1) || previous.racesRun !== value.maxRaces
      || previous.status !== 'failed' || !list(previous.tracks, id => trackIds.includes(id), false)
      || previous.tracks.length !== previous.racesRun) return false;
    previousIds.add(previous.id);
  }
  const previousRuns = value.previousAttempts.length * value.maxRaces;
  const tracks = value.tracks;
  if (value.awardedRaceIds.length !== previousRuns + value.racesRun
    || !keys(tracks, ['remainingTrackIds', 'pendingTrackId', 'lastCompletedTrackId', 'completedRaceIds', 'freeChoiceAvailable', 'history'])
    || !list(tracks.remainingTrackIds, id => trackIds.includes(id))
    || !(tracks.pendingTrackId === null || (trackIds.includes(tracks.pendingTrackId)
      && tracks.pendingTrackId === tracks.remainingTrackIds[0]))
    || !(tracks.lastCompletedTrackId === null || trackIds.includes(tracks.lastCompletedTrackId))
    || !list(tracks.completedRaceIds, text) || tracks.completedRaceIds.length !== value.racesRun
    || !tracks.completedRaceIds.every((id, index) => id === value.awardedRaceIds[previousRuns + index])
    || typeof tracks.freeChoiceAvailable !== 'boolean'
    || (tracks.freeChoiceAvailable && (value.attempt.number === 1 || value.racesRun !== 0))
    || !list(tracks.history, id => trackIds.includes(id), false) || tracks.history.length !== value.racesRun
    || (value.racesRun > 0 && tracks.lastCompletedTrackId !== tracks.history.at(-1))) return false;
  if (value.activeRace !== null) {
    const race = value.activeRace;
    if (!keys(race, ['id', 'attemptId', 'trackId', 'selections']) || !text(race.id)
      || race.attemptId !== value.attempt.id || race.trackId !== tracks.pendingTrackId
      || !trackIds.includes(race.trackId) || value.awardedRaceIds.includes(race.id)
      || value.attempt.status !== 'active' || value.pendingResult !== null
      || !validSelections(race.selections, false) || !sameSelections(race.selections, value.selections)) return false;
  }
  if (value.pendingResult !== null) {
    const result = value.pendingResult;
    if (!validResult(result, true) || result.raceId !== value.awardedRaceIds.at(-1)
      || result.trackId !== tracks.history.at(-1) || value.racesRun === 0
      || (Object.hasOwn(result, 'attemptId') && result.attemptId !== value.attempt.id)
      || result.totals.money !== value.money || result.totals.score !== value.score
      || result.totals.racesRun !== value.racesRun || result.outcome !== value.attempt.status
      || value.activeRace !== null || tracks.pendingTrackId !== null) return false;
  }
  return true;
}

export function isValidChampionshipState(value) {
  try {
    return safeJson(value) && validState(value);
  } catch {
    return false;
  }
}

export function createChampionshipState({ id, attemptId }) {
  if (!text(id) || !text(attemptId)) throw new TypeError('Campeonato e tentativa precisam de IDs não vazios.');
  return {
    schemaVersion: 1, revision: 0, id, money: 2000, score: 0,
    targetScore: CHAMPIONSHIP_RULES.targetScore, division: 'B',
    rivalId: 'opening-b', rivalName: 'DESAFIO INICIAL', racesRun: 0,
    maxRaces: CHAMPIONSHIP_RULES.maximumRacesPerRival, upgrades: {},
    selections: { pilotId: null, vehicleId: null, paintId: null, difficultyId: null },
    attempt: { id: attemptId, number: 1, status: 'active' },
    tracks: { ...createTrackAssignmentState(), history: [] },
    awardedRaceIds: [], activeRace: null, pendingResult: null, previousAttempts: [],
  };
}

export function setSelections(state, patch) {
  if (!isValidChampionshipState(state) || !safeJson(patch) || !record(patch)
    || !Object.keys(patch).every(key => Object.hasOwn(selectionIds, key))) return state;
  const selections = { ...state.selections, ...patch };
  if (!validSelections(selections) || sameSelections(selections, state.selections)) return state;
  return { ...state, selections, activeRace: null };
}

export function ensureAssignedTrack(state, rng = Math.random) {
  if (!isValidChampionshipState(state) || state.attempt.status !== 'active'
    || state.pendingResult || state.tracks.pendingTrackId || typeof rng !== 'function') return state;
  const tracks = assignTrack(state.tracks, rng);
  const next = { ...state, tracks };
  return isValidChampionshipState(next) ? next : state;
}

export function chooseSpecialTrack(state, trackId) {
  if (!isValidChampionshipState(state) || state.attempt.status !== 'active'
    || !state.tracks.freeChoiceAvailable || state.pendingResult || !trackIds.includes(trackId)) return state;
  const remaining = state.tracks.remainingTrackIds.length ? state.tracks.remainingTrackIds : trackIds;
  if (!remaining.includes(trackId) || state.tracks.pendingTrackId === trackId) return state;
  return { ...state, activeRace: null, tracks: { ...state.tracks,
    remainingTrackIds: [trackId, ...remaining.filter(id => id !== trackId)], pendingTrackId: trackId,
  } };
}

export function beginChampionshipRace(state, raceId) {
  if (!isValidChampionshipState(state) || !text(raceId) || state.attempt.status !== 'active'
    || state.racesRun >= state.maxRaces || state.pendingResult || !validSelections(state.selections, false)
    || !trackIds.includes(state.tracks.pendingTrackId) || state.awardedRaceIds.includes(raceId)) return state;
  if (state.activeRace) return state; // Only the same unfinished race can be resumed.
  return { ...state, activeRace: { id: raceId, attemptId: state.attempt.id,
    trackId: state.tracks.pendingTrackId, selections: { ...state.selections } } };
}

export function applyChampionshipResult(state, result) {
  if (!isValidChampionshipState(state) || !safeJson(result) || !validResult(result)
    || !state.activeRace || state.pendingResult || state.attempt.status !== 'active'
    || state.awardedRaceIds.includes(result.raceId) || result.raceId !== state.activeRace.id
    || result.trackId !== state.activeRace.trackId || state.activeRace.attemptId !== state.attempt.id
    || (Object.hasOwn(result, 'attemptId') && result.attemptId !== state.attempt.id)
    || result.difficultyId !== state.activeRace.selections.difficultyId) return state;
  const player = result.standings.find(entry => entry.isPlayer);
  if (player.id !== state.activeRace.selections.pilotId) return state;
  const reward = { ...CHAMPIONSHIP_RULES.rewardsByPosition[player.position] };
  const money = state.money + reward.money;
  const score = state.score + reward.score;
  const racesRun = state.racesRun + 1;
  const status = outcome(score, racesRun, state.targetScore);
  const next = { ...state, money, score, racesRun, attempt: { ...state.attempt, status },
    tracks: { ...completeAssignment(state.tracks, result.raceId, result.trackId),
      history: [...state.tracks.history, result.trackId] },
    activeRace: null, awardedRaceIds: [...state.awardedRaceIds, result.raceId],
    pendingResult: { ...result, standings: result.standings.map(entry => ({ ...entry })),
      reward, totals: { money, score, racesRun }, outcome: status },
  };
  return isValidChampionshipState(next) ? next : state;
}

export function acknowledgeChampionshipResult(state, newAttemptId) {
  if (!isValidChampionshipState(state) || state.pendingResult === null) return state;
  if (state.attempt.status !== 'failed') return { ...state, pendingResult: null };
  if (!text(newAttemptId) || newAttemptId === state.attempt.id
    || state.previousAttempts.some(attempt => attempt.id === newAttemptId)) return state;
  return { ...state, money: 0, score: 0, racesRun: 0, upgrades: {}, activeRace: null, pendingResult: null,
    attempt: { id: newAttemptId, number: state.attempt.number + 1, status: 'active' },
    tracks: { ...createTrackAssignmentState(), history: [], freeChoiceAvailable: true,
      lastCompletedTrackId: state.tracks.lastCompletedTrackId },
    previousAttempts: [...state.previousAttempts, { ...state.attempt, score: state.score,
      racesRun: state.racesRun, tracks: [...state.tracks.history] }],
  };
}
