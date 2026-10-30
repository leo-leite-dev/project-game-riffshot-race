import test from 'node:test';
import assert from 'node:assert/strict';
import { OPENING_RACE_TRACK_ID, RACE_TRACKS, getTrackById } from '../src/data/raceTracks.ts';
import type { RaceControls } from '../src/race/RaceSimulation.ts';
import { PAINTS, VEHICLES, VEHICLE_TUNING, INITIAL_VEHICLES, getVehicleById } from '../src/data/vehicles.ts';
import { DIFFICULTIES } from '../src/data/raceDifficulty.ts';
import { deriveHandlingStats, findNearestTrackPoint, RaceSimulation, sampleRaceTrack, sampleTrackAtProgress } from '../src/race/RaceSimulation.ts';

const bots = [
  { id: 'bot-a', name: 'Bot A', stats: { speed: 5, acceleration: 5, handling: 5, endurance: 5, aggression: 5 } },
  { id: 'bot-b', name: 'Bot B', stats: { speed: 6, acceleration: 5, handling: 6, endurance: 5, aggression: 5 } },
  { id: 'bot-c', name: 'Bot C', stats: { speed: 5, acceleration: 6, handling: 5, endurance: 5, aggression: 6 } },
];
const player = { id: 'player', name: 'Piloto', stats: { speed: 6, acceleration: 6, handling: 6, endurance: 6, aggression: 6 } };
const makeRace = (track = RACE_TRACKS[0], difficulty = 'normal') => new RaceSimulation({ track, difficulty, player, vehicleStats: { speed: 75, acceleration: 70, control: 65, armor: 60 }, botPilots: bots });

test('duas pistas permanecem fechadas e finitas; Neon Furnace abre novas carreiras', () => {
  assert.equal(RACE_TRACKS.length, 2);
  assert.deepEqual(RACE_TRACKS.map(track => track.id), ['neon-furnace', 'voltage-run']);
  assert.equal(OPENING_RACE_TRACK_ID, 'neon-furnace');
  assert.equal(getTrackById('missing'), null);
  for (const track of RACE_TRACKS) {
    assert.equal(track.laps, 4);
    assert.equal(track.startGrid.length, 4);
    assert.ok(track.waypoints.every(point => [point.x, point.z, point.y ?? 0].every(Number.isFinite)));
    const sampled = sampleRaceTrack(track);
    assert.ok(sampled.totalLength > 0);
    assert.ok(sampled.points.every(point => [point.x, point.z, point.y, point.tangentX, point.tangentZ].every(Number.isFinite)));
    const first = sampled.points[0], last = sampled.points.at(-1);
    assert.ok(first && last);
    assert.ok(Math.hypot(first.x - last.x, first.z - last.z) < 10);
  }
  assert.ok(Math.max(...RACE_TRACKS[1].waypoints.map(point => point.y)) > Math.max(...RACE_TRACKS[0].waypoints.map(point => point.y)));
});

test('difficulty changes AI behavior configuration, not physical vehicle caps', () => {
  assert.notEqual(DIFFICULTIES.normal.lookahead, DIFFICULTIES.hard.lookahead);
  assert.notEqual(DIFFICULTIES.normal.steeringError, DIFFICULTIES.hard.steeringError);
  assert.notEqual(DIFFICULTIES.normal.overtakeDesire, DIFFICULTIES.hard.overtakeDesire);
  assert.ok(DIFFICULTIES.hard.targetSpeed > DIFFICULTIES.normal.targetSpeed);
  assert.ok(DIFFICULTIES.hard.reaction < DIFFICULTIES.normal.reaction);
  assert.ok(DIFFICULTIES.hard.steeringError < DIFFICULTIES.normal.steeringError);
  const normal = makeRace(RACE_TRACKS[0], 'normal'); const hard = makeRace(RACE_TRACKS[0], 'hard');
  assert.deepEqual(normal.participants.map(car => car.vehicle.maxSpeed), hard.participants.map(car => car.vehicle.maxSpeed));
  assert.ok(deriveHandlingStats({ speed: 80 }, { speed: 10 }).maxSpeed > deriveHandlingStats({ speed: 80 }, { speed: 1 }).maxSpeed);
  assert.ok(deriveHandlingStats({}, { aggression: 10 }).collisionShove > deriveHandlingStats({}, { aggression: 1 }).collisionShove);
});

