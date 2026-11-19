import test from 'node:test';
import assert from 'node:assert/strict';
import { RACE_TRACKS } from '../src/data/raceTracks.ts';
import { getVehicleById } from '../src/data/vehicles.ts';
import { findNearestTrackPoint, RaceSimulation, sampleRaceTrack, sampleTrackAtProgress } from '../src/race/RaceSimulation.ts';
import type { RaceParticipant, RaceTrack } from '../src/race/RaceSimulation.ts';
import { RACE_TRACK_SAMPLES_PER_SEGMENT, sampleTrackSurface, trackHeadingAlignment } from '../src/race/trackMath.ts';
import { generateProceduralRamps, getRampFeatureSpan, isRampPlacementSafe, RAMP_KINDS,
  sampleRampSurfaceProfile } from '../src/race/rampLibrary.ts';
import { ArcadeJumpPresentation } from '../src/visuals/race/ArcadeJumpPresentation.ts';

const rampTracks = RACE_TRACKS.filter(track => track.id === 'neon-furnace' || track.id === 'voltage-run');

const createRace = (track: RaceTrack, seed = 'unit-race|attempt-1') => new RaceSimulation({
  track,
  player: { id: 'ramp-player', name: 'Piloto' },
  botPilots: [1, 2, 3].map(index => ({ id: `ramp-bot-${index}`, name: `Bot ${index}` })),
  raceSeed: seed,
}).start();

test('Neon Furnace mantém oito rampas fixas, duas por reta; a biblioteca procedural continua reproduzível', () => {
  assert.deepEqual(RAMP_KINDS, ['bump', 'jump', 'platform', 'double']);
  const furnace = RACE_TRACKS.find(track => track.id === 'neon-furnace')!;
  const race = createRace(furnace);
  const ramps = race.track.jumps ?? [];
  assert.equal(ramps.length, 8);
  assert.deepEqual(new Set(ramps.map(ramp => ramp.kind)), new Set(RAMP_KINDS));
  assert.deepEqual(ramps, createRace(furnace, 'different-seed').track.jumps,
    'a configuração de validação permanece fixa entre as voltas e seeds');
  const fixedIntervals: { start: number; end: number }[] = [];
  const rampsPerStraight = new Map<string, number>();
  for (const ramp of ramps) {
    const region = furnace.rampRegions!.find(candidate => candidate.id === ramp.regionId)!;
    const span = getRampFeatureSpan(ramp, race.track.totalLength);
    const start = ramp.takeoff * race.track.totalLength - span.approach;
    const end = ramp.takeoff * race.track.totalLength + Math.max(span.afterTakeoff, span.landingDistance);
    rampsPerStraight.set(region.id, (rampsPerStraight.get(region.id) ?? 0) + 1);
    assert.ok(start - region.start * race.track.totalLength >= 15,
      `${ramp.id}: aproximação afastada da curva de entrada`);
    assert.ok(region.end * race.track.totalLength - end >= 15,
      `${ramp.id}: aterrissagem/saída afastada da curva seguinte`);
    assert.equal(isRampPlacementSafe({ trackId: furnace.id, totalLength: race.track.totalLength,
      trackWidth: furnace.width, regions: furnace.rampRegions!, count: 8, seed: 'fixed',
      obstacles: furnace.scenery, sampleAt: distance => sampleTrackAtProgress(race.track, distance) }, region, ramp), true,
    `${ramp.kind}: posição fixa protegida de curvas e obstáculos`);
    assert.ok(fixedIntervals.every(item => start >= item.end + 25 || end + 25 <= item.start),
      `${ramp.kind}: distância segura em relação às outras rampas`);
    fixedIntervals.push({ start, end });
  }
  assert.deepEqual([...rampsPerStraight.values()], [2, 2, 2, 2], 'cada reta recebe duas rampas');

  const proceduralTrack = RACE_TRACKS.find(track => track.id === 'voltage-run')!;
  const proceduralRace = createRace(proceduralTrack);
  const options = { trackId: proceduralTrack.id, totalLength: proceduralRace.track.totalLength,
    trackWidth: proceduralTrack.width, regions: proceduralTrack.rampRegions!, count: 3,
    seed: 'same-seed', obstacles: proceduralTrack.scenery,
    sampleAt: (distance: number) => sampleTrackAtProgress(proceduralRace.track, distance) };
  const first = generateProceduralRamps(options);
  const repeated = generateProceduralRamps(options);
  assert.equal(first.length, 3);
  assert.deepEqual(first, repeated);
  assert.notDeepEqual(first, generateProceduralRamps({ ...options, seed: 'other-seed' }));
  assert.ok(first.every(ramp => RAMP_KINDS.includes(ramp.kind)));
  for (const ramp of first) {
    const region = options.regions.find(candidate => candidate.id === ramp.regionId)!;
    assert.equal(isRampPlacementSafe(options, region, ramp), true, `${ramp.kind}: sorteio respeita segurança`);
  }
});

