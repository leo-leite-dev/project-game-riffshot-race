import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { Championship } from '../src/championship/Championship.js';
import { CHAMPIONSHIP_SAVE_KEY, CHAMPIONSHIP_BACKUP_KEY } from '../src/championship/championshipStorage.js';
import { CHARACTERS } from '../src/data/characters.js';
import { VEHICLE } from '../src/data/vehicles.js';
import { CHAMPIONSHIP_RULES } from '../src/data/championshipRules.js';

const selections = { pilotId: CHARACTERS[0].id, vehicleId: VEHICLE.id, paintId: 'inferno', difficultyId: 'normal' };
const memory = () => {
  const values = new Map();
  return { get length() { return values.size; }, key: index => [...values.keys()][index],
    getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)) };
};
const game = () => {
  const values = new Map();
  return { events: new EventEmitter(), registry: { get: key => values.get(key),
    set: (key, value) => values.set(key, value), remove: key => values.delete(key) } };
};
let sequence = 0;
const service = storage => new Championship(game(), { storage, makeId: prefix => `${prefix}-${++sequence}` });
function resultFor(championship, position) {
  const active = championship.startRace();
  const rivals = CHARACTERS.slice(1, 4);
  let rival = 0;
  return { raceId: active.id, attemptId: active.attemptId, trackId: active.trackId,
    trackName: 'Pista atribuída', difficultyId: 'normal', laps: 4, elapsedTime: 90,
    standings: [1, 2, 3, 4].map(place => {
      const player = place === position;
      const pilot = player ? CHARACTERS[0] : rivals[rival++];
      return { id: pilot.id, name: pilot.name, position: place, isPlayer: player,
        finishTime: 80 + place, lapsCompleted: 4, paintColor: '#E53935' };
    }) };
}

test('serviço aplica as quatro premiações e restaura seleções/recibo sem duplicar após reload', () => {
  for (const position of [1, 2, 3, 4]) {
    const storage = memory(), first = service(storage);
    first.select(selections);
    const result = resultFor(first, position);
    const receipt = first.finishRace(result);
    const reward = CHAMPIONSHIP_RULES.rewardsByPosition[position];
    assert.deepEqual(receipt.reward, reward);
    assert.equal(first.state.money, 2000 + reward.money);
    assert.equal(first.state.score, reward.score);
    assert.equal(first.state.racesRun, 1);
    const raw = storage.getItem(CHAMPIONSHIP_SAVE_KEY);
    const restored = service(storage);
    assert.deepEqual(restored.state.selections, selections);
    assert.equal(restored.game.registry.get('selectedCharacterId'), selections.pilotId);
    assert.equal(restored.finishRace(result).raceId, receipt.raceId);
    assert.equal(storage.getItem(CHAMPIONSHIP_SAVE_KEY), raw);
    assert.equal(restored.state.racesRun, 1);
    restored.acknowledgeResult();
    const acknowledged = storage.getItem(CHAMPIONSHIP_SAVE_KEY);
    restored.acknowledgeResult();
    assert.equal(storage.getItem(CHAMPIONSHIP_SAVE_KEY), acknowledged);
    assert.equal(restored.finishRace(result), null);
    assert.equal(restored.state.money, 2000 + reward.money);
  }
});

test('fracasso só zera após confirmação; exceção e IDs únicos sobrevivem ao recarregamento', () => {
  const storage = memory(); let championship = service(storage);
  championship.select(selections);
  let eighth;
  for (let race = 0; race < 8; race += 1) {
    eighth = resultFor(championship, 4);
    championship.finishRace(eighth);
    if (race < 7) championship.acknowledgeResult();
  }
  championship = service(storage);
  assert.equal(championship.state.racesRun, 8);
  assert.equal(championship.state.money, 2000);
  assert.equal(championship.state.attempt.status, 'failed');
  assert.equal(championship.canRace, false);
  championship.acknowledgeResult();
  championship = service(storage);
  assert.equal(championship.state.money, 0);
  assert.equal(championship.state.score, 0);
  assert.equal(championship.state.racesRun, 0);
  assert.deepEqual(championship.state.selections, selections);
  assert.equal(championship.specialTrackChoice, true);
  const firstId = championship.startRace('voltage-run').id;
  assert.notEqual(firstId, eighth.raceId);
  assert.equal(championship.state.activeRace.trackId, 'voltage-run');
  championship = service(storage);
  assert.equal(championship.startRace().id, firstId, 'abandonar/reabrir reaproveita a prova não premiada');
  assert.equal(championship.specialTrackChoice, true);
});

test('SCORE desbloqueia antes de 8 e dinheiro/melhorias são preservados sem inventar divisão', () => {
  const championship = service(memory());
  championship.select(selections);
  for (let race = 0; race < 5; race += 1) {
    championship.finishRace(resultFor(championship, 1));
    championship.acknowledgeResult();
  }
  assert.equal(championship.state.score, 1500);
  assert.equal(championship.state.money, 9500);
  assert.equal(championship.state.racesRun, 5);
  assert.equal(championship.state.attempt.status, 'qualified');
  assert.equal(championship.state.division, 'B');
  assert.equal(championship.startRace(), null);
});

test('save desconhecido não é sobrescrito e a sessão temporária expõe aviso', () => {
  const storage = memory(), raw = '{"schemaVersion":99,"meuProgresso":"preservar"}';
  storage.setItem(CHAMPIONSHIP_SAVE_KEY, raw);
  storage.setItem(CHAMPIONSHIP_BACKUP_KEY, 'backup anterior');
  const championship = service(storage);
  championship.select(selections);
  assert.equal(championship.writable, false);
  assert.ok(championship.warning.includes('desconhecida'));
  assert.equal(storage.getItem(CHAMPIONSHIP_SAVE_KEY), raw);
  assert.equal(storage.getItem(CHAMPIONSHIP_BACKUP_KEY), 'backup anterior');
});

test('conflito com outra aba é detectado e não sobrescreve o save mais recente', () => {
  const storage = memory(), first = service(storage);
  first.select(selections);
  const stale = service(storage);
  first.assignedTrack();
  const latest = storage.getItem(CHAMPIONSHIP_SAVE_KEY);
  stale.select({ paintId: 'neon' });
  assert.equal(stale.writable, false);
  assert.ok(stale.warning.includes('outra aba'));
  assert.equal(storage.getItem(CHAMPIONSHIP_SAVE_KEY), latest);
});

test('armazenamento bloqueado permite sessão temporária sem fingir que salvou', () => {
  const championship = service(null);
  championship.select(selections);
  assert.equal(championship.hasSelections, true);
  assert.equal(championship.writable, false);
  assert.ok(championship.warning);
  assert.equal(championship.finishRace(resultFor(championship, 1)).reward.score, 300);
  assert.equal(championship.state.racesRun, 1);
});

test('limpeza por outra aba sinaliza conflito imediatamente', () => {
  const storage = memory(), championship = service(storage);
  championship.select(selections);
  championship.onStorage({ key: null, newValue: null, storageArea: storage });
  assert.equal(championship.writable, false);
  assert.ok(championship.warning.includes('outra aba'));
});
