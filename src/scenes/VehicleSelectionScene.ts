import { GarageScene } from './GarageScene.ts';
import { MenuButton } from '../ui/MenuButton.ts';
import { COLORS, SCENES, text } from '../ui/theme.ts';
import { getSelectedCharacter } from '../data/characters.ts';
import { VEHICLES, INITIAL_VEHICLES, PAINTS, VEHICLE_ATTRIBUTES, getSelectedVehicle } from '../data/vehicles.ts';
import type Phaser from 'phaser';
import type { Vehicle, VehicleStats } from '../data/vehicles.ts';

type VehicleSelection = { vehicle: Readonly<Vehicle>; paint: (typeof PAINTS)[number] };
type VehicleCard = MenuButton & { soldBadge: Phaser.GameObjects.Text };
type GarageSelectionView = NonNullable<GarageScene['garageView']> & {
  setSelectionStage(stage: 'vehicle' | 'paint', vehicleIndex: number, paintIndex: number): void;
  pick(x: number, y: number): number | null;
  confirm(callback: () => void): void;
};
type VehicleSelectionInit = { tab?: 'shop' | 'garage' };

const credits = (value: number) => `${value.toLocaleString('pt-BR')} CR`;

// The first purchase and the full shop share presentation, not a second wallet.
export class VehicleSelectionScene extends GarageScene {
  declare activeTab: 'shop' | 'garage';
  declare character: ReturnType<typeof getSelectedCharacter>;
  declare selection: VehicleSelection | null;
  declare isShop: boolean;
  declare isGarage: boolean;
  declare options: readonly Readonly<Vehicle>[];
  declare vehicleIndex: number;
  declare paintIndex: number;
  declare stage: 'vehicle' | 'paint';
  declare confirming: boolean;
  declare focusIndex: number;
  declare frame: Phaser.GameObjects.Graphics;
  declare kicker: Phaser.GameObjects.Text;
  declare title: Phaser.GameObjects.Text;
  declare balanceLabel: Phaser.GameObjects.Text;
  declare subtitle: Phaser.GameObjects.Text;
  declare bayLabel: Phaser.GameObjects.Text;
  declare cards: VehicleCard[];
  declare paintCards: VehicleCard[];
  declare statBars: Phaser.GameObjects.Graphics;
  declare statLabels: Phaser.GameObjects.Text[];
  declare statValues: Phaser.GameObjects.Text[];
  declare confirmButton: MenuButton;
  declare backButton: MenuButton;
  declare changeButton: MenuButton;
  declare lockPanel: Phaser.GameObjects.Graphics;
  declare lockLabel: Phaser.GameObjects.Text;
  declare hint: Phaser.GameObjects.Text;
  declare feedback: Phaser.GameObjects.Text;
  declare shopTab: MenuButton;
  declare garageTab: MenuButton;
  declare vehicleDisplayName: string;
  declare selectedIndex: number;

  constructor() { super(SCENES.vehicles); }

  init(data: VehicleSelectionInit = {}) { this.activeTab = data.tab === 'garage' ? 'garage' : 'shop'; }