test('os quatro perfis ativos apresentam suas rampas, plataformas e vãos', () => {
  const track = RACE_TRACKS.find(candidate => candidate.id === 'neon-furnace')!;
  const race = createRace(track);
  const byKind = new Map(race.track.jumps!.map(ramp => [ramp.kind, ramp]));
  const ramp = (kind: (typeof RAMP_KINDS)[number]) => byKind.get(kind)!;
  const offset = (kind: (typeof RAMP_KINDS)[number], distance: number) =>
    sampleRampSurfaceProfile(ramp(kind), ramp(kind).takeoff * race.track.totalLength + distance,
      race.track.totalLength);

  assert.ok(sampleTrackSurface(race.track, race.track.jumps,
    ramp('bump').takeoff * race.track.totalLength).y > 0.4, 'Tipo 1 tem crista arredondada');
  assert.ok(sampleTrackSurface(race.track, race.track.jumps,
    ramp('jump').takeoff * race.track.totalLength - ramp('jump').rampLength / 2).y > 0.6,
  'Tipo 2 sobe até o lábio');
  const jump = ramp('jump');
  const jumpTakeoff = jump.takeoff * race.track.totalLength;
  const jumpGap = jump.gapLength!;
  assert.equal(sampleTrackSurface(race.track, race.track.jumps, jumpTakeoff + jumpGap * 0.5).hasGround,
    false, 'Tipo 2 tem vão físico sem piso depois do lábio');
  assert.equal(sampleTrackSurface(race.track, race.track.jumps, jumpTakeoff + jumpGap + 0.1).hasGround,
    true, 'a área de aterrissagem começa somente depois do vão');
  assert.ok(jumpGap >= 9, 'o vão é comprido o bastante para separar a rampa da recepção');
  assert.equal(offset('platform', 8)?.hasGround, true);
  assert.ok((offset('platform', 8)?.offset ?? 0) > 2, 'Tipo 3 mantém plataforma elevada');
  assert.ok((offset('platform', 30)?.offset ?? 1) < 2, 'Tipo 3 desce depois da plataforma');
  assert.ok((offset('platform', 23 + 9.5 * 0.2)?.grade ?? 0) < -0.12,
    'Tipo 3 faz uma transição de descida perceptível');
  assert.equal(offset('double', 5)?.hasGround, true, 'Tipo 4 tem superfície contínua entre os níveis');
  const double = ramp('double');
  const firstPlatformEnd = double.firstPlatformLength ?? 3;
  const gapEnd = firstPlatformEnd + (double.gapLength ?? 6);
  const firstLevel = offset('double', firstPlatformEnd - 0.01)!;
  const connectorStart = offset('double', firstPlatformEnd + 0.01)!;
  const connectorEnd = offset('double', gapEnd - 0.01)!;
  const secondRampStart = offset('double', gapEnd + 0.01)!;
  assert.ok(Math.abs(firstLevel.offset - connectorStart.offset) < 0.02,
    'a transição do primeiro patamar para a ligação não abre um degrau');
  assert.ok(Math.abs(connectorEnd.offset - secondRampStart.offset) < 0.02,
    'a ligação encontra a segunda subida sem buraco ou degrau');
  assert.ok(Math.abs(connectorStart.grade) < 0.01 && Math.abs(connectorEnd.grade) < 0.01,
    'a ligação começa e termina com inclinação contínua');
  assert.ok((offset('double', 28)?.offset ?? 0) > (offset('double', 4)?.offset ?? 0),
    'Tipo 4 termina em nível mais alto');
  const doublePlatformEnd = (double.firstPlatformLength ?? 0) + (double.gapLength ?? 0)
    + (double.secondRampLength ?? 0) + (double.secondPlatformLength ?? 0);
  const doubleDescentStart = offset('double', doublePlatformEnd);
  const doubleDescentMiddle = offset('double', doublePlatformEnd + (double.descentLength ?? 10) / 2);
  const doubleDescentEnd = offset('double', doublePlatformEnd + (double.descentLength ?? 10));
  assert.ok(doubleDescentStart && doubleDescentMiddle && doubleDescentEnd);
  assert.ok(doubleDescentStart.offset > 2 && doubleDescentEnd.offset < 0.01,
    'Tipo 4 retorna à altura da pista depois da segunda plataforma');
  assert.ok(doubleDescentMiddle.grade < -0.2,
    'Tipo 4 tem uma descida contínua e legível antes de tocar a pista');
  assert.ok(Math.abs((offset('double', doublePlatformEnd + 0.01)?.grade ?? 1)) < 0.01
    && Math.abs((offset('double', doublePlatformEnd + (double.descentLength ?? 10) - 0.01)?.grade ?? 1)) < 0.01,
  'as duas extremidades da transição não formam degraus de inclinação');
});

test('a ligação da Rampa 04 mantém contato físico ao atravessar nos dois sentidos', () => {
  const track = RACE_TRACKS.find(candidate => candidate.id === 'neon-furnace')!;
  const ramp = track.jumps!.find(candidate => candidate.kind === 'double')!;
  const firstPlatform = ramp.firstPlatformLength ?? 3;
  const connectorLength = ramp.gapLength ?? 6;
  const startDistance = ramp.takeoff * createRace(track).track.totalLength
    + firstPlatform + connectorLength / 2;

  for (const direction of [1, -1] as const) {
    const race = createRace(track);
    race.setVehicleContactsEnabled(false);
    const point = sampleTrackAtProgress(race.track, startDistance);
    const car = race.participants[0]!;
    car.x = point.x; car.z = point.z;
    car.y = sampleTrackSurface(race.track, race.track.jumps, startDistance).y;
    car.heading = Math.atan2(point.tangentX, point.tangentZ) + (direction < 0 ? Math.PI : 0);
    car.velocityX = Math.sin(car.heading) * 5;
    car.velocityZ = Math.cos(car.heading) * 5;
    car.speed = 5;
    car._lastPathDistance = startDistance; car._distance = startDistance;
    const health = car.health;

    for (let frame = 0; frame < 24; frame += 1) {
      race._integrate(car, { throttle: 0, brake: 0, steer: 0, handbrake: 0 }, 1 / 60);
      const nearest = findNearestTrackPoint(race.track, car.x, car.z)!;
      car._lastPathDistance = nearest.distance;
      const surface = sampleTrackSurface(race.track, race.track.jumps, nearest.distance);
      assert.equal(surface.hasGround, true, 'a transição não contém abertura física');
      assert.equal(car.airborne, false, 'o carro não cai pela ligação em velocidade moderada');
      assert.ok(Math.abs(car.y - surface.y) < 0.01, 'a altura do carro acompanha o perfil sólido');
    }
    assert.notEqual(car._lastPathDistance, startDistance, 'o veículo percorreu a ligação');
    assert.equal(car.health, health, 'o contato normal não causa dano');
    assert.equal(car.destroyed, false);
  }
});

test('as duas rampas de salto compartilham superfície visual/física e identificam o vão de lava', () => {
  const track = RACE_TRACKS.find(candidate => candidate.id === 'neon-furnace')!;
  const race = createRace(track);
  const visualTrack = sampleRaceTrack(track, RACE_TRACK_SAMPLES_PER_SEGMENT);
  assert.deepEqual(visualTrack.points, race.track.points,
    'RaceWorld e simulação amostram o mesmo caminho na mesma resolução');
  assert.equal(visualTrack.points.length, track.waypoints.length * RACE_TRACK_SAMPLES_PER_SEGMENT);

  for (const ramp of race.track.jumps!.filter(candidate => candidate.kind === 'jump')) {
    assert.equal(ramp.lavaGap, true, `${ramp.id}: vão marcado como lava`);
    const takeoff = ramp.takeoff * race.track.totalLength;
    const lip = sampleTrackSurface(race.track, race.track.jumps, takeoff);
    assert.equal(lip.hasGround, true, `${ramp.id}: lábio exato de decolagem ainda tem piso`);
    assert.ok(lip.y >= ramp.rampHeight - 0.01, `${ramp.id}: superfície chega à altura correta no lábio`);
    for (let offset = -ramp.rampLength; offset <= -0.25; offset += 0.25) {
      const physical = sampleTrackSurface(race.track, race.track.jumps, takeoff + offset);
      assert.equal(physical.hasGround, true, `${ramp.id}: superfície física presente na rampa`);
      assert.ok(Number.isFinite(physical.y));
    }
    for (let offset = 0.25; offset < ramp.gapLength!; offset += 0.25) {
      const physical = sampleTrackSurface(race.track, race.track.jumps, takeoff + offset);
      assert.equal(physical.hasGround, false, `${ramp.id}: vão sem piso para cair`);
      assert.equal(physical.ramp?.id, ramp.id);
    }
    const receiver = sampleTrackSurface(race.track, race.track.jumps,
      takeoff + ramp.gapLength! + 0.25);
    assert.equal(receiver.hasGround, true, `${ramp.id}: superfície de pouso presente após o vão`);
  }
});

