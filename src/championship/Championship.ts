import { createChampionshipState, setSelections, ensureAssignedTrack, chooseSpecialTrack,
  beginChampionshipRace, applyChampionshipResult, acknowledgeChampionshipResult,
  isValidChampionshipState, purchaseChampionshipVehicle, claimChampionshipRivalReward,
  ownsChampionshipVehicle, hasChampionshipSelections, canRunOpening,
  canClaimChampionshipRivalReward } from './championshipState.ts';
import { loadChampionship, saveChampionship, eraseChampionship, CHAMPIONSHIP_SAVE_KEY } from './championshipStorage.ts';
import { getTrackById } from '../data/raceTracks.ts';
import { acquireChampionshipWriter } from './championshipWriter.ts';
import type Phaser from 'phaser';
import type { ChampionshipState, ChampionshipSelections, ChampionshipResult, RivalRewardChoice } from './championshipState.ts';

const uniqueId = (prefix: string) => `${prefix}-${globalThis.crypto?.randomUUID?.()
  ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`}`;

// Application boundary. All scenes use this one service; rules and disk format
// remain independent from Phaser, ready for a future platform adapter.
export class Championship {
  game: Pick<Phaser.Game, 'events' | 'registry'>;
  makeId: (prefix: string) => string;
  storage: Storage | null;
  state: ChampionshipState;
  raw: string | null;
  writable: boolean;
  warning: string | null;
  hasWriterLease: boolean;
  releaseWriter?: () => void;
  onStorage: (event: StorageEvent) => void;

  constructor(game: Pick<Phaser.Game, 'events' | 'registry'>, options: { storage?: Storage | null; makeId?: (prefix: string) => string } = {}) {
    this.game = game;
    this.makeId = options.makeId ?? uniqueId;
    try { this.storage = options.storage === undefined ? window.localStorage : options.storage; }
    catch { this.storage = null; }
    const loaded = loadChampionship(this.storage);
    this.state = loaded.state ?? createChampionshipState({ id: this.makeId('career'), attemptId: this.makeId('attempt') });
    this.raw = loaded.raw;
    this.writable = loaded.writable;
    this.warning = loaded.warning;
    this.hasWriterLease = typeof window === 'undefined';
    if (typeof window !== 'undefined') {
      this.writable = false;
      this.releaseWriter = acquireChampionshipWriter(window.navigator?.locks, () => {
        this.hasWriterLease = true;
        // Do not turn a stale/invalid save into a writable one after acquiring.
        this.writable = loaded.writable && this.storage?.getItem(CHAMPIONSHIP_SAVE_KEY) === this.raw;
        if (!this.writable && !this.warning) this.notify('O save mudou durante a abertura. Recarregue esta aba.');
      }, () => {
        this.hasWriterLease = false;
        this.writable = false;
        this.notify(window.navigator?.locks
          ? 'Outra aba já está usando este progresso. Feche-a e recarregue aqui antes de comprar, receber prêmios ou apagar dados.'
          : 'Este navegador não oferece gravação exclusiva entre abas. Use um navegador atualizado em localhost ou HTTPS para salvar com segurança.');
      });
    }
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
      this.releaseWriter?.();
      if (typeof window !== 'undefined') window.removeEventListener('storage', this.onStorage);
    });
  }

  notify(warning: string | null) {
    if (this.warning === warning) return;
    this.warning = warning;
    this.game.events.emit('championship-warning', warning);
  }

  commit(next: ChampionshipState, durable = false) {
    if (next === this.state) return false;
    const revision = { ...next, revision: this.state.revision + 1 };
    if (!isValidChampionshipState(revision)) {
      this.notify('Estado de progresso inconsistente. Nenhuma alteração foi aplicada.');
      return false;
    }
    // Economic operations succeed only on disk. A temporary session must not
    // spend or grant rewards that disappear (or can be claimed again) on reload.
    if (durable && !this.writable) {
      this.notify(this.warning ?? 'Armazenamento indisponível. Recarregue antes de comprar ou receber o prêmio.');
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
        if (durable) return false;
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
      const value = this.state.selections[selectionKey as keyof ChampionshipSelections];
      if (value === null) registry.remove(registryKey);
      else registry.set(registryKey, value);
    }
    registry.set('trackAssignment', this.state.tracks);
    const trackId = this.state.activeRace?.trackId ?? this.state.tracks.pendingTrackId ?? this.state.tracks.lastCompletedTrackId;
    if (trackId) registry.set('selectedTrackId', trackId);
    else registry.remove('selectedTrackId');
    if (this.state.pendingResult) registry.set('lastRaceResult', this.state.pendingResult);
  }

  select(patch: Partial<ChampionshipSelections>) { this.commit(setSelections(this.state, patch)); }

  purchaseVehicle(vehicleId: string, paintId: string) {
    return this.commit(purchaseChampionshipVehicle(this.state, vehicleId, paintId), true);
  }

  ownsVehicle(id: string) { return ownsChampionshipVehicle(this.state, id); }

  claimRivalReward(choice: RivalRewardChoice) {
    return this.commit(claimChampionshipRivalReward(this.state, choice), true);
  }

  eraseProgress() {
    if (!this.hasWriterLease) {
      this.notify('Esta aba não tem acesso exclusivo ao progresso. Feche a outra aba e recarregue antes de apagar dados.');
      return false;
    }
    const fresh = createChampionshipState({ id: this.makeId('career'), attemptId: this.makeId('attempt') });
    const erased = eraseChampionship(this.storage, this.raw);
    if (!erased.ok) {
      this.writable = false;
      this.notify(erased.warning);
      return false;
    }
    this.state = fresh;
    this.raw = null;
    this.writable = true;
    this.game.registry.remove('lastRaceResult');
    this.syncRegistry();
    this.notify(null);
    this.game.events.emit('championship-updated', this.state);
    return true;
  }

  get hasSelections() { return hasChampionshipSelections(this.state); }
  get canRace() { return canRunOpening(this.state) && !this.state.pendingResult && this.hasSelections; }
  get canClaimRivalReward() { return canClaimChampionshipRivalReward(this.state); }
  get specialTrackChoice() { return this.state.tracks.freeChoiceAvailable && this.canRace; }

  assignedTrack() {
    this.commit(ensureAssignedTrack(this.state));
    return getTrackById(this.state.tracks.pendingTrackId);
  }

  startRace(trackId?: string | null) {
    if (!this.canRace) return null;
    let next = ensureAssignedTrack(this.state);
    if (next.tracks.freeChoiceAvailable && trackId) next = chooseSpecialTrack(next, trackId);
    next = beginChampionshipRace(next, this.makeId('race'));
    this.commit(next);
    return this.state.activeRace;
  }

  finishRace(result: ChampionshipResult) {
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