  create() {
    this.character = getSelectedCharacter(this.registry);
    if (!this.character) { this.scene.start(SCENES.characters); return; }
    if (this.game.championship.state.pendingResult) { this.scene.start(SCENES.results); return; }
    this.selection = getSelectedVehicle(this.registry);
    // A garage tab is an equipment view, even though a selection already
    // exists. Keep purchase-only rules restricted to the actual shop tab.
    this.isShop = this.activeTab === 'shop' && !!this.selection;
    this.isGarage = this.activeTab === 'garage';
    this.options = this.isGarage ? VEHICLES.filter(vehicle => this.game.championship.ownsVehicle(vehicle.id))
      : this.isShop ? VEHICLES : INITIAL_VEHICLES;
    const preferred = this.options.findIndex(vehicle => vehicle.id === this.selection?.vehicle.id);
    this.vehicleIndex = this.isGarage ? (this.options.length ? Math.max(0, preferred) : -1)
      : Math.max(0, preferred);
    this.paintIndex = Math.max(0, PAINTS.findIndex(paint => paint.id === this.selection?.paint.id));
    this.stage = 'vehicle';
    this.confirming = false;
    this.createGarageShell(this.isGarage ? 'Minha garagem. Escolha entre seus veículos adquiridos e equipe sem custo.'
      : this.isShop ? 'Loja de veículos. Carros já vendidos ficam visíveis, mas não podem ser selecionados.'
      : 'Compra inicial. Escolha entre Thunder Bug, Camaro e Armored Car. Saldo inicial: 2.000 créditos.');
    this.focusIndex = this.vehicleIndex >= 0 ? this.vehicleIndex : this.optionCount + 3;
    this.frame = this.add.graphics();
    this.kicker = text(this, 0, 0, this.isGarage ? 'PIT GARAGE / SEUS VEÍCULOS' : this.isShop ? 'PIT MARKET / LOJA DE VEÍCULOS' : '02 / PRIMEIRA COMPRA', 13, '#71f6ff');
    this.title = text(this, 0, 0, '', 32, COLORS.white, true);
    this.balanceLabel = text(this, 0, 0, '', 17, '#71f6ff', true);
    this.subtitle = text(this, 0, 0, '', 12, COLORS.muted);
    this.bayLabel = text(this, 0, 0, '', 12, '#ffb454');
    this.cards = this.options.map((vehicle, index) => this.makeCard(vehicle.name, index, !!vehicle.purchaseLocked));
    this.paintCards = PAINTS.map((paint, index) => this.makeCard(paint.name, index));
    this.statBars = this.add.graphics();
    this.statLabels = VEHICLE_ATTRIBUTES.map(({ label }) => text(this, 0, 0, label, 11, COLORS.muted));
    this.statValues = VEHICLE_ATTRIBUTES.map(() => text(this, 0, 0, '', 17, COLORS.white, true));
    this.confirmButton = new MenuButton(this, {
      label: '', index: '→', width: 330, labelSize: 15,
      onSelect: () => this.focusAction(this.optionCount), onActivate: () => this.confirm(),
    });
    this.confirmButton.detail.setText('ENTER');
    this.backButton = new MenuButton(this, {
      label: '', index: '←', width: 330, labelSize: 14,
      onSelect: () => this.focusAction(this.optionCount + 1), onActivate: () => this.goBack(),
    });
    this.changeButton = this.backButton;
    this.backButton.detail.setText('ESC');
    this.lockPanel = this.add.graphics();
    this.lockLabel = text(this, 0, 0, '', 15, '#ffbf75', true);
    this.hint = text(this, 0, 0, '', 11, COLORS.muted);
    this.feedback = text(this, 0, 0, '', 12, '#ffbf75');
    this.shopTab = new MenuButton(this, { label: 'LOJA', index: '01', width: 255, labelSize: 17,
      onSelect: () => this.focusAction(this.optionCount + 2), onActivate: () => this.switchTab('shop') });
    this.garageTab = new MenuButton(this, { label: 'MINHA GARAGEM', index: '02', width: 255, labelSize: 17,
      onSelect: () => this.focusAction(this.optionCount + 3), onActivate: () => this.switchTab('garage') });
    this.shopTab.detail.setText(''); this.garageTab.detail.setText('');
    this.content.add([this.frame, this.kicker, this.title, this.balanceLabel, this.subtitle, this.bayLabel,
      ...this.cards, ...this.paintCards, this.statBars, ...this.statLabels, ...this.statValues,
      this.lockPanel, this.lockLabel, this.backButton, this.confirmButton, this.hint, this.feedback, this.shopTab, this.garageTab]);
    this.updateSelectionView();
    this.resizeShell();
    if (this.selectedVehicle) this.mountGarage({ mode: 'selection', vehicleId: this.selectedVehicle.id,
      vehicleIds: this.options.map(vehicle => vehicle.id), paintId: this.selectedPaint.id });
    else this.loadingLabel.setText(this.isGarage ? 'NENHUM CARRO ADQUIRIDO / VISITE A LOJA' : 'TODOS JÁ VENDIDOS / ABRA SUA GARAGEM');
    this.input.keyboard!.addCapture(['LEFT', 'RIGHT', 'UP', 'DOWN', 'SPACE', 'TAB']);
    this.input.keyboard!.on('keydown', (event: KeyboardEvent) => {
      event.stopPropagation();
      if (event.repeat || this.transitioning || this.confirming) return;
      const key = event.key.toLowerCase();
      if (key === 'escape') this.goBack();
      else if (['arrowleft', 'a', 'arrowup'].includes(key) && this.focusIndex < this.optionCount) this.moveSelection(-1);
      else if (['arrowright', 'd', 'arrowdown'].includes(key) && this.focusIndex < this.optionCount) this.moveSelection(1);
      else if (key === 'tab') {
        event.preventDefault();
        const stops = [...Array(this.optionCount).keys()].filter(index => this.canSelect(index));
        stops.push(this.optionCount, this.optionCount + 1, this.optionCount + 2, this.optionCount + 3);
        const position = stops.indexOf(this.focusIndex);
        const next = stops[(position + (event.shiftKey ? -1 : 1) + stops.length) % stops.length];
        if (next < this.optionCount) this.select(next); else this.focusAction(next);
      } else if (key === 'enter' || event.code === 'Space') {
        if (this.focusIndex === this.optionCount + 2) this.switchTab('shop');
        else if (this.focusIndex === this.optionCount + 3) this.switchTab('garage');
        else if (this.focusIndex === this.optionCount + 1) this.goBack();
        else this.confirm();
      }
    });
    this.events.once('shutdown', () => this.input.keyboard!.removeCapture(['LEFT', 'RIGHT', 'UP', 'DOWN', 'SPACE', 'TAB']));
  }

