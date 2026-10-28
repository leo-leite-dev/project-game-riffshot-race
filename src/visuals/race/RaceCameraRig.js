import * as THREE from 'three';
import { findNearestTrackPoint } from '../../race/trackMath.js';
import { DEFAULT_RACE_CAMERA_MODE, RACE_CAMERA_MODES, RACE_CAMERA_SETTINGS } from '../../data/raceCameras.js';

const follow = (rate, dt) => 1 - Math.exp(-rate * dt);
const angleDelta = angle => Math.atan2(Math.sin(angle), Math.cos(angle));

// Presentation only: receives a read-only vehicle pose, never touches controls,
// vehicle attributes or race state. Endpoints and projection morph share one
// output camera, so changing projection does not require a second render pass.
export class RaceCameraRig {
  constructor({ track, vehicleSize, obstacles = [], mode = DEFAULT_RACE_CAMERA_MODE }) {
    this.track = track;
    this.size = vehicleSize ?? new THREE.Vector3(3, 1.5, 3.25);
    this.obstacles = obstacles;
    this.mode = RACE_CAMERA_MODES[mode] ? mode : DEFAULT_RACE_CAMERA_MODE;
    this.previousMode = this.mode;
    this.camera = new THREE.Camera();
    this.camera.near = 0.15;
    this.camera.far = 600;
    this.isometric = new THREE.OrthographicCamera(-27, 27, 27, -27, 0.1, 600);
    this.chase = new THREE.PerspectiveCamera(RACE_CAMERA_SETTINGS.chase.fov, 1, 0.15, 600);
    this.center = new THREE.Vector3();
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
    this.transitionElapsed = RACE_CAMERA_SETTINGS.transitionSeconds;
    this.resize(1);
  }

  get transitioning() { return this.transitionElapsed < RACE_CAMERA_SETTINGS.transitionSeconds; }

  toggle() {
    // Ignore repeated presses while blending rather than queueing rotations.
    if (this.transitioning) return false;
    this.previousMode = this.mode;
    this.mode = this.mode === 'isometric' ? 'chase' : 'isometric';
    this.transitionElapsed = 0;
    return true;
  }

  resize(aspect) {
    const height = RACE_CAMERA_SETTINGS.isometric.viewHeight;
    this.isometric.left = -height * aspect / 2;
    this.isometric.right = height * aspect / 2;
    this.isometric.top = height / 2;
    this.isometric.bottom = -height / 2;
    this.isometric.updateProjectionMatrix();
    this.chase.aspect = aspect;
    // Portrait keeps more of the car and near corners in view.
    this.chase.fov = aspect < 1 ? 70 : RACE_CAMERA_SETTINGS.chase.fov;
    this.chase.updateProjectionMatrix();
    if (this.initialized) this.compose();
  }

  update(player, deltaSeconds) {
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
    this.isometric.position.copy(this.center).add(this.desiredTarget.set(...RACE_CAMERA_SETTINGS.isometric.offset));
    this.isometric.lookAt(this.center);

    const forwardX = Math.sin(this.heading), forwardZ = Math.cos(this.heading);
    const distance = Math.max(settings.distance, this.size.z * 2.6);
    const height = settings.height + this.size.y * 0.7;
    const lookAhead = settings.lookAhead + Math.min(Math.abs(player.speed ?? 0), 40) * 0.10;
    this.desiredPosition.set(player.x - forwardX * distance, player.y + height, player.z - forwardZ * distance);
    this.desiredTarget.set(player.x + forwardX * lookAhead, player.y + this.size.y * 0.45, player.z + forwardZ * lookAhead);

    const road = this.track && findNearestTrackPoint(this.track, this.desiredPosition.x, this.desiredPosition.z);
    if (road && road.distanceSq < (this.track.width / 2 + 3) ** 2) {
      this.desiredPosition.y = Math.max(this.desiredPosition.y, road.y + settings.groundClearance);
    }
    if (first) {
      this.chasePosition.copy(this.desiredPosition);
      this.chaseTarget.copy(this.desiredTarget);
    } else {
      this.chasePosition.lerp(this.desiredPosition, follow(settings.follow, dt));
      this.chaseTarget.lerp(this.desiredTarget, follow(settings.follow, dt));
    }
    // Cast from the vehicle's upper body, not the distant look-ahead point.
    // Contract the boom immediately for safety, then recover smoothly afterward.
    this.rayOrigin.set(player.x, player.y + Math.max(0.9, this.size.y * 0.7), player.z);
    if (this.mode === 'chase' || this.transitioning) this.avoidObstacles(this.rayOrigin, this.chasePosition);
    this.chase.position.copy(this.chasePosition);
    this.chase.lookAt(this.chaseTarget);
    this.initialized = true;
    this.transitionElapsed = Math.min(RACE_CAMERA_SETTINGS.transitionSeconds, this.transitionElapsed + dt);
    this.compose();
  }

  avoidObstacles(origin, position) {
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

  compose() {
    const fraction = this.transitionElapsed / RACE_CAMERA_SETTINGS.transitionSeconds;
    const smooth = fraction * fraction * (3 - 2 * fraction);
    const chaseWeight = this.mode === 'chase' ? smooth : 1 - smooth;
    this.camera.isOrthographicCamera = chaseWeight < 1e-6;
    this.camera.isPerspectiveCamera = !this.camera.isOrthographicCamera;
    this.camera.position.lerpVectors(this.isometric.position, this.chase.position, chaseWeight);
    this.camera.quaternion.slerpQuaternions(this.isometric.quaternion, this.chase.quaternion, chaseWeight);
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

  destroy() {
    this.obstacles = [];
    this.hits.length = 0;
  }
}
