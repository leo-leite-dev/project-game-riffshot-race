import * as THREE from 'three';
import type { CannonEvent, CannonProjectile } from '../../race/RivalCannon.ts';

/** Write a WORLD position into target. Called once per fresh shot, never for hits.
 * The direction remains the event's fixed dirX/dirZ. Do not retain target. */
export type CannonMuzzleResolver = (event: CannonEvent, target: THREE.Vector3) => void;

interface Flash {
  root: THREE.Group; core: THREE.Mesh; glow: THREE.Mesh; flame: THREE.Mesh;
  age: number; time: number; life: number; shot: boolean;
}
interface Spark {
  active: boolean; age: number; time: number; life: number;
  x: number; y: number; z: number; vx: number; vy: number; vz: number;
}

const PROJECTILES = 12;
const FLASHES = 12;
const SPARKS = 96;
const SHOT_WINDOW = 0.3;
const HIT_WINDOW = 0.5;
const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const validPosition = (x: number, y: number, z: number) =>
  Number.isFinite(Math.fround(x)) && Number.isFinite(Math.fround(y)) && Number.isFinite(Math.fround(z));
const validDirection = (x: number, z: number) => Number.isFinite(x) && Number.isFinite(z)
  && Number.isFinite(Math.hypot(x, z)) && Math.hypot(x, z) > 1e-8;

/**
 * Procedural "Forja": additive white/gold muzzle, short orange flame, hot shell
 * and short fixed-direction trail; hits scatter a small shower of cooling sparks.
 * No lights, shadows, textures or per-shot geometry/material allocations.
 *
 * update receives the simulation's readonly slots and monotonically ordered event
 * IDs (normally consumeEvents()). elapsed is simulation seconds, alpha is the
 * previous/current interpolation factor, dt is render seconds. Existing bursts
 * age by dt, or catch up to elapsed if simulation advanced further; new events
 * start at elapsed - event.time, without applying dt twice. Stale/invalid events
 * are consumed too. A new simulation/event sequence requires a new effects object.
 *
 * root is world-anchored, including under a transformed Scene. Its identity world
 * matrix is owned here; do not move/reparent it to a vehicle. The optional resolver
 * snapshots a visual muzzle WORLD position, without changing physical shells.
 * Recoil belongs to the vehicle presenter. Only `hit` emits an impact: `expire`
 * does not distinguish a barrier from lifetime/range/owner removal.
 *
 * Counts are cumulative accepted fresh shots/hits, even if a full pool drops their
 * particles. activeCount sums visible shells, flashes and sparks. Full pools drop
 * excess without overwriting live effects or retaining an emission backlog.
 */
export class RivalCannonEffects {
  readonly root = new THREE.Group();
  readonly projectileCapacity = PROJECTILES;
  readonly flashCapacity = FLASHES;
  readonly sparkCapacity = SPARKS;
  private shots = 0;
  private impacts = 0;
  private shellsAlive = 0;
  private flashesAlive = 0;
  private sparksAlive = 0;
  private destroyed = false;
  private lastEventId = 0;
  private readonly geometry = new THREE.SphereGeometry(1, 8, 6);
  private readonly materials: THREE.MeshBasicMaterial[] = [];
  private readonly shells: THREE.Group[] = [];
  private readonly flashes: Flash[] = [];
  private readonly particles: Spark[] = [];
  private readonly sparks: THREE.InstancedMesh;
  private readonly transform = new THREE.Object3D();
  private readonly origin = new THREE.Vector3();
  private readonly color = new THREE.Color();

