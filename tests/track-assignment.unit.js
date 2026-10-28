import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { RACE_TRACKS } from '../src/data/raceTracks.js';
import { CHARACTERS, getSelectedCharacter } from '../src/data/characters.js';
import { VEHICLE, PAINTS, getSelectedVehicle } from '../src/data/vehicles.js';
import { DIFFICULTIES } from '../src/data/raceDifficulty.js';
import { COLORS, SCENES } from '../src/ui/theme.js';
import {
  TRACK_ASSIGNMENT_KEY, createTrackAssignmentState, assignTrack, completeAssignment,
  getAssignedTrack, completeTrackAssignment, canChooseTrack,
} from '../src/race/trackAssignment.js';

const makeRegistry = () => new Map();
const seededRng = seed => () => ((seed = (1664525 * seed + 1013904223) >>> 0) / 2 ** 32);
const snapshot = registry => structuredClone(registry.get(TRACK_ASSIGNMENT_KEY));
const freezeState = state => {
  Object.freeze(state.remainingTrackIds);
  Object.freeze(state.completedRaceIds);
  return Object.freeze(state);
};

test('cada ciclo contém todas as pistas, sem repetição interna ou entre ciclos consecutivos', () => {
  for (let seed = 0; seed < 20; seed += 1) {
    const rng = seededRng(seed);
    let state = createTrackAssignmentState();
    let lastTrackId = null;
    for (let cycle = 0; cycle < 12; cycle += 1) {
      const seen = [];
      for (let race = 0; race < RACE_TRACKS.length; race += 1) {
        state = assignTrack(state, rng);
        const trackId = state.pendingTrackId;
        assert.notEqual(trackId, lastTrackId);
        assert.equal(state.remainingTrackIds.length, RACE_TRACKS.length - race);
        seen.push(trackId);
        state = completeAssignment(state, `${cycle}/${race}`, trackId);
        lastTrackId = trackId;
      }
      assert.deepEqual([...seen].sort(), RACE_TRACKS.map(track => track.id).sort());
      assert.equal(state.remainingTrackIds.length, 0);
    }
  }
});

test('RNG injetável determina a ordem; atribuição pendente não sorteia novamente', () => {
  const initial = freezeState(createTrackAssignmentState());
  const first = assignTrack(initial, () => 0);
  const second = assignTrack(initial, () => 0.999999);
  assert.notEqual(first.pendingTrackId, second.pendingTrackId);
  assert.deepEqual(assignTrack(initial, seededRng(42)), assignTrack(initial, seededRng(42)));
  assert.equal(first.remainingTrackIds.length, RACE_TRACKS.length);
  assert.equal(assignTrack(freezeState(first), () => assert.fail('não deve sortear')), first);
  assert.deepEqual(initial, createTrackAssignmentState());
});

test('transições puras não modificam estado, listas ou histórico recebidos', () => {
  const assigned = freezeState(assignTrack(createTrackAssignmentState(), () => 0));
  const before = structuredClone(assigned);
  const completed = completeAssignment(assigned, 'race-1', assigned.pendingTrackId);
  assert.deepEqual(assigned, before);
  assert.notEqual(completed, assigned);
  assert.equal(completed.pendingTrackId, null);
  assert.equal(completed.lastCompletedTrackId, assigned.pendingTrackId);
  assert.equal(completed.remainingTrackIds.length, RACE_TRACKS.length - 1);
  assert.deepEqual(completed.completedRaceIds, ['race-1']);
});

test('Registry mantém pendência por sessão e ignora selectedTrackId anterior', () => {
  const registry = makeRegistry();
  registry.set('selectedTrackId', 'não-é-a-atribuição');
  const track = getAssignedTrack(registry, () => 0);
  const state = registry.get(TRACK_ASSIGNMENT_KEY);
  assert.ok(RACE_TRACKS.includes(track));
  assert.equal(getAssignedTrack(registry, () => assert.fail('pendência já existe')), track);
  assert.equal(registry.get(TRACK_ASSIGNMENT_KEY), state);
  const otherRegistry = makeRegistry();
  assert.equal(otherRegistry.has(TRACK_ASSIGNMENT_KEY), false);
  getAssignedTrack(otherRegistry, () => 0);
  assert.notEqual(otherRegistry.get(TRACK_ASSIGNMENT_KEY), state);
  assert.equal(completeTrackAssignment(otherRegistry, 'other-session', track.id), true);
  assert.equal(registry.get(TRACK_ASSIGNMENT_KEY), state);
});

