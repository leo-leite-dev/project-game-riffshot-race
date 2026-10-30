import test from 'node:test';
import assert from 'node:assert/strict';
import { RaceSimulation, findNearestTrackPoint, sampleTrackAtProgress } from '../src/race/RaceSimulation.ts';
import type { RaceControls, RaceParticipant, RacePilot, RaceTrack } from '../src/race/RaceSimulation.ts';
import { RACE_TRACKS } from '../src/data/raceTracks.ts';
import { VEHICLES } from '../src/data/vehicles.ts';
import type { Vehicle } from '../src/data/vehicles.ts';
import type { SampledTrack } from '../src/race/trackMath.ts';

const DT = 1 / 60;
const neutral = { throttle: 0, brake: 0, steer: 0, handbrake: 0, nitro: false };
const pilot = { id: 'player', name: 'Piloto', stats: { speed: 5, acceleration: 5, handling: 5, endurance: 5, aggression: 5 } };
type TestState = { race: RaceSimulation; car: RaceParticipant };
type SetupOptions = { vehicle?: Vehicle; track?: RaceTrack; wide?: boolean; stats?: RacePilot['stats']; difficulty?: string };
function setup({ vehicle = VEHICLES[0], track = RACE_TRACKS[0], wide = false, stats = {}, difficulty = 'normal' }: SetupOptions = {}): TestState {
  const race = new RaceSimulation({ track: { ...track, width: wide ? 10000 : track.width }, difficulty,
    player: { ...pilot, stats: { ...pilot.stats, ...stats } }, playerVehicle: vehicle,
    botPilots: [1, 2, 3].map((id, index) => ({ ...pilot, id: `bot-${id}`, name: `Bot ${id}`, vehicleId: VEHICLES[index + 1].id })) });
  return { race, car: race.participants[0] };
}
function drive({ race, car }: TestState, frames: number, controls: RaceControls = {}) {
  for (let i = 0; i < frames; i += 1) race._integrate(car, { ...neutral, ...controls }, DT);
}
function motion(car: RaceParticipant, speed = 0, lateral = 0) {
  Object.assign(car, { x: 0, z: 0, heading: 0, velocityX: lateral, velocityZ: speed, speed: Math.hypot(speed, lateral) });
}
function isolatePair(race: RaceSimulation, normal = 10, tangent = 0): [RaceParticipant, RaceParticipant] {
  const [a, b, ...others] = race.participants;
  others.forEach((car, i) => { car.x = 1000 + i * 30; car.z = 1000; });
  Object.assign(a, { x: 0, z: 0, velocityX: normal / 2, velocityZ: tangent });
  Object.assign(b, { x: 3, z: 0, velocityX: -normal / 2, velocityZ: -tangent });
  return [a, b];
}
function tick(race: RaceSimulation, frames: number, controls: RaceControls = neutral) {
  for (let i = 0; i < frames; i += 1) race.advance(1000 / 60, controls);
}
const near = (actual: number, expected: number, epsilon = 1e-9) => assert.ok(Math.abs(actual - expected) < epsilon, `${actual} != ${expected}`);

test('atributos reais: cinco velocidades máximas e acelerações distintas com piloto idêntico e sem nitro', () => {
  const measured = VEHICLES.map(vehicle => {
    const state = setup({ vehicle, wide: true });
    motion(state.car);
    drive(state, 30, { throttle: 1 });
    const accelerationSpeed = state.car.speed;
    drive(state, 600, { throttle: 1 });
    near(state.car.speed, state.car.vehicle.maxSpeed);
    return { speed: state.car.speed, accelerationSpeed, acceleration: state.car.vehicle.acceleration };
  });
  const order = (key: 'speed' | 'accelerationSpeed') => measured.map((entry, index) => ({ value: entry[key], index })).sort((a, b) => a.value - b.value).map(entry => entry.index);
  assert.deepEqual(order('speed'), [2, 1, 0, 4, 3]);
  assert.deepEqual(order('accelerationSpeed'), [2, 1, 4, 0, 3]);
  assert.ok(measured[3].speed - measured[2].speed > 3);
  assert.ok(measured[3].accelerationSpeed - measured[2].accelerationSpeed > 1);
  assert.ok(measured[0].speed / measured[1].speed >= 1.08, 'Thunder deve superar Camaro em pelo menos 8% na reta');
  assert.ok(measured[0].accelerationSpeed / measured[2].accelerationSpeed >= 1.25,
    'Thunder deve ganhar pelo menos 25% mais velocidade que Armored no mesmo tempo');
  [31.2, 28.4, 27.6, 34.8, 33.6].forEach((speed, index) => near(measured[index].speed, speed));
  [16.08, 15.12, 12.24, 17.04, 15.36].forEach((acceleration, index) => near(measured[index].acceleration, acceleration));
});

