import * as THREE from 'three';
import type { VisualTelemetry } from '../../race/RaceSimulation.ts';

type DamagePose = Pick<VisualTelemetry, 'x' | 'y' | 'z' | 'heading'> & Partial<Pick<VisualTelemetry, 'health' | 'maxHealth' | 'destroyed' | 'respawnSequence' | 'destructionSequence'>>;
type VehicleRoot = THREE.Object3D & { userData: { size?: THREE.Vector3 } };
type ParticleAttributes = {
  position: THREE.BufferAttribute; color: THREE.BufferAttribute;
  size: THREE.BufferAttribute; alpha: THREE.BufferAttribute;
};

const SMOKE_RATE = 24;
const BURST_SIZE = 40;
const EXPLOSION_SECONDS = 0.8;
const SMOKE = 0;
const FIRE = 1;
const SPARK = 2;
const FLASH = 3;

const vertexShader = /* glsl */ `
  attribute vec3 color;
  attribute float size;
  attribute float alpha;
  uniform float viewportHeight;
  uniform float maxPointSize;
  varying vec3 particleColor;
  varying float particleAlpha;

  void main() {
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    // clip.w handles perspective depth and is 1 for orthographic cameras.
    float pixels = size * viewportHeight * abs(projectionMatrix[1][1])
      / (2.0 * max(gl_Position.w, 0.0001));
    gl_PointSize = clamp(pixels, 1.0, maxPointSize);
    particleColor = color;
    particleAlpha = gl_Position.w > 0.0 ? alpha : 0.0;
  }
`;

const fragmentShader = /* glsl */ `
  varying vec3 particleColor;
  varying float particleAlpha;

  void main() {
    float radius = length(gl_PointCoord * 2.0 - 1.0);
    float opacity = particleAlpha * (1.0 - smoothstep(0.0, 1.0, radius));
    if (opacity <= 0.001) discard;
    gl_FragColor = vec4(particleColor, opacity);
    #include <colorspace_fragment>
  }
`;

/** Health in HP; returns a finite 0..1, starting strictly below 75% health. */
export function getDamageSmokeIntensity(health: number, maxHealth: number): number {
  if (!Number.isFinite(health) || !Number.isFinite(maxHealth) || maxHealth <= 0) return 0;
  return Math.max(0, Math.min(1, (0.75 - health / maxHealth) / 0.75));
}

const validSequence = (sequence: number | undefined): boolean => Number.isSafeInteger(sequence) && sequence! >= 0;
const dimension = (value: number | undefined, fallback: number): number => Number.isFinite(value) && value! > 0 ? value! : fallback;

/**
 * World-space damage particles, independent of wheel/vehicle adapters.
 * update(poses, roots, dt): dt in seconds, poses with world x/y/z and heading;
 * roots supply userData.size in world units (no second application of scale).
 * Attach to an untransformed THREE.Scene. Slot/index identifies each participant.
 * The caller owns root visibility: hide destroyed cars and blink during protection.
 *
 * One bounded burst per observed destructionSequence increment, only while
 * destroyed === true; skipped events are consumed, never replayed on respawn.
 * explosionCount counts accepted events, even if a full pool drops the burst.
 * emittedCount counts actual particles. Full pools never overwrite live slots or
 * retain an emission backlog. All storage is allocated at construction time.
 */
export class VehicleDamageEffects {
  capacity: number;
  participantCount: number;
  activeCount = 0;
  emittedCount = 0;
  explosionCount = 0;
  private _destroyed = false;
  private _budgets: Float64Array;
  private _destructionSequences: Float64Array;
  private _respawnSequences: Float64Array;
  private _ages: Float64Array;
  private _lifetimes: Float64Array;
  private _velocities: Float32Array;
  private _baseSizes: Float32Array;
  private _baseAlphas: Float32Array;
  private _kinds: Uint8Array;
  private _owners: Uint32Array;
  private _freeSlots: Uint32Array;
  private _freeCount: number;
  geometry: THREE.BufferGeometry;
  material: THREE.ShaderMaterial;
  points: THREE.Points;
  private _viewport: THREE.Vector4;

