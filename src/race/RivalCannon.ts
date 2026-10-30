import { findNearestTrackPoint } from './trackMath.ts';
import type { SampledTrack } from './trackMath.ts';

/** Widowmaker roof barrel, reviewed in the normalized race model (scale 1.3).
 * Includes the presentation's 0.08 ground offset; +Z is the fixed firing axis. */
export const CANNON_MOUNT = Object.freeze({ x: 0, y: 1.23, z: 0.32 });
export const CANNON_CONFIG = Object.freeze({
  damage: 20, maxAmmo: 5, poolSize: 12, eventLimit: 64,
  projectileSpeed: 72, lifetime: 1.25, maxRange: 90,
  normalCooldown: 2.4, hardCooldown: 0.8,
});

/** No renderer, vehicle model, pilot stats or simulation-private fields required. */
export interface CannonCar {
  id: string;
  isPlayer?: boolean;
  aiProfile?: string;
  x: number; y: number; z: number; heading: number;
  velocityX: number; velocityZ: number; speed: number;
  health: number; maxHealth: number;
  destroyed: boolean; finished: boolean; respawnProtection: number;
  /** Must be the simulation's validated lap counter, never geometric/raw progress. */
  lapsCompleted: number;
  /** Optional start-of-step position; otherwise the last step's snapshot is used. */
  previousX?: number; previousY?: number; previousZ?: number;
  /** Supply when available so a respawn teleport is not swept as normal movement. */
  respawnSequence?: number;
}

export interface CannonProjectile {
  readonly slot: number;
  id: number; active: boolean; ownerId: string;
  x: number; y: number; z: number;
  previousX: number; previousY: number; previousZ: number;
  dirX: number; dirZ: number; speed: number;
  age: number; distance: number; spawnedAt: number;
}

export interface CannonEvent {
  readonly id: number;
  readonly projectileId: number;
  readonly kind: 'shot' | 'hit' | 'expire';
  readonly x: number; readonly y: number; readonly z: number;
  readonly dirX: number; readonly dirZ: number;
  readonly ownerId: string;
  readonly targetId?: string;
  readonly time: number;
}

/** Caller applies exactly raw damage (no pilot reduction) and its own impulse. */
export type CannonHitCallback<T extends CannonCar = CannonCar> =
  (car: T, damage: number, dirX: number, dirZ: number) => void;

interface OwnerState { ammo: number; lap: number; nextFireTime: number }
interface Snapshot { x: number; y: number; z: number; respawnSequence?: number }
const BODY_RADIUS = 1.65;
const BODY_HEIGHT_RADIUS = 1.1;
const BODY_CENTER_Y = 1;
const EPSILON = 1e-8;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const isRival = (car: CannonCar) => car.aiProfile === 'rival' && !car.isPlayer;
const vulnerable = (car: CannonCar) => !car.destroyed && !car.finished
  && car.health > 0 && car.respawnProtection <= 0;
const validLap = (lap: number) => Number.isSafeInteger(lap) && lap >= 0;

/**
 * Fixed-direction physical cannon. Call once AFTER cars move in each fixed step;
 * elapsedTime is the END of that step, in seconds. AI launches at that instant,
 * so a new shell first moves in the following step. Rendering drains events only
 * after all substeps and interpolates previous/current positions of active slots.
 */
export class RivalCannon {
  private readonly track: SampledTrack & { width: number };
  private readonly difficulty: 'normal' | 'hard';
  private readonly pool: CannonProjectile[];
  private readonly owners = new Map<string, OwnerState>();
  private readonly snapshots = new Map<string, Snapshot>();
  private readonly eventQueue: CannonEvent[] = [];
  private currentOwnerId: string | null = null;
  private projectileSequence = 0;
  private eventSequence = 0;

  constructor({ track, difficulty = 'normal' }: {
    track: SampledTrack & { width: number }; difficulty?: 'normal' | 'hard';
  }) {
    if (!Number.isFinite(track.width) || track.width <= 0.3 || track.points.length < 2
      || !Number.isFinite(track.totalLength) || track.totalLength <= 0) {
      throw new RangeError('O canhão requer uma pista amostrada com largura válida.');
    }
    this.track = track;
    this.difficulty = difficulty;
    this.pool = Array.from({ length: CANNON_CONFIG.poolSize }, (_, slot) => ({
      slot, id: 0, active: false, ownerId: '', x: 0, y: 0, z: 0,
      previousX: 0, previousY: 0, previousZ: 0, dirX: 0, dirZ: 1,
      speed: CANNON_CONFIG.projectileSpeed, age: 0, distance: 0, spawnedAt: 0,
    }));
  }