test('a inclinação local troca de sinal ao inverter a orientação do carro', () => {
  const track = RACE_TRACKS.find(candidate => candidate.id === 'neon-furnace')!;
  const race = createRace(track);
  const distance = race.track.jumps!.find(ramp => ramp.id === 'furnace-ramp-03')!.takeoff
    * race.track.totalLength - 7;
  const surface = sampleTrackSurface(race.track, race.track.jumps, distance);
  const forwardHeading = Math.atan2(surface.tangentX, surface.tangentZ);
  assert.ok(surface.grade > 0.1);
  assert.ok(trackHeadingAlignment(forwardHeading, surface.tangentX, surface.tangentZ) > 0.99);
  assert.ok(trackHeadingAlignment(forwardHeading + Math.PI, surface.tangentX, surface.tangentZ) < -0.99);
});

test('queda na lava explode jogador e bot e os respawna alinhados antes da respectiva rampa', () => {
  const track = RACE_TRACKS.find(candidate => candidate.id === 'neon-furnace')!;
  const neutral = { throttle: 0, brake: 0, steer: 0, handbrake: 0 };
  for (const rampId of ['furnace-ramp-02', 'furnace-ramp-05']) {
    for (const participantIndex of [0, 1]) {
      const race = createRace(track);
      race.setVehicleContactsEnabled(false);
      const ramp = race.track.jumps!.find(candidate => candidate.id === rampId)!;
      const takeoff = ramp.takeoff * race.track.totalLength;
      const dropDistance = takeoff + ramp.gapLength! / 2;
      const point = sampleTrackAtProgress(race.track, dropDistance);
      const car = race.participants[participantIndex]!;
      car.x = point.x; car.z = point.z;
      car.y = sampleTrackSurface(race.track, race.track.jumps, dropDistance).y;
      car.heading = Math.atan2(point.tangentX, point.tangentZ);
      car.velocityX = 0; car.velocityZ = 0; car.speed = 0;
      car.airborne = false; car.verticalVelocity = 0;
      car._lastPathDistance = dropDistance; car._distance = dropDistance;

      for (let frame = 0; frame < 60 && !car.destroyed; frame += 1)
        race._integrate(car, neutral, 1 / 60);
      assert.equal(car.destroyed, true, `${car.isPlayer ? 'jogador' : 'bot'} caiu em ${rampId}`);
      assert.equal(car.health, 0, 'lava causa destruição imediata');
      assert.equal(car.destructionSequence, 1, 'sequência visual de explosão foi acionada');
      const respawnDistance = car._respawnPoint!.distance;
      const distanceBeforeTakeoff = ((takeoff - respawnDistance) % race.track.totalLength + race.track.totalLength)
        % race.track.totalLength;
      assert.ok(distanceBeforeTakeoff >= ramp.rampLength + 40 && distanceBeforeTakeoff <= ramp.rampLength + 50,
        'respawn fica antes da rampa, com espaço para alinhar e acelerar');
      assert.equal(sampleTrackSurface(race.track, race.track.jumps, respawnDistance).hasGround, true,
        'respawn ocorre sobre piso, fora do vão');

      for (let frame = 0; frame < 60 && car.respawnSequence === 0; frame += 1) race._step(1 / 60, neutral);
      assert.equal(car.destroyed, false, 'o respawn automático retirou o carro da lava');
      assert.equal(car.respawnSequence, 1);
      assert.ok(Math.abs(car._lastPathDistance - respawnDistance) < 0.01,
        'o carro retorna ao ponto de preparação antes do salto');
      assert.equal(car.health, car.maxHealth);
    }
  }
});

test('a segunda rampa de salto ainda permite decolagem e pouso sem dano', () => {
  const track = RACE_TRACKS.find(candidate => candidate.id === 'neon-furnace')!;
  const race = createRace(track);
  race.setVehicleContactsEnabled(false);
  const ramp = race.track.jumps!.find(candidate => candidate.id === 'furnace-ramp-05')!;
  const takeoff = ramp.takeoff * race.track.totalLength;
  const startDistance = takeoff - ramp.rampLength - 2;
  const point = sampleTrackAtProgress(race.track, startDistance);
  const car = race.participants[0]!;
  const health = car.health;
  car.x = point.x; car.z = point.z; car.y = sampleTrackSurface(race.track, race.track.jumps, startDistance).y;
  car.heading = Math.atan2(point.tangentX, point.tangentZ);
  car.velocityX = Math.sin(car.heading) * car.vehicle.maxSpeed;
  car.velocityZ = Math.cos(car.heading) * car.vehicle.maxSpeed;
  car.speed = car.vehicle.maxSpeed;
  car._lastPathDistance = startDistance; car._distance = startDistance;
  for (let frame = 0; frame < 150 && (car._landingSequence ?? 0) === 0; frame += 1)
    race.advance(1000 / 60, { throttle: 1 });
  assert.ok((car._landingSequence ?? 0) > 0, 'a rampa corrigida lançou e recebeu o carro');
  assert.equal(car.destroyed, false);
  assert.equal(car.health, health, 'pouso normal não penaliza');
});

test('saltos e aterrissagens dos Tipos 2, 3 e 4 preservam a física oficial', () => {
  const track = RACE_TRACKS.find(candidate => candidate.id === 'neon-furnace')!;
  for (const kind of ['jump', 'platform', 'double'] as const) {
    const race = createRace(track);
    race.setVehicleContactsEnabled(false);
    const ramp = race.track.jumps!.find(candidate => candidate.kind === kind)!;
    const takeoff = ramp.takeoff * race.track.totalLength;
    const startDistance = takeoff - ramp.rampLength - 2;
    const point = sampleTrackAtProgress(race.track, startDistance);
    const car = race.participants[0]!;
    const startingHealth = car.health;
    const maximumSpeed = 30; // 120 km/h: permite testar as superfícies elevadas sem exigir uma recepção fixa.
    car.x = point.x;
    car.z = point.z;
    car.y = sampleTrackSurface(race.track, race.track.jumps, startDistance).y;
    car.heading = Math.atan2(point.tangentX, point.tangentZ);
    car.velocityX = Math.sin(car.heading) * maximumSpeed;
    car.velocityZ = Math.cos(car.heading) * maximumSpeed;
    car.speed = maximumSpeed;
    car._lastPathDistance = startDistance;
    car._distance = startDistance;
    let tookOff = false;
    let airborneInsideGap = false;
    let maximumFlightHeight = car.y;
    let landingDistance: number | null = null;
    let landingHeight: number | null = null;
    let landingHealth: number | null = null;
    for (let frame = 0; frame < 150 && landingDistance === null; frame += 1) {
      race.advance(1000 / 60, {});
      tookOff ||= car.airborne && car._activeJumpId === ramp.id;
      if (car.airborne) maximumFlightHeight = Math.max(maximumFlightHeight, car.y);
      if (kind === 'jump' && car.airborne
        && !sampleTrackSurface(race.track, race.track.jumps, car._lastPathDistance).hasGround)
        airborneInsideGap = true;
      if (landingDistance === null && (car._landingSequence ?? 0) > 0) {
        landingDistance = ((car._lastPathDistance - takeoff) % race.track.totalLength + race.track.totalLength)
          % race.track.totalLength;
        landingHeight = car.y;
        landingHealth = car.health;
      }
    }
    assert.equal(tookOff, true, `${kind}: decolou`);
    assert.ok((car._landingSequence ?? 0) > 0, `${kind}: pousou em superfície válida`);
    if (kind === 'jump') {
      assert.equal(airborneInsideGap, true, 'Tipo 2 atravessou o vão ainda no ar');
      assert.ok(landingDistance !== null && landingDistance > ramp.gapLength!,
        'Tipo 2 tocou o chão somente depois de cruzar o vão');
      assert.ok(maximumFlightHeight - sampleTrackSurface(race.track, race.track.jumps, takeoff).y > 1.5,
        'o salto do Tipo 2 ganha altura perceptível');
    }
    if (kind === 'platform') assert.ok(maximumFlightHeight > 4,
      'Tipo 3 ganha altura antes de pousar na plataforma');
    if (kind === 'platform') assert.ok(landingHeight !== null && landingHeight >= 2.3,
      'Tipo 3 pousa na plataforma elevada');
    if (kind === 'double') {
      assert.ok(landingDistance !== null && landingDistance >= 10 && landingDistance <= 29,
        'Tipo 4 aterrissa na plataforma superior, não depois dela');
      assert.ok(landingHeight !== null && landingHeight >= 2,
        'pouso do Tipo 4 ocorre no segundo nível elevado');
    }
    assert.equal(car.airborne, false, `${kind}: recuperou contato`);
    assert.equal(car.destroyed, false, `${kind}: preservou o veículo`);
    assert.equal(landingHealth, startingHealth, `${kind}: pouso não causou dano vertical`);
    assert.ok(car.speed > 0, `${kind}: manteve avanço`);
  }
});

