import test from 'node:test';
import assert from 'node:assert/strict';
import { RivalCannon, CANNON_CONFIG, CANNON_MOUNT } from '../src/race/RivalCannon.ts';
import type { CannonCar } from '../src/race/RivalCannon.ts';
import type { SampledTrack } from '../src/race/trackMath.ts';

const DT = 1 / 60;
// Rectangular sampled loop: the entire tested flight runs along its +Z straight.
function track(width = 24, slope = 0): SampledTrack & { width: number } {
  return { width, totalLength: 1200, points: [
    { x: 0, y: -100 * slope, z: -100, distance: 0, tangentX: 0, tangentZ: 1 },
    { x: 0, y: 300 * slope, z: 300, distance: 400, tangentX: 1, tangentZ: 0 },
    { x: 200, y: 300 * slope, z: 300, distance: 600, tangentX: 0, tangentZ: -1 },
    { x: 200, y: -100 * slope, z: -100, distance: 1000, tangentX: -1, tangentZ: 0 },
  ] };
}

function car(id: string, overrides: Partial<CannonCar> = {}): CannonCar {
  return { id, x: 0, y: 0, z: 0, heading: 0, velocityX: 0, velocityZ: 0, speed: 0,
    health: 100, maxHealth: 100, destroyed: false, finished: false, respawnProtection: 0,
    lapsCompleted: 0, respawnSequence: 0, ...overrides };
}

function setup(difficulty: 'normal' | 'hard' = 'normal', course = track()) {
  const cannon = new RivalCannon({ track: course, difficulty });
  const rival = car('rival', { aiProfile: 'rival' });
  const player = car('player', { isPlayer: true, z: 25 });
  return { cannon, rival, player };
}

const ignoreHit = () => {};
const near = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-7,
  `${actual} deveria ser ${expected}`);

test('identidade: somente aiProfile rival de NPC habilita canhão, nunca modelo ou jogador', () => {
  const { cannon, rival, player } = setup();
  const lookalike = { ...car('ordinary'), vehicleId: 'rival', model: 'rival' };
  cannon.step(DT, [lookalike, player], DT, ignoreHit);
  assert.equal(cannon.ownerId, null);
  assert.equal(cannon.ammo, 0);
  assert.equal(cannon.tryFire(lookalike, 1), false);
  assert.equal(cannon.tryFire({ ...player, aiProfile: 'rival' }, 1), false);
  assert.equal(cannon.tryFire(rival, 1), true);
  cannon.step(DT, [lookalike, player], 1 + DT, ignoreHit);
  assert.equal(cannon.projectiles.filter(shell => shell.active).length, 0);
  assert.equal(cannon.events.at(-1)?.kind, 'expire');
});

test('dano: primeiro contato entrega exatamente 20 HP raw e direção, sem mutar carro', () => {
  const { cannon, rival, player } = setup();
  const armored = { ...player, z: 10, vehicle: { collisionDamageMultiplier: 0.01 }, pilot: { endurance: 10 } };
  const behind = car('bot', { z: 15 });
  const hits: string[] = [];
  assert.equal(cannon.tryFire(rival, 0), true);
  cannon.step(0.3, [rival, behind, armored], 0.3, (target, damage, dirX, dirZ) => {
    hits.push(target.id);
    assert.equal(damage, 20);
    near(dirX, 0); near(dirZ, 1);
    assert.equal(target.health, 100);
  });
  assert.deepEqual(hits, [player.id]);
  assert.equal(armored.health, 100);
  assert.equal(cannon.events.filter(event => event.kind === 'hit').length, 1);
  assert.equal(cannon.events.at(-1)?.targetId, player.id);
  cannon.step(DT, [rival, behind, armored], 0.3 + DT, () => assert.fail('não atravessa nem repete hit'));
});

