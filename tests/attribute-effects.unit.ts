import test from 'node:test';
import assert from 'node:assert/strict';
import { CHARACTERS } from '../src/data/characters.ts';
import type { PilotAttribute } from '../src/data/characters.ts';
import { RACE_TRACKS } from '../src/data/raceTracks.ts';
import { VEHICLES } from '../src/data/vehicles.ts';
import { deriveHandlingStats, PILOT_SPECIALTY_BONUS_POINTS, RaceSimulation, sampleTrackAtProgress } from '../src/race/RaceSimulation.ts';
import { healthCapacity } from '../src/race/damageMath.ts';
import type { PilotStats } from '../src/race/RaceSimulation.ts';

const pilotKeys = ['speed', 'acceleration', 'handling', 'endurance', 'aggression'] as const;

test('pilotos: exatamente duas especialidades ativas, ratings somam 30 e não especialidades ficam neutras', () => {
  for (const pilot of CHARACTERS) {
    const specialties = pilot.specialties as readonly PilotAttribute[];
    assert.equal(specialties.length, 2, `${pilot.name} precisa ter só dois talentos ativos`);
    assert.equal(new Set(pilot.specialties).size, 2);
    assert.equal(Object.values(pilot.stats).reduce((sum, value) => sum + value, 0), 30);
    const vehicle = VEHICLES[0];
    const base = deriveHandlingStats(vehicle.stats, pilot.stats, vehicle.ability, specialties);
    const inactiveChanged = { ...pilot.stats };
    for (const key of pilotKeys) if (!specialties.includes(key)) inactiveChanged[key] = pilot.stats[key] === 1 ? 10 : 1;
    assert.deepEqual(deriveHandlingStats(vehicle.stats, inactiveChanged, vehicle.ability, specialties), base,
      `${pilot.name}: ratings sem talento não devem afetar a física`);
    const race = new RaceSimulation({ track: RACE_TRACKS[0], player: pilot,
      playerVehicle: vehicle, vehicleStats: vehicle.stats,
      botPilots: [pilot, pilot, pilot] });
    assert.deepEqual(race.participants[0].specialties, specialties);
    assert.deepEqual(race.participants[0].vehicle, base, `${pilot.name}: as especialidades devem chegar à física`);
  }
});

test('cada rating especializado possui saída física identificável', () => {
  const vehicle = VEHICLES[0];
  const low = (key: typeof pilotKeys[number]) => deriveHandlingStats(vehicle.stats, { [key]: 1 } as PilotStats,
    vehicle.ability, [key]);
  const high = (key: typeof pilotKeys[number]) => deriveHandlingStats(vehicle.stats, { [key]: 10 } as PilotStats,
    vehicle.ability, [key]);
  assert.ok(high('speed').maxSpeed > low('speed').maxSpeed);
  assert.ok(high('acceleration').acceleration > low('acceleration').acceleration);
  assert.ok(high('handling').steering > low('handling').steering);
  assert.ok(high('endurance').collisionDamageMultiplier < low('endurance').collisionDamageMultiplier);
  assert.ok(high('aggression').collisionShove > low('aggression').collisionShove);
  assert.equal(PILOT_SPECIALTY_BONUS_POINTS, 1);
  assert.ok(high('speed').maxSpeed - low('speed').maxSpeed < 0.5);
  assert.ok(high('acceleration').acceleration - low('acceleration').acceleration < 0.3);
  assert.ok(high('handling').steering - low('handling').steering < 0.02);
  assert.ok(high('endurance').collisionDamageMultiplier - low('endurance').collisionDamageMultiplier < 0.02);
  assert.ok(high('aggression').collisionShove - low('aggression').collisionShove < 0.02);
});

test('atributos do catálogo: velocidade, aceleração, controle, pneus, suspensão e armor têm efeitos separados', () => {
  const base = { speed: 60, acceleration: 60, control: 60, tires: 60, suspension: 50, armor: 60 };
  const derive = (patch: Partial<typeof base>) => deriveHandlingStats({ ...base, ...patch });
  const neutral = derive({});
  const speed = derive({ speed: 100 }), acceleration = derive({ acceleration: 100 });
  const control = derive({ control: 100 }), tires = derive({ tires: 100 });
  const softSuspension = derive({ suspension: 0 }), stiffSuspension = derive({ suspension: 100 });
  assert.ok(speed.maxSpeed > neutral.maxSpeed);
  assert.equal(speed.acceleration, neutral.acceleration);
  assert.ok(acceleration.acceleration > neutral.acceleration);
  assert.equal(acceleration.maxSpeed, neutral.maxSpeed);
  assert.ok(control.steering > neutral.steering);
  assert.equal(control.grip, neutral.grip);
  assert.ok(tires.grip > neutral.grip);
  assert.equal(tires.steering, neutral.steering);
  assert.ok(stiffSuspension.impactResistance > softSuspension.impactResistance);
  assert.ok(stiffSuspension.wallSpeedRetention > softSuspension.wallSpeedRetention);
  assert.equal(healthCapacity(100).healthOrbs > healthCapacity(20).healthOrbs, true);
  for (const car of VEHICLES) {
    assert.ok(Number.isFinite(car.stats.tires) && Number.isFinite(car.stats.suspension), `${car.name} precisa de pneus/suspensão`);
  }
});

