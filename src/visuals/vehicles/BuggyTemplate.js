import * as THREE from 'three';

const canonicalName = name => name.replace(/[^a-z0-9]/gi, '').toLowerCase();
const WHEEL_MESHES = new Map([
  ['tyre_Material.007_0', [0, 1]], ['rims_rims_0', [0, 1]],
  ['tyre back_Material.007_0', [2, 3]], ['rim back_rims_0', [2, 3]],
].map(([name, pair]) => [canonicalName(name), pair]));

// Copy complete triangles, including every UV/normal/tangent attribute. Fail
// closed if a different model joins the two sides: never cut a wheel in half.
export function splitWheelGeometry(source, matrix) {
  const world = source.clone().applyMatrix4(matrix);
  const positions = world.getAttribute('position');
  const triangles = [[], []];
  const count = world.index?.count ?? positions.count;
  try {
    for (let i = 0; i < count; i += 3) {
      const indices = [0, 1, 2].map(k => world.index ? world.index.getX(i + k) : i + k);
      const xs = indices.map(index => positions.getX(index));
      if (Math.min(...xs) < -1e-5 && Math.max(...xs) > 1e-5) throw new Error('Roda atravessa o plano de separação');
      triangles[xs.reduce((sum, x) => sum + x, 0) < 0 ? 0 : 1].push(...indices);
    }
    return triangles.map(indices => {
      if (!indices.length) throw new Error('Lado da roda ausente');
      const remap = new Map();
      const originals = [];
      const compact = indices.map(index => {
        if (!remap.has(index)) { remap.set(index, originals.length); originals.push(index); }
        return remap.get(index);
      });
      const geometry = new THREE.BufferGeometry();
      for (const [name, attribute] of Object.entries(world.attributes)) {
        const array = new attribute.array.constructor(originals.length * attribute.itemSize);
        // Raw components preserve integer/normalized UVs without double conversion.
        originals.forEach((index, vertex) => {
          for (let k = 0; k < attribute.itemSize; k += 1) {
            array[vertex * attribute.itemSize + k] = attribute.isInterleavedBufferAttribute
              ? attribute.data.array[index * attribute.data.stride + attribute.offset + k]
              : attribute.array[index * attribute.itemSize + k];
          }
        });
        geometry.setAttribute(name, new THREE.BufferAttribute(array, attribute.itemSize, attribute.normalized));
      }
      geometry.setIndex(compact);
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      return geometry;
    });
  } finally { world.dispose(); }
}