test('proteção: dono, respawn, chegada, destruição e saúde zerada não recebem callback', () => {
  for (const state of [{ respawnProtection: 2 }, { finished: true }, { destroyed: true }, { health: 0 }]) {
    const { cannon, rival } = setup();
    const protectedCar = car('protected', { z: 6, ...state });
    const bot = car('bot', { z: 12 });
    cannon.tryFire(rival, 0);
    const hits: string[] = [];
    cannon.step(0.25, [rival, protectedCar, bot], 0.25, target => hits.push(target.id));
    assert.deepEqual(hits, ['bot']);
  }
  for (const state of [{ respawnProtection: 1 }, { destroyed: true }, { finished: true }, { health: 0 }]) {
    const { cannon, rival } = setup();
    Object.assign(rival, state);
    assert.equal(cannon.canFire(rival, 0), false);
    assert.equal(cannon.tryFire(rival, 0), false);
    assert.equal(cannon.getAmmo(rival.id), 5);
  }
});

test('IA: sem alvo, fora do eixo, atrás, distante ou em outra altura não gasta munição', () => {
  for (const overrides of [null, { x: 5 }, { z: -10 }, { z: 100 }, { y: 5 },
    { respawnProtection: 1 }, { finished: true }, { destroyed: true }, { velocityZ: 100 }]) {
    const { cannon, rival, player } = setup('hard');
    if (overrides) Object.assign(player, overrides);
    cannon.step(DT, overrides ? [rival, player] : [rival], DT, ignoreHit);
    assert.equal(cannon.ammo, 5, JSON.stringify(overrides));
    assert.equal(cannon.events.length, 0);
  }
});

test('IA: antecipa cruzamento pelo eixo atual sem girar projétil para o alvo', () => {
  const { cannon, rival, player } = setup('hard');
  player.x = 4;
  const interceptTime = (player.z - CANNON_MOUNT.z) / CANNON_CONFIG.projectileSpeed;
  player.velocityX = -player.x / interceptTime;
  cannon.step(DT, [rival, player], DT, ignoreHit);
  assert.equal(cannon.ammo, 4);
  const shell = cannon.projectiles.find(candidate => candidate.active)!;
  near(shell.dirX, 0); near(shell.dirZ, 1);
  assert.equal(cannon.events[0].targetId, player.id);
  // An initially aligned car moving away laterally is not a viable opportunity.
  const other = setup('hard');
  other.player.velocityX = 20;
  other.cannon.step(DT, [other.rival, other.player], DT, ignoreHit);
  assert.equal(other.cannon.ammo, 5);
});

test('IA: prioriza jogador viável, permite bots e reage depois de ser ultrapassado', () => {
  const { cannon, rival, player } = setup('hard');
  const bot = car('bot', { z: 10 });
  player.z = -5;
  cannon.step(DT, [rival, player], DT, ignoreHit);
  assert.equal(cannon.ammo, 5);
  player.z = 30; // Player overtakes: no remembered-front/rank restriction.
  cannon.step(DT, [rival, bot, player], 2 * DT, ignoreHit);
  assert.equal(cannon.events[0].targetId, player.id);
  const hits: string[] = [];
  cannon.step(0.2, [rival, bot, player], 2 * DT + 0.2, target => hits.push(target.id));
  assert.deepEqual(hits, [bot.id]);
  const onlyBots = setup();
  onlyBots.cannon.step(DT, [onlyBots.rival, bot], DT, ignoreHit);
  assert.equal(onlyBots.cannon.events[0].targetId, bot.id);
});

test('IA: hard aproveita janela mais distante/larga e cooldowns impedem spam', () => {
  for (const difficulty of ['normal', 'hard'] as const) {
    const { cannon, rival, player } = setup(difficulty);
    player.z = 60; player.x = 1;
    cannon.step(DT, [rival, player], DT, ignoreHit);
    assert.equal(cannon.ammo, difficulty === 'hard' ? 4 : 5);
    const basic = setup(difficulty);
    basic.cannon.step(DT, [basic.rival, basic.player], DT, ignoreHit);
    for (let frame = 2; frame <= 40; frame += 1) {
      basic.cannon.step(DT, [basic.rival, basic.player], frame * DT, ignoreHit);
    }
    assert.equal(basic.cannon.ammo, 4);
    assert.equal(basic.cannon.events.filter(event => event.kind === 'shot').length, 1);
    assert.equal(basic.cannon.tryFire(basic.rival, DT + basic.cannon.cooldownSeconds - 0.001), false);
    assert.equal(basic.cannon.tryFire(basic.rival, DT + basic.cannon.cooldownSeconds), true);
  }
});

