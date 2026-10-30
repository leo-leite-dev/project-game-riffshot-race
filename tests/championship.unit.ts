import test from 'node:test';
import assert from 'node:assert/strict';
import { CHARACTERS } from '../src/data/characters.ts';
import { VEHICLE, PAINTS } from '../src/data/vehicles.ts';
import { DIFFICULTIES } from '../src/data/raceDifficulty.ts';
import { RACE_TRACKS } from '../src/data/raceTracks.ts';
import { CHAMPIONSHIP_RULES } from '../src/data/championshipRules.ts';
import { createTrackAssignmentState } from '../src/race/trackAssignment.ts';
import {
  createChampionshipState, setSelections, ensureAssignedTrack, chooseSpecialTrack,
  beginChampionshipRace, applyChampionshipResult as applyChampionshipResultBase,
  acknowledgeChampionshipResult as acknowledgeChampionshipResultBase, migrateChampionshipState,
  isValidChampionshipState,
} from '../src/championship/championshipState.ts';
import {
  CHAMPIONSHIP_SAVE_KEY, CHAMPIONSHIP_BACKUP_KEY, loadChampionship, saveChampionship,
} from '../src/championship/championshipStorage.ts';
import type { ChampionshipResult, ChampionshipState } from '../src/championship/championshipState.ts';

type UnsafeRecord = Record<string, unknown>;
const asRecord = (value: unknown): UnsafeRecord => value as UnsafeRecord;
const required = <T>(value: T | null | undefined): T => {
  assert.ok(value);
  return value;
};
const acknowledgeChampionshipResult = (state: ChampionshipState, attemptId?: string) =>
  acknowledgeChampionshipResultBase(state, attemptId as string);
const applyChampionshipResult = (state: ChampionshipState, result: unknown) =>
  applyChampionshipResultBase(state, result as ChampionshipResult);

const selections = {
  pilotId: CHARACTERS[1].id, vehicleId: VEHICLE.id,
  paintId: PAINTS[1].id, difficultyId: DIFFICULTIES.normal.id,
};
const initial = () => createChampionshipState({ id: 'career-1', attemptId: 'attempt-1' });
// Existing race/save regressions use an already-owned legacy car; shop tests
// exercise fresh wallets and acquisition separately in vehicle-shop.unit.ts.
const selected = () => setSelections({ ...initial(), ownedVehicleIds: [VEHICLE.id] }, selections);
const ready = (state: ChampionshipState = selected(), id = `race-${state.attempt.number}-${state.racesRun + 1}`) =>
  beginChampionshipRace(ensureAssignedTrack(state, () => 0.25), id);
const clone = <T>(value: T): T => structuredClone(value);
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

// Original pilot IDs; player can occupy any position, while times remain sorted.
function resultFor(state: ChampionshipState, position = 1): ChampionshipResult {
  const race = state.activeRace;
  assert.ok(race);
  const track = RACE_TRACKS.find(item => item.id === race.trackId)!;
  const player = CHARACTERS.find(item => item.id === race.selections.pilotId)!;
  const opponents = CHARACTERS.filter(item => item.id !== player.id).slice(0, 3);
  const entrants = [...opponents];
  entrants.splice(position - 1, 0, player);
  return {
    raceId: race.id, trackId: track.id, trackName: track.name,
    difficultyId: required(race.selections.difficultyId), laps: track.laps, elapsedTime: 40,
    standings: entrants.map((pilot, index) => ({
      id: pilot.id, name: pilot.name, position: (index + 1) as 1 | 2 | 3 | 4, isPlayer: pilot.id === player.id,
      finishTime: (index + 1) * 10, lapsCompleted: track.laps,
      paintColor: pilot.id === player.id ? PAINTS[1].color : '#41d7ff',
    })),
  };
}

function runPositions(positions: number[], state: ChampionshipState = selected()) {
  for (const [index, position] of positions.entries()) {
    state = ready(state);
    assert.ok(state.activeRace);
    state = applyChampionshipResult(state, resultFor(state, position));
    assert.ok(isValidChampionshipState(state));
    if (index < positions.length - 1) state = acknowledgeChampionshipResult(state);
  }
  return state;
}

class MemoryStorage implements Storage {
  data: Map<string, string>;
  writes: [string, string][];
  failKey: string | null;
  constructor(entries: [string, string][] = []) {
    this.data = new Map(entries);
    this.writes = [];
    this.failKey = null;
  }
  get length() { return this.data.size; }
  key(index: number) { return [...this.data.keys()][index] ?? null; }
  getItem(key: string) { return this.data.get(key) ?? null; }
  setItem(key: string, value: string) {
    if (key === this.failKey) throw new Error('QuotaExceededError');
    this.writes.push([key, value]);
    this.data.set(key, value);
  }
  removeItem(key: string) { this.data.delete(key); }
  clear() { this.data.clear(); }
}
const storageFixture = (overrides: Partial<Storage> = {}): Storage => {
  const storage = new MemoryStorage();
  for (const [key, value] of Object.entries(overrides)) {
    Object.defineProperty(storage, key, { configurable: true, value, writable: true });
  }
  return storage;
};