test('bônus local separado para bots e rival só afeta IA na dificuldade Difícil', () => {
  const opponents = [
    { ...bots[0]!, id: 'rival', aiProfile: 'rival' as const },
    { ...bots[1]!, aiProfile: 'challenger' as const },
    { ...bots[2]!, aiProfile: 'opportunist' as const },
  ];
  const create = (difficulty: 'normal' | 'hard', devRaceAIBonus?: { botsPercent: number; rivalPercent: number }) =>
    new RaceSimulation({ track: RACE_TRACKS[0], difficulty, player, vehicleStats: { speed: 75, acceleration: 70, control: 65, armor: 60 },
      botPilots: opponents, devRaceAIBonus });
  const base = create('hard');
  const boosted = create('hard', { botsPercent: 10, rivalPercent: 20 });
  const normal = create('normal', { botsPercent: 10, rivalPercent: 20 });
  const stats = ['maxSpeed', 'acceleration', 'grip', 'steering'] as const;
  for (const key of stats) {
    assert.equal(boosted.participants[0]!.vehicle[key], base.participants[0]!.vehicle[key], `jogador sem bônus em ${key}`);
    assert.ok(Math.abs(boosted.participants[1]!.vehicle[key] / base.participants[1]!.vehicle[key] - 1.2) < 1e-10,
      `rival recebe 20% em ${key}`);
    for (const index of [2, 3]) assert.ok(Math.abs(boosted.participants[index]!.vehicle[key] / base.participants[index]!.vehicle[key] - 1.1) < 1e-10,
      `bot ${index} recebe 10% em ${key}`);
    assert.equal(normal.participants[1]!.vehicle[key], base.participants[1]!.vehicle[key], `normal ignora bônus em ${key}`);
  }
});

test('bots Difícil mantêm ritmo e progresso superiores ao Normal na mesma simulação', () => {
  const outcomes = (difficulty: 'normal' | 'hard') => {
    const race = makeRace(RACE_TRACKS[0], difficulty).start();
    for (let frame = 0; frame < 45 * 60; frame += 1) {
      if (race.status === 'finished') break;
      race.advance(1000 / 60, { throttle: 1 });
    }
    return race.participants.slice(1).map(car => car.progress);
  };
  const normal = outcomes('normal'), hard = outcomes('hard');
  assert.ok(hard.reduce((sum, progress) => sum + progress, 0) > normal.reduce((sum, progress) => sum + progress, 0),
    `Difícil deve somar progresso acima de Normal: ${JSON.stringify({ normal, hard })}`);
});

