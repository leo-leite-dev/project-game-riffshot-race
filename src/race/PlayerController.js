const isDown = (keys, ...names) => names.some(name => keys[name]?.isDown);

export function readVehicleControls(keys, vehicle) {
  const accelerating = isDown(keys, 'W', 'UP');
  const reversing = isDown(keys, 'S', 'DOWN');
  const forwardSpeed = vehicle
    ? vehicle.velocityX * Math.sin(vehicle.heading) + vehicle.velocityZ * Math.cos(vehicle.heading)
    : 0;
  const changeDirectionSpeed = 0.65;
  let throttle = 0, brake = 0;
  if (accelerating && reversing) brake = 1;
  else if (accelerating) {
    if (forwardSpeed < -changeDirectionSpeed) brake = 1;
    else throttle = 1;
  } else if (reversing) {
    if (forwardSpeed > changeDirectionSpeed) brake = 1;
    else throttle = -0.55;
  }
  return {
    throttle, brake,
    // Positive simulation yaw rotates +Z toward +X: a vehicle-local LEFT turn
    // in Three's Y-up, right-handed world. Bots keep their own geometric yaw.
    steer: (isDown(keys, 'A', 'LEFT') ? 1 : 0) - (isDown(keys, 'D', 'RIGHT') ? 1 : 0),
    handbrake: isDown(keys, 'SPACE') ? 1 : 0,
  };
}

// Produces normalized input only; vehicle motion is shared with bot physics.
export class PlayerController {
  constructor(scene) {
    this.keyboard = scene.input.keyboard;
    this.keys = this.keyboard?.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,SPACE') ?? {};
    this.captures = ['W', 'A', 'S', 'D', 'UP', 'DOWN', 'LEFT', 'RIGHT', 'SPACE'];
    this.keyboard?.addCapture(this.captures);
    scene.events.once('shutdown', () => this.keyboard?.removeCapture(this.captures));
  }

  read(vehicle) { return readVehicleControls(this.keys, vehicle); }
}