function roundTrip(state: ChampionshipState): ChampionshipState {
  const storage = new MemoryStorage();
  const saved = saveChampionship(storage, state, null);
  assert.equal(saved.ok, true, saved.warning ?? undefined);
  const loaded = loadChampionship(storage);
  assert.equal(loaded.writable, true, loaded.warning ?? undefined);
  assert.deepEqual(loaded.state, state);
  return loaded.state!;
}

test('estado inicial canônico, dinheiro existente e API de seleções reais', () => {
  const state = initial();
  assert.deepEqual(state, {
    schemaVersion: 3, revision: 0, id: 'career-1', money: 2000, score: 0, targetScore: 1400,
    division: 'B', rivalId: 'opening-b', rivalName: 'DESAFIO INICIAL', racesRun: 0, maxRaces: 8,
    upgrades: {}, selections: { pilotId: null, vehicleId: null, paintId: null, difficultyId: null },
    attempt: { id: 'attempt-1', number: 1, status: 'active' },
    tracks: { ...createTrackAssignmentState(), history: [] }, awardedRaceIds: [],
    activeRace: null, pendingResult: null, previousAttempts: [], ownedVehicleIds: [], rivalRewardChoice: null,
  });
  assert.equal(isValidChampionshipState(state), true);
  assert.equal(isValidChampionshipState(roundTrip(state)), true);
  assert.throws(() => createChampionshipState({ id: '', attemptId: 'a' }), TypeError);
  assert.throws(() => createChampionshipState({ id: 'c', attemptId: ' ' }), TypeError);
  const assigned = ensureAssignedTrack(state, () => 0);
  assert.equal(beginChampionshipRace(assigned, 'r'), assigned);
});

for (const [position, expected] of [[1, { score: 300, money: 1500 }], [2, { score: 170, money: 850 }],
  [3, { score: 70, money: 400 }], [4, { score: 0, money: 0 }]] as const) {
  test(`posição ${position}: recompensa real, recibo e consumo único`, () => {
    const state = freeze(ready());
    const result = freeze(resultFor(state, position));
    const next = applyChampionshipResult(state, result);
    assert.deepEqual(CHAMPIONSHIP_RULES.rewardsByPosition[position], expected);
    assert.equal(next.money, 2000 + expected.money);
    assert.equal(next.score, expected.score);
    assert.equal(next.racesRun, 1);
    assert.equal(next.revision, state.revision);
    assert.deepEqual(next.pendingResult, { ...result, reward: expected,
      totals: { money: next.money, score: next.score, racesRun: 1 }, outcome: 'active' });
    assert.notEqual(next.pendingResult.standings, result.standings);
    assert.equal(next.activeRace, null);
    assert.deepEqual(next.tracks.completedRaceIds, [result.raceId]);
    assert.deepEqual(next.awardedRaceIds, [result.raceId]);
    assert.deepEqual(next.tracks.history, [result.trackId]);
    assert.equal(next.tracks.pendingTrackId, null);
    assert.equal(next.tracks.remainingTrackIds.length, RACE_TRACKS.length - 1);
    assert.equal(isValidChampionshipState(next), true);
    assert.equal(applyChampionshipResult(next, result), next);
  });
}

test('SCORE e MONEY independentes: dinheiro não é meta e vitória ocorre antes da oitava', () => {
  const moneyOnly = { ...selected(), money: 900000 };
  const losing = runPositions(Array(8).fill(4), moneyOnly);
  assert.equal(losing.score, 0);
  assert.equal(losing.money, 900000);
  assert.equal(losing.attempt.status, 'failed');
  const winner = runPositions(Array(5).fill(1));
  assert.equal(winner.racesRun, 5);
  assert.equal(winner.score, 1500);
  assert.equal(winner.attempt.status, 'qualified');
  assert.equal(ensureAssignedTrack(winner), winner);
  assert.equal(beginChampionshipRace(winner, 'extra'), winner);
  const acknowledged = acknowledgeChampionshipResult(winner);
  assert.equal(acknowledged.pendingResult, null);
  assert.deepEqual({ ...acknowledged, pendingResult: winner.pendingResult }, winner);
  assert.equal(acknowledged.rivalId, 'opening-b');
  assert.equal(acknowledged.division, 'B');
});

test('meta atingida exatamente na oitava tem prioridade sobre fracasso', () => {
  const state = runPositions([...Array(7).fill(2), 1]);
  assert.equal(state.racesRun, 8);
  assert.equal(state.score, 1490);
  assert.equal(state.attempt.status, 'qualified');
  assert.equal(required(state.pendingResult).outcome, 'qualified');
  assert.equal(isValidChampionshipState(roundTrip(state)), true);
});

test('variação futura da carteira não gasta SCORE nem revoga a qualificação', () => {
  const qualified = acknowledgeChampionshipResult(runPositions(Array(5).fill(1)));
  // A state-level contract for a future real shop, not a fake purchase/API.
  const zeroWallet = { ...qualified, money: 0 };
  assert.equal(isValidChampionshipState(zeroWallet), true);
  assert.equal(zeroWallet.score, 1500);
  assert.equal(zeroWallet.attempt.status, 'qualified');
  assert.equal(beginChampionshipRace(zeroWallet, 'extra-after-shop'), zeroWallet);
});

