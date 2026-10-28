export const RACE_CAMERA_MODES = Object.freeze({ isometric: 'ISOMÉTRICA', chase: 'TERCEIRA PESSOA' });
export const DEFAULT_RACE_CAMERA_MODE = 'chase';
export const RACE_CAMERA_SETTINGS = Object.freeze({
  transitionSeconds: 1.15,
  isometric: Object.freeze({ viewHeight: 54, follow: 5, offset: Object.freeze([21, 32, 21]) }),
  chase: Object.freeze({ fov: 62, distance: 7.5, height: 3.2, lookAhead: 5, follow: 7,
    headingResponse: 3.8, maxYawRate: 2.4, groundClearance: 1.1, obstacleMargin: 0.55 }),
});
