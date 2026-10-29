import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { Championship } from '../src/championship/Championship.ts';
import { createChampionshipState, isValidChampionshipState, migrateChampionshipState,
  setSelections, ensureAssignedTrack, beginChampionshipRace,
  applyChampionshipResult } from '../src/championship/championshipState.ts';
import { CHAMPIONSHIP_SAVE_KEY, CHAMPIONSHIP_BACKUP_KEY,
  loadChampionship } from '../src/championship/championshipStorage.ts';
import { CHARACTERS } from '../src/data/characters.ts';
import { RIVAL_VEHICLE_ID } from '../src/data/vehicles.ts';
import type { ChampionshipResult, ChampionshipState, RivalRewardChoice } from '../src/championship/championshipState.ts';
import type Phaser from 'phaser';

const asRecord = (value: unknown): Record<string, unknown> => value as Record<string, unknown>;

class MemoryStorage implements Storage {
  values: Map<string, string>;
  failKey: string | null;
  writes: string[];
  constructor(state?: unknown) {
    this.values = new Map(state ? [[CHAMPIONSHIP_SAVE_KEY, JSON.stringify(state)]] : []);
    this.failKey = null;
    this.writes = [];
  }
  get length() { return this.values.size; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) {
    if (key === this.failKey) throw new Error('QuotaExceededError');
    this.values.set(key, String(value));
    this.writes.push(key);
  }
  removeItem(key: string) { this.values.delete(key); }
  clear() { this.values.clear(); }
}

let sequence = 0;
function service(storage: Storage | null = new MemoryStorage()): Championship {
  const registry = new Map<string, unknown>();
  return new Championship({ events: new EventEmitter(), registry: {
    get: (key: string) => registry.get(key), set: (key: string, value: unknown) => { registry.set(key, value); },
    remove: (key: string) => { registry.delete(key); },
  } as unknown as Phaser.Game['registry'],
  } as unknown as Pick<Phaser.Game, 'events' | 'registry'>, { storage, makeId: prefix => `${prefix}-${++sequence}` });
}
const fresh = () => createChampionshipState({ id: 'career-fixture', attemptId: 'attempt-fixture' });
const withWallet = (money: number) => service(new MemoryStorage({ ...fresh(), money }));
function ready() {
  const championship = service();
  assert.equal(championship.purchaseVehicle('volt-vector', 'inferno'), true);
  championship.select({ pilotId: CHARACTERS[0].id, difficultyId: 'normal' });
  return championship;
}
function resultFor(race: NonNullable<ReturnType<Championship['startRace']>>, position = 1): ChampionshipResult {
  const opponents = CHARACTERS.filter(pilot => pilot.id !== race.selections.pilotId).slice(0, 3);
  const player = CHARACTERS.find(pilot => pilot.id === race.selections.pilotId)!;
  opponents.splice(position - 1, 0, player);
  return { raceId: race.id, attemptId: race.attemptId, trackId: race.trackId,
     trackName: 'Pista de teste isolada', difficultyId: race.selections.difficultyId!,
    laps: 4, elapsedTime: 100, standings: opponents.map((pilot, index) => ({
    id: pilot.id, name: pilot.name, position: (index + 1) as 1 | 2 | 3 | 4, isPlayer: pilot.id === player.id,
      finishTime: 90 + index, lapsCompleted: 4, paintColor: '#E53935',
    })) };
}
function run(championship: Championship, position = 1, acknowledge = true) {
  const race = championship.startRace();
  assert.ok(race);
  const result = resultFor(race, position);
  assert.ok(championship.finishRace(result));
  if (acknowledge) championship.acknowledgeResult();
  return result;
}
function qualified(acknowledge = true): Championship {
  const championship = ready();
  for (let index = 0; index < 5; index += 1) run(championship, 1, index < 4 || acknowledge);
  return championship;
}
function legacy(state: ChampionshipState, version = 2): ChampionshipState {
  const value = structuredClone(state) as ChampionshipState;
  delete asRecord(value).ownedVehicleIds;
  delete asRecord(value).rivalRewardChoice;
  value.schemaVersion = version as 3;
  if (version === 1) {
    value.selections.vehicleId = value.selections.vehicleId === null ? null : 'air-blade';
    if (value.activeRace) value.activeRace.selections.vehicleId = 'air-blade';
  }
  return value;
}