test('fracasso na oitava mantém totais, upgrades e pending até ack; reset preserva seleções e ledger', () => {
  const state = runPositions(Array(8).fill(2), { ...selected(), upgrades: { engine: 2 }, revision: 23 });
  assert.equal(state.score, 1360);
  assert.equal(state.money, 8800);
  assert.equal(state.attempt.status, 'failed');
  assert.deepEqual(state.upgrades, { engine: 2 });
  const loaded = roundTrip(state);
  assert.equal(ensureAssignedTrack(loaded), loaded);
  assert.equal(beginChampionshipRace(loaded, 'ninth'), loaded);
  assert.equal(acknowledgeChampionshipResult(loaded), loaded);
  assert.equal(acknowledgeChampionshipResult(loaded, loaded.attempt.id), loaded);
  const reset = acknowledgeChampionshipResult(freeze(loaded), 'attempt-2');
  assert.deepEqual([reset.money, reset.score, reset.racesRun], [0, 0, 0]);
  assert.deepEqual(reset.upgrades, {});
  assert.deepEqual(reset.selections, selections);
  assert.equal(reset.targetScore, loaded.targetScore);
  assert.equal(reset.division, loaded.division);
  assert.equal(reset.rivalId, loaded.rivalId);
  assert.equal(reset.revision, 23);
  assert.deepEqual(reset.attempt, { id: 'attempt-2', number: 2, status: 'active' });
  assert.deepEqual(reset.previousAttempts, [{ id: 'attempt-1', number: 1, score: 1360,
    racesRun: 8, status: 'failed', tracks: loaded.tracks.history }]);
  assert.equal(new Set(loaded.tracks.history).size < loaded.tracks.history.length, true);
  assert.equal(reset.tracks.lastCompletedTrackId, loaded.tracks.lastCompletedTrackId);
  assert.deepEqual(reset.tracks.history, []);
  assert.deepEqual(reset.tracks.completedRaceIds, []);
  assert.deepEqual(reset.awardedRaceIds, loaded.awardedRaceIds);
  assert.equal(reset.tracks.freeChoiceAvailable, true);
  assert.deepEqual(roundTrip(reset), reset);
});

test('escolha especial persiste e só primeiro resultado da nova tentativa consome flag/pista', () => {
  const failed = runPositions(Array(8).fill(4));
  let state = acknowledgeChampionshipResult(failed, 'attempt-2');
  state = roundTrip(ensureAssignedTrack(state, () => 0));
  const chosen = required(RACE_TRACKS.find(track => track.id !== state.tracks.pendingTrackId)).id;
  const oldPool = [...state.tracks.remainingTrackIds];
  state = chooseSpecialTrack(freeze(state), chosen);
  assert.equal(state.tracks.pendingTrackId, chosen);
  assert.deepEqual(state.tracks.remainingTrackIds, [chosen, ...oldPool.filter(id => id !== chosen)]);
  assert.equal(state.tracks.freeChoiceAvailable, true);
  state = roundTrip(state);
  assert.equal(ensureAssignedTrack(state, () => assert.fail('sem novo sorteio')), state);
  const racing = beginChampionshipRace(state, 'retry-first');
  assert.equal(racing.tracks, state.tracks);
  assert.equal(beginChampionshipRace(racing, 'retry-first'), racing);
  assert.equal(beginChampionshipRace(racing, 'replacement'), racing);
  const next = applyChampionshipResult(racing, resultFor(racing));
  assert.equal(next.tracks.freeChoiceAvailable, false);
  assert.deepEqual(next.tracks.history, [chosen]);
  assert.equal(next.tracks.remainingTrackIds.includes(chosen), false);
  const acknowledged = acknowledgeChampionshipResult(next);
  assert.equal(chooseSpecialTrack(acknowledged, chosen), acknowledged);
  assert.equal(acknowledgeChampionshipResult(acknowledged), acknowledged);
});

test('escolha especial pode iniciar ciclo sem sortear e nunca habilita a própria flag', () => {
  const state = selected();
  assert.equal(chooseSpecialTrack(state, RACE_TRACKS[0].id), state);
  const reset = acknowledgeChampionshipResult(runPositions(Array(8).fill(4)), 'attempt-2');
  assert.equal(chooseSpecialTrack(reset, 'invalid'), reset);
  const chosen = chooseSpecialTrack(reset, RACE_TRACKS[1].id);
  assert.equal(chosen.tracks.pendingTrackId, RACE_TRACKS[1].id);
  assert.equal(chosen.tracks.remainingTrackIds.length, RACE_TRACKS.length);
  assert.equal(chosen.tracks.freeChoiceAvailable, true);
  assert.equal(isValidChampionshipState(chosen), true);
});

test('voltar, confirmar, abandonar e ensure não randomizam nem consomem pendência', () => {
  let calls = 0;
  const rng = () => { calls += 1; return 0; };
  const state = ensureAssignedTrack(selected(), rng);
  const assignedCalls = calls;
  for (let index = 0; index < 5; index += 1) assert.equal(ensureAssignedTrack(state, rng), state);
  let racing = beginChampionshipRace(state, 'unfinished');
  assert.deepEqual(racing.activeRace, { id: 'unfinished', attemptId: state.attempt.id,
    trackId: state.tracks.pendingTrackId, selections });
  assert.notEqual(racing.activeRace.selections, state.selections);
  racing = roundTrip(racing);
  assert.equal(beginChampionshipRace(racing, 'unfinished'), racing);
  assert.equal(beginChampionshipRace(racing, 'another'), racing);
  assert.equal(ensureAssignedTrack(racing, rng), racing);
  assert.equal(calls, assignedCalls);
  assert.deepEqual(racing.tracks, state.tracks);
  assert.deepEqual([racing.money, racing.score, racing.racesRun], [2000, 0, 0]);
});