test('catálogo tem cinco carros, três iniciais e Thunder recebe exatamente duas cargas de nitro', () => {
  const [blaze, vector, bastion, raceCar2, widowmaker] = VEHICLES;
  assert.deepEqual(VEHICLES.map(vehicle => vehicle.id), ['rift-blaze', 'volt-vector', 'iron-bastion', 'race-car-2', 'widowmaker']);
  assert.deepEqual(INITIAL_VEHICLES.map(vehicle => vehicle.id), ['rift-blaze', 'volt-vector', 'iron-bastion']);
  assert.deepEqual(VEHICLES.map(vehicle => vehicle.name), ['THUNDER BUG', 'CAMARO', 'ARMORED CAR', 'RACE CAR 2', 'WIDOWMAKER']);
  assert.deepEqual(blaze.stats, VEHICLE_TUNING['rift-blaze']);
  assert.deepEqual(vector.stats, VEHICLE_TUNING['volt-vector']);
  assert.deepEqual(bastion.stats, VEHICLE_TUNING['iron-bastion']);
  assert.deepEqual(blaze.ability, { nitroCharges: 2, nitroSeconds: 3, nitroMultiplier: 1.35 });
  assert.deepEqual(raceCar2.stats, VEHICLE_TUNING['race-car-2']);
  assert.deepEqual(raceCar2.ability, blaze.ability);
  assert.deepEqual(widowmaker.stats, VEHICLE_TUNING.widowmaker);
  assert.deepEqual(PAINTS.map(paint => paint.color), ['#E53935', '#1677FF', '#FFD027']);
  assert.equal(getVehicleById('missing'), null);
  assert.ok(deriveHandlingStats(blaze.stats).steering < deriveHandlingStats(vector.stats).steering);
  assert.ok(deriveHandlingStats(blaze.stats).grip < deriveHandlingStats(vector.stats).grip);
  assert.ok(deriveHandlingStats(bastion.stats).maxSpeed < deriveHandlingStats(blaze.stats).maxSpeed);
  assert.equal(deriveHandlingStats(bastion.stats).collisionDamageMultiplier,
    deriveHandlingStats(blaze.stats).collisionDamageMultiplier, 'armor aumenta HP sem dupla redução de dano');
  assert.ok(deriveHandlingStats({}, { endurance: 10 }).collisionDamageMultiplier
    < deriveHandlingStats({}, { endurance: 3 }).collisionDamageMultiplier);
});

test('nitro consome cargas por acionamento e o bônus de velocidade retorna gradualmente', () => {
  const playerVehicle = getVehicleById('rift-blaze'); assert.ok(playerVehicle);
  const race = new RaceSimulation({ track: RACE_TRACKS[0], player,
     playerVehicle, botPilots: bots }).start();
  const car = race.participants[0];
  for (let i = 0; i < 181; i += 1) race.advance(1000 / 60, { throttle: 1, nitro: true });
  assert.equal(car.nitroActive, false);
  assert.equal(car.nitroCharges, 1, 'segurar SHIFT não gasta outra carga automaticamente');
  race.advance(1000 / 60, { nitro: false });
  race.advance(1000 / 60, { nitro: true });
  assert.equal(car.nitroCharges, 0);
  assert.equal(car.nitroActive, true);

  car.nitroActive = false;
  car.nitroRecoveryRemaining = 1;
  car.heading = Math.PI / 2;
  car.velocityX = car.vehicle.maxSpeed * 1.3;
  car.velocityZ = 0;
  car.speed = Math.abs(car.velocityX);
  const boostedSpeed = car.speed;
  for (let i = 0; i < 60; i += 1) {
    race._updateNitro(car, { nitro: false }, 1 / 60);
    race._integrate(car, { throttle: 0, brake: 0, steer: 0, handbrake: 0 }, 1 / 60);
  }
  assert.ok(car.speed < boostedSpeed);
  assert.ok(car.speed <= car.vehicle.maxSpeed + 0.01, 'velocidade volta ao limite normal sem corte instantâneo');
});

test('contato de colisão reduz a integridade e o Iron Bastion perde menor fração da capacidade', () => {
  const race = new RaceSimulation({ track: RACE_TRACKS[0], player,
    playerVehicle: getVehicleById('rift-blaze') ?? undefined,
    botPilots: [{ ...bots[0], vehicleId: 'iron-bastion' }, bots[1], bots[2]] });
  const [playerCar, iron] = race.participants;
  race.participants.slice(2).forEach((car, index) => { car.x = 1000 + index * 20; car.z = 1000; });
  playerCar.x = 0; playerCar.z = 0; iron.x = 3; iron.z = 0;
  playerCar.velocityX = 5; iron.velocityX = -5;
  const playerHealth = playerCar.health, ironHealth = iron.health;
  race._resolveVehicleContacts();
  assert.ok(playerCar.health < playerHealth);
  assert.ok(iron.health < ironHealth);
  assert.ok((ironHealth - iron.health) / iron.maxHealth < (playerHealth - playerCar.health) / playerCar.maxHealth);

  const healthAfterImpact = [playerCar.health, iron.health];
  iron.x = 3; playerCar.x = 0; playerCar.velocityX = 5; iron.velocityX = -5;
  race._resolveVehicleContacts();
  assert.deepEqual([playerCar.health, iron.health], healthAfterImpact,
    'contato contínuo respeita o cooldown de dano');
});

