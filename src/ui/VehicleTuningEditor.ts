import type Phaser from 'phaser';
import { VEHICLE_TUNING_FIELDS, VEHICLE_TUNING_IDS } from '../data/vehicleTuningSchema.ts';
import type { VehicleTuning } from '../data/vehicles.ts';
import { RACE_TRACKS } from '../data/raceTracks.ts';
import type { RaceTrackAudioKind } from '../audio/RaceTrackAudioLibrary.ts';
import { loadDevRaceAIBonus, saveDevRaceAIBonus } from '../race/DevRaceAIBonus.ts';

const STYLE_ID = 'vehicle-tuning-editor-style';
const API = '/__riffshot_dev/vehicle-tuning';
let styleUsers = 0;
type AuthResponse = { token: string; vehicles: VehicleTuning };
type EditorResponse = { saved: true };

const labelFor: Record<(typeof VEHICLE_TUNING_FIELDS)[number], string> = {
  speed: 'Velocidade', acceleration: 'Aceleração', control: 'Controle',
  tires: 'Pneus', suspension: 'Suspensão', armor: 'Armor',
  shotCount: 'Quantidade de tiros', bombCount: 'Quantidade de bombas', oilSlickCount: 'Poças de óleo',
};
const nameFor: Record<(typeof VEHICLE_TUNING_IDS)[number], string> = {
  'rift-blaze': 'THUNDER BUG', 'volt-vector': 'CAMARO', 'iron-bastion': 'ARMORED CAR',
  'race-car-2': 'RACE CAR 2', widowmaker: 'WIDOWMAKER',
};

const styles = `
  dialog[data-vehicle-tuning] { box-sizing:border-box; width:min(620px,calc(100vw - 28px));
    max-height:calc(100dvh - 28px); padding:0; border:2px solid #a75647; border-radius:10px;
    color:#f7ece2; background:#111b2a; box-shadow:0 24px 80px #000b; overflow:auto; }
  dialog[data-vehicle-tuning]::backdrop { background:#050a14df; }
  [data-vehicle-tuning] * { box-sizing:border-box; }
  [data-vehicle-tuning] header { padding:18px 22px; background:linear-gradient(125deg,#903a30,#25202c); }
  [data-vehicle-tuning] h2 { margin:0; font:700 20px Arial,sans-serif; color:#fff0df; }
  [data-vehicle-tuning] .dev-warning { margin:7px 0 0; color:#ffcf73; font:13px/1.4 Arial,sans-serif; }
  [data-vehicle-tuning] form { display:grid; gap:14px; padding:18px; }
  [data-vehicle-tuning] fieldset { min-width:0; display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:10px;
    margin:0; padding:12px; border:1px solid #536477; border-radius:5px; }
  [data-vehicle-tuning] legend { padding:0 6px; color:#71f6ff; font:700 13px Arial,sans-serif; }
  [data-vehicle-tuning] label { display:grid; gap:5px; color:#b8c3d1; font:12px Arial,sans-serif; }
  [data-vehicle-tuning] input { width:100%; min-height:38px; border:1px solid #62748b; border-radius:4px;
    padding:7px; color:#fff; background:#091321; font:700 16px Arial,sans-serif; }
  [data-vehicle-tuning] input:focus-visible,[data-vehicle-tuning] button:focus-visible { outline:3px solid #ffd18b; outline-offset:2px; }
  [data-vehicle-tuning] .dev-actions { display:flex; gap:10px; }
  [data-vehicle-tuning] button { min-height:44px; flex:1; padding:10px; border:1px solid #718297; border-radius:4px;
    color:#fff0df; background:linear-gradient(#293b50,#182638); font:700 13px Arial,sans-serif; cursor:pointer; }
  [data-vehicle-tuning] button:hover:not(:disabled) { border-color:#ffcf73; }
  [data-vehicle-tuning] button:disabled { opacity:.55; cursor:wait; }
  [data-vehicle-tuning] [data-role="status"] { min-height:20px; margin:0; color:#a8f9ff; font:13px/1.4 Arial,sans-serif; }
  [data-vehicle-tuning] [data-role="password-area"] { display:grid; gap:12px; }
  [data-vehicle-tuning] .dev-track-audio { margin-top:18px; padding:14px; border:1px solid #536477; }
  [data-vehicle-tuning] .dev-track-audio h3 { margin:0 0 8px; color:#ff806d; font:700 15px Arial,sans-serif; }
  [data-vehicle-tuning] .dev-track-audio p { margin:0 0 12px; color:#a9bfcc; font:12px/1.45 Arial,sans-serif; }
  [data-vehicle-tuning] .dev-track-audio fieldset { grid-template-columns:repeat(2,minmax(0,1fr)); margin:12px 0; }
  [data-vehicle-tuning] .dev-track-audio input[type="file"] { min-height:36px; font-size:11px; }
  [data-vehicle-tuning] .dev-track-audio [data-track-audio-status] { grid-column:1/-1; }
  [data-vehicle-tuning] .dev-tabs { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:6px; padding:14px 18px 0; }
  [data-vehicle-tuning] .dev-tabs [aria-selected="true"] { border-color:#ffcf73; color:#ffcf73; background:#463127; }
  [data-vehicle-tuning] .dev-panel { padding:0 18px 18px; }
  [data-vehicle-tuning] .dev-panel > p { color:#a9bfcc; font:13px/1.5 Arial,sans-serif; }
  [data-vehicle-tuning] .dev-ai-control { display:grid; grid-template-columns:1fr auto; align-items:center; gap:10px; margin:16px 0; }
  [data-vehicle-tuning] .dev-ai-control label { display:block; }
  [data-vehicle-tuning] .dev-ai-control input[type="range"] { grid-column:1/-1; min-height:28px; padding:0; accent-color:#ff806d; }
  [data-vehicle-tuning] .dev-ai-control output { color:#ffcf73; font:700 18px Arial,sans-serif; }
  [data-vehicle-tuning] [hidden] { display:none !important; }
  @media(max-width:440px) { [data-vehicle-tuning] fieldset { grid-template-columns:repeat(2,minmax(0,1fr)); } }
`;