test('ledger é idempotente após reload, ack, reset e tentativa futura na mesma pista', () => {
  const racing = ready();
  const result = resultFor(racing, 4);
  const completed = roundTrip(applyChampionshipResult(racing, result));
  assert.equal(applyChampionshipResult(completed, result), completed);
  const acknowledged = acknowledgeChampionshipResult(completed);
  assert.equal(applyChampionshipResult(acknowledged, result), acknowledged);
  assert.equal(beginChampionshipRace(ensureAssignedTrack(acknowledged), result.raceId).activeRace, null);
  const failed = runPositions(Array(7).fill(4), acknowledged);
  let reset = roundTrip(acknowledgeChampionshipResult(failed, 'attempt-2'));
  reset = chooseSpecialTrack(reset, result.trackId);
  assert.equal(beginChampionshipRace(reset, result.raceId), reset);
  const newRace = beginChampionshipRace(reset, 'new-attempt-first');
  assert.equal(applyChampionshipResult(newRace, result), newRace);
  const accepted = applyChampionshipResult(newRace, resultFor(newRace));
  assert.equal(accepted.awardedRaceIds.length, 9);
  assert.equal(accepted.money, 1500);
  assert.equal(accepted.score, 300);
});

test('merge parcial preserva progresso/upgrades e bloqueia mudanças durante corrida ou recibo', () => {
  const progress = acknowledgeChampionshipResult(runPositions([2]));
  const state = freeze(ready({ ...progress, upgrades: { engine: 3 }, revision: 42 }));
  const patch = { pilotId: CHARACTERS[2].id, difficultyId: DIFFICULTIES.hard.id };
  assert.equal(setSelections(state, patch), state, 'trocar piloto/dificuldade não cancela a corrida para contornar bloqueios');
  const next = setSelections({ ...state, activeRace: null }, patch);
  assert.deepEqual(next.selections, { ...state.selections, pilotId: CHARACTERS[2].id, difficultyId: DIFFICULTIES.hard.id });
  assert.equal(next.activeRace, null);
  for (const key of ['money', 'score', 'racesRun', 'upgrades', 'tracks', 'awardedRaceIds', 'revision'] as const) {
    assert.equal(next[key], state[key]);
  }
  assert.equal(setSelections(state, {}), state);
  assert.equal(setSelections(state, { pilotId: state.selections.pilotId }), state);
  const pending = runPositions([1]);
  const changed = setSelections(pending, { pilotId: CHARACTERS[2].id, difficultyId: DIFFICULTIES.hard.id });
  assert.equal(changed, pending);
  assert.equal(changed.pendingResult, pending.pendingResult);
  assert.equal(isValidChampionshipState(roundTrip(changed)), true);
});

test('revision permanece sob responsabilidade do serviço em todas as transições', () => {
  let state = { ...initial(), ownedVehicleIds: [VEHICLE.id], revision: 91 };
  state = setSelections(state, selections);
  state = ensureAssignedTrack(state, () => 0);
  state = beginChampionshipRace(state, 'revision-race');
  state = applyChampionshipResult(state, resultFor(state));
  state = acknowledgeChampionshipResult(state);
  assert.equal(state.revision, 91);
});

for (const patch of [null, [], { pilotId: 'fake' }, { vehicleId: 'fake' }, { paintId: 'fake' },
  { difficultyId: 'fake' }, { unexpected: true }, { pilotId: undefined },
  JSON.parse('{"__proto__":{"polluted":true}}'), { constructor: 'bad' }]) {
  test(`patch de seleções inválido é ignorado: ${JSON.stringify(patch)}`, () => {
    const state = selected();
    assert.equal(setSelections(state, patch), state);
  });
}

test('início exige seleções completas, pista e race ID novo não vazio', () => {
  const incomplete = ensureAssignedTrack(initial(), () => 0);
  assert.equal(beginChampionshipRace(incomplete, 'r'), incomplete);
  const noTrack = selected();
  assert.equal(beginChampionshipRace(noTrack, 'r'), noTrack);
  const assigned = ensureAssignedTrack(selected(), () => 0);
  for (const id of [null, undefined, '', ' ', 1, {}, NaN]) {
    assert.equal(beginChampionshipRace(assigned, id as string), assigned);
  }
  assert.equal(beginChampionshipRace(setSelections(assigned, { paintId: null }), 'r').activeRace, null);
});

