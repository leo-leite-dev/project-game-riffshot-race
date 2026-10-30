import test from 'node:test';
import assert from 'node:assert/strict';
import { RaceSimulation, sampleTrackAtProgress } from '../src/race/RaceSimulation.ts';
import type { RaceParticipant } from '../src/race/RaceSimulation.ts';
import { BotController } from '../src/race/BotController.ts';
import type { BotParticipant } from '../src/race/BotController.ts';
import { DIFFICULTIES } from '../src/data/raceDifficulty.ts';
import { OPENING_RIVAL } from '../src/data/openingRival.ts';
import { RACE_TRACKS } from '../src/data/raceTracks.ts';
import { CHARACTERS } from '../src/data/characters.ts';
import { findNearestTrackPoint } from '../src/race/trackMath.ts';

const DT = 1 / 60;
const neutral = { throttle: 0, brake: 0, steer: 0, handbrake: 0, nitro: false };
const entrants = [
  OPENING_RIVAL,
  { ...CHARACTERS[2], vehicleId: 'volt-vector' },
  { ...CHARACTERS[3], vehicleId: 'iron-bastion' },
];

// Frozen reference of the pre-upgrade controller (HEAD), kept only in this test.
// Running it through the SAME simulation avoids historical timing claims and
// isolates the controller gain from vehicle stats, physics and combat changes.
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const lerp = (a: number, b: number, amount: number) => a + (b - a) * amount;
const wrapAngle = (angle: number) => ((angle + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
class LegacyBotController extends BotController {
  override controlsFor(car: BotParticipant, participants: BotParticipant[], dt: number) {
    if (car.finished || car.destroyed) return { ...neutral };
    car._aiClock = (car._aiClock ?? 0) + dt;
    const nearest = findNearestTrackPoint(this.track, car.x, car.z);
    if (!nearest) return { ...neutral, brake: 1 };
    const lookahead = this.difficulty.lookahead;
    const target = sampleTrackAtProgress(this.track, nearest.distance + lookahead);
    let desiredLane = car._baseLane;
    for (const rival of participants) {
      if (rival === car || rival.finished || rival.destroyed || rival.respawnProtection > 0) continue;
      const dx = rival.x - car.x, dz = rival.z - car.z;
      const forward = dx * Math.sin(car.heading) + dz * Math.cos(car.heading);
      if (forward > 0 && forward < 10 && dx * dx + dz * dz < 13 * 13 && this.difficulty.overtakeDesire > 0.25) {
        desiredLane = car._baseLane > 0 ? -3.3 : 3.3;
      }
    }
    car._lane = lerp(car._lane, desiredLane, 1 - Math.exp(-dt * 1.5));
    const targetX = target.x - target.tangentZ * car._lane;
    const targetZ = target.z + target.tangentX * car._lane;
    const headingError = wrapAngle(Math.atan2(targetX - car.x, targetZ - car.z) - car.heading);
    const pathCorrection = clamp((nearest.lateral - car._lane) * 0.085, -0.42, 0.42);
    const smallMistake = Math.sin(car._aiClock * 2.1 + car._lane) * this.difficulty.steeringError;
    const steeringTarget = clamp(headingError * this.difficulty.steeringGain + pathCorrection + smallMistake, -1, 1);
    const ahead = sampleTrackAtProgress(this.track, nearest.distance + lookahead * this.difficulty.brakeAnticipation);
    const later = sampleTrackAtProgress(this.track, nearest.distance + lookahead * 1.8);
    const turn = Math.abs(Math.atan2(
      ahead.tangentX * later.tangentZ - ahead.tangentZ * later.tangentX,
      ahead.tangentX * later.tangentX + ahead.tangentZ * later.tangentZ,
    ));
    const targetSpeed = car.vehicle.maxSpeed * this.difficulty.targetSpeed * clamp(1 - turn * 0.28, 0.76, 1);
    const response = 1 - Math.exp(-dt / Math.max(0.04, this.difficulty.reaction));
    car._aiSteer = lerp(car._aiSteer, steeringTarget, response);
    car._aiThrottle = lerp(car._aiThrottle, car.speed < targetSpeed ? 1 : 0, response);
    car._aiBrake = lerp(car._aiBrake, car.speed > targetSpeed + 1.5 ? 0.65 : 0, response);
    if (car._aiBrake < 0.001) car._aiBrake = 0;
    const nitro = car.vehicle.nitroCharges > 0 && car.nitroCharges > 0
      && car.speed < targetSpeed * 0.72 && Math.abs(steeringTarget) < 0.55;
    return { throttle: car._aiThrottle, brake: car._aiBrake, steer: car._aiSteer, handbrake: 0, nitro };
  }
}

const legacyDifficulties = {
  normal: { id: 'normal', label: 'Normal', lookahead: 17, brakeAnticipation: 0.73,
    steeringGain: 1.82, steeringError: 0.045, reaction: 0.34, overtakeDesire: 0.36, targetSpeed: 0.84 },
  hard: { id: 'hard', label: 'Difícil', lookahead: 27, brakeAnticipation: 0.92,
    steeringGain: 2.35, steeringError: 0.035, reaction: 0.12, overtakeDesire: 0.78, targetSpeed: 0.92 },
};

// Solo laps isolate driving from traffic/combat. All forces, wall damage,
// destruction, respawn and ordered gates remain RaceSimulation's real rules.
// _step deliberately bypasses the production stop-on-player-finish policy.
function solo(track: typeof RACE_TRACKS[number], difficulty: 'normal' | 'hard', entrant = entrants[0],
  reference?: 'legacy' | 'legacy-current-settings') {
  const race = new RaceSimulation({ track, difficulty, laps: 3,
    player: { id: 'observer', name: 'Observer' }, botPilots: [entrant, entrants[1], entrants[2]] });
  const car = race.participants[1];
  if (reference) race.botController = new LegacyBotController(race.track,
    reference === 'legacy' ? legacyDifficulties[difficulty] : DIFFICULTIES[difficulty]);
  Object.assign(car, { aiProfile: 'aiProfile' in entrant ? entrant.aiProfile : undefined });
  for (const other of race.participants) if (other !== car) other.finished = true;
  race.setVehicleContactsEnabled(false);
  const laps: number[] = [];
  const physicalStats = { ...car.vehicle };
  let previousLapTime = 0, damageHits = 0;
  for (let step = 0; step < 150 * 60 && !car.finished; step += 1) {
    const previousLaps = car.lapsCompleted, previousHealth = car.health;
    race._step(DT, neutral);
    assert.ok(car.speed <= car.vehicle.maxSpeed * 1.06 + 1e-8, 'sem nitro, apenas o teto comum de drift é permitido');
    if (car.health < previousHealth) damageHits += 1;
    if (car.lapsCompleted > previousLaps) {
      laps.push(Number((race.elapsedTime - previousLapTime).toFixed(3)));
      previousLapTime = race.elapsedTime;
    }
  }
  assert.equal(car.finished, true, `${track.id}/${difficulty}/${entrant.vehicleId}: gates=${car._nextGate}, laps=${car.lapsCompleted}`);
  assert.equal(car.lapsCompleted, 3);
  assert.deepEqual(car.vehicle, physicalStats, 'o controlador não altera atributos físicos');
  return { track: track.id, difficulty, vehicle: entrant.vehicleId, laps, damageHits,
    deaths: car.destructionSequence, total: Number(race.elapsedTime.toFixed(3)) };
}

test('benchmark IA: rival contra controlador legado real nas duas pistas e dificuldades', t => {
  for (const track of RACE_TRACKS) {
    let normalTime = Infinity;
    for (const difficulty of ['normal', 'hard'] as const) {
      const before = solo(track, difficulty, entrants[0], 'legacy');
      const sameSettings = difficulty === 'normal' ? before
        : solo(track, difficulty, entrants[0], 'legacy-current-settings');
      const after = solo(track, difficulty);
      t.diagnostic(JSON.stringify({ track: track.id, difficulty, before, sameSettings, after,
        gainPercent: Number(((1 - after.total / before.total) * 100).toFixed(2)) }));
      assert.ok(after.total < before.total * 0.98, 'ganho de pelo menos 2% sobre a versão anterior');
      assert.ok(after.total < sameSettings.total * 0.98, 'ganho de pilotagem com configurações idênticas');
      assert.equal(after.damageHits, 0, 'a referência de pista livre deve preservar o carro');
      assert.equal(after.deaths, 0);
      if (difficulty === 'normal') normalTime = after.total;
      else assert.ok(after.total < normalTime * 0.95, 'difícil é mais competitivo que normal');
    }
  }
});

const straightTrack = {
  width: 14, laps: 3, startGrid: [{ lane: 0 }, { lane: 0 }, { lane: -3.3 }, { lane: 3.3 }],
  waypoints: [
    { x: 0, z: 0 }, { x: 0, z: 100 }, { x: 0, z: 200 }, { x: 0, z: 300 },
    { x: 100, z: 400 }, { x: 300, z: 400 }, { x: 400, z: 300 },
    { x: 400, z: 100 }, { x: 300, z: 0 }, { x: 100, z: 0 },
  ],
};
function fixture(track = straightTrack, difficulty: 'normal' | 'hard' = 'hard') {
  const race = new RaceSimulation({ track, difficulty,
    player: { id: 'observer', name: 'Observer' }, botPilots: entrants });
  for (const car of race.participants) car.finished = false;
  const car = race.participants[1];
  // Explicit opt-in also works before RaceScene/participant types are integrated.
  Object.assign(car, { aiProfile: 'rival' });
  place(race, car, 150, 25);
  return { race, car, controller: race.botController };
}
function place(race: RaceSimulation, car: RaceParticipant, distance: number, speed: number, lane = 0) {
  const point = sampleTrackAtProgress(race.track, distance);
  Object.assign(car, { x: point.x - point.tangentZ * lane, z: point.z + point.tangentX * lane,
    heading: Math.atan2(point.tangentX, point.tangentZ), speed,
    velocityX: point.tangentX * speed, velocityZ: point.tangentZ * speed,
    _lane: lane, _lastPathDistance: distance, _aiSteer: 0, _aiBrake: 0, _aiThrottle: 1, _aiClock: 0 });
}
function settle(controller: BotController, car: BotParticipant, participants = [car], frames = 90) {
  let controls = controller.controlsFor(car, participants, DT);
  for (let i = 1; i < frames; i += 1) controls = controller.controlsFor(car, participants, DT);
  return { ...controls };
}

test('rival: identidade estável, Widowmaker e orçamento próprio de 30 pontos', () => {
  assert.equal(OPENING_RIVAL.id, 'ravik-ferro');
  assert.equal(OPENING_RIVAL.vehicleId, 'widowmaker');
  assert.equal(OPENING_RIVAL.aiProfile, 'rival');
  assert.deepEqual(OPENING_RIVAL.stats, { speed: 8, acceleration: 7, handling: 7, endurance: 5, aggression: 3 });
  assert.equal(Object.values(OPENING_RIVAL.stats).reduce((sum, value) => sum + value, 0), 30);
  assert.ok(Object.isFrozen(OPENING_RIVAL.stats));
  const normal = fixture(straightTrack, 'normal'), hard = fixture();
  assert.deepEqual(normal.car.vehicle, hard.car.vehicle);
  assert.equal(normal.car.maxHealth, hard.car.maxHealth);
});

test('IA: perfil opcional muda pilotagem sem modificar física, posição, vida ou cargas', () => {
  const { race, car, controller } = fixture();
  place(race, car, 150, 25, 1);
  const generic = { ...car, vehicle: { ...car.vehicle }, aiProfile: undefined };
  const snapshot = { vehicle: { ...car.vehicle }, x: car.x, z: car.z,
    velocityX: car.velocityX, velocityZ: car.velocityZ, health: car.health, nitroCharges: car.nitroCharges };
  const rivalInput = settle(controller, car), genericInput = settle(controller, generic);
  assert.notDeepEqual(rivalInput, genericInput);
  for (const participant of [car, generic]) {
    for (const [key, value] of Object.entries(snapshot)) assert.deepEqual(participant[key as keyof typeof participant], value);
  }
  const minimal: BotParticipant = { finished: false, destroyed: false, respawnProtection: 0,
    x: car.x, z: car.z, heading: car.heading, speed: 20, nitroCharges: 0,
    vehicle: { maxSpeed: 30, nitroCharges: 0 }, _aiClock: 0, _aiSteer: 0,
    _aiThrottle: 0, _aiBrake: 0, _baseLane: 0, _lane: 0 };
  const { corneringSafety: _safety, ...compatibleDifficulty } = DIFFICULTIES.hard;
  const compatible = new BotController(race.track, compatibleDifficulty);
  for (const value of Object.values(compatible.controlsFor(minimal, [minimal], DT))) {
    assert.ok(typeof value === 'boolean' || Number.isFinite(value));
  }
});

test('IA: deslizamento real muda a correção mesmo com posição, carroceria e velocidade iguais', () => {
  const { car, controller } = fixture();
  const aligned = { ...car };
  const sliding = { ...car, velocityX: Math.sin(car.heading + 0.35) * car.speed,
    velocityZ: Math.cos(car.heading + 0.35) * car.speed };
  const straight = settle(controller, aligned), countersteer = settle(controller, sliding);
  assert.ok(countersteer.steer < straight.steer - 0.15, JSON.stringify({ straight, countersteer }));
});

test('IA: perda de aderência por dano exige reduzir mais na mesma curva', () => {
  const track = { ...straightTrack, waypoints: Array.from({ length: 16 }, (_, index) => ({
    x: Math.sin(index / 16 * Math.PI * 2) * 32, z: Math.cos(index / 16 * Math.PI * 2) * 32,
  })) };
  const { race, car, controller } = fixture(track);
  place(race, car, 40, 24);
  const damaged = { ...car, health: car.maxHealth * 0.2 };
  const full = settle(controller, car), hurt = settle(controller, damaged);
  assert.ok(hurt.brake > full.brake + 0.1, JSON.stringify({ full, hurt }));
});

test('IA: frenagem antecipa curva próxima e sequência em S, sem reduzir numa reta livre', () => {
  const track = { ...straightTrack, waypoints: [
    { x: 0, z: 0 }, { x: 0, z: 40 }, { x: 0, z: 60 }, { x: 18, z: 75 },
    { x: -18, z: 95 }, { x: 0, z: 110 }, { x: 0, z: 150 },
    { x: 180, z: 150 }, { x: 180, z: 0 }, { x: 100, z: -30 },
  ] };
  const corner = fixture(track), straight = fixture();
  place(corner.race, corner.car, 48, 33);
  place(straight.race, straight.car, 150, 33);
  const beforeS = settle(corner.controller, corner.car), onStraight = settle(straight.controller, straight.car);
  assert.ok(beforeS.brake > 0.2, JSON.stringify(beforeS));
  assert.equal(onStraight.brake, 0);
  assert.ok(onStraight.throttle > 0.9);
});

test('IA: linha em reta abandona a faixa de grid e freio residual é liberado exatamente', () => {
  const { controller, car } = fixture();
  for (const lane of [-3.3, 3.3]) {
    const driver = { ...car, _baseLane: lane, _lane: lane, _aiBrake: 0.65 };
    const controls = settle(controller, driver, [driver], 180);
    assert.ok(Math.abs(driver._lane) < 0.01);
    assert.equal(controls.brake, 0);
    assert.ok(controls.throttle > 0.9);
  }
});

test('IA: ultrapassagem escolhe corredor livre, freia na aproximação e mantém compromisso', () => {
  for (const occupiedSide of [-1, 1]) {
    const { race, controller, car } = fixture();
    const blocker = race.participants[0], occupied = race.participants[2];
    place(race, blocker, 159, 5);
    place(race, occupied, 156, 5, 4.6 * occupiedSide);
    controller.controlsFor(car, [car, blocker, occupied], DT);
    assert.ok(car._lane * occupiedSide < 0, 'escolhe o lado oposto ao ocupado');
    assert.ok(car._aiBrake > 0, 'reduz enquanto ainda está atrás do bloqueio');
    settle(controller, car, [car, blocker, occupied], 15);
    const passingLane = car._lane;
    settle(controller, car, [car], 6);
    assert.ok(car._lane * occupiedSide < passingLane * occupiedSide,
      'a ausência momentânea do bloqueio não cancela a manobra');
  }
});

test('IA: corredor atravessado por outro carro não é tratado como livre', () => {
  const { race, controller, car } = fixture();
  const blocker = race.participants[0], crossing = race.participants[2];
  place(race, blocker, 159, 5);
  place(race, crossing, 162, 5);
  crossing.velocityX = -9.2 / 0.6;
  controller.controlsFor(car, [car, blocker, crossing], DT);
  assert.ok(car._lane < 0, 'a trajetória do outro carro cruza o corredor positivo');
});

test('IA: dois corredores ocupados fazem esperar; desejo de ultrapassar tem efeito contínuo', () => {
  const { race, car, controller } = fixture();
  const [blocker, , left, right] = race.participants;
  place(race, blocker, 159, 5); place(race, left, 156, 5, 4.6); place(race, right, 156, 5, -4.6);
  const waiting = settle(controller, car, [car, blocker, left, right]);
  assert.ok(Math.abs(car._lane) < 0.01);
  assert.ok(waiting.brake > 0.8);
  place(race, blocker, 167, 20);
  const cautious = { ...car, _lane: 0, _aiClock: 0 }, eager = { ...cautious };
  const low = new BotController(race.track, { ...DIFFICULTIES.hard, overtakeDesire: 0.36 });
  const high = new BotController(race.track, { ...DIFFICULTIES.hard, overtakeDesire: 0.98 });
  low.controlsFor(cautious, [cautious, blocker], DT); high.controlsFor(eager, [eager, blocker], DT);
  assert.ok(Math.abs(cautious._lane) < 0.01);
  assert.ok(Math.abs(eager._lane) > 0.05);
});

test('IA: fila parada sem corredor não recebe aceleração residual', () => {
  const { race, controller, car } = fixture();
  const [blocker, , left, right] = race.participants;
  place(race, car, 150, 0);
  place(race, blocker, 154, 0); place(race, left, 154, 0, 4.6); place(race, right, 154, 0, -4.6);
  const controls = settle(controller, car, [car, blocker, left, right], 180);
  assert.ok(controls.throttle < 1e-9, 'não avança aos poucos contra o bloqueio');
  assert.ok(Math.abs(car._lane) < 0.01);
});

test('IA: ultrapassagem física de carro parado preserva vida e evita contato', () => {
  const { race, car } = fixture();
  const blocker = race.participants[0];
  // Start outside stopping distance + reaction + collision radius, so this
  // checks a feasible maneuver rather than spawning inside its safety horizon.
  place(race, blocker, 175, 0);
  for (const other of race.participants.slice(2)) other.finished = true;
  race.lastAdvanceContactCorrections = 0;
  race.diagnostics = true;
  const trace: unknown[] = [];
  for (let i = 0; i < 180; i += 1) {
    race._step(DT, neutral);
    if (i % 30 === 0) trace.push({ x: car.x, z: car.z, speed: car.speed,
      heading: car.heading, lane: car._lane, throttle: car._aiThrottle, brake: car._aiBrake });
    assert.equal(race.lastAdvanceContactCorrections, 0, JSON.stringify({ step: i, trace,
      car: { x: car.x, z: car.z }, blocker: { x: blocker.x, z: blocker.z } }));
  }
  const point = sampleTrackAtProgress(race.track, 175);
  assert.ok((car.x - blocker.x) * point.tangentX + (car.z - blocker.z) * point.tangentZ > 6, JSON.stringify(trace));
  assert.equal(race.lastAdvanceContactCorrections, 0);
  assert.equal(car.health, car.maxHealth, JSON.stringify(trace));
});

test('IA: ignora obstáculos intangíveis e não comanda carros destruídos/concluídos', () => {
  const { race, car, controller } = fixture();
  const obstacle = race.participants[0]; place(race, obstacle, 156, 0);
  for (const flag of ['finished', 'destroyed', 'respawnProtection'] as const) {
    const driver = { ...car }, reference = { ...car };
    Object.assign(obstacle, { finished: false, destroyed: false, respawnProtection: 0, [flag]: flag === 'respawnProtection' ? 1 : true });
    assert.deepEqual({ ...controller.controlsFor(driver, [driver, obstacle], DT) }, controller.controlsFor(reference, [reference], DT));
  }
  for (const flag of ['finished', 'destroyed'] as const) {
    assert.deepEqual(controller.controlsFor({ ...car, [flag]: true }, [car], DT), neutral);
  }
});

test('IA: nitro aguarda reta aproveitável e não freia contra o próprio impulso ativo', () => {
  const { race, car, controller } = fixture();
  // Ability belongs to the car; the controller requests it but cannot spend it.
  car.vehicle = { ...car.vehicle, nitroCharges: 2, nitroMultiplier: 1.35, nitroSeconds: 3 };
  car.nitroCharges = 2;
  place(race, car, 150, car.vehicle.maxSpeed * 0.8);
  assert.equal(settle(controller, car).nitro, true);
  car.nitroActive = true;
  place(race, car, 150, car.vehicle.maxSpeed * 1.2);
  const boosted = settle(controller, car);
  assert.equal(boosted.brake, 0);
  assert.ok(boosted.throttle > 0.9);
  assert.equal(car.nitroCharges, 2);
});

test('IA: cache readquire a pista após reposicionamento e limpa compromisso no reset', () => {
  const { race, car, controller } = fixture();
  const blocker = race.participants[0]; place(race, blocker, 159, 5);
  settle(controller, car, [car, blocker], 30);
  // Same controller has a stale spatial hint and an unfinished overtake.
  place(race, car, race.track.totalLength * 0.6, 20);
  const fresh = { ...car };
  assert.deepEqual({ ...controller.controlsFor(car, [car], DT) },
    new BotController(race.track, DIFFICULTIES.hard).controlsFor(fresh, [fresh], DT));
});

test('IA: repetição determinística reproduz voltas, dano e tempo físico do rival', () => {
  assert.deepEqual(solo(RACE_TRACKS[0], 'hard'), solo(RACE_TRACKS[0], 'hard'));
});

test('rival em tráfego: formação real nas duas pistas hard com jogador Vera/Kira', t => {
  const windowSeconds = 120;
  const results = [];
  for (const track of RACE_TRACKS) {
    for (const player of CHARACTERS.slice(0, 2)) {
      // Same selection/order as RaceScene.createOpponents: the unselected
      // Vera/Kira drives Camaro and Echo drives Armored, each with own stats.
      const opponents = CHARACTERS.filter(pilot => pilot.id !== player.id).slice(0, 2);
      const race = new RaceSimulation({ track, difficulty: 'hard', player,
        botPilots: [OPENING_RIVAL, ...opponents.map((pilot, index) => ({
          ...pilot, vehicleId: index === 0 ? 'volt-vector' : 'iron-bastion',
        }))] });
      // Keep all three NPCs active, including real contacts, damage and gates.
      // _step bypasses advance's stop-on-player-finish; the finished observer
      // also suppresses the cannon through the production guard, without mocks.
      race.participants[0].finished = true;
      const records = race.participants.slice(1).map(car => ({ car,
        gates: [] as { lap: number; gate: number; time: number }[], lapTimes: [] as number[] }));
      assert.equal(race.vehicleContactsEnabled, true);
      assert.equal(records[0].car.aiProfile, 'rival', 'usa o perfil integrado pela simulação');
      for (let step = 0; step < windowSeconds / DT && records.some(({ car }) => !car.finished); step += 1) {
        const previous = records.map(({ car }) => ({ lap: car.lapsCompleted, gate: car._nextGate }));
        race._step(DT, neutral);
        for (const [index, record] of records.entries()) {
          const before = previous[index], car = record.car;
          if (car.lapsCompleted !== before.lap || car._nextGate !== before.gate) {
            record.gates.push({ lap: before.lap + 1, gate: before.gate + 1, time: race.elapsedTime });
          }
          if (car.lapsCompleted > before.lap) {
            const precedingLaps = record.lapTimes.reduce((sum, lap) => sum + lap, 0);
            record.lapTimes.push(race.elapsedTime - precedingLaps);
          }
        }
      }
      const arrivals = records.map(({ car, gates, lapTimes }) => ({
        id: car.id, vehicle: car.vehicleId, finished: car.finished, finishTime: car.finishTime,
        finishOrder: car._finishOrder, laps: car.lapsCompleted, nextGate: car._nextGate,
        gates, lapTimes, deaths: car.destructionSequence, health: car.health,
      }));
      results.push({ track: track.id, player: player.id, expectedLaps: track.laps, arrivals });
      t.diagnostic(JSON.stringify({ track: track.id, player: player.id, difficulty: 'hard',
        windowSeconds, arrivals: arrivals.map(({ gates, lapTimes, finishTime, ...rest }) => ({
          ...rest, finishTime: finishTime === null ? null : Number(finishTime.toFixed(3)),
          gatesPassed: gates.length, lapTimes: lapTimes.map(time => Number(time.toFixed(3))),
          lastGate: gates.length ? { ...gates[gates.length - 1],
            time: Number(gates[gates.length - 1].time.toFixed(3)) } : null,
        })) }));
    }
  }
  // Collect all four runs before asserting dominance: a loss must not hide
  // the remaining track/lineup measurements. Never rank by saturated progress.
  for (const result of results) {
    const context = `${result.track}/${result.player}`;
    for (const arrival of result.arrivals) {
      assert.equal(arrival.finished, true, `${context}/${arrival.id}: deve chegar em ${windowSeconds}s`);
      assert.ok(arrival.finishTime !== null && arrival.finishTime > 0 && arrival.finishTime <= windowSeconds);
      assert.equal(arrival.laps, result.expectedLaps);
      assert.equal(arrival.nextGate, 0);
      assert.equal(arrival.gates.length, result.expectedLaps * 4);
      for (const [index, crossing] of arrival.gates.entries()) {
        assert.equal(crossing.lap, Math.floor(index / 4) + 1);
        assert.equal(crossing.gate, index % 4 + 1);
        assert.ok(crossing.time > (arrival.gates[index - 1]?.time ?? 0));
      }
      assert.equal(arrival.gates[arrival.gates.length - 1].time, arrival.finishTime);
    }
    const [rival, ...others] = result.arrivals;
    assert.ok(others.every(other => rival.finishTime! < other.finishTime!),
      `${context}: Ravik não dominou; chegadas=${JSON.stringify(result.arrivals.map(({ id, finishTime }) => ({ id, finishTime })))}`);
  }
});

test('IA: recupera bloqueio com jogador ativo sem travar na primeira volta', t => {
  // Reproduce the original all-NPC finish fixture without removing the player:
  // throttle held down, steering zero, contacts and normal damage enabled.
  const botPilots = [
    { id: 'bot-a', name: 'Bot A', stats: { speed: 5, acceleration: 5, handling: 5, endurance: 5, aggression: 5 } },
    { id: 'bot-b', name: 'Bot B', stats: { speed: 6, acceleration: 5, handling: 6, endurance: 5, aggression: 5 } },
    { id: 'bot-c', name: 'Bot C', stats: { speed: 5, acceleration: 6, handling: 5, endurance: 5, aggression: 6 } },
  ];
  const race = new RaceSimulation({ track: RACE_TRACKS[0], difficulty: 'normal',
    player: { id: 'player', name: 'Piloto', stats: { speed: 6, acceleration: 6, handling: 6, endurance: 6, aggression: 6 } },
    vehicleStats: { speed: 75, acceleration: 70, control: 65, armor: 60 }, botPilots }).start();
  const physicalStats = race.participants.map(car => ({ ...car.vehicle }));
  const round = (value: number) => Number(value.toFixed(3));
  const snapshots: unknown[] = [];
  let stationary = 0, longestStationary = 0;
  for (let step = 0; step < 150 * 60 && race.participants.slice(1).some(car => !car.finished); step += 1) {
    race._step(DT, { ...neutral, throttle: 1 });
    const car = race.participants[3];
    stationary = !car.finished && car.speed < 0.5 ? stationary + DT : 0;
    longestStationary = Math.max(longestStationary, stationary);
    if ([5, 10, 20, 45, 90, 150].includes(Math.round((step + 1) * DT)) && (step + 1) % 60 === 0) {
      snapshots.push({ time: round(race.elapsedTime), cars: race.participants.map(driver => {
        const nearest = findNearestTrackPoint(race.track, driver.x, driver.z)!;
        return { id: driver.id, laps: driver.lapsCompleted, nextGate: driver._nextGate,
          x: round(driver.x), z: round(driver.z), speed: round(driver.speed),
          vx: round(driver.velocityX), vz: round(driver.velocityZ), hp: round(driver.health),
          heading: round(driver.heading), roadHeading: round(Math.atan2(nearest.tangentX, nearest.tangentZ)),
          lateral: round(nearest.lateral), lane: round(driver._lane), distance: round(nearest.distance),
          steer: round(driver._aiSteer), throttle: round(driver._aiThrottle), brake: round(driver._aiBrake),
          deaths: driver.destructionSequence, finishTime: driver.finishTime };
      }) });
    }
  }
  t.diagnostic(JSON.stringify({ longestStationary: round(longestStationary), snapshots,
    arrivals: race.participants.map(car => ({ id: car.id, laps: car.lapsCompleted,
      nextGate: car._nextGate, finishTime: car.finishTime, hp: round(car.health), deaths: car.destructionSequence })) }));
  assert.deepEqual(race.participants.map(car => car.vehicle), physicalStats);
  assert.equal(race.participants[0].finished, false, 'o jogador permanece ativo durante a referência');
  assert.ok(longestStationary < 5, 'bot C deve manobrar em vez de esperar parado indefinidamente');
  assert.ok(race.participants.slice(1).every(car => car.finished && car.lapsCompleted === 4),
    'os três NPCs devem completar os gates em até 150s mesmo com o jogador contra a parede');
});
