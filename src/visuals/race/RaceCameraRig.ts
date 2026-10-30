import * as THREE from 'three';
import { sampleRaceTrack, type SampledTrack } from '../../race/trackMath.ts';
import { DEFAULT_RACE_CAMERA_MODE, RACE_CAMERA_MODES, RACE_CAMERA_SETTINGS, ZOOM_LABELS } from '../../data/raceCameras.ts';
import type { RaceTrack, RenderPose } from '../../race/RaceSimulation.ts';

type CameraMode = keyof typeof RACE_CAMERA_MODES;
type Obstacle = THREE.Object3D;
type OutputCamera = THREE.Camera & { near: number; far: number; isOrthographicCamera: boolean; isPerspectiveCamera: boolean };

const follow = (rate: number, dt: number): number => 1 - Math.exp(-rate * dt);
const angleDelta = (angle: number): number => Math.atan2(Math.sin(angle), Math.cos(angle));

// Presentation only: receives a read-only vehicle pose, never touches controls,
// vehicle attributes or race state. Endpoints and projection morph share one
// output camera, so changing projection does not require a second render pass.
export class RaceCameraRig {
  track: (SampledTrack & { width: number }) | null;
  size: THREE.Vector3;
  obstacles: Obstacle[];
  mode: CameraMode;
  previousMode: CameraMode;
  zoomIndex = 0;
  zoomLevel = 0;
  zoomFov: number;
  minHorizontalTangent = 0;
  camera: OutputCamera;
  isometric: THREE.OrthographicCamera;
  chase: THREE.PerspectiveCamera;
  center = new THREE.Vector3();
  isometricTarget = new THREE.Vector3();
  chasePosition = new THREE.Vector3();
  chaseTarget = new THREE.Vector3();
  desiredPosition = new THREE.Vector3();
  desiredTarget = new THREE.Vector3();
  rayDirection = new THREE.Vector3();
  rayOrigin = new THREE.Vector3();
  ray = new THREE.Raycaster();
  hits: THREE.Intersection<THREE.Object3D>[] = [];
  orthoProjection = new THREE.Matrix4();
  initialized = false;
  transitionElapsed: number;
  aspect = 1;
  heading = 0;
  chaseRoll = 0;

  constructor({ track, vehicleSize, obstacles = [], mode = DEFAULT_RACE_CAMERA_MODE }: {
    track: RaceTrack | (SampledTrack & { width: number }) | null;
    vehicleSize?: THREE.Vector3;
    obstacles?: Obstacle[];
    mode?: CameraMode;
  }) {
    this.track = track && 'points' in track ? track : track ? { ...sampleRaceTrack(track), width: track.width } : null;
    this.size = vehicleSize ?? new THREE.Vector3(3, 1.5, 3.25);
    this.obstacles = obstacles;
    this.mode = RACE_CAMERA_MODES[mode] ? mode : DEFAULT_RACE_CAMERA_MODE;
    this.previousMode = this.mode;
    this.zoomIndex = 0;
    this.zoomLevel = 0;
    this.zoomFov = RACE_CAMERA_SETTINGS.chase.presets[0].fov;
    this.minHorizontalTangent = 0;
    this.camera = new THREE.Camera() as OutputCamera;
    this.camera.near = 0.15;
    this.camera.far = 600;
    this.isometric = new THREE.OrthographicCamera(-27, 27, 27, -27, 0.1, 600);
    this.chase = new THREE.PerspectiveCamera(RACE_CAMERA_SETTINGS.chase.fov, 1, 0.15, 600);
    this.center = new THREE.Vector3();
    this.isometricTarget = new THREE.Vector3();
    this.chasePosition = new THREE.Vector3();
    this.chaseTarget = new THREE.Vector3();
    this.desiredPosition = new THREE.Vector3();
    this.desiredTarget = new THREE.Vector3();
    this.rayDirection = new THREE.Vector3();
    this.rayOrigin = new THREE.Vector3();
    this.ray = new THREE.Raycaster();
    this.hits = [];
    this.orthoProjection = new THREE.Matrix4();
    this.initialized = false;
    this.chaseRoll = 0;
    this.transitionElapsed = RACE_CAMERA_SETTINGS.transitionSeconds;
    this.resize(1);
  }

  get transitioning() { return this.transitionElapsed < RACE_CAMERA_SETTINGS.transitionSeconds; }
  get zoomLabel() { return ZOOM_LABELS[this.zoomIndex]; }

  cycleZoom() {
    if (this.mode !== 'chase' || this.transitioning) return false;
    this.zoomIndex = (this.zoomIndex + 1) % ZOOM_LABELS.length;
    return true;
  }

  toggle() {
    // Ignore repeated presses while blending rather than queueing rotations.
    if (this.transitioning) return false;
    this.previousMode = this.mode;
    this.mode = this.mode === 'isometric' ? 'chase' : 'isometric';
    this.transitionElapsed = 0;
    return true;
  }