test('impulso vertical suavizado mantém pousos naturais nos oito perfis a 110/165/220 km/h', () => {
  const track = RACE_TRACKS.find(candidate => candidate.id === 'neon-furnace')!;
  const vehicle = getVehicleById('volt-vector');
  assert.ok(vehicle);
  const speeds = [110, 165, 220] as const;
  const results: { rampId: string; kind: string; speedKmh: number; height: number; flightSeconds: number; distance: number }[] = [];

  const measureFlight = (rampId: string, speedKmh: number, participantIndex = 0, useBotAI = false) => {
    const speedPoints = speeds.indexOf(speedKmh as (typeof speeds)[number]) * 50;
    const botPilots = [0, 1, 2].map(index => ({ id: `jump-bot-${index}`, name: `Bot ${index}`,
      vehicleId: vehicle.id, vehicleStats: { ...vehicle.stats, speed: speedPoints, acceleration: 100 } }));
    const race = new RaceSimulation({ track, player: { id: 'jump-player', name: 'Camaro' },
      playerVehicle: vehicle, vehicleStats: { ...vehicle.stats, speed: speedPoints, acceleration: 100 },
      botPilots }).start();
    race.setVehicleContactsEnabled(false);
    const ramp = race.track.jumps!.find(candidate => candidate.id === rampId)!;
    const takeoff = ramp.takeoff * race.track.totalLength;
    const startDistance = takeoff - ramp.rampLength - 2;
    const point = sampleTrackAtProgress(race.track, startDistance);
    const car = race.participants[participantIndex]!;
    if (participantIndex > 0 && !useBotAI) {
      race.participants[0]!.isPlayer = false;
      car.isPlayer = true;
    }
    car.x = point.x; car.z = point.z;
    car.y = sampleTrackSurface(race.track, race.track.jumps, startDistance).y;
    car.heading = Math.atan2(point.tangentX, point.tangentZ);
    car._lastPathDistance = startDistance; car._distance = startDistance;
    car.speed = speedKmh / 4;
    car.velocityX = Math.sin(car.heading) * car.speed;
    car.velocityZ = Math.cos(car.heading) * car.speed;
    const takeoffY = sampleTrackSurface(race.track, race.track.jumps, takeoff).y;
    const startingHealth = car.health;
    let launchFrame = 0, landingFrame = 0, maximumY = car.y, launchHorizontalSpeed = 0, crossedGapInAir = false;
    for (let frame = 1; frame <= 240 && !car.destroyed && !landingFrame; frame += 1) {
      if (useBotAI) {
        const controls = race.getBotControls(car, 1 / 60);
        race._integrate(car, controls, 1 / 60);
        race._updateProgress(car);
      } else race.advance(1000 / 60, {});
      if (!launchFrame && car.airborne) {
        launchFrame = frame;
        launchHorizontalSpeed = car.speed;
      }
      if (car.airborne) {
        maximumY = Math.max(maximumY, car.y);
        if (ramp.kind === 'jump'
          && !sampleTrackSurface(race.track, race.track.jumps, car._lastPathDistance).hasGround)
          crossedGapInAir = true;
      }
      if (car._landingSequence) landingFrame = frame;
    }
    assert.ok(launchFrame > 0, `${rampId} decolou a ${speedKmh} km/h`);
    assert.ok(landingFrame > launchFrame, `${rampId} pousou na primeira superfície válida`);
    assert.equal(car.destroyed, false, `${rampId}: não caiu no vazio`);
    assert.equal(car.health, startingHealth, `${rampId}: pouso normal não causa dano`);
    assert.equal(car.airborne, false);
    assert.ok(launchHorizontalSpeed > speedKmh / 4 * 0.9,
      `${rampId}: impulso vertical menor não reduz a velocidade horizontal`);
    assert.ok(sampleTrackSurface(race.track, race.track.jumps, car._lastPathDistance).hasGround,
      `${rampId}: contato corresponde a uma superfície física`);
    if (ramp.kind === 'jump') assert.equal(crossedGapInAir, true, `${rampId}: cruzou o vão de lava em voo`);
    if (rampId === 'furnace-ramp-03' && speedKmh === 110)
      assert.ok(car.y >= 2.3, 'a Rampa 03 ainda recebe o Camaro na plataforma em velocidade normal');
    if (rampId === 'furnace-ramp-04' && speedKmh === 110)
      assert.ok(car.y >= 2, 'a Rampa 04 ainda recebe o Camaro na plataforma elevada em velocidade normal');
    const distance = ((car._lastPathDistance - takeoff) % race.track.totalLength + race.track.totalLength)
      % race.track.totalLength;
    return { ramp, speedKmh, height: maximumY - takeoffY, flightSeconds: (landingFrame - launchFrame) / 60,
      distance, car };
  };

  for (const ramp of track.jumps!) {
    const metrics = speeds.map(speed => measureFlight(ramp.id, speed));
    for (const metric of metrics) results.push({ rampId: ramp.id, kind: ramp.kind, speedKmh: metric.speedKmh,
      height: metric.height, flightSeconds: metric.flightSeconds, distance: metric.distance });
    assert.ok(metrics[0]!.distance < metrics[1]!.distance && metrics[1]!.distance < metrics[2]!.distance,
      `${ramp.id}: velocidade física maior continua gerando salto mais longo`);
    assert.ok(metrics[0]!.height < metrics[1]!.height && metrics[1]!.height < metrics[2]!.height,
      `${ramp.id}: velocidade mantém influência na altura`);
  }

  const mainRamp = results.filter(result => result.rampId === 'furnace-ramp-02');
  assert.ok(mainRamp[2]!.distance < 80,
    `220 km/h reduz perceptivelmente os ~98 m de referência: ${JSON.stringify(mainRamp)}`);
  assert.ok(mainRamp[2]!.flightSeconds < 1.6,
    `tempo de voo menor que os 1,85 s de referência: ${JSON.stringify(mainRamp)}`);
  assert.ok(mainRamp[2]!.distance > mainRamp[1]!.distance + 15,
    'a velocidade máxima ainda conserva inércia e alcance significativamente maiores');

  measureFlight('furnace-ramp-02', 220, 0);
  const botFlight = measureFlight('furnace-ramp-02', 220, 1, true);
  assert.ok(botFlight.distance > botFlight.ramp.gapLength!, 'o bot cruza naturalmente o vão de lava');
  assert.ok(botFlight.distance < 80, 'a calibração vertical também reduz o salto do bot');
  assert.equal(botFlight.car.health, botFlight.car.maxHealth, 'o bot não recebe dano no pouso normal');
});