test('atributos motor: nota isolada de velocidade e aceleração muda movimento sem alterar o outro parâmetro', () => {
  function measure(overrides: Partial<Vehicle['stats']>) {
    const state = setup({ wide: true, vehicle: { ...VEHICLES[0],
      stats: { speed: 62, acceleration: 52, control: 72, armor: 55, ...overrides } } });
    motion(state.car); drive(state, 30, { throttle: 1 });
    const launchSpeed = state.car.speed;
    drive(state, 600, { throttle: 1 });
    return { base: state.car.vehicle, launchSpeed, topSpeed: state.car.speed };
  }
  const baseline = measure({}), faster = measure({ speed: 76 }), quicker = measure({ acceleration: 84 });
  assert.ok(faster.topSpeed / baseline.topSpeed >= 1.08);
  near(faster.launchSpeed, baseline.launchSpeed);
  near(faster.base.acceleration, baseline.base.acceleration);
  assert.ok(quicker.launchSpeed / baseline.launchSpeed >= 1.25);
  near(quicker.topSpeed, baseline.topSpeed);
  near(quicker.base.maxSpeed, baseline.base.maxSpeed);
  for (const result of [faster, quicker]) {
    near(result.base.grip, baseline.base.grip);
    near(result.base.steering, baseline.base.steering);
  }
});

test('atributos motor: limites físicos dos bots são iguais entre Normal e Difícil', () => {
  const normal = setup(), hard = setup({ difficulty: 'hard' });
  for (const [index, car] of normal.race.participants.entries()) {
    const other = hard.race.participants[index];
    assert.equal(car.vehicleId, other.vehicleId);
    assert.deepEqual(car.vehicle, other.vehicle);
    near(car.vehicle.maxSpeed, [31.2, 28.4, 27.6, 34.8][index]);
    near(car.vehicle.acceleration, [16.08, 15.12, 12.24, 17.04][index]);
  }
  assert.equal(normal.race.difficulty.targetSpeed, 0.84);
  assert.ok(hard.race.difficulty.targetSpeed > normal.race.difficulty.targetSpeed);
});

test('atributos reais: controle altera trajetória lateral e giro isolando velocidade, piloto e dano', () => {
  const measured = VEHICLES.map(vehicle => {
    // Same engine ratings isolate control, while retaining each approved control.
    const state = setup({ vehicle: { ...vehicle, stats: { ...vehicle.stats, speed: 76, acceleration: 84 } }, wide: true });
    motion(state.car, 15, 6);
    drive(state, 20);
    const lateral = state.car.velocityX;
    motion(state.car, 15);
    drive(state, 1, { steer: 1 });
    return { lateral, heading: state.car.heading };
  });
  const controlOrder = [2, 4, 0, 3, 1];
  for (let i = 1; i < controlOrder.length; i += 1) {
    const low = measured[controlOrder[i - 1]], high = measured[controlOrder[i]];
    assert.ok(high.lateral < low.lateral);
    assert.ok(high.heading > low.heading);
  }
});

test('vida: capacidade aprovada de player e bots, armor sem redução dupla e endurance pequena', () => {
  const expected = [4, 3, 7, 5, 6];
  VEHICLES.forEach((vehicle, index) => {
    const { race, car } = setup({ vehicle });
    assert.equal(car.healthOrbs, expected[index]);
    assert.equal(car.maxHealth, expected[index] * 20);
    assert.equal(car.health, car.maxHealth);
    near(race.applyDamage(car, 20), 20, 1e-8);
    for (const bot of race.participants.slice(1)) {
      const vehicleIndex = VEHICLES.findIndex(entry => entry.id === bot.vehicleId);
      assert.equal(bot.health, expected[vehicleIndex] * 20);
    }
    // Durability must survive more identical impacts, not merely expose stats.
    let hits = 1;
    while (!car.destroyed) { race.applyDamage(car, 20); hits += 1; }
     assert.equal(hits, Math.ceil(car.maxHealth / (20 * car.vehicle.collisionDamageMultiplier)));
  });
  const novice = setup({ stats: { endurance: 1 } }), expert = setup({ stats: { endurance: 10 } });
  assert.ok(expert.race.applyDamage(expert.car, 20) < novice.race.applyDamage(novice.car, 20));
  near(expert.car.vehicle.collisionDamageMultiplier, 0.99);
  near(novice.car.vehicle.collisionDamageMultiplier, 1.008);
  for (const [armor, orbs] of [[0, 3], [20, 3], [40, 4], [60, 5], [80, 6], [100, 7], [200, 7]]) {
    assert.equal(setup({ vehicle: { ...VEHICLES[0], stats: { ...VEHICLES[0].stats, armor } } }).car.healthOrbs, orbs);
  }
});

test('dano: perda gradual de aderência até 35% e direção até 25%, sem acumular nem alterar base', () => {
  const outcomes = [1, 0.5, 0.001].map(ratio => {
    const state = setup({ wide: true });
    const base = { ...state.car.vehicle };
    state.race.applyDamage(state.car, state.car.maxHealth * (1 - ratio) / state.car.vehicle.collisionDamageMultiplier);
    motion(state.car, 15, 6);
    drive(state, 1);
    const correction = 6 - state.car.velocityX;
    motion(state.car, 15);
    drive(state, 1, { steer: 1 });
    const heading = state.car.heading;
    motion(state.car, 15);
    drive(state, 1, { steer: 1 });
    near(state.car.heading, heading);
    assert.deepEqual(state.car.vehicle, base);
    return { correction, heading };
  });
  assert.ok(outcomes[0].correction > outcomes[1].correction && outcomes[1].correction > outcomes[2].correction);
  near(outcomes[1].heading / outcomes[0].heading, 0.875);
  near(outcomes[2].heading / outcomes[0].heading, 0.75025);
  // At saturated lateral force, measured correction scales exactly with grip.
  const corrections = [1, 0.001].map(ratio => {
    const state = setup({ wide: true }); state.car.health *= ratio;
    motion(state.car, 0, 25); drive(state, 1);
    return 25 - state.car.velocityX;
  });
  near(corrections[1] / corrections[0], 0.65035);
});