  resize(aspect: number): void {
    this.aspect = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
    const settings = RACE_CAMERA_SETTINGS.isometric;
    const height = Math.max(settings.viewHeight, settings.minViewWidth / this.aspect);
    aspect = this.aspect;
    this.isometric.left = -height * aspect / 2;
    this.isometric.right = height * aspect / 2;
    this.isometric.top = height / 2;
    this.isometric.bottom = -height / 2;
    this.isometric.updateProjectionMatrix();
    this.refreshChaseProjection();
    if (this.initialized) this.compose();
  }

  refreshChaseProjection() {
    // Preserve horizontal coverage in portrait instead of cropping the enlarged
    // car. Landscape retains the preset's vertical FOV.
    const tangent = Math.max(
      Math.tan(THREE.MathUtils.degToRad(this.zoomFov / 2)) / Math.min(1, this.aspect),
      this.minHorizontalTangent / this.aspect);
    const fov = THREE.MathUtils.radToDeg(2 * Math.atan(tangent));
    if (this.chase.aspect === this.aspect && this.chase.fov === fov) return;
    this.chase.aspect = this.aspect;
    this.chase.fov = fov;
    this.chase.updateProjectionMatrix();
  }

  resetAfterRespawn(pose: RenderPose): void {
    // A teleport starts fresh at the selected endpoint, never across the track.
    this.initialized = false;
    this.previousMode = this.mode;
    this.transitionElapsed = RACE_CAMERA_SETTINGS.transitionSeconds;
    this.zoomLevel = this.zoomIndex;
    this.update(pose, 0);
  }

  update(player: RenderPose, deltaSeconds: number): void {
    const dt = Math.max(0, Math.min(deltaSeconds, 0.25));
    const settings = RACE_CAMERA_SETTINGS.chase;
    const first = !this.initialized;
    if (first) {
      this.center.set(player.x, player.y, player.z);
      this.heading = player.heading;
    } else {
      this.center.lerp(this.desiredTarget.set(player.x, player.y, player.z), follow(RACE_CAMERA_SETTINGS.isometric.follow, dt));
      const turn = angleDelta(player.heading - this.heading) * follow(settings.headingResponse, dt);
      this.heading += THREE.MathUtils.clamp(turn, -settings.maxYawRate * dt, settings.maxYawRate * dt);
    }
    const forwardX = Math.sin(this.heading), forwardZ = Math.cos(this.heading);
    const speed = Math.min(Math.abs(player.speed ?? 0), 40);
    const isoAhead = RACE_CAMERA_SETTINGS.isometric.lookAhead + speed * 0.04;
    this.isometricTarget.copy(this.center);
    this.isometricTarget.x += forwardX * isoAhead;
    this.isometricTarget.z += forwardZ * isoAhead;
    const offset = RACE_CAMERA_SETTINGS.isometric.offset as [number, number, number];
    this.isometric.position.copy(this.isometricTarget).add(this.desiredTarget.set(...offset));
    this.isometric.lookAt(this.isometricTarget);

    this.zoomLevel = first ? this.zoomIndex : THREE.MathUtils.lerp(this.zoomLevel, this.zoomIndex, follow(settings.zoomFollow, dt));
    if (Math.abs(this.zoomLevel - this.zoomIndex) < 1e-5) this.zoomLevel = this.zoomIndex;
    const lower = Math.floor(this.zoomLevel), amount = this.zoomLevel - lower;
    const a = settings.presets[lower], b = settings.presets[Math.min(lower + 1, settings.presets.length - 1)];
    const distance = Math.max(THREE.MathUtils.lerp(a.distance, b.distance, amount) * this.size.z, this.size.z * 0.5 + 0.65);
    const height = Math.max(THREE.MathUtils.lerp(a.height, b.height, amount) * this.size.z + this.size.y * 0.65, this.size.y + 0.45);
    const lookAhead = THREE.MathUtils.lerp(a.lookAhead, b.lookAhead, amount) * this.size.z + speed * 0.035;
    const targetHeight = THREE.MathUtils.lerp(a.targetHeight, b.targetHeight, amount) * this.size.y;
    const baseFov = THREE.MathUtils.lerp(a.fov, b.fov, amount);
    this.zoomFov = baseFov + speed / 40 * settings.speedFov;
    // The rear roof corners are the widest/closest silhouette in chase view.
    // Reserve 10% horizontal room for them, especially on narrow phone screens.
    const pitch = Math.atan2(height - targetHeight, distance + lookAhead);
    const rearDepth = (distance - this.size.z / 2) * Math.cos(pitch)
      + (height - this.size.y - 0.08) * Math.sin(pitch);
    this.minHorizontalTangent = this.size.x * 0.55 / Math.max(this.chase.near, rearDepth);
    this.refreshChaseProjection();
    this.desiredPosition.set(player.x - forwardX * distance, player.y + height, player.z - forwardZ * distance);
    this.desiredTarget.set(player.x + forwardX * lookAhead, player.y + targetHeight, player.z + forwardZ * lookAhead);

    this.clearGround(this.desiredPosition);
    if (first) {
      this.chasePosition.copy(this.desiredPosition);
      this.chaseTarget.copy(this.desiredTarget);
    } else {
      // At race speed, track the car more closely instead of letting its
      // follow-camera lag look like an unwanted zoom-out.
      const chaseFollow = settings.follow + speed * settings.speedFollow;
      this.chasePosition.lerp(this.desiredPosition, follow(chaseFollow, dt));
      this.chaseTarget.lerp(this.desiredTarget, follow(chaseFollow, dt));
    }
    // A roof-level pivot keeps even a fully contracted boom outside the car.
    // Resolve after smoothing too: a rising road must not leave the camera below
    // the floor while it catches up. Recover the boom smoothly after obstacles.
    this.rayOrigin.set(player.x, player.y + this.size.y + 0.45, player.z);
    this.clearGround(this.rayOrigin);
    if (this.mode === 'chase' || this.transitioning) this.constrainPosition(this.chasePosition);
    this.chase.position.copy(this.chasePosition);
    this.chase.lookAt(this.chaseTarget);
    const lateralSpeed = Number(player.lateralSpeed) || 0;
    const desiredRoll = THREE.MathUtils.clamp(lateralSpeed / 30, -1, 1) * settings.lateralRoll;
    this.chaseRoll = first ? desiredRoll : THREE.MathUtils.lerp(this.chaseRoll, desiredRoll, follow(5, dt));
    this.chase.rotateZ(this.chaseRoll);
    this.initialized = true;
    this.transitionElapsed = Math.min(RACE_CAMERA_SETTINGS.transitionSeconds, this.transitionElapsed + dt);
    this.compose();
  }