test('inclinação faz o carro lento recuar, enquanto aceleração suficiente supera a Rampa 4', () => {
  const track = RACE_TRACKS.find(candidate => candidate.id === 'neon-furnace')!;
  const createCarAtRamp = () => {
    const race = createRace(track);
    race.setVehicleContactsEnabled(false);
    const ramp = race.track.jumps!.find(candidate => candidate.kind === 'double')!;
    const distance = ramp.takeoff * race.track.totalLength - 4;
    const point = sampleTrackAtProgress(race.track, distance);
    const car = race.participants[0]!;
    car.x = point.x; car.z = point.z;
    car.y = sampleTrackSurface(race.track, race.track.jumps, distance).y;
    car.heading = Math.atan2(point.tangentX, point.tangentZ);
    car.velocityX = 0; car.velocityZ = 0; car.speed = 0;
    car._lastPathDistance = distance; car._distance = distance;
    return { race, car, distance, ramp };
  };

  const slow = createCarAtRamp();
  assert.ok(sampleTrackSurface(slow.race.track, slow.race.track.jumps, slow.distance).grade > 0.2,
    'o teste começa em trecho ascendente real');
  for (let frame = 0; frame < 180; frame += 1) slow.race.advance(1000 / 60, { throttle: 0.1 });
  assert.ok(slow.car._lastPathDistance < slow.distance - 0.5,
    'com pouco acelerador, a resistência gravitacional faz o carro descer de ré');

  const fast = createCarAtRamp();
  let launched = false;
  for (let frame = 0; frame < 120; frame += 1) {
    fast.race.advance(1000 / 60, { throttle: 1 });
    launched ||= fast.car.airborne && fast.car._activeJumpId === fast.ramp.id;
  }
  assert.equal(launched, true, 'com aceleração suficiente, sobe a rampa e salta normalmente');
  assert.ok(fast.car._lastPathDistance > fast.distance, 'a aceleração supera a gravidade na subida');
});

test('a gravidade desacelera todas as subidas e favorece as descidas existentes', () => {
  const track = RACE_TRACKS.find(candidate => candidate.id === 'neon-furnace')!;
  const ramps = track.jumps!;
  const totalLength = createRace(track).track.totalLength;
  const uphillDistance = (ramp: (typeof ramps)[number]) => ramp.takeoff * totalLength - ramp.rampLength * 0.5;
  const downhillDistance = (ramp: (typeof ramps)[number]) => {
    const takeoff = ramp.takeoff * totalLength;
    if (ramp.kind === 'bump') return takeoff + (ramp.receiverLength ?? 6) / 2;
    if (ramp.kind === 'platform') return takeoff + (ramp.platformLength ?? 23) + (ramp.descentLength ?? 9.5) / 2;
    if (ramp.kind === 'double') return takeoff + (ramp.firstPlatformLength ?? 3) + (ramp.gapLength ?? 6)
      + (ramp.secondRampLength ?? 4) + (ramp.secondPlatformLength ?? 20) + (ramp.descentLength ?? 10) / 2;
    return null;
  };
  for (const kind of RAMP_KINDS) {
    const ramp = ramps.find(candidate => candidate.kind === kind)!;
    const simulateSlope = (distance: number) => {
      const race = createRace(track);
      race.setVehicleContactsEnabled(false);
      const point = sampleTrackAtProgress(race.track, distance);
      const car = race.participants[0]!;
      car.x = point.x; car.z = point.z;
      car.y = sampleTrackSurface(race.track, race.track.jumps, distance).y;
      car.heading = Math.atan2(point.tangentX, point.tangentZ);
      car.velocityX = 0; car.velocityZ = 0; car.speed = 0;
      car._lastPathDistance = distance; car._distance = distance;
      race._integrate(car, { throttle: 0, brake: 0, steer: 0, handbrake: 0 }, 1 / 60);
      return { race, car, surface: sampleTrackSurface(race.track, race.track.jumps, distance) };
    };
    const uphill = simulateSlope(uphillDistance(ramp));
    assert.ok(uphill.surface.grade > 0.05, `${kind}: teste localizado na subida física`);
    assert.ok(uphill.car.velocityX * Math.sin(uphill.car.heading)
      + uphill.car.velocityZ * Math.cos(uphill.car.heading) < -0.01,
    `${kind}: a gravidade inicia recuo sem acelerar`);

    const reverseRace = createRace(track);
    reverseRace.setVehicleContactsEnabled(false);
    const reversePoint = sampleTrackAtProgress(reverseRace.track, uphillDistance(ramp));
    const reverseCar = reverseRace.participants[0]!;
    reverseCar.x = reversePoint.x; reverseCar.z = reversePoint.z;
    reverseCar.y = sampleTrackSurface(reverseRace.track, reverseRace.track.jumps, uphillDistance(ramp)).y;
    reverseCar.heading = Math.atan2(reversePoint.tangentX, reversePoint.tangentZ) + Math.PI;
    reverseCar.velocityX = 0; reverseCar.velocityZ = 0; reverseCar.speed = 0;
    reverseCar._lastPathDistance = uphillDistance(ramp); reverseCar._distance = uphillDistance(ramp);
    const reverseHealth = reverseCar.health;
    reverseRace._integrate(reverseCar, { throttle: 0, brake: 0, steer: 0, handbrake: 0 }, 1 / 60);
    const reverseNearest = findNearestTrackPoint(reverseRace.track, reverseCar.x, reverseCar.z)!;
    const bodyForwardSpeed = reverseCar.velocityX * Math.sin(reverseCar.heading)
      + reverseCar.velocityZ * Math.cos(reverseCar.heading);
    assert.ok(reverseNearest.distance < uphillDistance(ramp),
      `${kind}: a inclinação move o carro no sentido físico da descida, mesmo orientado contra a pista`);
    assert.ok(bodyForwardSpeed > 0.01, `${kind}: a gravidade é projetada no eixo correto do veículo`);
    assert.equal(reverseCar.health, reverseHealth, `${kind}: o contato normal não causa dano`);

    const descent = downhillDistance(ramp);
    if (descent === null) continue;
    const downhill = simulateSlope(descent);
    assert.ok(downhill.surface.grade < -0.05, `${kind}: teste localizado na descida física`);
    assert.ok(downhill.car.velocityX * Math.sin(downhill.car.heading)
      + downhill.car.velocityZ * Math.cos(downhill.car.heading) > 0.01,
    `${kind}: a gravidade favorece o sentido da descida`);
  }
});

