import * as THREE from 'three';
import RAPIER, { type DynamicRayCastVehicleController, type RigidBody, type World } from '@dimforge/rapier3d-compat';
import { createLabTrackChunks, DEFAULT_LAB_TRACK_CONFIG, LAB_TRACK_WIDTH,
  type LabTrackChunk, type LabTrackConfig } from './trackGeometry.ts';
import { deriveHandlingStats, RACE_HANDLING_TUNING } from '../race/RaceSimulation.ts';

export const LAB_FIXED_DT = 1 / 60;
const MAX_FRAME_DT = 0.1;
const MAX_SUBSTEPS = 6;
const GRAVITY = 9.81;
const BARRIER_HALF_HEIGHT_M = 0.48;
const BARRIER_HALF_THICKNESS_M = 0.32;
const BARRIER_SEGMENT_OVERLAP_M = 0.12;
const BARRIER_CORNER_RADIUS_M = 0.28;
const FORWARD_AXIS = new THREE.Vector3(1, 0, 0);
const CHASSIS_UP = new THREE.Vector3(0, 1, 0);
const LOCAL_PITCH_AXIS = new THREE.Vector3(0, 0, 1);
const INITIAL_ROTATION = { x: 0, y: -Math.SQRT1_2, z: 0, w: Math.SQRT1_2 };
const ARCADE_REFERENCE = deriveHandlingStats();
const LAB_WHEELBASE_M = 1.64;

