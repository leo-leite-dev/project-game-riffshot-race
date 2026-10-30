import test from 'node:test';
import assert from 'node:assert/strict';
import { RaceSimulation, deriveHandlingStats } from '../src/race/RaceSimulation.ts';
import { RACE_TRACKS } from '../src/data/raceTracks.ts';
import { CHARACTERS } from '../src/data/characters.ts';
import { OPENING_RIVAL } from '../src/data/openingRival.ts';
import { getVehicleById } from '../src/data/vehicles.ts';
import type { BotProfileId } from '../src/data/botProfiles.ts';

// Fixed BEFORE measuring: eight scenarios, not a seed search. Time goals replace
// win-share evaluation here; no balance weights or target times feed the AI.
const SEEDS = [11, 29, 47, 83] as const;
const MEASUREMENT = 'stable-baseline-restored-time-targets-pending';
// Two tuning attempts measured with exactly these seeds, then REJECTED.
// Ranges below are historical evidence, not assertions that targets were met.
// Order within each track: rival / Camaro / Armored, all four real laps.
// Baseline: neon 72.866667-72.983333 / 75.600000-77.283333 / 82.083333-82.966667;
//           voltage 73.100000-73.166667 / 74.666667-75.683333 / 80.800000-81.616667.
// Attempt 1: interpolate the 2m AI road lookup, inner line 2.1/2.4m for
// Camaro/Armored, lane bound .55*edge. No physical changes.
//   neon 72.500000-72.616667 / 75.100000-76.783333 / 81.016667-81.883333;
//   voltage 72.683333-72.750000 / 74.333333-75.100000 / 79.533333-80.100000.
// Attempt 2: keep interpolation, lines 2.6/3.2m and bound .70*edge; estimate
// braking with .85 + .15*anticipation instead of .65 + .20*anticipation.
//   neon 72.450000-72.600000 / 75.133333-76.716667 / 80.783333-81.566667;
//   voltage 73.083333-73.250000 / 74.550000-75.250000 / 79.616667-80.266667.
// Each attempt: 8 scenarios, 24 arrivals, zero withinTarget, zero destructions
// or stalls. Both merely approached some targets; attempt 2 also regressed.
// Production controller/profiles restored; no partial tuning retained.
const PROFILES: BotProfileId[] = ['rival', 'challenger', 'opportunist'];
const DT = 1 / 60;
const WINDOW_SECONDS = 120;
const neutral = { throttle: 0, brake: 0, steer: 0, handbrake: 0, nitro: false };
const round = (value: number) => Number(value.toFixed(6));
type Target = readonly [number, number] | null;
const TARGETS: Record<string, { playerRecord: number | null; rival: Target; bots: Target }> = {
  'neon-furnace': { playerRecord: 73, rival: [73.01, 73.1], bots: [73.04, 73.1] },
  'voltage-run': { playerRecord: 72, rival: [72.01, 72.1], bots: [72.04, 72.1] },
};

function compareTarget(seconds: number, target: Target) {
  assert.ok(Number.isFinite(seconds), 'tempo medido precisa ser finito');
  if (!target) return { targetSeconds: null, withinTarget: null, distanceToTargetSeconds: null,
    signedDistanceToTargetSeconds: null, deltaFromMinimumSeconds: null, deltaFromMaximumSeconds: null };
  // Judge the full physical time, never its rounded HUD representation.
  const signedDistanceToTargetSeconds = seconds < target[0] ? seconds - target[0]
    : seconds > target[1] ? seconds - target[1] : 0;
  return { targetSeconds: target, withinTarget: signedDistanceToTargetSeconds === 0,
    distanceToTargetSeconds: Math.abs(signedDistanceToTargetSeconds), signedDistanceToTargetSeconds,
    deltaFromMinimumSeconds: seconds - target[0], deltaFromMaximumSeconds: seconds - target[1] };
}

