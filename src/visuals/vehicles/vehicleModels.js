// Reviewed embedded GLBs only. The Vite plugin and runtime share this allowlist.
// Yaw is applied AFTER the file's own scene transforms, with +Y up / +Z front.
const asset = (fileName, yaw, triangles, meshes) => Object.freeze({
  fileName, url: `/models/vehicles/${fileName}`, yaw, triangles, meshes,
  // These files use mixed atlases, not isolated body-paint materials. Preserve
  // their authored maps until an actual body mask/material has been identified.
  paintMaterialNames: Object.freeze([]),
});

export const VEHICLE_MODEL_ASSETS = Object.freeze([
  asset('thunder_bug.glb', 0, 63181, 21), // +Z headlights; reviewed EngineFan clip
  asset('race_car.glb', Math.PI / 2, 26915, 61), // front -X (spare tire at +X)
  asset('camaro.glb', 0, 6593, 2), // front +Z, wheels and body in two atlas meshes
  asset('armored_car_death_race.glb', -Math.PI / 2, 23444, 6), // front +X
  // File is authored diagonally: minimum-area XZ bounds align at -34.52°.
  asset('widowmaker_-_death_race_2000.glb', -0.6024876577884428, 205288, 3),
]);

export function getVehicleModelAsset(modelFile) {
  // race_car2.glb is a catalog alias. Only race_car.glb exists locally; never
  // require, fetch or emit a duplicate original for this independent vehicle ID.
  const canonical = modelFile === 'race_car2.glb' ? 'race_car.glb' : modelFile;
  return VEHICLE_MODEL_ASSETS.find(item => item.fileName === canonical) ?? null;
}