  clearGround(position: THREE.Vector3): void {
    if (!this.track) return;
    // Only the nearest elevation is needed: reuse sampled points rather than
    // allocating nearest-point result objects several times per frame.
    let nearest = null, distanceSq = Infinity;
    for (const point of this.track.points) {
      const candidate = (position.x - point.x) ** 2 + (position.z - point.z) ** 2;
      if (candidate < distanceSq) { nearest = point; distanceSq = candidate; }
    }
    if (nearest && distanceSq < (this.track.width / 2 + 3) ** 2) {
      position.y = Math.max(position.y, nearest.y + RACE_CAMERA_SETTINGS.chase.groundClearance);
    }
  }

  constrainPosition(position: THREE.Vector3): void {
    // Never place the near plane in the roof, including after abrupt elevation
    // changes and obstacle contraction.
    position.y = Math.max(position.y, this.rayOrigin.y);
    this.clearGround(position);
    this.avoidObstacles(this.rayOrigin, position);
    this.clearGround(position);
  }

  avoidObstacles(origin: THREE.Vector3, position: THREE.Vector3): void {
    if (!this.obstacles.length) return;
    this.rayDirection.copy(position).sub(origin);
    const distance = this.rayDirection.length();
    if (distance < 0.001) return;
    this.rayDirection.divideScalar(distance);
    this.ray.set(origin, this.rayDirection);
    this.ray.near = 0.05;
    this.ray.far = distance + 0.25;
    this.hits.length = 0;
    this.ray.intersectObjects(this.obstacles, false, this.hits);
    if (this.hits.length) {
      const hitDistance = this.hits[0].distance;
      const margin = Math.min(RACE_CAMERA_SETTINGS.chase.obstacleMargin, hitDistance * 0.5);
      const safeDistance = Math.max(0.01, hitDistance - margin);
      if (safeDistance < distance) position.copy(origin).addScaledVector(this.rayDirection, safeDistance);
    }
  }

  compose(): void {
    const fraction = this.transitionElapsed / RACE_CAMERA_SETTINGS.transitionSeconds;
    const smooth = fraction * fraction * (3 - 2 * fraction);
    const chaseWeight = this.mode === 'chase' ? smooth : 1 - smooth;
    this.camera.isOrthographicCamera = chaseWeight < 1e-6;
    this.camera.isPerspectiveCamera = !this.camera.isOrthographicCamera;
    this.camera.position.lerpVectors(this.isometric.position, this.chase.position, chaseWeight);
    this.camera.quaternion.slerpQuaternions(this.isometric.quaternion, this.chase.quaternion, chaseWeight);
    // The chase endpoint keeps its collision-safe boom throughout the blend.
    // Contracting the output toward the roof would snap to the fixed isometric
    // endpoint at the end; only enforce terrain clearance on the blended path.
    if (this.transitioning) this.clearGround(this.camera.position);
    // Normalize homogeneous scale around the focus plane before blending.
    // This avoids an abrupt zoom when orthographic and perspective W differ.
    this.orthoProjection.copy(this.isometric.projectionMatrix);
    const focusDistance = Math.max(1, this.camera.position.distanceTo(this.center));
    const ortho = this.orthoProjection.elements, perspective = this.chase.projectionMatrix.elements;
    const output = this.camera.projectionMatrix.elements;
    for (let i = 0; i < 16; i += 1) output[i] = THREE.MathUtils.lerp(ortho[i] * focusDistance, perspective[i], chaseWeight);
    this.camera.projectionMatrixInverse.copy(this.camera.projectionMatrix).invert();
    this.camera.updateMatrixWorld(true);
  }

  destroy(): void {
    this.obstacles = [];
    this.hits.length = 0;
  }
}