test('loja: início tem 2000, inventário vazio e nenhuma seleção; select não concede carro', () => {
  const championship = service();
  assert.equal(championship.state.schemaVersion, 3);
  assert.equal(championship.state.money, 2000);
  assert.deepEqual(championship.state.ownedVehicleIds, []);
  assert.equal(championship.state.rivalRewardChoice, null);
  assert.ok(Object.values(championship.state.selections).every(value => value === null));
  championship.select({ vehicleId: 'rift-blaze', paintId: 'inferno' });
  assert.equal(championship.state.selections.vehicleId, null);
  assert.equal(championship.ownsVehicle('rift-blaze'), false);
  assert.equal(championship.hasSelections, false);
  assert.equal(championship.canRace, false);
  assert.equal(championship.canClaimRivalReward, false);
  assert.equal(championship.startRace(), null);
});

for (const [id, price] of [['rift-blaze', 2000], ['volt-vector', 800],
  ['iron-bastion', 7500], ['widowmaker', 24000]] as const) {
  test(`loja: ${id} saldo exato compra/equipa atomicamente; insuficiente não altera nada`, () => {
    const poor = withWallet(price - 1), before = poor.state;
    const raw = poor.raw;
    assert.equal(poor.purchaseVehicle(id, 'inferno'), false);
    assert.equal(poor.state, before);
     assert.equal(poor.storage!.getItem(CHAMPIONSHIP_SAVE_KEY), raw);
    const championship = withWallet(price);
    assert.equal(championship.purchaseVehicle(id, 'neon'), true);
    assert.equal(championship.state.money, 0);
    assert.deepEqual(championship.state.ownedVehicleIds, [id]);
    assert.equal(championship.state.selections.vehicleId, id);
    assert.equal(championship.state.selections.paintId, 'neon');
    assert.equal(championship.game.registry.get('selectedVehicleId'), id);
    const restored = service(championship.storage);
    assert.deepEqual(restored.state, championship.state);
    assert.equal(restored.ownsVehicle(id), true);
    assert.equal(restored.purchaseVehicle(id, 'volt'), true);
    assert.equal(restored.purchaseVehicle(id, 'volt'), true);
    assert.equal(restored.state.money, 0, 'reequipar/repetir não cobra novamente');
    assert.deepEqual(restored.state.ownedVehicleIds, [id]);
  });
}

test('loja: lock prevalece mesmo rico; IDs e pinturas inválidos não debitam nem equipam', () => {
  const championship = withWallet(1000000), before = championship.state;
  for (const [id, paint] of [['race-car-2', 'inferno'], ['fake', 'neon'],
    ['rift-blaze', 'fake'], ['rift-blaze', null], [null, 'inferno']]) {
     assert.equal(championship.purchaseVehicle(id as string, paint as string), false);
    assert.equal(championship.state, before);
  }
  championship.select({ vehicleId: 'race-car-2', paintId: 'neon' });
  assert.equal(championship.state, before);
  assert.equal(championship.ownsVehicle('race-car-2'), false);
  assert.equal(championship.ownsVehicle('fake'), false);
});

test('loja: troca entre carros possuídos preserva saldo, SCORE, ledger e prontidão', () => {
  const championship = qualified();
  const score = championship.state.score, ledger = championship.state.awardedRaceIds;
  assert.equal(championship.purchaseVehicle('iron-bastion', 'volt'), true);
  assert.equal(championship.state.money, 1200);
  championship.select({ vehicleId: 'volt-vector', paintId: 'neon' });
  assert.equal(championship.state.selections.vehicleId, 'volt-vector');
  assert.equal(championship.purchaseVehicle('iron-bastion', 'inferno'), true);
  assert.equal(championship.state.money, 1200);
  assert.equal(championship.state.score, score);
  assert.equal(championship.state.awardedRaceIds, ledger);
  assert.equal(championship.hasSelections, true);
  assert.equal(championship.canRace, true);
});

