import * as THREE from 'three';
import RAPIER, { type DynamicRayCastVehicleController, type RigidBody, type World } from '@dimforge/rapier3d-compat';
import { createLabTrackChunks, LAB_TRACK_WIDTH, type LabTrackChunk } from './trackGeometry.ts';

export const LAB_FIXED_DT = 1 / 60;
const MAX_FRAME_DT = 0.1;
const MAX_SUBSTEPS = 6;
const GRAVITY = 9.81;
const FORWARD_AXIS = new THREE.Vector3(1, 0, 0);
const CHASSIS_UP = new THREE.Vector3(0, 1, 0);
const LOCAL_PITCH_AXIS = new THREE.Vector3(0, 0, 1);
const INITIAL_ROTATION = { x: 0, y: -Math.SQRT1_2, z: 0, w: Math.SQRT1_2 };

/** Prototype tuning: meters, kilograms, seconds, newtons, radians. */
export const LAB_TUNING = Object.freeze({
  chassisMassKg: 14,
  chassisHalfExtents: Object.freeze({ x: 1.15, y: 0.28, z: 0.62 }),
  wheelRadiusM: 0.34,
  suspensionRestLengthM: 0.38,
  suspensionMaxTravelM: 0.25,
  suspensionStiffness: 85,
  suspensionCompressionDamping: 9,
  suspensionRelaxationDamping: 7,
  suspensionMaxForceN: 800,
  wheelFrictionSlip: 4.5,
  wheelSideFriction: 1.45,
  engineForcePerRearWheelN: 55,
  reverseForcePerRearWheelN: 28,
  brakeForcePerWheelN: 48,
  maxForwardSpeedMps: 24,
  maxSteeringRadians: 0.42,
  angularDamping: 0.18,
  pitchAssistKp: 18,
  pitchAssistKd: 10,
  pitchAssistMaxTorqueNm: 8,
  noseDownBiasRadians: 0.2,
  pitchAssistLookAheadSeconds: 0.4,
});

export interface LabControls {
  throttle: number;
  brake: number;
  steer: number;
}

export interface LabWheelState {
  index: number;
  label: string;
  inContact: boolean;
  suspensionLengthM: number;
  compressionM: number;
  suspensionForceN: number;
  contactPoint: THREE.Vector3 | null;
  contactNormal: THREE.Vector3 | null;
  hardPoint: THREE.Vector3;
  rayDirection: THREE.Vector3;
  rotation: number;
}

export interface LabSnapshot {
  position: THREE.Vector3;
  rotation: THREE.Quaternion;
  linearVelocity: THREE.Vector3;
  angularVelocity: THREE.Vector3;
  horizontalSpeedMps: number;
  verticalSpeedMps: number;
  pitchRadians: number;
  rollRadians: number;
  airborne: boolean;
  grounded: boolean;
  landingContactOrder: string[];
  takeoffCount: number;
  landingCount: number;
  wheels: LabWheelState[];
  lastEvent: string;
  assistApplied: boolean;
  assistTargetPitch: number | null;
  assistTorqueNm: number;
  droppedSimulationSeconds: number;
}

type WheelSpec = { label: string; front: boolean; position: { x: number; y: number; z: number } };

const WHEELS: readonly WheelSpec[] = Object.freeze([
  { label: 'DIANTEIRA ESQUERDA', front: true, position: { x: 0.82, y: -0.16, z: 0.48 } },
  { label: 'DIANTEIRA DIREITA', front: true, position: { x: 0.82, y: -0.16, z: -0.48 } },
  { label: 'TRASEIRA ESQUERDA', front: false, position: { x: -0.82, y: -0.16, z: 0.48 } },
  { label: 'TRASEIRA DIREITA', front: false, position: { x: -0.82, y: -0.16, z: -0.48 } },
]);

let rapierInitialization: Promise<void> | null = null;

export function initializeRapierLab(): Promise<void> {
  rapierInitialization ??= RAPIER.init();
  return rapierInitialization;
}