const invalidResults: Record<string, (result: ChampionshipResult) => void> = {
  'race ID diferente': result => { result.raceId = 'old-race'; },
  'pista diferente': result => { result.trackId = required(RACE_TRACKS.find(track => track.id !== result.trackId)).id; },
  'tentativa antiga': result => { result.attemptId = 'old-attempt'; },
  'dificuldade diferente': result => { result.difficultyId = DIFFICULTIES.hard.id; },
  'nome de pista vazio': result => { result.trackName = ''; },
  'voltas zero': result => { result.laps = 0; },
  'voltas fracionárias': result => { result.laps = 2.5; },
  'tempo infinito': result => { result.elapsedTime = Infinity; },
  'tempo negativo': result => { result.elapsedTime = -1; },
  'três participantes': result => { result.standings.pop(); },
  'cinco participantes': result => { result.standings.push({ ...result.standings[0] }); },
  'posições fora de ordem': result => { [result.standings[0], result.standings[1]] = [result.standings[1], result.standings[0]]; },
  'IDs repetidos': result => { result.standings[1].id = result.standings[0].id; },
  'jogador incorreto': result => { result.standings[0].id = CHARACTERS[5].id; },
  'nenhum jogador': result => { result.standings[0].isPlayer = false; },
  'dois jogadores': result => { result.standings[1].isPlayer = true; },
  'flag não booleana': result => { result.standings[1].isPlayer = 0 as unknown as boolean; },
  'tempo de chegada negativo': result => { result.standings[0].finishTime = -1; },
  'tempo de chegada NaN': result => { result.standings[0].finishTime = NaN; },
  'chegadas fora de ordem': result => { result.standings[0].finishTime = 35; },
  'cor inválida': result => { result.standings[0].paintColor = {} as unknown as string; },
  'campo inesperado': result => { asRecord(result).reward = { score: 9999, money: 9999 }; },
  'chave perigosa': result => { result.standings[0] = JSON.parse(`{"__proto__":{},${JSON.stringify(result.standings[0]).slice(1)}`); },
};
for (const [name, corrupt] of Object.entries(invalidResults)) {
  test(`resultado inválido retorna o mesmo estado: ${name}`, () => {
    const state = freeze(ready());
    const result = resultFor(state);
    corrupt(result);
    assert.equal(applyChampionshipResult(state, result), state);
  });
}

test('resultado aceita encerrar ao jogador chegar antes dos bots, preservando as voltas deles', () => {
  const state = freeze(ready());
  const result = resultFor(state);
  result.standings[3].lapsCompleted -= 1;
  const completed = applyChampionshipResult(state, result);
  assert.equal(completed.racesRun, 1);
  assert.equal(completed.pendingResult?.standings[3].lapsCompleted, result.laps - 1);
});

test('registro antigo, vazio ou sem corrida ativa não lança nem concede prêmio', () => {
  const state = ready();
  for (const result of [null, undefined, {}, [], { position: 1 }, 'old']) {
    assert.equal(applyChampionshipResult(state, result), state);
  }
  const idle = ensureAssignedTrack(selected());
  assert.equal(applyChampionshipResult(idle, resultFor(state)), idle);
  const withAttempt = { ...resultFor(state), attemptId: state.attempt.id };
  assert.equal(applyChampionshipResult(state, withAttempt).racesRun, 1);
});

const corruptions: Record<string, (state: ChampionshipState) => void> = {
  'versão desconhecida': state => { asRecord(state).schemaVersion = 4; },
  'chave ausente': state => { delete asRecord(state).upgrades; },
  'chave extra': state => { asRecord(state).moneyGoal = 1400; },
  'revision negativa': state => { state.revision = -1; },
  'revision fracionária': state => { state.revision = 1.1; },
  'ID vazio': state => { state.id = ' '; },
  'dinheiro negativo': state => { state.money = -1; },
  'score fracionário': state => { state.score = 0.1; },
  'inteiro inseguro': state => { state.money = Number.MAX_SAFE_INTEGER + 1; },
  'meta inválida': state => { asRecord(state).targetScore = 1000001; },
  'corridas fora do limite': state => { state.racesRun = 9; },
  'limite diferente': state => { state.maxRaces = 9; },
  'divisão inventada': state => { state.division = 'C' as unknown as 'B'; },
  'rival inventado': state => { asRecord(state).rivalId = 'next'; },
  'seleção inválida': state => { asRecord(state.selections).pilotId = 'fake'; },
  'upgrade negativo': state => { state.upgrades.engine = -1; },
  'upgrade aninhado': state => { state.upgrades.engine = { level: 1 } as unknown as number; },
  'upgrade prototype': state => { asRecord(state.upgrades).prototype = 1; },
  'upgrade constructor': state => { Object.defineProperty(state.upgrades, 'constructor', { value: 1, enumerable: true }); },
  'upgrade __proto__': state => { state.upgrades = JSON.parse('{"__proto__":1}') as Record<string, number>; },
  'tentativa sem ID': state => { state.attempt.id = ''; },
  'número tentativa incorreto': state => { state.attempt.number = 2; },
  'status inconsistente': state => { state.attempt.status = 'failed'; },
  'pistas duplicadas no ciclo': state => { state.tracks.remainingTrackIds = [RACE_TRACKS[0].id, RACE_TRACKS[0].id]; },
  'pista desconhecida': state => { state.tracks.lastCompletedTrackId = 'fake'; },
  'pendência sem ciclo': state => { state.tracks.pendingTrackId = RACE_TRACKS[0].id; },
  'histórico inconsistente': state => { state.tracks.history = [RACE_TRACKS[0].id]; },
  'ledger sem resultado': state => { state.awardedRaceIds = ['fake']; },
  'log inválido': state => { asRecord(state.tracks).completedRaceIds = [1]; },
  'flag não booleana': state => { state.tracks.freeChoiceAvailable = 1 as unknown as boolean; },
  'escolha especial inicial': state => { state.tracks.freeChoiceAvailable = true; },
  'protótipo customizado': state => { Object.setPrototypeOf(state.upgrades, { injected: true }); },
  'accessor': state => { Object.defineProperty(state, 'money', { enumerable: true, get() { throw new Error('não ler'); } }); },
  'ciclo JS': state => { state.upgrades.engine = state as unknown as number; },
  'array esparso': state => { state.tracks.remainingTrackIds = Array(1); },
};
for (const [name, corrupt] of Object.entries(corruptions)) {
  test(`schema rejeita payload corrompido: ${name}`, () => {
    const state = initial();
    corrupt(state);
    assert.equal(isValidChampionshipState(state), false);
  });
}

