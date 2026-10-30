import test from 'node:test';
import assert from 'node:assert/strict';
import { BOT_BALANCE_GOAL, BOT_PROFILES, resolveBotBehavior } from '../src/data/botProfiles.ts';
import type { BotProfileId } from '../src/data/botProfiles.ts';
import { BotController } from '../src/race/BotController.ts';
import type { BotParticipant } from '../src/race/BotController.ts';
import { RaceSimulation, sampleTrackAtProgress } from '../src/race/RaceSimulation.ts';
import { sampleRaceTrack } from '../src/race/trackMath.ts';
import { DIFFICULTIES } from '../src/data/raceDifficulty.ts';
import { RACE_TRACKS } from '../src/data/raceTracks.ts';
import { OPENING_RIVAL } from '../src/data/openingRival.ts';
import { CHARACTERS } from '../src/data/characters.ts';

const DT = 1 / 60;
const neutral = { throttle: 0, brake: 0, steer: 0, handbrake: 0, nitro: false };
const profiles: BotProfileId[] = ['rival', 'challenger', 'opportunist'];
const circle = { ...sampleRaceTrack({ waypoints: Array.from({ length: 32 }, (_, i) => ({
  x: Math.sin(i / 32 * Math.PI * 2) * 32, z: Math.cos(i / 32 * Math.PI * 2) * 32,
})) }), width: 14 };

function driver(profile?: BotProfileId, seed?: number): BotParticipant {
  const point = sampleTrackAtProgress(circle, 40);
  return { id: 'same-driver', aiProfile: profile, aiSeed: seed,
    finished: false, destroyed: false, respawnProtection: 0,
    x: point.x, z: point.z, heading: Math.atan2(point.tangentX, point.tangentZ), speed: 25,
    velocityX: point.tangentX * 25, velocityZ: point.tangentZ * 25,
    health: 100, maxHealth: 100, nitroCharges: 0,
    vehicle: Object.freeze({ maxSpeed: 34, acceleration: 15, grip: 0.8, steering: 2,
      braking: 22, nitroCharges: 0 }),
    _aiClock: 0, _aiSteer: 0, _aiThrottle: 1, _aiBrake: 0, _baseLane: 0, _lane: 0 };
}
function settle(car: BotParticipant, participants = [car]) {
  const controller = new BotController(circle, DIFFICULTIES.hard);
  let controls = neutral;
  for (let i = 0; i < 90; i += 1) controls = { ...controller.controlsFor(car, participants, DT) };
  return controls;
}

test('perfis: meta declarada e personalidades distintas, sem atributos físicos', () => {
  assert.equal(BOT_BALANCE_GOAL.meaning, 'goal');
  assert.equal(BOT_BALANCE_GOAL.metric, 'npc-win-share');
  assert.deepEqual(BOT_BALANCE_GOAL.weights, { rival: 0.7, challenger: 0.15, opportunist: 0.15 });
  assert.equal(Object.values(BOT_BALANCE_GOAL.weights).reduce<number>((a, b) => a + b, 0), 1);
  assert.ok(BOT_PROFILES.rival.precision > BOT_PROFILES.challenger.precision);
  assert.ok(BOT_PROFILES.rival.consistency < BOT_PROFILES.challenger.consistency);
  assert.ok(BOT_PROFILES.challenger.risk > BOT_PROFILES.opportunist.risk);
  assert.ok(BOT_PROFILES.challenger.brakeAnticipation < BOT_PROFILES.opportunist.brakeAnticipation);
  assert.ok(BOT_PROFILES.challenger.overtakeBias > BOT_PROFILES.opportunist.overtakeBias);
  for (const profile of Object.values(BOT_PROFILES)) {
    assert.ok(Object.isFrozen(profile));
    assert.ok(profile.consistency >= 0 && profile.consistency < 0.1,
      'forma estável: amplitude inferior a 10%, sem calibrações de risco excessivo');
    assert.equal(Object.keys(profile).length, 7, 'perfil compacto de decisões, sem copiar a física');
    for (const key of ['maxSpeed', 'grip', 'damage', 'health', 'acceleration']) assert.ok(!(key in profile));
  }
  assert.ok(Object.isFrozen(BOT_BALANCE_GOAL.weights));
});

