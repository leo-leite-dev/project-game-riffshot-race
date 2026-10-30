const STYLE_ID = 'station-settings-style';
let styleUsers = 0;

import type Phaser from 'phaser';
import { RADIO_GENRES } from '../audio/AudioPreferences.ts';
import type { MusicSource, RadioGenre } from '../audio/AudioPreferences.ts';
import type { RadioPlayerState } from '../audio/RiffshotRadio.ts';

type EraseHandler = () => void | Promise<void>;
type StationSettingsOptions = { onErase?: EraseHandler; onVehicleTuning?: () => void };
type StationMusic = {
  activated: boolean;
  musicMode: MusicSource;
  toggle: () => void;
  setMusicSource: (source: MusicSource) => void;
  setGameMusicVolume: (volume: number) => void;
  setEffectsVolume: (volume: number) => void;
  getAudioState: () => { available: boolean; muted: boolean; hidden: boolean; focused: boolean; unlocked: boolean; effectsVolume: number };
};

const styles = `
  [data-station-settings] { box-sizing: border-box; color: #f7ece2; font-family: Arial, sans-serif; }
  button[data-station-settings], [data-station-settings] button { font: inherit; cursor: pointer; }
  button[data-station-settings]:focus-visible, [data-station-settings] button:focus-visible {
    outline: 3px solid #ffd18b; outline-offset: 4px;
  }
  button[data-station-settings="gear"] {
    position: fixed; top: max(24px, env(safe-area-inset-top));
    right: max(24px, env(safe-area-inset-right)); z-index: 30;
    display: grid; place-items: center; width: 48px; height: 48px; padding: 0;
    border: 1px solid #d18d78; border-radius: 8px; color: #f4d7bd;
    background: linear-gradient(145deg, #a34035, #491f25 62%, #111b2a);
    box-shadow: inset 0 1px #ffc6a36b, inset 0 -3px #160e18, 0 4px 12px #0008;
  }
  button[data-station-settings="gear"]:hover { border-color: #ffe0af; background: #87362f; }
  button[data-station-settings="gear"][data-keyboard-selected="true"] {
    outline: 3px solid #ffcf73; outline-offset: 3px; border-color: #ffe0af;
  }
  button[data-station-settings="gear"] svg { display: block; width: 48px; height: 48px; pointer-events: none; }
  dialog[data-station-settings="panel"] {
    position: fixed; inset: 0; width: min(560px, calc(100vw - 32px));
    max-height: calc(100dvh - 32px); margin: auto; padding: 0; overflow: auto;
    border: 2px solid #a75647; border-radius: 10px; overscroll-behavior: contain;
    background: repeating-linear-gradient(115deg, #ffffff03 0 1px, transparent 1px 7px), #111b2a;
    box-shadow: inset 0 0 0 3px #251923, 0 24px 80px #000b;
    color-scheme: dark;
  }
  dialog[data-station-settings="panel"]::backdrop { background: #050a14d9; }
  [data-station-settings="panel"] .station-settings__header {
    position: relative; padding: 24px 28px 20px; border-bottom: 1px solid #c17d5c;
    background: linear-gradient(125deg, #903a30, #53252a 65%, #25202c);
    box-shadow: inset 0 2px #e5a57655, inset 0 -4px #29151e;
  }
  [data-station-settings="panel"] .station-settings__header::before,
  [data-station-settings="panel"] .station-settings__header::after {
    content: ''; position: absolute; top: 12px; width: 5px; height: 5px;
    border: 1px solid #d1a58a; border-radius: 50%; background: #34232b;
  }
  [data-station-settings="panel"] .station-settings__header::before { left: 10px; }
  [data-station-settings="panel"] .station-settings__header::after { right: 10px; }
  [data-station-settings="panel"] .station-settings__kicker {
    margin: 0 0 8px; color: #efbd96; font-size: 11px; font-weight: 700; letter-spacing: .16em;
  }
  [data-station-settings="panel"] h2 { margin: 0; font-size: 24px; letter-spacing: .04em; }
  [data-station-settings="panel"] .station-settings__body { display: grid; gap: 18px; padding: 24px; }
  [data-station-settings="panel"] p { line-height: 1.5; }
  [data-station-settings="panel"] .station-settings__description { margin: 0; color: #b8c3d1; font-size: 14px; }
  [data-station-settings="panel"] .station-settings__section { display: grid; gap: 10px; }
  [data-station-settings="panel"] button {
    min-height: 48px; width: 100%; padding: 12px 16px; border: 1px solid #6b7a8d;
    border-radius: 4px; background: linear-gradient(#293b50, #182638);
    color: #fff0df; font-size: 14px; font-weight: 700; letter-spacing: .06em;
    box-shadow: inset 0 1px #ffffff21, 0 3px #080f19;
  }
  [data-station-settings="panel"] button:hover:not(:disabled) { border-color: #ffcc98; background: #34455b; }
  [data-station-settings="panel"] button:disabled { opacity: .5; cursor: not-allowed; }
  [data-station-settings="panel"] .station-settings__status { margin: 0; color: #c4d0de; font-size: 13px; }
  [data-station-settings="panel"] label { display: grid; gap: 6px; color: #9bb6c7; font-size: 11px; font-weight: 700; letter-spacing: .08em; }
  [data-station-settings="panel"] select {
    box-sizing: border-box; width: 100%; min-height: 42px; padding: 8px 10px;
    border: 1px solid #526a78; border-radius: 3px; background: #0b1420; color: #f2f6fa;
    font: inherit; font-size: 14px; letter-spacing: normal;
  }
  [data-station-settings="panel"] input[type="range"] { width: 100%; accent-color: #ff554c; }
  [data-station-settings="panel"] .riffshot-radio {
    display: grid; gap: 12px; padding: 14px; border: 1px solid #526a78;
    background: linear-gradient(135deg, #0c1823, #101321); box-shadow: inset 0 2px #ff514522;
  }
  [data-station-settings="panel"] .riffshot-radio[hidden] { display: none; }
  [data-station-settings="panel"] .riffshot-radio h3 { margin: 0; color: #ff695d; font-size: 16px; letter-spacing: .1em; }
  [data-station-settings="panel"] .riffshot-radio__row { display: grid; grid-template-columns: minmax(0,1fr) auto; gap: 10px; align-items: end; }
  [data-station-settings="panel"] .riffshot-radio__row button { width: auto; min-width: 112px; }
  [data-station-settings="panel"] .riffshot-radio__transport { display: grid; grid-template-columns: repeat(3,1fr); gap: 8px; }
  [data-station-settings="panel"] .riffshot-radio__transport button { min-width: 0; padding-inline: 8px; }
  [data-station-settings="panel"] .riffshot-radio__station { margin: 0; color: #f4f7fa; font-size: 15px; font-weight: 700; }
  [data-station-settings="panel"] .riffshot-radio__license { margin: 0; color: #95a8b8; font-size: 11px; line-height: 1.45; }
  [data-station-settings="panel"] .riffshot-radio__status[data-state="playing"] { color: #79efb1; }
  [data-station-settings="panel"] .riffshot-radio__status[data-state="unavailable"] { color: #ff9c91; }
  [data-station-settings="panel"] .station-settings__danger {
    padding-top: 18px; border-top: 1px solid #643c40;
  }
  [data-station-settings="panel"] button.station-settings__erase {
    border-color: #c6705d; background: linear-gradient(#82362e, #4e242a); color: #ffe0cd;
  }
  [data-station-settings="panel"] button.station-settings__erase:hover:not(:disabled) { background: #963e33; }
  [data-station-settings="panel"] .station-settings__warning { margin: 0; color: #efb29b; font-size: 13px; }
  [data-station-settings="panel"] .station-settings__feedback { margin: 0; color: #ffd18b; font-size: 14px; }
  [data-station-settings="panel"] .station-settings__feedback:empty { display: none; }
  @media (max-height: 500px) {
    [data-station-settings="panel"] .station-settings__header { padding: 16px 24px; }
    [data-station-settings="panel"] .station-settings__body { padding: 16px; gap: 12px; }
  }
`;