test('loja: corrida ativa e recibo bloqueiam compra e equipamento, sem corromper snapshots', () => {
  const championship = ready();
   const race = championship.startRace();
   assert.ok(race);
  const active = championship.state;
  assert.equal(championship.purchaseVehicle('volt-vector', 'neon'), false);
  assert.equal(championship.purchaseVehicle('rift-blaze', 'neon'), false);
  championship.select({ paintId: 'neon' });
  assert.equal(championship.state, active);
  championship.finishRace(resultFor(race));
  const pending = championship.state;
  assert.equal(championship.purchaseVehicle('rift-blaze', 'neon'), false);
  assert.equal(championship.purchaseVehicle('volt-vector', 'neon'), false);
  championship.select({ paintId: 'neon' });
  assert.equal(championship.state, pending);
  assert.deepEqual(service(championship.storage).state, pending);
  championship.acknowledgeResult();
  assert.equal(championship.purchaseVehicle('rift-blaze', 'neon'), true);
});

test('loja: fracasso zera carteira conforme regra existente e mantém todas as compras após reload', () => {
  let championship = ready();
  run(championship, 1);
  assert.equal(championship.purchaseVehicle('rift-blaze', 'volt'), true);
  for (let index = 0; index < 7; index += 1) run(championship, 4, index < 6);
  assert.equal(championship.state.attempt.status, 'failed');
  championship.acknowledgeResult();
  championship = service(championship.storage);
  assert.equal(championship.state.money, 0);
  assert.equal(championship.state.score, 0);
  assert.deepEqual(championship.state.ownedVehicleIds, ['volt-vector', 'rift-blaze']);
  assert.equal(championship.state.selections.vehicleId, 'rift-blaze');
  assert.equal(championship.purchaseVehicle('volt-vector', 'inferno'), true);
  assert.equal(championship.state.money, 0);
  assert.equal(championship.canRace, true);
  assert.equal(championship.state.previousAttempts.length, 1);
});

test('rival: qualified continua farming até 8 com corrida/recibo consistentes e reload', () => {
  let championship = qualified();
  assert.equal(championship.state.score, 1500);
  assert.equal(championship.state.racesRun, 5);
  assert.equal(championship.canRace, true);
  assert.equal(championship.canClaimRivalReward, true);
  for (let index = 5; index < 8; index += 1) {
    const active = championship.startRace();
    assert.ok(active);
    assert.equal(championship.canClaimRivalReward, false);
    assert.equal(championship.claimRivalReward('credits'), false);
    championship = service(championship.storage);
    assert.deepEqual(championship.startRace(), active, 'reload retoma a mesma corrida qualificada');
    const result = resultFor(active);
     const receipt = championship.finishRace(result);
     assert.ok(receipt);
    assert.equal(receipt.outcome, 'qualified');
    assert.equal(receipt.totals.racesRun, index + 1);
    assert.equal(championship.canClaimRivalReward, false);
    assert.equal(championship.canRace, false);
    championship = service(championship.storage);
    assert.deepEqual(championship.finishRace(result), receipt);
    championship.acknowledgeResult();
    assert.equal(championship.canClaimRivalReward, true);
    assert.equal(championship.state.attempt.status, 'qualified');
  }
  assert.equal(championship.state.racesRun, 8);
  assert.equal(championship.state.score, 2400);
  assert.equal(championship.state.money, 13200);
  assert.equal(championship.canRace, false);
  assert.equal(championship.startRace(), null);
  const exhausted = championship.state;
  assert.equal(ensureAssignedTrack(exhausted), exhausted);
  assert.equal(beginChampionshipRace(exhausted, 'ninth'), exhausted);
  assert.equal(championship.claimRivalReward('credits'), true, 'prêmio disponível depois da oitava');
  assert.equal(championship.state.money, 25200);
});