test('schema confere activeRace, ledger e snapshots de recibos sem normalizar', () => {
  const active = ready();
  for (const mutate of [
    (state: ChampionshipState) => { required(state.activeRace).attemptId = 'stale'; },
    (state: ChampionshipState) => { required(state.activeRace).selections.paintId = PAINTS[0].id; },
    (state: ChampionshipState) => { required(state.activeRace).id = ''; },
    (state: ChampionshipState) => { required(state.activeRace).trackId = 'fake'; },
  ]) {
    const state = clone(active);
    mutate(state);
    assert.equal(isValidChampionshipState(state), false);
  }
  const pending = applyChampionshipResult(active, resultFor(active));
  for (const mutate of [
    (state: ChampionshipState) => { required(state.pendingResult).reward.score += 1; },
    (state: ChampionshipState) => { required(state.pendingResult).reward.money += 1; },
    (state: ChampionshipState) => { required(state.pendingResult).totals.money += 1; },
    (state: ChampionshipState) => { required(state.pendingResult).totals.score += 1; },
    (state: ChampionshipState) => { required(state.pendingResult).totals.racesRun += 1; },
    (state: ChampionshipState) => { required(state.pendingResult).outcome = 'failed'; },
    (state: ChampionshipState) => { required(state.pendingResult).raceId = 'fake'; },
    (state: ChampionshipState) => { required(state.pendingResult).standings[0].lapsCompleted = 0; },
    (state: ChampionshipState) => { state.awardedRaceIds.push(state.awardedRaceIds[0]); },
    (state: ChampionshipState) => { state.tracks.completedRaceIds[0] = 'fake'; },
    (state: ChampionshipState) => { state.activeRace = clone(active.activeRace); },
  ]) {
    const state = clone(pending);
    mutate(state);
    const before = clone(state);
    assert.equal(isValidChampionshipState(state), false);
    assert.deepEqual(state, before);
  }
  const reset = acknowledgeChampionshipResult(runPositions(Array(8).fill(4)), 'attempt-2');
  for (const mutate of [
    (state: ChampionshipState) => { state.previousAttempts[0].id = state.attempt.id; },
    (state: ChampionshipState) => { state.previousAttempts[0].tracks[0] = 'fake'; },
    (state: ChampionshipState) => { asRecord(state.previousAttempts[0]).status = 'qualified'; },
    (state: ChampionshipState) => { state.previousAttempts[0].score = state.targetScore; },
  ]) {
    const state = clone(reset);
    mutate(state);
    assert.equal(isValidChampionshipState(state), false);
  }
});

test('meta positiva configurável, seleções nulas e upgrades planos são válidos', () => {
  const state = { ...initial(), targetScore: 1000000, upgrades: { engine: 0, armor: 3 } };
  assert.equal(isValidChampionshipState(state), true);
  assert.equal(isValidChampionshipState(null), false);
  assert.equal(isValidChampionshipState([]), false);
  assert.equal(isValidChampionshipState({}), false);
});

test('storage v1 roundtrip conserva pendência; backup completo precede substituição', () => {
  assert.equal(CHAMPIONSHIP_SAVE_KEY, 'riffshot-racing:championship:v1');
  assert.equal(CHAMPIONSHIP_BACKUP_KEY, `${CHAMPIONSHIP_SAVE_KEY}:backup`);
  const storage = new MemoryStorage();
  assert.deepEqual(loadChampionship(storage), { state: null, raw: null, writable: true, warning: null });
  const first = saveChampionship(storage, ready(), null);
  assert.equal(first.ok, true);
  assert.equal(storage.getItem(CHAMPIONSHIP_BACKUP_KEY), null);
  const racing = required(loadChampionship(storage).state);
  const pending = applyChampionshipResult(racing, resultFor(racing));
  storage.writes = [];
  const saved = saveChampionship(storage, pending, first.raw);
  assert.equal(saved.ok, true);
  assert.deepEqual(storage.writes, [[CHAMPIONSHIP_BACKUP_KEY, required(first.raw)], [CHAMPIONSHIP_SAVE_KEY, required(saved.raw)]]);
  assert.deepEqual(JSON.parse(required(saved.raw)), pending);
  const loaded = loadChampionship(storage);
  assert.deepEqual(loaded, { state: pending, raw: saved.raw, writable: true, warning: null });
  assert.equal(applyChampionshipResult(required(loaded.state), resultFor(racing)), required(loaded.state));
});