test('Rampa 03 e transições para a pista permanecem sólidas ao retornar de ré', () => {
  const track = RACE_TRACKS.find(candidate => candidate.id === 'neon-furnace')!;
  const race = createRace(track);
  race.setVehicleContactsEnabled(false);
  const ramp = race.track.jumps!.find(candidate => candidate.id === 'furnace-ramp-03')!;
  const takeoff = ramp.takeoff * race.track.totalLength;
  const startDistance = takeoff + ramp.platformLength! / 2;
  const point = sampleTrackAtProgress(race.track, startDistance);
  const car = race.participants[0]!;
  car.x = point.x; car.z = point.z;
  car.y = sampleTrackSurface(race.track, race.track.jumps, startDistance).y;
  car.heading = Math.atan2(point.tangentX, point.tangentZ) + Math.PI;
  car.velocityX = Math.sin(car.heading) * 12;
  car.velocityZ = Math.cos(car.heading) * 12;
  car.speed = 12;
  car._lastPathDistance = startDistance; car._distance = startDistance;
  const health = car.health;

  for (let frame = 0; frame < 240; frame += 1) {
    race._integrate(car, { throttle: 0, brake: 0, steer: 0, handbrake: 0 }, 1 / 60);
    const nearest = findNearestTrackPoint(race.track, car.x, car.z)!;
    car._lastPathDistance = nearest.distance;
    const surface = sampleTrackSurface(race.track, race.track.jumps, nearest.distance);
    assert.equal(surface.hasGround, true, 'o percurso inverso permanece somente sobre trechos sólidos');
    assert.equal(car.airborne, false, 'a transição de plataforma para a rampa não cria voo falso');
    assert.ok(Math.abs(car.y - surface.y) < 0.01, 'a altura física acompanha a plataforma e a pista');
  }
  assert.ok(car._lastPathDistance < takeoff - ramp.rampLength - 5,
    'o carro passou da rampa para a pista baixa no sentido contrário');
  assert.equal(car.health, health, 'retornar sobre superfícies sólidas não reduz vida');
  assert.equal(car.destroyed, false);
});

test('retornar da recepção para o vão de salto ainda permite a queda real na lava', () => {
  const track = RACE_TRACKS.find(candidate => candidate.id === 'neon-furnace')!;
  const race = createRace(track);
  race.setVehicleContactsEnabled(false);
  const ramp = race.track.jumps!.find(candidate => candidate.id === 'furnace-ramp-02')!;
  const takeoff = ramp.takeoff * race.track.totalLength;
  const startDistance = takeoff + ramp.gapLength! + 2;
  const point = sampleTrackAtProgress(race.track, startDistance);
  const car = race.participants[0]!;
  car.x = point.x; car.z = point.z;
  car.y = sampleTrackSurface(race.track, race.track.jumps, startDistance).y;
  car.heading = Math.atan2(point.tangentX, point.tangentZ) + Math.PI;
  car.velocityX = Math.sin(car.heading) * 8;
  car.velocityZ = Math.cos(car.heading) * 8;
  car.speed = 8;
  car._lastPathDistance = startDistance; car._distance = startDistance;

  for (let frame = 0; frame < 90 && !car.destroyed; frame += 1) {
    race._integrate(car, { throttle: 0, brake: 0, steer: 0, handbrake: 0 }, 1 / 60);
    const nearest = findNearestTrackPoint(race.track, car.x, car.z)!;
    car._lastPathDistance = nearest.distance;
    const surface = sampleTrackSurface(race.track, race.track.jumps, nearest.distance);
    if (!surface.hasGround) assert.ok(car.y < 1, 'a lacuna continua sem piso oculto durante a queda');
  }
  assert.equal(car.destroyed, true, 'a passagem inversa pela lava ainda aciona a destruição');
  assert.equal(car.health, 0);
  assert.equal(car.destructionSequence, 1);
  assert.ok(car._respawnPoint!.distance < takeoff, 'o respawn seguro continua antes da rampa');
});

test('Rampa 03 mantém contato com a plataforma durante uma subida lenta junto à linha azul', () => {
  const track = RACE_TRACKS.find(candidate => candidate.id === 'neon-furnace')!;
  const race = createRace(track);
  race.setVehicleContactsEnabled(false);
  const ramp = race.track.jumps!.find(candidate => candidate.id === 'furnace-ramp-03')!;
  const takeoff = ramp.takeoff * race.track.totalLength;
  const startDistance = takeoff - ramp.rampLength + 1;
  const point = sampleTrackAtProgress(race.track, startDistance);
  const car = race.participants[0]!;
  car.x = point.x; car.z = point.z;
  car.y = sampleTrackSurface(race.track, race.track.jumps, startDistance).y;
  car.heading = Math.atan2(point.tangentX, point.tangentZ);
  car.velocityX = 0; car.velocityZ = 0; car.speed = 0;
  car._lastPathDistance = startDistance; car._distance = startDistance;

  let landingDistance: number | null = null;
  for (let frame = 0; frame < 700; frame += 1) {
    race.advance(1000 / 60, { throttle: 0.15 });
    const surface = sampleTrackSurface(race.track, race.track.jumps, car._lastPathDistance);
    const distanceFromTakeoff = ((car._lastPathDistance - takeoff) % race.track.totalLength
      + race.track.totalLength) % race.track.totalLength;
    if (car.airborne && surface.ramp?.id === ramp.id && surface.hasGround)
      assert.ok(car.y >= surface.y - 0.02, 'o carro não atravessa a plataforma durante o voo baixo');
    if (landingDistance === null && (car._landingSequence ?? 0) > 0)
      landingDistance = distanceFromTakeoff;
  }
  assert.ok(landingDistance !== null && landingDistance < 6,
    'a aterrissagem física pode ocorrer antes da linha azul, no piso real da plataforma');
  assert.ok(car._lastPathDistance > takeoff + 10, 'depois do contato, o carro continua sobre a plataforma');
  assert.equal(car.destroyed, false);
});