for (const choice of ['vehicle', 'credits'] as const) {
  test(`rival: prêmio ${choice} único persiste, mantém seleção e encerra corridas opening`, () => {
    let championship = qualified();
    const before = championship.state;
    championship.assignedTrack(); // Uma pista sorteada ainda não é corrida ativa.
    assert.equal(championship.claimRivalReward(choice), true);
    assert.equal(championship.state.money, before.money + (choice === 'credits' ? 12000 : 0));
    assert.equal(championship.ownsVehicle(RIVAL_VEHICLE_ID), choice === 'vehicle');
    assert.deepEqual(championship.state.selections, before.selections);
    assert.equal(championship.state.score, before.score);
    assert.equal(championship.state.rivalRewardChoice, choice);
    assert.equal(championship.state.attempt.status, 'qualified');
    assert.equal(championship.state.division, 'B');
    assert.equal(championship.state.rivalId, 'opening-b');
    championship = service(championship.storage);
    const claimed = championship.state;
    assert.equal(championship.canClaimRivalReward, false);
    assert.equal(championship.canRace, false);
    assert.equal(championship.startRace(), null);
    assert.equal(ensureAssignedTrack(claimed), claimed);
    assert.equal(beginChampionshipRace(claimed, 'after-reward'), claimed);
    assert.equal(championship.claimRivalReward('vehicle'), false);
    assert.equal(championship.claimRivalReward('credits'), false);
    assert.equal(championship.state, claimed);
    if (choice === 'vehicle') {
      assert.equal(championship.purchaseVehicle(RIVAL_VEHICLE_ID, 'neon'), true);
      assert.equal(championship.state.money, claimed.money, 'equipar prêmio não cobra');
    }
  });
}

test('rival: exige meta, confirmação do recibo e escolha válida', () => {
  const unqualified = ready();
  assert.equal(unqualified.claimRivalReward('vehicle'), false);
  assert.equal(unqualified.claimRivalReward('credits'), false);
  const championship = qualified(false), pending = championship.state;
  assert.equal(championship.canClaimRivalReward, false);
  assert.equal(championship.claimRivalReward('credits'), false);
  assert.equal(championship.state, pending);
  championship.acknowledgeResult();
  const acknowledged = championship.state;
   for (const choice of [null, 'next', '', 12000] as unknown[]) {
     assert.equal(championship.claimRivalReward(choice as RivalRewardChoice), false);
    assert.equal(championship.state, acknowledged);
  }
  assert.equal(championship.claimRivalReward('vehicle'), true);
});

test('rival: carro já possuído impede opção veículo e permite 12000 créditos', () => {
  const state = qualified().state;
  const championship = service(new MemoryStorage({ ...state,
    ownedVehicleIds: [...state.ownedVehicleIds, RIVAL_VEHICLE_ID] }));
  const before = championship.state;
  assert.equal(championship.canClaimRivalReward, true);
  assert.equal(championship.claimRivalReward('vehicle'), false);
  assert.equal(championship.state, before);
  assert.equal(championship.claimRivalReward('credits'), true);
  assert.equal(championship.state.money, before.money + 12000);
  assert.deepEqual(championship.state.ownedVehicleIds, before.ownedVehicleIds);
});

for (const version of [1, 2] as const) {
  for (const phase of ['active', 'race', 'receipt', 'qualified', 'retry']) {
    test(`migração loja: v${version} ${phase} concede selecionado sem débito e preserva progresso/backup`, () => {
      const original = phase === 'receipt' ? qualified(false) : phase === 'qualified' ? qualified() : ready();
      if (phase === 'active') run(original, 2);
      if (phase === 'race') original.startRace();
      if (phase === 'retry') {
        for (let index = 0; index < 8; index += 1) run(original, 4);
      }
      const old = legacy(original.state, version), raw = JSON.stringify(old);
      const storage = new MemoryStorage(old);
      storage.values.set(CHAMPIONSHIP_BACKUP_KEY, 'backup anterior');
      const championship = service(storage);
      const expectedId = version === 1 ? 'rift-blaze' : 'volt-vector';
       assert.equal(championship.writable, true, championship.warning ?? undefined);
      assert.equal(championship.raw, raw);
      assert.equal(storage.getItem(CHAMPIONSHIP_SAVE_KEY), raw);
      assert.equal(storage.getItem(CHAMPIONSHIP_BACKUP_KEY), 'backup anterior');
      const { ownedVehicleIds, rivalRewardChoice, ...migrated } = championship.state;
      const expected = { ...old, schemaVersion: 3,
        selections: { ...old.selections, vehicleId: expectedId } };
      if (expected.activeRace) expected.activeRace = { ...expected.activeRace,
        selections: { ...expected.activeRace.selections, vehicleId: expectedId } };
      assert.deepEqual(migrated, expected);
      assert.deepEqual(ownedVehicleIds, [expectedId]);
      assert.equal(rivalRewardChoice, null);
      assert.equal(isValidChampionshipState(championship.state), true);
      if (phase === 'receipt') championship.acknowledgeResult();
       else if (phase === 'race') championship.finishRace(resultFor(championship.state.activeRace!));
      else assert.equal(championship.purchaseVehicle(expectedId, 'neon'), true);
      assert.equal(storage.getItem(CHAMPIONSHIP_BACKUP_KEY), raw);
      assert.deepEqual(service(storage).state, championship.state);
    });
  }
}

