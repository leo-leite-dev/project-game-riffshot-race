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

export type TouchVehicleControl = 'handbrake' | 'nitro';

export function readAnalogVehicleControls(x: number, y: number, vehicle?: VehicleMotion | null) {
  const axisX = Math.max(-1, Math.min(1, Number.isFinite(x) ? x : 0));
  const axisY = Math.max(-1, Math.min(1, Number.isFinite(y) ? y : 0));
  const forwardSpeed = vehicle
    ? vehicle.velocityX * Math.sin(vehicle.heading) + vehicle.velocityZ * Math.cos(vehicle.heading)
    : 0;
  const deadZone = 0.12;
  const vertical = Math.abs(axisY) > deadZone ? -axisY : 0;
  let throttle = 0, brake = 0;
  if (vertical > 0) {
    if (forwardSpeed < -0.65) brake = vertical;
    else throttle = vertical;
  } else if (vertical < 0) {
    if (forwardSpeed > 0.65) brake = -vertical;
    else throttle = vertical * 0.55;
  }
  return { throttle, brake, steer: Math.abs(axisX) > deadZone ? -axisX : 0 };
}

// Produces normalized input only; vehicle motion is shared with bot physics.
export class PlayerController {
  keyboard: Phaser.Input.Keyboard.KeyboardPlugin | null;
  keys: ControlKeys;
  captures: string[];
  private readonly touch = new Set<TouchVehicleControl>();
  private analogX = 0;
  private analogY = 0;
  private analogActive = false;

  constructor(scene: Phaser.Scene) {
    this.keyboard = scene.input.keyboard;
    this.keys = (this.keyboard?.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,SPACE,SHIFT') ?? {}) as ControlKeys;
    this.captures = ['W', 'A', 'S', 'D', 'UP', 'DOWN', 'LEFT', 'RIGHT', 'SPACE', 'SHIFT'];
    this.keyboard?.addCapture(this.captures);
    scene.events.once('shutdown', () => this.keyboard?.removeCapture(this.captures));
    scene.events.once('shutdown', () => this.touch.clear());
  }

  setTouchControl(control: TouchVehicleControl, active: boolean): void {
    if (active) this.touch.add(control);
    else this.touch.delete(control);
  }

  setAnalogControl(x: number, y: number, active: boolean): void {
    this.analogX = Math.max(-1, Math.min(1, Number.isFinite(x) ? x : 0));
    this.analogY = Math.max(-1, Math.min(1, Number.isFinite(y) ? y : 0));
    this.analogActive = active;
  }

  read(vehicle?: VehicleMotion | null) {
    const touchKeys: Record<string, { isDown: boolean }> = {
      SPACE: { isDown: this.touch.has('handbrake') }, SHIFT: { isDown: this.touch.has('nitro') },
    };
    const keys = Object.fromEntries(Object.keys(touchKeys).map(key => [key,
      { isDown: this.keys[key]?.isDown === true || touchKeys[key]!.isDown },]));
    const controls = readVehicleControls({ ...this.keys, ...keys }, vehicle);
    if (this.analogActive) Object.assign(controls, readAnalogVehicleControls(this.analogX, this.analogY, vehicle));
    return controls;
  }
}