test('consumo exige conclusão explícita e é idempotente por race id durante toda a sessão', () => {
  const registry = makeRegistry();
  assert.equal(completeTrackAssignment(registry, 'sem-pendência', RACE_TRACKS[0].id), false);
  assert.equal(registry.has(TRACK_ASSIGNMENT_KEY), false);
  const track = getAssignedTrack(registry, () => 0);
  const assigned = snapshot(registry);
  registry.set('selectedTrackId', track.id); // Confirmation is not completion.
  assert.deepEqual(snapshot(registry), assigned);
  assert.equal(completeTrackAssignment(registry, 'finish-1', track.id), true);
  const completed = snapshot(registry);
  assert.equal(completed.remainingTrackIds.length, RACE_TRACKS.length - 1);
  assert.equal(completeTrackAssignment(registry, 'finish-1', track.id), false);
  assert.deepEqual(snapshot(registry), completed);

  // Replay an old completion even when that same track is pending in a later cycle.
  for (let race = 2; race <= RACE_TRACKS.length; race += 1) {
    const next = getAssignedTrack(registry, () => 0);
    assert.equal(completeTrackAssignment(registry, `finish-${race}`, next.id), true);
  }
  assert.equal(getAssignedTrack(registry, () => 0).id, track.id);
  const later = snapshot(registry);
  assert.equal(completeTrackAssignment(registry, 'finish-1', track.id), false);
  assert.deepEqual(snapshot(registry), later);
});

test('conclusões inválidas não removem pista nem registram race id', () => {
  const registry = makeRegistry();
  const track = getAssignedTrack(registry, () => 0);
  const before = snapshot(registry);
  const otherTrack = RACE_TRACKS.find(item => item.id !== track.id);
  for (const id of [undefined, null, '', '   ', NaN, Infinity, {}, false]) {
    assert.equal(completeTrackAssignment(registry, id, track.id), false);
  }
  for (const trackId of [undefined, null, '', 'inexistente', otherTrack.id]) {
    assert.equal(completeTrackAssignment(registry, 'finish-valid', trackId), false);
  }
  assert.deepEqual(snapshot(registry), before);
  assert.equal(completeTrackAssignment(registry, 'finish-valid', track.id), true);
});

test('gate desligado por padrão, sem inferir fracasso/meta; somente booleano explícito libera', () => {
  const registry = makeRegistry();
  assert.equal(canChooseTrack(registry), false);
  assert.equal(registry.has(TRACK_ASSIGNMENT_KEY), false);
  registry.set('racePreparation', { racesCompleted: 8, points: 0, requiredPoints: 1400 });
  registry.set('lastRaceResult', { position: 4 });
  getAssignedTrack(registry, () => 0);
  assert.equal(canChooseTrack(registry), false);
  for (const flag of [undefined, false, 1, 'true']) {
    registry.set(TRACK_ASSIGNMENT_KEY, { ...registry.get(TRACK_ASSIGNMENT_KEY), freeChoiceAvailable: flag });
    assert.equal(canChooseTrack(registry), false);
  }
  registry.set(TRACK_ASSIGNMENT_KEY, { ...registry.get(TRACK_ASSIGNMENT_KEY), freeChoiceAvailable: true });
  assert.equal(canChooseTrack(registry), true);
  const track = getAssignedTrack(registry);
  assert.equal(canChooseTrack(registry), true);
  assert.equal(completeTrackAssignment(registry, 'first-after-future-failure', track.id), true);
  assert.equal(canChooseTrack(registry), false);
});

// Execute the actual scene methods in Node with presentation-only Phaser doubles.
// This checks UI callbacks and keyboard rules without starting a browser/renderer.
class Display {
  setText(value) { this.text = value; return this; }
  setColor(value) { this.color = value; return this; }
  setPosition(x, y) { this.x = x; this.y = y; return this; }
  setScale(value) { this.scale = value; return this; }
  setFontSize() { return this; }
  setWordWrapWidth() { return this; }
  setVisible() { return this; }
  clear() { return this; }
  lineStyle() { return this; }
  fillStyle() { return this; }
  fillPoints() { return this; }
  strokePoints() { return this; }
}

class Button extends Display {
  constructor(scene, options) {
    super();
    Object.assign(this, options);
    this.detail = new Display();
    scene.buttons.push(this);
  }
  setSelected(value) { this.selected = value; return this; }
}

class Shell {
  createShell() { this.transitioning = false; }
  announce(message) { this.announcement = message; }
  resizeShell() { this.layout(1280, 720); }
  goTo(destination) {
    if (this.transitioning) return;
    this.transitioning = true;
    this.destination = destination;
  }
}

const sceneSource = await readFile(new URL('../src/scenes/RaceTrackSelectionScene.js', import.meta.url), 'utf8');
const Scene = vm.runInNewContext(
  `${sceneSource.replace(/^import .*;\r?$/gm, '').replace('export class', 'class')}\nRaceTrackSelectionScene;`,
  {
    TitleScene: Shell, MenuButton: Button, RACE_TRACKS, getSelectedCharacter,
    getSelectedVehicle, DIFFICULTIES, COLORS, SCENES,
    text: (_scene, _x, _y, label, _size, color) => new Display().setText(label).setColor(color),
  },
  { filename: 'RaceTrackSelectionScene.js' },
);