function vector3(value: { x: number; y: number; z: number }): THREE.Vector3 {
  return new THREE.Vector3(value.x, value.y, value.z);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function createTerrainColliders(world: World, chunks: readonly LabTrackChunk[]): Set<number> {
  const trackColliderHandles = new Set<number>();
  for (const chunk of chunks) {
    const collider = world.createCollider(RAPIER.ColliderDesc.trimesh(chunk.vertices, chunk.indices)
      .setFriction(1.1).setRestitution(0));
    trackColliderHandles.add(collider.handle);
  }
  // A remote safety floor catches a fall without masking the actual road
  // collision used for wheel support or landing orientation queries.
  world.createCollider(RAPIER.ColliderDesc.cuboid(100, 0.5, 100)
    .setTranslation(0, -16, 55).setFriction(0.8).setRestitution(0));
  return trackColliderHandles;
}

export class RapierVehicleLab {
  readonly world: World;
  readonly chassis: RigidBody;
  readonly chassisCollider: ReturnType<World['createCollider']>;
  readonly vehicle: DynamicRayCastVehicleController;
  readonly trackChunks: readonly LabTrackChunk[];
  readonly trackColliderHandles: ReadonlySet<number>;
  accumulator = 0;
  droppedSimulationSeconds = 0;
  airborne = false;
  hasBeenGrounded = false;
  hasTakenOff = false;
  takeoffCount = 0;
  landingCount = 0;
  lastEvent = 'AGUARDANDO CONTATO COM A PISTA';
  assistTargetPitch: number | null = null;
  assistTorqueNm = 0;
  previousWheelContacts = [false, false, false, false];
  landingContactOrder: number[] = [];
  previousPosition = new THREE.Vector3();
  currentPosition = new THREE.Vector3();
  previousRotation = new THREE.Quaternion();
  currentRotation = new THREE.Quaternion();
  readonly ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 });
  private destroyed = false;

  constructor() {
    if (!rapierInitialization) throw new Error('initializeRapierLab() precisa terminar antes de criar o veículo.');
    this.world = new RAPIER.World({ x: 0, y: -GRAVITY, z: 0 });
    this.world.timestep = LAB_FIXED_DT;
    this.world.integrationParameters.numSolverIterations = 8;
    this.world.maxCcdSubsteps = 4;
    this.trackChunks = createLabTrackChunks();
    this.trackColliderHandles = createTerrainColliders(this.world, this.trackChunks);

    this.chassis = this.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(0, 1.15, 6)
      .setRotation(INITIAL_ROTATION)
      .setLinearDamping(0.035)
      .setAngularDamping(LAB_TUNING.angularDamping)
      .setCanSleep(false)
      .setCcdEnabled(true));
    this.chassisCollider = this.world.createCollider(RAPIER.ColliderDesc.cuboid(
      LAB_TUNING.chassisHalfExtents.x, LAB_TUNING.chassisHalfExtents.y, LAB_TUNING.chassisHalfExtents.z,
    ).setMass(LAB_TUNING.chassisMassKg).setFriction(0.6).setRestitution(0), this.chassis);

    // Rapier's vehicle controller defaults to local +X forward, +Y up and +Z
    // axle. The initial -90° yaw points local +X down the world +Z test runway.
    this.vehicle = this.world.createVehicleController(this.chassis);
    WHEELS.forEach(wheel => {
      this.vehicle.addWheel(wheel.position, { x: 0, y: -1, z: 0 }, { x: 0, y: 0, z: 1 },
        LAB_TUNING.suspensionRestLengthM, LAB_TUNING.wheelRadiusM);
      const index = this.vehicle.numWheels() - 1;
      this.vehicle.setWheelMaxSuspensionTravel(index, LAB_TUNING.suspensionMaxTravelM);
      this.vehicle.setWheelSuspensionStiffness(index, LAB_TUNING.suspensionStiffness);
      this.vehicle.setWheelSuspensionCompression(index, LAB_TUNING.suspensionCompressionDamping);
      this.vehicle.setWheelSuspensionRelaxation(index, LAB_TUNING.suspensionRelaxationDamping);
      this.vehicle.setWheelMaxSuspensionForce(index, LAB_TUNING.suspensionMaxForceN);
      this.vehicle.setWheelFrictionSlip(index, LAB_TUNING.wheelFrictionSlip);
      this.vehicle.setWheelSideFrictionStiffness(index, LAB_TUNING.wheelSideFriction);
    });
    this.reset();
  }

  get fixedStep() { return LAB_FIXED_DT; }

  /** Accumulates render time but always advances Rapier in the same fixed steps. */
  advance(frameSeconds: number, controls: LabControls, pitchAssist: boolean): number {
    if (this.destroyed) return 0;
    const frame = clamp(Number(frameSeconds) || 0, 0, MAX_FRAME_DT);
    this.accumulator += frame;
    let steps = 0;
    while (this.accumulator >= LAB_FIXED_DT && steps < MAX_SUBSTEPS) {
      this.step(controls, pitchAssist);
      this.accumulator -= LAB_FIXED_DT;
      steps += 1;
    }
    if (this.accumulator >= LAB_FIXED_DT) {
      const remainder = this.accumulator % LAB_FIXED_DT;
      this.droppedSimulationSeconds += this.accumulator - remainder;
      this.accumulator = remainder;
    }
    return this.accumulator / LAB_FIXED_DT;
  }

  step(controls: LabControls, pitchAssist = true): void {
    if (this.destroyed) return;
    this.previousPosition.copy(vector3(this.chassis.translation()));
    this.previousRotation.copy(this.toThreeRotation(this.chassis.rotation()));
    const speed = this.vehicle.currentVehicleSpeed();
    const throttle = clamp(controls.throttle, -1, 1);
    const brake = clamp(controls.brake, 0, 1);
    const steer = clamp(controls.steer, -1, 1);
    const speedSteeringScale = clamp(1 - Math.abs(speed) / LAB_TUNING.maxForwardSpeedMps * 0.55, 0.38, 1);
    for (let wheel = 0; wheel < WHEELS.length; wheel += 1) {
      const spec = WHEELS[wheel]!;
      this.vehicle.setWheelSteering(wheel, spec.front
        ? steer * LAB_TUNING.maxSteeringRadians * speedSteeringScale : 0);
      this.vehicle.setWheelBrake(wheel, brake * LAB_TUNING.brakeForcePerWheelN);
      let engineForce = 0;
      if (!spec.front) {
        const forwardGovernor = clamp((LAB_TUNING.maxForwardSpeedMps - speed) / 4, 0, 1);
        if (throttle > 0) engineForce = throttle * LAB_TUNING.engineForcePerRearWheelN * forwardGovernor;
        else if (throttle < 0) engineForce = throttle * LAB_TUNING.reverseForcePerRearWheelN;
      }
      this.vehicle.setWheelEngineForce(wheel, engineForce);
    }
    this.vehicle.updateVehicle(LAB_FIXED_DT, RAPIER.QueryFilterFlags.EXCLUDE_DYNAMIC);
    this.assistTorqueNm = pitchAssist ? this.applyAirPitchAssist() : 0;
    if (!pitchAssist) this.assistTargetPitch = null;
    this.world.step();
    this.updateContactTransitions();
    this.currentPosition.copy(vector3(this.chassis.translation()));
    this.currentRotation.copy(this.toThreeRotation(this.chassis.rotation()));
  }

  snapshot(): LabSnapshot {
    const position = vector3(this.chassis.translation());
    const rotation = this.toThreeRotation(this.chassis.rotation());
    const linearVelocity = vector3(this.chassis.linvel());
    const angularVelocity = vector3(this.chassis.angvel());
    const forward = FORWARD_AXIS.clone().applyQuaternion(rotation).normalize();
    const localPitch = this.localPitch(rotation);
    const up = CHASSIS_UP.clone().applyQuaternion(rotation).normalize();
    const side = new THREE.Vector3(0, 0, 1).applyQuaternion(rotation).normalize();
    const roll = Math.atan2(-side.y, up.y);
    const wheels = WHEELS.map((spec, index): LabWheelState => {
      const rawLength = this.vehicle.wheelSuspensionLength(index);
      const suspensionLengthM = rawLength ?? LAB_TUNING.suspensionRestLengthM + LAB_TUNING.suspensionMaxTravelM;
      const contact = this.vehicle.wheelIsInContact(index);
      const hard = this.vehicle.wheelHardPoint(index);
      const direction = this.vehicle.wheelDirectionCs(index);
      const contactPoint = contact ? this.vehicle.wheelContactPoint(index) : null;
      const contactNormal = contact ? this.vehicle.wheelContactNormal(index) : null;
      return {
        index, label: spec.label, inContact: contact, suspensionLengthM,
        compressionM: clamp(LAB_TUNING.suspensionRestLengthM - suspensionLengthM,
          -LAB_TUNING.suspensionMaxTravelM, LAB_TUNING.suspensionMaxTravelM),
        suspensionForceN: this.vehicle.wheelSuspensionForce(index) ?? 0,
        contactPoint: contactPoint ? vector3(contactPoint) : null,
        contactNormal: contactNormal ? vector3(contactNormal) : null,
        hardPoint: hard ? vector3(hard) : position.clone(),
        rayDirection: direction ? vector3(direction).applyQuaternion(rotation).normalize() : new THREE.Vector3(0, -1, 0),
        rotation: this.vehicle.wheelRotation(index) ?? 0,
      };
    });
    const grounded = wheels.some(wheel => wheel.inContact);
    return {
      position, rotation, linearVelocity, angularVelocity,
      horizontalSpeedMps: Math.hypot(linearVelocity.x, linearVelocity.z),
      verticalSpeedMps: linearVelocity.y,
      pitchRadians: localPitch,
      rollRadians: roll,
      airborne: !grounded,
      grounded,
      landingContactOrder: this.landingContactOrder.map(index => WHEELS[index]!.label),
      takeoffCount: this.takeoffCount,
      landingCount: this.landingCount,
      wheels,
      lastEvent: this.lastEvent,
      assistApplied: Math.abs(this.assistTorqueNm) > 1e-4,
      assistTargetPitch: this.assistTargetPitch,
      assistTorqueNm: this.assistTorqueNm,
      droppedSimulationSeconds: this.droppedSimulationSeconds,
    };
  }

  interpolatedPose(alpha: number): { position: THREE.Vector3; rotation: THREE.Quaternion } {
    const t = clamp(alpha, 0, 1);
    return {
      position: this.previousPosition.clone().lerp(this.currentPosition, t),
      rotation: this.previousRotation.clone().slerp(this.currentRotation, t),
    };
  }

  reset(): void {
    if (this.destroyed) return;
    this.chassis.setTranslation({ x: 0, y: 0.9, z: 6 }, true);
    this.chassis.setRotation(INITIAL_ROTATION, true);
    this.chassis.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.chassis.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.accumulator = 0;
    this.droppedSimulationSeconds = 0;
    this.airborne = false;
    this.hasBeenGrounded = false;
    this.hasTakenOff = false;
    this.takeoffCount = 0;
    this.landingCount = 0;
    this.lastEvent = 'RESET — AGUARDANDO CONTATO';
    this.assistTargetPitch = null;
    this.assistTorqueNm = 0;
    this.landingContactOrder = [];
    this.previousWheelContacts = WHEELS.map(() => false);
    this.previousPosition.set(0, 0.9, 6);
    this.currentPosition.copy(this.previousPosition);
    this.previousRotation.copy(this.toThreeRotation(INITIAL_ROTATION));
    this.currentRotation.copy(this.previousRotation);
  }

  debugRenderBuffers() { return this.world.debugRender(); }

  getTrackColliderHandles() { return this.trackColliderHandles; }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.world.free();
  }

  private updateContactTransitions(): void {
    const contacts = WHEELS.map((_, index) => this.vehicle.wheelIsInContact(index));
    const wasGrounded = this.previousWheelContacts.some(Boolean);
    const isGrounded = contacts.some(Boolean);
    this.airborne = !isGrounded;
    contacts.forEach((contact, index) => {
      if (this.hasTakenOff && contact && !this.previousWheelContacts[index] && !this.landingContactOrder.includes(index)) {
        this.landingContactOrder.push(index);
      }
    });
    if (this.hasBeenGrounded && wasGrounded && !isGrounded) {
      this.landingContactOrder = [];
      this.hasTakenOff = true;
      this.takeoffCount += 1;
      this.lastEvent = `DECOLAGEM — ${this.vehicle.currentVehicleSpeed().toFixed(1)} m/s`;
    } else if (this.hasTakenOff && !wasGrounded && isGrounded) {
      const order = this.landingContactOrder.map(index => WHEELS[index]!.label).join(' → ');
      this.landingCount += 1;
      this.lastEvent = order ? `ATERRISSAGEM — ${order}` : 'ATERRISSAGEM — CONTATO DAS RODAS';
      this.hasTakenOff = false;
    }
    if (isGrounded) this.hasBeenGrounded = true;
    this.previousWheelContacts = contacts;
  }

  private applyAirPitchAssist(): number {
    const contacts = WHEELS.some((_, index) => this.vehicle.wheelIsInContact(index));
    const velocity = this.chassis.linvel();
    if (contacts || velocity.y >= -0.15) {
      this.assistTargetPitch = null;
      return 0;
    }
    const position = this.chassis.translation();
    const lookAhead = LAB_TUNING.pitchAssistLookAheadSeconds;
    const rayOrigin = { x: position.x + velocity.x * lookAhead, y: position.y + 8, z: position.z + velocity.z * lookAhead };
    this.ray.origin = rayOrigin;
    this.ray.dir = { x: 0, y: -1, z: 0 };
    const hit = this.world.castRayAndGetNormal(this.ray, 30, true,
      RAPIER.QueryFilterFlags.EXCLUDE_DYNAMIC, undefined, undefined, undefined,
      collider => this.trackColliderHandles.has(collider.handle));
    if (!hit) {
      this.assistTargetPitch = null;
      return 0;
    }
    const surfaceY = rayOrigin.y - hit.timeOfImpact;
    const heightAboveSurface = position.y - surfaceY;
    if (heightAboveSurface <= 0) {
      this.assistTargetPitch = null;
      return 0;
    }
    const impactDiscriminant = velocity.y ** 2 + 2 * GRAVITY * heightAboveSurface;
    const timeToImpact = (velocity.y + Math.sqrt(impactDiscriminant)) / GRAVITY;
    if (!Number.isFinite(timeToImpact) || timeToImpact <= 0 || timeToImpact > 1.8) {
      this.assistTargetPitch = null;
      return 0;
    }

    const rotation = this.toThreeRotation(this.chassis.rotation());
    const groundNormal = vector3(hit.normal).normalize();
    const horizontalForward = new THREE.Vector3(velocity.x, 0, velocity.z).normalize();
    const projectedForward = horizontalForward.addScaledVector(groundNormal,
      -horizontalForward.dot(groundNormal)).normalize();
    const surfacePitch = Math.atan2(projectedForward.y,
      Math.hypot(projectedForward.x, projectedForward.z));
    const nearLanding = clamp(1 - timeToImpact / 1.8, 0, 1);
    const targetPitch = surfacePitch - LAB_TUNING.noseDownBiasRadians * nearLanding;
    this.assistTargetPitch = targetPitch;

    const currentPitch = this.localPitch(rotation);
    const angularVelocityLocal = vector3(this.chassis.angvel()).applyQuaternion(rotation.clone().invert());
    const pitchRate = angularVelocityLocal.z;
    const torque = clamp((targetPitch - currentPitch) * LAB_TUNING.pitchAssistKp
      - pitchRate * LAB_TUNING.pitchAssistKd,
    -LAB_TUNING.pitchAssistMaxTorqueNm, LAB_TUNING.pitchAssistMaxTorqueNm);
    const axisWorld = LOCAL_PITCH_AXIS.clone().applyQuaternion(rotation).normalize();
    this.chassis.addTorque({ x: axisWorld.x * torque, y: axisWorld.y * torque, z: axisWorld.z * torque }, true);
    return torque;
  }

  private localPitch(rotation: THREE.Quaternion): number {
    const forward = FORWARD_AXIS.clone().applyQuaternion(rotation).normalize();
    return Math.atan2(forward.y, Math.hypot(forward.x, forward.z));
  }

  private toThreeRotation(rotation: { x: number; y: number; z: number; w: number }): THREE.Quaternion {
    return new THREE.Quaternion(rotation.x, rotation.y, rotation.z, rotation.w).normalize();
  }
}

export { LAB_TRACK_WIDTH };