test('ritmo: centésimos, distância à faixa e quantização sem arredondar aprovação', () => {
  const target = TARGETS['neon-furnace'].bots!;
  assert.equal(compareTarget(73.04, target).withinTarget, true);
  assert.equal(compareTarget(73.1, target).withinTarget, true);
  assert.equal(compareTarget(73.1001, target).withinTarget, false);
  assert.equal(compareTarget(73.0399, target).withinTarget, false);
  const below = compareTarget(73, target).signedDistanceToTargetSeconds;
  const above = compareTarget(82, target).signedDistanceToTargetSeconds;
  assert.ok(below !== null && below < 0);
  assert.ok(above !== null && above > 8);
  assert.throws(() => compareTarget(NaN, target));
  assert.throws(() => compareTarget(Infinity, target));
  for (const config of Object.values(TARGETS)) {
    const ranges = [config.rival, config.bots].filter((range): range is readonly [number, number] => range !== null);
    if (!ranges.length) continue;
    const ticks = ranges.map(([min, max]) =>
      Array.from({ length: Math.floor(max / DT + 1e-8) - Math.ceil(min / DT - 1e-8) + 1 },
        (_, index) => (Math.ceil(min / DT - 1e-8) + index) * DT));
    assert.deepEqual(ticks.map(values => values.length), ranges.map((_range, index) => index === 0 ? 6 : 4));
  }
});