function acquireStyle() {
  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = styles;
    document.head.append(style);
  }
  styleUsers += 1;
}

/** Station-local DOM UI. The owner retains confirmation, save deletion and navigation. */
export class StationSettings {
  private readonly scene: Phaser.Scene;
  private readonly game: Phaser.Game;
  private readonly onErase?: EraseHandler;
  private readonly onVehicleTuning?: () => void;
  readonly button: HTMLButtonElement;
  private readonly dialog: HTMLDialogElement;
  private readonly soundButton: HTMLButtonElement;
  private readonly eraseButton: HTMLButtonElement;
  private readonly vehicleTuningButton: HTMLButtonElement | null;
  private readonly closeButton: HTMLButtonElement;
  private readonly audioStatus: HTMLParagraphElement;
  private readonly feedback: HTMLParagraphElement;
  private readonly musicSourceSelect: HTMLSelectElement;
  private readonly gameMusicVolume: HTMLInputElement;
  private readonly effectsVolume: HTMLInputElement;
  private readonly radioPanel: HTMLElement;
  private readonly radioGenreSelect: HTMLSelectElement;
  private readonly radioSearchButton: HTMLButtonElement;
  private readonly radioStationSelect: HTMLSelectElement;
  private readonly radioStationName: HTMLParagraphElement;
  private readonly radioStationLink: HTMLAnchorElement;
  private readonly radioStatus: HTMLParagraphElement;
  private readonly radioPreviousButton: HTMLButtonElement;
  private readonly radioPlayButton: HTMLButtonElement;
  private readonly radioNextButton: HTMLButtonElement;
  private readonly radioVolume: HTMLInputElement;
  private destroyed: boolean;
  private erasing: boolean;
  private readonly pendingKeys: Set<string>;
  private readonly onOpen: () => void;
  private readonly onClose: () => void;
  private readonly onNativeClose: () => void;
  private readonly onCancel: (event: Event) => void;
  private readonly onBackdropClick: (event: MouseEvent) => void;
  private readonly onSound: () => void;
  private readonly onMusicSourceChange: () => void;
  private readonly onRadioGenreChange: () => void;
  private readonly onRadioSearch: () => void;
  private readonly onRadioStationChange: () => void;
  private readonly onRadioPrevious: () => void;
  private readonly onRadioPlay: () => void;
  private readonly onRadioNext: () => void;
  private readonly onRadioVolume: () => void;
  private readonly onGameMusicVolume: () => void;
  private readonly onEffectsVolume: () => void;
  private readonly onRadioState: (state: RadioPlayerState) => void;
  private readonly onEraseClick: () => void;
  private readonly onVehicleTuningClick: () => void;
  private readonly onAudioState: () => void;
  private readonly onShutdown: () => void;
  private readonly onKeyDown: (event: KeyboardEvent) => void;
  private readonly onGearKey: (event: KeyboardEvent) => void;
  private readonly onKeyUp: (event: KeyboardEvent) => void;
  private readonly onFocusIn: (event: FocusEvent) => void;
  private radioOptionsSignature = '';