test('migração de save v1 troca a máquina antiga sem perder dinheiro, SCORE nem corrida ativa', () => {
  const legacy = ready();
  delete asRecord(legacy).ownedVehicleIds;
  delete asRecord(legacy).rivalRewardChoice;
  asRecord(legacy).schemaVersion = 1;
  legacy.selections.vehicleId = 'air-blade';
  required(legacy.activeRace).selections.vehicleId = 'air-blade';
  legacy.money = 7350;
  legacy.score = 680;
  const raw = JSON.stringify(legacy);
  const storage = new MemoryStorage([[CHAMPIONSHIP_SAVE_KEY, raw]]);

  const loaded = loadChampionship(storage);

  assert.equal(loaded.writable, true);
  assert.equal(loaded.raw, raw, 'a migração de leitura não substitui silenciosamente o save original');
  assert.equal('migrated' in loaded && loaded.migrated, true);
  const migrated = required(loaded.state);
  assert.equal(migrated.schemaVersion, 3);
  assert.deepEqual(migrated.ownedVehicleIds, ['rift-blaze']);
  assert.equal(migrated.selections.vehicleId, 'rift-blaze');
  assert.equal(required(migrated.activeRace).selections.vehicleId, 'rift-blaze');
  assert.equal(migrated.money, 7350);
  assert.equal(migrated.score, 680);
  assert.equal(migrated.racesRun, legacy.racesRun);
  assert.deepEqual(migrated.tracks, legacy.tracks);
  assert.deepEqual(migrated.awardedRaceIds, legacy.awardedRaceIds);
  assert.equal(isValidChampionshipState(migrated), true);

  const updated = { ...migrated, revision: migrated.revision + 1 };
  updated.selections.paintId = PAINTS[2].id;
  required(updated.activeRace).selections.paintId = PAINTS[2].id;
  const saved = saveChampionship(storage, updated, loaded.raw);
  assert.equal(saved.ok, true, saved.warning ?? undefined);
  assert.equal(storage.getItem(CHAMPIONSHIP_BACKUP_KEY), raw);
  const savedState = JSON.parse(required(storage.getItem(CHAMPIONSHIP_SAVE_KEY))) as ChampionshipState;
  assert.equal(savedState.schemaVersion, 3);
  assert.equal(savedState.money, 7350);
  assert.equal(savedState.score, 680);
});

for (const raw of ['{bad-json', 'null', '{}', JSON.stringify({ ...initial(), schemaVersion: 0 }),
  JSON.stringify({ ...initial(), schemaVersion: 1, selections: { ...initial().selections, vehicleId: 'not-a-legacy-car' } }),
  JSON.stringify({ ...initial(), schemaVersion: 4 }), JSON.stringify({ ...initial(), schemaVersion: 999 }),
  JSON.stringify({ ...initial(), money: -1 }),
  JSON.stringify(initial()).replace('"upgrades":{}', '"upgrades":{"__proto__":1}')]) {
  test(`migração desconhecida/corrupção bloqueada e original/backup preservados: ${raw.slice(0, 70)}`, () => {
    const storage = new MemoryStorage([[CHAMPIONSHIP_SAVE_KEY, raw], [CHAMPIONSHIP_BACKUP_KEY, 'previous-backup']]);
    const loaded = loadChampionship(storage);
    assert.equal(loaded.state, null);
    assert.equal(loaded.raw, raw);
    assert.equal(loaded.writable, false);
    assert.ok(loaded.warning);
    const saved = saveChampionship(storage, initial(), raw);
    assert.equal(saved.ok, false);
    assert.equal(saved.raw, raw);
    assert.ok(saved.warning);
    assert.equal(storage.getItem(CHAMPIONSHIP_SAVE_KEY), raw);
    assert.equal(storage.getItem(CHAMPIONSHIP_BACKUP_KEY), 'previous-backup');
    assert.deepEqual(storage.writes, []);
  });
}

test('versão :v2 no mesmo namespace bloqueia escrita; backups e outros namespaces não bloqueiam', () => {
  const raw = JSON.stringify(initial());
  const storage = new MemoryStorage([[CHAMPIONSHIP_SAVE_KEY, raw], ['riffshot-racing:championship:v2', '{unknown}']]);
  const loaded = loadChampionship(storage);
  assert.equal(loaded.writable, false);
  assert.equal(loaded.raw, raw);
  assert.match(required(loaded.warning), /versão|Versão/);
  assert.equal(saveChampionship(storage, initial(), raw).ok, false);
  assert.deepEqual(storage.writes, []);
  const backups = new MemoryStorage([
    ['riffshot-racing:championship:v2:backup', 'not-primary'], ['other-project:championship:v2', 'untouched'],
  ]);
  assert.equal(loadChampionship(backups).writable, true);
  assert.equal(saveChampionship(backups, initial(), null).ok, true);
  assert.equal(backups.getItem('other-project:championship:v2'), 'untouched');
  const minimalStorage = storageFixture({ getItem: () => raw, setItem() {} });
  assert.equal(loadChampionship(minimalStorage).writable, true);
});

