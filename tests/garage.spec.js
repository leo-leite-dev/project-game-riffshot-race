import * as THREE from 'three';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GarageWorld } from '../src/visuals/garage/GarageWorld.js';
import { CHARACTERS } from '../src/data/characters.js';
import { VEHICLES, INITIAL_VEHICLES, PAINTS, VEHICLE_ATTRIBUTES } from '../src/data/vehicles.js';
import { VEHICLE_MODEL_ASSETS, getVehicleModelAsset } from '../src/visuals/vehicles/vehicleModels.js';
import { createChampionshipState } from '../src/championship/championshipState.js';
import { CHAMPIONSHIP_SAVE_KEY } from '../src/championship/championshipStorage.js';
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
        && game.garageResources?.vehicleModels.templates.size > 0
        && scene.garageView.vehicles.every(vehicle => vehicle.userData.source === 'vehicle-glb')
        && (key !== 'RacePreparation' || scene.rivalPreview));
    }, key), { timeout: READY_TIMEOUT, message: `${key}: modelos GLB e preview realmente prontos` }).toBe(true);
  }

  async function openGarage(page, ownedVehicleIds = []) {
    // Keep selections empty so the initial three-car screen remains reachable.
    const seed = { ...createChampionshipState({ id: 'garage-career', attemptId: 'garage-attempt' }), ownedVehicleIds };
    await page.addInitScript(({ key, seed }) => {
      if (localStorage.getItem(key) === null) localStorage.setItem(key, JSON.stringify(seed));
    }, { key: CHAMPIONSHIP_SAVE_KEY, seed });
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
        owner: game.garageResources, models: game.garageResources.vehicleModels.templates, renderer: game.garageResources.renderer,
      };
    });
    expect((await state(page)).characterId).toBe(PILOT.id);
    await expect(page.locator('#screen-status')).toContainText(INITIAL_VEHICLES[0].name);
  }

  async function garageState(page) {
    return page.evaluate(async () => {
      const { game } = await import(document.querySelector('script[src*="/src/main.js"]').src);
      const scene = game.scene.getScenes(true)[0];
      const view = scene.garageView;
      const championship = game.championship.state;
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
        race: { money: championship.money, score: championship.score, targetScore: championship.targetScore,
          racesRun: championship.racesRun, maxRaces: championship.maxRaces, division: championship.division },
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
        templates: game.garageResources.vehicleModels.templates.size,
        sameOwner: game.garageResources === window.__garageResourceIdentity.owner,
        sameTemplates: game.garageResources.vehicleModels.templates === window.__garageResourceIdentity.models,
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
        ? [s.title, s.balanceLabel, s.subtitle, s.bayLabel, ...s.cards, ...s.paintCards, ...s.statLabels, ...s.statValues,
          s.confirmButton, s.backButton, s.preview, s.loadingLabel, s.hint, s.feedback, s.lockLabel]
         : [s.title, s.pilotPortrait, s.pilotTag, s.pilotName, s.rivalPanel, s.rivalName,
          s.playerLabel, s.playerName, ...s.campaignFields.flatMap(field => [field.label, field.value]),
          s.vehicleTitle, s.rivalVehicleTitle, s.rivalVehicleSoon, s.preview, s.loadingLabel,
          s.motor, s.suspension, s.armor, ...Object.values(s.statValues), ...s.modules, s.startButton];
      return objects.filter(object => object.visible && object.text !== '').flatMap(object => {
        const b = object.getBounds();
        return b.width > 0 && b.height > 0 && b.left >= -1 && b.right <= game.scale.width + 1
          && b.top >= 53 && b.bottom <= game.scale.height - 47 ? [] : [
            `${object === s.rivalPanel ? 'rivalPanel' : object === s.motor ? 'motor' : object === s.suspension ? 'suspension' : object === s.armor ? 'armor' : object.text ?? object.type} (${Math.round(b.left)},${Math.round(b.top)}–${Math.round(b.right)},${Math.round(b.bottom)})`,
          ];
      });
    }, { key, viewport }), { message: `${key}: elementos dentro da área útil em ${viewport.width}x${viewport.height}` }).toEqual([]);
  }

  test('três modelos GLB iniciais compartilham geometrias e preservam materiais e atlas originais', async ({ page }) => {
    await openGarage(page);
    const model = await page.evaluate(async () => {
      const { game } = await import(document.querySelector('script[src*="/src/main.js"]').src);
      const { INITIAL_VEHICLES, PAINTS } = await import('/src/data/vehicles.js');
      const { garageView: view } = game.scene.getScene('VehicleSelection');
      const resources = game.garageResources;
      const collect = root => {
        const meshes = [];
        root.traverse(object => { if (object.isMesh) meshes.push(object); });
        return meshes;
      };
      const templates = INITIAL_VEHICLES.map(vehicle => resources.vehicleModels.get(vehicle.modelFile));
      const originals = templates.map(template => collect(template.root));
      const copies = view.vehicles.map(collect);
      const allPaints = view.vehicles.flatMap(vehicle => vehicle.userData.ownedMaterials);
      let sharedGeometry = true, independentPaint = true, exactUnpainted = true;
      let painted = 0, unpainted = 0;
      copies.forEach((meshes, index) => {
        const original = originals[index];
        sharedGeometry &&= meshes.length === original.length;
        meshes.forEach((mesh, m) => {
          const source = original[m];
          sharedGeometry &&= mesh.geometry === source.geometry;
          const materials = [mesh.material].flat(), originals = [source.material].flat();
          exactUnpainted &&= materials.length === originals.length;
          materials.forEach((material, i) => {
            if (templates[index].paintNames.has(originals[i].name)) {
              painted += 1;
              independentPaint &&= material !== originals[i]
                && view.vehicles[index].userData.ownedMaterials.includes(material)
                && material.color.getHexString().toLowerCase() === PAINTS[0].color.slice(1).toLowerCase();
            } else {
              unpainted += 1;
              // Object identity also preserves maps, roughness, metalness and exact original color.
              exactUnpainted &&= material === originals[i]
                && (!material.color || material.color.equals(originals[i].color));
            }
          });
        });
      });
      return {
        templates: resources.vehicleModels.templates.size, paints: view.vehicles.map(vehicle => vehicle.userData.paintId),
        ids: view.vehicles.map(vehicle => vehicle.userData.vehicleId),
        sources: view.vehicles.map(vehicle => vehicle.userData.source),
        paintSupported: view.vehicles.map(vehicle => vehicle.userData.paintSupported),
        sharedGeometry, independentPaint, exactUnpainted, painted, unpainted,
        uniquePaints: new Set(allPaints).size === allPaints.length,
        offscreen: !resources.renderer.domElement.isConnected,
        bounded: resources.renderer.domElement.width <= 1100 && resources.renderer.domElement.height <= 600,
      };
    });
    expect(model).toMatchObject({
      templates: INITIAL_VEHICLES.length, paints: INITIAL_VEHICLES.map(() => PAINTS[0].id),
      ids: INITIAL_VEHICLES.map(vehicle => vehicle.id), sharedGeometry: true,
      sources: INITIAL_VEHICLES.map(() => 'vehicle-glb'), paintSupported: INITIAL_VEHICLES.map(() => false),
      independentPaint: true, exactUnpainted: true,
      uniquePaints: true, offscreen: true, bounded: true,
    });
    expect(model.painted).toBe(0); // Mixed atlases keep their authored colors; paintId is the team color.
    expect(model.unpainted).toBeGreaterThan(0);
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
          createVehicle(vehicleId, paint) {
            const vehicle = new THREE.Group();
            vehicle.userData = { vehicleId, paintId: paint.id, size: new THREE.Vector3(2, 1, 3.25), ownedMaterials: [] };
            return vehicle;
          },
          paintVehicle(vehicle, paint) { vehicle.userData.paintId = paint.id; },
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

    await openGarage(page, [VEHICLES[2].id]);
    await expect(page.locator('#screen-status')).toContainText(VEHICLES[0].name);
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('#screen-status')).toContainText(VEHICLES[1].name);
    await page.keyboard.press('ArrowRight');
    await expect.poll(async () => (await garageState(page)).selected).toBe(2);
    await expect(page.locator('#screen-status')).toContainText(VEHICLES[2].name);
    await page.keyboard.press('Enter');
    await clickObject(page, 'paintCards', 2);
    await expect.poll(async () => (await garageState(page)).focus).toBe(2);
    expect(await page.evaluate(async () => {
      const { game } = await import(document.querySelector('script[src*="/src/main.js"]').src);
      const scene = game.scene.getScene('VehicleSelection');
      return { stage: scene.stage, subtitle: scene.subtitle.text };
    })).toMatchObject({ stage: 'paint', subtitle: expect.stringContaining(PAINTS[2].name) });
    await expect.poll(async () => Math.abs((await garageState(page)).arm.x), { timeout: READY_TIMEOUT }).toBeLessThan(0.03);
    const visibleVehicles = await page.evaluate(async () => {
      const { game } = await import(document.querySelector('script[src*="/src/main.js"]').src);
      return game.scene.getScene('VehicleSelection').garageView.vehicles.map(vehicle => vehicle.visible);
    });
    expect(visibleVehicles).toEqual([false, false, true]);
    const before = await garageState(page);
    await expect.poll(async () => (await garageState(page)).rotations[2]).toBeGreaterThan(before.rotations[2]);
    const after = await garageState(page);
    expect(after.rotations.slice(0, 2)).toEqual(before.rotations.slice(0, 2));
    expect(after).toMatchObject({ selected: 2, arm: { state: 'tracking', target: 0 }, paintId: null });

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
    await clickObject(page, 'confirmButton');
    expect(await garageState(page)).toMatchObject({
      key: 'VehicleSelection', confirming: true, selected: 2, focus: 2,
      characterId: PILOT.id, vehicleId: VEHICLES[2].id, paintId: PAINTS[2].id,
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
    await openGarage(page, [VEHICLES[1].id]);
    await clickObject(page, 'cards', 1);
    await page.keyboard.press('Enter');
    await clickObject(page, 'paintCards', 1);
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
      vehicle: `${VEHICLES[1].name} / ${PAINTS[1].name}`, start: 'START RACE', previousPreviewRemoved: true,
      race: { money: 2000, division: 'B', racesRun: 0, maxRaces: 8, targetScore: 1400, score: 0 },
      fields: [['MONEY', '$ 2.000'], ['DIVISION', 'B'], ['RACES RUN', '0 OF 8'],
        ['SCORE NEED', '1.400'], ['SCORE HAVE', '0']],
      modules: [['PISTA / CORRIDA', 'CIRCUITO'], ['MELHORIAS', 'Em breve'], ['REPAROS', 'Em breve'],
        ['VEÍCULO', 'LOJA DE VEÍCULOS'], ['SAIR / VOLTAR', 'ESC']],
    });
    expect(preparation.stats).toEqual(Object.fromEntries(VEHICLE_ATTRIBUTES.map(({ key }) => [key, String(VEHICLES[1].stats[key])])));
    for (const label of ['MOTOR', 'VELOCIDADE MÁXIMA', 'ACELERAÇÃO', 'SUSPENSÃO', 'CONTROLE', 'RESISTÊNCIA']) {
      expect(preparation.texts).toContain(label);
    }
    const selectedState = await garageState(page);
    for (let index of [1, 2]) {
      await clickObject(page, 'modules', index);
      await expect(page.locator('#screen-status')).toHaveText('Em breve');
      expect((await state(page)).toast).toContain('Em breve');
      expect(await garageState(page)).toMatchObject({
        key: 'RacePreparation', characterId: selectedState.characterId,
        vehicleId: selectedState.vehicleId, paintId: selectedState.paintId, race: selectedState.race,
      });
    }
    await clickObject(page, 'modules', 0);
    await waitScene(page, 'RaceTrackSelection');
    const assignedName = await page.evaluate(async () => {
      const { game } = await import(document.querySelector('script[src*="/src/main.js"]').src);
      return game.scene.getScene('RaceTrackSelection').assignedTrack.name;
    });
    await expect(page.locator('#screen-status')).toContainText(assignedName);
    await page.keyboard.press('Escape');
    await waitGarage(page, 'RacePreparation');
    expect(await garageState(page)).toMatchObject({
      key: 'RacePreparation', characterId: selectedState.characterId,
      vehicleId: selectedState.vehicleId, paintId: selectedState.paintId, race: selectedState.race,
    });

    // Warm the full five-car shop once before comparing GPU/resource counts.
    await clickObject(page, 'modules', 3);
    await waitGarage(page);
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    await waitGarage(page, 'RacePreparation');
    const baseline = await resources(page);
    expect(baseline).toMatchObject({
      templates: VEHICLE_MODEL_ASSETS.length, sameOwner: true, sameTemplates: true, sameRenderer: true, keyboardListeners: 1,
    });
    for (let cycle = 0; cycle < 2; cycle += 1) {
      await clickObject(page, 'startButton');
      await waitScene(page, 'RaceTrackSelection');
      await expect(page.locator('#screen-status')).toContainText(assignedName);
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
      // Both modules and Escape open the full shop; its back action returns to the team.
      if (cycle < 2) await clickObject(page, 'modules', cycle === 0 ? 3 : 4);
      else await page.keyboard.press('Escape');
      await waitGarage(page);
      expect(await garageState(page)).toMatchObject({ selected: 1, characterId: PILOT.id, paintId: PAINTS[1].id });
      expect((await resources(page)).textures).not.toContain('RacePreparation-garage-preview');
      if (!selectionBaseline) selectionBaseline = await resources(page);
      else expect(await resources(page)).toEqual(selectionBaseline);
      await page.keyboard.press('Escape');
      await waitGarage(page, 'RacePreparation');
      expect((await state(page)).keyboardListeners).toBe(1);
      expect((await resources(page)).textures).not.toContain('VehicleSelection-garage-preview');
      await clickObject(page, 'modules', 3);
      await waitGarage(page);
      expect(await resources(page)).toEqual(selectionBaseline);
      await page.keyboard.press('Enter');
      await page.keyboard.press('Enter');
      await waitGarage(page, 'RacePreparation');
      expect(await resources(page)).toEqual(baseline);
      expect(await garageState(page)).toMatchObject({
        characterId: PILOT.id, vehicleId: VEHICLES[1].id, paintId: PAINTS[1].id, race: selectedState.race,
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
    await openGarage(page, [VEHICLES[2].id]);
    for (const { suffix, ...viewport } of viewports) {
      await expectBounds(page, 'VehicleSelection', viewport);
      await page.screenshot({ path: testInfo.outputPath(`garage${suffix}.png`) });
    }
    await clickObject(page, 'cards', 2);
    await clickObject(page, 'confirmButton');
    await clickObject(page, 'paintCards', 2);
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

  test('produção em 4183 usa os veículos GLB oficiais e percorre intro, menu, oficina e corrida com nitro', async ({ page }, testInfo) => {
    test.setTimeout(60_000);
    expect(existsSync(resolve(DIST_DIRECTORY, 'models/cars/air_blade_rock_n_roll_racing.glb'))).toBe(false);
    expect(existsSync(resolve(DIST_DIRECTORY, 'THIRD_PARTY_NOTICES.txt'))).toBe(true);
    const modelRequests = [];
    const experimentalRequests = [];
    page.on('request', request => {
      const path = new URL(request.url()).pathname;
      if (path.startsWith('/models/vehicles/')) modelRequests.push(path);
      if (path.startsWith('/__local-models/') || path.startsWith('/models/cars/')) experimentalRequests.push(path);
    });
    for (const asset of VEHICLE_MODEL_ASSETS) expect(existsSync(resolve(DIST_DIRECTORY, `models/vehicles/${asset.fileName}`))).toBe(true);
    // Production has no Vite source export. Observe actual canvas text rendering for loader readiness.
    await page.addInitScript(() => {
      window.__garageOnlinePaints = 0;
      window.__garageTeamColor = '';
      window.__riffshotLogoDrawn = false;
      window.__riffshotSloganDrawn = false;
      window.__raceSpeedValues = [];
      window.__raceNitroDrawn = false;
      window.__isometricCameraDrawn = false;
      const fillText = CanvasRenderingContext2D.prototype.fillText;
      CanvasRenderingContext2D.prototype.fillText = function (text, ...args) {
        const result = fillText.call(this, text, ...args);
        if (String(text).includes('OFICINA ONLINE')) window.__garageOnlinePaints += 1;
        if (String(text).startsWith('COR DA EQUIPE /')) window.__garageTeamColor = String(text);
        if (String(text).toUpperCase().includes('RIFFSHOT')) window.__riffshotLogoDrawn = true;
        if (String(text).toUpperCase().includes('SINTA A BATIDA')) window.__riffshotSloganDrawn = true;
        if (/^\d{3}$/.test(String(text))) window.__raceSpeedValues.push(String(text));
        if (String(text).includes('NITRO 1/2')) window.__raceNitroDrawn = true;
        if (String(text).includes('ISOMÉTRICA')) window.__isometricCameraDrawn = true;
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
    await page.goto('http://127.0.0.1:4183');
    expect(await page.title()).toContain('RIFFSHOT RACING');
    const notices = await page.request.get('http://127.0.0.1:4183/THIRD_PARTY_NOTICES.txt');
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
    await advance('Enter', 'Dificuldade');
    await advance('Enter', 'Seleção de Personagem');
    await advance('ArrowRight', PILOT.name);
    await page.keyboard.press('Enter');
    await expect(status).toContainText(VEHICLES[0].name, { timeout: READY_TIMEOUT });
    await expect.poll(onlineCount, { timeout: READY_TIMEOUT }).toBeGreaterThan(0);
    await expect(status).toContainText(VEHICLES[0].name);
    expect(await page.evaluate(() => window.__riffshotSloganDrawn)).toBe(true);
    expect([...new Set(modelRequests)].sort()).toEqual(INITIAL_VEHICLES.map(vehicle => getVehicleModelAsset(vehicle.modelFile).url).sort());
    expect(experimentalRequests).toEqual([]);
    await page.keyboard.press('Enter');
    await expect.poll(() => page.evaluate(() => window.__garageTeamColor)).toContain(PAINTS[0].name);
    for (const [key, paint] of [['d', PAINTS[1]], ['a', PAINTS[0]], ['ArrowLeft', PAINTS[2]]]) {
      await frames();
      await page.keyboard.press(key);
      await expect.poll(() => page.evaluate(() => window.__garageTeamColor)).toContain(paint.name);
      await expect(status).toContainText(VEHICLES[0].name);
    }
    await page.screenshot({ path: testInfo.outputPath('garage-production.png') });
    const online = await onlineCount();
    page.once('dialog', async dialog => {
      expect(dialog.type()).toBe('confirm');
      expect(dialog.message()).toContain(`Preço: ${VEHICLES[0].price.toLocaleString('pt-BR')} CR`);
      expect(dialog.message()).toContain('Saldo após a compra: 0 CR');
      await dialog.accept();
    });
    await advance('Enter', 'equipado');
    await expect(status).toContainText('Preparação', { timeout: 30_000 });
    await expect.poll(onlineCount, { timeout: READY_TIMEOUT }).toBeGreaterThan(online);
    await frames();
    await page.screenshot({ path: testInfo.outputPath('preparation-production.png') });
    await advance('Enter', 'Pista atribuída:');
    const assignedName = (await status.textContent()).match(/Pista atribuída: ([^.]+)\./)[1];
    await advance('ArrowRight', assignedName);
    await advance('Enter', 'Quatro competidores');
    await expect(status).toContainText('Largada!', { timeout: 12_000 });
    await page.keyboard.down('Shift');
    await page.keyboard.down('w');
    await page.waitForTimeout(700);
    await page.keyboard.up('w');
    await page.keyboard.up('Shift');
    await expect.poll(() => page.evaluate(() => window.__raceSpeedValues.some(value => value !== '000')),
      { timeout: READY_TIMEOUT, message: 'W acelera o jogador na corrida pública' }).toBe(true);
    await expect(status).toContainText(assignedName);
    await expect.poll(() => page.evaluate(() => window.__raceNitroDrawn)).toBe(true);
    // This route never enters the full shop or needs the locked Race Car 2 alias.
    await expect.poll(() => [...new Set(modelRequests)].sort(), { timeout: READY_TIMEOUT })
      .toEqual(VEHICLE_MODEL_ASSETS.filter(asset => asset.fileName !== getVehicleModelAsset('race_car2.glb').fileName)
        .map(asset => asset.url).sort());
    expect(experimentalRequests).toEqual([]);
    await expect(page.locator('canvas')).toHaveCount(2);
    await page.keyboard.press('c');
    await expect.poll(() => page.evaluate(() => window.__isometricCameraDrawn)).toBe(true);
    await page.waitForTimeout(1400);
    await page.screenshot({ path: testInfo.outputPath('race-production.png') });
    await page.keyboard.press('Escape');
    await expect(status).toContainText('Estação de Equipe');
    await expect(page.locator('canvas')).toHaveCount(1);
  });

});
