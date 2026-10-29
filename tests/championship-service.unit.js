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
    getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key) };
};
const game = () => {
  const values = new Map();
  return { events: new EventEmitter(), registry: { get: key => values.get(key),
    set: (key, value) => values.set(key, value), remove: key => values.delete(key) } };
};
let sequence = 0;
const service = storage => new Championship(game(), { storage, makeId: prefix => `${prefix}-${++sequence}` });
function selectForRace(championship) {
  assert.equal(championship.purchaseVehicle(VEHICLE.id, selections.paintId), true);
  championship.select(selections);
}
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
    selectForRace(first);
    const result = resultFor(first, position);
    const receipt = first.finishRace(result);
    const reward = CHAMPIONSHIP_RULES.rewardsByPosition[position];
    assert.deepEqual(receipt.reward, reward);
    assert.equal(first.state.money, reward.money);
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
    assert.equal(restored.state.money, reward.money);
  }
});

test('fracasso só zera após confirmação; exceção e IDs únicos sobrevivem ao recarregamento', () => {
  const storage = memory(); let championship = service(storage);
  selectForRace(championship);
  let eighth;
  for (let race = 0; race < 8; race += 1) {
    eighth = resultFor(championship, 4);
    championship.finishRace(eighth);
    if (race < 7) championship.acknowledgeResult();
  }
  championship = service(storage);
  assert.equal(championship.state.racesRun, 8);
  assert.equal(championship.state.money, 0);
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
  selectForRace(championship);
  for (let race = 0; race < 5; race += 1) {
    championship.finishRace(resultFor(championship, 1));
    championship.acknowledgeResult();
  }
  assert.equal(championship.state.score, 1500);
  assert.equal(championship.state.money, 7500);
  assert.equal(championship.state.racesRun, 5);
  assert.equal(championship.state.attempt.status, 'qualified');
  assert.equal(championship.state.division, 'B');
  assert.equal(championship.canClaimRivalReward, true);
  assert.ok(championship.startRace());
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
  selectForRace(first);
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
  championship.select({ pilotId: selections.pilotId });
  assert.equal(championship.purchaseVehicle(VEHICLE.id, 'inferno'), false);
  assert.equal(championship.hasSelections, false);
  assert.equal(championship.writable, false);
  assert.ok(championship.warning);
  assert.equal(championship.startRace(), null);
  assert.equal(championship.state.money, 2000);
});

test('limpeza por outra aba sinaliza conflito imediatamente', () => {
  const storage = memory(), championship = service(storage);
  selectForRace(championship);
  championship.onStorage({ key: null, newValue: null, storageArea: storage });
  assert.equal(championship.writable, false);
  assert.ok(championship.warning.includes('outra aba'));
});

test('apagar progresso remove save/backups, recibos e escolhas, restaura início e não toca outros projetos', () => {
  const storage = memory(), championship = service(storage);
  selectForRace(championship);
  championship.finishRace(resultFor(championship, 1));
  const oldId = championship.state.id;
  assert.ok(championship.game.registry.get('lastRaceResult'));
  storage.setItem('riffshot-racing:championship:v2', 'versão antiga');
  storage.setItem('riffshot-racing:championship:v2:backup', 'backup antigo');
  storage.setItem('outro-projeto:save', 'preservar');
  storage.setItem('riffshot-racing:championship:v1:export', 'não é um save gerenciado');
  assert.equal(championship.eraseProgress(), true);
  assert.equal(storage.getItem(CHAMPIONSHIP_SAVE_KEY), null);
  assert.equal(storage.getItem(CHAMPIONSHIP_BACKUP_KEY), null);
  assert.equal(storage.getItem('riffshot-racing:championship:v2'), null);
  assert.equal(storage.getItem('riffshot-racing:championship:v2:backup'), null);
  assert.equal(storage.getItem('outro-projeto:save'), 'preservar');
  assert.equal(storage.getItem('riffshot-racing:championship:v1:export'), 'não é um save gerenciado');
  assert.notEqual(championship.state.id, oldId);
  assert.deepEqual(championship.state.selections, { pilotId: null, vehicleId: null, paintId: null, difficultyId: null });
  assert.deepEqual([championship.state.money, championship.state.score, championship.state.racesRun], [2000, 0, 0]);
  assert.equal(championship.state.activeRace, null);
  assert.equal(championship.state.pendingResult, null);
  assert.deepEqual(championship.state.awardedRaceIds, []);
  for (const key of ['lastRaceResult', 'selectedCharacterId', 'selectedVehicleId', 'selectedPaintId', 'selectedDifficultyId', 'selectedTrackId']) {
    assert.equal(championship.game.registry.get(key), undefined);
  }
  assert.equal(championship.warning, null);
  const restored = service(storage);
  assert.equal(restored.hasSelections, false);
  assert.equal(restored.writable, true);
  assert.deepEqual([restored.state.money, restored.state.score, restored.state.racesRun], [2000, 0, 0]);
});

test('apagar progresso não apaga save mais recente escrito por outra aba', () => {
  const storage = memory(), championship = service(storage);
  selectForRace(championship);
  const state = championship.state;
  storage.setItem(CHAMPIONSHIP_SAVE_KEY, 'outro estado mais recente');
  const backup = storage.getItem(CHAMPIONSHIP_BACKUP_KEY);
  assert.equal(championship.eraseProgress(), false);
  assert.equal(championship.state, state);
  assert.equal(storage.getItem(CHAMPIONSHIP_SAVE_KEY), 'outro estado mais recente');
  assert.equal(storage.getItem(CHAMPIONSHIP_BACKUP_KEY), backup);
  assert.match(championship.warning, /outra aba/);
});

test('falha ao excluir backup mantém carreira em memória e não simula reinício bem-sucedido', () => {
  const storage = memory(), championship = service(storage);
  selectForRace(championship);
  const state = championship.state, raw = storage.getItem(CHAMPIONSHIP_SAVE_KEY);
  storage.removeItem = () => { throw new Error('SecurityError'); };
  assert.equal(championship.eraseProgress(), false);
  assert.equal(championship.state, state);
  assert.equal(storage.getItem(CHAMPIONSHIP_SAVE_KEY), raw);
  assert.equal(championship.writable, false);
  assert.ok(championship.warning);
  const unavailable = service(null);
  assert.equal(unavailable.eraseProgress(), false);
});

test('falha parcial na exclusão não apaga carreira em memória e é informada ao jogador', () => {
  const storage = memory(), championship = service(storage);
  selectForRace(championship);
  const state = championship.state, raw = storage.getItem(CHAMPIONSHIP_SAVE_KEY);
  const remove = storage.removeItem;
  storage.removeItem = key => {
    if (key === CHAMPIONSHIP_SAVE_KEY) throw new Error('SecurityError');
    remove(key);
  };
  assert.equal(championship.eraseProgress(), false);
  assert.equal(storage.getItem(CHAMPIONSHIP_BACKUP_KEY), null);
  assert.equal(storage.getItem(CHAMPIONSHIP_SAVE_KEY), raw);
  assert.equal(championship.state, state);
  assert.match(championship.warning, /Não foi possível concluir/);
});