  constructor(scene: THREE.Scene, { capacity = 512, participantCount = 4 }: { capacity?: number; participantCount?: number } = {}) {
    if (!Number.isSafeInteger(capacity) || capacity < 1) {
      throw new RangeError('VehicleDamageEffects capacity must be a positive integer.');
    }
    if (!Number.isSafeInteger(participantCount) || participantCount < 1) {
      throw new RangeError('VehicleDamageEffects participantCount must be a positive integer.');
    }
    this.capacity = capacity;
    this.participantCount = participantCount;
    this.activeCount = 0;
    this.emittedCount = 0;
    this.explosionCount = 0;
    this._destroyed = false;
    this._budgets = new Float64Array(participantCount);
    this._destructionSequences = new Float64Array(participantCount);
    this._respawnSequences = new Float64Array(participantCount);
    this._ages = new Float64Array(capacity);
    this._lifetimes = new Float64Array(capacity);
    this._velocities = new Float32Array(capacity * 3);
    this._baseSizes = new Float32Array(capacity);
    this._baseAlphas = new Float32Array(capacity);
    this._kinds = new Uint8Array(capacity);
    this._owners = new Uint32Array(capacity);
    this._freeSlots = new Uint32Array(capacity);
    this._freeCount = capacity;
    for (let i = 0; i < capacity; i += 1) this._freeSlots[i] = capacity - 1 - i;

    this.geometry = new THREE.BufferGeometry();
    for (const name of ['position', 'color', 'size', 'alpha']) {
      const components = name === 'position' || name === 'color' ? 3 : 1;
      this.geometry.setAttribute(name, new THREE.BufferAttribute(new Float32Array(capacity * components), components)
        .setUsage(THREE.DynamicDrawUsage));
    }
    this.material = new THREE.ShaderMaterial({
      uniforms: { viewportHeight: { value: 1 }, maxPointSize: { value: 64 } },
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    });
    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    this._viewport = new THREE.Vector4();
    this.points.onBeforeRender = renderer => {
      renderer.getCurrentViewport(this._viewport);
      this.material.uniforms.viewportHeight.value = Math.max(1, this._viewport.w);
    };
    scene.add(this.points);
  }

  update(poses: readonly (DamagePose | undefined)[], vehicles: readonly (VehicleRoot | undefined)[], dt: number): void {
    if (this._destroyed || !Number.isFinite(dt) || dt < 0) return;
    this._advance(dt);
    for (let id = 0; id < this.participantCount; id += 1) {
      const pose = poses?.[id];
      const vehicle = vehicles?.[id];
      if (!pose) {
        this._budgets[id] = 0;
        continue;
      }
      if (validSequence(pose.respawnSequence) && pose.respawnSequence !== this._respawnSequences[id]) {
        this._respawnSequences[id] = pose.respawnSequence!;
        this._budgets[id] = 0;
        // Remove this car's old motor smoke, without erasing other cars' trails.
        for (let i = 0; i < this.capacity; i += 1) {
          if (this._lifetimes[i] > 0 && this._owners[i] === id && this._kinds[i] === SMOKE) this._release(i);
        }
      }
      let burst = false;
      if (validSequence(pose.destructionSequence)) {
        burst = pose.destructionSequence! > this._destructionSequences[id] && pose.destroyed === true;
        this._destructionSequences[id] = pose.destructionSequence!;
      }
      // Consume sequences even when a root/position is absent: no delayed ghosts.
      if (!vehicle || !Number.isFinite(pose.x) || !Number.isFinite(pose.y)
        || !Number.isFinite(pose.z) || !Number.isFinite(pose.heading)) {
        this._budgets[id] = 0;
        continue;
      }
      const height = dimension(vehicle.userData?.size?.y, 1);
      const length = dimension(vehicle.userData?.size?.z, 2);
      if (burst) {
        this.explosionCount += 1;
        const count = Math.min(BURST_SIZE, this._freeCount);
        const scale = Math.max(height, length * 0.35);
        for (let n = 0; n < count; n += 1) {
          const kind = n === 0 ? FLASH : n <= 12 ? SPARK : FIRE;
          this._spawn(kind, id, pose.x, pose.y + height * 0.5, pose.z, scale, 1);
        }
      }
      const intensity = pose.destroyed === true ? 0 : getDamageSmokeIntensity(pose.health ?? NaN, pose.maxHealth ?? NaN);
      if (intensity === 0) {
        this._budgets[id] = 0;
        continue;
      }
      const budget = this._budgets[id] + SMOKE_RATE * intensity * dt;
      const requested = Math.floor(budget + 1e-9);
      this._budgets[id] = Number.isFinite(budget) ? Math.max(0, budget - requested) : 0;
      const count = Math.min(requested, this._freeCount);
      const x = pose.x + Math.sin(pose.heading) * length * 0.25;
      // An atlas model may have a tall hood/cage. Start above that surface,
      // rather than emitting inside the opaque mesh where depth testing hides it.
      const y = pose.y + height * 0.9;
      const z = pose.z + Math.cos(pose.heading) * length * 0.25;
      for (let n = 0; n < count; n += 1) this._spawn(SMOKE, id, x, y, z, height, intensity);
    }
    if (this.activeCount > 0 || this._freeCount !== this.capacity) this._upload();
    // Expiry/respawn also need an upload when the last live particle disappears.
    else this.geometry.attributes.alpha.needsUpdate = true;
  }

