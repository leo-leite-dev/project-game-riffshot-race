import * as THREE from 'three';
import type { GarageWorld } from './GarageWorld.ts';

type ArmState = 'tracking' | 'aligning' | 'descending' | 'gripping' | 'lifting' | 'transporting' | 'complete';
type VehicleObject = THREE.Group & { userData: { size: THREE.Vector3 } };

const smooth = (value: number): number => { const t = THREE.MathUtils.clamp(value, 0, 1); return t * t * (3 - 2 * t); };
const mix = THREE.MathUtils.lerp;

// The vehicle stays in world space but follows the gripper's exact displacement
// after attachment. This avoids a jump caused by reparenting a skinned model.
export class MechanicalArm {
  world: GarageWorld;
  height: number;
  group: THREE.Group;
  piston!: THREE.Mesh;
  sleeve!: THREE.Mesh;
  head: THREE.Group;
  jaws: THREE.Group[];
  homeY: number;
  gripY: number;
  y: number;
  gap: number;
  targetX: number;
  state: ArmState;
  elapsed: number;
  vehicle!: VehicleObject;
  done: (() => void) | null = null;
  closedGap = 1.85;
  startX = 0;
  startY = 0;

  constructor(world: GarageWorld, height: number) {
    this.world = world;
    this.height = height;
    this.group = new THREE.Group();
    this.group.position.set(0, 6, 0);
    world.scene.add(this.group);
    const steel = world.material(0x667b8c, 0.82, 0.31);
    const dark = world.material(0x121d29, 0.8, 0.45);
    const light = world.glow(0x71f6ff, 2.2);
    world.box(this.group, [1.4, 0.45, 1.25], [0, 0, 0], dark);
    world.box(this.group, [1.55, 0.09, 1.32], [0, 0.12, 0], steel);
    this.piston = world.box(this.group, [0.22, 1, 0.22], [0, -1, 0], steel);
    this.sleeve = world.box(this.group, [0.48, 1.15, 0.48], [0, -0.72, 0], dark);
    this.head = new THREE.Group();
    this.group.add(this.head);
    world.box(this.head, [3.9, 0.32, 0.72], [0, 0, 0], steel);
    world.box(this.head, [1.3, 0.08, 0.76], [0, 0.19, 0], light);
    this.jaws = [-1, 1].map(side => {
      const jaw = new THREE.Group();
      this.head.add(jaw);
      // Long fingers reach under the side wings instead of gripping empty air
      // beside the tall central fin. Their inward pads support the body visually.
      world.box(jaw, [0.19, 1.7, 0.52], [0, -0.8, 0], dark);
      world.box(jaw, [0.35, 0.15, 0.62], [-side * 0.13, -1.65, 0], steel);
      world.box(jaw, [0.035, 1.15, 0.53], [side * 0.11, -0.8, 0], light);
      return jaw;
    });
    this.homeY = Math.max(3.65, height + 1.6);
    this.gripY = height + 0.65;
    this.y = this.homeY;
    this.gap = 1.85;
    this.targetX = 0;
    this.state = 'tracking';
    this.elapsed = 0;
    this.apply();
  }

  focus(x: number): void { this.targetX = x; }

  confirm(vehicle: VehicleObject, done: () => void): void {
    if (this.state !== 'tracking') return;
    this.vehicle = vehicle;
    this.done = done;
    this.targetX = vehicle.position.x;
    this.head.rotation.y = vehicle.rotation.y;
    // Clamp against the rotated body's local width; jaw assembly shares its yaw.
    this.closedGap = vehicle.userData.size.x * 0.5 + 0.09;
    this.startX = this.group.position.x;
    this.startY = this.y;
    this.state = 'aligning';
    this.elapsed = 0;
  }

  advance(state: ArmState): void { this.state = state; this.elapsed = 0; }

  update(dt: number): void {
    this.elapsed += dt;
    const x = this.group.position.x;
    switch (this.state) {
      case 'tracking':
        this.group.position.x = mix(x, this.targetX, 1 - Math.exp(-dt * 3.6));
        break;
      case 'aligning':
        this.group.position.x = mix(this.startX, this.targetX, smooth(this.elapsed / 0.85));
        if (this.elapsed >= 0.85) this.advance('descending');
        break;
      case 'descending':
        this.y = mix(this.startY, this.gripY, smooth(this.elapsed / 1.25));
        if (this.elapsed >= 1.25) this.advance('gripping');
        break;
      case 'gripping':
        this.gap = mix(1.85, this.closedGap, smooth(this.elapsed / 0.8));
        if (this.elapsed >= 0.8) this.advance('lifting');
        break;
      case 'lifting': {
        const lift = 0.85 * smooth(this.elapsed / 1.25);
        this.y = this.gripY + lift;
        this.vehicle.position.y = 0.34 + lift;
        if (this.elapsed >= 1.25) this.advance('transporting');
        break;
      }
      case 'transporting': {
        const travel = 22 * smooth(this.elapsed / 2.6);
        this.group.position.x = this.targetX + travel;
        this.vehicle.position.x = this.targetX + travel;
        if (this.elapsed >= 2.6) {
          this.state = 'complete';
          const callback = this.done;
          this.done = null;
          callback?.();
        }
        break;
      }
    }
    this.apply();
  }

  apply(): void {
    this.head.position.y = this.y - 6;
    const length = 6 - this.y;
    this.piston.scale.y = Math.max(0.1, length);
    this.piston.position.y = -length / 2;
    this.jaws.forEach((jaw: THREE.Group, i: number) => { jaw.position.x = (i === 0 ? -1 : 1) * this.gap; });
  }
}