  get ownerId(): string | null { return this.currentOwnerId; }
  get ammo(): number { return this.getAmmo(); }
  get cooldownSeconds(): number {
    return this.difficulty === 'hard' ? CANNON_CONFIG.hardCooldown : CANNON_CONFIG.normalCooldown;
  }
  /** Stable pool slots; id changes on reuse. Never mutate these from presentation. */
  get projectiles(): readonly Readonly<CannonProjectile>[] { return this.pool; }
  get events(): readonly CannonEvent[] { return this.eventQueue; }

  getAmmo(ownerId: string | null = this.currentOwnerId): number {
    return ownerId === null ? 0 : this.owners.get(ownerId)?.ammo ?? 0;
  }

  /** Does not drain during step: all visual events survive intervening substeps. */
  consumeEvents(): readonly CannonEvent[] { return this.eventQueue.splice(0); }

  /** Manual/debug gate, including identity, ammo, cooldown, protection and pool. */
  canFire(car: CannonCar, elapsedTime: number): boolean {
    if (!isRival(car) || !Number.isFinite(elapsedTime) || elapsedTime < 0) return false;
    const state = this.observeOwner(car);
    if (!vulnerable(car) || state.ammo <= 0 || elapsedTime + EPSILON < state.nextFireTime
      || !Number.isFinite(car.heading) || !this.pool.some(shell => !shell.active)) return false;
    const muzzle = this.muzzle(car);
    return this.insideTrack(muzzle.x, muzzle.y, muzzle.z);
  }

  /** Manual/debug launch along CURRENT heading; no target needed and no auto-aim. */
  tryFire(car: CannonCar, elapsedTime: number, targetId?: string): boolean {
    if (!this.canFire(car, elapsedTime)) return false;
    const shell = this.pool.find(candidate => !candidate.active)!;
    const state = this.owners.get(car.id)!;
    const muzzle = this.muzzle(car);
    Object.assign(shell, {
      id: ++this.projectileSequence, active: true, ownerId: car.id,
      x: muzzle.x, y: muzzle.y, z: muzzle.z,
      previousX: muzzle.x, previousY: muzzle.y, previousZ: muzzle.z,
      dirX: Math.sin(car.heading), dirZ: Math.cos(car.heading),
      speed: CANNON_CONFIG.projectileSpeed, age: 0, distance: 0, spawnedAt: elapsedTime,
    });
    state.ammo -= 1;
    state.nextFireTime = elapsedTime + this.cooldownSeconds;
    this.currentOwnerId = car.id;
    this.emit('shot', shell, elapsedTime, targetId);
    return true;
  }

  step<T extends CannonCar>(dt: number, cars: readonly T[], elapsedTime: number,
    onHit: CannonHitCallback<T>): void {
    if (!Number.isFinite(dt) || dt <= 0 || !Number.isFinite(elapsedTime) || elapsedTime < 0) return;
    this.currentOwnerId = cars.find(isRival)?.id ?? null;
    for (const car of cars) if (isRival(car)) this.observeOwner(car);
    for (const shell of this.pool) {
      if (!shell.active) continue;
      if (!cars.some(car => car.id === shell.ownerId && isRival(car))) {
        shell.active = false;
        this.emit('expire', shell, elapsedTime);
        continue;
      }
      this.advanceShell(shell, dt, cars, elapsedTime, onHit);
    }
    for (const car of cars) {
      if (!isRival(car) || !this.canFire(car, elapsedTime)) continue;
      const target = this.selectTarget(car, cars);
      if (target) this.tryFire(car, elapsedTime, target.id);
    }
    const present = new Set(cars.map(car => car.id));
    for (const id of this.snapshots.keys()) if (!present.has(id)) this.snapshots.delete(id);
    for (const car of cars) {
      const snapshot = this.snapshots.get(car.id);
      if (snapshot) Object.assign(snapshot, { x: car.x, y: car.y, z: car.z, respawnSequence: car.respawnSequence });
      else this.snapshots.set(car.id, { x: car.x, y: car.y, z: car.z, respawnSequence: car.respawnSequence });
    }
  }

