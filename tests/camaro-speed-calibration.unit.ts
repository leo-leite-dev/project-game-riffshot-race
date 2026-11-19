import test from 'node:test';
import assert from 'node:assert/strict';
import { getVehicleById } from '../src/data/vehicles.ts';
import { RACE_TRACKS } from '../src/data/raceTracks.ts';
import { deriveHandlingStats, findNearestTrackPoint, RaceSimulation, sampleTrackAtProgress } from '../src/race/RaceSimulation.ts';
import type { RaceParticipant } from '../src/race/RaceSimulation.ts';
import { sampleTrackSurface } from '../src/race/trackMath.ts';

const BOTS = [0, 1, 2].map(index => ({
  id: `calibration-bot-${index}`, name: `Bot ${index}`,
  stats: { speed: 5, acceleration: 5, handling: 5, endurance: 5, aggression: 5 },
}));
const NEUTRAL_PILOT = {
  id: 'calibration-player', name: 'Piloto de teste',
  stats: { speed: 5, acceleration: 5, handling: 5, endurance: 5, aggression: 5 },
};

function makeFlatCalibrationRace(speedPoints: number, accelerationPoints: number) {
  const source = RACE_TRACKS[0]!;
  const track = {
    ...source,
    width: 10_000,
    laps: 1_000,
    waypoints: source.waypoints.map(point => ({ ...point, y: 0 })),
    jumps: [],
    rampRegions: [],
    rampCount: 0,
  };
  const vehicle = getVehicleById('volt-vector');
  assert.ok(vehicle);
  const race = new RaceSimulation({
    track,
    laps: 1_000,
    player: NEUTRAL_PILOT,
    playerVehicle: vehicle,
    vehicleStats: { ...vehicle.stats, speed: speedPoints, acceleration: accelerationPoints },
    botPilots: BOTS,
  }).start();
  race.setVehicleContactsEnabled(false);
  return race;
}

function accelerateToLimit(speedPoints: number, accelerationPoints: number) {
  const race = makeFlatCalibrationRace(speedPoints, accelerationPoints);
  const car = race.participants[0]!;
  const limit = car.vehicle.maxSpeed;
  let frames = 0;
  while (car.speed < limit - 1e-5 && frames < 60 * 90) {
    race.advance(1000 / 60, { throttle: 1 });
    frames += 1;
  }
  return { race, car, seconds: frames / 60, reached: car.speed >= limit - 1e-5 };
}

test('Camaro usa velocidade física de 110–220 km/h e não altera outros veículos', () => {
  const expectedPhysicalKmh = [110, 165, 220];
  const points = [36, 68, 100];
  for (let index = 0; index < points.length; index += 1) {
    const handling = deriveHandlingStats({ speed: points[index], acceleration: 50 }, {}, {}, undefined, 'volt-vector');
    assert.equal(handling.maxSpeed * 4, expectedPhysicalKmh[index]);
    assert.equal('speedometerMaxKmh' in handling, false, 'não existe teto fictício de HUD');
  }

  const blaze = getVehicleById('rift-blaze');
  const bastion = getVehicleById('iron-bastion');
  assert.ok(blaze && bastion);
  assert.deepEqual(deriveHandlingStats(blaze.stats, {}, blaze.ability, undefined, blaze.id),
    deriveHandlingStats(blaze.stats, {}, blaze.ability));
  assert.deepEqual(deriveHandlingStats(bastion.stats, {}, bastion.ability, undefined, bastion.id),
    deriveHandlingStats(bastion.stats, {}, bastion.ability));
});