  makeCard(label: string, index: number, locked = false): VehicleCard {
    const card = new MenuButton(this, { label, index: String(index + 1).padStart(2, '0'), locked,
      width: 330, labelSize: 17, onSelect: () => this.select(index), onActivate: () => this.select(index) });
    const vehicleCard = card as VehicleCard;
    card.label.setY(-10);
    card.detail.setPosition(-99, 15).setOrigin(0, 0.5).setFontSize(12);
    vehicleCard.soldBadge = text(this, 151, -10, 'JÁ VENDIDO', 11, '#ffcf85', true)
      .setOrigin(1, 0.5).setStyle({ backgroundColor: '#47341e' }).setPadding(6, 4).setVisible(false);
    vehicleCard.add(vehicleCard.soldBadge);
    return vehicleCard;
  }

  get selectedVehicle(): Readonly<Vehicle> | undefined { return this.options[this.vehicleIndex]; }
  get selectedPaint(): (typeof PAINTS)[number] { return PAINTS[this.paintIndex]!; }
  get optionCount() { return this.stage === 'vehicle' ? this.options.length : PAINTS.length; }
  get owned() { return !!this.selectedVehicle && this.game.championship.ownsVehicle(this.selectedVehicle.id); }
  get unavailable() {
    return !this.selectedVehicle || this.selectedVehicle.purchaseLocked || (this.isShop && this.owned)
      || (!this.owned && this.game.championship.state.money < this.selectedVehicle.price!);
  }