test('na Rampa 03, aceleração insuficiente perde embalo e faz o carro recuar sem atravessar o piso', () => {
  const track = RACE_TRACKS.find(candidate => candidate.id === 'neon-furnace')!;
  const race = createRace(track);
  race.setVehicleContactsEnabled(false);
  const ramp = race.track.jumps!.find(candidate => candidate.id === 'furnace-ramp-03')!;
  const startDistance = ramp.takeoff * race.track.totalLength - ramp.rampLength / 2;
  const point = sampleTrackAtProgress(race.track, startDistance);
  const car = race.participants[0]!;
  car.x = point.x; car.z = point.z;
  car.y = sampleTrackSurface(race.track, race.track.jumps, startDistance).y;
  car.heading = Math.atan2(point.tangentX, point.tangentZ);
  car.velocityX = Math.sin(car.heading) * 0.8;
  car.velocityZ = Math.cos(car.heading) * 0.8;
  car.speed = 0.8;
  car._lastPathDistance = startDistance; car._distance = startDistance;

  for (let frame = 0; frame < 180; frame += 1) race.advance(1000 / 60, { throttle: 0.05 });
  const surface = sampleTrackSurface(race.track, race.track.jumps, car._lastPathDistance);
  assert.ok(car._lastPathDistance < startDistance - 1,
    'a força do motor abaixo da componente da gravidade não vence a inclinação');
  assert.equal(car.airborne, false, 'o recuo permanece em contato com a rampa');
  assert.ok(Math.abs(car.y - surface.y) < 0.01, 'o carro não cai para baixo da superfície física');
});

test('ultrapassar a recepção original mantém o voo físico sem dano nem encaixe', () => {
  const race = createRace(RACE_TRACKS.find(candidate => candidate.id === 'neon-furnace')!);
  race.setVehicleContactsEnabled(false);
  const ramp = race.track.jumps!.find(candidate => candidate.kind === 'jump')!;
  const beyondOriginalReceiver = ramp.landingEnd * race.track.totalLength + 1;
  const point = sampleTrackAtProgress(race.track, beyondOriginalReceiver);
  const car = race.participants[0]!;
  const health = car.health;
  car.x = point.x; car.z = point.z; car.y = 10;
  car.heading = Math.atan2(point.tangentX, point.tangentZ);
  car.airborne = true; car.verticalVelocity = -3; car._activeJumpId = ramp.id;
  car._airborneElapsed = 1; car._lastPathDistance = beyondOriginalReceiver;
  race._integrate(car, { throttle: 0, brake: 0, steer: 0, handbrake: 0 }, 1 / 60);
  assert.equal(car.airborne, true, 'ultrapassar a recepção original não encerra nem encaixa o voo');
  assert.ok(car.y < 10, 'a trajetória continua sob gravidade após a recepção original');
  assert.equal(car.health, health, 'voar além da recepção não causa dano');
  assert.equal(car.destroyed, false, 'continuar voando não destrói o carro');
});

test('saltos do Camaro usam as velocidades físicas 110/165/220 km/h', () => {
  const track = RACE_TRACKS.find(candidate => candidate.id === 'neon-furnace')!;
  const vehicle = getVehicleById('volt-vector');
  assert.ok(vehicle);
  const landings: { speedKmh: number; distanceAfterTakeoff: number; height: number; health: number }[] = [];
  for (const [speedPoints, speedKmh] of [[0, 110], [50, 165], [100, 220]] as const) {
    const race: RaceSimulation = new RaceSimulation({ track, player: { id: 'camaro-jump', name: 'Camaro' },
      playerVehicle: vehicle, vehicleStats: { ...vehicle.stats, speed: speedPoints, acceleration: 100 },
      botPilots: [1, 2, 3].map(index => ({ id: `jump-bot-${index}`, name: `Bot ${index}` })) }).start();
    race.setVehicleContactsEnabled(false);
    const ramp = race.track.jumps!.find(candidate => candidate.id === 'furnace-ramp-02')!;
    const takeoff = ramp.takeoff * race.track.totalLength;
    const startDistance = takeoff - ramp.rampLength - 2;
    const point = sampleTrackAtProgress(race.track, startDistance);
    const car: RaceParticipant = race.participants[0]!;
    const startingHealth = car.health;
    car.x = point.x; car.z = point.z;
    car.y = sampleTrackSurface(race.track, race.track.jumps, startDistance).y;
    car.heading = Math.atan2(point.tangentX, point.tangentZ);
    car._lastPathDistance = startDistance; car._distance = startDistance;
    car.speed = speedKmh / 4;
    assert.ok(car.speed <= car.vehicle.maxSpeed + 1e-8, 'velocidade da rampa respeita o limite físico');
    car.velocityX = Math.sin(car.heading) * car.speed;
    car.velocityZ = Math.cos(car.heading) * car.speed;
    let crossedGapWhileAirborne = false;
    for (let frame = 0; frame < 300 && (car._landingSequence ?? 0) === 0 && !car.destroyed; frame += 1) {
      race.advance(1000 / 60, {});
      crossedGapWhileAirborne ||= car.airborne
        && !sampleTrackSurface(race.track, race.track.jumps, car._lastPathDistance).hasGround;
    }
    assert.equal(car._landingSequence, 1, `${speedKmh} km/h pousa em uma superfície interceptada`);
    assert.equal(car.destroyed, false, `${speedKmh} km/h não cai no vão`);
    assert.equal(car.health, startingHealth, `${speedKmh} km/h não sofre dano normal de salto/pouso`);
    assert.equal(crossedGapWhileAirborne, true, `${speedKmh} km/h cruza o vão em voo`);
    const distanceAfterTakeoff = race.track.jumps!.length
      ? ((car._lastPathDistance - takeoff) % race.track.totalLength + race.track.totalLength) % race.track.totalLength
      : 0;
    assert.ok(distanceAfterTakeoff > ramp.gapLength!, 'o contato ocorreu depois do vão, sem recepção obrigatória');
    landings.push({ speedKmh, distanceAfterTakeoff, height: car.y, health: car.health });
  }
  assert.ok(landings[0]!.distanceAfterTakeoff < landings[1]!.distanceAfterTakeoff
    && landings[1]!.distanceAfterTakeoff < landings[2]!.distanceAfterTakeoff,
  `maior velocidade percorre mais distância antes do pouso: ${JSON.stringify(landings)}`);
  assert.ok(landings[2]!.distanceAfterTakeoff > landings[0]!.distanceAfterTakeoff + 15,
    'a Velocidade investida aumenta a distância física do salto');
});

