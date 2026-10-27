import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PAINTS } from '../../data/vehicles.js';
import { MechanicalArm } from './MechanicalArm.js';

export class GarageWorld {
  constructor(resources, { mode = 'selection', paintId = 'inferno', reducedMotion = false } = {}) {
    this.resources = resources;
    this.mode = mode;
    this.reducedMotion = reducedMotion;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#080e1a');
    this.scene.fog = new THREE.FogExp2(0x080e1a, 0.025);
    this.scene.environment = resources.environment.texture;
    this.camera = new THREE.PerspectiveCamera(42, 2, 0.1, 90);
    this.ownedMaterials = new Set();
    this.ownedGeometries = new Set();
    this.elapsed = 0;
    this.renderElapsed = 1;
    this.focusIndex = Math.max(0, PAINTS.findIndex(paint => paint.id === paintId));
    this.vehicles = [];
    this.platforms = [];
    this.raycaster = new THREE.Raycaster();
    this.buildRoom();
    const visiblePaints = mode === 'selection' ? PAINTS : [PAINTS[this.focusIndex]];
    visiblePaints.forEach((paint, i) => {
      const x = mode === 'selection' ? (i - 1) * 5 : 0;
      const vehicle = resources.createVehicle(paint);
      vehicle.position.set(x, 0.34, 0);
      vehicle.rotation.y = -0.5;
      this.scene.add(vehicle);
      this.vehicles.push(vehicle);
      const platform = new THREE.Group();
      platform.position.x = x;
      this.scene.add(platform);
      const metal = this.material(0x283545, 0.8, 0.36);
      const neon = this.glow(paint.color, 1.5);
      const base = this.mesh(new THREE.CylinderGeometry(2.05, 2.2, 0.3, 64), metal);
      base.position.y = 0.12;
      platform.add(base);
      const ring = this.mesh(new THREE.TorusGeometry(2.07, 0.035, 8, 80), neon);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.29;
      platform.add(ring);
      for (let mark = 0; mark < 12; mark++) {
        const angle = mark * Math.PI / 6;
        const piece = this.box(platform, [0.11, 0.02, 0.3], [Math.sin(angle) * 1.9, 0.28, Math.cos(angle) * 1.9], neon);
        piece.rotation.y = angle;
      }
      this.platforms.push({ neon, ring });
      this.batchStaticMeshes(platform);
    });
    if (mode === 'selection') this.arm = new MechanicalArm(this, this.vehicles[0].userData.size.y + 0.34);
    this.spot = new THREE.SpotLight(0xc5e7ff, 65, 26, 0.5, 0.75, 1.5);
    this.spot.position.set(0, 7, 3);
    this.scene.add(this.spot, this.spot.target);
    this.setFocus(this.focusIndex);
    this.cameraFocus = this.focusX;
    this.resize(960, 470);
  }

  material(color, metalness = 0.4, roughness = 0.5) {
    const material = new THREE.MeshStandardMaterial({ color, metalness, roughness });
    this.ownedMaterials.add(material);
    return material;
  }

