import * as THREE from 'three';

const quadrant = point => (point.x < 0 ? 0 : 2) + (point.z < 0 ? 0 : 1);

// Explicit, normalized (+Z front, length 3.25) selection for the scanned,
// connected Widowmaker mesh. Never quadrant-split its mixed body/atlas meshes.
// Whole triangles inside these reviewed tire/hub volumes move; all other faces
// remain on the original body hierarchy, including wheel arches and exhausts.
export const WIDOWMAKER_WHEEL_REGIONS = Object.freeze([
  { center: [-0.50, 0.235, -0.805], radius: 0.228, minX: -0.61, maxX: -0.397 },
  { center: [-0.50, 0.218, 0.835], radius: 0.214, minX: -0.61, maxX: -0.397 },
  { center: [0.50, 0.235, -0.805], radius: 0.228, minX: 0.397, maxX: 0.61 },
  { center: [0.50, 0.218, 0.835], radius: 0.214, minX: 0.397, maxX: 0.61 },
].map(region => Object.freeze({ ...region, center: Object.freeze(region.center) })));

function subsetGeometry(source, triangles) {
  const geometry = new THREE.BufferGeometry();
  const indices = [], index = source.index, vertices = [], remap = new Map();
  let previousMaterial = -1;
  for (const triangle of triangles) {
    const offset = triangle * 3;
    const material = source.groups.find(group => offset >= group.start && offset < group.start + group.count)?.materialIndex ?? 0;
    if (previousMaterial !== material) {
      geometry.addGroup(indices.length, 0, material); previousMaterial = material;
    }
    geometry.groups.at(-1).count += 3;
    for (let j = 0; j < 3; j++) {
      const vertex = index ? index.getX(offset + j) : offset + j;
      if (!remap.has(vertex)) { remap.set(vertex, vertices.length); vertices.push(vertex); }
      indices.push(remap.get(vertex));
    }
  }
  for (const [name, attribute] of Object.entries(source.attributes)) {
    const array = attribute.isInterleavedBufferAttribute ? attribute.data.array : attribute.array;
    const stride = attribute.isInterleavedBufferAttribute ? attribute.data.stride : attribute.itemSize;
    const offset = attribute.isInterleavedBufferAttribute ? attribute.offset : 0;
    const copy = new array.constructor(vertices.length * attribute.itemSize);
    for (const [to, from] of vertices.entries()) for (let j = 0; j < attribute.itemSize; j++) {
      copy[to * attribute.itemSize + j] = array[from * stride + offset + j];
    }
    geometry.setAttribute(name, new THREE.BufferAttribute(copy, attribute.itemSize, attribute.normalized));
  }
  geometry.setIndex(indices);
  geometry.userData.sourceVertices = Object.freeze(vertices);
  return geometry;
}

function selectedParts(file, meshIndex) {
  if (file === 'thunder_bug.glb' && meshIndex >= 17) return { fixed: meshIndex === 20 };
  if (file === 'camaro.glb' && meshIndex === 0) return {};
  if (file === 'race_car.glb' && (meshIndex === 7 || meshIndex === 8)) return {};
  if (file === 'armored_car_death_race.glb' && meshIndex >= 2) return {};
  if (file === 'widowmaker_-_death_race_2000.glb') return { mixed: true };
  return null;
}

