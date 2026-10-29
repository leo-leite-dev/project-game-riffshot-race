import type Phaser from 'phaser';

type ControlKeys = Record<string, Pick<Phaser.Input.Keyboard.Key, 'isDown'> | undefined>;
type VehicleMotion = { velocityX: number; velocityZ: number; heading: number };
const isDown = (keys: ControlKeys, ...names: string[]) => names.some(name => keys[name]?.isDown);

export function readVehicleControls(keys: ControlKeys, vehicle?: VehicleMotion | null) {
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
    nitro: isDown(keys, 'SHIFT'),
  };
}

// Produces normalized input only; vehicle motion is shared with bot physics.
export class PlayerController {
  keyboard: Phaser.Input.Keyboard.KeyboardPlugin | null;
  keys: ControlKeys;
  captures: string[];

  constructor(scene: Phaser.Scene) {
    this.keyboard = scene.input.keyboard;
    this.keys = (this.keyboard?.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,SPACE,SHIFT') ?? {}) as ControlKeys;
    this.captures = ['W', 'A', 'S', 'D', 'UP', 'DOWN', 'LEFT', 'RIGHT', 'SPACE', 'SHIFT'];
    this.keyboard?.addCapture(this.captures);
    scene.events.once('shutdown', () => this.keyboard?.removeCapture(this.captures));
  }

  read(vehicle?: VehicleMotion | null) { return readVehicleControls(this.keys, vehicle); }
}