function measure(track: typeof RACE_TRACKS[number], seed: number, playerIndex: number) {
  const player = CHARACTERS[playerIndex];
  const opponents = CHARACTERS.filter(pilot => pilot.id !== player.id).slice(0, 2);
  const pilots = [
    { ...OPENING_RIVAL, aiSeed: seed },
    ...opponents.map((pilot, index) => ({ ...pilot, aiProfile: PROFILES[index + 1], aiSeed: seed,
      vehicleId: index === 0 ? 'volt-vector' : 'iron-bastion' })),
  ];
  const race = new RaceSimulation({ track, laps: 4, difficulty: 'hard', player, botPilots: pilots });
  assert.equal(race.participants.length, 4, 'um observador e os três NPCs nos slots reais');
  race.participants[0].finished = true;
  assert.equal(race.vehicleContactsEnabled, true);
  const records = race.participants.slice(1).map((car, index) => {
    const catalog = getVehicleById(car.vehicleId)!;
    const physical = deriveHandlingStats(catalog.stats, pilots[index].stats, catalog.ability, pilots[index].specialties);
    assert.deepEqual(car.vehicle, physical, 'sem cap, aderência ou força ocultos por perfil');
    assert.equal(car.vehicle.nitroCharges, 0, 'os três carros reais não têm nitro');
    assert.equal(car.aiProfile, PROFILES[index]);
    assert.equal(car.aiSeed, seed);
    // Relax only geometry: |A-B| - gate radii is a lower bound on travel
    // between ANY two crossings. It allows impossible off-road chords, ignores
    // acceleration/corners and is NOT proof that a legal trajectory exists.
    let gateChainMeters = 0, previous = { x: car.x, z: car.z, lateralLimit: 0 };
    for (let crossing = 0; crossing < 16; crossing += 1) {
      const gate = race.gates[crossing % 4];
      gateChainMeters += Math.max(0, Math.hypot(gate.x - previous.x, gate.z - previous.z)
        - gate.lateralLimit - previous.lateralLimit);
      previous = gate;
    }
    return { car, physical, pilot: pilots[index], catalog, slot: index + 1, profile: PROFILES[index],
      initialDistance: car._lastPathDistance, gateChainMeters, pathMeters: 0, peakSpeed: 0,
      belowHalfCapSeconds: 0, brakingSeconds: 0, stationary: 0, longestStationary: 0,
      gates: [] as number[], laps: [] as { seconds: number; pathMeters: number }[],
      lapStartTime: 0, lapStartPath: 0,
      trace: [] as { seconds: number; x: number; z: number; speed: number; lane: number; health: number; brake: number }[] };
  });
  for (let step = 0; step < WINDOW_SECONDS / DT && records.some(({ car }) => !car.finished); step += 1) {
    const before = records.map(({ car }) => ({ x: car.x, z: car.z, finished: car.finished,
      gate: car.lapsCompleted * 4 + car._nextGate, lap: car.lapsCompleted }));
    // Deliberately bypass only the stop-on-player-finish policy. The ordinary
    // guard suppresses cannon fire; walls, contacts, damage and gates stay real.
    race._step(DT, neutral);
    assert.ok(Math.abs(race.elapsedTime - (step + 1) * DT) < 1e-8, 'relógio físico sem ajustes');
    for (const [index, record] of records.entries()) {
      if (before[index].finished) continue;
      const car = record.car;
      assert.ok([car.x, car.z, car.heading, car.speed, car.health, car._aiSteer, car._aiThrottle,
        car._aiBrake, car._lane].every(Number.isFinite));
      assert.ok(car.speed <= record.physical.maxSpeed * 1.06 + 1e-8, 'somente teto comum de drift');
      record.pathMeters += Math.hypot(car.x - before[index].x, car.z - before[index].z);
      record.peakSpeed = Math.max(record.peakSpeed, car.speed);
      if (car.speed < record.physical.maxSpeed * 0.5) record.belowHalfCapSeconds += DT;
      if (car._aiBrake > 0.05) record.brakingSeconds += DT;
      record.stationary = !car.finished && !car.destroyed && car.speed < 0.5 ? record.stationary + DT : 0;
      record.longestStationary = Math.max(record.longestStationary, record.stationary);
      const gate = car.lapsCompleted * 4 + car._nextGate;
      if (gate !== before[index].gate) {
        assert.equal(gate, before[index].gate + 1, 'gates físicos consecutivos');
        record.gates.push(race.elapsedTime);
      }
      if (car.lapsCompleted !== before[index].lap) {
        record.laps.push({ seconds: race.elapsedTime - record.lapStartTime,
          pathMeters: record.pathMeters - record.lapStartPath });
        record.lapStartTime = race.elapsedTime; record.lapStartPath = record.pathMeters;
      }
      if (step % 600 === 0 || car.finished) record.trace.push({ seconds: round(race.elapsedTime),
        x: round(car.x), z: round(car.z), speed: round(car.speed), lane: round(car._lane),
        health: round(car.health), brake: round(car._aiBrake) });
    }
  }
  assert.equal(race.cannon.events.length, 0, 'observador concluído desativa o canhão');
  return records.map(record => {
    const { car, physical, catalog, pilot } = record;
    const context = `${track.id}/${seed}/slot${record.slot}`;
    assert.equal(car.finished, true, `${context}: chega em até 120s`);
    assert.equal(car.lapsCompleted, 4);
    assert.equal(record.gates.length, 16);
    assert.equal(record.gates.at(-1), car.finishTime);
    assert.ok(car.finishTime !== null && Number.isFinite(car.finishTime));
    assert.equal(car.destructionSequence, 0, `${context}: referência estável sem destruições`);
    assert.ok(record.longestStationary < 5, `${context}: sem travamento`);
    assert.deepEqual(car.vehicle, physical, 'atributos intactos após quatro voltas');
    const target = record.profile === 'rival' ? TARGETS[track.id].rival : TARGETS[track.id].bots;
    const driftCap = physical.maxSpeed * 1.06;
    const centerlineReferenceMeters = 5 * race.track.totalLength - record.initialDistance;
    return { track: track.id, seed, observer: player.id, slot: record.slot, profile: record.profile,
      pilot: car.id, vehicle: car.vehicleId, pilotStats: pilot.stats, vehicleStats: catalog.stats, physical,
      finishTime: car.finishTime, ...compareTarget(car.finishTime, target), gates: record.gates.length,
      deaths: car.destructionSequence, health: round(car.health), longestStationary: round(record.longestStationary),
      path: { netStepPathMeters: round(record.pathMeters), // includes ordinary contact/wall corrections
        centerlineLapMeters: round(race.track.totalLength), centerlineReferenceMeters: round(centerlineReferenceMeters),
        meanSpeed: round(record.pathMeters / car.finishTime), peakSpeed: round(record.peakSpeed),
        commonDriftCap: round(driftCap), observedPathAtConstantCapSeconds: round(record.pathMeters / driftCap),
        centerlineAtConstantCapSeconds: round(centerlineReferenceMeters / driftCap),
        relaxedGateChainMeters: round(record.gateChainMeters),
        relaxedGateChainAtCapSeconds: round(record.gateChainMeters / driftCap),
        caveat: 'Referências a cap constante ignoram aceleração/curvas/assistência por contatos; linha central e caminho observado não são mínimos geométricos.' },
      belowHalfCapSeconds: round(record.belowHalfCapSeconds), brakingSeconds: round(record.brakingSeconds),
      laps: record.laps.map(lap => ({ seconds: round(lap.seconds), pathMeters: round(lap.pathMeters) })),
      trace: record.trace };
  });
}