test('perfis: seed reproduz forma limitada e independente da ordem de chamadas', () => {
  for (const profile of profiles) {
    const first = resolveBotBehavior(profile, 173, 'pilot');
    resolveBotBehavior('challenger', 999, 'unrelated');
    assert.deepEqual(first, resolveBotBehavior(profile, 173, 'pilot'));
    assert.notDeepEqual(first, resolveBotBehavior(profile, 174, 'pilot'));
    assert.notDeepEqual(first, resolveBotBehavior(profile, 173, 'other-pilot'));
    assert.deepEqual(resolveBotBehavior(profile), resolveBotBehavior(profile, NaN));
    assert.ok(Object.isFrozen(first));
    for (const seed of [0, 1, -1, 42, 173, 90210, 0xffffffff]) {
      const form = resolveBotBehavior(profile, seed, 'pilot'), base = BOT_PROFILES[profile];
      for (const key of ['precision', 'lineOffset', 'preview', 'brakeAnticipation'] as const) {
        assert.ok(Math.abs(form[key] / base[key] - 1) <= base.consistency + 1e-12);
      }
      assert.ok(Math.abs(form.risk - base.risk) <= base.consistency + 1e-12);
      assert.ok(Object.values(form).every(Number.isFinite));
    }
  }
});

test('perfis: controles e linhas próprios, determinísticos, preservam todo estado físico', () => {
  const commands = [], lanes = [];
  for (const profile of profiles) {
    const car = driver(profile, 173), replay = driver(profile, 173);
    const before = { ...car };
    const controls = settle(car);
    assert.deepEqual(controls, settle(replay));
    assert.equal(car._lane, replay._lane);
    for (const key of Object.keys(before) as (keyof BotParticipant)[]) {
      if (['_aiClock', '_aiSteer', '_aiThrottle', '_aiBrake', '_lane'].includes(key)) continue;
      assert.deepEqual(car[key], before[key], `${profile}: ${key} permanece físico/externo`);
    }
    assert.ok(Object.values(controls).every(value => typeof value === 'boolean' || Number.isFinite(value)));
    assert.ok(controls.throttle >= 0 && controls.throttle <= 1);
    assert.ok(controls.brake >= 0 && controls.brake <= 1 && Math.abs(controls.steer) <= 1);
    commands.push(controls); lanes.push(car._lane);
  }
  assert.equal(new Set(commands.map(value => JSON.stringify(value))).size, 3);
  assert.equal(new Set(lanes.map(value => value.toFixed(3))).size, 3);
});

test('perfis: Camaro aceita passagem em curva carregada; Armored espera abertura e sai em baixa', () => {
  const bold = driver('challenger'), patient = driver('opportunist');
  // Identical real car/traffic: only the decision profile differs. The blocker
  // stays nine metres forward in the driver's local frame, with free corridors.
  const blocker = { ...driver(), id: 'blocker',
    x: bold.x + Math.sin(bold.heading) * 9, z: bold.z + Math.cos(bold.heading) * 9,
    speed: 24, velocityX: Math.sin(bold.heading) * 24, velocityZ: Math.cos(bold.heading) * 24 };
  settle(bold, [bold, blocker]);
  settle(patient, [patient, blocker]);
  assert.ok(Math.abs(bold._lane) > 2, `Camaro compromete corredor: ${bold._lane}`);
  assert.ok(Math.abs(patient._lane) < 1.1, `Armored mantém linha segura: ${patient._lane}`);
  const slow = { ...driver('opportunist'), speed: 0, velocityX: 0, velocityZ: 0 };
  const stopped = { ...blocker, speed: 0, velocityX: 0, velocityZ: 0,
    x: slow.x + Math.sin(slow.heading) * 6, z: slow.z + Math.cos(slow.heading) * 6 };
  const controls = settle(slow, [slow, stopped]);
  assert.ok(Math.abs(slow._lane) > 2, 'a cautela libera manobra lenta, sem espera infinita');
  assert.ok(controls.throttle > 0);
});