export class BuggyTemplate {
  constructor(gltf) {
    this.geometries = new Set();
    this.source = gltf.scene;
    this.source.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(this.source, true);
    const size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());
    if (!Number.isFinite(size.z) || size.z <= 0) throw new Error('Dimensões inválidas do buggy');
    const scale = 3.25 / size.z;
    this.size = size.clone().multiplyScalar(scale);
    this.normalization = new THREE.Matrix4().makeTranslation(-center.x * scale, -bounds.min.y * scale, -center.z * scale)
      .multiply(new THREE.Matrix4().makeScale(scale, scale, scale));
    this.root = new THREE.Group();
    this.root.name = 'experimental-rift-blaze';
    const body = new THREE.Group();
    body.name = 'buggy-body';
    body.position.y = this.size.y * 0.5;
    this.root.add(body);
    const suspension = new THREE.Group();
    suspension.name = 'buggy-suspension';
    body.add(suspension);
    this.wheels = [];
    const originals = [];
    this.source.traverse(object => { if (object.isMesh) originals.push(object); });
    try {
      if (!originals.some(mesh => [mesh.material].flat().some(material => material?.name === 'main_body'))) {
        throw new Error('Material main_body ausente');
      }
      // Tire bounds, rather than the asymmetric rim, define the axle pivot/radius.
      for (const name of ['tyre_Material.007_0', 'tyre back_Material.007_0']) {
        const source = originals.find(mesh => canonicalName(mesh.name) === canonicalName(name));
        if (!source) throw new Error(`Mesh de roda ausente: ${name}`);
        const halves = splitWheelGeometry(source.geometry, source.matrixWorld);
        for (const half of halves) {
          this.geometries.add(half);
          half.applyMatrix4(this.normalization);
          half.computeBoundingBox();
          const wheelCenter = half.boundingBox.getCenter(new THREE.Vector3());
          const wheelSize = half.boundingBox.getSize(new THREE.Vector3());
          const index = this.wheels.length;
          this.wheels.push({ center: wheelCenter, radius: (wheelSize.y + wheelSize.z) / 4, front: index < 2 });
          half.dispose();
          this.geometries.delete(half);
          const travel = new THREE.Group(); travel.name = `wheel-travel-${index}`; travel.position.copy(wheelCenter);
          const steer = new THREE.Group(); steer.name = `wheel-steer-${index}`;
          const spin = new THREE.Group(); spin.name = `wheel-spin-${index}`;
          travel.add(steer); steer.add(spin); this.root.add(travel);
          const smoke = new THREE.Object3D(); smoke.name = `tire-emitter-${index}`;
          smoke.position.copy(wheelCenter); smoke.position.y -= this.wheels[index].radius * 0.94;
          this.root.add(smoke);
        }
      }
      for (const mesh of originals) {
        if (mesh.isSkinnedMesh) throw new Error('Rig inesperado; integração local cancelada');
        const pair = WHEEL_MESHES.get(canonicalName(mesh.name));
        if (pair) {
          const halves = splitWheelGeometry(mesh.geometry, mesh.matrixWorld);
          halves.forEach((geometry, side) => {
            this.geometries.add(geometry);
            const index = pair[side];
            geometry.applyMatrix4(this.normalization);
            const pivot = this.wheels[index].center;
            geometry.translate(-pivot.x, -pivot.y, -pivot.z);
            geometry.computeBoundingBox(); geometry.computeBoundingSphere();
            this.root.getObjectByName(`wheel-spin-${index}`).add(new THREE.Mesh(geometry, mesh.material));
          });
        } else {
          const geometry = mesh.geometry.clone().applyMatrix4(this.normalization.clone().multiply(mesh.matrixWorld));
          geometry.translate(0, -body.position.y, 0);
          this.geometries.add(geometry);
          const copy = new THREE.Mesh(geometry, mesh.material);
          copy.name = mesh.name;
          (/suspension/.test(mesh.name) ? suspension : body).add(copy);
        }
      }
      for (const [index, x] of [-0.38, 0.38].entries()) {
        const anchor = new THREE.Object3D(); anchor.name = `nitro-emitter-${index}`;
        anchor.position.set(x, this.size.y * 0.32, -this.size.z / 2 + 0.08);
        body.add(anchor);
        // Geometry was flattened relative to the body pivot.
        anchor.position.y -= body.position.y;
      }
    } catch (error) { this.destroy(); throw error; }
  }

  create(paint) {
    const root = this.root.clone(true);
    const paintMaterials = new Map();
    root.traverse(object => {
      if (!object.isMesh) return;
      const recolor = material => {
        if (material.name !== 'main_body') return material;
        if (!paintMaterials.has(material)) {
          const copy = material.clone(); copy.color.set(paint.color); paintMaterials.set(material, copy);
        }
        return paintMaterials.get(material);
      };
      object.material = Array.isArray(object.material) ? object.material.map(recolor) : recolor(object.material);
    });
    if (!paintMaterials.size) throw new Error('Material main_body ausente');
    root.userData = { vehicleId: 'rift-blaze', paintId: paint.id, source: 'local-buggy',
      ownedMaterials: [...paintMaterials.values()], paintMaterials: [...paintMaterials.values()], size: this.size.clone() };
    return root;
  }

  destroy() {
    for (const geometry of this.geometries) geometry.dispose();
    this.geometries.clear();
    const materials = new Set(), textures = new Set(), sourceGeometries = new Set();
    this.source?.traverse(mesh => {
      if (mesh.geometry) sourceGeometries.add(mesh.geometry);
      for (const material of [mesh.material].flat()) if (material) materials.add(material);
    });
    for (const material of materials) {
      for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
      material.dispose();
    }
    for (const geometry of sourceGeometries) geometry.dispose();
    const images = new Set();
    for (const texture of textures) { images.add(texture.source.data); texture.dispose(); }
    for (const image of images) image?.close?.();
    this.root?.clear();
  }
}
