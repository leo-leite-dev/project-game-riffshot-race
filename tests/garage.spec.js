import * as THREE from 'three';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GarageWorld } from '../src/visuals/garage/GarageWorld.js';
import { CHARACTERS } from '../src/data/characters.js';
import { VEHICLE, PAINTS, VEHICLE_ATTRIBUTES } from '../src/data/vehicles.js';
import { test, expect, state, waitScene, openCharacters, clickObject } from './helpers.js';

const READY_TIMEOUT = 15_000;
const DIST_DIRECTORY = resolve(dirname(fileURLToPath(import.meta.url)), '../dist');
const PILOT = CHARACTERS[1];
const ARM_STATES = ['tracking', 'aligning', 'descending', 'gripping', 'lifting', 'transporting', 'complete'];

test.describe('oficina 3D e preparação', () => {
  test.setTimeout(90_000);

  async function waitGarage(page, key = 'VehicleSelection') {
    // The real arm takes over six seconds; the shared scene helper alone allows only six.
    await expect.poll(async () => (await state(page)).key, {
      timeout: key === 'RacePreparation' ? 45_000 : READY_TIMEOUT,
    }).toBe(key);
    await waitScene(page, key);
    await expect.poll(async () => page.evaluate(async key => {
      const { game } = await import(document.querySelector('script[src*="/src/main.js"]').src);
      const scene = game.scene.getScene(key);
      return !!(scene.garageView?.elapsed > 0 && scene.garageView.renderElapsed < 1 / 30 && scene.previewTexture
        && game.textures.exists(scene.previewKey)
        && scene.loadingLabel.text.includes('OFICINA ONLINE')
        && game.garageResources?.model);
    }, key), { timeout: READY_TIMEOUT, message: `${key}: GLB e preview realmente prontos` }).toBe(true);
  }

  async function openGarage(page) {
    await openCharacters(page);
    await clickObject(page, 'cards', 1);
    // Retain the actual original texture, rather than accepting a recreated portrait.
    await page.evaluate(async () => {
      const { game } = await import(document.querySelector('script[src*="/src/main.js"]').src);
      window.__garageOriginalPortrait = game.scene.getScene('CharacterSelection').details.portrait.texture;
    });
    await clickObject(page, 'confirmButton');
    await waitGarage(page);
    await page.evaluate(async () => {
      const { game } = await import(document.querySelector('script[src*="/src/main.js"]').src);
      window.__garageResourceIdentity = {
        owner: game.garageResources, model: game.garageResources.model, renderer: game.garageResources.renderer,
      };
    });
    await expect(page.locator('#screen-status')).toContainText(PILOT.name);
  }

  async function garageState(page) {
    return page.evaluate(async () => {
      const { game } = await import(document.querySelector('script[src*="/src/main.js"]').src);
      const scene = game.scene.getScenes(true)[0];
      const view = scene.garageView;
      return {
        key: scene.scene.key, selected: scene.selectedIndex, confirming: scene.confirming,
        focus: view?.focusIndex, mode: view?.mode,
        rotations: view?.vehicles.map(vehicle => vehicle.rotation.y),
        pose: view?.vehicles.map(vehicle => {
          const nodes = [];
          vehicle.children.forEach(child => child.traverse(node => {
            nodes.push([...node.position.toArray(), ...node.quaternion.toArray(), ...node.scale.toArray()]);
          }));
          return nodes;
        }),
        arm: view?.arm && { state: view.arm.state, x: view.arm.group.position.x, target: view.arm.targetX },
        characterId: game.registry.get('selectedCharacterId'),
        vehicleId: game.registry.get('selectedVehicleId') ?? null,
        paintId: game.registry.get('selectedPaintId') ?? null,
        race: game.registry.get('racePreparation') ?? null,
      };
    });
  }

  async function resources(page) {
    return page.evaluate(async () => {
      const { game } = await import(document.querySelector('script[src*="/src/main.js"]').src);
      const scene = game.scene.getScenes(true)[0];
      const cache = Object.fromEntries(Object.entries(game.cache)
        .filter(([, entry]) => typeof entry?.getKeys === 'function')
        .map(([name, entry]) => [name, entry.getKeys().sort()]));
      return {
        // Text objects receive fresh UUID keys on every scene entry. Their count
        // must stay stable; only intentionally cached/named keys keep identity.
        textures: game.textures.getTextureKeys().filter(key => !/^[\da-f]{8}-[\da-f-]{27}$/i.test(key)).sort(),
        textureCount: game.textures.getTextureKeys().length, cache,
        loads: game.garageResources.loads,
        sameOwner: game.garageResources === window.__garageResourceIdentity.owner,
        sameModel: game.garageResources.model === window.__garageResourceIdentity.model,
        sameRenderer: game.garageResources.renderer === window.__garageResourceIdentity.renderer,
        memory: { ...game.garageResources.renderer.info.memory },
        programs: game.garageResources.renderer.info.programs.length,
        resizeListeners: game.scale.listenerCount('resize'),
        destroyListeners: game.events.listenerCount('destroy'),
        stepListeners: game.events.listenerCount('poststep'),
        keyboardListeners: scene.input.keyboard.listenerCount('keydown'),
        pointerListeners: scene.input.eventNames().map(name => [String(name), scene.input.listenerCount(name)]).sort(),
      };
    });
  }

  async function expectBounds(page, key, viewport) {
    await page.setViewportSize(viewport);
    await waitGarage(page, key);
    await expect.poll(async () => page.evaluate(async ({ key, viewport }) => {
      const { game } = await import(document.querySelector('script[src*="/src/main.js"]').src);
      const s = game.scene.getScene(key);
      if (game.scale.width !== viewport.width || game.scale.height !== viewport.height) return ['resize pendente'];
      if (s.garageView.renderElapsed >= 1 / 30) return ['render após resize pendente'];
      const objects = key === 'VehicleSelection'
        ? [s.title, s.subtitle, s.bayLabel, ...s.cards, ...s.statLabels, ...s.statValues,
          s.confirmButton, s.backButton, s.preview, s.loadingLabel, s.hint]
         : [s.title, s.pilotPortrait, s.pilotTag, s.pilotName, s.rivalPanel, s.rivalName,
          s.playerLabel, s.playerName, ...s.campaignFields.flatMap(field => [field.label, field.value]),
          s.vehicleTitle, s.rivalVehicleTitle, s.rivalVehicleSoon, s.preview, s.loadingLabel,
          s.motor, s.suspension, s.armor, ...Object.values(s.statValues), ...s.modules, s.startButton];
      return objects.filter(object => object.visible).flatMap(object => {
        const b = object.getBounds();
        return b.width > 0 && b.height > 0 && b.left >= -1 && b.right <= game.scale.width + 1
          && b.top >= 53 && b.bottom <= game.scale.height - 47 ? [] : [
            `${object === s.rivalPanel ? 'rivalPanel' : object === s.motor ? 'motor' : object === s.suspension ? 'suspension' : object === s.armor ? 'armor' : object.text ?? object.type} (${Math.round(b.left)},${Math.round(b.top)}–${Math.round(b.right)},${Math.round(b.bottom)})`,
          ];
      });
    }, { key, viewport }), { message: `${key}: elementos dentro da área útil em ${viewport.width}x${viewport.height}` }).toEqual([]);
  }

  test('um GLB fornece geometrias compartilhadas, pinturas independentes e esqueletos separados sem animar o modelo', async ({ page }) => {
    const requests = [];
    page.on('request', request => {
      if (new URL(request.url()).pathname === VEHICLE.modelUrl) requests.push(request.url());
    });
    await openGarage(page);
    const model = await page.evaluate(async () => {
      const { game } = await import(document.querySelector('script[src*="/src/main.js"]').src);
      const { VEHICLE, PAINTS } = await import('/src/data/vehicles.js');
      const { garageView: view } = game.scene.getScene('VehicleSelection');
      const resources = game.garageResources;
      const collect = root => {
        const meshes = [];
        root.traverse(object => { if (object.isMesh) meshes.push(object); });
        return meshes;
      };
      const original = collect(resources.model.scene);
      const copies = view.vehicles.map(collect);
      const originalBones = new Set();
      resources.model.scene.traverse(object => { if (object.isBone) originalBones.add(object); });
      const cloneBones = view.vehicles.map(vehicle => {
        const bones = new Set();
        vehicle.traverse(object => { if (object.isBone) bones.add(object); });
        return bones;
      });
      const allPaints = view.vehicles.flatMap(vehicle => vehicle.userData.ownedMaterials);
      let sharedGeometry = true, independentPaint = true, exactUnpainted = true, separateSkins = true;
      let painted = 0, unpainted = 0, skins = 0;
      copies.forEach((meshes, index) => {
        sharedGeometry &&= meshes.length === original.length;
        meshes.forEach((mesh, m) => {
          const source = original[m];
          sharedGeometry &&= mesh.geometry === source.geometry;
          const materials = [mesh.material].flat(), originals = [source.material].flat();
          exactUnpainted &&= materials.length === originals.length;
          materials.forEach((material, i) => {
            if (originals[i].name === VEHICLE.paintMaterial) {
              painted += 1;
              independentPaint &&= material !== originals[i]
                && view.vehicles[index].userData.ownedMaterials.includes(material)
                && material.color.getHexString().toLowerCase() === PAINTS[index].color.slice(1).toLowerCase();
            } else {
              unpainted += 1;
              // Object identity also preserves maps, roughness, metalness and exact original color.
              exactUnpainted &&= material === originals[i]
                && (!material.color || material.color.equals(originals[i].color));
            }
          });
          if (mesh.isSkinnedMesh) {
            skins += 1;
            separateSkins &&= mesh.skeleton !== source.skeleton
              && mesh.skeleton.bones.length === source.skeleton.bones.length
              && mesh.skeleton.bones.every(bone => cloneBones[index].has(bone) && !originalBones.has(bone)
                && cloneBones.every((others, otherIndex) => otherIndex === index || !others.has(bone)))
              && copies.every((others, otherIndex) => otherIndex === index || others[m].skeleton !== mesh.skeleton);
          }
        });
      });
      return {
        loads: resources.loads, paints: view.vehicles.map(vehicle => vehicle.userData.paintId),
        sharedGeometry, independentPaint, exactUnpainted, separateSkins, painted, unpainted, skins,
        uniquePaints: new Set(allPaints).size === allPaints.length,
        clips: resources.model.animations.length,
        offscreen: !resources.renderer.domElement.isConnected,
        bounded: resources.renderer.domElement.width <= 1100 && resources.renderer.domElement.height <= 600,
      };
    });
    expect(requests).toHaveLength(1);
    expect(model).toMatchObject({
      loads: 1, paints: PAINTS.map(paint => paint.id), sharedGeometry: true,
      independentPaint: true, exactUnpainted: true, separateSkins: true,
      uniquePaints: true, offscreen: true, bounded: true,
    });
    expect(model.painted).toBeGreaterThan(0);
    expect(model.unpainted).toBeGreaterThan(0);
    expect(model.skins).toBeGreaterThan(0);
    expect(model.clips).toBeGreaterThan(0);
    await expect(page.locator('canvas')).toHaveCount(1);
    await expect(page.locator('canvas')).toBeVisible();

    const before = await garageState(page);
    await expect.poll(async () => (await garageState(page)).rotations[0]).toBeGreaterThan(before.rotations[0]);
    const after = await garageState(page);
    expect(after.rotations.slice(1)).toEqual(before.rotations.slice(1));
    expect(after.pose).toEqual(before.pose); // Embedded clips never change child/bone transforms.
    expect(after).toMatchObject({ mode: 'selection', vehicleId: null, paintId: null });
  });

  test('teclado e cartões selecionam; braço acompanha e transfere uma única vez com comandos bloqueados', async ({ page }) => {
    await test.step('simulação isolada: delta em milissegundos, 30/60/120 FPS e transferência em menos de 8 s simulados', async () => {
      // No browser, WebGL or live scene is advanced here. Only the render boundary is stubbed.
      for (const fps of [30, 60, 120]) {
        const world = new GarageWorld({
          environment: { texture: null },
          renderer: { setSize() {}, render() {}, renderLists: { dispose() {} } },
          createVehicle(paint) {
            const vehicle = new THREE.Group();
            vehicle.userData = { paintId: paint.id, size: new THREE.Vector3(2, 1, 3.25), ownedMaterials: [] };
            return vehicle;
          },
        });
        try {
          const initial = world.vehicles.map(vehicle => vehicle.rotation.y);
          for (let frame = 0; frame < fps; frame += 1) world.update(1000 / fps);
          expect(world.vehicles[0].rotation.y - initial[0]).toBeCloseTo(0.24, 8);
          expect(world.vehicles.slice(1).map(vehicle => vehicle.rotation.y)).toEqual(initial.slice(1));
          world.setFocus(2);
          const selectedYaw = world.vehicles[2].rotation.y;
          world.update(500); // A stalled frame is capped at 0.25 s, not applied twice.
          expect(world.vehicles[2].rotation.y - selectedYaw).toBeCloseTo(0.06, 8);
          let callbacks = 0;
          world.confirm(() => { callbacks += 1; });
          world.confirm(() => { callbacks += 100; });
          const states = ['tracking', world.arm.state];
          let seconds = 0;
          while (world.arm.state !== 'complete' && seconds < 9) {
            world.update(1000 / fps);
            seconds += 1 / fps;
            if (states.at(-1) !== world.arm.state) states.push(world.arm.state);
          }
          expect(states).toEqual(ARM_STATES);
          expect(seconds).toBeLessThan(8);
          expect(callbacks).toBe(1);
          expect(world.vehicles[2].position.x).toBeCloseTo(27, 8);
          expect(world.vehicles[2].position.y).toBeCloseTo(1.19, 8);
          world.update(1000);
          expect(callbacks).toBe(1);
        } finally { world.destroy(); }
      }
    });

    await openGarage(page);
    for (const [key, index] of [['a', 2], ['d', 0], ['ArrowRight', 1], ['ArrowLeft', 0]]) {
      await page.keyboard.press(key);
      await expect.poll(async () => (await garageState(page)).selected).toBe(index);
      await expect(page.locator('#screen-status')).toContainText(PAINTS[index].name);
      await expect(page.locator('#screen-status')).toContainText(PILOT.name);
    }
    for (const index of [2, 1]) {
      await clickObject(page, 'cards', index);
      await expect.poll(async () => (await garageState(page)).focus).toBe(index);
    }
    // Click an actual visible car mesh, not just its paint card. Locate a
    // ray-tested point in the real preview, then deliver a normal mouse click.
    await expect.poll(async () => Math.abs((await garageState(page)).arm.x), { timeout: READY_TIMEOUT }).toBeLessThan(0.03);
    const modelPoint = await page.evaluate(async () => {
      const { game } = await import(document.querySelector('script[src*="/src/main.js"]').src);
      const s = game.scene.getScene('VehicleSelection');
      const bounds = s.preview.getBounds();
      for (let v = 0.25; v < 0.9; v += 0.025) {
        for (let u = 0.05; u < 0.95; u += 0.025) {
          const index = s.garageView.pick(u, v);
          if (index !== null && index !== s.selectedIndex
            && [[0.02, 0], [-0.02, 0], [0, 0.02], [0, -0.02]].every(([du, dv]) => s.garageView.pick(u + du, v + dv) === index)) {
            return { index, x: bounds.x + u * bounds.width, y: bounds.y + v * bounds.height };
          }
        }
      }
      return null;
    });
    expect(modelPoint).not.toBeNull();
    await page.mouse.click(modelPoint.x, modelPoint.y);
    await expect.poll(async () => (await garageState(page)).selected).toBe(modelPoint.index);
    await clickObject(page, 'cards', 2);
    await expect.poll(async () => Math.abs((await garageState(page)).arm.x - 5), { timeout: READY_TIMEOUT }).toBeLessThan(0.08);
    const before = await garageState(page);
    await expect.poll(async () => (await garageState(page)).rotations[2]).toBeGreaterThan(before.rotations[2]);
    const after = await garageState(page);
    expect(after.rotations.slice(0, 2)).toEqual(before.rotations.slice(0, 2));
    expect(after).toMatchObject({ selected: 2, arm: { state: 'tracking', target: 5 }, paintId: null });

    // Observe every real poststep so short states are retained even on slow software WebGL.
    await page.evaluate(async () => {
      const { game } = await import(document.querySelector('script[src*="/src/main.js"]').src);
      const view = game.scene.getScene('VehicleSelection').garageView;
      const observation = window.__garageArm = { states: [view.arm.state], seconds: null };
      let start;
      const observe = () => {
        const current = view.arm.state;
        if (view.confirming && start === undefined) start = view.elapsed;
        if (observation.states.at(-1) !== current) observation.states.push(current);
        if (current === 'complete' || !game.scene.isActive('VehicleSelection')) {
          observation.seconds = view.elapsed - start;
          game.events.off('poststep', observe);
        }
      };
      game.events.on('poststep', observe);
    });
    await page.keyboard.press('Enter');
    await expect.poll(() => page.evaluate(() => window.__garageArm.states), { intervals: [20, 50] }).toContain('aligning');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Escape');
    await page.keyboard.press('a');
    await clickObject(page, 'cards', 0);
    await clickObject(page, 'confirmButton');
    expect(await garageState(page)).toMatchObject({
      key: 'VehicleSelection', confirming: true, selected: 2, focus: 2,
      characterId: PILOT.id, vehicleId: VEHICLE.id, paintId: PAINTS[2].id,
    });
    for (const armState of ARM_STATES.slice(2)) {
      await expect.poll(() => page.evaluate(() => window.__garageArm.states), {
        timeout: READY_TIMEOUT, intervals: [20, 50, 100], message: `braço alcança ${armState}`,
      }).toContain(armState);
    }
    expect(await page.evaluate(() => window.__garageArm.states)).toEqual(ARM_STATES);
    expect(await page.evaluate(() => window.__garageArm.seconds)).toBeLessThan(8);
    await waitGarage(page, 'RacePreparation');
    expect(await garageState(page)).toMatchObject({ mode: 'preparation', paintId: PAINTS[2].id, characterId: PILOT.id });
  });

  test('preparação usa dados e retrato originais; módulos, START e retornos preservam estado sem acumular recursos', async ({ page }) => {
    test.setTimeout(180_000);
    await openGarage(page);
    await clickObject(page, 'cards', 1);
    await page.keyboard.press('Enter');
    await waitGarage(page, 'RacePreparation');
    const preparation = await page.evaluate(async () => {
      const { game } = await import(document.querySelector('script[src*="/src/main.js"]').src);
      const { getRaceState } = await import('/src/data/raceState.js');
      const s = game.scene.getScene('RacePreparation');
      const texts = [];
      const visit = object => {
        if (typeof object.text === 'string') texts.push(object.text);
        if (object.list) object.list.forEach(visit);
      };
      [s.motor, s.suspension, s.armor].forEach(visit);
      return {
        race: getRaceState(game.registry), sameState: s.raceState === getRaceState(game.registry),
        characterId: s.character.id, paintId: s.selection.paint.id,
        pilot: s.pilotName.text, player: s.playerLabel.text, playerName: s.playerName.text,
        portrait: s.pilotPortrait.texture.key, originalPortrait: s.pilotPortrait.texture === window.__garageOriginalPortrait,
        vehicle: s.vehicleTitle.text, stats: Object.fromEntries(Object.entries(s.statValues).map(([key, value]) => [key, value.text])),
        texts, fields: s.campaignFields.map(field => [field.label.text, field.value.text]),
        modules: s.modules.map(button => [button.label.text, button.detail.text]), start: s.startButton.label.text,
        previousPreviewRemoved: !game.textures.exists('VehicleSelection-garage-preview'),
      };
    });
    expect(preparation).toMatchObject({
      sameState: true, characterId: PILOT.id, paintId: PAINTS[1].id,
      pilot: PILOT.name, player: 'PLAYER 1', playerName: PILOT.name,
      portrait: `pilot-${PILOT.id}`, originalPortrait: true,
      vehicle: `${VEHICLE.name} / ${PAINTS[1].name}`, start: 'START RACE', previousPreviewRemoved: true,
      race: { player: 'PLAYER 1', credits: 2000, division: 'B', racesCompleted: 0, racesTotal: 8, requiredPoints: 1400, points: 0 },
      fields: [['CRÉDITOS', '2.000'], ['DIVISÃO', 'B'], ['CORRIDAS', '0 de 8'],
        ['PONTOS NECESSÁRIOS', '1.400'], ['PONTOS ATUAIS', '0']],
      modules: [['PISTA / CORRIDA', 'Em breve'], ['MELHORIAS', 'Em breve'], ['REPAROS', 'Em breve'],
        ['VEÍCULO', 'SELEÇÃO'], ['SAIR / VOLTAR', 'ESC']],
    });
    expect(preparation.stats).toEqual(Object.fromEntries(VEHICLE_ATTRIBUTES.map(({ key }) => [key, String(VEHICLE.stats[key])])));
    for (const label of ['MOTOR', 'VELOCIDADE', 'ACELERAÇÃO', 'SUSPENSÃO', 'CONTROLE', 'BLINDAGEM', 'RESISTÊNCIA']) {
      expect(preparation.texts).toContain(label);
    }
    const selectedState = await garageState(page);
    for (let index = 0; index < 3; index += 1) {
      await clickObject(page, 'modules', index);
      await expect(page.locator('#screen-status')).toHaveText('Em breve');
      expect((await state(page)).toast).toContain('Em breve');
      expect(await garageState(page)).toMatchObject({
        key: 'RacePreparation', characterId: selectedState.characterId,
        vehicleId: selectedState.vehicleId, paintId: selectedState.paintId, race: selectedState.race,
      });
    }

    const baseline = await resources(page);
    expect(baseline).toMatchObject({
      loads: 1, sameOwner: true, sameModel: true, sameRenderer: true, keyboardListeners: 1,
    });
    for (let cycle = 0; cycle < 2; cycle += 1) {
      await clickObject(page, 'startButton');
      await waitScene(page, 'RaceDevelopment');
      await expect(page.locator('#screen-status')).toContainText('Corrida em desenvolvimento');
      expect(await page.evaluate(async () => {
        const { game } = await import(document.querySelector('script[src*="/src/main.js"]').src);
        return game.textures.getTextureKeys().filter(key => key.endsWith('-garage-preview'));
      })).toEqual([]);
      await page.keyboard.press('Escape');
      await waitGarage(page, 'RacePreparation');
      expect(await resources(page)).toEqual(baseline);
    }

    let selectionBaseline;
    for (let cycle = 0; cycle < 3; cycle += 1) {
      // Cover both modules that return to the garage as well as the Escape shortcut.
      if (cycle < 2) await clickObject(page, 'modules', cycle === 0 ? 3 : 4);
      else await page.keyboard.press('Escape');
      await waitGarage(page);
      expect(await garageState(page)).toMatchObject({ selected: 1, characterId: PILOT.id, paintId: PAINTS[1].id });
      expect((await resources(page)).textures).not.toContain('RacePreparation-garage-preview');
      if (!selectionBaseline) selectionBaseline = await resources(page);
      else expect(await resources(page)).toEqual(selectionBaseline);
      await page.keyboard.press('Escape');
      await waitScene(page, 'CharacterSelection');
      expect((await state(page)).selected).toBe(1);
      expect((await state(page)).keyboardListeners).toBe(1);
      expect((await resources(page)).textures.filter(key => key.endsWith('-garage-preview'))).toEqual([]);
      await page.keyboard.press('Enter');
      await waitGarage(page);
      expect(await resources(page)).toEqual(selectionBaseline);
      await page.keyboard.press('Enter');
      await waitGarage(page, 'RacePreparation');
      expect(await resources(page)).toEqual(baseline);
      expect(await garageState(page)).toMatchObject({
        characterId: PILOT.id, vehicleId: VEHICLE.id, paintId: PAINTS[1].id, race: selectedState.race,
      });
    }
  });

  test('garagem e preparação respeitam limites desktop, mobile, landscape e 320x568 com registros visuais prontos', async ({ page }, testInfo) => {
    const viewports = [
      { width: 1440, height: 900, suffix: '' },
      { width: 390, height: 844, suffix: '-mobile' },
      { width: 844, height: 390, suffix: '-landscape' },
      { width: 320, height: 568, suffix: '-320x568' },
    ];
    await openGarage(page);
    for (const { suffix, ...viewport } of viewports) {
      await expectBounds(page, 'VehicleSelection', viewport);
      await page.screenshot({ path: testInfo.outputPath(`garage${suffix}.png`) });
    }
    await clickObject(page, 'cards', 2);
    await clickObject(page, 'confirmButton');
    await waitGarage(page, 'RacePreparation');
    for (const { suffix, ...viewport } of viewports) {
      await expectBounds(page, 'RacePreparation', viewport);
      await page.screenshot({ path: testInfo.outputPath(`preparation${suffix}.png`) });
    }
    await page.keyboard.press('Escape');
    await waitGarage(page);
    expect(await garageState(page)).toMatchObject({ selected: 2, paintId: PAINTS[2].id, characterId: PILOT.id });
  });

  test('produção em 4173 usa veículo original sem GLB e percorre intro, menu, pilotos, oficina, estação e retorno', async ({ page }, testInfo) => {
    test.setTimeout(45_000);
    expect(existsSync(resolve(DIST_DIRECTORY, 'models/cars/air_blade_rock_n_roll_racing.glb'))).toBe(false);
    expect(existsSync(resolve(DIST_DIRECTORY, 'THIRD_PARTY_NOTICES.txt'))).toBe(true);
    const modelRequests = [];
    page.on('request', request => {
      if (new URL(request.url()).pathname === VEHICLE.modelUrl) modelRequests.push(request.url());
    });
    // Production has no Vite source export. Observe actual canvas text rendering for loader readiness.
    await page.addInitScript(() => {
      window.__garageOnlinePaints = 0;
      window.__garageAirBladeText = 0;
      window.__riffshotLogoDrawn = false;
      window.__riffshotSloganDrawn = false;
      const fillText = CanvasRenderingContext2D.prototype.fillText;
      CanvasRenderingContext2D.prototype.fillText = function (text, ...args) {
        const result = fillText.call(this, text, ...args);
        if (String(text).includes('OFICINA ONLINE')) window.__garageOnlinePaints += 1;
        if (String(text).toUpperCase().includes('AIR BLADE')) window.__garageAirBladeText += 1;
        if (String(text).toUpperCase().includes('RIFFSHOT')) window.__riffshotLogoDrawn = true;
        if (String(text).toUpperCase().includes('SINTA A BATIDA')) window.__riffshotSloganDrawn = true;
        return result;
      };
    });
    // Only entrance/exit fades are reduced; the mechanical transfer still runs normally.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const status = page.locator('#screen-status');
    const frames = () => page.evaluate(() => new Promise(resolve => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    }));
    const onlineCount = () => page.evaluate(() => window.__garageOnlinePaints);
    const advance = async (key, text) => {
      await frames();
      await page.keyboard.press(key);
      await expect(status).toContainText(text, { timeout: READY_TIMEOUT });
      await frames();
    };
    await page.goto('http://127.0.0.1:4173');
    expect(await page.title()).toContain('RIFFSHOT RACING');
    const notices = await page.request.get('http://127.0.0.1:4173/THIRD_PARTY_NOTICES.txt');
    expect(notices.ok()).toBe(true);
    const licenseNotices = await notices.text();
    expect(licenseNotices).toContain('Richard Davey, Phaser Studio Inc.');
    expect(licenseNotices).toContain('2010-2026 three.js authors');
    await expect(status).toContainText('Sinta a batida');
    await expect(status).toContainText('RIFFSHOT RACING');
    await expect.poll(() => page.evaluate(() => window.__riffshotLogoDrawn)).toBe(true);
    await expect.poll(() => page.evaluate(() => window.__riffshotSloganDrawn)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('riffshot-intro.png') });
    await advance('Enter', 'Menu principal');
    expect(await page.evaluate(() => window.__riffshotLogoDrawn)).toBe(true);
    await advance('Enter', 'Seleção de Personagem');
    await advance('ArrowRight', PILOT.name);
    await advance('Enter', 'Seleção de Veículo');
    await expect.poll(onlineCount, { timeout: READY_TIMEOUT }).toBeGreaterThan(0);
    await expect(status).toContainText('Modelo visual original');
    expect(await page.evaluate(() => window.__riffshotSloganDrawn)).toBe(true);
    expect(await page.evaluate(() => window.__garageAirBladeText)).toBe(0);
    expect(modelRequests).toEqual([]);
    for (const [key, paint] of [['d', PAINTS[1]], ['a', PAINTS[0]], ['ArrowLeft', PAINTS[2]]]) {
      await advance(key, paint.name);
      await expect(status).toContainText(PILOT.name);
    }
    await page.screenshot({ path: testInfo.outputPath('garage-production.png') });
    let online = await onlineCount();
    await advance('Enter', 'confirmado');
    await expect(status).toContainText('Preparação', { timeout: 30_000 });
    await expect.poll(onlineCount, { timeout: READY_TIMEOUT }).toBeGreaterThan(online);
    await frames();
    await page.screenshot({ path: testInfo.outputPath('preparation-production.png') });
    await advance('Enter', 'Corrida em desenvolvimento');
    online = await onlineCount();
    await advance('Escape', 'Preparação');
    await expect.poll(onlineCount, { timeout: READY_TIMEOUT }).toBeGreaterThan(online);
    online = await onlineCount();
    await advance('Escape', 'Seleção de Veículo');
    await expect.poll(onlineCount, { timeout: READY_TIMEOUT }).toBeGreaterThan(online);
    await expect(status).toContainText(PILOT.name);
    await expect(status).toContainText(PAINTS[2].name);
    expect(await page.evaluate(() => window.__garageAirBladeText)).toBe(0);
    await advance('Escape', 'Seleção de Personagem');
    await expect(status).toContainText(PILOT.name);
    expect(modelRequests).toEqual([]);
    await expect(page.locator('canvas')).toHaveCount(1);
  });

  test('GLB local inválido ativa veículo procedural original, sinaliza fallback e mantém o fluxo', async ({ page }) => {
    // A successful HTTP response with invalid content exercises the loader error
    // without introducing an expected browser-network error into the fixture.
    await page.route(`**${VEHICLE.modelUrl}`, route => route.fulfill({
      status: 200, contentType: 'model/gltf-binary', body: 'invalid local model',
    }));
    await page.setViewportSize({ width: 844, height: 390 });
    await openCharacters(page);
    await page.keyboard.press('Enter');
    await waitScene(page, 'VehicleSelection');
    await expect.poll(async () => page.evaluate(async () => {
      const { game } = await import(document.querySelector('script[src*="/src/main.js"]').src);
      const s = game.scene.getScene('VehicleSelection');
      return s.garageView?.resources.source === 'original' && s.loadingLabel.text.includes('VEÍCULO ORIGINAL');
    }), { timeout: READY_TIMEOUT }).toBe(true);
    await expect(page.locator('#screen-status')).toContainText('Modelo visual original');
    await clickObject(page, 'confirmButton');
    await expect.poll(async () => (await state(page)).key).toBe('VehicleSelection');
    expect((await garageState(page))).toMatchObject({ confirming: true, characterId: CHARACTERS[0].id, vehicleId: VEHICLE.id });
    await waitGarage(page, 'RacePreparation');
    await expect(page.locator('#screen-status')).toContainText('Preparação');
  });
});