  constructor(scene: Phaser.Scene, { onErase, onVehicleTuning }: StationSettingsOptions = {}) {
    this.scene = scene;
    this.game = scene.game;
    this.onErase = onErase;
    this.onVehicleTuning = onVehicleTuning;
    this.destroyed = false;
    this.erasing = false;
    this.pendingKeys = new Set();
    acquireStyle();

    // Normally unsuffixed; overlapping scene lifetimes must not duplicate DOM IDs.
    let suffix = '';
    for (let index = 2; document.getElementById(`station-settings-dialog${suffix}`); index += 1) {
      suffix = `-${index}`;
    }
    const dialogId = `station-settings-dialog${suffix}`;
    this.button = document.createElement('button');
    this.button.id = `station-settings-button${suffix}`;
    this.button.type = 'button';
    this.button.dataset.stationSettings = 'gear';
    this.button.title = 'Configurações';
    this.button.setAttribute('aria-label', 'Configurações');
    this.button.setAttribute('aria-haspopup', 'dialog');
    this.button.setAttribute('aria-controls', dialogId);
    this.button.setAttribute('aria-expanded', 'false');
    // Original eight-tooth gear, drawn locally without external assets.
    this.button.innerHTML = `<svg width="48" height="48" viewBox="0 0 48 48" fill="none" aria-hidden="true" focusable="false">
      <path d="M20 8h8l1 5 3 2 5-2 4 7-4 3v3l4 3-4 7-5-2-3 2-1 5h-8l-1-5-3-2-5 2-4-7 4-3v-3l-4-3 4-7 5 2 3-2z"
        fill="#bfa28e" stroke="#ffe1b8" stroke-width="1.5" stroke-linejoin="round"/>
      <circle cx="24" cy="24.5" r="7" fill="#182332" stroke="#633a35" stroke-width="3"/>
      <path d="M21 20.5h6M21 28.5h6" stroke="#ecc5a2" stroke-width="1.5"/>
    </svg>`;

    this.dialog = document.createElement('dialog');
    this.dialog.id = dialogId;
    this.dialog.dataset.stationSettings = 'panel';
    this.dialog.setAttribute('role', 'dialog');
    this.dialog.setAttribute('aria-modal', 'true');
    this.dialog.setAttribute('aria-labelledby', `${dialogId}-title`);
    this.dialog.setAttribute('aria-describedby', `${dialogId}-description`);
    const vehicleTuningSection = onVehicleTuning ? `
        <section class="station-settings__section station-settings__dev" aria-label="Balanceamento local">
          <button type="button" data-action="vehicle-tuning">MODO DESENVOLVEDOR / ATRIBUTOS DOS CARROS</button>
          <p class="station-settings__status">Disponível apenas no servidor de desenvolvimento local.</p>
        </section>` : '';
    this.dialog.innerHTML = `
      <header class="station-settings__header">
        <p class="station-settings__kicker">ESTAÇÃO DE EQUIPE / SISTEMAS</p>
        <h2 id="${dialogId}-title">CONFIGURAÇÕES</h2>
      </header>
      <div class="station-settings__body">
        <p id="${dialogId}-description" class="station-settings__description">Escolha sua música, ajuste os efeitos e gerencie o progresso da carreira.</p>
        <section class="station-settings__section" aria-label="Efeitos sonoros">
          <button type="button" data-action="sound" aria-describedby="${dialogId}-audio">SOM: EFEITOS ATIVOS</button>
          <p id="${dialogId}-audio" class="station-settings__status" role="status" aria-live="polite"></p>
          <label>VOLUME DOS EFEITOS <input type="range" data-action="effects-volume" min="0" max="1" step="0.01" aria-label="Volume dos efeitos sonoros"></label>
        </section>
        <section class="station-settings__section" aria-label="Fonte da música">
          <label>MÚSICA
            <select data-action="music-source" aria-label="Fonte da música">
              <option value="game">TRILHA DO JOGO</option>
              <option value="radio">RIFFSHOT RADIO</option>
              <option value="none">SEM MÚSICA</option>
            </select>
          </label>
          <label>VOLUME DA TRILHA DO JOGO <input type="range" data-action="game-music-volume" min="0" max="1" step="0.01" aria-label="Volume da trilha do jogo"></label>
        </section>
        <section class="riffshot-radio" data-action="radio-panel" aria-label="RIFFSHOT RADIO" hidden>
          <h3>RIFFSHOT RADIO</h3>
          <div class="riffshot-radio__row">
            <label>GÊNERO
              <select data-action="radio-genre" aria-label="Gênero da rádio"></select>
            </label>
            <button type="button" data-action="radio-search">BUSCAR</button>
          </div>
          <label>ESTAÇÃO
            <select data-action="radio-station" aria-label="Estação de rádio"></select>
          </label>
          <p class="riffshot-radio__station" data-action="radio-name">Escolha um gênero e busque estações.</p>
          <a data-action="radio-homepage" href="" target="_blank" rel="noopener noreferrer" hidden>Site da emissora</a>
          <p class="station-settings__status riffshot-radio__status" data-action="radio-status" role="status" aria-live="polite"></p>
          <div class="riffshot-radio__transport" aria-label="Controles da rádio">
            <button type="button" data-action="radio-previous" aria-label="Estação anterior">◀ ANTERIOR</button>
          <button type="button" data-action="radio-play" aria-label="Reproduzir rádio">▶ REPRODUZIR</button>
            <button type="button" data-action="radio-next" aria-label="Próxima estação">PRÓXIMA ▶</button>
          </div>
          <label>VOLUME DA RÁDIO <input type="range" data-action="radio-volume" min="0" max="1" step="0.01" aria-label="Volume da rádio"></label>
          <p class="riffshot-radio__license">Streams externos fornecidos pelas emissoras. Disponibilidade, formatos e direitos da programação dependem de cada emissora; o jogo não grava nem retransmite o áudio.</p>
        </section>
        ${vehicleTuningSection}
        <section class="station-settings__section station-settings__danger" aria-label="Progresso da carreira">
          <button type="button" data-action="erase" class="station-settings__erase" aria-describedby="${dialogId}-warning">APAGAR PROGRESSO</button>
          <p id="${dialogId}-warning" class="station-settings__warning">A exclusão é irreversível: apaga a carreira, os veículos adquiridos e os backups do campeonato. Uma confirmação será solicitada antes de apagar.</p>
        </section>
        <p class="station-settings__feedback" role="status" aria-live="polite" aria-atomic="true"></p>
        <button type="button" data-action="close" autofocus>FECHAR</button>
      </div>`;
    this.soundButton = this.dialog.querySelector<HTMLButtonElement>('[data-action="sound"]')!;
    this.musicSourceSelect = this.dialog.querySelector<HTMLSelectElement>('[data-action="music-source"]')!;
    this.gameMusicVolume = this.dialog.querySelector<HTMLInputElement>('[data-action="game-music-volume"]')!;
    this.effectsVolume = this.dialog.querySelector<HTMLInputElement>('[data-action="effects-volume"]')!;
    this.radioPanel = this.dialog.querySelector<HTMLElement>('[data-action="radio-panel"]')!;
    this.radioGenreSelect = this.dialog.querySelector<HTMLSelectElement>('[data-action="radio-genre"]')!;
    this.radioSearchButton = this.dialog.querySelector<HTMLButtonElement>('[data-action="radio-search"]')!;
    this.radioStationSelect = this.dialog.querySelector<HTMLSelectElement>('[data-action="radio-station"]')!;
    this.radioStationName = this.dialog.querySelector<HTMLParagraphElement>('[data-action="radio-name"]')!;
    this.radioStationLink = this.dialog.querySelector<HTMLAnchorElement>('[data-action="radio-homepage"]')!;
    this.radioStatus = this.dialog.querySelector<HTMLParagraphElement>('[data-action="radio-status"]')!;
    this.radioPreviousButton = this.dialog.querySelector<HTMLButtonElement>('[data-action="radio-previous"]')!;
    this.radioPlayButton = this.dialog.querySelector<HTMLButtonElement>('[data-action="radio-play"]')!;
    this.radioNextButton = this.dialog.querySelector<HTMLButtonElement>('[data-action="radio-next"]')!;
    this.radioVolume = this.dialog.querySelector<HTMLInputElement>('[data-action="radio-volume"]')!;
    this.eraseButton = this.dialog.querySelector<HTMLButtonElement>('[data-action="erase"]')!;
    this.vehicleTuningButton = this.dialog.querySelector<HTMLButtonElement>('[data-action="vehicle-tuning"]');
    this.closeButton = this.dialog.querySelector<HTMLButtonElement>('[data-action="close"]')!;
    this.audioStatus = this.dialog.querySelector<HTMLParagraphElement>('.station-settings__status')!;
    this.feedback = this.dialog.querySelector<HTMLParagraphElement>('.station-settings__feedback')!;
    this.radioGenreSelect.replaceChildren(...RADIO_GENRES.map(genre => new Option(genre, genre)));
    this.eraseButton.disabled = typeof onErase !== 'function';

    this.onOpen = () => this.open();
    this.onClose = () => this.close();
    this.onNativeClose = () => {
      if (!this.dialog.open && this.button.getAttribute('aria-expanded') === 'true') this.finishClose();
    };
    this.onCancel = (event: Event) => { event.preventDefault(); this.close(); };
    this.onBackdropClick = (event: MouseEvent) => {
      if (event.target !== this.dialog) return;
      const bounds = this.dialog.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right
        || event.clientY < bounds.top || event.clientY > bounds.bottom) this.close();
    };
    this.onSound = () => {
      this.game.menuMusic?.toggle();
      this.updateAudio();
    };
    this.onMusicSourceChange = () => {
      const source = this.musicSourceSelect.value as MusicSource;
      this.game.menuMusic?.setMusicSource(source);
      if (source === 'radio' && this.game.riffshotRadio.state.stations.length === 0) {
        void this.game.riffshotRadio.searchStations(this.radioGenreSelect.value as RadioGenre);
      }
      this.updateRadio();
    };
    this.onRadioGenreChange = () => {
      this.game.riffshotRadio.setGenre(this.radioGenreSelect.value as RadioGenre);
    };
    this.onRadioSearch = () => { void this.game.riffshotRadio.searchStations(this.radioGenreSelect.value as RadioGenre); };
    this.onRadioStationChange = () => this.game.riffshotRadio.selectStation(this.radioStationSelect.value);
    this.onRadioPrevious = () => this.game.riffshotRadio.playAdjacent(-1);
    this.onRadioPlay = () => this.game.riffshotRadio.togglePlayback();
    this.onRadioNext = () => this.game.riffshotRadio.playAdjacent(1);
    this.onRadioVolume = () => this.game.riffshotRadio.setVolume(Number(this.radioVolume.value));
    this.onGameMusicVolume = () => this.game.menuMusic?.setGameMusicVolume(Number(this.gameMusicVolume.value));
    this.onEffectsVolume = () => this.game.menuMusic?.setEffectsVolume(Number(this.effectsVolume.value));
    this.onRadioState = () => this.updateRadio();
    this.onEraseClick = () => this.requestErase();
    this.onVehicleTuningClick = () => {
      if (!this.destroyed && this.isOpen) this.onVehicleTuning?.();
    };
    this.onAudioState = () => this.updateAudio();
    this.onShutdown = () => this.destroy();
    this.onKeyDown = (event: KeyboardEvent) => this.onkeydownTrap(event);
    this.onGearKey = (event: KeyboardEvent) => {
      event.stopPropagation();
      this.pendingKeys.add(event.code || event.key);
    };
    // Keep the release of a closing/opening key away from Phaser too.
    this.onKeyUp = (event: KeyboardEvent) => {
      const pending = this.pendingKeys.delete(event.code || event.key);
      if (pending || this.isOpen || event.target === this.button) event.stopImmediatePropagation();
    };
    this.onFocusIn = (event: FocusEvent) => {
      if (this.isOpen && !(event.target instanceof Node && this.dialog.contains(event.target))) this.closeButton.focus({ preventScroll: true });
    };
    this.button.addEventListener('click', this.onOpen);
    this.button.addEventListener('keydown', this.onGearKey);
    this.soundButton.addEventListener('click', this.onSound);
    this.musicSourceSelect.addEventListener('change', this.onMusicSourceChange);
    this.radioGenreSelect.addEventListener('change', this.onRadioGenreChange);
    this.radioSearchButton.addEventListener('click', this.onRadioSearch);
    this.radioStationSelect.addEventListener('change', this.onRadioStationChange);
    this.radioPreviousButton.addEventListener('click', this.onRadioPrevious);
    this.radioPlayButton.addEventListener('click', this.onRadioPlay);
    this.radioNextButton.addEventListener('click', this.onRadioNext);
    this.radioVolume.addEventListener('input', this.onRadioVolume);
    this.gameMusicVolume.addEventListener('input', this.onGameMusicVolume);
    this.effectsVolume.addEventListener('input', this.onEffectsVolume);
    this.eraseButton.addEventListener('click', this.onEraseClick);
    this.vehicleTuningButton?.addEventListener('click', this.onVehicleTuningClick);
    this.closeButton.addEventListener('click', this.onClose);
    this.dialog.addEventListener('cancel', this.onCancel);
    this.dialog.addEventListener('close', this.onNativeClose);
    this.dialog.addEventListener('click', this.onBackdropClick);
    window.addEventListener('keyup', this.onKeyUp, true);
    this.game.events.on('audio-state', this.onAudioState);
    this.game.events.on('riffshot-radio-state', this.onRadioState);
    scene.events.once('shutdown', this.onShutdown);
    document.body.append(this.button, this.dialog);
    this.updateAudio();
    this.updateRadio();
    if (this.game.menuMusic.musicMode === 'radio' && this.game.riffshotRadio.state.stations.length === 0) {
      void this.game.riffshotRadio.searchStations(this.game.audioPreferences.value.radioGenre);
    }
  }

  get isOpen() { return !this.destroyed && this.dialog.open; }

  open() {
    if (this.destroyed || this.isOpen) return;
    this.setFeedback('');
    this.updateAudio();
    this.dialog.showModal();
    this.button.setAttribute('aria-expanded', 'true');
    window.addEventListener('keydown', this.onKeyDown, true);
    document.addEventListener('focusin', this.onFocusIn, true);
    this.closeButton.focus({ preventScroll: true });
  }

  close() {
    if (this.destroyed || !this.isOpen) return;
    this.dialog.close();
    this.finishClose();
  }

  finishClose() {
    window.removeEventListener('keydown', this.onKeyDown, true);
    document.removeEventListener('focusin', this.onFocusIn, true);
    this.button.setAttribute('aria-expanded', 'false');
    if (!this.destroyed && this.button.isConnected) this.button.focus({ preventScroll: true });
  }

  onkeydownTrap(event: KeyboardEvent) {
    if (!this.isOpen) return;
    this.pendingKeys.add(event.code || event.key);
    // Keep native keys inside this dialog; the sound button is the only audio toggle.
    event.stopImmediatePropagation();
    if (event.key === 'Escape') {
      event.preventDefault();
      this.close();
    } else if (event.key === 'Tab') {
      event.preventDefault();
       const buttons = [...this.dialog.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
       const index = document.activeElement instanceof HTMLButtonElement
         ? buttons.indexOf(document.activeElement) : -1;
      const next = index < 0 ? (event.shiftKey ? buttons.length - 1 : 0)
        : (index + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length;
      buttons[next]?.focus({ preventScroll: true });
    } else if (event.key === 'Enter' || event.key === ' ') {
      // Phaser may have captured the native default earlier. Activate exactly
      // once here instead of depending on that default or leaking it to the pit.
      event.preventDefault();
      if (!event.repeat && document.activeElement?.matches('button:not(:disabled)')
         && this.dialog.contains(document.activeElement)) (document.activeElement as HTMLButtonElement).click();
    }
  }

  updateAudio() {
    if (this.destroyed) return;
    const music = this.game.menuMusic as unknown as StationMusic;
    const state = music?.getAudioState();
    const available = !!state?.available && typeof music?.toggle === 'function';
    this.soundButton.disabled = !available;
    this.soundButton.textContent = !available ? 'SOM: EFEITOS INDISPONÍVEIS'
      : state.muted ? 'SOM: ATIVAR EFEITOS' : 'SOM: SILENCIAR EFEITOS';
    this.audioStatus.textContent = !available ? 'O áudio não está disponível neste navegador.'
      : state.hidden || !state.focused ? 'Os efeitos ficam silenciados quando o jogo está em segundo plano.'
        : !state.unlocked ? 'O navegador aguarda uma interação para liberar os efeitos.'
          : state.muted ? 'Efeitos sonoros silenciados; música e rádio têm controles separados.'
            : `Efeitos ativos · volume ${Math.round(state.effectsVolume * 100)}%.`;
    this.musicSourceSelect.value = music.musicMode;
    this.gameMusicVolume.value = String(this.game.audioPreferences.value.gameMusicVolume);
    this.effectsVolume.value = String(this.game.audioPreferences.value.effectsVolume);
    this.radioPanel.hidden = music.musicMode !== 'radio';
    this.updateRadio();
  }

  updateRadio(state = this.game.riffshotRadio.state) {
    if (this.destroyed) return;
    this.radioGenreSelect.value = state.genre;
    const signature = state.stations.map(station => `${station.stationuuid}:${station.name}`).join('|');
    if (signature !== this.radioOptionsSignature) {
      this.radioOptionsSignature = signature;
      this.radioStationSelect.replaceChildren(new Option('Selecione uma emissora', ''));
      for (const station of state.stations) {
        const detail = [station.codec, station.bitrate > 0 ? `${station.bitrate} kbps` : ''].filter(Boolean).join(' · ');
        this.radioStationSelect.add(new Option(detail ? `${station.name} — ${detail}` : station.name, station.stationuuid));
      }
    }
    this.radioStationSelect.value = state.station?.stationuuid ?? '';
    this.radioStationSelect.disabled = state.searching || state.stations.length === 0;
    this.radioSearchButton.disabled = state.searching;
    this.radioSearchButton.textContent = state.searching ? 'BUSCANDO…' : 'BUSCAR';
    this.radioStationName.textContent = state.station?.name ?? 'Nenhuma estação selecionada';
    this.radioStationLink.hidden = !state.station?.homepage;
    this.radioStationLink.href = state.station?.homepage ?? '';
    this.radioStatus.dataset.state = state.status;
    this.radioStatus.textContent = state.searchError || state.playbackError || (state.searching ? 'Consultando Radio Browser…'
      : state.status === 'playing' ? 'REPRODUZINDO'
        : state.status === 'connecting' ? 'CONECTANDO À TRANSMISSÃO…'
          : state.status === 'unavailable' ? 'RÁDIO INDISPONÍVEL'
            : state.status === 'paused' ? state.resumeAfterGesture ? 'PAUSADA · toque em Continuar para retomar.' : 'PAUSADA'
              : state.station ? 'PRONTA · pressione Reproduzir para iniciar.'
                : 'Escolha um gênero e busque estações.');
    this.radioPlayButton.disabled = !state.station || state.searching;
    this.radioPlayButton.textContent = state.status === 'playing' || state.status === 'connecting' ? 'Ⅱ PAUSAR'
      : state.resumeAfterGesture ? '▶ CONTINUAR' : '▶ REPRODUZIR';
    this.radioPlayButton.setAttribute('aria-label', state.status === 'playing' || state.status === 'connecting'
      ? 'Pausar rádio' : state.resumeAfterGesture ? 'Continuar rádio' : 'Reproduzir rádio');
    this.radioPreviousButton.disabled = !state.previousAvailable;
    this.radioNextButton.disabled = !state.nextAvailable;
    this.radioVolume.value = String(state.volume);
  }

  async requestErase() {
    if (this.destroyed || !this.isOpen || this.erasing || typeof this.onErase !== 'function') return;
    this.erasing = true;
    if (document.activeElement === this.eraseButton) this.closeButton.focus({ preventScroll: true });
    this.eraseButton.disabled = true;
    this.setFeedback('A exclusão depende da confirmação. Sem confirmar, seu progresso é preservado.');
    try {
      // No storage access or second confirmation: the scene owns this operation.
      await this.onErase();
    } catch {
      this.showError('Não foi possível concluir a solicitação de exclusão.');
    } finally {
      this.erasing = false;
      if (!this.destroyed) this.eraseButton.disabled = false;
    }
  }

  setFeedback(message = '') {
    if (!this.destroyed) this.feedback.textContent = String(message);
  }

  showError(message: string) { this.setFeedback(message); }

  /** Position the gear's top-left corner in viewport CSS pixels (not canvas units). */
  position(x: number, y: number) {
    if (this.destroyed || !Number.isFinite(x) || !Number.isFinite(y)) return;
    this.button.style.left = `${x}px`;
    this.button.style.top = `${y}px`;
    this.button.style.right = 'auto';
  }

  resize(x: number, y: number) { this.position(x, y); }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    // Release the native top layer without moving focus to a departing station.
    this.dialog.removeEventListener('close', this.onNativeClose);
    if (this.dialog.open) this.dialog.close();
    this.finishClose();
    window.removeEventListener('keyup', this.onKeyUp, true);
    this.button.removeEventListener('click', this.onOpen);
    this.button.removeEventListener('keydown', this.onGearKey);
    this.soundButton.removeEventListener('click', this.onSound);
    this.musicSourceSelect.removeEventListener('change', this.onMusicSourceChange);
    this.radioGenreSelect.removeEventListener('change', this.onRadioGenreChange);
    this.radioSearchButton.removeEventListener('click', this.onRadioSearch);
    this.radioStationSelect.removeEventListener('change', this.onRadioStationChange);
    this.radioPreviousButton.removeEventListener('click', this.onRadioPrevious);
    this.radioPlayButton.removeEventListener('click', this.onRadioPlay);
    this.radioNextButton.removeEventListener('click', this.onRadioNext);
    this.radioVolume.removeEventListener('input', this.onRadioVolume);
    this.gameMusicVolume.removeEventListener('input', this.onGameMusicVolume);
    this.effectsVolume.removeEventListener('input', this.onEffectsVolume);
    this.eraseButton.removeEventListener('click', this.onEraseClick);
    this.vehicleTuningButton?.removeEventListener('click', this.onVehicleTuningClick);
    this.closeButton.removeEventListener('click', this.onClose);
    this.dialog.removeEventListener('cancel', this.onCancel);
    this.dialog.removeEventListener('click', this.onBackdropClick);
    this.game.events.off('audio-state', this.onAudioState);
    this.game.events.off('riffshot-radio-state', this.onRadioState);
    this.scene.events.off('shutdown', this.onShutdown);
    this.pendingKeys.clear();
    this.button.remove();
    this.dialog.remove();
    styleUsers -= 1;
    if (styleUsers === 0) document.getElementById(STYLE_ID)?.remove();
  }
}