test('as nove combinações do Camaro atingem o limite físico e Aceleração é independente de Velocidade', () => {
  const measurements: { speed: number; acceleration: number; physicalCap: number; seconds: number }[] = [];
  for (const speed of [36, 68, 100]) for (const acceleration of [0, 50, 100]) {
    const result = accelerateToLimit(speed, acceleration);
    assert.equal(result.reached, true, `limite alcançado com velocidade ${speed} / aceleração ${acceleration}`);
    assert.ok(result.seconds > 0.5, 'o carro não atinge o limite instantaneamente');
    assert.ok(Math.abs(result.car.speed - result.car.vehicle.maxSpeed) < 1e-4);
    measurements.push({ speed, acceleration, physicalCap: result.car.vehicle.maxSpeed * 4,
      seconds: Number(result.seconds.toFixed(2)) });
  }
  const maxSpeedTargets = [0, 50, 100].map(acceleration =>
    measurements.find(item => item.speed === 100 && item.acceleration === acceleration)!.seconds);
  for (const [index, target] of [7, 5.5, 4].entries())
    assert.ok(Math.abs(maxSpeedTargets[index]! - target) <= 0.03,
      `velocidade 100 / aceleração ${index * 50}: esperado ${target}s, medido ${maxSpeedTargets[index]}s`);
  for (const speed of [36, 68, 100]) {
    const times = [0, 50, 100].map(acceleration =>
      measurements.find(item => item.speed === speed && item.acceleration === acceleration)!.seconds);
    assert.ok(times[0]! > times[1]! && times[1]! > times[2]!,
      `mais pontos de aceleração reduzem o tempo para o mesmo limite (${speed} velocidade): ${times}`);
  }
  for (const acceleration of [0, 50, 100]) {
    const engineForEachSpeed = [36, 68, 100].map(speed => {
      const race = makeFlatCalibrationRace(speed, acceleration);
      return race.participants[0]!.vehicle.acceleration;
    });
    const progress = acceleration / 100;
    const expectedEngineForce = 14.8415 + 5.0655 * progress + 6.1835 * progress ** 2;
    assert.ok(engineForEachSpeed.every(force => Math.abs(force - expectedEngineForce) < 1e-12),
    'o atributo Velocidade não aumenta a força do motor');
  }
});

test('Camaro conserva embalo ao soltar o acelerador e mantém a frenagem forte e progressiva', () => {
  const race = makeFlatCalibrationRace(100, 100);
  const car = race.participants[0]!;
  const initialSpeed = car.vehicle.maxSpeed;
  car.speed = initialSpeed;
  car.velocityX = Math.sin(car.heading) * initialSpeed;
  car.velocityZ = Math.cos(car.heading) * initialSpeed;
  for (let frame = 0; frame < 60; frame += 1) race.advance(1000 / 60, {});
  const coastRatio = car.speed / initialSpeed;
  assert.ok(coastRatio > 0.96 && coastRatio < 1,
    `perda após 1 s sem acelerar deve ser suave: ${coastRatio}`);

  let brakingFrames = 0;
  while (car.speed > 0.1 && brakingFrames < 60 * 20) {
    race.advance(1000 / 60, { brake: 1 });
    brakingFrames += 1;
  }
  assert.ok(car.speed <= 0.1, 'freio chega à parada sem impulso inverso');
  assert.ok(brakingFrames / 60 > 1 && brakingFrames / 60 < 12,
    `frenagem é observável sem ser instantânea: ${brakingFrames / 60}s`);
});

test('o Camaro calibrado mantém a trajetória equivalente em simulação de 30/60/120 Hz', () => {
  const outcomes = [30, 60, 120].map(hz => {
    const race = makeFlatCalibrationRace(100, 100);
    const car = race.participants[0]!;
    for (let frame = 0; frame < hz * 11; frame += 1)
      race.advance(1000 / hz, { throttle: 1, steer: 0.08 });
    return { speed: car.speed, x: car.x, z: car.z, heading: car.heading };
  });
  for (const outcome of outcomes) {
    assert.ok(Number.isFinite(outcome.speed) && outcome.speed <= 55 * 1.061,
      'o teto permite somente o bônus arcade de drift já existente');
    assert.ok(Number.isFinite(outcome.x) && Number.isFinite(outcome.z) && Number.isFinite(outcome.heading));
    assert.ok(Math.abs(outcome.speed - outcomes[1]!.speed) < 1e-5);
    assert.ok(Math.hypot(outcome.x - outcomes[1]!.x, outcome.z - outcomes[1]!.z) < 0.02);
    assert.ok(Math.abs(outcome.heading - outcomes[1]!.heading) < 1e-7);
  }
});