test('contato: dano usa aproximação normal, não tangencial, separação ou raspagem lenta', () => {
  function loss(normal: number, tangent: number) {
    const { race } = setup(); const [car] = isolatePair(race, normal, tangent);
    const before = car.health; race._resolveVehicleContacts(); return before - car.health;
  }
  near(loss(10, 0), loss(10, 50));
  near(loss(20, 0) / loss(10, 0), 17.5 / 7.5);
  assert.equal(loss(-10, 0), 0);
  assert.equal(loss(2, 40), 0);
});

test('contato: cooldown de 0.85 segundo é por par e permite novo impacto depois', () => {
  const { race } = setup(); const [a, b] = isolatePair(race);
  race._resolveVehicleContacts(); const first = a.health;
  isolatePair(race); race._resolveVehicleContacts(0.4); assert.equal(a.health, first);
  const c = race.participants[2];
  b.x = 1000; Object.assign(c, { x: 3, z: 0, velocityX: -5, velocityZ: 0 });
  a.x = 0; a.velocityX = 5;
  race._resolveVehicleContacts(0.01); assert.ok(a.health < first, 'outro par não compartilha cooldown');
  const second = a.health;
  isolatePair(race); race._resolveVehicleContacts(0.44); assert.ok(a.health < second);
});

test('contato letal: destrói uma vez, zera velocidades e remove cooldown somente dos pares pertinentes', () => {
  const { race } = setup(); const [a, b] = isolatePair(race, 20);
  a.health = 0.01;
  race.contactCooldowns.set('bot-1:bot-2', 0.7);
  race._resolveVehicleContacts();
  assert.equal(a.destroyed, true); assert.equal(a.destructionSequence, 1);
  assert.equal(a.velocityX, 0); assert.equal(a.velocityZ, 0); assert.equal(a.speed, 0);
  assert.equal(race.contactCooldowns.has('player:bot-1'), false);
  assert.ok(race.contactCooldowns.has('bot-1:bot-2'));
  const health = b.health;
  isolatePair(race, 20); race._resolveVehicleContacts();
  assert.equal(b.health, health); assert.equal(a.destructionSequence, 1);
  assert.deepEqual(race.getBotControls(a), { throttle: 0, brake: 0, steer: 0, handbrake: 0, nitro: false });
});

function wallState(outward = 12, along = 0) {
  const state = setup(); const { race, car } = state;
  // A sample's outgoing tangent is the exact segment normal.
  const point = race.track.points[24];
  const place = (speed = outward, side = 1, offset = 0.05) => {
    const nx = -point.tangentZ * side, nz = point.tangentX * side;
    const centerX = point.x + point.tangentX * 0.4, centerZ = point.z + point.tangentZ * 0.4;
    Object.assign(car, { x: centerX + nx * (race.track.width / 2 - 1.2 + offset),
      z: centerZ + nz * (race.track.width / 2 - 1.2 + offset),
      heading: Math.atan2(nx, nz), velocityX: nx * speed + point.tangentX * along,
      velocityZ: nz * speed + point.tangentZ * along, speed: Math.hypot(speed, along) });
  };
  place();
  return { ...state, place };
}

test('parede dano: aproximação normal, uma vez por episódio, sem punir saída ou raspagem', () => {
  const slow = wallState(8), fast = wallState(16), tangent = wallState(8, 12);
  const losses = [slow, fast, tangent].map(state => { const before = state.car.health; drive(state, 1); return before - state.car.health; });
  assert.ok(losses[1] > losses[0] * 2);
  near(losses[0], losses[2], 0.2); // Tire forces affect the normal slightly before impact.
  const state = wallState(); drive(state, 1); const health = state.car.health;
  for (let i = 0; i < 5; i += 1) { state.place(); drive(state, 1); }
  assert.equal(state.car.health, health);
  state.place(0, 1, -0.5); drive(state, 1);
  state.place(); drive(state, 1); assert.ok(state.car.health < health);
  const outgoing = wallState(-8); drive(outgoing, 1); assert.equal(outgoing.car.health, outgoing.car.maxHealth);
  const scrape = wallState(0.2, 20); drive(scrape, 1); assert.equal(scrape.car.health, scrape.car.maxHealth);
});

test('projeção real: interior de segmento e fechamento preservam posição, altura e longitudinal', () => {
  const track: SampledTrack = { totalLength: 40, points: [
    { x: 0, z: 0, y: 0, distance: 0, tangentX: 1, tangentZ: 0 }, { x: 10, z: 0, y: 10, distance: 10, tangentX: 0, tangentZ: 1 },
    { x: 10, z: 10, y: 20, distance: 20, tangentX: -1, tangentZ: 0 }, { x: 0, z: 10, y: 10, distance: 30, tangentX: 0, tangentZ: -1 },
  ] };
  const point = findNearestTrackPoint(track, 3.7, -2);
  assert.ok(point);
  near(point.x, 3.7); near(point.z, 0); near(point.y, 3.7); near(point.distance, 3.7);
  const closing = findNearestTrackPoint(track, -2, 3.3);
  assert.ok(closing);
  near(closing.distance, 36.7); near(closing.y, 3.3); near(closing.tangentZ, -1);
});