  private observeOwner(car: CannonCar): OwnerState {
    let state = this.owners.get(car.id);
    if (!state) {
      state = { ammo: CANNON_CONFIG.maxAmmo, lap: validLap(car.lapsCompleted) ? car.lapsCompleted : 0,
        nextFireTime: 0 };
      this.owners.set(car.id, state);
    } else if (validLap(car.lapsCompleted) && car.lapsCompleted > state.lap) {
      // Trust only the upstream validated counter. Lifecycle changes alone never
      // reload, nor can a counter regression re-arm an already credited lap.
      state.ammo = CANNON_CONFIG.maxAmmo;
      state.lap = car.lapsCompleted;
    }
    return state;
  }

  private muzzle(car: CannonCar) {
    const sin = Math.sin(car.heading), cos = Math.cos(car.heading);
    return { x: car.x + CANNON_MOUNT.x * cos + CANNON_MOUNT.z * sin,
      y: car.y + CANNON_MOUNT.y,
      z: car.z - CANNON_MOUNT.x * sin + CANNON_MOUNT.z * cos };
  }

  private selectTarget<T extends CannonCar>(owner: T, cars: readonly T[]): T | undefined {
    const muzzle = this.muzzle(owner), dirX = Math.sin(owner.heading), dirZ = Math.cos(owner.heading);
    const hard = this.difficulty === 'hard';
    const range = hard ? 80 : 46, aimRadius = hard ? 1.35 : 0.85;
    let selected: T | undefined, bestScore = Infinity;
    for (const car of cars) {
      if (car.id === owner.id || !vulnerable(car)) continue;
      const dx = car.x - muzzle.x, dz = car.z - muzzle.z;
      const forward = dx * dirX + dz * dirZ;
      const closing = CANNON_CONFIG.projectileSpeed - car.velocityX * dirX - car.velocityZ * dirZ;
      if (forward <= 0 || closing <= 0) continue;
      const time = forward / closing;
      if (time > Math.min(CANNON_CONFIG.lifetime, range / CANNON_CONFIG.projectileSpeed)) continue;
      const predictedX = car.x + car.velocityX * time;
      const predictedZ = car.z + car.velocityZ * time;
      const miss = (predictedX - muzzle.x) * dirZ - (predictedZ - muzzle.z) * dirX;
      if (Math.abs(miss) > aimRadius || Math.abs(car.y + BODY_CENTER_Y - muzzle.y) > 0.9) continue;
      const flight = CANNON_CONFIG.projectileSpeed * time;
      if (this.barrierFraction(muzzle.x, muzzle.y, muzzle.z,
        muzzle.x + dirX * flight, muzzle.y, muzzle.z + dirZ * flight) !== null) continue;
      // Player wins among viable opportunities, but a bot in the flight path can be hit.
      const score = time + (car.isPlayer ? 0 : CANNON_CONFIG.lifetime + 1);
      if (score < bestScore) { bestScore = score; selected = car; }
    }
    return selected;
  }

  private advanceShell<T extends CannonCar>(shell: CannonProjectile, dt: number,
    cars: readonly T[], elapsedTime: number, onHit: CannonHitCallback<T>): void {
    shell.previousX = shell.x; shell.previousY = shell.y; shell.previousZ = shell.z;
    const stepTime = Math.min(dt, Math.max(0, elapsedTime - shell.spawnedAt));
    const travelTime = Math.max(0, Math.min(stepTime, CANNON_CONFIG.lifetime - shell.age,
      (CANNON_CONFIG.maxRange - shell.distance) / shell.speed));
    if (stepTime <= 0) return;
    const endX = shell.x + shell.dirX * shell.speed * travelTime;
    const endZ = shell.z + shell.dirZ * shell.speed * travelTime;
    const barrier = this.barrierFraction(shell.x, shell.y, shell.z, endX, shell.y, endZ);
    let first = barrier ?? Infinity;
    let target: T | undefined;
    // If expiry clips the step, test only the matching part of each car's motion.
    const startFraction = 1 - stepTime / dt;
    const endFraction = startFraction + travelTime / dt;
    for (const car of cars) {
      if (car.id === shell.ownerId || !vulnerable(car)) continue;
      const hit = this.hitFraction(shell, endX, endZ, car, startFraction, endFraction);
      if (hit !== null && hit < first) { first = hit; target = car; }
    }
    const fraction = Math.min(1, first);
    shell.x = lerp(shell.x, endX, fraction);
    shell.z = lerp(shell.z, endZ, fraction);
    shell.age += travelTime * fraction;
    shell.distance += shell.speed * travelTime * fraction;
    const eventTime = elapsedTime - stepTime + travelTime * fraction;
    if (target) {
      shell.active = false;
      this.emit('hit', shell, eventTime, target.id);
      // Never apply damage here: caller owns death, impulse and race rules.
      onHit(target, CANNON_CONFIG.damage, shell.dirX, shell.dirZ);
    } else if (barrier !== null || shell.age >= CANNON_CONFIG.lifetime - EPSILON
      || shell.distance >= CANNON_CONFIG.maxRange - EPSILON) {
      shell.active = false;
      this.emit('expire', shell, eventTime);
    }
  }