test('contato do Camaro a 220 km/h físicos preserva as colisões', () => {
  const vehicle = getVehicleById('volt-vector');
  assert.ok(vehicle);
  const race = new RaceSimulation({ track: RACE_TRACKS[0], player: NEUTRAL_PILOT, playerVehicle: vehicle,
    vehicleStats: { ...vehicle.stats, speed: 100, acceleration: 100 },
    botPilots: [{ ...BOTS[0]!, vehicleId: 'rift-blaze' }, BOTS[1]!, BOTS[2]!] });
  const [player, rival] = race.participants;
  assert.ok(player && rival);
  race.participants.slice(2).forEach((car, index) => { car.x = 1000 + index * 20; car.z = 1000; });
  player.x = 0; player.z = 0; rival.x = 3.5; rival.z = 0;
  const physicalMaximum = player.vehicle.maxSpeed;
  player.velocityX = physicalMaximum; player.velocityZ = 0; player.speed = physicalMaximum;
  rival.velocityX = 0; rival.velocityZ = 0; rival.speed = 0;
  const playerHealth = player.health;
  race._resolveVehicleContacts();
  assert.ok(player.health < playerHealth, 'o impacto em alta velocidade continua causando dano');
  assert.ok([player, rival].every(car => [car.x, car.z, car.speed, car.health].every(Number.isFinite)));
  assert.ok(player.speed < physicalMaximum, 'a colisão dissipa velocidade sem gerar valor inválido');
});

test('o Camaro em 220 km/h físicos mantém a resposta de curva finita', () => {
  const vehicle = getVehicleById('volt-vector');
  assert.ok(vehicle);
  const race = new RaceSimulation({ track: RACE_TRACKS[0], player: NEUTRAL_PILOT, playerVehicle: vehicle,
    vehicleStats: { ...vehicle.stats, speed: 100, acceleration: 100 }, botPilots: BOTS }).start();
  race.setVehicleContactsEnabled(false);
  const car = race.participants[0]!;
  const distance = 579.638;
  const point = sampleTrackAtProgress(race.track, distance);
  const surface = sampleTrackSurface(race.track, race.track.jumps, distance);
  car.x = point.x; car.y = surface.y; car.z = point.z;
  car.heading = Math.atan2(point.tangentX, point.tangentZ);
  car._lastPathDistance = distance; car._distance = distance;
  car.speed = car.vehicle.maxSpeed;
  car.velocityX = Math.sin(car.heading) * car.speed;
  car.velocityZ = Math.cos(car.heading) * car.speed;
  for (let frame = 0; frame < 120; frame += 1) race.advance(1000 / 60, { throttle: 1, steer: 0.15 });
  const nearest = findNearestTrackPoint(race.track, car.x, car.z);
  assert.ok(nearest && Math.abs(nearest.lateral) <= race.track.width / 2 - 1.2 + 1e-6,
    'o contato de barreira mantém o carro dentro da pista');
  assert.ok(car.health < car.maxHealth, 'o contato com a barreira continua sendo uma colisão');
  assert.ok([car.x, car.y, car.z, car.speed, car.heading, car.health].every(Number.isFinite));
});

test('o Camaro a 220 km/h físicos salta sem alterar a trajetória natural', () => {
  const vehicle = getVehicleById('volt-vector');
  assert.ok(vehicle);
  const race = new RaceSimulation({ track: RACE_TRACKS[0], player: NEUTRAL_PILOT, playerVehicle: vehicle,
    vehicleStats: { ...vehicle.stats, speed: 100, acceleration: 100 }, botPilots: BOTS }).start();
  race.setVehicleContactsEnabled(false);
  const car = race.participants[0]!;
  const ramp = race.track.jumps?.find(candidate => candidate.id === 'furnace-ramp-02');
  assert.ok(ramp);
  const takeoff = ramp.takeoff * race.track.totalLength;
  const distance = takeoff - ramp.rampLength - 2;
  const point = sampleTrackAtProgress(race.track, distance);
  car.x = point.x; car.z = point.z;
  car.y = sampleTrackSurface(race.track, race.track.jumps, distance).y;
  car.heading = Math.atan2(point.tangentX, point.tangentZ);
  car._lastPathDistance = distance; car._distance = distance;
  car.speed = car.vehicle.maxSpeed;
  car.velocityX = Math.sin(car.heading) * car.speed;
  car.velocityZ = Math.cos(car.heading) * car.speed;
  let observedTakeoff = false;
  for (let frame = 0; frame < 60; frame += 1) {
    race.advance(1000 / 60, {});
    observedTakeoff ||= car.airborne;
  }
  assert.equal(observedTakeoff, true, 'o carro perde contato pela rampa, sem gatilho visual artificial');
  assert.ok([car.x, car.y, car.z, car.speed, car.verticalVelocity].every(Number.isFinite));
  assert.equal(car.destroyed, false);
});

