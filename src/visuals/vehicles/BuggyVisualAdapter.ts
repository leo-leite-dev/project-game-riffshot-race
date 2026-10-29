import * as THREE from 'three';
import { slipSmokeIntensity, type TireSmokeEmitter } from './TireSmoke.ts';
import type { BuggyWheel } from './BuggyTemplate.ts';

const clamp = THREE.MathUtils.clamp;
const follow = (current: number, target: number, dt: number) => THREE.MathUtils.lerp(current, target, 1 - Math.exp(-dt * 9));

interface BuggyPose {
  readonly finished?: boolean;
  readonly longitudinalSpeed?: number;
  readonly lateralSpeed?: number;
  readonly steer?: number;
  readonly longitudinalAcceleration?: number;
  readonly impactSpeed?: number;
  readonly nitroActive?: boolean;
}

type BuggyWheelNodes = BuggyWheel & {
  travel: THREE.Object3D;
  steer: THREE.Object3D;
  spin: THREE.Object3D;
  emitter: THREE.Object3D;
};

// Owns only local child transforms. The race writes the root pose once; no
// mixer, physics mutation, timer, or second requestAnimationFrame is involved.
export class BuggyVisualAdapter {
  root: THREE.Object3D;
  body: THREE.Object3D;
  bodyRestY: number;
  wheels: BuggyWheelNodes[];
  position = new THREE.Vector3();
  pitch = 0;
  roll = 0;
  heave = 0;
  flameGeometry: THREE.ConeGeometry;
  flameMaterial: THREE.MeshBasicMaterial;
  flames: THREE.Mesh[];

  constructor(root: THREE.Object3D, wheels: readonly BuggyWheel[]) {
    this.root = root;
    this.body = root.getObjectByName('buggy-body')!;
    this.bodyRestY = this.body.position.y;
    this.wheels = wheels.map((wheel, index) => ({ ...wheel,
      travel: root.getObjectByName(`wheel-travel-${index}`)!,
      steer: root.getObjectByName(`wheel-steer-${index}`)!,
      spin: root.getObjectByName(`wheel-spin-${index}`)!,
      emitter: root.getObjectByName(`tire-emitter-${index}`)!,
    }));
    this.flameGeometry = new THREE.ConeGeometry(0.105, 0.55, 10);
    this.flameGeometry.rotateX(-Math.PI / 2);
    this.flameMaterial = new THREE.MeshBasicMaterial({ color: 0x67dfff, transparent: true,
      opacity: 0.82, depthWrite: false, blending: THREE.AdditiveBlending });
    this.flames = [0, 1].map(index => {
      const flame = new THREE.Mesh(this.flameGeometry, this.flameMaterial);
      flame.position.z = -0.26;
      root.getObjectByName(`nitro-emitter-${index}`)!.add(flame);
      flame.visible = false;
      return flame;
    });
  }

  update(pose: BuggyPose, deltaSeconds: number, smoke: TireSmokeEmitter | null = null) {
    const dt = clamp(Number(deltaSeconds) || 0, 0, 0.25);
    const longitudinal = pose.finished ? 0 : Number(pose.longitudinalSpeed) || 0;
    const lateral = pose.finished ? 0 : Number(pose.lateralSpeed) || 0;
    const steer = pose.finished ? 0 : clamp(Number(pose.steer) || 0, -1, 1);
    const acceleration = pose.finished ? 0 : clamp(Number(pose.longitudinalAcceleration) || 0, -30, 30);
    const impact = pose.finished ? 0 : clamp(Number(pose.impactSpeed) || 0, 0, 20);
    this.pitch = follow(this.pitch, clamp(-acceleration * 0.002, -0.045, 0.045), dt);
    this.roll = follow(this.roll, clamp(steer * Math.abs(longitudinal) * 0.0015, -0.045, 0.045), dt);
    this.heave = follow(this.heave, -impact * 0.0015, dt);
    this.body.rotation.x = this.pitch;
    this.body.rotation.z = this.roll;
    this.body.position.y = this.bodyRestY + this.heave;
    for (const wheel of this.wheels) {
      // +X axle rotation rolls +Z forward; signed speed naturally reverses it.
      wheel.spin.rotation.x = (wheel.spin.rotation.x + longitudinal * dt / wheel.radius) % (Math.PI * 2);
      wheel.steer.rotation.y = wheel.front ? follow(wheel.steer.rotation.y, steer * 0.42, dt) : 0;
      // Tires stay on the track. Body pitch/roll supplies visual spring travel
      // without translating the axle or making the wheels float.
    }
    for (const flame of this.flames) flame.visible = !pose.finished && Boolean(pose.nitroActive);
    if (smoke) {
      const intensity = slipSmokeIntensity(longitudinal, lateral);
      this.root.updateMatrixWorld(true);
      for (const [index, wheel] of this.wheels.entries()) {
        wheel.emitter.getWorldPosition(this.position);
        smoke.emit(this.position, intensity * (wheel.front ? 0.4 : 1), dt, index);
      }
    }
  }

  destroy() {
    for (const flame of this.flames) flame.removeFromParent();
    this.flameGeometry.dispose(); this.flameMaterial.dispose();
  }
}