test('ao tocar a barreira, o carro perde metade da velocidade e rebate para dentro', () => {
  const race = makeRace();
  const car = race.participants[0];
  const center = sampleTrackAtProgress(race.track, race.track.totalLength * 0.12);
  const edge = race.track.width / 2 - 1.2;
  const normalX = -center.tangentZ, normalZ = center.tangentX;
  car.x = center.x + normalX * (edge + 0.2);
  car.z = center.z + normalZ * (edge + 0.2);
  car.heading = Math.atan2(center.tangentX, center.tangentZ);
  car.velocityX = center.tangentX * 12 + normalX * 5;
  car.velocityZ = center.tangentZ * 12 + normalZ * 5;
  car.speed = Math.hypot(car.velocityX, car.velocityZ);

  const freeCar = { ...car };
  const width = race.track.width;
  race.track.width = 1000;
  race._integrate(freeCar, { throttle: 0, brake: 0, steer: 0, handbrake: 0 }, 1 / 60);
  race.track.width = width;

  race._integrate(car, { throttle: 0, brake: 0, steer: 0, handbrake: 0 }, 1 / 60);

  const alongTrack = car.velocityX * center.tangentX + car.velocityZ * center.tangentZ;
  const intoBarrier = car.velocityX * normalX + car.velocityZ * normalZ;
  assert.ok(alongTrack > 0, 'a batida não deve inverter a componente tangencial');
  assert.ok(Math.abs(car.speed - freeCar.speed * 0.5) < 1e-10, 'cada impacto corta exatamente 50% da velocidade total');
  assert.ok(intoBarrier < 0, `a resposta à parede deve apontar de volta à pista: ${intoBarrier}`);
   const nearest = findNearestTrackPoint(race.track, car.x, car.z);
   assert.ok(nearest);
   assert.ok(Math.abs(nearest.lateral) <= edge + 0.01);
});

test('centros exatamente coincidentes são separados em uma colisão determinística', () => {
   const race = makeRace();
   const [a, b] = race.participants;
   assert.ok(a && b);
  race.participants.slice(2).forEach((car, index) => { car.x = 1000 + index * 20; car.z = 1000; });
  a.x = b.x = 0; a.z = b.z = 0;
  race._resolveVehicleContacts();
  assert.ok(Math.abs(Math.hypot(b.x - a.x, b.z - a.z) - 4.2) < 1e-10);
  assert.equal(a.health, a.maxHealth);
  assert.equal(b.health, b.maxHealth);
});

test('grid starts all four cars side by side beside the finish/start gate', () => {
  for (const track of RACE_TRACKS) {
    const race = makeRace(track);
    const start = sampleTrackAtProgress(race.track, race.track.totalLength * 0.985);
    const cars = race.participants;
    assert.equal(cars.length, 4);
    assert.ok(cars.every(car => Math.hypot(car.x - start.x, car.z - start.z) < 12));
    assert.ok(cars.every(car => Math.abs(car.progress - 0.985 / race.laps) < 1e-10), 'todos começam na mesma linha');
    const tangentHeading = Math.atan2(start.tangentX, start.tangentZ);
    assert.ok(cars.every(car => Math.abs(Math.atan2(Math.sin(car.heading - tangentHeading), Math.cos(car.heading - tangentHeading))) < 0.12));
    assert.ok(new Set(cars.map(car => Math.round(car.x * 10) / 10)).size > 1);
    assert.ok(cars.every(car => car.nextCheckpoint === 1 && car._nextGate === 0));
     const edge = track.width / 2 - 1;
     for (const [index, car] of cars.entries()) {
     const nearest = findNearestTrackPoint(race.track, car.x, car.z);
     assert.ok(nearest);
      assert.ok(Math.abs(nearest.lateral) < edge,
        `${track.id}: quatro carros devem caber com folga da parede no grid`);
     }
    assert.ok(race.gates.every(gate => gate.lateralLimit === track.width / 2));
  }
});

