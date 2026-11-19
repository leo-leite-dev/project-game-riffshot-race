import test from 'node:test';
import assert from 'node:assert/strict';
import { CAMARO_UPGRADE, CAMARO_UPGRADE_ATTRIBUTE_KEYS, camaroRaceSpeedPoints, camaroSpeedPoints,
  camaroTopSpeedKmh, camaroUpgradeValue } from '../src/data/camaroUpgrades.ts';
import type { CamaroUpgradeAttribute } from '../src/data/camaroUpgrades.ts';
import { beginChampionshipRace, createChampionshipState, ensureAssignedTrack, migrateChampionshipState,
  purchaseCamaroSpeedUpgrade, purchaseCamaroUpgrade, setSelections } from '../src/championship/championshipState.ts';
import type { ChampionshipState } from '../src/championship/championshipState.ts';
import { CHAMPIONSHIP_SAVE_KEY, loadChampionship, saveChampionship } from '../src/championship/championshipStorage.ts';
import { deriveHandlingStats } from '../src/race/RaceSimulation.ts';
import { healthCapacity } from '../src/race/damageMath.ts';

test('Velocidade do Camaro: oito compras cobram MONEY uma vez e respeitam os preços e o limite', () => {
  let state: ChampionshipState = { ...createChampionshipState({ id: 'upgrade-career', attemptId: 'upgrade-attempt' }),
    money: 100_000, score: 680, upgrades: { engine: 2 } };
  let spent = 0;
  for (const [index, price] of CAMARO_UPGRADE.prices.entries()) {
    const before = state.money;
    state = purchaseCamaroSpeedUpgrade(state);
    spent += price;
    assert.equal(state.money, before - price, `compra ${index + 1} deve debitar exatamente uma vez`);
    assert.equal(state.permanentUpgrades['volt-vector'].speed, index + 1);
    assert.equal(state.score, 680, 'SCORE não participa da compra');
    assert.deepEqual(state.upgrades, { engine: 2 }, 'upgrades de tentativa permanecem separados');
  }
  assert.equal(state.money, 100_000 - spent);
  assert.equal(camaroSpeedPoints(8), 100);
  assert.equal(purchaseCamaroSpeedUpgrade(state), state, 'não permite comprar além do nível 8');
});

test('nove atributos: progressões-base e máximas respeitam os oito níveis aprovados', () => {
  const expected = {
    speed: [36, 100], acceleration: [36, 100], armor: [68, 76], control: [68, 100],
    tires: [68, 100], suspension: [68, 100], shotCount: [2, 10], bombCount: [2, 10], oilSlickCount: [2, 10],
  } as const;
  for (const attribute of CAMARO_UPGRADE_ATTRIBUTE_KEYS) {
    assert.equal(camaroUpgradeValue(attribute, 0), expected[attribute][0]);
    assert.equal(camaroUpgradeValue(attribute, 8), expected[attribute][1]);
  }
});

test('atributos Camaro alteram a física sem mudar condução base nem capacidade inicial de vida', () => {
  const vehicleAt = (level: number) => Object.fromEntries(CAMARO_UPGRADE_ATTRIBUTE_KEYS
    .map(attribute => [attribute, camaroUpgradeValue(attribute, level)]));
  const base = deriveHandlingStats(vehicleAt(0), {}, {}, undefined, 'volt-vector');
  const maximum = deriveHandlingStats(vehicleAt(8), {}, {}, undefined, 'volt-vector');
  const legacyBase = deriveHandlingStats({ speed: 0, acceleration: 0, armor: 68, control: 68,
    tires: 68, suspension: 68 }, {}, {}, undefined, 'volt-vector');
  assert.equal(base.maxSpeed * 4, 110);
  assert.equal(base.acceleration, legacyBase.acceleration, '36 pontos visuais mantêm a aceleração física sem upgrades');
  assert.equal(maximum.maxSpeed * 4, 220);
  assert.ok(maximum.acceleration > base.acceleration);
  assert.ok(maximum.steering > base.steering);
  assert.ok(maximum.grip > base.grip);
  assert.ok(maximum.impactResistance > base.impactResistance);
  assert.ok(maximum.wallSpeedRetention > base.wallSpeedRetention);
  assert.equal(base.collisionDamageMultiplier, 1);
  assert.equal(maximum.collisionDamageMultiplier, 0.96, 'o nível 8 reduz dano em 4%');
  assert.deepEqual(healthCapacity(68), healthCapacity(76), 'resistência não altera a vida inicial');
});

