import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { Championship } from '../src/championship/Championship.ts';
import { CHAMPIONSHIP_SAVE_KEY, CHAMPIONSHIP_BACKUP_KEY } from '../src/championship/championshipStorage.ts';
import { CHARACTERS } from '../src/data/characters.ts';
import { VEHICLE } from '../src/data/vehicles.ts';
import { CHAMPIONSHIP_RULES } from '../src/data/championshipRules.ts';
import type { ChampionshipResult, ChampionshipSelections } from '../src/championship/championshipState.ts';
import type Phaser from 'phaser';

const selections: ChampionshipSelections = {
  pilotId: CHARACTERS[0].id, vehicleId: VEHICLE.id, paintId: 'inferno', difficultyId: 'normal',
};
const memory = (): Storage => {
  const values = new Map<string, string>();
  return { get length() { return values.size; }, key: (index: number) => [...values.keys()][index] ?? null,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, String(value)); },
    removeItem: (key: string) => { values.delete(key); }, clear: () => { values.clear(); } };
};
const game = (): Pick<Phaser.Game, 'events' | 'registry'> => {
  const values = new Map<string, unknown>();
  return { events: new EventEmitter() as unknown as Phaser.Game['events'], registry: {
    get: (key: string) => values.get(key), set: (key: string, value: unknown) => { values.set(key, value); },
    remove: (key: string) => { values.delete(key); },
  } as unknown as Phaser.Game['registry'] };
};
let sequence = 0;
const service = (storage: Storage | null = memory()): Championship => new Championship(game(), { storage, makeId: prefix => `${prefix}-${++sequence}` });
function selectForRace(championship: Championship) {
  assert.equal(championship.purchaseVehicle(VEHICLE.id, required(selections.paintId)), true);
  championship.select(selections);
}
function resultFor(championship: Championship, position: number): ChampionshipResult {
  const active = championship.startRace();
  assert.ok(active);
  const rivals = CHARACTERS.slice(1, 4);
  let rival = 0;
  return { raceId: active.id, attemptId: active.attemptId, trackId: active.trackId,
    trackName: 'Pista atribuída', difficultyId: 'normal', laps: 4, elapsedTime: 90,
    standings: [1, 2, 3, 4].map(place => {
      const player = place === position;
      const pilot = player ? CHARACTERS[0] : rivals[rival++];
       return { id: pilot.id, name: pilot.name, position: place as 1 | 2 | 3 | 4, isPlayer: player,
        finishTime: 80 + place, lapsCompleted: 4, paintColor: '#E53935' };
    }) };
}
const required = <T>(value: T | null | undefined): T => {
  assert.ok(value);
  return value;
};

test('serviço aplica as quatro premiações e restaura seleções/recibo sem duplicar após reload', () => {
  for (const position of [1, 2, 3, 4]) {
    const storage = memory(), first = service(storage);
    selectForRace(first);
    const result = resultFor(first, position);
    const receipt = first.finishRace(result);
    assert.ok(receipt);
    const reward = CHAMPIONSHIP_RULES.rewardsByPosition[position as 1 | 2 | 3 | 4];
    assert.deepEqual(required(receipt).reward, reward);
    assert.equal(first.state.money, reward.money);
    assert.equal(first.state.score, reward.score);
    assert.equal(first.state.racesRun, 1);
    const raw = storage.getItem(CHAMPIONSHIP_SAVE_KEY);
    const restored = service(storage);
    assert.deepEqual(restored.state.selections, selections);
    assert.equal(restored.game.registry.get('selectedCharacterId'), selections.pilotId);
      assert.equal(required(restored.finishRace(result)).raceId, required(receipt).raceId);
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
  assert.ok(eighth);
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
   const firstId = required(championship.startRace('voltage-run')).id;
   assert.notEqual(firstId, required(eighth).raceId);
   assert.equal(required(championship.state.activeRace).trackId, 'voltage-run');
  championship = service(storage);
   assert.equal(required(championship.startRace()).id, firstId, 'abandonar/reabrir reaproveita a prova não premiada');
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
   assert.ok(required(championship.warning).includes('desconhecida'));
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
   assert.ok(required(stale.warning).includes('outra aba'));
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
   championship.onStorage({ key: null, newValue: null, storageArea: storage } as StorageEvent);
  assert.equal(championship.writable, false);
   assert.ok(required(championship.warning).includes('outra aba'));
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
   assert.match(required(championship.warning), /outra aba/);
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
   assert.match(required(championship.warning), /Não foi possível concluir/);
});