/** Prototype tuning: meters, kilograms, seconds, newtons, radians. */
export const LAB_TUNING = Object.freeze({
  chassisMassKg: 14,
  chassisHalfExtents: Object.freeze({ x: 1.15, y: 0.28, z: 0.62 }),
  chassisColliderCornerRadiusM: 0.1,
  chassisCenterOfMassDropM: 0.1,
  wheelRadiusM: 0.34,
  suspensionRestLengthM: 0.46,
  suspensionMaxTravelM: 0.35,
  suspensionStiffness: 58,
  suspensionCompressionDamping: 10,
  suspensionRelaxationDamping: 10,
  suspensionMaxForceN: 120,
  wheelFrictionSlip: 2.6,
  wheelSideFriction: 0.9,
  engineForcePerFrontWheelN: 36,
  engineForcePerRearWheelN: 36,
  reverseForcePerRearWheelN: 28,
  // Rapier's `setWheelBrake` is documented as a maximum braking impulse, not N.
  // Large values therefore stop instantly and kick the chassis into a nose dive.
  brakeImpulsePerWheel: 0.3,
  maxForwardSpeedMps: 24,
  maxSteeringRadians: 0.24,
  steeringResponsePerSecond: 5,
  rampEdgeSteeringBufferM: 4.2,
  edgeCounterSteerStartMarginM: 3,
  minimumEdgeSteeringScale: 0.45,
  edgeCounterSteerStrength: 0.65,
  rampSteeringScale: 0.04,
  carriedRampAirSteeringScale: 0.15,
  partialSupportSteeringFactor: 0.8,
  tripleSupportSteeringFactor: 0.9,
  singleSupportSteeringFactor: 0.65,
  crossAxleSupportSteeringFactor: 0.75,
  maxSteeringSlopeRadians: 0.65,
  slopeSteeringReduction: 0.15,
  steeringSupportAttackRate: 16,
  steeringSupportRecoveryRate: 6,
  angularDamping: 0.65,
  uprightGroundKp: 8,
  uprightGroundKd: 6,
  uprightGroundMaxTorqueNm: 22,
  uprightTerrainPitchKp: 3,
  uprightTerrainPitchKd: 4,
  uprightTerrainPitchMaxTorqueNm: 8,
  uprightPartialSupportTorqueScale: 0.55,
  uprightSupportBlendRate: 8,
  uprightAirKp: 18,
  uprightAirKd: 12,
  uprightAirMaxTorqueNm: 36,
  // A/D alters the flight path without carrying a full-strength lateral impulse into landing.
  airLateralAccelerationMps2: 0.6,
  neutralGroundLateralDampingPerSecond: 3,
  airYawDampingKp: 5,
  airYawMaxTorqueNm: 14,
  groundPitchRateLimitRadPerSecond: 3.2,
  groundRollRateLimitRadPerSecond: 1.8,
  partialSupportYawRateLimitRadPerSecond: 0.6,
  airPitchRateLimitRadPerSecond: 0.85,
  assistedAirPitchRateLimitRadPerSecond: 2.2,
  airRollRateLimitRadPerSecond: 1.2,
  groundYawRateLimitRadPerSecond: 1.5,
  airPitchRateDampingNmPerRadPerSecond: 4,
  airPitchRateDampingMaxNm: 8,
  airYawRateLimitRadPerSecond: 0.85,
  maxAngularRateCorrectionImpulseNmS: 12,
  pitchAssistKp: 14,
  pitchAssistKd: 7,
  pitchAssistMaxTorqueNm: 9,
  noseDownBiasRadians: 0.14,
  pitchAssistNoseDownThresholdRadians: 0,
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
  forwardImpulse: number;
  sideImpulse: number;
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
  simulationTimeSeconds: number;
  takeoffTimeSeconds: number | null;
  landingTimeSeconds: number | null;
  lastAirTimeSeconds: number | null;
  peakPitchRadians: number;
  peakRollRadians: number;
  peakAngularSpeedRadPerSecond: number;
  peakSuspensionForceN: number;
  peakForwardImpulse: number;
  peakSideImpulse: number;
  uprightMode: 'ground' | 'partial' | 'air';
  uprightTorqueNm: number;
  uprightErrorRadians: number;
  supportContactCount: number;
  yawRateRadPerSecond: number;
  airYawTargetRadPerSecond: number;
  airYawTorqueNm: number;
  groundYawTargetRadPerSecond: number;
  groundYawTorqueNm: number;
  steeringApplied: number;
  rearPowerSlip: number;
  steeringSupportScale: number;
  steeringEdgeScale: number;
  steeringEdgeCorrection: number;
  angularRateCorrectionImpulseNmS: number;
  massKg: number;
  localCenterOfMass: THREE.Vector3;
  principalInertia: THREE.Vector3;
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
type GroundSupport = {
  normal: THREE.Vector3;
  contacts: number;
  frontContacts: number;
  rearContacts: number;
  confidence: number;
};

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

function createBarrierSegment(
  world: World,
  edgeStart: THREE.Vector3,
  edgeEnd: THREE.Vector3,
  roadStart: THREE.Vector3,
  roadEnd: THREE.Vector3,
): ReturnType<World['createCollider']> | null {
  const tangent = roadEnd.clone().sub(roadStart);
  const segmentLength = tangent.length();
  if (segmentLength < 1e-4) return null;
  tangent.multiplyScalar(1 / segmentLength);

  const edgeMidpoint = edgeStart.clone().add(edgeEnd).multiplyScalar(0.5);
  const roadMidpoint = roadStart.clone().add(roadEnd).multiplyScalar(0.5);
  const outward = edgeMidpoint.clone().sub(roadMidpoint).projectOnPlane(tangent).normalize();
  let wallUp = tangent.clone().cross(outward).normalize();
  if (wallUp.y < 0) wallUp.negate();
  const wallSide = tangent.clone().cross(wallUp).normalize();
  const rotation = new THREE.Quaternion().setFromRotationMatrix(
    new THREE.Matrix4().makeBasis(tangent, wallUp, wallSide),
  );
  const position = edgeMidpoint.addScaledVector(wallUp, BARRIER_HALF_HEIGHT_M)
    .addScaledVector(outward, BARRIER_HALF_THICKNESS_M);
  return world.createCollider(RAPIER.ColliderDesc.roundCuboid(
    segmentLength / 2 + BARRIER_SEGMENT_OVERLAP_M,
    BARRIER_HALF_HEIGHT_M,
    BARRIER_HALF_THICKNESS_M,
    BARRIER_CORNER_RADIUS_M,
  )
    .setTranslation(position.x, position.y, position.z)
    .setRotation({ x: rotation.x, y: rotation.y, z: rotation.z, w: rotation.w })
    .setFriction(0.08).setRestitution(0));
}

function createTerrainColliders(world: World, chunks: readonly LabTrackChunk[]): {
  track: Set<number>;
  barriers: Set<number>;
} {
  const trackColliderHandles = new Set<number>();
  const barrierColliderHandles = new Set<number>();
  for (const chunk of chunks) {
    const collider = world.createCollider(RAPIER.ColliderDesc.trimesh(chunk.vertices, chunk.indices)
      .setFriction(1.1).setRestitution(0));
    trackColliderHandles.add(collider.handle);

    const sampleCount = chunk.vertices.length / 6;
    for (const sideIndex of [0, 1]) {
      for (let sample = 0; sample < sampleCount - 1; sample += 1) {
        const vertex = (sample: number, side: number) => {
          const offset = sample * 6 + side * 3;
          return new THREE.Vector3(chunk.vertices[offset]!, chunk.vertices[offset + 1]!, chunk.vertices[offset + 2]!);
        };
        const collider = createBarrierSegment(world, vertex(sample, sideIndex), vertex(sample + 1, sideIndex),
          vertex(sample, 0).add(vertex(sample, 1)).multiplyScalar(0.5),
          vertex(sample + 1, 0).add(vertex(sample + 1, 1)).multiplyScalar(0.5));
        if (collider) barrierColliderHandles.add(collider.handle);
      }
    }
  }
  // Connect the section endpoints too. The central road retains its jump gap,
  // while the side barriers continue beside the launch lip and landing deck.
  for (let chunkIndex = 0; chunkIndex < chunks.length - 1; chunkIndex += 1) {
    const current = chunks[chunkIndex]!;
    const next = chunks[chunkIndex + 1]!;
    const currentSamples = current.vertices.length / 6;
    const point = (chunk: LabTrackChunk, sample: number, side: number) => {
      const offset = sample * 6 + side * 3;
      return new THREE.Vector3(chunk.vertices[offset]!, chunk.vertices[offset + 1]!, chunk.vertices[offset + 2]!);
    };
    for (const side of [0, 1]) {
      const connector = createBarrierSegment(world,
        point(current, currentSamples - 1, side), point(next, 0, side),
        point(current, currentSamples - 1, 0).add(point(current, currentSamples - 1, 1)).multiplyScalar(0.5),
        point(next, 0, 0).add(point(next, 0, 1)).multiplyScalar(0.5));
      if (connector) barrierColliderHandles.add(connector.handle);
    }
  }
  // A remote safety floor catches a fall without masking the actual road
  // collision used for wheel support or landing orientation queries.
  world.createCollider(RAPIER.ColliderDesc.cuboid(100, 0.5, 100)
    .setTranslation(0, -16, 55).setFriction(0.8).setRestitution(0));
  return { track: trackColliderHandles, barriers: barrierColliderHandles };
}

export class RapierVehicleLab {
  readonly world: World;
  readonly chassis: RigidBody;
  readonly chassisCollider: ReturnType<World['createCollider']>;
  readonly vehicle: DynamicRayCastVehicleController;
  readonly trackChunks: readonly LabTrackChunk[];
  readonly trackConfig: Readonly<LabTrackConfig>;
  readonly trackColliderHandles: ReadonlySet<number>;
  readonly barrierColliderHandles: ReadonlySet<number>;
  accumulator = 0;
  droppedSimulationSeconds = 0;
  airborne = false;
  hasBeenGrounded = false;
  hasTakenOff = false;
  takeoffCount = 0;
  landingCount = 0;
  simulationTimeSeconds = 0;
  takeoffTimeSeconds: number | null = null;
  landingTimeSeconds: number | null = null;
  lastAirTimeSeconds: number | null = null;
  peakPitchRadians = 0;
  peakRollRadians = 0;
  peakAngularSpeedRadPerSecond = 0;
  peakSuspensionForceN = 0;
  peakForwardImpulse = 0;
  peakSideImpulse = 0;
  lastEvent = 'AGUARDANDO CONTATO COM A PISTA';
  assistTargetPitch: number | null = null;
  assistTorqueNm = 0;
  uprightMode: 'ground' | 'partial' | 'air' = 'air';
  uprightTorqueNm = 0;
  uprightErrorRadians = 0;
  supportContactCount = 0;
  terrainAlignmentUp = new THREE.Vector3(0, 1, 0);
  yawRateRadPerSecond = 0;
  airYawTargetRadPerSecond = 0;
  airYawTorqueNm = 0;
  groundYawTargetRadPerSecond = 0;
  groundYawTorqueNm = 0;
  steeringApplied = 0;
  rearPowerSlip = 0;
  steeringSupportScale = 1;
  steeringEdgeScale = 1;
  steeringEdgeCorrection = 0;
  angularRateCorrectionImpulseNmS = 0;
  previousWheelContacts = [false, false, false, false];
  landingContactOrder: number[] = [];
  previousPosition = new THREE.Vector3();
  currentPosition = new THREE.Vector3();
  previousRotation = new THREE.Quaternion();
  currentRotation = new THREE.Quaternion();
  readonly ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 });
  private destroyed = false;
  private steerCarriedIntoFlight = false;
  private driftBoost = 0;

  constructor(trackConfig: LabTrackConfig = { ...DEFAULT_LAB_TRACK_CONFIG }) {
    if (!rapierInitialization) throw new Error('initializeRapierLab() precisa terminar antes de criar o veículo.');
    this.world = new RAPIER.World({ x: 0, y: -GRAVITY, z: 0 });
    this.world.timestep = LAB_FIXED_DT;
    this.world.integrationParameters.numSolverIterations = 8;
    this.world.maxCcdSubsteps = 4;
    this.trackConfig = Object.freeze({ ...trackConfig });
    this.trackChunks = createLabTrackChunks(this.trackConfig);
    const colliderHandles = createTerrainColliders(this.world, this.trackChunks);
    this.trackColliderHandles = colliderHandles.track;
    this.barrierColliderHandles = colliderHandles.barriers;

    this.chassis = this.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(0, 1.15, 6)
      .setRotation(INITIAL_ROTATION)
      .setLinearDamping(0.035)
      .setAngularDamping(LAB_TUNING.angularDamping)
      .setCanSleep(false)
      .setCcdEnabled(true));
    const { x: halfX, y: halfY, z: halfZ } = LAB_TUNING.chassisHalfExtents;
    const drop = LAB_TUNING.chassisCenterOfMassDropM;
    const mass = LAB_TUNING.chassisMassKg;
    // Preserve the same cuboid contact shape, but place more of its mass low.
    // The inertia values include the parallel-axis shift for the lowered COM.
    const inertia = {
      x: mass / 3 * (halfY ** 2 + halfZ ** 2) + mass * drop ** 2,
      y: mass / 3 * (halfX ** 2 + halfZ ** 2),
      z: mass / 3 * (halfX ** 2 + halfY ** 2) + mass * drop ** 2,
    };
    this.chassisCollider = this.world.createCollider(RAPIER.ColliderDesc.roundCuboid(
      halfX, halfY, halfZ, LAB_TUNING.chassisColliderCornerRadiusM,
    )
      .setMassProperties(mass, { x: 0, y: -drop, z: 0 }, inertia, { x: 0, y: 0, z: 0, w: 1 })
      .setFriction(0.6).setRestitution(0), this.chassis);

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
    const targetSteer = clamp(controls.steer, -1, 1);
    this.steeringApplied += clamp(targetSteer - this.steeringApplied,
      -LAB_TUNING.steeringResponsePerSecond * LAB_FIXED_DT,
      LAB_TUNING.steeringResponsePerSecond * LAB_FIXED_DT);
    const steer = this.steeringApplied;
    this.steeringEdgeCorrection = this.updateSteeringEdgeScale(steer);
    const supportedSteer = clamp(steer * this.steeringSupportScale * this.steeringEdgeScale
      + this.steeringEdgeCorrection, -1, 1);
    const positionZ = this.chassis.translation().z;
    const isOnLaunchRamp = positionZ >= this.trackConfig.approachEndZ
      && positionZ < this.trackConfig.launchLipEndZ;
    const rampWheelSteer = clamp(steer * this.steeringSupportScale * this.steeringEdgeScale
      * (isOnLaunchRamp ? LAB_TUNING.rampSteeringScale : 1) + this.steeringEdgeCorrection, -1, 1);
    // Steering wheels have no traction in flight. Keep their angle neutral until
    // the jump is fully landed; A/D still guides the ballistic path below.
    const wheelSteer = this.hasTakenOff ? 0 : rampWheelSteer;
    const chassisRotation = this.toThreeRotation(this.chassis.rotation());
    const forward = FORWARD_AXIS.clone().applyQuaternion(chassisRotation);
    const planarLength = Math.hypot(forward.x, forward.z) || 1;
    const forwardX = forward.x / planarLength;
    const forwardZ = forward.z / planarLength;
    const velocity = this.chassis.linvel();
    const longitudinalSpeed = velocity.x * forwardX + velocity.z * forwardZ;
    const lateralSpeed = velocity.x * forwardZ - velocity.z * forwardX;
    const speedRatio = Math.abs(longitudinalSpeed) / ARCADE_REFERENCE.maxSpeed;
    const steeringAuthority = 1 / (1 + speedRatio * speedRatio * RACE_HANDLING_TUNING.highSpeedSteeringLoss);
    const targetYawRate = wheelSteer * ARCADE_REFERENCE.steering * steeringAuthority
      * clamp(Math.abs(longitudinalSpeed) / RACE_HANDLING_TUNING.steeringSpeedRamp, 0, 1)
      * Math.sign(longitudinalSpeed || 1);
    const steeringAngle = Math.atan(targetYawRate * LAB_WHEELBASE_M / (longitudinalSpeed || 0.5));
    const cornerLoad = clamp(Math.abs(lateralSpeed) / 6 + Math.abs(wheelSteer) * 0.7, 0, 1);
    const powerSlip = Math.max(0, throttle) * clamp(Math.abs(longitudinalSpeed) / ARCADE_REFERENCE.maxSpeed, 0, 1)
      * cornerLoad * RACE_HANDLING_TUNING.powerOversteer;
    this.rearPowerSlip = powerSlip;
    const driftDrive = longitudinalSpeed > 5 && speedRatio > 0.35 && brake === 0
      ? Math.max(0, throttle)
        * clamp((Math.abs(lateralSpeed) / Math.max(Math.hypot(velocity.x, velocity.z), 1) - 0.1) / 0.35, 0, 1)
      : 0;
    const driftResponse = 1 - Math.exp(-LAB_FIXED_DT * (driftDrive > this.driftBoost ? 6 : 2));
    this.driftBoost += (driftDrive - this.driftBoost) * driftResponse;
    const driftSpeedMultiplier = 1 + RACE_HANDLING_TUNING.driftSpeedBonus * this.driftBoost;
    const cornerYawRate = Math.abs(targetYawRate);
    const lateralDemand = Math.abs(longitudinalSpeed) * cornerYawRate;
    const lateralCapacity = ARCADE_REFERENCE.grip * RACE_HANDLING_TUNING.lateralAcceleration;
    const cornerOverload = clamp((lateralDemand - lateralCapacity) / Math.max(lateralCapacity, 1), 0, 1);
    const cornerForceScale = Math.max(0, 1 - RACE_HANDLING_TUNING.corneringSpeedDrag * cornerOverload * LAB_FIXED_DT);
    const brakeAuthority = clamp(ARCADE_REFERENCE.braking * LAB_FIXED_DT * this.chassis.mass() / 4
      / LAB_TUNING.brakeImpulsePerWheel, 0, 1);
    const brakeImpulse = brake * brakeAuthority * LAB_TUNING.brakeImpulsePerWheel;
    const forwardGovernor = clamp((LAB_TUNING.maxForwardSpeedMps * driftSpeedMultiplier - Math.abs(speed)) / 4, 0, 1);
    for (let wheel = 0; wheel < WHEELS.length; wheel += 1) {
      const spec = WHEELS[wheel]!;
      this.vehicle.setWheelSteering(wheel, spec.front
        ? clamp(steeringAngle, -LAB_TUNING.maxSteeringRadians, LAB_TUNING.maxSteeringRadians) : 0);
      this.vehicle.setWheelBrake(wheel, brakeImpulse);
      const arcadeForce = ARCADE_REFERENCE.acceleration * this.chassis.mass() / WHEELS.length;
      const engineForce = throttle > 0
        ? throttle * arcadeForce * forwardGovernor * driftSpeedMultiplier * cornerForceScale
        : !spec.front && throttle < 0
          ? throttle * Math.min(LAB_TUNING.reverseForcePerRearWheelN,
            ARCADE_REFERENCE.acceleration * this.chassis.mass() * 0.4 / 2)
          : 0;
      this.vehicle.setWheelEngineForce(wheel, engineForce);
      this.vehicle.setWheelSideFrictionStiffness(wheel,
        LAB_TUNING.wheelSideFriction * (spec.front ? 1 : 1 - powerSlip));
    }
    this.vehicle.updateVehicle(LAB_FIXED_DT, RAPIER.QueryFilterFlags.EXCLUDE_DYNAMIC);
    const support = this.currentGroundSupport();
    const predictedLanding = support ? null : this.predictLandingSurface();
    this.updateSteeringSupportScale(support);
    if (support) {
      const partialSurfaceUp = new THREE.Vector3(0, 1, 0).lerp(support.normal, support.confidence).normalize();
      this.terrainAlignmentUp.lerp(partialSurfaceUp, 1 - Math.exp(-LAB_FIXED_DT * LAB_TUNING.uprightSupportBlendRate)).normalize();
    } else {
      this.terrainAlignmentUp.lerp(new THREE.Vector3(0, 1, 0),
        1 - Math.exp(-LAB_FIXED_DT * LAB_TUNING.uprightSupportBlendRate)).normalize();
    }
    this.supportContactCount = support?.contacts ?? 0;
    this.angularRateCorrectionImpulseNmS = 0;
    this.uprightTorqueNm = this.applyArcadeUprightStabilizer(support, this.terrainAlignmentUp,
      predictedLanding?.normal ?? null, pitchAssist);
    this.assistTorqueNm = pitchAssist ? this.applyAirPitchAssist(predictedLanding) : 0;
    if (!pitchAssist) this.assistTargetPitch = null;
    if (!support) this.applyAirSteering(supportedSteer
      * (this.steerCarriedIntoFlight ? LAB_TUNING.carriedRampAirSteeringScale : 1));
    else if (Math.abs(steer) < 0.05) this.applyGroundLateralDamping();
    this.world.step();
    // Rapier integrates controller forces/torques in the fixed step. This
    // bounded angular impulse only trims rates that exceed the arcade envelope;
    // it preserves the physical pose and never touches linear/balistic velocity.
    // Use contacts after Rapier has resolved this step. A pre-step support
    // normal can be stale exactly when the landing/wall impact changes yaw.
    const resolvedSupport = this.currentGroundSupport();
    this.supportContactCount = resolvedSupport?.contacts ?? 0;
    this.angularRateCorrectionImpulseNmS += this.applyAngularRateGuard(resolvedSupport, predictedLanding);
    const resolvedYawAxis = resolvedSupport?.normal ?? predictedLanding?.normal ?? new THREE.Vector3(0, 1, 0);
    this.yawRateRadPerSecond = vector3(this.chassis.angvel()).dot(resolvedYawAxis);
    this.simulationTimeSeconds += LAB_FIXED_DT;
    this.updateContactTransitions();
    this.currentPosition.copy(vector3(this.chassis.translation()));
    this.currentRotation.copy(this.toThreeRotation(this.chassis.rotation()));
    const currentUp = CHASSIS_UP.clone().applyQuaternion(this.currentRotation).normalize();
    const currentSide = new THREE.Vector3(0, 0, 1).applyQuaternion(this.currentRotation).normalize();
    this.peakPitchRadians = Math.max(this.peakPitchRadians, Math.abs(this.localPitch(this.currentRotation)));
    this.peakRollRadians = Math.max(this.peakRollRadians, Math.abs(Math.atan2(-currentSide.y, currentUp.y)));
    this.peakAngularSpeedRadPerSecond = Math.max(this.peakAngularSpeedRadPerSecond,
      vector3(this.chassis.angvel()).length());
    for (let wheel = 0; wheel < WHEELS.length; wheel += 1) {
      this.peakSuspensionForceN = Math.max(this.peakSuspensionForceN, this.vehicle.wheelSuspensionForce(wheel) ?? 0);
      this.peakForwardImpulse = Math.max(this.peakForwardImpulse, Math.abs(this.vehicle.wheelForwardImpulse(wheel) ?? 0));
      this.peakSideImpulse = Math.max(this.peakSideImpulse, Math.abs(this.vehicle.wheelSideImpulse(wheel) ?? 0));
    }
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
        forwardImpulse: this.vehicle.wheelForwardImpulse(index) ?? 0,
        sideImpulse: this.vehicle.wheelSideImpulse(index) ?? 0,
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
      simulationTimeSeconds: this.simulationTimeSeconds,
      takeoffTimeSeconds: this.takeoffTimeSeconds,
      landingTimeSeconds: this.landingTimeSeconds,
      lastAirTimeSeconds: this.lastAirTimeSeconds,
      peakPitchRadians: this.peakPitchRadians,
      peakRollRadians: this.peakRollRadians,
      peakAngularSpeedRadPerSecond: this.peakAngularSpeedRadPerSecond,
      peakSuspensionForceN: this.peakSuspensionForceN,
      peakForwardImpulse: this.peakForwardImpulse,
      peakSideImpulse: this.peakSideImpulse,
      uprightMode: this.uprightMode,
      uprightTorqueNm: this.uprightTorqueNm,
      uprightErrorRadians: this.uprightErrorRadians,
      supportContactCount: this.supportContactCount,
      yawRateRadPerSecond: this.yawRateRadPerSecond,
      airYawTargetRadPerSecond: this.airYawTargetRadPerSecond,
      airYawTorqueNm: this.airYawTorqueNm,
      groundYawTargetRadPerSecond: this.groundYawTargetRadPerSecond,
      groundYawTorqueNm: this.groundYawTorqueNm,
      steeringApplied: this.steeringApplied,
      rearPowerSlip: this.rearPowerSlip,
      steeringSupportScale: this.steeringSupportScale,
      steeringEdgeScale: this.steeringEdgeScale,
      steeringEdgeCorrection: this.steeringEdgeCorrection,
      angularRateCorrectionImpulseNmS: this.angularRateCorrectionImpulseNmS,
      massKg: this.chassis.mass(),
      localCenterOfMass: vector3(this.chassis.localCom()),
      principalInertia: vector3(this.chassis.principalInertia()),
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
    this.chassis.resetForces(true);
    this.chassis.resetTorques(true);
    this.chassis.setTranslation({ x: 0, y: 0.9, z: 6 }, true);
    this.chassis.setRotation(INITIAL_ROTATION, true);
    this.chassis.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.chassis.setAngvel({ x: 0, y: 0, z: 0 }, true);
    WHEELS.forEach((_, index) => {
      this.vehicle.setWheelSteering(index, 0);
      this.vehicle.setWheelEngineForce(index, 0);
      this.vehicle.setWheelBrake(index, 0);
    });
    this.accumulator = 0;
    this.droppedSimulationSeconds = 0;
    this.airborne = false;
    this.hasBeenGrounded = false;
    this.hasTakenOff = false;
    this.steerCarriedIntoFlight = false;
    this.driftBoost = 0;
    this.takeoffCount = 0;
    this.landingCount = 0;
    this.simulationTimeSeconds = 0;
    this.takeoffTimeSeconds = null;
    this.landingTimeSeconds = null;
    this.lastAirTimeSeconds = null;
    this.steeringApplied = 0;
    this.rearPowerSlip = 0;
    this.steeringSupportScale = 1;
    this.steeringEdgeScale = 1;
    this.steeringEdgeCorrection = 0;
    this.peakPitchRadians = 0;
    this.peakRollRadians = 0;
    this.peakAngularSpeedRadPerSecond = 0;
    this.peakSuspensionForceN = 0;
    this.peakForwardImpulse = 0;
    this.peakSideImpulse = 0;
    this.uprightMode = 'air';
    this.uprightTorqueNm = 0;
    this.uprightErrorRadians = 0;
    this.supportContactCount = 0;
    this.terrainAlignmentUp.set(0, 1, 0);
    this.yawRateRadPerSecond = 0;
    this.airYawTargetRadPerSecond = 0;
    this.airYawTorqueNm = 0;
    this.groundYawTargetRadPerSecond = 0;
    this.groundYawTorqueNm = 0;
    this.angularRateCorrectionImpulseNmS = 0;
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

  getBarrierColliderHandles() { return this.barrierColliderHandles; }

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
      this.steerCarriedIntoFlight = Math.abs(this.steeringApplied) > 0.05;
      // Do not carry the ramp's filtered wheel angle into the flight controller.
      this.steeringApplied = 0;
      this.takeoffCount += 1;
      this.takeoffTimeSeconds = this.simulationTimeSeconds;
      this.lastEvent = `DECOLAGEM — ${this.vehicle.currentVehicleSpeed().toFixed(1)} m/s`;
    } else if (this.hasTakenOff && !wasGrounded && isGrounded) {
      const order = this.landingContactOrder.map(index => WHEELS[index]!.label).join(' → ');
      this.landingCount += 1;
      this.landingTimeSeconds = this.simulationTimeSeconds;
      this.lastAirTimeSeconds = this.takeoffTimeSeconds === null ? null
        : this.landingTimeSeconds - this.takeoffTimeSeconds;
      // Air steering has a separate purpose from front-wheel steering. Do not
      // carry its filtered input into the first grounded vehicle-controller step.
      this.steeringApplied = 0;
      this.steerCarriedIntoFlight = false;
      this.lastEvent = order ? `ATERRISSAGEM — ${order}` : 'ATERRISSAGEM — CONTATO DAS RODAS';
      this.hasTakenOff = false;
    }
    if (isGrounded) this.hasBeenGrounded = true;
    this.previousWheelContacts = contacts;
  }

  /**
   * Bounds angular-rate spikes and brakes uncommanded ground yaw.
   * A capped torque impulse trims rotation without changing linear velocity or
   * resetting the full angular velocity; commanded ground turns stay untouched.
   */
  private applyAngularRateGuard(
    support: GroundSupport | null,
    predictedLanding: { normal: THREE.Vector3; timeToImpact: number } | null,
  ): number {
    const rotation = this.toThreeRotation(this.chassis.rotation());
    const angularWorld = vector3(this.chassis.angvel());
    const inverseRotation = rotation.clone().invert();
    const angularLocal = angularWorld.clone().applyQuaternion(inverseRotation);
    const inertia = vector3(this.chassis.principalInertia());
    let pitchRateLimit: number;
    let rollRateLimit: number;
    if (support) {
      pitchRateLimit = LAB_TUNING.groundPitchRateLimitRadPerSecond;
      rollRateLimit = LAB_TUNING.groundRollRateLimitRadPerSecond;
    } else {
      // Attitude and pitch-assist torques already steer the pose. This guard only
      // trims rates beyond their limits; it must not act as a second angle servo.
      pitchRateLimit = this.assistTargetPitch === null
        ? LAB_TUNING.airPitchRateLimitRadPerSecond : LAB_TUNING.assistedAirPitchRateLimitRadPerSecond;
      rollRateLimit = LAB_TUNING.airRollRateLimitRadPerSecond;
    }

    const worldUp = support?.normal ?? predictedLanding?.normal ?? new THREE.Vector3(0, 1, 0);
    const yawRate = angularWorld.dot(worldUp);
    const yawRateLimit = support ? support.contacts < 4
      ? LAB_TUNING.partialSupportYawRateLimitRadPerSecond
      : LAB_TUNING.groundYawRateLimitRadPerSecond
      : LAB_TUNING.airYawRateLimitRadPerSecond;
    // When the driver releases A/D, target zero yaw rather than allowing a
    // partial-support spin to sit indefinitely at the rate limit.
    const yawRateLimited = support && Math.abs(this.steeringApplied) < 0.05
      ? 0 : clamp(yawRate, -yawRateLimit, yawRateLimit);

    const localDelta = new THREE.Vector3(
      clamp(angularLocal.x, -rollRateLimit, rollRateLimit) - angularLocal.x,
      0,
      clamp(angularLocal.z, -pitchRateLimit, pitchRateLimit) - angularLocal.z,
    );
    const localImpulse = localDelta.clone().multiply(inertia);
    const angularAfterLocalCorrection = angularWorld.clone().add(localDelta.applyQuaternion(rotation));
    const yawAxisLocal = worldUp.clone().applyQuaternion(inverseRotation).normalize();
    const inverseInertiaAlongYaw = yawAxisLocal.x ** 2 / inertia.x
      + yawAxisLocal.y ** 2 / inertia.y + yawAxisLocal.z ** 2 / inertia.z;
    const yawRateAfterLocalCorrection = angularAfterLocalCorrection.dot(worldUp);
    const yawImpulse = inverseInertiaAlongYaw > 1e-8
      ? (yawRateLimited - yawRateAfterLocalCorrection) / inverseInertiaAlongYaw : 0;
    const yawWorldImpulse = worldUp.clone().multiplyScalar(yawImpulse);
    const worldImpulse = localImpulse.applyQuaternion(rotation).add(yawWorldImpulse);
    const magnitude = worldImpulse.length();
    if (magnitude <= 1e-7) return 0;
    if (magnitude > LAB_TUNING.maxAngularRateCorrectionImpulseNmS) {
      worldImpulse.multiplyScalar(LAB_TUNING.maxAngularRateCorrectionImpulseNmS / magnitude);
    }
    this.chassis.applyTorqueImpulse({ x: worldImpulse.x, y: worldImpulse.y, z: worldImpulse.z }, true);
    return worldImpulse.length();
  }

  private currentGroundSupport(): GroundSupport | null {
    const normal = new THREE.Vector3();
    let contacts = 0;
    let normalContacts = 0;
    let frontContacts = 0;
    let rearContacts = 0;
    for (let index = 0; index < WHEELS.length; index += 1) {
      if (!this.vehicle.wheelIsInContact(index)) continue;
      contacts += 1;
      if (WHEELS[index]!.front) frontContacts += 1;
      else rearContacts += 1;
      const contactNormal = this.vehicle.wheelContactNormal(index);
      if (!contactNormal) continue;
      normal.add(vector3(contactNormal));
      normalContacts += 1;
    }
    if (contacts === 0) return null;
    // Keep a grounded/partial-ground state through a raycast-normal handoff.
    // A valid wheel contact must not be reclassified as airborne merely because
    // the normal accessor is momentarily unavailable on one frame.
    if (normalContacts === 0 || normal.lengthSq() < 1e-6) {
      return { normal: this.terrainAlignmentUp.clone(), contacts, frontContacts, rearContacts, confidence: 0.18 };
    }
    normal.normalize();
    if (normal.y < 0) normal.negate();
    // One contact is only a weak orientation observation. Two contacts on the
    // front axle still carry the vehicle on an incline, but should not rotate
    // the whole chassis as strongly as support from both axles.
    const confidence = contacts === 1 ? 0.22
      : contacts === 2 && (frontContacts === 2 || rearContacts === 2) ? 1
        : contacts === 2 ? 0.65 : contacts === 3 ? 0.84 : 1;
    return { normal, contacts, frontContacts, rearContacts, confidence };
  }

  /**
   * Progressively softens front-wheel steering as axle support is lost or the
   * contact surface becomes steep. This is deliberately support-based rather
   * than a global angular damping, so flat-ground steering remains unchanged.
   */
  private updateSteeringSupportScale(support: GroundSupport | null): void {
    if (!support) {
      this.steeringSupportScale = 1;
      return;
    }
    const contactFactor = support.contacts >= 4 ? 1
      : support.contacts === 3 ? LAB_TUNING.tripleSupportSteeringFactor
        : support.contacts === 2 && (support.frontContacts === 2 || support.rearContacts === 2)
          ? LAB_TUNING.partialSupportSteeringFactor
          : support.contacts === 2 ? LAB_TUNING.crossAxleSupportSteeringFactor
            : LAB_TUNING.singleSupportSteeringFactor;
    const slope = Math.acos(clamp(support.normal.y, -1, 1));
    const slopeFactor = 1 - clamp(slope / LAB_TUNING.maxSteeringSlopeRadians, 0, 1)
      * LAB_TUNING.slopeSteeringReduction;
    const target = contactFactor * slopeFactor;
    const rate = target < this.steeringSupportScale
      ? LAB_TUNING.steeringSupportAttackRate : LAB_TUNING.steeringSupportRecoveryRate;
    const blend = 1 - Math.exp(-LAB_FIXED_DT * rate);
    this.steeringSupportScale = clamp(this.steeringSupportScale
      + (target - this.steeringSupportScale) * blend, 0.2, 1);
  }

  /** Avoids steering off the synthetic straight's edge before a curve exists. */
  private updateSteeringEdgeScale(appliedSteer: number): number {
    const position = this.chassis.translation();
    // The approach, jump gap, plateau, and descent all share the same straight
    // centerline. Keep the lateral guard active across all of them; switching
    // it off at the landing start lets an existing heading carry the car off
    // the edge several seconds after a short steering command.
    if (position.z < 0 || position.z > DEFAULT_LAB_TRACK_CONFIG.landingEndZ) {
      this.steeringEdgeScale = 1;
      return 0;
    }
    const safeHalfWidth = LAB_TRACK_WIDTH / 2 - LAB_TUNING.chassisHalfExtents.z;
    const remainingMargin = safeHalfWidth - Math.abs(position.x);
    const edgePressure = clamp((LAB_TUNING.edgeCounterSteerStartMarginM - remainingMargin)
      / LAB_TUNING.edgeCounterSteerStartMarginM, 0, 1);
    const steeringTowardEdge = appliedSteer * position.x > 0;
    this.steeringEdgeScale = steeringTowardEdge
      ? clamp(remainingMargin / LAB_TUNING.rampEdgeSteeringBufferM,
        LAB_TUNING.minimumEdgeSteeringScale, 1) : 1;

    // Counter-steer only the residual outward lateral drift near the straight's
    // boundary. It is dormant at road center and outside the synthetic straight.
    const lateralSpeed = this.chassis.linvel().x;
    if (position.x * lateralSpeed <= 0 || Math.abs(lateralSpeed) <= 0.25 || edgePressure <= 0) return 0;
    return -Math.sign(lateralSpeed) * LAB_TUNING.edgeCounterSteerStrength * edgePressure;
  }

  /** Air steering changes the flight path gently without replacing the ballistic trajectory. */
  private applyAirSteering(steer: number): void {
    const rotation = this.toThreeRotation(this.chassis.rotation());
    const force = new THREE.Vector3();
    if (Math.abs(steer) >= 1e-4) {
      const lateral = new THREE.Vector3(0, 0, -1).applyQuaternion(rotation).normalize();
      force.add(lateral.multiplyScalar(steer * LAB_TUNING.airLateralAccelerationMps2));
    }
    if (force.lengthSq() < 1e-8) return;
    force.multiplyScalar(this.chassis.mass());
    this.chassis.addForce({ x: force.x, y: 0, z: force.z }, true);
  }

  /** Tire friction can create a yaw moment when only one axle has landed.
   * Bleed lateral drift at the chassis center while steering is released so
   * partial wheel support cannot turn that drift into a sustained spin. */
  private applyGroundLateralDamping(): void {
    const rotation = this.toThreeRotation(this.chassis.rotation());
    const lateral = new THREE.Vector3(0, 0, -1).applyQuaternion(rotation).normalize();
    const velocity = vector3(this.chassis.linvel());
    const lateralSpeed = velocity.dot(lateral);
    const acceleration = clamp(-lateralSpeed * LAB_TUNING.neutralGroundLateralDampingPerSecond,
      -4, 4);
    const force = lateral.multiplyScalar(acceleration * this.chassis.mass());
    this.chassis.addForce({ x: force.x, y: 0, z: force.z }, true);
  }

  /** Finds a plausible surface below the predicted landing point while descending. */
  private predictLandingSurface(): { normal: THREE.Vector3; timeToImpact: number } | null {
    const velocity = this.chassis.linvel();
    if (velocity.y >= -0.15) return null;
    const position = this.chassis.translation();
    const lookAhead = LAB_TUNING.pitchAssistLookAheadSeconds;
    const rayOrigin = { x: position.x + velocity.x * lookAhead, y: position.y + 8,
      z: position.z + velocity.z * lookAhead };
    this.ray.origin = rayOrigin;
    this.ray.dir = { x: 0, y: -1, z: 0 };
    const hit = this.world.castRayAndGetNormal(this.ray, 30, true,
      RAPIER.QueryFilterFlags.EXCLUDE_DYNAMIC, undefined, undefined, undefined,
      collider => this.trackColliderHandles.has(collider.handle));
    if (!hit) return null;

    const surfaceY = rayOrigin.y - hit.timeOfImpact;
    const heightAboveSurface = position.y - surfaceY;
    if (heightAboveSurface <= 0) return null;
    const impactDiscriminant = velocity.y ** 2 + 2 * GRAVITY * heightAboveSurface;
    const timeToImpact = (velocity.y + Math.sqrt(impactDiscriminant)) / GRAVITY;
    if (!Number.isFinite(timeToImpact) || timeToImpact <= 0 || timeToImpact > 1.8) return null;
    const normal = vector3(hit.normal).normalize();
    if (normal.y < 0) normal.negate();
    return { normal, timeToImpact };
  }

  /**
   * A torque-limited PD stabilizer follows the road when grounded and only
   * levels roll while airborne. Air steering changes lateral velocity only;
   * yaw momentum is damped and ballistic pitch remains with gravity/pitch assist.
   */
  private applyArcadeUprightStabilizer(
    support: GroundSupport | null,
    alignedGroundUp: THREE.Vector3,
    landingNormal: THREE.Vector3 | null,
    pitchAssistEnabled: boolean,
  ): number {
    const grounded = support !== null;
    this.uprightMode = !support ? 'air' : support.contacts === 4 ? 'ground' : 'partial';
    if (grounded) {
      this.airYawTargetRadPerSecond = 0;
      this.airYawTorqueNm = 0;
    } else {
      this.groundYawTargetRadPerSecond = 0;
      this.groundYawTorqueNm = 0;
    }
    const rotation = this.toThreeRotation(this.chassis.rotation());
    const forward = FORWARD_AXIS.clone().applyQuaternion(rotation).normalize();
    if (!grounded) return this.applyAirUprightStabilizer(rotation, forward, landingNormal,
      pitchAssistEnabled);

    const targetUp = alignedGroundUp.clone().normalize();
    forward.addScaledVector(targetUp, -forward.dot(targetUp));
    if (forward.lengthSq() < 1e-6) {
      this.uprightErrorRadians = 0;
      return 0;
    }
    forward.normalize();

    let up = targetUp.addScaledVector(forward, -targetUp.dot(forward));
    if (up.lengthSq() < 1e-6) {
      up.set(0, 1, 0).addScaledVector(forward, -forward.y);
    }
    if (up.lengthSq() < 1e-6) {
      this.uprightErrorRadians = 0;
      return 0;
    }
    up.normalize();
    let side = forward.clone().cross(up);
    if (side.lengthSq() < 1e-6) {
      this.uprightErrorRadians = 0;
      return 0;
    }
    side.normalize();
    up = side.clone().cross(forward).normalize();
    const rollAxis = FORWARD_AXIS.clone().applyQuaternion(rotation).normalize();
    const angularVelocity = vector3(this.chassis.angvel());
    const pitchAxis = LOCAL_PITCH_AXIS.clone().applyQuaternion(rotation).normalize();
    const currentUp = CHASSIS_UP.clone().applyQuaternion(rotation).normalize();
    const rollError = Math.atan2(rollAxis.dot(currentUp.clone().cross(up)), currentUp.dot(up));
    const rollTorque = rollError * LAB_TUNING.uprightGroundKp
      - angularVelocity.dot(rollAxis) * LAB_TUNING.uprightGroundKd;
    const targetPitch = Math.atan2(forward.y, Math.hypot(forward.x, forward.z));
    const localAngularVelocity = angularVelocity.clone().applyQuaternion(rotation.clone().invert());
    const pitchError = targetPitch - this.localPitch(rotation);
    this.uprightErrorRadians = Math.hypot(rollError, pitchError);
    // Keep terrain pitch assistance gentle: the raycast spring and ramp should
    // supply most of the nose lift instead of a strong torque fighting them.
    const pitchTorque = clamp(pitchError * LAB_TUNING.uprightTerrainPitchKp
      - localAngularVelocity.z * LAB_TUNING.uprightTerrainPitchKd,
    -LAB_TUNING.uprightTerrainPitchMaxTorqueNm, LAB_TUNING.uprightTerrainPitchMaxTorqueNm);
    const torqueWorld = rollAxis.clone().multiplyScalar(rollTorque).addScaledVector(pitchAxis, pitchTorque);
    const supportScale = LAB_TUNING.uprightPartialSupportTorqueScale
      + (1 - LAB_TUNING.uprightPartialSupportTorqueScale) * support.confidence;
    const maxTorque = LAB_TUNING.uprightGroundMaxTorqueNm * supportScale;
    // The raycast vehicle already steers its front wheels and applies tire
    // lateral impulses. A second yaw servo duplicates that force at the chassis
    // and oversteers during/after a landing, where only some wheels may support.
    // Let tire contact generate steering yaw; the angular-rate guard remains a
    // passive safety limit rather than another steering actuator.
    this.groundYawTargetRadPerSecond = 0;
    this.groundYawTorqueNm = 0;
    const combinedLimit = maxTorque;
    const magnitude = torqueWorld.length();
    if (magnitude > combinedLimit) torqueWorld.multiplyScalar(combinedLimit / magnitude);
    this.chassis.addTorque({ x: torqueWorld.x, y: torqueWorld.y, z: torqueWorld.z }, true);
    return torqueWorld.length();
  }

  private applyAirUprightStabilizer(
    rotation: THREE.Quaternion,
    forward: THREE.Vector3,
    landingNormal: THREE.Vector3 | null,
    pitchAssistEnabled: boolean,
  ): number {
    const referenceUp = (landingNormal ?? new THREE.Vector3(0, 1, 0)).clone().normalize();
    const currentUp = CHASSIS_UP.clone().applyQuaternion(rotation).normalize();
    const currentUpOnRollPlane = currentUp.addScaledVector(forward, -currentUp.dot(forward));
    const referenceUpOnRollPlane = referenceUp.addScaledVector(forward, -referenceUp.dot(forward));
    if (currentUpOnRollPlane.lengthSq() < 1e-5 || referenceUpOnRollPlane.lengthSq() < 1e-5) {
      this.uprightErrorRadians = 0;
      return 0;
    }
    currentUpOnRollPlane.normalize();
    referenceUpOnRollPlane.normalize();
    // Signed error around the existing forward axis avoids Euler singularities
    // when the nose is steep during flight and cannot create a roll target by
    // accidentally blending pitch into a full-quaternion error.
    const rollError = Math.atan2(forward.dot(currentUpOnRollPlane.clone().cross(referenceUpOnRollPlane)),
      currentUpOnRollPlane.dot(referenceUpOnRollPlane));
    this.uprightErrorRadians = Math.abs(rollError);
    const angularVelocity = vector3(this.chassis.angvel());
    const rollAxis = forward;
    const rollTorque = clamp(rollError * LAB_TUNING.uprightAirKp
      - angularVelocity.dot(rollAxis) * LAB_TUNING.uprightAirKd,
    -LAB_TUNING.uprightAirMaxTorqueNm, LAB_TUNING.uprightAirMaxTorqueNm);

    const pitchAxis = LOCAL_PITCH_AXIS.clone().applyQuaternion(rotation).normalize();
    const localAngularVelocity = angularVelocity.clone().applyQuaternion(rotation.clone().invert());
    // When enabled, the landing-aware pitch controller owns pitch. Applying a
    // second pitch controller here made its nose-down correction fight itself.
    // Without it, only damp angular rate gently; never force a horizontal pose.
    const pitchTorque = pitchAssistEnabled ? 0
      : clamp(-localAngularVelocity.z * LAB_TUNING.airPitchRateDampingNmPerRadPerSecond,
        -LAB_TUNING.airPitchRateDampingMaxNm, LAB_TUNING.airPitchRateDampingMaxNm);
    const torque = rollAxis.clone().multiplyScalar(rollTorque).addScaledVector(pitchAxis, pitchTorque);
    const yawAxis = referenceUp;
    const yawRate = angularVelocity.dot(yawAxis);
    // Air steering is translational only: A/D applies a small lateral force
    // without steering the chassis into a sideways attitude. Yaw torque only
    // damps angular momentum already present from the ramp/contact transition.
    this.airYawTargetRadPerSecond = 0;
    this.airYawTorqueNm = clamp(-yawRate * LAB_TUNING.airYawDampingKp,
      -LAB_TUNING.airYawMaxTorqueNm, LAB_TUNING.airYawMaxTorqueNm);
    torque.addScaledVector(yawAxis, this.airYawTorqueNm);
    const maxTorque = Math.hypot(LAB_TUNING.uprightAirMaxTorqueNm,
      LAB_TUNING.airPitchRateDampingMaxNm, LAB_TUNING.airYawMaxTorqueNm);
    if (torque.length() > maxTorque) torque.setLength(maxTorque);
    this.chassis.addTorque({ x: torque.x, y: torque.y, z: torque.z }, true);
    return torque.length();
  }

  private applyAirPitchAssist(predictedLanding: { normal: THREE.Vector3; timeToImpact: number } | null): number {
    const contacts = WHEELS.some((_, index) => this.vehicle.wheelIsInContact(index));
    const velocity = this.chassis.linvel();
    if (contacts || !predictedLanding) {
      this.assistTargetPitch = null;
      return 0;
    }

    const rotation = this.toThreeRotation(this.chassis.rotation());
    const groundNormal = predictedLanding.normal;
    const horizontalForward = new THREE.Vector3(velocity.x, 0, velocity.z).normalize();
    const projectedForward = horizontalForward.addScaledVector(groundNormal,
      -horizontalForward.dot(groundNormal)).normalize();
    const surfacePitch = Math.atan2(projectedForward.y,
      Math.hypot(projectedForward.x, projectedForward.z));
    const nearLanding = clamp(1 - predictedLanding.timeToImpact / 1.8, 0, 1);
    const currentPitch = this.localPitch(rotation);
    const noseDownBias = currentPitch > surfacePitch + LAB_TUNING.pitchAssistNoseDownThresholdRadians
      ? LAB_TUNING.noseDownBiasRadians * nearLanding : 0;
    const targetPitch = surfacePitch - noseDownBias;
    this.assistTargetPitch = targetPitch;

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

export { DEFAULT_LAB_TRACK_CONFIG, LAB_TRACK_WIDTH, type LabTrackConfig };