for (const track of RACE_TRACKS) {
  test(`ritmo medição: ${track.id}, quatro voltas reais; integridade não aprova faixa-alvo`,
    { timeout: 15000 }, t => {
      const started = performance.now();
      const samples = SEEDS.flatMap((seed, index) => measure(track, seed, index % 2));
      for (const row of samples) t.diagnostic(JSON.stringify({ track: row.track, seed: row.seed,
        observer: row.observer, slot: row.slot, profile: row.profile, pilot: row.pilot,
        finishTime: row.finishTime, ...compareTarget(row.finishTime, row.targetSeconds),
        gates: row.gates, deaths: row.deaths, health: row.health, longestStationary: row.longestStationary,
        pathMeters: row.path.netStepPathMeters, meanSpeed: row.path.meanSpeed,
        belowHalfCapSeconds: row.belowHalfCapSeconds, brakingSeconds: row.brakingSeconds, laps: row.laps }));
      const summary = PROFILES.map(profile => {
        const rows = samples.filter(row => row.profile === profile);
        const fastest = rows.reduce((best, row) => row.finishTime < best.finishTime ? row : best);
        const targetDistances = rows.map(row => row.distanceToTargetSeconds)
          .filter((distance): distance is number => distance !== null);
        return { profile, slot: fastest.slot, seeds: SEEDS, runs: rows.length,
          targetSeconds: fastest.targetSeconds,
          withinTarget: targetDistances.length ? rows.every(row => row.withinTarget === true) : null,
          withinTargetCount: rows.filter(row => row.withinTarget).length,
          rangeSeconds: [Math.min(...rows.map(row => row.finishTime)), Math.max(...rows.map(row => row.finishTime))],
          distanceToTargetSecondsRange: targetDistances.length
            ? [Math.min(...targetDistances), Math.max(...targetDistances)] : null,
          fastestPhysicalTrace: { seed: fastest.seed, finishTime: fastest.finishTime,
            vehicle: fastest.vehicle, pilotStats: fastest.pilotStats, vehicleStats: fastest.vehicleStats,
            physical: fastest.physical,
            path: fastest.path, laps: fastest.laps, trace: fastest.trace } };
      });
      t.diagnostic(JSON.stringify({ measurement: MEASUREMENT, track: track.id,
        difficulty: 'hard', laps: 4, uniqueScenarios: SEEDS.length, windowSeconds: WINDOW_SECONDS,
        dtSeconds: DT, playerRecordSeconds: TARGETS[track.id].playerRecord,
        combat: false, contacts: true, summary,
         allWithinTarget: samples.some(row => row.targetSeconds === null) ? null : samples.every(row => row.withinTarget === true),
         targetCalibrationComplete: samples.every(row => row.targetSeconds !== null),
        interpretation: 'Aprovação do teste verifica medição/estabilidade, NÃO cumprimento dos tempos-alvo. Não prova impossibilidade de outra linha legal.',
        wallSeconds: round((performance.now() - started) / 1000) }));
      assert.equal(samples.length, 12);
    });
}