function openSelection(registry = makeRegistry()) {
  const scene = new Scene();
  scene.registry = registry;
  scene.game = { championship: {
    state: { pendingResult: null },
    canRace: true,
    specialTrackChoice: false,
    assignedTrack: () => getAssignedTrack(registry),
    startRace() {
      const active = { trackId: getAssignedTrack(registry).id };
      registry.set('selectedTrackId', active.trackId);
      return active;
    },
  } };
  scene.buttons = [];
  scene.add = { graphics: () => new Display() };
  scene.content = Object.assign(new Display(), { add() {} });
  scene.input = { keyboard: {
    addCapture() {}, removeCapture() {},
    on(_event, handler) { scene.keydown = handler; },
  } };
  scene.events = { once(_event, handler) { scene.shutdown = handler; } };
  scene.scene = { start(destination) { scene.destination = destination; } };
  scene.press = (key, options = {}) => scene.keydown({
    key, code: key === ' ' ? 'Space' : key, stopPropagation() {}, preventDefault() {}, ...options,
  });
  scene.create();
  return scene;
}

function playerRegistry() {
  return new Map([
    ['selectedDifficultyId', 'normal'], ['selectedCharacterId', CHARACTERS[1].id],
    ['selectedVehicleId', VEHICLE.id], ['selectedPaintId', PAINTS[1].id],
  ]);
}

test('tela automática tem exatamente CONFIRMAR/VOLTAR, dados do piloto/cores e nenhuma troca por setas', () => {
  const registry = playerRegistry();
  const scene = openSelection(registry);
  const before = snapshot(registry);
  assert.deepEqual(scene.buttons.map(button => button.label), ['CONFIRMAR', 'VOLTAR']);
  assert.equal(scene.trackCards.length, 0);
  assert.equal(scene.trackName.text, scene.assignedTrack.name);
  assert.equal(scene.trackName.color, scene.assignedTrack.theme.accent);
  assert.ok(scene.pilotLabel.text.includes(CHARACTERS[1].name));
  assert.ok(scene.paintLabel.text.includes(PAINTS[1].name));
  assert.equal(scene.paintLabel.color, PAINTS[1].color);
  for (const key of ['ArrowRight', 'ArrowLeft', 'ArrowRight']) scene.press(key);
  assert.deepEqual(snapshot(registry), before);
  assert.equal(scene.focusIndex, 0);
  scene.layout(390, 844);
  scene.layout(844, 390);
  assert.notEqual(scene.startButton.y, scene.backButton.y);
  assert.equal(canChooseTrack(registry), false);
});

test('voltar por callback/Escape/Tab+Enter e reabrir mantém a mesma atribuição sem consumo', () => {
  const registry = playerRegistry();
  const initialScene = openSelection(registry);
  const track = initialScene.assignedTrack;
  const before = snapshot(registry);
  initialScene.backButton.onSelect();
  assert.equal(initialScene.backButton.selected, true);
  initialScene.backButton.onActivate();
  assert.equal(initialScene.destination, SCENES.preparation);
  initialScene.shutdown();
  const escapeScene = openSelection(registry);
  escapeScene.press('Escape');
  assert.equal(escapeScene.destination, SCENES.preparation);
  const tabScene = openSelection(registry);
  tabScene.press('Tab', { shiftKey: true });
  assert.equal(tabScene.focusIndex, 1);
  tabScene.press('Enter');
  assert.equal(tabScene.destination, SCENES.preparation);
  assert.equal(openSelection(registry).assignedTrack, track);
  assert.deepEqual(snapshot(registry), before);
});

test('confirmar por callback/Enter/Espaço e abortar/reabrir não consome o ciclo', () => {
  const registry = playerRegistry();
  const firstScene = openSelection(registry);
  const before = snapshot(registry);
  firstScene.startButton.onSelect();
  firstScene.startButton.onActivate();
  assert.equal(firstScene.destination, SCENES.race);
  assert.equal(registry.get('selectedTrackId'), firstScene.assignedTrack.id);
  firstScene.shutdown(); // Abort/shutdown has no completion hook.
  for (const key of ['Enter', ' ']) {
    const scene = openSelection(registry);
    scene.press('Enter', { repeat: true });
    assert.equal(scene.destination, undefined);
    scene.press(key);
    assert.equal(scene.destination, SCENES.race);
    assert.equal(scene.assignedTrack, firstScene.assignedTrack);
  }
  assert.deepEqual(snapshot(registry), before);
  assert.equal(canChooseTrack(registry), false);
  assert.equal(completeTrackAssignment(registry, 'real-finish', firstScene.assignedTrack.id), true);
  assert.equal(completeTrackAssignment(registry, 'real-finish', firstScene.assignedTrack.id), false);
  assert.notEqual(openSelection(registry).assignedTrack, firstScene.assignedTrack);
});

test('dificuldade ausente redireciona sem alocar pista', () => {
  const registry = makeRegistry();
  const scene = openSelection(registry);
  assert.equal(scene.destination, SCENES.difficulty);
  assert.equal(registry.has(TRACK_ASSIGNMENT_KEY), false);
  assert.equal(scene.buttons.length, 0);
});