export function prepareVehicleWheels(root, asset, metrics, ownedGeometries) {
  // A foreign/synthetic geometry must never accidentally match a wheel profile.
  if (metrics.triangles !== asset.triangles || metrics.meshes !== asset.meshes) return [];
  root.updateMatrixWorld(true);
  const meshes = [];
  root.traverse(object => { if (object.isMesh) meshes.push(object); });
  const inverse = root.matrixWorld.clone().invert();
  const bins = Array.from({ length: 4 }, () => ({ rotating: [], fixed: [], tireBounds: new THREE.Box3() }));
  const vertices = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  for (const [meshIndex, mesh] of meshes.entries()) {
    mesh.userData = { ...mesh.userData, sourceMeshIndex: meshIndex, wheelPart: 'body' };
    const profile = selectedParts(asset.fileName, meshIndex);
    if (!profile) continue;
    const source = mesh.geometry;
    const transformed = source.clone().applyMatrix4(inverse.clone().multiply(mesh.matrixWorld));
    ownedGeometries.add(transformed);
    const groups = Array.from({ length: 4 }, () => []), body = [];
    const count = (source.index?.count ?? source.attributes.position.count) / 3;
    for (let triangle = 0; triangle < count; triangle++) {
      for (let j = 0; j < 3; j++) vertices[j].fromBufferAttribute(transformed.attributes.position,
        source.index ? source.index.getX(triangle * 3 + j) : triangle * 3 + j);
      let wheel;
      if (profile.mixed) {
        wheel = WIDOWMAKER_WHEEL_REGIONS.findIndex(region => vertices.every(v => v.x >= region.minX && v.x <= region.maxX
          && (v.y - region.center[1]) ** 2 + (v.z - region.center[2]) ** 2 <= region.radius ** 2));
      } else {
        wheel = quadrant(vertices[0]);
        if (!vertices.every(v => quadrant(v) === wheel)) throw new Error('Triângulo cruza a separação aprovada de rodas.');
      }
      if (wheel < 0) { body.push(triangle); continue; }
      groups[wheel].push(triangle);
      const isTire = asset.fileName !== 'thunder_bug.glb' || meshIndex === 19;
      if (isTire) for (const v of vertices) bins[wheel].tireBounds.expandByPoint(v);
    }
    for (const [wheel, triangles] of groups.entries()) {
      if (!triangles.length) continue;
      const geometry = subsetGeometry(transformed, triangles);
      ownedGeometries.add(geometry);
      const part = new THREE.Mesh(geometry, mesh.material);
      part.name = `wheel-part:${meshIndex}:${wheel}`;
      part.userData = { sourceMeshIndex: meshIndex, wheelPart: profile.fixed ? 'caliper' : 'rotating' };
      part.castShadow = mesh.castShadow; part.receiveShadow = mesh.receiveShadow;
      bins[wheel][profile.fixed ? 'fixed' : 'rotating'].push(part);
    }
    if (body.length) {
      const geometry = subsetGeometry(source, body);
      ownedGeometries.add(geometry);
      mesh.geometry = geometry;
      mesh.userData = { ...mesh.userData, sourceMeshIndex: meshIndex, wheelPart: 'body' };
    } else mesh.removeFromParent();
    transformed.dispose();
    ownedGeometries.delete(transformed);
  }
  return bins.map((bin, index) => {
    if (!bin.rotating.length || bin.tireBounds.isEmpty()) throw new Error('Roda aprovada não localizada.');
    const size = bin.tireBounds.getSize(new THREE.Vector3());
    const region = asset.fileName.startsWith('widowmaker') ? WIDOWMAKER_WHEEL_REGIONS[index] : null;
    const center = region ? new THREE.Vector3(...region.center) : bin.tireBounds.getCenter(new THREE.Vector3());
    // Vertical tire extent is stable even for the authored front-wheel steering
    // in Armored and the wide/lugged Thunder tires; never use rim/caliper bounds.
    const radius = region ? region.radius : size.y / 2;
    const steer = new THREE.Group(), spin = new THREE.Group();
    steer.name = `vehicle-wheel-steer-${index}`; spin.name = `vehicle-wheel-spin-${index}`;
    const restYaw = asset.fileName === 'armored_car_death_race.glb' && center.z > 0 ? Math.PI / 9 : 0;
    steer.position.copy(center); root.add(steer);
    if (restYaw) {
      // Armored's duplicate-named front nodes already steer 20 degrees. Keep
      // that authored orientation, but spin around the tire's own +X axle.
      const rest = new THREE.Group();
      rest.name = `vehicle-wheel-rest-${index}`; rest.rotation.y = restYaw;
      steer.add(rest); rest.add(spin);
    } else steer.add(spin);
    for (const part of bin.rotating) {
      if (restYaw) part.geometry.applyMatrix4(new THREE.Matrix4().makeRotationY(-restYaw)
        .multiply(new THREE.Matrix4().makeTranslation(-center.x, -center.y, -center.z)));
      else part.position.copy(center).negate();
      spin.add(part);
    }
    for (const part of bin.fixed) { part.position.copy(center).negate(); steer.add(part); }
    return Object.freeze({ index, front: center.z > 0, radius, restYaw,
      center: Object.freeze(center.toArray()), rotatingTriangles: bin.rotating.reduce((n, p) => n + p.geometry.index.count / 3, 0) });
  });
}