test('progresso inicial: waiting, morte antes do start, respawn e primeiro passo imóvel mantêm progresso e ordem do grid', () => {
  for (const track of RACE_TRACKS) {
    const { race } = setup({ track });
    // Neutral inputs isolate the stationary lifecycle of every grid slot.
    race.botController.controlsFor = () => neutral;
    const initial = race.participants.map(car => ({ id: car.id, distance: car._distance,
      progress: car.progress, projection: findNearestTrackPoint(race.track, car.x, car.z) }));
    const ids = initial.map(car => car.id);
    assert.equal(race.status, 'waiting');
    assert.deepEqual(race.getStandings().map(car => car.id), ids);
    assert.deepEqual(race.getStandings().map(car => car.rank), [1, 2, 3, 4]);
    near(initial[0].progress, 0.985 / race.laps);
    near(initial[2].progress, 0.985 / race.laps);
    assert.ok(initial.every(car => Math.abs(car.progress - initial[0].progress) < 1e-10), 'os quatro carros largam alinhados');
    for (const car of race.participants) {
      assert.equal(car.progress, car._distance / (race.laps * race.track.totalLength));
      assert.ok(race.applyDamage(car, 10000) > 0);
    }
    tick(race, 1);
    assert.equal(race.elapsedTime, 0, 'waiting não executa simulação nem respawn');
    race.start(); tick(race, 48);
    for (const [index, car] of race.participants.entries()) {
      const before = initial[index];
      assert.ok(before.projection);
      assert.equal(car.destroyed, false); assert.equal(car.respawnSequence, 1);
      near(car.x, before.projection.x); near(car.z, before.projection.z);
      assert.equal(car._distance, before.distance);
      assert.equal(car.progress, before.progress, 'projeção lateral do respawn não altera progresso');
      assert.equal(car._nextGate, 0); assert.equal(car.nextCheckpoint, 1); assert.equal(car.lapsCompleted, 0);
    }
    tick(race, 1);
    for (const [index, car] of race.participants.entries()) {
      assert.equal(car.speed, 0); assert.equal(car.throttle, 0);
      assert.equal(car._distance, initial[index].distance);
      assert.equal(car.progress, initial[index].progress, 'primeiro update imóvel não causa salto de progresso');
      assert.equal(car._nextGate, 0); assert.equal(car.lapsCompleted, 0);
    }
    assert.deepEqual(race.getStandings().map(car => car.id), ids);
    assert.deepEqual(race.getStandings().map(car => car.rank), [1, 2, 3, 4]);
  }
});

test('progresso seguro: recuar, morrer e repercorrer não duplica distância, inclusive na emenda da pista', () => {
  for (const seam of [false, true]) {
    const { race, car } = setup(); race.start(); race.setVehicleContactsEnabled(false);
    race.participants.slice(1).forEach(bot => { bot.finished = true; });
    const base = seam ? race.track.totalLength - 95 : 30;
    const initial = sampleTrackAtProgress(race.track, base);
    Object.assign(car, { x: initial.x, z: initial.z, _prevX: initial.x, _prevZ: initial.z,
      _lastPathDistance: base, _distance: 0, progress: 0 });
     function move(distance: number) {
      car._prevX = car.x; car._prevZ = car.z;
      const point = sampleTrackAtProgress(race.track, base + distance);
      car.x = point.x; car.z = point.z;
      race._updateProgress(car);
    }
    for (let distance = 5; distance <= 100; distance += 5) move(distance);
    near(car._distance, 100);
    for (let distance = 95; distance >= 10; distance -= 5) move(distance);
    near(car._distance, 100); near(car._progressDebt, 90);
    const progress = car.progress;
    race.applyDamage(car, 10000); tick(race, 48);
    near(car._distance, 100); near(car._progressDebt, 90); near(car.progress, progress);
    for (let distance = 15; distance <= 100; distance += 5) {
      move(distance); near(car._distance, 100); near(car.progress, progress);
    }
    move(107); near(car._distance, 107); near(car._progressDebt, 0);
    near(car.progress, 107 / (race.laps * race.track.totalLength));
  }
});

test('progresso seguro: projeção lateral e respawns repetidos preservam débito e não dão progresso imóvel', () => {
  for (const lane of [-3, 3]) {
    const { race, car } = setup(); race.start(); race.setVehicleContactsEnabled(false);
    race.participants.slice(1).forEach(bot => { bot.finished = true; });
    const base = race.track.points[24].distance + 0.4;
    const initial = sampleTrackAtProgress(race.track, base + 8);
    Object.assign(car, { x: initial.x, z: initial.z, _prevX: initial.x, _prevZ: initial.z,
      _distance: 50, progress: 50 / (race.laps * race.track.totalLength), _lastPathDistance: base + 8 });
    const center = sampleTrackAtProgress(race.track, base);
    car.x = center.x; car.z = center.z; race._updateProgress(car);
    near(car._progressDebt, 8);
    const point = findNearestTrackPoint(race.track, car.x, car.z);
    assert.ok(point);
    car.x -= point.tangentZ * lane; car.z += point.tangentX * lane;
    const progress = car.progress;
    for (let death = 0; death < 2; death += 1) {
      car.respawnProtection = 0;
      race.applyDamage(car, 10000); tick(race, 48);
      car._prevX = car.x; car._prevZ = car.z;
      race._updateProgress(car); race._updateProgress(car);
      near(car._distance, 50); near(car.progress, progress); near(car._progressDebt, 8);
    }
    for (const [distance, expected] of [[7, 50], [9, 51]]) {
      car._prevX = car.x; car._prevZ = car.z;
      const next = sampleTrackAtProgress(race.track, base + distance);
      car.x = next.x; car.z = next.z; race._updateProgress(car);
      near(car._distance, expected);
    }
  }
});