  onGarageReady(): void {
    const view = this.garageView as GarageSelectionView;
    view.setSelectionStage(this.stage, this.vehicleIndex, this.paintIndex);
    this.preview!.setInteractive({ useHandCursor: true }).on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (this.confirming || this.transitioning || this.stage !== 'vehicle') return;
      const bounds = this.preview!.getBounds();
      const index = view.pick((pointer.x - bounds.x) / bounds.width, (pointer.y - bounds.y) / bounds.height);
      if (index !== null) this.select(index);
    });
    this.updateSelectionView();
    this.announceSelection();
  }

  onGarageError(): void { this.showFeedback('Preview 3D indisponível. A loja continua disponível.'); }

  updateSelectionView() {
    const vehicle = this.selectedVehicle;
    const state = this.game.championship.state;
    this.vehicleDisplayName = vehicle?.name ?? '';
    this.title.setText(vehicle?.name ?? (this.isGarage ? 'SUA GARAGEM ESTÁ VAZIA' : 'VEÍCULOS JÁ ADQUIRIDOS'));
    this.balanceLabel.setText(`SEU SALDO / ${credits(state.money)}`);
    this.selectedIndex = this.stage === 'vehicle' ? this.vehicleIndex : this.paintIndex;
    this.subtitle.setText(this.stage === 'vehicle'
       ? !vehicle ? 'USE AS ABAS ACIMA PARA CONTINUAR' : this.isGarage ? 'SEU VEÍCULO / EQUIPAR SEM CUSTO' : `PREÇO / ${credits(vehicle.price!)}   •   COMPRA ÚNICA`
      : `COR DA EQUIPE / ${this.selectedPaint.name}   •   TEXTURA ORIGINAL DO MODELO PRESERVADA`);
    this.bayLabel.setText(!vehicle ? (this.isGarage ? 'SEUS CARROS / 0 ADQUIRIDOS' : 'CARROS JÁ ADQUIRIDOS')
      : this.stage === 'vehicle' ? `MODELO ${this.vehicleIndex + 1} / ${this.options.length}` : 'PERSONALIZAÇÃO / COR DA EQUIPE');
    this.cards.forEach((card, index) => {
      const item = this.options[index];
      const owned = this.game.championship.ownsVehicle(item.id);
      const sold = this.isShop && owned;
      card.locked = !!item.purchaseLocked || sold;
      (card as VehicleCard).soldBadge.setVisible(sold);
      if (sold) card.disableInteractive();
      card.setVisible(this.stage === 'vehicle');
      card.detail.setText(item.purchaseLocked ? `${credits(item.price!)} / FASE 2`
        : sold ? 'DISPONÍVEL NA SUA GARAGEM' : owned ? (item.id === this.selection?.vehicle.id ? 'EQUIPADO / SEM CUSTO' : 'ADQUIRIDO / EQUIPAR') : `${credits(item.price!)}${state.money < item.price! ? ' / SEM SALDO' : ''}`);
    });
    this.paintCards.forEach((card, index) => {
      card.setVisible(this.stage === 'paint');
      card.detail.setText('COR DA EQUIPE').setColor(PAINTS[index].color);
    });
    this.statValues.forEach((label, index) => label.setText(vehicle ? `${vehicle.stats[VEHICLE_ATTRIBUTES[index].key as keyof VehicleStats]} / 100` : '—'));
    this.confirmButton.locked = !!this.unavailable;
    this.confirmButton.label.setText(!vehicle ? 'ESCOLHA OUTRA ABA' : vehicle.purchaseLocked ? 'BLOQUEADO / FASE 2'
      : this.unavailable ? 'SALDO INSUFICIENTE' : this.stage === 'vehicle' ? 'COR DA EQUIPE'
        : this.owned ? 'EQUIPAR VEÍCULO' : 'COMPRAR E EQUIPAR');
    this.backButton.label.setText(this.stage === 'paint' ? 'VOLTAR AOS CARROS' : this.selection ? 'VOLTAR À EQUIPE' : 'TROCAR PILOTO');
    this.hint.setText('← →  ESCOLHER    TAB  AÇÕES    ENTER  CONFIRMAR    ESC  VOLTAR');
    this.lockLabel.setText(vehicle?.purchaseLocked ? 'BLOQUEADO\nCHEFÃO DA FASE 2\nAINDA NÃO LIBERADO' : '');
    this.updateActions();
    (this.garageView as GarageSelectionView | null)?.setSelectionStage(this.stage, this.vehicleIndex, this.paintIndex);
    if (this.previewBounds) this.layout(this.scale.width, this.scale.height);
  }

  announceSelection() {
    if (!this.selectedVehicle) {
      this.announce(this.isGarage ? 'Minha garagem vazia. Compre seu primeiro carro na aba Loja.' : 'Todos esses carros já foram adquiridos. Abra a aba Minha Garagem.');
      return;
    }
    this.announce(`${this.isGarage ? 'Minha garagem' : this.isShop ? 'Loja' : 'Compra inicial'}. ${this.selectedVehicle.name}. ${this.owned ? 'Adquirido. Equipar sem custo.'
      : `Preço ${credits(this.selectedVehicle.price!)}.`} Saldo ${credits(this.game.championship.state.money)}. ${this.selectedVehicle.purchaseLocked
      ? this.selectedVehicle.unlockMessage ?? '' : this.unavailable ? 'Saldo insuficiente.' : 'Enter para continuar.'}`);
  }

  select(index: number): void {
    if (this.transitioning || this.confirming) return;
    const next = (index + this.optionCount) % this.optionCount;
    if (!this.canSelect(next)) return;
    if (this.stage === 'vehicle') this.vehicleIndex = next; else this.paintIndex = next;
    this.focusIndex = next;
    this.feedback.setText('');
    this.updateSelectionView();
    this.announceSelection();
  }

  canSelect(index: number): boolean {
    return this.stage === 'paint' ? !!PAINTS[index] : !!this.options[index]
      && (!this.isShop || !this.game.championship.ownsVehicle(this.options[index].id));
  }

  moveSelection(direction: number): void {
    for (let step = 1; step <= this.optionCount; step++) {
      const index = (this.focusIndex + step * direction + this.optionCount) % this.optionCount;
      if (this.canSelect(index)) { this.select(index); return; }
    }
  }

  switchTab(tab: 'shop' | 'garage'): void {
    if (this.confirming || this.transitioning || tab === this.activeTab) return;
    // Restarting this same scene uses the existing asynchronous-load invalidation
    // and resource cleanup; the shared model cache/renderer remains game-owned.
    this.transitioning = true;
    this.scene.restart({ tab });
  }

  focusAction(index: number): void {
    if (this.transitioning || this.confirming) return;
    this.focusIndex = index;
    this.updateActions();
  }

  updateActions() {
    const cards = this.stage === 'vehicle' ? this.cards : this.paintCards;
    cards.forEach((card, index) => card.setSelected(this.focusIndex === index));
    this.confirmButton.setSelected(this.focusIndex === this.optionCount);
    this.backButton.setSelected(this.focusIndex === this.optionCount + 1);
    this.shopTab.setSelected(this.focusIndex === this.optionCount + 2 || !this.isGarage);
    this.garageTab.setSelected(this.focusIndex === this.optionCount + 3 || this.isGarage);
  }

  showFeedback(message: string): void { this.feedback.setText(message); this.announce(message); }

  confirm() {
    if (this.transitioning || this.confirming) return;
    if (this.focusIndex === this.optionCount + 2 || this.focusIndex === this.optionCount + 3) return;
    const vehicle = this.selectedVehicle;
    if (!vehicle || (this.isShop && this.owned)) return;
    if (this.unavailable) {
      this.showFeedback(vehicle.purchaseLocked ? vehicle.unlockMessage ?? '' : `Faltam ${credits(vehicle.price! - this.game.championship.state.money)} para comprar.`);
      return;
    }
    if (this.game.championship.state.activeRace) {
      this.showFeedback('Conclua a corrida em andamento antes de trocar de veículo.');
      return;
    }
    if (this.stage === 'vehicle') {
      this.stage = 'paint'; this.focusIndex = this.paintIndex;
      this.updateSelectionView();
      return;
    }
    if (!this.owned && !window.confirm(`COMPRAR ${vehicle.name}?\n\nPreço: ${credits(vehicle.price!)}\nSaldo após a compra: ${credits(this.game.championship.state.money - vehicle.price!)}\n\nO carro ficará na sua garagem. Confirmar compra?`)) {
      this.showFeedback('Compra cancelada. Seus créditos foram preservados.');
      return;
    }
    const alreadyEquipped = this.owned && this.selection?.vehicle.id === vehicle.id && this.selection.paint.id === this.selectedPaint.id;
    if (!alreadyEquipped && !this.game.championship.purchaseVehicle(vehicle.id, this.selectedPaint.id)) {
      this.showFeedback(this.game.championship.warning ?? 'Não foi possível concluir a compra. Nenhum crédito foi gasto.');
      return;
    }
    this.updateSelectionView();
    this.feedback.setText('VEÍCULO EQUIPADO / PROGRESSO SALVO');
    this.confirming = true;
    this.confirmButton.label.setText('VEÍCULO EQUIPADO');
    this.announce(`${vehicle.name} equipado. Compra salva. Indo à estação de equipe.`);
    if (this.garageView) (this.garageView as GarageSelectionView).confirm(() => this.goTo(SCENES.preparation));
    else this.goTo(SCENES.preparation);
  }

  goBack() {
    if (this.stage === 'paint') {
      this.stage = 'vehicle'; this.focusIndex = this.vehicleIndex;
      this.updateSelectionView(); this.announceSelection();
    } else this.goTo(this.isShop ? SCENES.preparation : SCENES.characters);
  }

  goTo(key: string): void {
    if (this.confirming && key !== SCENES.preparation) return;
    super.goTo(key);
  }

  layout(w: number, h: number): void {
    const narrow = w < 700 && w < h;
    const compact = !narrow && h < 600;
    this.fitContent(w, h, narrow ? 620 : 1200, narrow ? 1210 : compact ? 720 : 860);
    const tabsY = narrow ? -570 : compact ? -340 : -400;
    this.shopTab.setPosition(-143, tabsY).setScale(0.9);
    this.garageTab.setPosition(143, tabsY).setScale(0.9);
    this.kicker.setPosition(0, narrow ? -502 : compact ? -296 : -350);
    this.title.setPosition(narrow ? 0 : -205, narrow ? -454 : compact ? -250 : -297).setFontSize(narrow ? 30 : 32);
    this.balanceLabel.setPosition(narrow ? 0 : 410, narrow ? -411 : compact ? -250 : -297).setFontSize(narrow ? 17 : 16);
    this.subtitle.setPosition(narrow ? 0 : -195, narrow ? -374 : compact ? -214 : -257).setFontSize(11);
    const preview: [number, number, number, number] = narrow ? [0, -190, 580, 310] : compact ? [-190, -57, 790, 280] : [-190, -34, 790, 390];
    this.setPreviewBounds(...preview);
    const [x, y, width, height] = preview;
    this.frame.clear().lineStyle(1, 0x365470, 0.9).strokeRect(x - width / 2, y - height / 2, width, height);
    this.bayLabel.setPosition(x - width / 2 + 12, y - height / 2 + 17).setOrigin(0, 0.5);
    const cards = this.stage === 'vehicle' ? this.cards : this.paintCards;
    cards.forEach((card, index) => {
      card.setPosition(narrow ? ((index % 2) - 0.5) * 304 : 410,
        narrow ? 20 + Math.floor(index / 2) * 82 : (compact ? -157 : -193) + index * (compact ? 74 : 85));
      card.setScale(narrow ? 0.86 : compact ? 0.8 : 0.9);
      card.label.setFontSize(card.soldBadge.visible ? 15 : narrow ? 22 : 17);
      card.detail.setFontSize(narrow ? 14 : 12);
    });
    this.statBars.clear();
    VEHICLE_ATTRIBUTES.forEach(({ key }, i) => {
      const sx = narrow ? (i % 2 - 0.5) * 292 : (i - 1.5) * 285;
      const sy = narrow ? 285 + Math.floor(i / 2) * 85 : compact ? 142 : 229;
      this.statLabels[i].setPosition(sx, sy - 22);
      this.statValues[i].setPosition(sx, sy);
      const bw = narrow ? 232 : 220;
      this.statBars.fillStyle(0x23354a).fillRect(sx - bw / 2, sy + 20, bw, 5);
      this.statBars.fillStyle(Number.parseInt(this.selectedPaint.color.slice(1), 16))
         .fillRect(sx - bw / 2, sy + 20, bw * (this.selectedVehicle?.stats[key as keyof VehicleStats] ?? 0) / 100, 5);
    });
    this.lockPanel.clear();
    if (this.selectedVehicle?.purchaseLocked) {
      this.lockPanel.fillStyle(0x080e1a, 0.94).fillRoundedRect(x - 160, y - 54, 320, 108, 8)
        .lineStyle(2, 0xffbf75).strokeRoundedRect(x - 160, y - 54, 320, 108, 8);
      // Draw a padlock rather than relying on font support for a lock glyph.
      this.lockPanel.lineStyle(3, 0xffbf75).strokeRoundedRect(x - 139, y - 3, 26, 25, 3)
        .strokeRoundedRect(x - 134, y - 20, 16, 22, 7);
    }
    this.lockLabel.setPosition(x + 15, y).setFontSize(14);
    const actionY = narrow ? 465 : compact ? 235 : 323;
    this.backButton.setPosition(-174, actionY).setScale(narrow ? 0.9 : 1);
    this.confirmButton.setPosition(174, actionY).setScale(narrow ? 0.9 : 1);
    this.feedback.setPosition(0, narrow ? 538 : compact ? 289 : 387).setWordWrapWidth(narrow ? 580 : 1120);
    this.hint.setPosition(0, narrow ? 511 : compact ? 193 : 280).setFontSize(narrow ? 11 : 12);
    this.loadingLabel.setPosition(x, y + height / 2 - 13).setFontSize(9);
  }
}