  private hitFraction(shell: CannonProjectile, endX: number, endZ: number,
    car: CannonCar, startFraction: number, endFraction: number): number | null {
    const snapshot = this.snapshots.get(car.id);
    const respawned = snapshot && snapshot.respawnSequence !== car.respawnSequence;
    const px = respawned ? car.x : car.previousX ?? snapshot?.x ?? car.x;
    const py = respawned ? car.y : car.previousY ?? snapshot?.y ?? car.y;
    const pz = respawned ? car.z : car.previousZ ?? snapshot?.z ?? car.z;
    const startX = lerp(px, car.x, startFraction), endCarX = lerp(px, car.x, endFraction);
    const startY = lerp(py, car.y, startFraction), endCarY = lerp(py, car.y, endFraction);
    const startZ = lerp(pz, car.z, startFraction), endCarZ = lerp(pz, car.z, endFraction);
    // Relative segment vs ellipsoid: catches crossing cars and prevents tunnelling.
    const rx = (shell.x - startX) / BODY_RADIUS;
    const ry = (shell.y - startY - BODY_CENTER_Y) / BODY_HEIGHT_RADIUS;
    const rz = (shell.z - startZ) / BODY_RADIUS;
    const vx = (endX - shell.x - endCarX + startX) / BODY_RADIUS;
    const vy = -(endCarY - startY) / BODY_HEIGHT_RADIUS;
    const vz = (endZ - shell.z - endCarZ + startZ) / BODY_RADIUS;
    const c = rx * rx + ry * ry + rz * rz - 1;
    if (c <= 0) return 0;
    const a = vx * vx + vy * vy + vz * vz;
    if (a <= EPSILON) return null;
    const b = 2 * (rx * vx + ry * vy + rz * vz), discriminant = b * b - 4 * a * c;
    if (discriminant < 0) return null;
    const time = (-b - Math.sqrt(discriminant)) / (2 * a);
    return time >= 0 && time <= 1 ? time : null;
  }

  private insideTrack(x: number, y: number, z: number): boolean {
    if (![x, y, z].every(Number.isFinite)) return false;
    const nearest = findNearestTrackPoint(this.track, x, z);
    // Lateral uses the sampled segment normal, not an axis-aligned track box.
    return nearest !== null && Math.abs(nearest.lateral) < this.track.width / 2 - 0.15
      && y > nearest.y + 0.12;
  }

  private barrierFraction(x: number, y: number, z: number,
    endX: number, endY: number, endZ: number): number | null {
    if (!this.insideTrack(x, y, z)) return 0;
    // Bounded by range (<=120 probes), including bends even if the end re-enters.
    const probes = Math.max(1, Math.ceil(Math.hypot(endX - x, endZ - z) / 0.75));
    for (let index = 1; index <= probes; index += 1) {
      const t = index / probes;
      if (this.insideTrack(lerp(x, endX, t), lerp(y, endY, t), lerp(z, endZ, t))) continue;
      let low = (index - 1) / probes, high = t;
      for (let iteration = 0; iteration < 10; iteration += 1) {
        const middle = (low + high) / 2;
        if (this.insideTrack(lerp(x, endX, middle), lerp(y, endY, middle), lerp(z, endZ, middle))) low = middle;
        else high = middle;
      }
      return high;
    }
    return null;
  }

  private emit(kind: CannonEvent['kind'], shell: CannonProjectile, time: number, targetId?: string): void {
    if (this.eventQueue.length === CANNON_CONFIG.eventLimit) this.eventQueue.shift();
    this.eventQueue.push(Object.freeze({ id: ++this.eventSequence, projectileId: shell.id, kind,
      x: shell.x, y: shell.y, z: shell.z, dirX: shell.dirX, dirZ: shell.dirZ,
      ownerId: shell.ownerId, ...(targetId === undefined ? {} : { targetId }), time }));
  }
}
