import * as THREE from 'three';

const EMITTER_COUNT = 4;
const PARTICLES_PER_SECOND = 32;

const vertexShader = /* glsl */ `
  attribute vec3 color;
  attribute float size;
  attribute float alpha;
  uniform float viewportHeight;
  uniform float maxPointSize;
  varying vec3 smokeColor;
  varying float smokeAlpha;

  void main() {
    vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * viewPosition;
    // clip.w is depth for perspective and 1 for orthographic cameras. The
    // projection scale also includes camera zoom, without a camera-specific API.
    float pixels = size * viewportHeight * abs(projectionMatrix[1][1])
      / (2.0 * max(gl_Position.w, 0.0001));
    gl_PointSize = clamp(pixels, 1.0, maxPointSize);
    smokeColor = color;
    smokeAlpha = alpha;
  }
`;

const fragmentShader = /* glsl */ `
  varying vec3 smokeColor;
  varying float smokeAlpha;

  void main() {
    float radius = length(gl_PointCoord * 2.0 - 1.0);
    float opacity = smokeAlpha * (1.0 - smoothstep(0.0, 1.0, radius));
    if (opacity <= 0.001) discard;
    gl_FragColor = vec4(smokeColor, opacity);
    #include <colorspace_fragment>
  }
`;

/** Minimal emit surface consumed by the visual adapters. */
export interface TireSmokeEmitter {
  emit(worldPosition: THREE.Vector3, intensity: number, dt: number, emitterId?: number): void;
}

/** Optional adapter helper; speeds are in world units/second, in vehicle axes. */
export function slipSmokeIntensity(longitudinalSpeed: number, lateralSpeed: number) {
  if (!Number.isFinite(longitudinalSpeed) || !Number.isFinite(lateralSpeed)) return 0;
  const speed = Math.abs(longitudinalSpeed);
  const lateral = Math.abs(lateralSpeed);
  if (speed <= 3 || lateral <= 2) return 0;
  return Math.min(1, (speed - 3) / 5) * Math.min(1, (lateral - 2) / 4);
}

/**
 * Fixed world-space pool, with no allocations during update/emit/render hooks.
 * Call update(dt) once, then emit(position, intensity, dt, id) once per tire
 * each frame. dt is in seconds; ids 0..3 retain independent fractional budgets.
 * Full pools drop emissions (never overwrite live particles or defer bursts).
 * Attach to an untransformed THREE.Scene; do not parent Points to the vehicle.
 */
export class TireSmoke {
  capacity: number;
  activeCount = 0;
  emittedCount = 0;
  geometry: THREE.BufferGeometry;
  material: THREE.ShaderMaterial;
  points: THREE.Points;
  _destroyed = false;
  _budgets: Float64Array;
  _ages: Float64Array;
  _lifetimes: Float64Array;
  _velocities: Float32Array;
  _baseSizes: Float32Array;
  _baseAlphas: Float32Array;
  _freeSlots: Uint32Array;
  _freeCount: number;
  _viewport = new THREE.Vector4();

  constructor(scene: THREE.Scene, { capacity = 128 }: { capacity?: number } = {}) {
    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new RangeError('TireSmoke capacity must be a positive integer.');
    }