test('munição: cinco iniciais, esgota, recarrega a cinco só no crescimento inteiro legítimo', () => {
  const { cannon, rival } = setup('hard');
  cannon.step(DT, [rival], DT, ignoreHit);
  assert.equal(cannon.ownerId, rival.id);
  assert.equal(cannon.ammo, 5);
  for (let shot = 0; shot < 5; shot += 1) assert.equal(cannon.tryFire(rival, 1 + shot), true);
  assert.equal(cannon.ammo, 0);
  assert.equal(cannon.tryFire(rival, 7), false);
  for (const invalidLap of [0, -1, 0.5, NaN, Infinity]) {
    rival.lapsCompleted = invalidLap;
    assert.equal(cannon.tryFire(rival, 8), false);
  }
  rival.lapsCompleted = 1;
  cannon.step(DT, [rival], 9, ignoreHit);
  assert.equal(cannon.ammo, 5);
  assert.equal(cannon.tryFire(rival, 9), true);
  for (const lap of [1, 0, 1]) {
    rival.lapsCompleted = lap;
    cannon.step(DT, [rival], 9 + DT, ignoreHit);
    assert.equal(cannon.ammo, 4, 'regressão seguida da mesma volta não recarrega');
  }
  rival.lapsCompleted = 2;
  cannon.step(DT, [rival], 10, ignoreHit);
  assert.equal(cannon.ammo, 5, 'reposição nunca acumula além de cinco');
});

test('respawn: não recarrega, não reinicia cooldown nem transforma teleporte em colisão', () => {
  const { cannon, rival, player } = setup('hard');
  cannon.tryFire(rival, 0);
  rival.destroyed = true;
  cannon.step(DT, [rival], DT, ignoreHit);
  rival.destroyed = false; rival.respawnProtection = 2; rival.respawnSequence = 1;
  cannon.step(DT, [rival], 2 * DT, ignoreHit);
  assert.equal(cannon.ammo, 4);
  rival.respawnProtection = 0;
  assert.equal(cannon.canFire(rival, 0.2), false);
  cannon.step(DT, [rival], 0.3, ignoreHit);
  assert.equal(cannon.ammo, 4, 'fim da proteção não recarrega');
  rival.respawnProtection = 1;
  rival.lapsCompleted = 1; // Only the race simulation can validate this increment.
  cannon.step(DT, [rival], 0.4, ignoreHit);
  assert.equal(cannon.ammo, 5, 'volta validada recarrega mesmo durante proteção');
  assert.equal(cannon.canFire(rival, 1), false, 'recarga não libera disparo protegido');

  const teleported = setup('hard');
  player.x = -10; player.z = 7.9;
  teleported.cannon.step(DT, [teleported.rival, player], DT, ignoreHit);
  teleported.cannon.tryFire(teleported.rival, DT);
  player.x = 10; player.respawnSequence = 1;
  teleported.cannon.step(0.2, [teleported.rival, player], DT + 0.2,
    () => assert.fail('teleporte não é trajetória física'));
});

test('munição: estado por ID persiste na ausência e é independente entre rivais', () => {
  const { cannon, rival } = setup();
  const second = car('rival-2', { aiProfile: 'rival', x: 5 });
  cannon.tryFire(rival, 0);
  cannon.step(DT, [rival, second], DT, ignoreHit);
  assert.equal(cannon.getAmmo(rival.id), 4);
  assert.equal(cannon.getAmmo(second.id), 5);
  cannon.step(DT, [], 2 * DT, ignoreHit);
  assert.equal(cannon.ammo, 0);
  cannon.step(DT, [{ ...rival }], 3 * DT, ignoreHit);
  assert.equal(cannon.ammo, 4);
});