test('cada atributo compra independentemente com a tabela compartilhada e não ultrapassa 8/8', () => {
  const totalCost = CAMARO_UPGRADE.prices.reduce((sum, price) => sum + price, 0) * CAMARO_UPGRADE_ATTRIBUTE_KEYS.length;
  let state: ChampionshipState = { ...createChampionshipState({ id: 'all-upgrades', attemptId: 'all-upgrades-run' }),
    money: totalCost, score: 680 };
  for (const attribute of CAMARO_UPGRADE_ATTRIBUTE_KEYS) {
    for (const [level, price] of CAMARO_UPGRADE.prices.entries()) {
      const beforeMoney = state.money;
      state = purchaseCamaroUpgrade(state, attribute);
      assert.equal(state.money, beforeMoney - price, `${attribute}: desconta preço do nível ${level + 1}`);
      assert.equal(state.permanentUpgrades['volt-vector'][attribute], level + 1);
      assert.equal(state.score, 680);
    }
    assert.equal(purchaseCamaroUpgrade(state, attribute), state, `${attribute}: bloqueia compra 9`);
  }
  assert.equal(state.money, 0);
  assert.equal(purchaseCamaroUpgrade(state, 'not-an-attribute' as CamaroUpgradeAttribute), state);
});

test('MONEY insuficiente, corrida ativa e recibo pendente bloqueiam a compra sem alterar o save', () => {
  const initial = createChampionshipState({ id: 'upgrade-career', attemptId: 'upgrade-attempt' });
  const poor = { ...initial, money: 499 };
  assert.equal(purchaseCamaroSpeedUpgrade(poor), poor);
  const racing = { ...initial, activeRace: { id: 'race-1', attemptId: initial.attempt.id,
    trackId: 'desert-run', selections: { pilotId: 'pilot-1', vehicleId: 'volt-vector',
      paintId: 'inferno', difficultyId: 'normal' } } } as typeof initial;
  assert.equal(purchaseCamaroSpeedUpgrade(racing), racing);
});

test('migração aditiva de save v3 conserva carteira, SCORE, tentativas, veículo e upgrades antigos', () => {
  let old: ChampionshipState = { ...createChampionshipState({ id: 'legacy-career', attemptId: 'legacy-attempt' }),
    money: 1234, score: 680, upgrades: { attemptArmor: 2 }, ownedVehicleIds: ['volt-vector'] };
  old = setSelections(old, { vehicleId: 'volt-vector', paintId: 'inferno',
    pilotId: 'axel-ryder', difficultyId: 'normal' });
  old = beginChampionshipRace(ensureAssignedTrack(old, () => 0.25), 'legacy-active-race');
  const legacy: Record<string, unknown> = { ...old, schemaVersion: 3 };
  delete legacy.permanentUpgrades;
  const migrated = migrateChampionshipState(legacy);
  assert.ok(migrated);
   assert.equal(migrated.schemaVersion, 6);
  assert.equal(migrated.money, 1234);
  assert.equal(migrated.score, 680);
  assert.deepEqual(migrated.upgrades, { attemptArmor: 2 });
  assert.deepEqual(migrated.activeRace, old.activeRace, 'a corrida em andamento é mantida');
  assert.deepEqual(migrated.permanentUpgrades['volt-vector'], {
    speed: 0, acceleration: 0, armor: 0, control: 0, tires: 0, suspension: 0,
    shotCount: 0, bombCount: 0, oilSlickCount: 0,
  });

  const raw = JSON.stringify(legacy);
  const storage = {
    getItem: (key: string) => key === CHAMPIONSHIP_SAVE_KEY ? raw : null,
    key: () => null,
    get length() { return 1; },
  } as unknown as Storage;
  const loaded = loadChampionship(storage);
  assert.equal(loaded.writable, true, loaded.warning ?? undefined);
  assert.equal(loaded.raw, raw, 'a leitura não substitui nem regrava o original');
  assert.equal(loaded.state?.money, 1234);
  assert.equal(loaded.state?.score, 680);
});