test('perfis: seed muda decisões sem depender de classificação ou resultado pretendido', () => {
  const first = driver('challenger', 173), second = driver('challenger', 174);
  assert.notDeepEqual(settle(first), settle(second));
  const leader = Object.assign(driver('rival', 173), { rank: 1, progress: 0.99, lapsCompleted: 3 });
  const last = Object.assign(driver('rival', 173), { rank: 4, progress: 0.01, lapsCompleted: 0 });
  assert.deepEqual(settle(leader), settle(last), 'mesmo contexto físico, mesmas decisões em qualquer posição');
  const car = driver('rival', 173), controller = new BotController(circle, DIFFICULTIES.hard);
  controller.controlsFor(car, [car], DT);
  car.aiSeed = 174;
  const fresh = { ...car };
  assert.deepEqual({ ...controller.controlsFor(car, [car], DT) },
    new BotController(circle, DIFFICULTIES.hard).controlsFor(fresh, [fresh], DT));
});

// Fixed sample, no tuning/search loop. Ten seeds x two tracks, alternating the
// real Vera/Kira lineups from RaceScene; one extra replay checks physical output.
// Committed before measuring either additional calibration, never cherry-picked.
// Calibration record (historical measurements, not current test approvals):
// 1: 12 unique races, consistency .035/.08/.045, static form only: wins 12/0/0.
// 2: the 20 seeds below, consistency .18/.28/.08, risk .75/.95/.35;
//    attack cap implicit .28, planning safety cap 1.22, apex +4*attack,
//    braking delay speed*.8*attack: wins 20/0/0 (10/0/0 on each track),
//    all 60 NPC arrivals valid, zero destructions, 1.728s incl. one replay.
// 3 (rejected): same 20 seeds, consistency .30/.40/.08, risk .85/.95/.35;
//    attack cap .35, planning safety cap 1.45, apex +6*attack,
//    braking delay speed*1.4*attack: wins 20/0/0 (10/0/0 on each track),
//    all 60 NPC arrivals valid; Armored second 11/20, Camaro 21 destructions,
//    rival/Armored zero destructions; 1.847s incl. one replay.
// Neither additional candidate stalled or met the win-share goal. Candidate 3
// was rejected: Camaro's 21 destructions with zero wins made it frustrating.
// CURRENT: stable candidate 1 restored, without deliberate section errors.
// Keep all 20 scenarios available across the current two tracks to recheck
// stability after the reversal, not to tune wins.
const SEEDS = [11, 29, 47, 83, 131, 211, 307, 401, 503, 617] as const;
function measure(track: typeof RACE_TRACKS[number], seed: number, playerIndex: number) {
  const player = CHARACTERS[playerIndex];
  const opponents = CHARACTERS.filter(pilot => pilot.id !== player.id).slice(0, 2);
  const race = new RaceSimulation({ track, difficulty: 'hard', player,
    botPilots: [OPENING_RIVAL, ...opponents.map((pilot, index) => ({
      ...pilot, vehicleId: index === 0 ? 'volt-vector' : 'iron-bastion',
    }))] });
  race.participants[0].finished = true;
  const records = race.participants.slice(1).map((car, i) => {
    // Explicit test form, independent of scene/save descriptors.
    Object.assign(car, { aiProfile: profiles[i], aiSeed: seed });
    return { car, profile: profiles[i], physical: { ...car.vehicle },
      stationary: 0, longestStationary: 0, finite: true, withinCap: true, ordered: true,
      gates: [] as number[] };
  });
  assert.equal(race.vehicleContactsEnabled, true);
  for (let step = 0; step < 120 / DT && records.some(({ car }) => !car.finished); step += 1) {
    const previous = records.map(({ car }) => car.lapsCompleted * 4 + car._nextGate);
    // Bypass only the player-finish stop policy. The production guard suppresses
    // combat for this finished observer; contacts, wall damage and gates stay real.
    race._step(DT, neutral);
    for (const [i, record] of records.entries()) {
      const car = record.car, gate = car.lapsCompleted * 4 + car._nextGate;
      if (gate !== previous[i]) {
        record.ordered &&= gate === previous[i] + 1;
        record.gates.push(race.elapsedTime);
      }
      record.stationary = !car.finished && !car.destroyed && car.speed < 0.5 ? record.stationary + DT : 0;
      record.longestStationary = Math.max(record.longestStationary, record.stationary);
      if (step % 60 === 0) {
        record.finite &&= [car.x, car.z, car.heading, car.speed, car.health, car._aiSteer,
          car._aiThrottle, car._aiBrake, car._lane].every(Number.isFinite);
        record.withinCap &&= car.speed <= car.vehicle.maxSpeed * 1.06 + 1e-8;
      }
    }
  }
  assert.equal(race.cannon.events.length, 0, 'combate desativado pelo jogador concluído');
  const arrivals = records.map(({ car, profile, physical, gates, longestStationary, finite, withinCap, ordered }) => {
    assert.deepEqual(car.vehicle, physical, 'atributos físicos originais intactos');
    return { profile, id: car.id, vehicle: car.vehicleId, finishTime: car.finishTime,
      finishOrder: car._finishOrder, finished: car.finished, laps: car.lapsCompleted,
      valid: finite && withinCap && ordered && car.finished && car.lapsCompleted === track.laps
        && gates.length === track.laps * 4 && gates.at(-1) === car.finishTime && longestStationary < 5,
      gates: gates.length, deaths: car.destructionSequence,
      health: Number(car.health.toFixed(3)), longestStationary: Number(longestStationary.toFixed(3)) };
  });
  // Compare actual arrivals, never progress (which saturates at the finish).
  const winner = arrivals.filter(car => car.finished).sort((a, b) => a.finishTime! - b.finishTime!
    || a.finishOrder! - b.finishOrder!)[0]?.profile ?? null;
  return { track: track.id, seed, player: player.id, winner, arrivals };
}