test('trajetória: direção e velocidade constantes, boca revisada e poses interpoláveis', () => {
  const { cannon, rival, player } = setup('hard', track(200));
  rival.heading = Math.PI / 6; rival.velocityX = 40; rival.velocityZ = 20;
  const launchHeading = rival.heading;
  cannon.tryFire(rival, 0);
  const shell = cannon.projectiles.find(candidate => candidate.active)!;
  near(shell.x, Math.sin(launchHeading) * CANNON_MOUNT.z);
  near(shell.y, CANNON_MOUNT.y); near(shell.z, Math.cos(launchHeading) * CANNON_MOUNT.z);
  const start = { x: shell.x, z: shell.z };
  rival.heading = -Math.PI / 2; player.x = -20;
  cannon.step(0.1, [rival, player], 0.1, ignoreHit);
  near(shell.previousX, start.x); near(shell.previousZ, start.z);
  near(shell.x, start.x + Math.sin(launchHeading) * 72 * 0.1);
  near(shell.z, start.z + Math.cos(launchHeading) * 72 * 0.1);
  near(shell.dirX, Math.sin(launchHeading)); near(shell.dirZ, Math.cos(launchHeading));
  near(shell.speed, 72); near(shell.y, CANNON_MOUNT.y);
  const secondStart = shell.x;
  cannon.step(0.1, [rival, player], 0.2, ignoreHit);
  near(shell.previousX, secondStart);
  near(shell.x, start.x + Math.sin(launchHeading) * 72 * 0.2);
});

test('sweep: acerta carro cruzando entre frames por snapshot interno ou explícito', () => {
  for (const supplied of [false, true]) {
    const { cannon, rival } = setup('hard');
    const crossing = car('crossing', { x: -10, z: 7.9 });
    if (!supplied) cannon.step(DT, [rival, crossing], DT, ignoreHit);
    cannon.tryFire(rival, DT);
    crossing.x = 10;
    if (supplied) Object.assign(crossing, { previousX: -10, previousY: 0, previousZ: 7.9 });
    const hits: string[] = [];
    cannon.step(0.2, [rival, crossing], DT + 0.2, target => hits.push(target.id));
    assert.deepEqual(hits, [crossing.id]);
  }
});

test('sweep: primeiro hit espacial independe da ordem da lista e respeita altura', () => {
  const { cannon, rival } = setup();
  const front = car('front', { z: 9 });
  const back = car('back', { z: 12 });
  const overhead = car('overhead', { z: 4, y: 5 });
  cannon.tryFire(rival, 0);
  const hits: string[] = [];
  cannon.step(0.25, [back, overhead, rival, front], 0.25, target => hits.push(target.id));
  assert.deepEqual(hits, ['front']);
});

test('expiry: tempo e alcance limitados mesmo com dt grande, sem dano além da vida útil', () => {
  const { cannon, rival } = setup();
  const distant = car('distant', { z: 95 });
  cannon.tryFire(rival, 0);
  const shell = cannon.projectiles[0];
  cannon.step(3, [rival, distant], 3, () => assert.fail('fora do alcance'));
  assert.equal(shell.active, false);
  assert.ok(shell.age <= 1.4);
  assert.ok(shell.distance <= 90);
  near(shell.distance, 90);
  assert.equal(cannon.events.at(-1)?.kind, 'expire');
  near(cannon.events.at(-1)!.time, 1.25);
});

test('barreira: expira no normal lateral antes do carro e IA não dispara através da parede', () => {
  const { cannon, rival } = setup('hard', track(10));
  rival.heading = Math.PI / 2;
  const target = car('target', { x: 9 });
  cannon.step(DT, [rival, target], DT, ignoreHit);
  assert.equal(cannon.ammo, 5, 'IA economiza tiro bloqueado');
  cannon.tryFire(rival, DT);
  cannon.step(0.2, [rival, target], DT + 0.2, () => assert.fail('atravessou parede'));
  assert.equal(cannon.events.at(-1)?.kind, 'expire');
  near(cannon.events.at(-1)!.z, 0);
  assert.ok(Math.abs(cannon.events.at(-1)!.x - 4.85) < 0.002);
});