test('migração loja: v2 sem seleção mantém inventário vazio e IDs estáveis são concedidos', () => {
  const empty = legacy(fresh());
   assert.deepEqual(migrateChampionshipState(empty)!.ownedVehicleIds, []);
  for (const vehicleId of ['rift-blaze', 'volt-vector', 'iron-bastion', 'widowmaker']) {
    const old = { ...empty, selections: { ...empty.selections, vehicleId } };
     const migrated = migrateChampionshipState(old);
     assert.ok(migrated);
    assert.deepEqual(migrated.ownedVehicleIds, [vehicleId]);
    assert.equal(migrated.selections.vehicleId, vehicleId);
    assert.equal(migrated.money, 2000);
  }
});

test('schema loja: entrada maliciosa não concede locked, inventário duplicado ou prêmio inconsistente', () => {
  const mutations: ((state: ChampionshipState) => void)[] = [
    state => { state.ownedVehicleIds = ['race-car-2']; },
    state => { state.ownedVehicleIds = ['fake']; },
    state => { state.ownedVehicleIds = ['rift-blaze', 'rift-blaze']; },
    state => { state.selections.vehicleId = 'rift-blaze'; },
    state => { state.rivalRewardChoice = 'credits'; },
    state => { state.rivalRewardChoice = 'next' as unknown as RivalRewardChoice; },
  ];
  for (const mutate of mutations) {
    const state = fresh();
    mutate(state);
    assert.equal(isValidChampionshipState(state), false);
    const storage = new MemoryStorage(state), raw = storage.getItem(CHAMPIONSHIP_SAVE_KEY);
    storage.values.set(CHAMPIONSHIP_BACKUP_KEY, 'preservar backup');
    const championship = service(storage);
    assert.equal(championship.purchaseVehicle('volt-vector', 'inferno'), false);
    assert.equal(storage.getItem(CHAMPIONSHIP_SAVE_KEY), raw);
    assert.equal(storage.getItem(CHAMPIONSHIP_BACKUP_KEY), 'preservar backup');
  }
  for (const version of [1, 2]) {
    const old = legacy(fresh(), version);
    old.selections.vehicleId = 'race-car-2';
    assert.equal(migrateChampionshipState(old), null);
    const storage = new MemoryStorage(old);
    assert.equal(loadChampionship(storage).writable, false);
    assert.equal(storage.writes.length, 0);
  }
  const claimedWithoutCar = { ...qualified().state, rivalRewardChoice: 'vehicle' };
  assert.equal(isValidChampionshipState(claimedWithoutCar), false);
});

for (const operation of ['purchase', 'vehicle', 'credits'] as const) {
  for (const failKey of [CHAMPIONSHIP_BACKUP_KEY, CHAMPIONSHIP_SAVE_KEY]) {
    test(`durabilidade loja: ${operation} falha em ${failKey} não muda memória/carteira/prêmio`, () => {
      const championship = operation === 'purchase' ? ready() : qualified();
      if (operation === 'purchase') run(championship);
      const storage = championship.storage as MemoryStorage, before = championship.state, raw = championship.raw;
      storage.values.set(CHAMPIONSHIP_BACKUP_KEY, 'backup anterior');
      storage.failKey = failKey;
      const act = (target: Championship) => operation === 'purchase'
        ? target.purchaseVehicle('rift-blaze', 'neon') : target.claimRivalReward(operation);
      let updated = 0;
      championship.game.events.on('championship-updated', () => { updated += 1; });
      assert.equal(act(championship), false);
      assert.equal(championship.state, before);
      assert.equal(championship.raw, raw);
      assert.equal(championship.game.registry.get('championship'), before);
      assert.equal(updated, 0);
     assert.ok(championship.warning);
      assert.equal(championship.writable, false);
      assert.equal(storage.getItem(CHAMPIONSHIP_SAVE_KEY), raw);
      assert.equal(storage.getItem(CHAMPIONSHIP_BACKUP_KEY), failKey === CHAMPIONSHIP_BACKUP_KEY ? 'backup anterior' : raw);
      assert.equal(act(championship), false, 'sem retry silencioso em sessão bloqueada');
      storage.failKey = null;
      const restored = service(storage);
      assert.deepEqual(restored.state, before);
      assert.equal(act(restored), true, 'somente após reload uma operação durável pode concluir');
      assert.deepEqual(service(storage).state, restored.state);
      if (operation !== 'purchase') assert.equal(act(service(storage)), false);
    });
  }
}