test('respawn: destrói 0.8s, relógio corre, centro/altura/tangente exatos sem arrasto e sem ganhar progresso', () => {
  const { race, car } = setup({ track: RACE_TRACKS[1] }); race.start();
  const point = race.track.points[30], next = race.track.points[31];
  Object.assign(car, { x: point.x * 0.63 + next.x * 0.37 - point.tangentZ * 3,
    z: point.z * 0.63 + next.z * 0.37 + point.tangentX * 3,
    _distance: 123, progress: 0.2, lapsCompleted: 1, _nextGate: 2, nextCheckpoint: 3,
    _driftBoost: 1, _wallContactSide: 1, _aiSteer: 1, _aiThrottle: 1, _aiBrake: 1, _aiClock: 7 });
  const projected = findNearestTrackPoint(race.track, car.x, car.z);
  assert.ok(projected);
  race._updateNitro(car, { nitro: true }, DT); assert.equal(car.nitroCharges, 1);
  race.contactCooldowns.set('player:bot-1', 0.7); race.contactCooldowns.set('bot-1:bot-2', 0.7);
  assert.ok(race.applyDamage(car, 10000) > 0);
  const deadPosition = [car.x, car.z];
  assert.equal(car.destroyed, true); assert.equal(car.destructionSequence, 1);
  assert.equal(car.nitroActive, false); assert.equal(car.speed, 0);
  assert.equal(race.contactCooldowns.has('player:bot-1'), false);
  assert.equal(race.contactCooldowns.get('bot-1:bot-2'), 0.7);
  tick(race, 47, { ...neutral, throttle: 1, nitro: true });
  assert.equal(car.destroyed, true); assert.deepEqual([car.x, car.z], deadPosition);
  tick(race, 1, { ...neutral, throttle: 1, nitro: true });
  near(race.elapsedTime, 0.8); assert.equal(car.destroyed, false);
  assert.equal(car.health, car.maxHealth); assert.equal(car.respawnSequence, 1);
  near(car.respawnProtection, 1.5); assert.equal(car.nitroCharges, 1);
  near(car.x, projected.x); near(car.z, projected.z); near(car.y, projected.y);
  near(car.heading, Math.atan2(projected.tangentX, projected.tangentZ));
  assert.deepEqual([car._distance, car.progress, car.lapsCompleted, car._nextGate, car.nextCheckpoint], [123, 0.2, 1, 2, 3]);
  for (const alpha of [0, 0.3, 1]) {
    const pose = race.getRenderPose(car, alpha);
    near(pose.x, car.x); near(pose.z, car.z); near(pose.y, car.y); assert.equal(pose.speed, 0);
  }
  assert.equal(car._driftBoost, 0); assert.equal(car._wallContactSide, 0);
  assert.equal(car._aiSteer + car._aiThrottle + car._aiBrake + car._aiClock, 0);
  assert.equal(race.contactCooldowns.has('player:bot-1'), false);
  assert.ok(race.getVisualTelemetry(car).longitudinalSpeed === 0);
  tick(race, 90); near(car.respawnProtection, 0);
  assert.ok(race.applyDamage(car, 10000) > 0); assert.equal(car.destructionSequence, 2);
});

test('guards: destroyed/protected/finished ignoram dano e contatos, bots ignoram obstáculos intangíveis', () => {
  for (const flag of ['destroyed', 'respawnProtection', 'finished']) {
    const { race } = setup(); const [a, b] = isolatePair(race);
     if (flag === 'respawnProtection') a.respawnProtection = 1.5;
     else if (flag === 'destroyed') a.destroyed = true;
     else a.finished = true;
    const positions = [a.x, b.x]; const health = a.health;
    assert.equal(race.applyDamage(a, 10000), 0); race._resolveVehicleContacts();
    assert.deepEqual([a.x, b.x], positions); assert.equal(a.health, health);
    const ai = race.participants[2];
    b.finished = true;
    const initial = { ...ai };
    Object.assign(a, { x: ai.x + Math.sin(ai.heading) * 5, z: ai.z + Math.cos(ai.heading) * 5 });
    const ignored = race.getBotControls(ai);
    Object.assign(ai, initial); const absent = race.botController.controlsFor(ai, [ai], DT);
    assert.deepEqual(ignored, absent);
  }
  const state = wallState(15, 12); state.car.respawnProtection = 1;
  const edge = state.race.track.width / 2 - 1.2;
  function protectedWallStep() {
    const free = { ...state.car }, width = state.race.track.width;
    state.race.track.width = 10000;
    state.race._integrate(free, neutral, DT);
    state.race.track.width = width;
    const contact = findNearestTrackPoint(state.race.track, free.x, free.z);
     assert.ok(contact);
    drive(state, 1);
    assert.equal(state.car.health, state.car.maxHealth, 'proteção bloqueia dano, não a parede');
     const corrected = findNearestTrackPoint(state.race.track, state.car.x, state.car.z);
     assert.ok(corrected);
     assert.ok(Math.abs(corrected.lateral) <= edge + 0.01);
    assert.equal(state.car.destroyed, false);
    assert.equal(state.car.destructionSequence, 0);
    assert.equal(state.car.respawnSequence, 0);
    return { free, contact };
  }
  const { free, contact } = protectedWallStep();
  near(state.car.speed, free.speed * 0.5);
  assert.ok(state.car.velocityX * -contact.tangentZ + state.car.velocityZ * contact.tangentX < 0,
    'rebate padrão aponta para dentro mesmo durante a proteção');
  assert.equal(state.car._wallContactSide, 1);
  for (let frame = 0; frame < 5; frame += 1) {
    state.place(0.2);
    const { free: freeScrape } = protectedWallStep();
    assert.ok(state.car.speed > freeScrape.speed * 0.9, 'contato contínuo não acumula cortes de 50%');
    assert.equal(state.car._wallContactSide, 1);
  }
});