test('barreira: altura do chão em aclive interrompe projétil, sem seguir terreno', () => {
  const { cannon, rival } = setup('hard', track(24, 0.1));
  cannon.tryFire(rival, 0);
  cannon.step(0.5, [rival], 0.5, ignoreHit);
  const expiry = cannon.events.at(-1)!;
  assert.equal(expiry.kind, 'expire');
  near(expiry.y, CANNON_MOUNT.y);
  assert.ok(Math.abs(expiry.z - (CANNON_MOUNT.y - 0.12) / 0.1) < 0.002);
});

test('budget: pool fixo 12, sem gasto em falha, slots reutilizados e eventos limitados/monotônicos', () => {
  const cannon = new RivalCannon({ track: track(500), difficulty: 'hard' });
  const rivals = Array.from({ length: 13 }, (_, index) => car(`r-${index}`, { aiProfile: 'rival', x: index * 3 }));
  const slots = [...cannon.projectiles];
  for (let index = 0; index < 12; index += 1) assert.equal(cannon.tryFire(rivals[index], 0), true);
  assert.equal(cannon.tryFire(rivals[12], 0), false);
  assert.equal(cannon.getAmmo(rivals[12].id), 5);
  assert.equal(cannon.projectiles.length, 12);
  cannon.step(1.3, rivals, 1.3, ignoreHit);
  for (let round = 0; round < 4; round += 1) {
    for (const rival of rivals) rival.lapsCompleted = round + 1;
    cannon.step(DT, rivals, 2 + round * 2, ignoreHit);
    for (const rival of rivals) cannon.tryFire(rival, 2 + round * 2);
    cannon.step(1.3, rivals, 3.3 + round * 2, ignoreHit);
  }
  assert.equal(cannon.projectiles.length, 12);
  for (let index = 0; index < 12; index += 1) assert.equal(cannon.projectiles[index], slots[index]);
  assert.equal(cannon.events.length, CANNON_CONFIG.eventLimit);
  const events = cannon.consumeEvents();
  assert.equal(cannon.events.length, 0);
  assert.ok(events[0].id > 1, 'overflow descarta somente os mais antigos');
  for (let index = 1; index < events.length; index += 1) {
    assert.ok(events[index].id > events[index - 1].id);
    assert.ok(events[index].time >= events[index - 1].time);
  }
  assert.ok(events.some(event => event.projectileId > 12));
  const oldEvent = events.at(-1)!;
  cannon.tryFire(rivals[12], 11);
  assert.ok(cannon.events[0].id > oldEvent.id);
  assert.equal(Object.isFrozen(oldEvent), true);
});

test('eventos: shot/hit de substeps acumulam até consumeEvents com posições independentes do pool', () => {
  const { cannon, rival, player } = setup('hard');
  player.z = 5;
  cannon.step(DT, [rival, player], DT, ignoreHit);
  const shot = cannon.events[0];
  for (let frame = 2; frame <= 6; frame += 1) cannon.step(DT, [rival, player], frame * DT, ignoreHit);
  assert.deepEqual(cannon.events.map(event => event.kind), ['shot', 'hit']);
  near(shot.z, CANNON_MOUNT.z);
  assert.ok(cannon.events[1].z > shot.z);
  assert.ok(cannon.events[1].time > shot.time);
  assert.equal(cannon.consumeEvents().length, 2);
  assert.equal(cannon.consumeEvents().length, 0);
});

test('entrada: deltas inválidos não avançam física nem disparam', () => {
  const { cannon, rival, player } = setup();
  for (const delta of [0, -1, NaN, Infinity]) cannon.step(delta, [rival, player], 1, ignoreHit);
  assert.equal(cannon.events.length, 0);
  assert.equal(cannon.tryFire(rival, NaN), false);
  assert.equal(cannon.tryFire(rival, -1), false);
});