test('nenhum backup é promovido automaticamente quando principal falta ou está corrompido', () => {
  const validBackup = JSON.stringify(selected());
  const missing = new MemoryStorage([[CHAMPIONSHIP_BACKUP_KEY, validBackup]]);
  assert.equal(loadChampionship(missing).state, null);
  assert.equal(loadChampionship(missing).writable, false);
  assert.match(required(loadChampionship(missing).warning), /backup/);
  assert.equal(saveChampionship(missing, initial(), null).ok, false);
  assert.equal(missing.getItem(CHAMPIONSHIP_BACKUP_KEY), validBackup);
  assert.deepEqual(missing.writes, []);
  const corrupted = new MemoryStorage([[CHAMPIONSHIP_BACKUP_KEY, validBackup], [CHAMPIONSHIP_SAVE_KEY, '{bad']]);
  assert.equal(loadChampionship(corrupted).writable, false);
  assert.equal(corrupted.getItem(CHAMPIONSHIP_BACKUP_KEY), validBackup);
  assert.deepEqual(corrupted.writes, []);
});

test('falha no backup por quota aborta antes de alterar principal', () => {
  const raw = JSON.stringify(initial());
  const storage = new MemoryStorage([[CHAMPIONSHIP_SAVE_KEY, raw], [CHAMPIONSHIP_BACKUP_KEY, 'old-backup']]);
  storage.failKey = CHAMPIONSHIP_BACKUP_KEY;
  const saved = saveChampionship(storage, selected(), raw);
  assert.equal(saved.ok, false);
  assert.equal(saved.raw, raw);
  assert.match(required(saved.warning), /backup/);
  assert.equal(storage.getItem(CHAMPIONSHIP_SAVE_KEY), raw);
  assert.equal(storage.getItem(CHAMPIONSHIP_BACKUP_KEY), 'old-backup');
  assert.deepEqual(storage.writes, []);
});

test('falha no principal preserva save anterior e backup completo', () => {
  const raw = JSON.stringify(initial());
  const storage = new MemoryStorage([[CHAMPIONSHIP_SAVE_KEY, raw]]);
  storage.failKey = CHAMPIONSHIP_SAVE_KEY;
  const saved = saveChampionship(storage, selected(), raw);
  assert.equal(saved.ok, false);
  assert.equal(saved.raw, raw);
  assert.ok(saved.warning);
  assert.equal(storage.getItem(CHAMPIONSHIP_SAVE_KEY), raw);
  assert.equal(storage.getItem(CHAMPIONSHIP_BACKUP_KEY), raw);
  assert.deepEqual(storage.writes, [[CHAMPIONSHIP_BACKUP_KEY, raw]]);
  const empty = new MemoryStorage();
  empty.failKey = CHAMPIONSHIP_SAVE_KEY;
  assert.equal(saveChampionship(empty, initial(), null).ok, false);
  assert.equal(empty.getItem(CHAMPIONSHIP_SAVE_KEY), null);
});

test('conflito entre abas bloqueia gravação e backup sem sobrescrever estado mais recente', () => {
  const oldRaw = JSON.stringify(initial());
  const currentRaw = JSON.stringify(selected());
  const storage = new MemoryStorage([[CHAMPIONSHIP_SAVE_KEY, currentRaw], [CHAMPIONSHIP_BACKUP_KEY, 'existing-backup']]);
  const saved = saveChampionship(storage, initial(), oldRaw);
  assert.equal(saved.ok, false);
  assert.match(required(saved.warning), /outra aba/);
  assert.equal(storage.getItem(CHAMPIONSHIP_SAVE_KEY), currentRaw);
  assert.equal(storage.getItem(CHAMPIONSHIP_BACKUP_KEY), 'existing-backup');
  assert.equal(saveChampionship(storage, initial(), null).ok, false);
  assert.deepEqual(storage.writes, []);
});

test('storage indisponível, somente leitura e acesso negado são tratados sem lançar', () => {
  assert.deepEqual(loadChampionship(null), { state: null, raw: null, writable: false, warning: 'Armazenamento indisponível.' });
  assert.equal(saveChampionship(null, initial(), null).ok, false);
  const denied = storageFixture({ getItem() { throw new Error('SecurityError'); }, setItem() { assert.fail('não deve gravar'); } });
  assert.equal(loadChampionship(denied).writable, false);
  assert.equal(saveChampionship(denied, initial(), null).ok, false);
  const readonly = new MemoryStorage();
  readonly.setItem = () => { throw new Error('read only'); };
  assert.equal(saveChampionship(readonly, initial(), null).ok, false);
  const enumerationDenied = storageFixture({ getItem: () => null, key() { throw new Error('SecurityError'); }, length: 1 });
  assert.equal(loadChampionship(enumerationDenied).writable, false);
  assert.equal(saveChampionship(enumerationDenied, initial(), null).ok, false);
});

test('save rejeita próximo estado inválido e previousRaw inválido sem escrever', () => {
  const storage = new MemoryStorage();
  for (const state of [null, {}, { ...initial(), score: -1 }]) {
    assert.equal(saveChampionship(storage, state, null).ok, false);
  }
  for (const previousRaw of [undefined, {}, 4]) {
    const saved = saveChampionship(storage, initial(), previousRaw as string | null);
    assert.equal(saved.ok, false);
    assert.equal(saved.raw, null);
  }
  assert.deepEqual(storage.writes, []);
});