test('telemetria: contrato main e throttle/nitro efetivos antes, durante e após destruição', () => {
  const { race, car } = setup(); race.start();
  tick(race, 1, { ...neutral, throttle: 0.7, nitro: true });
  let telemetry = race.getVisualTelemetry(car);
  assert.equal(telemetry.throttle, 0.7); assert.equal(telemetry.nitroActive, true);
  race.applyDamage(car, 10000); telemetry = race.getVisualTelemetry(car);
  for (const key of ['health', 'maxHealth', 'healthOrbs', 'destroyed', 'respawnProtection', 'destructionSequence', 'respawnSequence'] as const) {
    assert.equal(telemetry[key], car[key]);
  }
  assert.equal(telemetry.throttle, 0); assert.equal(telemetry.nitroActive, false);
  assert.equal(telemetry.longitudinalSpeed, 0); assert.equal(telemetry.lateralSpeed, 0);
  tick(race, 48); telemetry = race.getVisualTelemetry(car);
  assert.equal(telemetry.respawnSequence, 1); assert.equal(telemetry.health, car.maxHealth);
  for (const amount of [-1, 0, NaN, Infinity]) assert.equal(race.applyDamage(car, amount), 0);
});

test('throttle público: countdown, forward, reverse, death, respawn e finished mantêm telemetria coerente', () => {
  const { race, car } = setup();
  race.setVehicleContactsEnabled(false);
  const check = (participant: RaceParticipant, expected: number, state: string) => {
    assert.equal(participant.throttle, expected, `${participant.id}: ${state}`);
    assert.equal(race.getVisualTelemetry(participant).throttle, expected, `telemetria: ${state}`);
  };
  for (const participant of race.participants) check(participant, 0, 'inicialização');
  tick(race, 3, { ...neutral, throttle: 1 });
  assert.equal(race.status, 'waiting');
  for (const participant of race.participants) check(participant, 0, 'countdown ignora acelerador');

  race.start();
  tick(race, 1, { ...neutral, throttle: 0.7 });
  check(car, 0.7, 'forward');
  for (const bot of race.participants.slice(1)) {
    assert.ok(bot.throttle > 0 && bot.throttle <= 1, 'bots também expõem o controle ativo');
    check(bot, bot.throttle, 'forward do bot');
  }
  tick(race, 1, { ...neutral, throttle: 2 });
  check(car, 1, 'forward normalizado');
  tick(race, 1, { ...neutral, throttle: -0.6 });
  check(car, -0.6, 'reverse');
  tick(race, 1, { ...neutral, throttle: -2 });
  check(car, -1, 'reverse normalizado');
  tick(race, 1);
  check(car, 0, 'soltar acelerador');
  tick(race, 1, { ...neutral, throttle: 1 });
  check(car, 1, 'acelerando antes da morte');

  race.applyDamage(car, 10000);
  assert.equal(car.destroyed, true);
  check(car, 0, 'death imediato');
  tick(race, 47, { ...neutral, throttle: 1 });
  assert.equal(car.destroyed, true);
  check(car, 0, 'death ignora acelerador segurado');
  tick(race, 1, { ...neutral, throttle: 1 });
  assert.equal(car.destroyed, false);
  assert.equal(car.respawnSequence, 1);
  check(car, 0, 'respawn sem controle residual');
  tick(race, 1, { ...neutral, throttle: 0.8 });
  check(car, 0.8, 'controle retorna após respawn');

  const gate = race.gates[3];
  Object.assign(car, { lapsCompleted: race.laps - 1, _nextGate: 3, nextCheckpoint: 4,
    x: gate.x - gate.tangentX * 0.02, z: gate.z - gate.tangentZ * 0.02,
    heading: Math.atan2(gate.tangentX, gate.tangentZ),
    velocityX: gate.tangentX * 15, velocityZ: gate.tangentZ * 15, speed: 15 });
  tick(race, 1, { ...neutral, throttle: 1 });
  assert.equal(car.finished, true);
  assert.equal(race.status, 'racing', 'chegada individual precede o término da corrida');
  check(car, 0, 'finished no próprio passo da chegada');
  tick(race, 1, { ...neutral, throttle: 1 });
  check(car, 0, 'finished ignora acelerador');
});