test('durabilidade loja: primeira compra falha sem save e nunca concede ou debita em memória', () => {
  const storage = new MemoryStorage();
  storage.failKey = CHAMPIONSHIP_SAVE_KEY;
  const championship = service(storage), before = championship.state;
  assert.equal(championship.purchaseVehicle('rift-blaze', 'inferno'), false);
  assert.equal(championship.state, before);
  assert.equal(championship.state.money, 2000);
  assert.equal(storage.getItem(CHAMPIONSHIP_SAVE_KEY), null);
  assert.deepEqual(service(storage).state.ownedVehicleIds, []);
});

test('durabilidade loja: storage indisponível/negado e conflito já notificado bloqueiam operações', () => {
   for (const storage of [null, { getItem() { throw new Error('SecurityError'); } } as unknown as Storage]) {
     const championship = service(storage), before = championship.state;
    assert.equal(championship.purchaseVehicle('volt-vector', 'inferno'), false);
    assert.equal(championship.state, before);
    assert.ok(championship.warning);
  }
  const championship = qualified(), before = championship.state;
   championship.onStorage({ key: CHAMPIONSHIP_SAVE_KEY, newValue: 'outra aba', storageArea: championship.storage } as StorageEvent);
  assert.equal(championship.claimRivalReward('credits'), false);
  assert.equal(championship.purchaseVehicle('rift-blaze', 'neon'), false);
  assert.equal(championship.state, before);
   assert.match(championship.warning!, /outra aba/);
});

for (const operation of ['purchase', 'vehicle', 'credits'] as const) {
  test(`conflito loja: ${operation} em aba antiga não perde saldo nem duplica concessão`, () => {
    const first = operation === 'purchase' ? ready() : qualified();
    if (operation === 'purchase') run(first);
     const storage = first.storage as MemoryStorage, stale = service(storage), before = stale.state;
    if (operation === 'purchase') assert.equal(first.purchaseVehicle('rift-blaze', 'neon'), true);
    else assert.equal(first.claimRivalReward(operation), true);
    const latest = storage.getItem(CHAMPIONSHIP_SAVE_KEY), backup = storage.getItem(CHAMPIONSHIP_BACKUP_KEY);
    const ok = operation === 'purchase' ? stale.purchaseVehicle('rift-blaze', 'volt') : stale.claimRivalReward(operation);
    assert.equal(ok, false);
    assert.equal(stale.state, before);
     assert.match(stale.warning!, /outra aba/);
    assert.equal(storage.getItem(CHAMPIONSHIP_SAVE_KEY), latest);
    assert.equal(storage.getItem(CHAMPIONSHIP_BACKUP_KEY), backup);
    assert.deepEqual(service(storage).state, first.state);
  });
}

test('schema loja: farming não aceita resultado depois de resgatar nem com ativo forjado', () => {
  const championship = qualified();
  const assigned = ensureAssignedTrack(championship.state, () => 0);
   const active = beginChampionshipRace(assigned, 'forged-after-reward');
   assert.ok(active.activeRace);
  assert.equal(championship.claimRivalReward('credits'), true);
  const claimed = championship.state;
   assert.equal(applyChampionshipResult(claimed, resultFor(active.activeRace)), claimed);
  assert.equal(isValidChampionshipState({ ...active, rivalRewardChoice: 'credits' }), false);
  assert.equal(isValidChampionshipState({ ...qualified(false).state, rivalRewardChoice: 'credits' }), false);
  assert.equal(setSelections(fresh(), { vehicleId: 'race-car-2' }).selections.vehicleId, null);
});