test('player controls alter speed and heading and input is ignored until race starts', () => {
  const race = makeRace();
  const car = race.participants[0];
  race.advance(1000, { throttle: 1, steer: 1 });
  assert.equal(car.speed, 0);
  race.start();
  race.advance(1000, { throttle: 1, steer: 1 });
  assert.ok(car.speed > 0);
  assert.notEqual(car.heading, 0);
});

test('corrida termina assim que o jogador completa a última volta, sem aguardar bots', () => {
  const race = makeRace().start();
  race.participants[0]!.finished = true;
  race.participants[0]!.finishTime = 1;
  race.advance(1000 / 60, { throttle: 1 });
  assert.equal(race.status, 'finished');
  assert.ok(race.participants.slice(1).some(car => !car.finished));
});

test('direção não gira um carro parado e responde mais à medida que ganha velocidade', () => {
  const race = makeRace(), car = race.participants[0];
  const stoppedHeading = car.heading;
  race._integrate(car, { throttle: 0, brake: 0, steer: 1, handbrake: 0 }, 1 / 60);
  assert.equal(car.heading, stoppedHeading, 'sem velocidade longitudinal, o veículo não pivota no lugar');

  car.velocityX = Math.sin(car.heading); car.velocityZ = Math.cos(car.heading); car.speed = 1;
  race._integrate(car, { throttle: 0, brake: 0, steer: 1, handbrake: 0 }, 1 / 60);
  const slowTurn = Math.abs(car.heading - stoppedHeading);
  car.heading = stoppedHeading;
  car.velocityX = Math.sin(car.heading) * 10; car.velocityZ = Math.cos(car.heading) * 10; car.speed = 10;
  race._integrate(car, { throttle: 0, brake: 0, steer: 1, handbrake: 0 }, 1 / 60);
  const fastTurn = Math.abs(car.heading - stoppedHeading);
  assert.ok(slowTurn > 0 && slowTurn < fastTurn);
});

test('passos fixos mantêm trajetória próxima em 30, 60, 120 e 144 Hz de render', () => {
  const outcomes = [30, 60, 120, 144].map(fps => {
    const race = makeRace().start();
    for (let frame = 0; frame < fps; frame += 1) {
      race.advance(1000 / fps, { throttle: 1, steer: 0.25 });
    }
    const car = race.participants[0];
    return { elapsed: race.elapsedTime, x: car.x, z: car.z, heading: car.heading };
  });
  for (const outcome of outcomes) {
    assert.ok(Math.abs(outcome.elapsed - 1) < 1e-10);
    assert.ok(Math.abs(outcome.x - outcomes[1].x) < 0.02);
    assert.ok(Math.abs(outcome.z - outcomes[1].z) < 0.02);
    assert.ok(Math.abs(outcome.heading - outcomes[1].heading) < 1e-10);
  }
});

test('instrumentação registra delta/passos/correções só quando ativada', () => {
  const diagnosticRace = new RaceSimulation({ track: RACE_TRACKS[0], player, botPilots: bots, diagnostics: true }).start();
  diagnosticRace.advance(1000 / 30, { throttle: 1 });
  assert.ok(Math.abs(diagnosticRace.lastAdvanceDeltaMs - 1000 / 30) < 1e-10);
  assert.equal(diagnosticRace.lastAdvanceSteps, 2);
  assert.equal(diagnosticRace.diagnosticAdvanceCalls, 1);
  assert.equal(Number.isInteger(diagnosticRace.lastAdvanceBarrierCorrections), true);
  assert.equal(Number.isInteger(diagnosticRace.lastAdvanceContactCorrections), true);

  const normalRace = makeRace().start();
  normalRace.advance(1000 / 60, { throttle: 1 });
  assert.equal(Object.hasOwn(normalRace, 'lastAdvanceSteps'), false, 'release não mantém contadores de diagnóstico');
});