test('pneus mudam a correção lateral real sem substituir o rating de direção do controle', () => {
  const turn = (tires: number) => {
    const vehicle = { ...VEHICLES[0], stats: { ...VEHICLES[0].stats, speed: 76, acceleration: 84,
      control: 72, tires, suspension: 50 } };
    const sim = new RaceSimulation({ track: { ...RACE_TRACKS[0], width: 1000 }, player: {
      id: 'player', name: 'Player', stats: { speed: 5, acceleration: 5, handling: 5, endurance: 5, aggression: 5 },
    }, playerVehicle: vehicle, vehicleStats: vehicle.stats, botPilots: [1, 2, 3].map(i => ({ id: `b${i}`, name: `B${i}` })) });
    const car = sim.participants[0];
    Object.assign(car, { x: 0, z: 0, heading: 0, velocityX: 20, velocityZ: 15, speed: 25 });
    sim._integrate(car, { throttle: 0, brake: 0, steer: 0, handbrake: 0 }, 1 / 60);
    return { car, lateralRemaining: Math.abs(car.velocityX), beforeGrip: car.vehicle.grip, beforeSteering: car.vehicle.steering };
  };
  const soft = turn(20), sticky = turn(100);
  assert.ok(sticky.beforeGrip > soft.beforeGrip);
  assert.equal(sticky.beforeSteering, soft.beforeSteering);
  assert.ok(sticky.lateralRemaining < soft.lateralRemaining, 'pneu aderente reduz o deslize medido no mesmo passo');
});

test('bots recebem exatamente os mesmos dados físicos do catálogo que o jogador no mesmo modelo', () => {
  for (const vehicle of VEHICLES) {
    const neutralPilot = { speed: 5, acceleration: 5, handling: 5, endurance: 5, aggression: 5 };
    const sim = new RaceSimulation({ track: RACE_TRACKS[0], player: { id: 'player', name: 'Player', stats: neutralPilot },
      playerVehicle: vehicle, vehicleStats: vehicle.stats,
      botPilots: [1, 2, 3].map(index => ({ id: `bot-${index}`, name: `Bot ${index}`,
        vehicleId: vehicle.id, vehicleStats: vehicle.stats, stats: neutralPilot })) });
    for (const bot of sim.participants.slice(1)) {
      assert.equal(bot.vehicleId, vehicle.id);
      assert.deepEqual(bot.vehicle, sim.participants[0].vehicle, `${vehicle.name}: BOT deve compartilhar atributos do PLAYER`);
      assert.equal(bot.maxHealth, sim.participants[0].maxHealth);
    }
  }
});

test('agressividade aplica mais impulso ao adversário; suspensão reduz perda de velocidade sem mexer no dano', () => {
  function collide(aggression: number, suspension: number) {
    const car = { ...VEHICLES[0], stats: { ...VEHICLES[0].stats, suspension } };
    const pilots = [
      { id: 'attacker', name: 'Atacante', stats: { speed: 5, acceleration: 5, handling: 5, endurance: 5, aggression } },
      { id: 'target', name: 'Alvo', vehicleId: car.id, vehicleStats: car.stats,
        stats: { speed: 5, acceleration: 5, handling: 5, endurance: 5, aggression: 5 } },
    ];
    const sim = new RaceSimulation({ track: RACE_TRACKS[0], player: pilots[0]!, playerVehicle: car,
      vehicleStats: car.stats, botPilots: [pilots[1]!, ...[1, 2].map(i => ({ id: `away${i}`, name: 'Away' }))] });
    const [a, b, ...away] = sim.participants;
    away.forEach((entry, index) => { entry.x = 1000 + index * 20; entry.z = 1000; });
    Object.assign(a, { x: 0, z: 0, velocityX: 5, velocityZ: 0, speed: 5 });
    Object.assign(b, { x: 3, z: 0, velocityX: -5, velocityZ: 0, speed: 5 });
    const beforeTarget = b.velocityX;
    const beforeHealth = b.health;
    sim._resolveVehicleContacts();
    return { targetImpulse: b.velocityX - beforeTarget, healthLoss: beforeHealth - b.health };
  }
  assert.ok(collide(10, 50).targetImpulse > collide(1, 50).targetImpulse);
  assert.ok(Math.abs(collide(5, 100).targetImpulse) < Math.abs(collide(5, 0).targetImpulse));
  assert.equal(collide(5, 100).healthLoss, collide(5, 0).healthLoss, 'suspensão altera o impacto, não o dano HP');
});

test('suspensão alta conserva mais velocidade na batida de parede sem alterar dano ou progresso', () => {
  function wall(suspension: number) {
    const vehicle = { ...VEHICLES[0], stats: { ...VEHICLES[0].stats, suspension } };
    const sim = new RaceSimulation({ track: RACE_TRACKS[0], player: { id: 'player', name: 'Player' },
      playerVehicle: vehicle, vehicleStats: vehicle.stats,
      botPilots: [1, 2, 3].map(i => ({ id: `b${i}`, name: `B${i}` })) });
    const car = sim.participants[0], center = sampleTrackAtProgress(sim.track, sim.track.totalLength * 0.12);
    const edge = sim.track.width / 2 - 1.2, nx = -center.tangentZ, nz = center.tangentX;
    Object.assign(car, { x: center.x + nx * (edge + 0.2), z: center.z + nz * (edge + 0.2),
      heading: Math.atan2(center.tangentX, center.tangentZ),
      velocityX: center.tangentX * 12 + nx * 5, velocityZ: center.tangentZ * 12 + nz * 5 });
    car.speed = Math.hypot(car.velocityX, car.velocityZ);
    const health = car.health;
    sim._integrate(car, { throttle: 0, brake: 0, steer: 0, handbrake: 0 }, 1 / 60);
    return { speed: car.speed, damage: health - car.health, wallRetention: car.vehicle.wallSpeedRetention };
  }
  const soft = wall(0), supported = wall(100);
  assert.ok(supported.wallRetention > soft.wallRetention);
  assert.ok(supported.speed > soft.speed);
  assert.equal(supported.damage, soft.damage, 'suspensão absorve velocidade, armor/endurance regem dano separadamente');
});