  glow(color, intensity = 1) {
    const material = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: intensity, roughness: 0.35 });
    this.ownedMaterials.add(material);
    return material;
  }

  mesh(geometry, material) {
    this.ownedGeometries.add(geometry);
    return new THREE.Mesh(geometry, material);
  }

  box(parent, size, position, material) {
    const object = this.mesh(new THREE.BoxGeometry(...size), material);
    object.position.set(...position);
    parent.add(object);
    return object;
  }

  batchStaticMeshes(parent) {
    // Merge static workshop pieces by material: fewer draw calls, same geometry
    // and appearance. Vehicles and the articulated arm remain independent.
    const groups = new Map();
    for (const child of parent.children) {
      if (!child.isMesh) continue;
      if (!groups.has(child.material)) groups.set(child.material, []);
      groups.get(child.material).push(child);
    }
    for (const [material, meshes] of groups) {
      if (meshes.length < 2) continue;
      const pieces = meshes.map(mesh => {
        mesh.updateMatrix();
        return mesh.geometry.clone().applyMatrix4(mesh.matrix);
      });
      const merged = mergeGeometries(pieces);
      pieces.forEach(piece => piece.dispose());
      if (!merged) continue;
      for (const mesh of meshes) {
        parent.remove(mesh);
        this.ownedGeometries.delete(mesh.geometry);
        mesh.geometry.dispose();
      }
      parent.add(this.mesh(merged, material));
    }
  }

  buildRoom() {
    const steel = this.material(0x1c2a3b, 0.8, 0.42);
    const dark = this.material(0x101927, 0.65, 0.48);
    const cyan = this.glow(0x1677ff, 2.2);
    const magenta = this.glow(0xc73bff, 2);
    const red = this.glow(0xe53935, 2);
    this.box(this.scene, [44, 0.2, 32], [0, -0.21, 0], dark);
    this.box(this.scene, [40, 10, 0.3], [0, 3.5, -5], steel);
    this.box(this.scene, [0.22, 0.22, 24], [-10, 6, 0], cyan);
    this.box(this.scene, [0.22, 0.22, 24], [10, 6, 0], magenta);
    this.box(this.scene, [42, 0.35, 0.5], [0, 6.3, 0], steel);
    this.box(this.scene, [42, 0.045, 0.06], [0, 6.05, 0.3], red);
    for (let i = -4; i <= 4; i++) {
      this.box(this.scene, [0.22, 7, 0.45], [i * 4, 2.5, -4.7], dark);
      this.box(this.scene, [0.05, 3.6, 0.07], [i * 4 + 0.3, 2.8, -4.4], i % 2 ? cyan : magenta);
      this.box(this.scene, [2.2, 1.35, 0.18], [i * 4 + 2, 2.7, -4.6], dark);
      for (let line = 0; line < 4; line++) {
        this.box(this.scene, [0.5 + (line % 3) * 0.48, 0.024, 0.04], [i * 4 + 2, 2.35 + line * 0.2, -4.48], cyan);
      }
    }
    const grid = new THREE.GridHelper(40, 32, 0x316a90, 0x1e3449);
    grid.position.y = -0.095;
    this.ownedGeometries.add(grid.geometry);
    this.ownedMaterials.add(grid.material);
    this.scene.add(grid);
    // Thin irregular metal grooves suggest machining without external textures.
    for (let i = 0; i < 24; i++) this.box(this.scene, [36, 0.003, 0.012], [0, -0.099, -4 + i * 0.36], steel);
    this.batchStaticMeshes(this.scene);
    this.scene.add(new THREE.HemisphereLight(0xc4dfff, 0x34334a, 1.1));
    const key = new THREE.DirectionalLight(0xf2f4ff, 2.6);
    key.position.set(3, 7, 5);
    this.scene.add(key);
    [[0xe53935, -8, 3, 3], [0x1677ff, 7, 4, 2], [0xbd44ff, 0, 4, -3]].forEach(([color, x, y, z]) => {
      const light = new THREE.PointLight(color, 40, 17, 1.6);
      light.position.set(x, y, z);
      this.scene.add(light);
    });
  }

  setFocus(index) {
    if (this.confirming) return;
    this.focusIndex = index;
    this.focusX = this.mode === 'selection' ? (index - 1) * 5 : 0;
    this.arm?.focus(this.focusX);
    this.platforms.forEach(({ neon }, i) => {
      neon.emissiveIntensity = this.mode !== 'selection' || i === index ? 2.4 : 0.25;
    });
  }

  confirm(done) {
    if (this.confirming || !this.arm) return;
    this.confirming = true;
    this.arm.confirm(this.vehicles[this.focusIndex], done);
  }

  pick(u, v) {
    this.raycaster.setFromCamera(new THREE.Vector2(u * 2 - 1, 1 - v * 2), this.camera);
    const hits = this.raycaster.intersectObjects(this.vehicles, true);
    if (!hits.length) return null;
    let object = hits[0].object;
    while (object && !this.vehicles.includes(object)) object = object.parent;
    const index = this.vehicles.indexOf(object);
    return index >= 0 ? index : null;
  }

  resize(width, height) {
    // One bounded offscreen render target, composited into the Phaser canvas.
    const ratio = Math.min(1, 1100 / width, 600 / height);
    const nextWidth = Math.max(2, Math.round(width * ratio));
    const nextHeight = Math.max(2, Math.round(height * ratio));
    if (this.width === nextWidth && this.height === nextHeight) return;
    this.width = nextWidth;
    this.height = nextHeight;
    this.resources.renderer.setSize(this.width, this.height, false);
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
    this.renderElapsed = 1;
  }

  update(delta) {
    const dt = Math.min(delta / 1000, 0.25);
    this.elapsed += dt;
    this.renderElapsed += dt;
    const focused = this.mode === 'selection' ? this.focusIndex : 0;
    // Keep the requested turntable active, but quieter with reduced motion.
    if (!this.confirming) this.vehicles[focused].rotation.y += dt * (this.reducedMotion ? 0.07 : 0.24);
    this.arm?.update(dt);
    this.cameraFocus = THREE.MathUtils.lerp(this.cameraFocus, this.focusX, 1 - Math.exp(-dt * 2.8));
    if (this.mode === 'selection') {
      // Keep the whole focused car in view, including on a tall preview area.
      const distance = Math.max(14.5, 10 / this.camera.aspect);
      this.camera.position.set(this.cameraFocus * 0.7 + 3.6, 7.2, distance);
      this.camera.lookAt(this.cameraFocus * 0.75, 1.5, 0);
    } else {
      this.camera.position.set(5.8, 4.2, Math.max(7.8, 4.4 / this.camera.aspect));
      this.camera.lookAt(0, 1, 0);
    }
    this.spot.position.x = this.cameraFocus;
    this.spot.target.position.set(this.cameraFocus, 0, 0);
    // 30 fps preview; input and UI retain Phaser's normal refresh rate.
    if (this.renderElapsed < 1 / 30) return false;
    this.renderElapsed %= 1 / 30;
    this.resources.renderer.render(this.scene, this.camera);
    return true;
  }

  destroy() {
    if (this.arm) this.arm.done = null;
    for (const vehicle of this.vehicles) {
      for (const material of vehicle.userData.ownedMaterials) material.dispose();
      const skeletons = new Set();
      vehicle.traverse(object => { if (object.skeleton) skeletons.add(object.skeleton); });
      for (const skeleton of skeletons) skeleton.dispose();
    }
    for (const geometry of this.ownedGeometries) geometry.dispose();
    for (const material of this.ownedMaterials) material.dispose();
    this.scene.clear();
    this.resources.renderer.renderLists.dispose();
  }
}