test('modo de diagnóstico pode desativar temporariamente o solver de contatos, sem esconder bots', () => {
  const race = makeRace().start();
  let calls = 0;
  race._resolveVehicleContacts = () => { calls += 1; };
  race.setVehicleContactsEnabled(false);
  race._step(1 / 60, { throttle: 0, brake: 0, steer: 0, handbrake: 0, nitro: false });
  assert.equal(calls, 0);
  assert.equal(race.participants.filter(car => !car.finished).length, 4);
  race.setVehicleContactsEnabled(true);
  race._step(1 / 60, { throttle: 0, brake: 0, steer: 0, handbrake: 0, nitro: false });
  assert.equal(calls, 1);
});

test('presentation pose interpolates fixed physics steps and follows the shortest heading arc', () => {
  const race = makeRace();
  const car = race.participants[0];
  car.x = 10;
  car.y = 4;
  car.z = -6;
  car.heading = -Math.PI + 0.2;
  car.speed = 20;
  car._renderPreviousX = 0;
  car._renderPreviousY = 2;
  car._renderPreviousZ = 2;
  car._renderPreviousHeading = Math.PI - 0.2;
  car._renderPreviousSpeed = 10;

  const pose = race.getRenderPose(car, 0.5);

  assert.equal(pose.x, 5);
  assert.equal(pose.y, 3);
  assert.equal(pose.z, -2);
  assert.equal(pose.speed, 15);
  assert.ok(Math.abs(Math.abs(pose.heading) - Math.PI) < 1e-10);
  assert.deepEqual({ x: car.x, y: car.y, z: car.z, heading: car.heading, speed: car.speed },
    { x: 10, y: 4, z: -6, heading: -Math.PI + 0.2, speed: 20 }, 'visual interpolation does not mutate simulation state');

  car.finished = true;
  assert.deepEqual(race.getRenderPose(car, 0.1),
    { x: 10, y: 4, z: -6, heading: -Math.PI + 0.2, speed: 20 }, 'competidores concluídos mantêm a pose final');
});

test('fixed-step presentation moves on rendered frames instead of holding most 144 Hz frames', () => {
  const race = makeRace().start();
  const car = race.participants[0];
  let previous = race.getRenderPose(car);
  let movingFrames = 0;

  for (let frame = 0; frame < 144; frame += 1) {
    race.advance(1000 / 144, { throttle: 1 });
    const pose = race.getRenderPose(car);
    if (Math.hypot(pose.x - previous.x, pose.z - previous.z) > 1e-10) movingFrames += 1;
    previous = pose;
  }

  assert.ok(movingFrames > 120, `esperava movimento interpolado em mais de 120 quadros, recebeu ${movingFrames}`);
  assert.equal(Math.round(race.elapsedTime * 60), 60, 'a simulação permanece fixa em 60 passos por segundo');
});

test('bot libera o freio suavizado e volta a ganhar tração no drift após uma frenagem', () => {
  for (const difficulty of ['normal', 'hard']) {
    const race = makeRace(RACE_TRACKS[0], difficulty);
    const car = race.participants[1];
    const center = sampleTrackAtProgress(race.track, race.track.totalLength * 0.12);
    Object.assign(car, { x: center.x, z: center.z,
      heading: Math.atan2(center.tangentX, center.tangentZ) + 0.6,
      velocityX: center.tangentX * 12, velocityZ: center.tangentZ * 12,
      speed: 12, _aiBrake: 0.65 });
    let controls = race.getBotControls(car, 1 / 60);
    for (let i = 0; i < 180; i += 1) controls = race.getBotControls(car, 1 / 60);
    assert.equal(controls.brake, 0, 'o resíduo do freio não pode bloquear a tração para sempre');
    assert.ok(controls.throttle > 0.9);
    const speedBefore = car.speed;
    race._integrate(car, controls, 1 / 60);
    assert.ok(car._driftBoost > 0, 'adversários recebem a mesma tração no drift que o jogador');
    assert.ok(car.speed >= speedBefore);
  }
});