  _spawn(kind: number, owner: number, x: number, y: number, z: number, scale: number, intensity: number): void {
    const i = this._freeSlots[--this._freeCount];
    const offset = i * 3;
    const { position, color, size, alpha } = this.geometry.attributes as unknown as ParticleAttributes;
    this._ages[i] = 0;
    this._kinds[i] = kind;
    this._owners[i] = owner;
    position.array[offset] = x;
    position.array[offset + 1] = y;
    position.array[offset + 2] = z;
    if (kind === SMOKE) {
      this._lifetimes[i] = 0.9 + Math.random() * 0.5;
      this._velocities[offset] = (Math.random() - 0.5) * 0.24 * scale;
      this._velocities[offset + 1] = (0.16 + Math.random() * 0.14) * scale;
      this._velocities[offset + 2] = (Math.random() - 0.5) * 0.24 * scale;
      const shade = 0.25 - intensity * 0.17 + Math.random() * 0.025;
      color.array[offset] = shade;
      color.array[offset + 1] = shade;
      color.array[offset + 2] = shade;
      this._baseSizes[i] = scale * (0.3 + intensity * 0.22 + Math.random() * 0.06);
      this._baseAlphas[i] = 0.28 + intensity * 0.4;
    } else {
      const angle = Math.random() * Math.PI * 2;
      const speed = (kind === SPARK ? 2.4 : 0.65) * scale * (0.5 + Math.random());
      this._lifetimes[i] = kind === FLASH ? 0.14 : EXPLOSION_SECONDS * (0.6 + Math.random() * 0.4);
      this._velocities[offset] = kind === FLASH ? 0 : Math.sin(angle) * speed;
      this._velocities[offset + 1] = kind === FLASH ? 0 : speed * (0.3 + Math.random() * 0.7);
      this._velocities[offset + 2] = kind === FLASH ? 0 : Math.cos(angle) * speed;
      color.array[offset] = 1;
      color.array[offset + 1] = kind === FIRE ? 0.55 : 0.9;
      color.array[offset + 2] = kind === FIRE ? 0.04 : 0.3;
      this._baseSizes[i] = scale * (kind === FLASH ? 1.3 : kind === SPARK ? 0.07 : 0.5);
      this._baseAlphas[i] = kind === FLASH ? 0.6 : 0.85;
    }
    size.array[i] = this._baseSizes[i];
    alpha.array[i] = this._baseAlphas[i];
    this.activeCount += 1;
    this.emittedCount += 1;
  }

  _release(i: number): void {
    this._lifetimes[i] = 0;
    this.geometry.attributes.alpha.array[i] = 0;
    this._freeSlots[this._freeCount++] = i;
    this.activeCount -= 1;
  }

  _advance(dt: number): void {
    const { position, color, size, alpha } = this.geometry.attributes as unknown as ParticleAttributes;
    for (let i = 0; i < this.capacity; i += 1) {
      if (this._lifetimes[i] === 0) continue;
      this._ages[i] += dt;
      if (this._ages[i] >= this._lifetimes[i]) {
        this._release(i);
        continue;
      }
      const offset = i * 3;
      const kind = this._kinds[i];
      const gravity = kind === SPARK ? 3 : 0;
      position.array[offset] += this._velocities[offset] * dt;
      position.array[offset + 1] += this._velocities[offset + 1] * dt - gravity * dt * dt * 0.5;
      position.array[offset + 2] += this._velocities[offset + 2] * dt;
      this._velocities[offset + 1] -= gravity * dt;
      const progress = this._ages[i] / this._lifetimes[i];
      alpha.array[i] = this._baseAlphas[i] * (1 - progress * progress * (3 - 2 * progress));
      size.array[i] = this._baseSizes[i] * (1 + progress * (kind === SPARK ? 0.2 : 2));
      if (kind === FIRE) {
        color.array[offset] = 1 - progress * 0.65;
        color.array[offset + 1] = 0.55 - progress * 0.4;
        color.array[offset + 2] = 0.04;
      }
    }
  }

  _upload() {
    const { position, color, size, alpha } = this.geometry.attributes as unknown as ParticleAttributes;
    position.needsUpdate = true;
    color.needsUpdate = true;
    size.needsUpdate = true;
    alpha.needsUpdate = true;
  }

  destroy(): void {
    if (this._destroyed) return;
    this._destroyed = true;
    this.points.removeFromParent();
    this.points.onBeforeRender = () => {};
    this._lifetimes.fill(0);
    this._budgets.fill(0);
    this.geometry.attributes.alpha.array.fill(0);
    this.activeCount = 0;
    this.geometry.dispose();
    this.material.dispose();
  }
}
