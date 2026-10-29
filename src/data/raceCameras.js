export const RACE_CAMERA_MODES = Object.freeze({ isometric: 'ISOMÉTRICA', chase: 'TERCEIRA PESSOA' });
export const DEFAULT_RACE_CAMERA_MODE = 'chase';
export const ZOOM_LABELS = Object.freeze(['PRÓXIMA', 'MAIS PRÓXIMA', 'BEM PRÓXIMA']);
export const RACE_CAMERA_SETTINGS = Object.freeze({
  transitionSeconds: 1.15,
  isometric: Object.freeze({ viewHeight: 29, minViewWidth: 22, lookAhead: 2.5, follow: 5,
    offset: Object.freeze([21, 32, 21]) }),
  // Distances/heights/look-ahead are multiples of the rendered vehicle length.
  // Height also includes roof clearance; all three presets keep the car visible.
  chase: Object.freeze({ fov: 62, zoomFollow: 6, follow: 7,
    presets: Object.freeze([
      Object.freeze({ distance: 1.4, height: 0.42, lookAhead: 0.4, targetHeight: 0.65, fov: 62 }),
      Object.freeze({ distance: 1.15, height: 0.37, lookAhead: 0.36, targetHeight: 0.45, fov: 70 }),
      Object.freeze({ distance: 0.95, height: 0.32, lookAhead: 0.32, targetHeight: 0.3, fov: 80 }),
    ]),
    headingResponse: 3.8, maxYawRate: 2.4, groundClearance: 1.1, obstacleMargin: 0.55 }),
});