test('nitro respawn: cancelar ativo não recarrega nem consome outra carga ao segurar; novo acionamento funciona', () => {
  const { race, car } = setup(); race.start();
  const held = { ...neutral, nitro: true };
  tick(race, 1, held); assert.equal(car.nitroCharges, 1);
  race.applyDamage(car, 10000);
  assert.equal(race.applyDamage(car, 10000), 0); assert.equal(car.destructionSequence, 1);
  tick(race, 49, held);
  assert.equal(car.destroyed, false); assert.equal(car.nitroCharges, 1); assert.equal(car.nitroActive, false);
  assert.equal(car.nitroRemaining, 0); assert.equal(car.nitroRecoveryRemaining, 0);
  tick(race, 1); tick(race, 1, held);
  assert.equal(car.nitroCharges, 0); assert.equal(car.nitroActive, true);
});

test('gates respawn: morte antes, exatamente e depois do gate não teleporta checkpoint nem bloqueia cruzamento legítimo', () => {
  for (const offset of [-0.2, 0, 0.2]) {
    const { race, car } = setup(); race.start(); const gate = race.gates[0];
    Object.assign(car, { x: gate.x + gate.tangentX * offset, z: gate.z + gate.tangentZ * offset });
    if (offset > 0) {
      car._prevX = gate.x - gate.tangentX; car._prevZ = gate.z - gate.tangentZ;
      race._updateProgress(car);
    }
    const expected = car._nextGate;
    race.applyDamage(car, 10000); tick(race, 48);
    assert.equal(car._nextGate, expected);
    if (offset <= 0) {
      // A physical forward movement beginning at the respawn pose must count.
      tick(race, 40, { ...neutral, throttle: 1 });
      assert.equal(car._nextGate, 1, `gate legítimo perdido no offset ${offset}`);
    } else {
      tick(race, 5, { ...neutral, throttle: 1 }); assert.equal(car._nextGate, expected);
    }
  }
});

test('gates respawn lateral: morte sobre o plano de cada gate aceita a saída física após centralizar', () => {
  for (const track of RACE_TRACKS) for (const index of [0, 1, 2, 3]) for (const lane of [-3, 3]) {
    const { race, car } = setup({ track }); race.start(); const gate = race.gates[index];
    Object.assign(car, { _nextGate: index, nextCheckpoint: index + 1,
      x: gate.x - gate.tangentZ * lane, z: gate.z + gate.tangentX * lane });
    race.applyDamage(car, 10000); tick(race, 48);
    assert.equal(car._nextGate, index, 'teleporte não valida gate');
    race._updateProgress(car);
    assert.equal(car._nextGate, index, 'reavaliar a pose imóvel do respawn também não valida gate');
    tick(race, 40, { ...neutral, throttle: 1 });
    assert.equal(car._nextGate, (index + 1) % 4, `${track.id}/gate${index}/lane${lane}`);
    assert.equal(car.lapsCompleted, index === 3 ? 1 : 0);
  }
});

function pushedGate(index: number, lethal = false, targetIndex = 0): TestState {
  const { race } = setup(); race.start();
  const car = race.participants[targetIndex], pusher = race.participants[1 - targetIndex];
  race.participants.slice(2).forEach(bot => { bot.finished = true; });
  race.botController.controlsFor = () => neutral;
  const gate = race.gates[index];
  Object.assign(car, { x: gate.x - gate.tangentX * 0.2, z: gate.z - gate.tangentZ * 0.2,
    heading: Math.atan2(gate.tangentX, gate.tangentZ), _nextGate: index, nextCheckpoint: index + 1,
    velocityX: gate.tangentX * 6, velocityZ: gate.tangentZ * 6, speed: 6,
    lapsCompleted: index === 3 ? race.laps - 1 : 0, health: lethal ? 0.01 : car.maxHealth });
   const point = findNearestTrackPoint(race.track, car.x, car.z);
   assert.ok(point);
  car._lastPathDistance = point.distance;
  const beforeDistance = car._distance;
  Object.assign(pusher, { x: car.x - gate.tangentX * 3, z: car.z - gate.tangentZ * 3,
    heading: car.heading, velocityX: gate.tangentX * 20, velocityZ: gate.tangentZ * 20, speed: 20 });
  tick(race, 1);
  assert.ok((car.x - gate.x) * gate.tangentX + (car.z - gate.z) * gate.tangentZ > 0, 'separação atravessou o gate');
   const after = findNearestTrackPoint(race.track, car.x, car.z);
   assert.ok(after);
  let displacement = after.distance - point.distance;
  if (displacement < -race.track.totalLength / 2) displacement += race.track.totalLength;
  near(car._distance - beforeDistance, displacement, 1e-8);
  return { race, car };
}

test('gates empurrão: separação física cruza checkpoint uma vez sem recontar integração', () => {
  for (const targetIndex of [0, 1]) {
    const { race, car } = pushedGate(0, false, targetIndex);
    assert.equal(car._nextGate, 1); assert.equal(car.nextCheckpoint, 2);
    assert.equal(car.destroyed, false);
    const distance = car._distance;
    race._resolveVehicleContacts();
    near(car._distance, distance); assert.equal(car._nextGate, 1);
  }
});

