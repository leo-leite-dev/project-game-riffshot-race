import { test, expect } from '@playwright/test';
import { openMenu } from './helpers.ts';
import { CHARACTERS } from '../src/data/characters.ts';
import { RACE_TRACKS } from '../src/data/raceTracks.ts';
import { createChampionshipState, setSelections, beginChampionshipRace } from '../src/championship/championshipState.ts';
import { CHAMPIONSHIP_SAVE_KEY } from '../src/championship/championshipStorage.ts';
import type { ChampionshipState } from '../src/championship/championshipState.ts';

type Dynamic = { [key: string]: Dynamic; [key: number]: Dynamic; (...args: unknown[]): Dynamic };

test('Neon Furnace apresenta oito rampas em quatro retas, identificadas e com espaço seguro', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  const trackId = 'neon-furnace';
  const initialState = createChampionshipState({ id: `ramp-${trackId}`, attemptId: 'ramp-attempt' });
  const state = setSelections({ ...initialState, ownedVehicleIds: ['rift-blaze'] }, {
    pilotId: CHARACTERS[0]!.id, vehicleId: 'rift-blaze', paintId: 'inferno', difficultyId: 'normal',
  });
  const orderedTrackIds = [trackId, ...RACE_TRACKS.map(track => track.id).filter(id => id !== trackId)];
  const assignedState = { ...state, tracks: { ...state.tracks,
    remainingTrackIds: orderedTrackIds, pendingTrackId: trackId } } as ChampionshipState;
  const raceState = beginChampionshipRace(assignedState, `ramp-${trackId}-race`);
  await page.addInitScript(({ key, value }: { key: string; value: ChampionshipState }) => {
    localStorage.setItem(key, JSON.stringify(value));
  }, { key: CHAMPIONSHIP_SAVE_KEY, value: raceState });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openMenu(page);
  await page.evaluate(async () => {
    const script = document.querySelector<HTMLScriptElement>('script[src*="/src/main.ts"]');
    if (!script) throw new Error('Entrada do jogo ausente');
    const { game } = await import(script.src);
    game.scene.getScenes(true)[0].scene.start('Race');
  });
  await expect.poll(() => page.evaluate(async () => {
    const script = document.querySelector<HTMLScriptElement>('script[src*="/src/main.ts"]');
    if (!script) throw new Error('Entrada do jogo ausente');
    const { game } = await import(script.src);
    return game.scene.isActive('Race') && game.scene.getScene('Race').ready;
  }), { timeout: 90_000 }).toBe(true);

  const rampInfo = await page.evaluate(async () => {
    const script = document.querySelector<HTMLScriptElement>('script[src*="/src/main.ts"]');
    if (!script) throw new Error('Entrada do jogo ausente');
    const { game } = await import(script.src);
    const trackMathUrl = new URL('/src/race/trackMath.ts', location.origin).href;
    const { sampleTrackAtProgress, sampleTrackSurface } = await import(trackMathUrl);
    const race = game.scene.getScene('Race');
    const ramps = race.simulation.track.jumps ?? [];
    const doubleRamp = ramps.find((ramp: Dynamic) => String(ramp.kind) === 'double');
    if (!doubleRamp) throw new Error('Rampa 04 ausente');
    const bridgeDistance = Number(doubleRamp.takeoff) * Number(race.simulation.track.totalLength)
      + Number(doubleRamp.firstPlatformLength) + Number(doubleRamp.gapLength) / 2;
    const bridgeSurface = sampleTrackSurface(race.simulation.track, ramps, bridgeDistance);
    const bridgePoint = sampleTrackAtProgress(race.simulation.track, bridgeDistance);
    const objects = race.garageView.scene.children;
    const doubleRampMesh = objects.find((object: Dynamic) => String(object.name) === 'race-jump-ramp:furnace-ramp-04');
    const doubleRampFascia = objects.find((object: Dynamic) =>
      String(object.name) === 'race-jump-ramp-fascia:furnace-ramp-04');
    const positions = doubleRampMesh?.geometry?.attributes?.position?.array as ArrayLike<number> | undefined;
    const indices = doubleRampMesh?.geometry?.index?.array as ArrayLike<number> | undefined;
    let nearestBridgeVertex = { distanceSq: Infinity, y: 0, row: -1 };
    for (let index = 0; positions && index < positions.length; index += 6) {
      const dx = (Number(positions[index]) + Number(positions[index + 3])) / 2 - bridgePoint.x;
      const dz = (Number(positions[index + 2]) + Number(positions[index + 5])) / 2 - bridgePoint.z;
      const distanceSq = dx * dx + dz * dz;
      if (distanceSq < nearestBridgeVertex.distanceSq)
        nearestBridgeVertex = { distanceSq, y: (Number(positions[index + 1]) + Number(positions[index + 4])) / 2,
          row: index / 6 };
    }
    const bridgeRowVertices = new Set([nearestBridgeVertex.row * 2, nearestBridgeVertex.row * 2 + 1,
      (nearestBridgeVertex.row + 1) * 2, (nearestBridgeVertex.row + 1) * 2 + 1]);
    const bridgeRowIsConnected = Boolean(indices && [...bridgeRowVertices].every(vertex =>
      Array.from(indices).some(index => Number(index) === vertex)));
    const rampMeshes = objects.filter((object: Dynamic) => String(object.name).startsWith('race-jump-ramp:'));
    const lavaMeshes = objects.filter((object: Dynamic) => String(object.name).startsWith('race-lava-gap:'));
    const signs = objects.filter((object: Dynamic) => String(object.name).startsWith('race-ramp-sign:'));
    return { trackId: race.track.id, kinds: ramps.map((ramp: Dynamic) => String(ramp.kind)),
      rampCount: ramps.length, rampMeshCount: rampMeshes.length,
      lavaGapIds: lavaMeshes.map((mesh: Dynamic) => String(mesh.name).replace('race-lava-gap:', '')),
      signTypes: signs.map((sign: Dynamic) => String(sign.userData.rampType)),
      signsHaveLabels: signs.map((sign: Dynamic) => sign.children.some((child: Dynamic) =>
        String(child.name).startsWith('race-ramp-sign-label:'))),
       labelsHaveTexture: signs.map((sign: Dynamic) => {
        const label = sign.children.find((child: Dynamic) => String(child.name).startsWith('race-ramp-sign-label:'));
        return Number(label?.material?.map?.image?.width) === 600;
       }), signKinds: signs.map((sign: Dynamic) => String(sign.userData.rampKind)),
       bridgeHasGround: bridgeSurface.hasGround, bridgeHeight: bridgeSurface.y,
       doubleRampIndexCount: Number(doubleRampMesh?.geometry?.index?.count ?? 0),
       doubleRampFasciaIndexCount: Number(doubleRampFascia?.geometry?.index?.count ?? 0),
       nearestBridgeVertex,
       bridgeRowIsConnected,
       regionCounts: Object.values(ramps.reduce((counts: Record<string, number>, ramp: Dynamic) => {
        const region = String(ramp.regionId);
        counts[region] = (counts[region] ?? 0) + 1;
        return counts;
      }, {})), participants: race.simulation.participants.length,
      totalLength: race.simulation.track.totalLength };
  });

  expect(rampInfo.trackId).toBe(trackId);
  expect(rampInfo.rampCount).toBe(8);
  expect(rampInfo.kinds).toEqual(['bump', 'jump', 'platform', 'double', 'jump', 'double', 'bump', 'platform']);
  expect(rampInfo.rampMeshCount).toBe(8);
  expect(rampInfo.lavaGapIds).toEqual(['furnace-ramp-02', 'furnace-ramp-05']);
  expect(rampInfo.signTypes).toEqual(Array.from({ length: 8 }, (_, index) => `RAMPA ${String(index + 1).padStart(2, '0')}`));
  expect(rampInfo.signKinds).toEqual(rampInfo.kinds);
  expect(rampInfo.regionCounts).toEqual([2, 2, 2, 2]);
  expect(rampInfo.signsHaveLabels).toEqual(Array(8).fill(true));
  expect(rampInfo.labelsHaveTexture).toEqual(Array(8).fill(true));
  expect(rampInfo.participants).toBe(4);
  expect(rampInfo.bridgeHasGround).toBe(true);
  expect(rampInfo.bridgeHeight).toBeGreaterThan(1);
  expect(rampInfo.doubleRampIndexCount).toBeGreaterThan(250);
  expect(rampInfo.doubleRampFasciaIndexCount).toBeGreaterThan(900);
  expect(rampInfo.nearestBridgeVertex.distanceSq).toBeLessThan(1);
  expect(rampInfo.nearestBridgeVertex.y).toBeGreaterThan(rampInfo.bridgeHeight);
  expect(rampInfo.bridgeRowIsConnected).toBe(true);

  await page.evaluate(async () => {
    const script = document.querySelector<HTMLScriptElement>('script[src*="/src/main.ts"]');
    if (!script) throw new Error('Entrada do jogo ausente');
    const { game } = await import(script.src);
    const race = game.scene.getScene('Race');
    race.simulationStarted = false;
    race.garageView.setCameraFrozen(false);
  });
  await page.waitForTimeout(750);
  await page.locator('canvas.race-three-canvas').screenshot({
    path: 'previews-ui/neon-furnace-circuito-oito-rampas.png',
  });

  await page.evaluate(async () => {
    const script = document.querySelector<HTMLScriptElement>('script[src*="/src/main.ts"]');
    if (!script) throw new Error('Entrada do jogo ausente');
    const { game } = await import(script.src);
    const race = game.scene.getScene('Race');
    const camera = race.garageView.cameraRig.isometric;
    race.garageView.camera = camera;
    race.garageView.setCameraFrozen(true);
    camera.left = -260;
    camera.right = 260;
    camera.top = 170;
    camera.bottom = -170;
    camera.updateProjectionMatrix();
    camera.position.set(0, 360, 0);
    camera.up.set(0, 0, -1);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    race.garageView.update(16.67);
  });
  await page.locator('canvas.race-three-canvas').screenshot({
    path: 'previews-ui/neon-furnace-distribuicao-oito-rampas.png',
  });
  await page.evaluate(async () => {
    const script = document.querySelector<HTMLScriptElement>('script[src*="/src/main.ts"]');
    if (!script) throw new Error('Entrada do jogo ausente');
    const { game } = await import(script.src);
    const race = game.scene.getScene('Race');
    race.garageView.camera = race.garageView.cameraRig.camera;
  });

  await page.evaluate(async () => {
    const script = document.querySelector<HTMLScriptElement>('script[src*="/src/main.ts"]');
    if (!script) throw new Error('Entrada do jogo ausente');
    const { game } = await import(script.src);
    const race = game.scene.getScene('Race');
    const ramp = race.simulation.track.jumps.find((candidate: Dynamic) => String(candidate.id) === 'furnace-ramp-02');
    if (!ramp) throw new Error('Rampa 02 ausente');
    const takeoff = Number(ramp.takeoff) * Number(race.simulation.track.totalLength);
    const distance = takeoff - Number(ramp.rampLength) * 0.35;
    const point = race.simulation.track.points.reduce((nearest: Dynamic, candidate: Dynamic) =>
      Math.abs(Number(candidate.distance) - distance) < Math.abs(Number(nearest.distance) - distance) ? candidate : nearest);
    const tangentX = Number(point.tangentX), tangentZ = Number(point.tangentZ);
    const normalX = -tangentZ, normalZ = tangentX;
    const camera = race.garageView.camera;
    race.garageView.setCameraFrozen(true);
    camera.position.set(Number(point.x) - tangentX * 18 + normalX * 15,
      Number(point.y) + 11, Number(point.z) - tangentZ * 18 + normalZ * 15);
    camera.up.set(0, 1, 0);
    camera.lookAt(Number(point.x) + tangentX * 10, Number(point.y) + 1,
      Number(point.z) + tangentZ * 10);
    camera.updateMatrixWorld(true);
    race.garageView.update(16.67);
  });
  await page.locator('canvas.race-three-canvas').screenshot({
    path: 'previews-ui/neon-furnace-rampa-02-salto-lava.png',
  });

  await page.evaluate(async () => {
    const script = document.querySelector<HTMLScriptElement>('script[src*="/src/main.ts"]');
    if (!script) throw new Error('Entrada do jogo ausente');
    const { game } = await import(script.src);
    const race = game.scene.getScene('Race');
    const ramp = race.simulation.track.jumps.find((candidate: Dynamic) => String(candidate.id) === 'furnace-ramp-02');
    if (!ramp) throw new Error('Rampa 02 ausente');
    const distance = Number(ramp.takeoff) * Number(race.simulation.track.totalLength)
      - Number(ramp.rampLength) - 45;
    const point = race.simulation.track.points.reduce((nearest: Dynamic, candidate: Dynamic) =>
      Math.abs(Number(candidate.distance) - distance) < Math.abs(Number(nearest.distance) - distance) ? candidate : nearest);
    const tangentX = Number(point.tangentX), tangentZ = Number(point.tangentZ);
    const normalX = -tangentZ, normalZ = tangentX;
    const camera = race.garageView.camera;
    camera.position.set(Number(point.x) - tangentX * 18 + normalX * 15,
      Number(point.y) + 11, Number(point.z) - tangentZ * 18 + normalZ * 15);
    camera.up.set(0, 1, 0);
    camera.lookAt(Number(point.x) + tangentX * 8, Number(point.y) + 1,
      Number(point.z) + tangentZ * 8);
    camera.updateMatrixWorld(true);
    race.garageView.update(16.67);
  });
  await page.locator('canvas.race-three-canvas').screenshot({
    path: 'previews-ui/neon-furnace-rampa-02-ponto-respawn.png',
  });

  const ramps = RACE_TRACKS.find(track => track.id === trackId)!.jumps!;
  const typeNames = ['01-quebra-molas', '02-salto', '03-plataforma', '04-dois-niveis',
    '05-salto', '06-dois-niveis', '07-quebra-molas', '08-plataforma'];
  for (const [index, ramp] of ramps.entries()) {
    await page.evaluate(async ({ rampId }: { rampId: string }) => {
      const script = document.querySelector<HTMLScriptElement>('script[src*="/src/main.ts"]');
      if (!script) throw new Error('Entrada do jogo ausente');
      const { game } = await import(script.src);
      const race = game.scene.getScene('Race');
      const track = race.simulation.track;
      const item = track.jumps.find((candidate: Dynamic) => String(candidate.id) === rampId);
      const approach = Number(item.takeoff) * Number(track.totalLength) - Number(item.rampLength) * 0.25;
      let point = track.points[0];
      for (const candidate of track.points) {
        if (Math.abs(Number(candidate.distance) - approach) < Math.abs(Number(point.distance) - approach)) point = candidate;
      }
      const tangentX = Number(point.tangentX), tangentZ = Number(point.tangentZ);
      const normalX = -tangentZ, normalZ = tangentX;
      const camera = race.garageView.camera;
      const sign = race.garageView.scene.getObjectByName(`race-ramp-sign:${rampId}`);
      race.garageView.setCameraFrozen(true);
      camera.position.set(Number(sign.position.x) - tangentX * 15 + normalX * 4,
        Number(sign.position.y) + 11, Number(sign.position.z) - tangentZ * 15 + normalZ * 4);
      camera.up.set(0, 1, 0);
      camera.lookAt(Number(point.x) + tangentX * 8, Number(point.y) + 1.8,
        Number(point.z) + tangentZ * 8);
      camera.updateMatrixWorld(true);
      race.garageView.update(16.67);
    }, { rampId: ramp.id });
    await page.locator('canvas.race-three-canvas').screenshot({
      path: `previews-ui/neon-furnace-rampa-${typeNames[index]}.png`,
    });
  }

  await page.evaluate(async () => {
    const script = document.querySelector<HTMLScriptElement>('script[src*="/src/main.ts"]');
    if (!script) throw new Error('Entrada do jogo ausente');
    const { game } = await import(script.src);
    const trackMathUrl = new URL('/src/race/trackMath.ts', location.origin).href;
    const { sampleTrackAtProgress, sampleTrackSurface } = await import(trackMathUrl);
    const race = game.scene.getScene('Race');
    const track = race.simulation.track;
    const ramp = track.jumps.find((candidate: Dynamic) => String(candidate.id) === 'furnace-ramp-04');
    if (!ramp) throw new Error('Rampa 04 ausente');
    const distance = Number(ramp.takeoff) * Number(track.totalLength)
      + Number(ramp.firstPlatformLength) + Number(ramp.gapLength) / 2;
    const point = sampleTrackAtProgress(track, distance);
    const surface = sampleTrackSurface(track, track.jumps, distance);
    const tangentX = Number(point.tangentX), tangentZ = Number(point.tangentZ);
    const normalX = -tangentZ, normalZ = tangentX;
    const camera = race.garageView.camera;
    race.garageView.setCameraFrozen(true);
    camera.position.set(Number(point.x) - tangentX * 13 + normalX * 16, surface.y + 7,
      Number(point.z) - tangentZ * 13 + normalZ * 16);
    camera.up.set(0, 1, 0);
    camera.lookAt(Number(point.x) + tangentX * 3, surface.y + 0.4,
      Number(point.z) + tangentZ * 3);
    camera.updateMatrixWorld(true);
    race.garageView.update(16.67);
  });
  await page.locator('canvas.race-three-canvas').screenshot({
    path: 'previews-ui/neon-furnace-rampa-04-ligacao-closeup.png',
  });

  await page.evaluate(async () => {
    const script = document.querySelector<HTMLScriptElement>('script[src*="/src/main.ts"]');
    if (!script) throw new Error('Entrada do jogo ausente');
    const { game } = await import(script.src);
    const race = game.scene.getScene('Race');
    const track = race.simulation.track;
    const ramp = track.jumps.find((candidate: Dynamic) => String(candidate.kind) === 'double'
      && Number(candidate.takeoff) > 0.5);
    if (!ramp) throw new Error('Rampa 4 ausente');
    const descentDistance = Number(ramp.takeoff) * Number(track.totalLength)
      + Number(ramp.firstPlatformLength) + Number(ramp.gapLength)
      + Number(ramp.secondRampLength) + Number(ramp.secondPlatformLength)
      + Number(ramp.descentLength) * 0.55;
    let point = track.points[0];
    for (const candidate of track.points) {
      if (Math.abs(Number(candidate.distance) - descentDistance)
        < Math.abs(Number(point.distance) - descentDistance)) point = candidate;
    }
    const tangentX = Number(point.tangentX), tangentZ = Number(point.tangentZ);
    const normalX = -tangentZ, normalZ = tangentX;
    const camera = race.garageView.camera;
    race.garageView.setCameraFrozen(true);
    camera.position.set(Number(point.x) - tangentX * 18 + normalX * 18,
      Number(point.y) + 8, Number(point.z) - tangentZ * 18 + normalZ * 18);
    camera.up.set(0, 1, 0);
    camera.lookAt(Number(point.x) + tangentX * 3, Number(point.y) + 1.1,
      Number(point.z) + tangentZ * 4);
    camera.updateMatrixWorld(true);
    race.garageView.update(16.67);
  });
  await page.locator('canvas.race-three-canvas').screenshot({
    path: 'previews-ui/neon-furnace-rampa-04-transicao-descida.png',
  });

  await page.evaluate(async () => {
    const script = document.querySelector<HTMLScriptElement>('script[src*="/src/main.ts"]');
    if (!script) throw new Error('Entrada do jogo ausente');
    const { game } = await import(script.src);
    const race = game.scene.getScene('Race');
    const track = race.simulation.track;
    const ramp = track.jumps.find((candidate: Dynamic) => String(candidate.id) === 'furnace-ramp-03');
    if (!ramp) throw new Error('Rampa 03 ausente');
    const distance = Number(ramp.takeoff) * Number(track.totalLength) + Number(ramp.platformLength) * 0.55;
    let point = track.points[0];
    for (const candidate of track.points) {
      if (Math.abs(Number(candidate.distance) - distance)
        < Math.abs(Number(point.distance) - distance)) point = candidate;
    }
    const car = race.simulation.participants[0];
    const surface = { y: Number(point.y) + Number(ramp.rampHeight) };
    car.x = Number(point.x); car.z = Number(point.z); car.y = surface.y;
    car.heading = Math.atan2(Number(point.tangentX), Number(point.tangentZ)) + Math.PI;
    car.velocityX = 0; car.velocityZ = 0; car.speed = 0;
    car.airborne = false; car.verticalVelocity = 0;
    car._lastPathDistance = distance; car._distance = distance;
    race.garageView.setParticipants(race.simulation.participants, (participant: Dynamic, output: Dynamic) => {
      const pose = race.simulation.getRenderPose(participant, undefined, output);
      return race.simulation.getVisualTelemetry(participant, pose);
    });
    const tangentX = Number(point.tangentX), tangentZ = Number(point.tangentZ);
    const camera = race.garageView.camera;
    race.garageView.setCameraFrozen(true);
    camera.position.set(Number(point.x) + tangentX * 16, surface.y + 7,
      Number(point.z) + tangentZ * 16);
    camera.up.set(0, 1, 0);
    camera.lookAt(Number(point.x) - tangentX * 5, surface.y + 1, Number(point.z) - tangentZ * 5);
    camera.updateMatrixWorld(true);
    race.garageView.update(16.67);
  });
  await page.locator('canvas.race-three-canvas').screenshot({
    path: 'previews-ui/neon-furnace-rampa-03-contramao.png',
  });

  expect(pageErrors).toEqual([]);
});