  constructor(scene: THREE.Scene) {
    this.root.name = 'rival-cannon-effects';
    // Children use world coordinates. Prevent the scene's transform being applied
    // a second time, both by renderer traversal and getWorldPosition().
    this.root.matrixAutoUpdate = false;
    this.root.matrixWorldAutoUpdate = false;
    const core = this.material(0xfff6d9, 1);
    const gold = this.material(0xffbe43, 0.65);
    const orange = this.material(0xff3908, 0.65);
    const trail = this.material(0xff6a0b, 0.35);
    const spark = this.material(0xffffff, 0.9);
    for (let i = 0; i < PROJECTILES; i += 1) {
      const group = new THREE.Group();
      group.name = `cannon-projectile-${i}`;
      this.mesh(group, core, 'core', 0.105, 0.105, 0.25);
      this.mesh(group, orange, 'shell', 0.19, 0.19, 0.37);
      this.mesh(group, trail, 'trail', 0.095, 0.095, 0.65).position.z = -0.68;
      group.visible = false;
      this.shells.push(group);
      this.root.add(group);
    }
    for (let i = 0; i < FLASHES; i += 1) {
      const root = new THREE.Group();
      root.name = `cannon-flash-${i}`;
      const flash: Flash = {
        root, core: this.mesh(root, core, 'core', 1, 1, 1),
        glow: this.mesh(root, gold, 'glow', 1, 1, 1),
        flame: this.mesh(root, orange, 'flame', 1, 1, 1),
        age: 0, time: 0, life: 0, shot: true,
      };
      root.visible = false;
      this.flashes.push(flash);
      this.root.add(root);
    }
    this.sparks = new THREE.InstancedMesh(this.geometry, spark, SPARKS);
    this.sparks.name = 'cannon-sparks';
    this.sparks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.sparks.frustumCulled = false;
    for (let i = 0; i < SPARKS; i += 1) {
      this.particles.push({ active: false, age: 0, time: 0, life: 0,
        x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 });
      this.transform.scale.setScalar(0);
      this.transform.updateMatrix();
      this.sparks.setMatrixAt(i, this.transform.matrix);
      this.sparks.setColorAt(i, this.color.setRGB(0, 0, 0));
    }
    this.sparks.instanceColor!.setUsage(THREE.DynamicDrawUsage);
    this.root.add(this.sparks);
    scene.add(this.root);
  }

  get shotCount(): number { return this.shots; }
  get impactCount(): number { return this.impacts; }
  get projectileCount(): number { return this.shellsAlive; }
  get flashCount(): number { return this.flashesAlive; }
  get sparkCount(): number { return this.sparksAlive; }
  get activeCount(): number { return this.shellsAlive + this.flashesAlive + this.sparksAlive; }

  update(projectiles: readonly Readonly<CannonProjectile>[], events: readonly CannonEvent[],
    elapsed: number, alpha: number, dt: number, resolveMuzzle?: CannonMuzzleResolver): void {
    if (this.destroyed || !Number.isFinite(elapsed) || elapsed < 0
      || !Number.isFinite(alpha) || !Number.isFinite(dt) || dt < 0) return;
    this.advance(elapsed, dt);
    this.shellsAlive = 0;
    for (const shell of this.shells) shell.visible = false;
    const t = clamp01(alpha);
    for (const shell of projectiles) {
      if (!shell.active || !Number.isInteger(shell.slot) || shell.slot < 0 || shell.slot >= PROJECTILES
        || !validPosition(shell.x, shell.y, shell.z)
        || !validPosition(shell.previousX, shell.previousY, shell.previousZ)
        || !validDirection(shell.dirX, shell.dirZ)) continue;
      const visual = this.shells[shell.slot];
      if (!visual.visible) this.shellsAlive += 1;
      visual.visible = true;
      visual.position.set(shell.previousX * (1 - t) + shell.x * t,
        shell.previousY * (1 - t) + shell.y * t, shell.previousZ * (1 - t) + shell.z * t);
      visual.rotation.y = Math.atan2(shell.dirX, shell.dirZ);
    }
    for (const event of events) {
      if (!Number.isSafeInteger(event.id) || event.id <= this.lastEventId) continue;
      this.lastEventId = event.id;
      const age = elapsed - event.time;
      if (!Number.isFinite(age) || age < 0 || !validPosition(event.x, event.y, event.z)
        || !validDirection(event.dirX, event.dirZ)) continue;
      const shot = event.kind === 'shot';
      if ((!shot && event.kind !== 'hit') || age > (shot ? SHOT_WINDOW : HIT_WINDOW)) continue;
      this.origin.set(event.x, event.y, event.z);
      if (shot && resolveMuzzle) {
        resolveMuzzle(event, this.origin);
        if (!validPosition(this.origin.x, this.origin.y, this.origin.z)) {
          this.origin.set(event.x, event.y, event.z);
        }
      }
      if (shot) this.shots += 1;
      else this.impacts += 1;
      this.emit(event, age, shot);
    }
    this.presentBursts();
  }