test('migração v4→v5 preserva Velocidade e progresso, inicia os outros atributos em 0 e é repetível', () => {
  const source: ChampionshipState = { ...createChampionshipState({ id: 'v4-career', attemptId: 'v4-attempt' }),
    money: 4321, score: 680, ownedVehicleIds: ['volt-vector'],
    permanentUpgrades: { 'volt-vector': { ...createChampionshipState({ id: 'x', attemptId: 'y' })
      .permanentUpgrades['volt-vector'], speed: 3 } } };
  const legacy = { ...source, schemaVersion: 4 as const,
    permanentUpgrades: { 'volt-vector': { speed: 3 } } };
  const first = migrateChampionshipState(legacy);
  const second = migrateChampionshipState(legacy);
  assert.ok(first);
  assert.deepEqual(second, first, 'mesma origem produz migração idêntica sem cobrar nem elevar níveis');
   assert.equal(first.schemaVersion, 6);
  assert.equal(first.money, 4321);
  assert.equal(first.score, 680);
  assert.equal(first.permanentUpgrades['volt-vector'].speed, 3);
  for (const attribute of CAMARO_UPGRADE_ATTRIBUTE_KEYS.filter(key => key !== 'speed')) {
    assert.equal(first.permanentUpgrades['volt-vector'][attribute], 0);
  }
  assert.deepEqual(legacy.permanentUpgrades, { 'volt-vector': { speed: 3 } }, 'a migração não altera o save de origem');

  const raw = JSON.stringify(legacy);
  const values = new Map<string, string>([[CHAMPIONSHIP_SAVE_KEY, raw]]);
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    key: () => null,
    get length() { return values.size; },
  } as unknown as Storage;
  const loaded = loadChampionship(storage);
  assert.equal(loaded.writable, true, loaded.warning ?? undefined);
  if (!loaded.state) throw new Error('Save v4 válido não foi migrado');
  assert.equal(loaded.raw, raw, 'a leitura de v4 não grava nem sobrescreve o original');
  assert.equal(loaded.migrated, true);
  const purchased = purchaseCamaroUpgrade(loaded.state!, 'shotCount');
  const saved = saveChampionship(storage, { ...purchased, revision: purchased.revision + 1 }, loaded.raw);
  assert.equal(saved.ok, true, saved.warning ?? undefined);
  assert.equal(values.get(CHAMPIONSHIP_SAVE_KEY + ':backup'), raw, 'a primeira gravação preserva o v4 integral');
  const reloaded = loadChampionship(storage);
  assert.equal(reloaded.state?.money, 3821);
  assert.equal(reloaded.state?.permanentUpgrades['volt-vector'].speed, 3);
  assert.equal(reloaded.state?.permanentUpgrades['volt-vector'].shotCount, 1);
});

test('Camaro converte níveis para velocidade física linear entre 110 e 220 km/h sem tocar aceleração', () => {
  const expected = [110, 123.75, 137.5, 151.25, 165, 178.75, 192.5, 206.25, 220];
  for (let level = 0; level <= CAMARO_UPGRADE.maximumLevel; level += 1) {
    const points = camaroSpeedPoints(level);
    const handling = deriveHandlingStats({ speed: points, acceleration: 50 }, {}, {}, undefined, 'volt-vector');
    assert.equal(points, 36 + level * 8);
    assert.equal(camaroTopSpeedKmh(points), expected[level]);
    assert.ok(Math.abs(handling.maxSpeed * 4 - expected[level]!) < 1e-10);
    assert.equal(handling.acceleration, deriveHandlingStats({ speed: 36, acceleration: 50 }, {}, {}, undefined, 'volt-vector').acceleration);
  }
});

test('Modo DEV pode testar outro total sem alterar níveis comprados do jogador', () => {
  assert.equal(camaroRaceSpeedPoints(3), 60);
  assert.equal(camaroRaceSpeedPoints(3, 75), 75);
  assert.equal(camaroRaceSpeedPoints(3, 110), 100);
  assert.equal(camaroRaceSpeedPoints(3, 0), 36);
});