test('gates empurrão: checkpoint anterior ao dano letal sobrevive à morte e ao respawn', () => {
  const { race, car } = pushedGate(0, true);
  assert.equal(car.destroyed, true); assert.equal(car._nextGate, 1);
  const distance = car._distance, progress = car.progress;
  tick(race, 48);
  assert.equal(car.destroyed, false); assert.equal(car._nextGate, 1);
  near(car._distance, distance); near(car.progress, progress);
});

test('gates empurrão: chegada por separação precede dano letal e mantém resultado e throttle público', () => {
  for (const targetIndex of [0, 1]) {
     const { race, car } = pushedGate(3, true, targetIndex);
     assert.equal(car.finished, true); assert.equal(car.lapsCompleted, race.laps);
     assert.ok(car._visualImpact !== undefined);
     assert.ok(car._visualImpact > 2.5, 'aproximação de impacto seria letal com 0.01 HP');
    assert.equal(car.destroyed, false); assert.equal(car.destructionSequence, 0);
    assert.equal(car.health, 0.01); assert.equal(car.throttle, 0);
    assert.equal(race.getVisualTelemetry(car).throttle, 0);
    assert.equal(car.finishTime, DT); assert.equal(car._finishOrder, 1);
    tick(race, 1);
    assert.equal(car._finishOrder, 1); assert.equal(race.finishSequence, 1);
  }
});

test('gates: chegada física no timestep do impacto letal de parede ou carro prevalece', () => {
  for (const kind of ['wall', 'car']) {
    const { race, car } = setup(); race.start();
    const gate = race.gates[3]; car.lapsCompleted = race.laps - 1; car._nextGate = 3; car.nextCheckpoint = 4;
    const nx = -gate.tangentZ, nz = gate.tangentX;
    const lateral = kind === 'wall' ? race.track.width / 2 - 1.21 : 0;
    Object.assign(car, { health: 0.01, x: gate.x - gate.tangentX * 0.02 + nx * lateral,
      z: gate.z - gate.tangentZ * 0.02 + nz * lateral,
      heading: Math.atan2(gate.tangentX, gate.tangentZ),
      velocityX: gate.tangentX * 15 + nx * 10, velocityZ: gate.tangentZ * 15 + nz * 10, speed: 18 });
    const rival = race.participants[1];
    if (kind === 'car') Object.assign(rival, { x: gate.x + gate.tangentX * 3, z: gate.z + gate.tangentZ * 3,
      velocityX: -gate.tangentX * 10, velocityZ: -gate.tangentZ * 10 });
    tick(race, 1);
    assert.equal(car.finished, true, kind); assert.equal(car.destroyed, false, kind);
    assert.equal(car.destructionSequence, 0); assert.ok(Number.isFinite(car.finishTime));
     if (kind === 'wall') {
       assert.ok(car._visualImpact !== undefined);
       assert.ok(car._visualImpact > 2.5, 'houve impacto real potencialmente letal');
     }
  }
});

test('gates dano: checkpoint físico anterior à parede letal é preservado no respawn', () => {
  const { race, car } = setup(); race.start(); const gate = race.gates[0];
  const nx = -gate.tangentZ, nz = gate.tangentX, lateral = race.track.width / 2 - 1.21;
  Object.assign(car, { health: 0.01, x: gate.x - gate.tangentX * 0.02 + nx * lateral,
    z: gate.z - gate.tangentZ * 0.02 + nz * lateral,
    heading: Math.atan2(gate.tangentX, gate.tangentZ),
    velocityX: gate.tangentX * 15 + nx * 10, velocityZ: gate.tangentZ * 15 + nz * 10, speed: 18 });
  tick(race, 1);
  assert.equal(car.destroyed, true); assert.equal(car._nextGate, 1);
  const progress = car.progress, distance = car._distance;
  tick(race, 48);
  assert.equal(car._nextGate, 1); assert.equal(car.nextCheckpoint, 2);
  assert.equal(car.progress, progress); assert.equal(car._distance, distance);
});

for (const track of RACE_TRACKS) {
  test(`bots dano: completam ${track.id} com destruição/respawn de todos e quatro resultados válidos`, t => {
    const { race } = setup({ track }); race.start();
    for (let i = 0; i < 180 * 60 && race.status !== 'finished'; i += 1) {
      if (i === 180) for (const car of race.participants) race.applyDamage(car, 10000);
      race.advance(1000 / 60, race.getBotControls(race.participants[0], DT));
    }
    const summary = race.getStandings().map(car => ({ id: car.id, laps: car.lapsCompleted, gate: car._nextGate, health: car.health, deaths: car.destructionSequence }));
    assert.equal(race.status, 'finished', JSON.stringify(summary));
    assert.ok(race.participants.every(car => car.finished && car.lapsCompleted === track.laps && Number.isFinite(car.finishTime)));
    assert.ok(race.participants.every(car => car.destructionSequence >= 1 && car.respawnSequence >= 1));
    assert.deepEqual(race.getStandings().map(car => car.rank), [1, 2, 3, 4]);
    t.diagnostic(`${track.id}/normal: quatro chegadas em ${race.elapsedTime.toFixed(2)}s; destruições por piloto: ${race.participants.map(car => `${car.id}=${car.destructionSequence}`).join(', ')}`);
  });
}