  private material(color: number, opacity: number): THREE.MeshBasicMaterial {
    const material = new THREE.MeshBasicMaterial({ color, opacity, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    this.materials.push(material);
    return material;
  }

  private mesh(parent: THREE.Group, material: THREE.MeshBasicMaterial, name: string,
    x: number, y: number, z: number): THREE.Mesh {
    const mesh = new THREE.Mesh(this.geometry, material);
    mesh.name = name;
    mesh.scale.set(x, y, z);
    parent.add(mesh);
    return mesh;
  }

  private advance(elapsed: number, dt: number): void {
    for (const flash of this.flashes) {
      if (!flash.root.visible) continue;
      flash.age = Math.max(flash.age + dt, elapsed - flash.time);
      if (flash.age >= flash.life) flash.root.visible = false;
    }
    for (const spark of this.particles) {
      if (!spark.active) continue;
      spark.age = Math.max(spark.age + dt, elapsed - spark.time);
      if (spark.age >= spark.life) spark.active = false;
    }
  }

  private emit(event: CannonEvent, age: number, shot: boolean): void {
    const flashLife = shot ? 0.14 : 0.16;
    if (age < flashLife) {
      const flash = this.flashes.find(item => !item.root.visible);
      if (flash) {
        flash.age = age; flash.time = event.time; flash.life = flashLife; flash.shot = shot;
        flash.root.position.copy(this.origin);
        flash.root.rotation.y = Math.atan2(event.dirX, event.dirZ);
        flash.root.visible = true;
      }
    }
    const length = Math.hypot(event.dirX, event.dirZ);
    const dx = event.dirX / length, dz = event.dirZ / length;
    const requested = shot ? 4 : 22;
    // Deterministic fan: no global RNG coupling or temporaries per emitted spark.
    let slot = 0;
    for (let n = 0; n < requested; n += 1) {
      const life = shot ? 0.2 + (n % 4) * 0.03 : 0.32 + (n % 7) * 0.03;
      if (age >= life) continue;
      while (slot < SPARKS && this.particles[slot].active) slot += 1;
      if (slot === SPARKS) break;
      const spark = this.particles[slot++];
      const angle = n * 2.399963229728653 + event.id * 0.37;
      const side = Math.cos(angle) * (shot ? 1.8 : 5.5);
      const forward = shot ? 3 + n * 0.6 : Math.sin(angle) * 4 - 1;
      spark.active = true; spark.age = age; spark.time = event.time; spark.life = life;
      spark.x = this.origin.x; spark.y = this.origin.y; spark.z = this.origin.z;
      spark.vx = dx * forward + dz * side;
      spark.vy = shot ? 0.6 + n * 0.3 : 1.5 + (n % 5) * 0.8;
      spark.vz = dz * forward - dx * side;
    }
  }

  private presentBursts(): void {
    this.flashesAlive = 0;
    for (const flash of this.flashes) {
      if (!flash.root.visible) continue;
      this.flashesAlive += 1;
      const fade = 1 - flash.age / flash.life;
      const radius = flash.shot ? 0.27 : 0.45;
      flash.core.scale.setScalar(radius * fade);
      flash.glow.scale.setScalar(radius * (1.9 - fade * 0.3) * fade);
      flash.flame.visible = flash.shot;
      flash.flame.scale.set(0.18 * fade, 0.18 * fade, 0.58 * fade);
      flash.flame.position.z = 0.45 * fade;
    }
    this.sparksAlive = 0;
    for (let i = 0; i < SPARKS; i += 1) {
      const spark = this.particles[i];
      if (spark.active) {
        this.sparksAlive += 1;
        const age = spark.age, fade = 1 - age / spark.life;
        this.transform.position.set(spark.x + spark.vx * age,
          spark.y + spark.vy * age - 4 * age * age, spark.z + spark.vz * age);
        this.transform.rotation.set(0, Math.atan2(spark.vx, spark.vz), 0);
        this.transform.scale.set(0.035 * fade, 0.035 * fade, (0.12 + fade * 0.12) * fade);
        this.color.setRGB(fade, (0.15 + 0.75 * fade) * fade, 0.12 * fade * fade);
      } else {
        // Clear all matrix components as well as scale: even unused slots stay finite.
        this.transform.position.set(0, 0, 0);
        this.transform.rotation.set(0, 0, 0);
        this.transform.scale.setScalar(0);
        this.color.setRGB(0, 0, 0);
      }
      this.transform.updateMatrix();
      this.sparks.setMatrixAt(i, this.transform.matrix);
      this.sparks.setColorAt(i, this.color);
    }
    this.sparks.visible = this.sparksAlive > 0;
    this.sparks.instanceMatrix.needsUpdate = true;
    this.sparks.instanceColor!.needsUpdate = true;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.root.removeFromParent();
    this.root.visible = false;
    for (const shell of this.shells) shell.visible = false;
    for (const flash of this.flashes) flash.root.visible = false;
    for (const spark of this.particles) spark.active = false;
    this.shellsAlive = this.flashesAlive = this.sparksAlive = 0;
    this.sparks.dispose();
    this.geometry.dispose();
    for (const material of this.materials) material.dispose();
  }
}
