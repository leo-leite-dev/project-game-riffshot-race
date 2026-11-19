import { VEHICLE, VEHICLES } from '../data/vehicles.ts';
import type { RaceTrack, RaceControls, RaceParticipant } from '../race/RaceSimulation.ts';
import { RaceSimulation } from '../race/RaceSimulation.ts';
import { findNearestTrackPoint } from '../race/trackMath.ts';

export const ARCADE_LAB_STEP_SECONDS = 1 / 60;
export const ARCADE_LAB_TRACK: RaceTrack = Object.freeze({
  id: 'local-arcade-lab',
  name: 'PISTA EXPERIMENTAL',
  description: 'Circuito local de aceleração, curvas, rampa, salto e aterrissagem.',
  width: 18,
  laps: 1,
  waypoints: Object.freeze([
    { x: 0, z: 0, y: 0 }, { x: 0, z: 45, y: 0 }, { x: 5, z: 85, y: 0 },
    { x: 25, z: 105, y: 0 }, { x: 65, z: 105, y: 0 }, { x: 95, z: 85, y: 0 },
    { x: 105, z: 45, y: 0 }, { x: 100, z: 10, y: 0 }, { x: 75, z: -10, y: 0 },
    { x: 35, z: -10, y: 0 }, { x: 5, z: -5, y: 0 },
  ]),
  jumps: Object.freeze([
    Object.freeze({ id: 'arcade-ramp-a', kind: 'jump' as const, takeoff: 0.07, landingStart: 0.11, landingEnd: 0.17,
      launchAngleDegrees: 18, minimumSpeed: 9, maximumVerticalSpeed: 8,
      rampLength: 10, rampHeight: 1.5, receiverLength: 10 }),
  ]),
  startGrid: Object.freeze([{ lane: 0 }, { lane: -2 }, { lane: 2 }, { lane: 4 }]),
});

const LAB_BOTS = Object.freeze([
  { id: 'lab-bot-a', name: 'BOT DE TESTE A', vehicleId: VEHICLES[1]!.id },
  { id: 'lab-bot-b', name: 'BOT DE TESTE B', vehicleId: VEHICLES[2]!.id },
  { id: 'lab-bot-c', name: 'BOT DE TESTE C', vehicleId: VEHICLES[3]!.id },
]);

export interface ArcadeLabState {
  car: RaceParticipant;
  timeSeconds: number;
  takeoffs: number;
  landings: number;
  droppedSeconds: number;
}

/** Usa a integração real da corrida; nenhum backend Rapier ou física planar paralela. */
export class ArcadeVehicleLab {
  readonly trackDefinition: RaceTrack;
  readonly race: RaceSimulation;
  readonly car: RaceParticipant;
  accumulator = 0;
  timeSeconds = 0;
  takeoffs = 0;
  landings = 0;
  droppedSeconds = 0;

  constructor(track: RaceTrack = ARCADE_LAB_TRACK) {
    this.trackDefinition = track;
    this.race = new RaceSimulation({
      track,
      player: { id: 'lab-player', name: 'PILOTO', vehicleId: VEHICLE.id },
      playerVehicle: VEHICLE,
      vehicleStats: VEHICLE.stats,
      botPilots: LAB_BOTS.map(bot => ({ ...bot, stats: { speed: 5, acceleration: 5, handling: 5 } })),
      diagnostics: true,
    });
    this.car = this.race.participants[0]!;
    this.car.x = 0;
    this.car.z = -3;
    this.car.heading = 0;
    this.car._lastPathDistance = findNearestTrackPoint(this.race.track, this.car.x, this.car.z)?.distance ?? 0;
    this.car._distance = this.car._lastPathDistance;
    this.car.y = 0;
  }

  advance(deltaSeconds: number, controls: RaceControls): number {
    const frame = Math.max(0, Math.min(Number(deltaSeconds) || 0, 0.1));
    this.accumulator += frame;
    let steps = 0;
    while (this.accumulator >= ARCADE_LAB_STEP_SECONDS && steps < 6) {
      this.step(controls);
      this.accumulator -= ARCADE_LAB_STEP_SECONDS;
      steps += 1;
    }
    if (this.accumulator >= ARCADE_LAB_STEP_SECONDS) {
      const remainder = this.accumulator % ARCADE_LAB_STEP_SECONDS;
      this.droppedSeconds += this.accumulator - remainder;
      this.accumulator = remainder;
    }
    return this.accumulator / ARCADE_LAB_STEP_SECONDS;
  }

  step(controls: RaceControls): void {
    const wasAirborne = this.car.airborne;
    this.race._integrate(this.car, {
      throttle: clamp(controls.throttle ?? 0, -1, 1),
      brake: clamp(controls.brake ?? 0, 0, 1),
      steer: clamp(controls.steer ?? 0, -1, 1),
      handbrake: clamp(controls.handbrake ?? 0, 0, 1),
      nitro: false,
    }, ARCADE_LAB_STEP_SECONDS);
    const nearest = findNearestTrackPoint(this.race.track, this.car.x, this.car.z);
    if (nearest) {
      this.car._lastPathDistance = nearest.distance;
      this.car._distance = nearest.distance;
    }
    if (!wasAirborne && this.car.airborne) this.takeoffs += 1;
    if (wasAirborne && !this.car.airborne) this.landings += 1;
    this.timeSeconds += ARCADE_LAB_STEP_SECONDS;
  }

  snapshot(): ArcadeLabState {
    return { car: this.car, timeSeconds: this.timeSeconds, takeoffs: this.takeoffs,
      landings: this.landings, droppedSeconds: this.droppedSeconds };
  }

  reset(): void {
    const fresh = new ArcadeVehicleLab(this.trackDefinition);
    Object.assign(this.car, fresh.car);
    this.accumulator = 0;
    this.timeSeconds = 0;
    this.takeoffs = 0;
    this.landings = 0;
    this.droppedSeconds = 0;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