test('perfis benchmark: corridas reproduzíveis nas pistas disponíveis, distribuição real e desvio da meta',
  { timeout: 30000 }, t => {
    const started = performance.now();
    const samples: ReturnType<typeof measure>[] = [];
    for (const track of RACE_TRACKS) {
      for (const [index, seed] of SEEDS.entries()) {
        const result = measure(track, seed, index % 2);
        samples.push(result);
        t.diagnostic(JSON.stringify({ ...result, difficulty: 'hard', windowSeconds: 120,
          combat: false, arrivals: result.arrivals.map(car => ({ ...car,
            finishTime: car.finishTime === null ? null : Number(car.finishTime.toFixed(3)) })) }));
      }
    }
    assert.deepEqual(measure(RACE_TRACKS[0], SEEDS[0], 0), samples[0], 'replay físico exato da primeira corrida');
    const summarize = (rows: typeof samples) => Object.fromEntries(profiles.map(profile => {
      const wins = rows.filter(row => row.winner === profile).length;
      const actualPercent = wins / rows.length * 100;
      return [profile, { wins, actualPercent: Number(actualPercent.toFixed(2)),
        goalPercent: BOT_BALANCE_GOAL.weights[profile] * 100,
        deviationPercentagePoints: Number((actualPercent - BOT_BALANCE_GOAL.weights[profile] * 100).toFixed(2)) }];
    }));
    t.diagnostic(JSON.stringify({ sampleSize: samples.length, replayRuns: 1,
      windowSeconds: 120, seeds: SEEDS, calibrationStatus: 'stable-restored-no-excessive-risk',
      calibration: BOT_PROFILES, distribution: summarize(samples),
      invalidRuns: samples.filter(row => row.arrivals.some(car => !car.valid)).map(row => ({
        track: row.track, seed: row.seed, arrivals: row.arrivals.filter(car => !car.valid),
      })),
      byTrack: Object.fromEntries(RACE_TRACKS.map(track => [track.id,
        summarize(samples.filter(row => row.track === track.id))])),
      wallSeconds: Number(((performance.now() - started) / 1000).toFixed(3)),
      interpretation: 'Amostra pequena sem combate; meta não é probabilidade nem garantia. Não valida balanceamento com jogador ativo.' }));
    assert.equal(samples.length, RACE_TRACKS.length * SEEDS.length);
    assert.ok(samples.every(row => row.arrivals.every(car => car.valid)),
      'rejeitar candidata se algum NPC travar, perder gates, exceder teto ou não chegar em 120s');
    assert.ok(samples.every(row => row.arrivals.every(car => car.deaths === 0)),
      'a referência estável sem combate deve completar esta amostra sem destruições');
  });
