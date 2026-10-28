import { createChampionshipState, setSelections, ensureAssignedTrack, chooseSpecialTrack,
  beginChampionshipRace, applyChampionshipResult, acknowledgeChampionshipResult,
  isValidChampionshipState } from './championshipState.js';
import { loadChampionship, saveChampionship, CHAMPIONSHIP_SAVE_KEY } from './championshipStorage.js';
import { getTrackById } from '../data/raceTracks.js';

const uniqueId = prefix => `${prefix}-${globalThis.crypto?.randomUUID?.()
  ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`}`;

// Application boundary. All scenes use this one service; rules and disk format
// remain independent from Phaser, ready for a future platform adapter.
export class Championship {
  constructor(game, options = {}) {
    this.game = game;
    this.makeId = options.makeId ?? uniqueId;
    try { this.storage = options.storage === undefined ? window.localStorage : options.storage; }
    catch { this.storage = null; }
    const loaded = loadChampionship(this.storage);
    this.state = loaded.state ?? createChampionshipState({ id: this.makeId('career'), attemptId: this.makeId('attempt') });
    this.raw = loaded.raw;
    this.writable = loaded.writable;
    this.warning = loaded.warning;
    this.syncRegistry();
    this.onStorage = event => {
      if (event.storageArea && event.storageArea !== this.storage) return;
      if ((event.key === CHAMPIONSHIP_SAVE_KEY && event.newValue !== this.raw)
        || (event.key === null && this.raw !== null)) {
        this.writable = false;
        this.notify('O progresso mudou em outra aba. Save preservado; recarregue para continuar salvando.');
      }
    };
    if (typeof window !== 'undefined') window.addEventListener('storage', this.onStorage);
    game.events.once('destroy', () => {
      if (typeof window !== 'undefined') window.removeEventListener('storage', this.onStorage);
    });
  }

  notify(warning) {
    if (this.warning === warning) return;
    this.warning = warning;
    this.game.events.emit('championship-warning', warning);
  }

  commit(next) {
    if (next === this.state) return false;
    const revision = { ...next, revision: this.state.revision + 1 };
    if (!isValidChampionshipState(revision)) {
      this.notify('Estado de progresso inconsistente. Nenhuma alteração foi aplicada.');
      return false;
    }
    if (this.writable) {
      const saved = saveChampionship(this.storage, revision, this.raw);
      if (saved.ok) {
        this.raw = saved.raw;
        this.notify(null);
      } else {
        // Preserve the known on-disk state and keep a visible temporary-session
        // warning. No automatic retry loop, erase, or reset of a user's save.
        this.writable = false;
        this.notify(saved.warning);
      }
    }
    this.state = revision;
    this.syncRegistry();
    this.game.events.emit('championship-updated', this.state);
    return true;
  }

  syncRegistry() {
    const registry = this.game.registry;
    // Compatibility IDs are projections of the canonical state, not a second
    // wallet/score store or another implementation of campaign rules.
    registry.set('championship', this.state);
    const fields = { selectedCharacterId: 'pilotId', selectedVehicleId: 'vehicleId',
      selectedPaintId: 'paintId', selectedDifficultyId: 'difficultyId' };
    for (const [registryKey, selectionKey] of Object.entries(fields)) {
      const value = this.state.selections[selectionKey];
      if (value === null) registry.remove(registryKey);
      else registry.set(registryKey, value);
    }
    registry.set('trackAssignment', this.state.tracks);
    const trackId = this.state.activeRace?.trackId ?? this.state.tracks.pendingTrackId ?? this.state.tracks.lastCompletedTrackId;
    if (trackId) registry.set('selectedTrackId', trackId);
    else registry.remove('selectedTrackId');
    if (this.state.pendingResult) registry.set('lastRaceResult', this.state.pendingResult);
  }

  select(patch) { this.commit(setSelections(this.state, patch)); }

  get hasSelections() { return Object.values(this.state.selections).every(Boolean); }
  get canRace() { return this.state.attempt.status === 'active' && !this.state.pendingResult
    && this.state.racesRun < this.state.maxRaces && this.hasSelections; }
  get specialTrackChoice() { return this.state.tracks.freeChoiceAvailable && this.canRace; }

  assignedTrack() {
    this.commit(ensureAssignedTrack(this.state));
    return getTrackById(this.state.tracks.pendingTrackId);
  }

  startRace(trackId) {
    if (!this.canRace) return null;
    let next = ensureAssignedTrack(this.state);
    if (next.tracks.freeChoiceAvailable && trackId) next = chooseSpecialTrack(next, trackId);
    next = beginChampionshipRace(next, this.makeId('race'));
    this.commit(next);
    return this.state.activeRace;
  }

  finishRace(result) {
    const next = applyChampionshipResult(this.state, result);
    if (next === this.state) {
      return this.state.pendingResult?.raceId === result.raceId ? this.state.pendingResult : null;
    }
    if (!this.commit(next)) return null;
    return this.state.pendingResult;
  }

  acknowledgeResult() {
    this.commit(acknowledgeChampionshipResult(this.state, this.makeId('attempt')));
  }
}