test('a trajetória também pousa sobre a face descendente de uma plataforma', () => {
  const track = RACE_TRACKS.find(candidate => candidate.id === 'neon-furnace')!;
  const vehicle = getVehicleById('volt-vector');
  assert.ok(vehicle);
  const race = new RaceSimulation({ track, player: { id: 'descending-platform', name: 'Camaro' },
    playerVehicle: vehicle, vehicleStats: { ...vehicle.stats, speed: 100, acceleration: 100 },
    botPilots: [1, 2, 3].map(index => ({ id: `descent-bot-${index}`, name: `Bot ${index}` })) }).start();
  race.setVehicleContactsEnabled(false);
  const ramp = race.track.jumps!.find(candidate => candidate.kind === 'platform')!;
  const takeoff = ramp.takeoff * race.track.totalLength;
  const startDistance = takeoff - ramp.rampLength - 2;
  const point = sampleTrackAtProgress(race.track, startDistance);
  const car = race.participants[0]!;
  const startingHealth = car.health;
  car.x = point.x; car.z = point.z;
  car.y = sampleTrackSurface(race.track, race.track.jumps, startDistance).y;
  car.heading = Math.atan2(point.tangentX, point.tangentZ);
  car._lastPathDistance = startDistance; car._distance = startDistance;
  car.speed = 123.8 / 4;
  car.velocityX = Math.sin(car.heading) * car.speed;
  car.velocityZ = Math.cos(car.heading) * car.speed;
  for (let frame = 0; frame < 180 && !car._landingSequence && !car.destroyed; frame += 1)
    race.advance(1000 / 60, {});
  assert.equal(car._landingSequence, 1, 'detectou o primeiro contato descendente');
  assert.ok((car._landingSurfaceSlope ?? 0) < 0, 'o pouso preserva a inclinação descendente da superfície');
  assert.equal(car.destroyed, false);
  assert.equal(car.health, startingHealth, 'pouso na descida não causa dano');
});

test('a queda em um vão sem lava continua acionando explosão e respawn', () => {
  const source = RACE_TRACKS.find(candidate => candidate.id === 'neon-furnace')!;
  const track: RaceTrack = { ...source, jumps: source.jumps!.map(ramp =>
    ramp.id === 'furnace-ramp-02' ? { ...ramp, lavaGap: false } : ramp) };
  const race = createRace(track);
  race.setVehicleContactsEnabled(false);
  const ramp = race.track.jumps!.find(candidate => candidate.id === 'furnace-ramp-02')!;
  const dropDistance = ramp.takeoff * race.track.totalLength + ramp.gapLength! / 2;
  const point = sampleTrackAtProgress(race.track, dropDistance);
  const car = race.participants[0]!;
  car.x = point.x; car.z = point.z;
  car.y = sampleTrackSurface(race.track, race.track.jumps, dropDistance).y;
  car.heading = Math.atan2(point.tangentX, point.tangentZ);
  car._lastPathDistance = dropDistance; car._distance = dropDistance;
  for (let frame = 0; frame < 90 && !car.destroyed; frame += 1)
    race._integrate(car, { throttle: 0, brake: 0, steer: 0, handbrake: 0 }, 1 / 60);
  assert.equal(car.destroyed, true, 'o vão sem piso também é um abismo físico');
  assert.equal(car.health, 0);
  assert.equal(car.destructionSequence, 1);
});

test('Tipo 1 produz um salto curto natural na crista arredondada', () => {
  const track = RACE_TRACKS.find(candidate => candidate.id === 'neon-furnace')!;
  const race = createRace(track);
  race.setVehicleContactsEnabled(false);
  const ramp = race.track.jumps!.find(candidate => candidate.kind === 'bump')!;
  const takeoff = ramp.takeoff * race.track.totalLength;
  const startDistance = takeoff - 1.5;
  const point = sampleTrackAtProgress(race.track, startDistance);
  const car = race.participants[0]!;
  car.x = point.x; car.z = point.z; car.y = sampleTrackSurface(race.track, race.track.jumps, startDistance).y;
  car.heading = Math.atan2(point.tangentX, point.tangentZ);
  car.velocityX = Math.sin(car.heading) * 28; car.velocityZ = Math.cos(car.heading) * 28; car.speed = 28;
  car._lastPathDistance = startDistance; car._distance = startDistance;
  let airborneFrames = 0;
  for (let frame = 0; frame < 45; frame += 1) {
    race.advance(1000 / 60, { throttle: 0 });
    if (car.airborne) airborneFrames += 1;
  }
  assert.ok(airborneFrames > 0 && airborneFrames < 40, 'salto curto e perceptível, sem voo prolongado');
  assert.ok((car._landingSequence ?? 0) > 0, 'retomou contato depois do salto');
});

test('Neon Furnace completa quatro voltas com piloto e três bots sem perder corredores', () => {
  const track = RACE_TRACKS.find(candidate => candidate.id === 'neon-furnace')!;
  const race = new RaceSimulation({ track,
    player: { id: 'furnace-player', name: 'Piloto' },
    botPilots: [1, 2, 3].map(index => ({ id: `furnace-bot-${index}`, name: `Bot ${index}` })),
    raceSeed: 'fixed-eight-ramp-validation' }).start();
  const player = race.participants[0]!;
  for (let step = 0; step < 60 * 360 && !race.participants.every(car => car.finished); step += 1) {
    race._step(1 / 60, race.getBotControls(player, 1 / 60));
  }
  assert.equal(race.participants.length, 4);
  assert.ok(race.participants.every(car => car.finished && car.lapsCompleted === track.laps),
    `piloto e bots devem completar a volta: ${JSON.stringify(race.participants.map(car => ({
      id: car.id, finished: car.finished, laps: car.lapsCompleted, destroyed: car.destroyed,
    })))}`);
  assert.ok(race.participants.every(car => !car.destroyed && car.health > 0));
  for (const car of race.participants) {
    const nearest = findNearestTrackPoint(race.track, car.x, car.z);
    assert.ok(nearest && Math.abs(nearest.lateral) <= track.width / 2 + 0.1,
      `${car.name}: terminou em posição recuperável, dentro do traçado`);
  }
});

test('compressão e rebote da aterrissagem respondem ao impacto e à inclinação, com amortecimento', () => {
  const jump = createRace(rampTracks[0]!).track.jumps!.find(candidate => candidate.kind === 'platform')!;
  const collectCompression = (impact: number, slope: number) => {
    const presentation = new ArcadeJumpPresentation();
    const offsets: number[] = [];
    for (let frame = 0; frame < 60; frame += 1) {
      const pose = presentation.update({ airborne: false, airborneElapsed: 0, verticalVelocity: 0,
        speed: 24, trackDistance: jump.landingStart * 540, totalTrackLength: 540, jump,
        deltaSeconds: 1 / 60, physicalSurface: true, surfacePitchRadians: slope,
        landingSequence: 1, landingImpactSpeed: impact, landingSurfaceSlope: slope });
      offsets.push(pose.suspensionOffset);
    }
    return offsets;
  };
  const gentle = collectCompression(2, -0.04);
  const hardOnSlope = collectCompression(7, -0.16);
  assert.ok(Math.min(...hardOnSlope) < Math.min(...gentle), 'impacto e inclinação aumentam a compressão');
  assert.ok(Math.min(...hardOnSlope) > -0.15, 'compressão permanece limitada');
  assert.ok(Math.max(...hardOnSlope) < 0.08, 'rebote é pequeno e amortecido');
  assert.ok(Math.abs(hardOnSlope.at(-1)!) < 0.003, 'a suspensão estabiliza após o pouso');
});