test('três bots completam as três pistas em Normal e Difícil com gates e chegadas válidos', () => {
  for (const track of RACE_TRACKS) for (const difficulty of ['normal', 'hard']) {
    const race = makeRace(track, difficulty).start();
    // This fixture checks all three NPCs independently of the production
    // rule that ends the race as soon as the player finishes.
    for (let i = 0; i < 150 * 60 && !race.participants.slice(1).every(car => car.finished); i += 1) {
      race._step(1 / 60, { throttle: 1, brake: 0, steer: 0, handbrake: 0, nitro: false });
    }
    assert.ok(race.participants.slice(1).every(car => car.finished), `${track.id}/${difficulty} bots não terminaram: ${JSON.stringify(race.getStandings().map(car => ({ id: car.id, laps: car.lapsCompleted })))}`);
    const standings = race.getStandings();
    assert.deepEqual(standings.map(car => car.rank), [1, 2, 3, 4]);
    assert.ok(standings.slice(0, 3).every(car => car.finished && car.lapsCompleted === 4 && Number.isFinite(car.finishTime)));
    const finishTimes = standings.slice(0, 3).map(car => {
       if (car.finishTime === null) throw new Error('resultado sem tempo de chegada');
       return car.finishTime;
     });
     assert.deepEqual(finishTimes, [...finishTimes].sort((a, b) => a - b));
    for (const car of race.participants) {
      const nearest = findNearestTrackPoint(race.track, car.x, car.z);
      assert.ok(nearest);
      assert.ok(Math.abs(nearest.lateral) <= race.track.width / 2 + 0.1, `${track.id}/${difficulty}/${car.name} saiu da pista`);
    }
  }
});

test('sequenced geometric gates reject reverse and skipped crossings, player can complete full ordered laps', () => {
  const race = makeRace().start(); const car = race.participants[0];
  const gate = race.gates[0];
  car._prevX = gate.x + gate.tangentX; car._prevZ = gate.z + gate.tangentZ;
  car.x = gate.x - gate.tangentX; car.z = gate.z - gate.tangentZ;
  race._updateProgress(car);
  assert.equal(car.nextCheckpoint, 1, 'crossing the first gate backwards is rejected');

  const finishGate = race.gates[3];
  car._prevX = finishGate.x - finishGate.tangentX * 2; car._prevZ = finishGate.z - finishGate.tangentZ * 2;
  car.x = finishGate.x + finishGate.tangentX * 2; car.z = finishGate.z + finishGate.tangentZ * 2;
  race._updateProgress(car);
  assert.equal(car.lapsCompleted, 0, 'crossing the finish gate out of sequence is rejected');
  assert.equal(car.nextCheckpoint, 1);

  const orderedGates = race.gates;
  for (let gateIndex = 0; gateIndex < orderedGates.length; gateIndex += 1) {
    const currentGate = orderedGates[gateIndex];
    const direction = 2;
      car._prevX = currentGate.x - currentGate.tangentX * direction;
      car._prevZ = currentGate.z - currentGate.tangentZ * direction;
      car.x = currentGate.x + currentGate.tangentX * direction;
      car.z = currentGate.z + currentGate.tangentZ * direction;
      race._updateProgress(car);
    assert.equal(car.nextCheckpoint, gateIndex === 3 ? 1 : gateIndex + 2);
    assert.equal(car.lapsCompleted, gateIndex === 3 ? 1 : 0);
  }
  assert.ok(car.progress > 0);
});
