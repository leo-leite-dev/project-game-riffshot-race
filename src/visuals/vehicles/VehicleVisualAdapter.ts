import * as THREE from 'three';
import { slipSmokeIntensity, type TireSmokeEmitter } from './TireSmoke.ts';
import type { VehicleWheelSpec } from './vehicleWheelGeometry.ts';

interface VehicleTelemetry {
  readonly finished?: boolean;
  readonly longitudinalSpeed?: number;
  readonly lateralSpeed?: number;
  readonly steer?: number;
}

type WheelNodes = VehicleWheelSpec & {
  steer: THREE.Object3D;
  spin: THREE.Object3D;
};

// Instance-only child transforms. GPU geometry/materials belong to the template.
export class VehicleVisualAdapter {
  root: THREE.Object3D;
  disposed = false;
  wheels: WheelNodes[];
  scale = new THREE.Vector3();
  position = new THREE.Vector3();
  mixer: THREE.AnimationMixer | null = null;

  constructor(root: THREE.Object3D, wheels: readonly VehicleWheelSpec[], clips: THREE.AnimationClip[] = []) {
    this.root = root;
    this.wheels = wheels.map(spec => ({ ...spec,
      steer: root.getObjectByName(`vehicle-wheel-steer-${spec.index}`)!,
      spin: root.getObjectByName(`vehicle-wheel-spin-${spec.index}`)!,
    }));
    if (clips.length) {
      this.mixer = new THREE.AnimationMixer(root);
      for (const clip of clips) this.mixer.clipAction(clip).play();
    }
  }

  update(telemetry: VehicleTelemetry, deltaSeconds: number, smoke: TireSmokeEmitter | null = null) {
    if (this.disposed) return;
    const dt = THREE.MathUtils.clamp(Number(deltaSeconds) || 0, 0, 0.25);
    const speed = telemetry.finished ? 0 : Number(telemetry.longitudinalSpeed) || 0;
    const steer = telemetry.finished ? 0 : THREE.MathUtils.clamp(Number(telemetry.steer) || 0, -1, 1);
    // Main may scale the entire race vehicle (currently 1.3). Signed speed is in
    // world units; the radius must include the root/ancestor world scale once.
    this.root.getWorldScale(this.scale);
    const radiusScale = Math.max(Math.abs(this.scale.y), 1e-8);
    for (const wheel of this.wheels) {
      wheel.spin.rotation.x = (wheel.spin.rotation.x + speed * dt / (wheel.radius * radiusScale)) % (Math.PI * 2);
      wheel.steer.rotation.y = wheel.front ? steer * 0.42 : 0;
    }
    this.mixer?.update(dt);
    if (smoke) {
      const lateral = telemetry.finished ? 0 : Number(telemetry.lateralSpeed) || 0;
      const intensity = slipSmokeIntensity(speed, lateral);
      this.root.updateMatrixWorld(true);
      for (const wheel of this.wheels) {
        this.position.set(0, -wheel.radius, 0);
        wheel.steer.localToWorld(this.position);
        smoke.emit(this.position, intensity * (wheel.front ? 0.4 : 1), dt, wheel.index);
      }
    }
  }

  destroy() {
    if (this.disposed) return;
    this.disposed = true;
    this.mixer?.stopAllAction();
    this.mixer?.uncacheRoot(this.root);
    this.wheels.length = 0;
  }
}
