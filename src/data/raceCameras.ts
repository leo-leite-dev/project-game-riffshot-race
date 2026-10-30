export const RACE_CAMERA_MODES = Object.freeze({ isometric: 'ISOMÉTRICA', chase: 'TERCEIRA PESSOA' });
export const DEFAULT_RACE_CAMERA_MODE = 'isometric';
export const ZOOM_LABELS = Object.freeze(['PRÓXIMA', 'MAIS PRÓXIMA', 'BEM PRÓXIMA']);
export const RACE_CAMERA_SETTINGS = Object.freeze({
  transitionSeconds: 1.15,
  isometric: Object.freeze({ viewHeight: 26, minViewWidth: 22, lookAhead: 2.5, follow: 5,
    // Lower, oblique spectator view inspired by classic arcade racers, rather
    // than a steep top-down angle. This remains presentation-only.
    offset: Object.freeze([18, 8, 25]) }),
  // Distances/heights/look-ahead are multiples of the rendered vehicle length.
  // Height also includes roof clearance; all three presets keep the car visible.
  chase: Object.freeze({ fov: 62, zoomFollow: 6, follow: 7,
    speedFov: 1, speedFollow: 0.35, lateralRoll: 0.014,
    presets: Object.freeze([
      Object.freeze({ distance: 1.4, height: 0.42, lookAhead: 0.4, targetHeight: 0.65, fov: 62 }),
      Object.freeze({ distance: 1.15, height: 0.37, lookAhead: 0.36, targetHeight: 0.45, fov: 70 }),
      Object.freeze({ distance: 0.95, height: 0.32, lookAhead: 0.32, targetHeight: 0.3, fov: 80 }),
    ]),
    headingResponse: 3.8, maxYawRate: 2.4, groundClearance: 1.1, obstacleMargin: 0.55 }),
});