function acquireStyle(): void {
  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = styles;
    document.head.append(style);
  }
  styleUsers += 1;
}

/** Local-only, allowlisted vehicle tuning UI; the password is never shipped to the browser. */
export class VehicleTuningEditor {
  readonly dialog: HTMLDialogElement;
  private readonly scene: Phaser.Scene;
  private readonly passwordInput: HTMLInputElement;
  private readonly passwordArea: HTMLDivElement;
  private readonly editArea: HTMLFormElement;
  private readonly status: HTMLParagraphElement;
  private readonly authorizeButton: HTMLButtonElement;
  private readonly saveButton: HTMLButtonElement;
  private readonly closeButton: HTMLButtonElement;
  private token = '';
  private inputs = new Map<string, HTMLInputElement>();
  private readonly onTrackAudioAction: (event: Event) => void;
  private readonly onTabKeydown: (event: KeyboardEvent) => void;
  private readonly onAIBonusInput: (event: Event) => void;
  private destroyed = false;
  private busy = false;
  private readonly onAuth: (event: SubmitEvent) => void;
  private readonly onSave: (event: SubmitEvent) => void;
  private readonly onClose: () => void;
  private readonly onCancel: (event: Event) => void;
  private readonly onShutdown: () => void;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    acquireStyle();
    this.dialog = document.createElement('dialog');
    this.dialog.dataset.vehicleTuning = 'true';
    this.dialog.setAttribute('role', 'dialog');
    this.dialog.setAttribute('aria-modal', 'true');
    this.dialog.setAttribute('aria-labelledby', 'vehicle-tuning-title');
    this.dialog.innerHTML = `
      <header><h2 id="vehicle-tuning-title">PAINEL DO MODO DESENVOLVEDOR</h2>
        <p class="dev-warning">Somente no servidor local. Ajustes da IA valem na próxima corrida Difícil; atributos dos veículos alteram o arquivo local.</p></header>
      <form data-role="password-area">
        <label>Senha local <input data-role="password" type="password" inputmode="numeric" autocomplete="current-password" required></label>
        <div class="dev-actions"><button type="submit" data-role="authorize">DESBLOQUEAR E CARREGAR ATRIBUTOS</button></div>
      </form>
      <form data-role="edit-area" hidden>
        <div class="dev-tabs" role="tablist" aria-label="Seções do Modo Desenvolvedor">
          <button type="button" role="tab" id="dev-tab-vehicles" aria-controls="dev-panel-vehicles" aria-selected="true" data-dev-tab="vehicles">VEÍCULOS</button>
          <button type="button" role="tab" id="dev-tab-audio" aria-controls="dev-panel-audio" aria-selected="false" data-dev-tab="audio" tabindex="-1">ÁUDIO</button>
          <button type="button" role="tab" id="dev-tab-race" aria-controls="dev-panel-race" aria-selected="false" data-dev-tab="race" tabindex="-1">DIFICULDADE IA</button>
        </div>
        <section class="dev-panel" id="dev-panel-vehicles" role="tabpanel" aria-labelledby="dev-tab-vehicles" data-dev-panel="vehicles">
          <div data-role="vehicles"></div>
          <div class="dev-actions"><button type="submit" data-role="save">SALVAR ATRIBUTOS NO PROJETO</button></div>
        </section>
        <section class="dev-panel" id="dev-panel-audio" role="tabpanel" aria-labelledby="dev-tab-audio" data-dev-panel="audio" hidden>
          <section class="dev-track-audio" data-role="track-audio" aria-label="Música de pista local">
            <h3>ÁUDIO LOCAL POR PISTA / DEV</h3>
            <p>Envie MP3 de música e anúncio de largada. Os arquivos ficam neste navegador (IndexedDB), não alteram o repositório e não são enviados ao build.</p>
            <div data-role="track-audio-controls"></div>
          </section>
        </section>
        <section class="dev-panel" id="dev-panel-race" role="tabpanel" aria-labelledby="dev-tab-race" data-dev-panel="race" hidden>
          <p>Vantagens temporárias da IA: velocidade máxima, aceleração, aderência e direção. Só são aplicadas ao iniciar uma corrida na dificuldade Difícil; não alteram o jogador, atributos salvos ou progresso.</p>
          <div class="dev-ai-control">
            <label for="dev-bots-bonus">BÔNUS DOS BOTS</label><output data-role="bots-bonus-output" for="dev-bots-bonus">0%</output>
            <input id="dev-bots-bonus" type="range" min="0" max="20" step="1" data-ai-bonus="botsPercent" aria-label="Bônus dos bots na dificuldade Difícil">
          </div>
          <div class="dev-ai-control">
            <label for="dev-rival-bonus">BÔNUS DO RIVAL</label><output data-role="rival-bonus-output" for="dev-rival-bonus">0%</output>
            <input id="dev-rival-bonus" type="range" min="0" max="20" step="1" data-ai-bonus="rivalPercent" aria-label="Bônus do rival na dificuldade Difícil">
          </div>
          <p data-role="ai-bonus-status" role="status" aria-live="polite">0% significa sem vantagem adicional. Mudanças são salvas só neste navegador.</p>
        </section>
      </form>
      <div style="padding:0 18px 18px"><p data-role="status" role="status" aria-live="polite"></p>
        <button type="button" data-role="close">FECHAR</button></div>`;
    this.passwordArea = this.dialog.querySelector<HTMLDivElement>('[data-role="password-area"]')!;
    this.editArea = this.dialog.querySelector<HTMLFormElement>('[data-role="edit-area"]')!;
    this.passwordInput = this.dialog.querySelector<HTMLInputElement>('[data-role="password"]')!;
    this.status = this.dialog.querySelector<HTMLParagraphElement>('[data-role="status"]')!;
    this.authorizeButton = this.dialog.querySelector<HTMLButtonElement>('[data-role="authorize"]')!;
    this.saveButton = this.dialog.querySelector<HTMLButtonElement>('[data-role="save"]')!;
    this.closeButton = this.dialog.querySelector<HTMLButtonElement>('[data-role="close"]')!;
    this.onAuth = event => { event.preventDefault(); void this.authorize(); };
    this.onSave = event => { event.preventDefault(); void this.save(); };
    this.onTrackAudioAction = event => {
      const tab = (event.target as Element | null)?.closest<HTMLButtonElement>('[data-dev-tab]');
      if (tab) { this.activateTab(tab.dataset.devTab ?? 'vehicles', true); return; }
      void this.handleTrackAudioAction(event);
    };
    this.onTabKeydown = event => this.handleTabKeydown(event);
    this.onAIBonusInput = event => this.saveAIBonusFromInput(event);
    this.onClose = () => this.close();
    this.onCancel = event => { event.preventDefault(); this.close(); };
    this.onShutdown = () => this.destroy();
    this.passwordArea.addEventListener('submit', this.onAuth);
    this.editArea.addEventListener('submit', this.onSave);
    this.editArea.addEventListener('click', this.onTrackAudioAction);
    this.editArea.addEventListener('keydown', this.onTabKeydown);
    this.editArea.addEventListener('input', this.onAIBonusInput);
    this.closeButton.addEventListener('click', this.onClose);
    this.dialog.addEventListener('cancel', this.onCancel);
    scene.events.once('shutdown', this.onShutdown);
    document.body.append(this.dialog);
  }

  open(): void {
    if (this.destroyed || this.dialog.open) return;
    this.status.textContent = '';
    this.dialog.showModal();
    if (this.token) this.saveButton.focus({ preventScroll: true });
    else this.passwordInput.focus({ preventScroll: true });
  }

  private async request<T>(path: string, body?: unknown): Promise<T> {
    const response = await fetch(`${API}/${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      credentials: 'same-origin', cache: 'no-store',
    });
    const result = await response.json() as T & { error?: string };
    if (!response.ok) throw new Error(result.error ?? 'local-editor-failed');
    return result;
  }

  private async authorize(): Promise<void> {
    if (this.destroyed || this.busy || !this.dialog.open) return;
    this.busy = true;
    this.authorizeButton.disabled = true;
    this.status.textContent = 'Validando e carregando o arquivo local…';
    try {
      const result = await this.request<AuthResponse>('auth', { password: this.passwordInput.value });
      this.token = result.token;
      this.passwordInput.value = '';
      this.render(result.vehicles);
      this.renderTrackAudioControls();
      this.renderAIBonusControls();
      this.passwordArea.hidden = true;
      this.editArea.hidden = false;
      this.status.textContent = 'Acesso de desenvolvimento liberado. As opções locais ficam organizadas nas abas acima.';
      this.saveButton.focus({ preventScroll: true });
    } catch {
      // Never echo the credential or details from a server exception.
      this.status.textContent = 'Senha incorreta ou servidor local indisponível. Nenhuma alteração foi feita.';
      this.passwordInput.select();
    } finally {
      this.busy = false;
      if (!this.destroyed) this.authorizeButton.disabled = false;
    }
  }

  private render(vehicles: VehicleTuning): void {
    const container = this.editArea.querySelector<HTMLDivElement>('[data-role="vehicles"]')!;
    container.replaceChildren();
    this.inputs.clear();
    for (const id of VEHICLE_TUNING_IDS) {
      const fieldset = document.createElement('fieldset'), legend = document.createElement('legend');
      legend.textContent = nameFor[id];
      fieldset.append(legend);
      for (const field of VEHICLE_TUNING_FIELDS) {
        const label = document.createElement('label'), input = document.createElement('input');
        input.type = 'number'; input.min = '0'; input.max = '100'; input.step = '1';
        input.required = true; input.inputMode = 'numeric'; input.value = String(vehicles[id][field]);
        input.setAttribute('aria-label', `${nameFor[id]} / ${labelFor[field]}`);
        label.append(labelFor[field], input);
        fieldset.append(label);
        this.inputs.set(`${id}:${field}`, input);
      }
      container.append(fieldset);
    }
  }

  private renderTrackAudioControls(): void {
    const container = this.editArea.querySelector<HTMLDivElement>('[data-role="track-audio-controls"]')!;
    container.replaceChildren();
    const menuMusic = this.scene.game.menuMusic;
    for (const track of RACE_TRACKS) {
      const fieldset = document.createElement('fieldset'), legend = document.createElement('legend');
      legend.textContent = track.name;
      fieldset.append(legend);
      for (const [kind, title] of [['music', 'MÚSICA'], ['announcer', 'NARRAÇÃO DE LARGADA']] as const) {
        const label = document.createElement('label'), input = document.createElement('input');
        input.type = 'file'; input.accept = '.mp3,audio/mpeg';
        input.dataset.trackAudioFile = track.id; input.dataset.trackAudioKind = kind;
        input.setAttribute('aria-label', `${track.name} — ${title} — selecionar MP3`);
        label.append(title, input);
        const save = document.createElement('button');
        save.type = 'button'; save.textContent = 'SALVAR';
        save.dataset.trackAudioAction = 'save'; save.dataset.trackAudio = track.id; save.dataset.kind = kind;
        save.setAttribute('aria-label', `Salvar ${title.toLowerCase()} de ${track.name}`);
        const remove = document.createElement('button');
        remove.type = 'button'; remove.textContent = 'REMOVER';
        remove.dataset.trackAudioAction = 'remove'; remove.dataset.trackAudio = track.id; remove.dataset.kind = kind;
        remove.setAttribute('aria-label', `Remover ${title.toLowerCase()} de ${track.name}`);
        const status = document.createElement('p');
        status.dataset.trackAudioStatus = `${track.id}:${kind}`;
        status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
        const existing = menuMusic?.getRaceTrackAudioOverrides()
          ?.find((entry: { trackId: string; kind: RaceTrackAudioKind }) => entry.trackId === track.id && entry.kind === kind);
        status.textContent = existing ? `MP3 local: ${existing.fileName}` : 'Nenhum MP3 local configurado.';
        fieldset.append(label, save, remove, status);
      }
      container.append(fieldset);
    }
  }

  private activateTab(name: string, focus = false): void {
    const tabs = [...this.editArea.querySelectorAll<HTMLButtonElement>('[data-dev-tab]')];
    const validName = tabs.some(tab => tab.dataset.devTab === name) ? name : 'vehicles';
    for (const tab of tabs) {
      const selected = tab.dataset.devTab === validName;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
      if (selected && focus) tab.focus();
    }
    for (const panel of this.editArea.querySelectorAll<HTMLElement>('[data-dev-panel]')) {
      panel.hidden = panel.dataset.devPanel !== validName;
    }
  }

  private handleTabKeydown(event: KeyboardEvent): void {
    const current = (event.target as Element | null)?.closest<HTMLButtonElement>('[data-dev-tab]');
    if (!current) return;
    const tabs = [...this.editArea.querySelectorAll<HTMLButtonElement>('[data-dev-tab]')];
    const index = tabs.indexOf(current);
    const next = event.key === 'ArrowRight' ? (index + 1) % tabs.length
      : event.key === 'ArrowLeft' ? (index - 1 + tabs.length) % tabs.length
        : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : -1;
    if (next < 0) return;
    event.preventDefault();
    this.activateTab(tabs[next]!.dataset.devTab ?? 'vehicles', true);
  }

  private renderAIBonusControls(): void {
    const bonus = loadDevRaceAIBonus();
    for (const key of ['botsPercent', 'rivalPercent'] as const) {
      const input = this.editArea.querySelector<HTMLInputElement>(`[data-ai-bonus="${key}"]`);
      const output = this.editArea.querySelector<HTMLOutputElement>(`[data-role="${key === 'botsPercent' ? 'bots' : 'rival'}-bonus-output"]`);
      if (input) input.value = String(bonus[key]);
      if (output) output.value = `${bonus[key]}%`;
    }
  }

  private saveAIBonusFromInput(event: Event): void {
    const input = (event.target as Element | null)?.closest<HTMLInputElement>('[data-ai-bonus]');
    if (!input || !this.token) return;
    const key = input.dataset.aiBonus as 'botsPercent' | 'rivalPercent';
    if (key !== 'botsPercent' && key !== 'rivalPercent') return;
    const current = loadDevRaceAIBonus();
    const updated = saveDevRaceAIBonus({ ...current, [key]: Number(input.value) });
    const outputRole = key === 'botsPercent' ? 'bots' : 'rival';
    const output = this.editArea.querySelector<HTMLOutputElement>(`[data-role="${outputRole}-bonus-output"]`);
    if (output) output.value = `${updated[key]}%`;
    const status = this.editArea.querySelector<HTMLElement>('[data-role="ai-bonus-status"]');
    if (status) status.textContent = `Bots: ${updated.botsPercent}% · Rival: ${updated.rivalPercent}%. Salvo neste navegador; vale na próxima corrida Difícil.`;
  }

  private async handleTrackAudioAction(event: Event): Promise<void> {
    if (this.destroyed || !this.token) return;
    const button = (event.target as Element | null)?.closest<HTMLButtonElement>('[data-track-audio-action]');
    if (!button || !this.editArea.contains(button)) return;
    const trackId = button.dataset.trackAudio;
    const kind = button.dataset.kind as RaceTrackAudioKind | undefined;
    if (!trackId || (kind !== 'music' && kind !== 'announcer')) return;
    const status = this.editArea.querySelector<HTMLElement>(`[data-track-audio-status="${trackId}:${kind}"]`);
    const menuMusic = this.scene.game.menuMusic;
    if (!menuMusic) {
      if (status) status.textContent = 'O armazenamento local de áudio não está disponível.';
      return;
    }
    button.disabled = true;
    try {
      if (button.dataset.trackAudioAction === 'save') {
        const input = this.editArea.querySelector<HTMLInputElement>(`input[data-track-audio-file="${trackId}"][data-track-audio-kind="${kind}"]`);
        const file = input?.files?.[0];
        if (!file) { if (status) status.textContent = 'Selecione um MP3 primeiro.'; return; }
        if (status) status.textContent = 'Salvando neste navegador…';
        const result = await menuMusic.setRaceTrackAudioOverride(trackId, file, kind);
        if (status && result) status.textContent = `MP3 local salvo: ${result.fileName}.`;
        if (input) input.value = '';
      } else {
        if (status) status.textContent = 'Removendo…';
        await menuMusic.setRaceTrackAudioOverride(trackId, null, kind);
        if (status) status.textContent = 'MP3 local removido deste navegador.';
      }
    } catch (error) {
      if (status) status.textContent = error instanceof Error ? error.message : 'Não foi possível atualizar o MP3 local.';
    } finally {
      if (!this.destroyed) button.disabled = false;
    }
  }

  private async save(): Promise<void> {
    if (this.destroyed || this.busy || !this.token || !this.editArea.reportValidity()) return;
    this.busy = true;
    this.saveButton.disabled = true;
    this.status.textContent = 'Salvando atributos no projeto…';
    const vehicles = Object.fromEntries(VEHICLE_TUNING_IDS.map(id => [id,
      Object.fromEntries(VEHICLE_TUNING_FIELDS.map(field => [field, Number(this.inputs.get(`${id}:${field}`)!.value)])),
    ]));
    try {
      await this.request<EditorResponse>('save', { vehicles });
      this.status.textContent = 'Salvo no arquivo versionado. O Vite recarregará o jogo com os novos atributos.';
      // JSON imported by vehicles.ts triggers Vite HMR/full reload. Keep dialog
      // open briefly so confirmation is visible; do not store values in localStorage.
    } catch {
      this.status.textContent = 'Não foi possível salvar. O arquivo do projeto não foi alterado.';
    } finally {
      this.busy = false;
      if (!this.destroyed) this.saveButton.disabled = false;
    }
  }

  private async close(): Promise<void> {
    if (this.destroyed || !this.dialog.open) return;
    if (this.token) await this.request('logout').catch(() => undefined);
    this.token = '';
    this.inputs.clear();
    this.passwordInput.value = '';
    this.passwordArea.hidden = false;
    this.editArea.hidden = true;
    this.activateTab('vehicles');
    this.status.textContent = '';
    this.dialog.close();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.token = '';
    this.passwordArea.removeEventListener('submit', this.onAuth);
    this.editArea.removeEventListener('submit', this.onSave);
    this.editArea.removeEventListener('click', this.onTrackAudioAction);
    this.editArea.removeEventListener('keydown', this.onTabKeydown);
    this.editArea.removeEventListener('input', this.onAIBonusInput);
    this.closeButton.removeEventListener('click', this.onClose);
    this.dialog.removeEventListener('cancel', this.onCancel);
    this.scene.events.off('shutdown', this.onShutdown);
    if (this.dialog.open) this.dialog.close();
    this.dialog.remove();
    styleUsers -= 1;
    if (!styleUsers) document.getElementById(STYLE_ID)?.remove();
  }
}