    this.capacity = capacity;
    this._budgets = new Float64Array(EMITTER_COUNT);
    this._ages = new Float64Array(capacity);
    this._lifetimes = new Float64Array(capacity);
    this._velocities = new Float32Array(capacity * 3);
    this._baseSizes = new Float32Array(capacity);
    this._baseAlphas = new Float32Array(capacity);
    this._freeSlots = new Uint32Array(capacity);
    this._freeCount = capacity;
    for (let i = 0; i < capacity; i += 1) this._freeSlots[i] = capacity - 1 - i;

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(capacity * 3), 3)
      .setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(capacity * 3), 3)
      .setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('size', new THREE.BufferAttribute(new Float32Array(capacity), 1)
      .setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('alpha', new THREE.BufferAttribute(new Float32Array(capacity), 1)
      .setUsage(THREE.DynamicDrawUsage));
    this.material = new THREE.ShaderMaterial({
      uniforms: { viewportHeight: { value: 1 }, maxPointSize: { value: 64 } },
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    });
    this.points = new THREE.Points(this.geometry, this.material);
    // Positions change in world space: a stale bounding sphere must not hide smoke.
    this.points.frustumCulled = false;
    this.points.onBeforeRender = renderer => {
      renderer.getCurrentViewport(this._viewport);
      this.material.uniforms.viewportHeight.value = this._viewport.w;
    };
    scene.add(this.points);
  }

  update(dt: number) {
    if (this._destroyed || !Number.isFinite(dt) || dt <= 0 || this.activeCount === 0) return;
    const { position, size, alpha } = this.geometry.attributes;
    for (let i = 0; i < this.capacity; i += 1) {
      if (this._lifetimes[i] === 0) continue;
      this._ages[i] += dt;
      if (this._ages[i] >= this._lifetimes[i]) {
        this._lifetimes[i] = 0;
        alpha.array[i] = 0;
        this._freeSlots[this._freeCount++] = i;
        this.activeCount -= 1;
        continue;
      }

      const offset = i * 3;
      position.array[offset] += this._velocities[offset] * dt;
      position.array[offset + 1] += this._velocities[offset + 1] * dt;
      position.array[offset + 2] += this._velocities[offset + 2] * dt;
      const progress = this._ages[i] / this._lifetimes[i];
      const fade = 1 - progress * progress * (3 - 2 * progress);
      alpha.array[i] = this._baseAlphas[i] * fade;
      size.array[i] = this._baseSizes[i] * (1 + progress * 1.5);
    }
    position.needsUpdate = true;
    size.needsUpdate = true;
    alpha.needsUpdate = true;
  }

  emit(worldPosition: THREE.Vector3, intensity: number, dt: number, emitterId = 0) {
    if (this._destroyed || !Number.isInteger(emitterId) || emitterId < 0 || emitterId >= EMITTER_COUNT) return;
    if (!Number.isFinite(intensity) || intensity <= 0) {
      this._budgets[emitterId] = 0;
      return;
    }
    if (!Number.isFinite(dt) || dt <= 0) return;
    if (!Number.isFinite(worldPosition.x) || !Number.isFinite(worldPosition.y) || !Number.isFinite(worldPosition.z)) return;
    intensity = Math.min(1, intensity);
    const budget = this._budgets[emitterId] + PARTICLES_PER_SECOND * intensity * dt;
    const requested = Math.floor(budget + 1e-9);
    this._budgets[emitterId] = Math.max(0, budget - requested);
    const count = Math.min(requested, this._freeCount);
    if (count === 0) return;

    const { position, color, size, alpha } = this.geometry.attributes;
    for (let emitted = 0; emitted < count; emitted += 1) {
      const i = this._freeSlots[--this._freeCount];
      const offset = i * 3;
      this._ages[i] = 0;
      this._lifetimes[i] = 0.6 + Math.random() * 0.4;
      this._velocities[offset] = (Math.random() - 0.5) * 0.7;
      this._velocities[offset + 1] = 0.2 + Math.random() * 0.25;
      this._velocities[offset + 2] = (Math.random() - 0.5) * 0.7;
      position.array[offset] = worldPosition.x;
      position.array[offset + 1] = worldPosition.y;
      position.array[offset + 2] = worldPosition.z;
      const shade = 0.48 + Math.random() * 0.12;
      color.array[offset] = shade;
      color.array[offset + 1] = shade;
      color.array[offset + 2] = shade;
      this._baseSizes[i] = 0.45 + Math.random() * 0.25;
      this._baseAlphas[i] = 0.18 + intensity * 0.22;
      size.array[i] = this._baseSizes[i];
      alpha.array[i] = this._baseAlphas[i];
    }
    this.activeCount += count;
    this.emittedCount += count;
    position.needsUpdate = true;
    color.needsUpdate = true;
    size.needsUpdate = true;
    alpha.needsUpdate = true;
  }

  destroy() {
    if (this._destroyed) return;
    this._destroyed = true;
    this.points.removeFromParent();
    this.points.onBeforeRender = null as unknown as THREE.Object3D['onBeforeRender'];
    this.geometry.attributes.alpha.array.fill(0);
    this._lifetimes.fill(0);
    this._budgets.fill(0);
    this.activeCount = 0;
    this.geometry.dispose();
    this.material.dispose();
  }
}