test('o Camaro recupera a direção com comandos após aterrissar do salto a 220 km/h', () => {
  const vehicle = getVehicleById('volt-vector');
  assert.ok(vehicle);
  const race = new RaceSimulation({ track: RACE_TRACKS[0], player: NEUTRAL_PILOT, playerVehicle: vehicle,
    vehicleStats: { ...vehicle.stats, speed: 100, acceleration: 100 }, botPilots: BOTS }).start();
  race.setVehicleContactsEnabled(false);
  const car = race.participants[0]!;
  const ramp = race.track.jumps?.find(candidate => candidate.id === 'furnace-ramp-02');
  assert.ok(ramp);
  const takeoff = ramp.takeoff * race.track.totalLength;
  const startDistance = takeoff - ramp.rampLength - 2;
  const point = sampleTrackAtProgress(race.track, startDistance);
  car.x = point.x; car.z = point.z;
  car.y = sampleTrackSurface(race.track, race.track.jumps, startDistance).y;
  car.heading = Math.atan2(point.tangentX, point.tangentZ);
  car._lastPathDistance = startDistance; car._distance = startDistance;
  car.speed = car.vehicle.maxSpeed;
  car.velocityX = Math.sin(car.heading) * car.speed;
  car.velocityZ = Math.cos(car.heading) * car.speed;
  for (let frame = 0; frame < 240 && !(car._landingSequence ?? 0); frame += 1)
    race.advance(1000 / 60, { steer: frame >= 80 ? -0.15 : 0 });
  assert.equal(car._landingSequence, 1, 'a aterrissagem ocorre naturalmente');
  const headingAfterLanding = car.heading;
  for (let frame = 0; frame < 60; frame += 1) race.advance(1000 / 60, { steer: -0.25 });
  assert.ok(Math.abs(car.heading - headingAfterLanding) > 0.25,
    'a direção responde ao comando depois do pouso');
  const nearest = findNearestTrackPoint(race.track, car.x, car.z);
  assert.ok(nearest && Math.abs(nearest.lateral) < race.track.width / 2,
    'o carro permanece em posição recuperável na pista');
  assert.equal(car.destroyed, false);
  assert.equal(car.health, car.maxHealth, 'o pouso normal não causa dano');
  assert.ok([car.x, car.y, car.z, car.speed, car.heading].every(Number.isFinite));
});

test('o Camaro calibrado pousa na rampa ao reduzir para uma velocidade intermediária', () => {
  const vehicle = getVehicleById('volt-vector');
  assert.ok(vehicle);
  for (const approachSpeed of [30]) {
    const race: RaceSimulation = new RaceSimulation({ track: RACE_TRACKS[0], player: NEUTRAL_PILOT, playerVehicle: vehicle,
      vehicleStats: { ...vehicle.stats, speed: 100, acceleration: 100 }, botPilots: BOTS }).start();
    race.setVehicleContactsEnabled(false);
    const car: RaceParticipant = race.participants[0]!;
    const ramp = race.track.jumps?.find(candidate => candidate.id === 'furnace-ramp-02');
    assert.ok(ramp);
    const takeoff = ramp.takeoff * race.track.totalLength;
    const distance = takeoff - ramp.rampLength - 2;
    const point = sampleTrackAtProgress(race.track, distance);
    car.x = point.x; car.z = point.z;
    car.y = sampleTrackSurface(race.track, race.track.jumps, distance).y;
    car.heading = Math.atan2(point.tangentX, point.tangentZ);
    car._lastPathDistance = distance; car._distance = distance;
    car.speed = approachSpeed;
    car.velocityX = Math.sin(car.heading) * approachSpeed;
    car.velocityZ = Math.cos(car.heading) * approachSpeed;
    for (let frame = 0; frame < 180 && !(car._landingSequence ?? 0); frame += 1)
      race.advance(1000 / 60, {});
    assert.equal(car._landingSequence, 1, `pouso válido a ${approachSpeed * 4} km/h`);
    assert.equal(car.destroyed, false);
    assert.equal(car.health, car.maxHealth);
  }
});
