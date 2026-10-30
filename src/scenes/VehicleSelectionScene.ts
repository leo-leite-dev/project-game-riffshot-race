import { GarageScene } from './GarageScene.ts';
import { MenuButton } from '../ui/MenuButton.ts';
import { COLORS, SCENES, text } from '../ui/theme.ts';
import { getSelectedCharacter } from '../data/characters.ts';
import { VEHICLES, INITIAL_VEHICLES, PAINTS, VEHICLE_ATTRIBUTES, getSelectedVehicle } from '../data/vehicles.ts';
import type Phaser from 'phaser';
import type { Vehicle, VehicleStats } from '../data/vehicles.ts';

type VehicleSelection = { vehicle: Readonly<Vehicle>; paint: (typeof PAINTS)[number] };
type VehicleCard = MenuButton & { soldBadge: Phaser.GameObjects.Text; thumbnail?: Phaser.GameObjects.Image };
type GarageSelectionView = NonNullable<GarageScene['garageView']> & {
  setSelectionStage(stage: 'vehicle' | 'paint', vehicleIndex: number, paintIndex: number): void;
  captureVehicleThumbnails(width?: number, height?: number): HTMLCanvasElement[];
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
  declare displayVehicles: readonly Readonly<Vehicle>[];
  declare vehicleIndex: number;
  declare paintIndex: number;
  declare stage: 'vehicle' | 'paint';
  declare confirming: boolean;
  declare focusIndex: number;
  declare frame: Phaser.GameObjects.Graphics;
  declare panelArt: Phaser.GameObjects.Graphics;
  declare purchaseIcon: Phaser.GameObjects.Graphics;
  declare kicker: Phaser.GameObjects.Text;
  declare logo: Phaser.GameObjects.Text;
  declare logoRace: Phaser.GameObjects.Text;
  declare balanceTitle: Phaser.GameObjects.Text;
  declare saveNoticeLocal: Phaser.GameObjects.Text;
  declare title: Phaser.GameObjects.Text;
  declare balanceLabel: Phaser.GameObjects.Text;
  declare subtitle: Phaser.GameObjects.Text;
  declare bayLabel: Phaser.GameObjects.Text;
  declare cards: VehicleCard[];
  declare paintCards: VehicleCard[];
  declare statBars: Phaser.GameObjects.Graphics;
  declare statLabels: Phaser.GameObjects.Text[];
  declare statValues: Phaser.GameObjects.Text[];
  declare statIcons: Phaser.GameObjects.Graphics[];
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
  declare thumbnailKeys: string[];
  declare attributeOrder: (typeof VEHICLE_ATTRIBUTES)[number][];

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
    this.thumbnailKeys = [];
    this.options = this.isGarage ? VEHICLES.filter(vehicle => this.game.championship.ownsVehicle(vehicle.id))
      : this.isShop ? VEHICLES : INITIAL_VEHICLES;
    // A new career starts with only the three initial cars. Show the full five-
    // vehicle shop catalogue only after an equipped vehicle has opened the shop.
    this.displayVehicles = this.isShop ? VEHICLES : this.options;
    const preferred = this.options.findIndex(vehicle => vehicle.id === this.selection?.vehicle.id);
    const firstAvailableShopCar = this.isShop
      ? this.options.findIndex(vehicle => !vehicle.purchaseLocked && !this.game.championship.ownsVehicle(vehicle.id)) : -1;
    this.vehicleIndex = this.isGarage ? (this.options.length ? Math.max(0, preferred) : -1)
      : Math.max(0, this.isShop && preferred >= 0 && this.game.championship.ownsVehicle(this.options[preferred]!.id)
        && firstAvailableShopCar >= 0 ? firstAvailableShopCar : preferred);
    this.paintIndex = Math.max(0, PAINTS.findIndex(paint => paint.id === this.selection?.paint.id));
    this.stage = 'vehicle';
    this.confirming = false;
    this.createGarageShell(this.isGarage ? 'Minha garagem. Escolha entre seus veículos adquiridos e equipe sem custo.'
      : this.isShop ? 'Loja de veículos. Carros já vendidos ficam visíveis, mas não podem ser selecionados.'
      : 'Compra inicial. Escolha entre Thunder Bug, Camaro e Armored Car. Saldo inicial: 2.000 créditos.');
    for (const item of [this.chrome, this.brand, this.edition, this.system, this.footerLeft, this.footerRight]) item.setVisible(false);
    this.focusIndex = this.vehicleIndex >= 0 ? this.vehicleIndex : this.optionCount + 3;
    this.frame = this.add.graphics();
    this.panelArt = this.add.graphics();
    this.purchaseIcon = this.add.graphics();
    this.logo = text(this, 0, 0, 'RIFFSHOT', 32, COLORS.white, true).setOrigin(0, 0.5);
    this.logoRace = text(this, 0, 0, 'RACING', 18, '#ff3149', true).setOrigin(0, 0.5);
    this.kicker = text(this, 0, 0, this.isGarage ? 'PIT GARAGE / SEUS VEÍCULOS' : this.isShop ? 'PIT MARKET / LOJA DE VEÍCULOS' : '02 / PRIMEIRA COMPRA', 14, '#71f6ff');
    this.title = text(this, 0, 0, '', 50, COLORS.white, true).setOrigin(0, 0.5);
    this.balanceTitle = text(this, 0, 0, 'SEU SALDO', 11, '#a9bbc7', true);
    this.balanceLabel = text(this, 0, 0, '', 23, '#71f6ff', true);
    this.subtitle = text(this, 0, 0, '', 17, '#aebdca');
    this.bayLabel = text(this, 0, 0, '', 14, '#ffcf58', true);
    this.saveNoticeLocal = text(this, 0, 0, '', 13, '#ffc878').setVisible(false);
    this.cards = this.displayVehicles.map((vehicle, index) => this.makeCard(vehicle.name, index,
      !!vehicle.purchaseLocked || (!this.selection && this.activeTab === 'shop' && !vehicle.initialSelection)));
    this.paintCards = PAINTS.map((paint, index) => this.makeCard(paint.name, index));
    this.statBars = this.add.graphics();
    this.attributeOrder = ['speed', 'acceleration', 'control', 'armor', 'suspension', 'tires']
      .map(key => VEHICLE_ATTRIBUTES.find(attribute => attribute.key === key)!).filter(Boolean);
    this.statLabels = this.attributeOrder.map(({ label }) => text(this, 0, 0, label, 12, '#a8c0d0', true).setOrigin(0, 0.5));
    this.statValues = this.attributeOrder.map(() => text(this, 0, 0, '', 20, COLORS.white, true));
    this.statIcons = this.attributeOrder.map(() => this.add.graphics());
    this.confirmButton = new MenuButton(this, {
      label: '', index: '▣', width: 560, labelSize: 21,
      onSelect: () => this.focusAction(this.optionCount), onActivate: () => this.confirm(),
    });
    this.confirmButton.detail.setText('ENTER');
    this.confirmButton.number.setVisible(false);
    this.backButton = new MenuButton(this, {
      label: '', index: '←', width: 560, labelSize: 20,
      onSelect: () => this.focusAction(this.optionCount + 1), onActivate: () => this.goBack(),
    });
    this.changeButton = this.backButton;
    this.backButton.detail.setText('ESC');
    this.lockPanel = this.add.graphics();
    this.lockLabel = text(this, 0, 0, '', 15, '#ffbf75', true);
    this.hint = text(this, 0, 0, '', 11, COLORS.muted);
    this.feedback = text(this, 0, 0, '', 12, '#ffbf75');
    this.shopTab = new MenuButton(this, { label: 'LOJA', index: '01', width: 300, labelSize: 20,
      onSelect: () => this.focusAction(this.optionCount + 2), onActivate: () => this.switchTab('shop') });
    this.garageTab = new MenuButton(this, { label: 'MINHA GARAGEM', index: '02', width: 340, labelSize: 17,
      onSelect: () => this.focusAction(this.optionCount + 3), onActivate: () => this.switchTab('garage') });
    this.shopTab.detail.setText(''); this.garageTab.detail.setText('');
    this.shopTab.number.setVisible(false); this.garageTab.number.setVisible(false);
    this.shopTab.label.setPosition(12, 0).setOrigin(0.5, 0.5);
    this.garageTab.label.setPosition(8, 0).setOrigin(0.5, 0.5);
    this.content.add([this.frame, this.panelArt, this.logo, this.logoRace, this.kicker, this.title,
      this.balanceTitle, this.balanceLabel, this.subtitle, this.bayLabel, this.saveNoticeLocal,
      ...this.cards, ...this.paintCards, this.statBars, ...this.statIcons, ...this.statLabels, ...this.statValues, this.purchaseIcon,
      this.lockPanel, this.lockLabel, this.backButton, this.confirmButton, this.hint, this.feedback, this.shopTab, this.garageTab]);
    this.updateSelectionView();
    this.resizeShell();
    if (this.selectedVehicle) this.mountGarage({ mode: 'selection', vehicleId: this.selectedVehicle.id,
      vehicleIds: this.displayVehicles.map(vehicle => vehicle.id), paintId: this.selectedPaint.id });
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
    this.events.once('shutdown', () => {
      this.input.keyboard!.removeCapture(['LEFT', 'RIGHT', 'UP', 'DOWN', 'SPACE', 'TAB']);
      for (const key of this.thumbnailKeys) if (this.textures.exists(key)) this.textures.remove(key);
      this.thumbnailKeys = [];
    });
  }

  makeCard(label: string, index: number, locked = false): VehicleCard {
    const card = new MenuButton(this, { label, index: String(index + 1).padStart(2, '0'), locked,
      width: 520, labelSize: 18, onSelect: () => this.select(index), onActivate: () => this.select(index) });
    const vehicleCard = card as VehicleCard;
    card.label.setY(-15).setWordWrapWidth(295);
    card.detail.setPosition(-194, 16).setOrigin(0, 0.5).setFontSize(12);
    vehicleCard.soldBadge = text(this, 111, -14, 'JÁ VENDIDO', 9, '#ffcf85', true)
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
    let thumbnails: HTMLCanvasElement[] = [];
    try { thumbnails = view.captureVehicleThumbnails(); } catch { /* Text/card layout remains functional if thumbnail capture fails. */ }
    thumbnails.forEach((canvas, index) => {
      const key = `${this.scene.key}-vehicle-thumbnail-${index}`;
      if (this.textures.exists(key)) this.textures.remove(key);
      this.textures.addCanvas(key, canvas);
      this.thumbnailKeys.push(key);
      const card = this.cards[index];
      if (!card) return;
      const image = this.add.image(0, 0, key).setDisplaySize(116, 66);
      image.setPosition(card.buttonWidth / 2 - 68, -1);
      image.setAlpha(0.96);
      card.add(image);
      card.thumbnail = image;
    });
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
    this.balanceLabel.setText(credits(state.money));
    this.selectedIndex = this.stage === 'vehicle' ? this.vehicleIndex : this.paintIndex;
    this.subtitle.setText(this.stage === 'vehicle'
       ? !vehicle ? 'USE AS ABAS ACIMA PARA CONTINUAR' : this.isGarage ? 'SEU VEÍCULO / EQUIPAR SEM CUSTO'
         : vehicle.purchaseLocked ? `${credits(vehicle.price!)} / DESBLOQUEIO FUTURO`
           : this.owned ? 'DISPONÍVEL NA SUA GARAGEM / SEM CUSTO' : `PREÇO / ${credits(vehicle.price!)}   •   COMPRA ÚNICA`
      : `COR DA EQUIPE / ${this.selectedPaint.name}   •   TEXTURA ORIGINAL DO MODELO PRESERVADA`);
    const catalogIndex = vehicle ? VEHICLES.findIndex(item => item.id === vehicle.id) : -1;
    this.bayLabel.setText(!vehicle ? (this.isGarage ? 'SEUS CARROS / 0 ADQUIRIDOS' : 'CARROS JÁ ADQUIRIDOS')
      : this.stage === 'vehicle' ? `MODELO ${String(catalogIndex + 1).padStart(2, '0')} / ${VEHICLES.length}` : 'PERSONALIZAÇÃO / COR DA EQUIPE');
    this.cards.forEach((card, index) => {
      const item = this.displayVehicles[index];
      const owned = this.game.championship.ownsVehicle(item.id);
      const sold = this.isShop && owned;
      const initialOnly = !this.selection && this.activeTab === 'shop' && !item.initialSelection;
      card.locked = !!item.purchaseLocked || sold || initialOnly;
      (card as VehicleCard).soldBadge.setVisible(sold);
      if (sold || initialOnly) card.disableInteractive(); else card.setInteractive({ useHandCursor: true });
      card.setVisible(this.stage === 'vehicle');
      card.detail.setText(item.purchaseLocked ? `${credits(item.price!)} / FASE 2`
        : initialOnly ? `${credits(item.price!)} / APÓS COMPRA INICIAL`
        : sold ? 'DISPONÍVEL NA SUA GARAGEM' : owned ? (item.id === this.selection?.vehicle.id ? 'EQUIPADO / SEM CUSTO' : 'ADQUIRIDO / EQUIPAR') : `${credits(item.price!)}${state.money < item.price! ? ' / SEM SALDO' : ''}`);
      card.thumbnail?.setAlpha(this.stage === 'vehicle' ? (sold ? 0.66 : item.purchaseLocked ? 0.58 : 0.96) : 0);
    });
    this.paintCards.forEach((card, index) => {
      card.setVisible(this.stage === 'paint');
      card.detail.setText('COR DA EQUIPE').setColor(PAINTS[index].color);
    });
     this.statValues.forEach((label, index) => label.setText(vehicle
       ? `${vehicle.stats[this.attributeOrder[index]!.key as keyof VehicleStats] ?? '—'} / 100` : '—'));
    this.confirmButton.locked = !!this.unavailable;
    this.confirmButton.label.setText(!vehicle ? 'ESCOLHA OUTRA ABA' : vehicle.purchaseLocked ? 'BLOQUEADO / FASE 2'
      : this.unavailable ? 'SALDO INSUFICIENTE' : this.stage === 'vehicle' ? 'COR DA EQUIPE'
        : this.owned ? 'EQUIPAR VEÍCULO' : 'COMPRAR E EQUIPAR');
    this.backButton.label.setText(this.stage === 'paint' ? 'VOLTAR AOS CARROS' : this.selection ? 'VOLTAR À EQUIPE' : 'TROCAR PILOTO');
    this.confirmButton.label.setText(this.stage === 'paint'
      ? this.owned ? 'EQUIPAR VEÍCULO' : 'COMPRAR VEÍCULO'
      : 'ESCOLHER PINTURA');
    this.hint.setText('←  →  ESCOLHER        TAB  AÇÕES        ENTER  CONFIRMAR        ESC  VOLTAR');
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
    this.cards.forEach((card, index) => this.styleVehicleCard(card,
      this.stage === 'vehicle' && index === this.vehicleIndex));
    this.paintCards.forEach((card, index) => this.styleVehicleCard(card,
      this.stage === 'paint' && index === this.paintIndex, PAINTS[index]!.color));
    this.styleTab(this.shopTab, !this.isGarage);
    this.styleTab(this.garageTab, this.isGarage);
    this.styleAction(this.backButton, false, this.focusIndex === this.optionCount + 1);
    this.styleAction(this.confirmButton, true, this.focusIndex === this.optionCount);
  }

  private styleVehicleCard(card: VehicleCard, active: boolean, paintColor = '#ff344b'): void {
    card.setSelected(active);
    const g = card.background, half = card.buttonWidth / 2, accent = Number.parseInt(paintColor.slice(1), 16);
    g.clear();
    const outline = [{ x: -half + 16, y: -38 }, { x: half - 15, y: -38 }, { x: half, y: -23 },
      { x: half, y: 23 }, { x: half - 15, y: 38 }, { x: -half + 10, y: 38 },
      { x: -half, y: 28 }, { x: -half, y: -25 }];
    if (active) g.fillStyle(accent, 0.13).fillPoints(outline, true);
    else g.fillStyle(0x06101a, 0.91).fillPoints(outline, true);
    g.lineStyle(active ? 3 : 1.5, active ? accent : 0x4a6474, active ? 1 : 0.78).strokePoints(outline, true);
    g.lineStyle(active ? 4 : 2, active ? accent : 0x16c5df, active ? 0.42 : 0.6)
      .lineBetween(-half + 16, -38, half - 26, -38)
      .lineBetween(-half, -25, -half, 12);
    g.lineStyle(1, 0x8ea6b3, 0.24).lineBetween(-half + 55, -27, -half + 55, 27);
    card.number.setColor(active ? '#ff4055' : '#9db2c0').setFontSize(16);
    card.label.setColor(card.locked ? '#8395a2' : active ? '#fff4ed' : '#e8f0f5');
    card.detail.setColor(active ? '#ffd6d6' : '#9bb0be');
  }

  private styleTab(button: MenuButton, active: boolean): void {
    button.setSelected(active);
    const g = button.background, half = button.buttonWidth / 2;
    const red = active, accent = red ? 0xff3349 : 0x21bfdc;
    const points = [{ x: -half + 14, y: -35 }, { x: half - 14, y: -35 }, { x: half, y: -21 },
      { x: half, y: 21 }, { x: half - 14, y: 35 }, { x: -half + 14, y: 35 }, { x: -half, y: 21 }, { x: -half, y: -21 }];
    g.clear().fillStyle(active ? 0x321018 : 0x07111c, 0.95).fillPoints(points, true)
      .lineStyle(active ? 3 : 1.5, accent, active ? 1 : 0.72).strokePoints(points, true)
      .lineStyle(active ? 4 : 2, accent, active ? 0.45 : 0.5).lineBetween(-half + 18, -35, half - 22, -35);
    button.label.setColor(active ? '#fff5f1' : '#a9bdca');
    button.number.setColor(active ? '#ff4055' : '#31c5df');
  }

  private styleAction(button: MenuButton, purchase: boolean, focused: boolean): void {
    const accent = purchase ? 0xff3048 : 0x22c8e0;
    const g = button.background, half = button.buttonWidth / 2;
    const outline = [{ x: -half + 20, y: -38 }, { x: half - 20, y: -38 }, { x: half, y: -18 },
      { x: half - 8, y: 31 }, { x: half - 20, y: 40 }, { x: -half + 20, y: 40 },
      { x: -half, y: 25 }, { x: -half, y: -20 }];
    g.clear().fillStyle(purchase ? 0x2d0b14 : 0x08121b, focused ? 0.96 : 0.9).fillPoints(outline, true)
      .lineStyle(focused ? 3 : 2, button.locked ? 0x748593 : accent, focused ? 1 : 0.82).strokePoints(outline, true)
      .lineStyle(4, accent, focused ? 0.58 : 0.32).lineBetween(-half + 23, -38, half - 38, -38);
    button.label.setColor(button.locked ? '#8797a2' : purchase ? '#fff3ed' : '#e6f6fa');
    button.number.setColor(`#${accent.toString(16).padStart(6, '0')}`);
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
    } else this.goTo(this.selection ? SCENES.preparation : SCENES.characters);
  }

  goTo(key: string): void {
    if (this.confirming && key !== SCENES.preparation) return;
    super.goTo(key);
  }

  private drawAttributeIcon(g: Phaser.GameObjects.Graphics, key: string, x: number, y: number, size: number): void {
    g.clear().lineStyle(2.2, 0xd6e8f0, 0.92).fillStyle(0x07111a, 0.1);
    if (key === 'speed') {
      g.beginPath().arc(x, y + 4, size * 0.34, Math.PI, Math.PI * 2, false).strokePath()
        .lineBetween(x, y + 4, x + size * 0.22, y - size * 0.2).fillCircle(x, y + 4, 2.5);
      for (let i = 0; i < 5; i += 1) {
        const angle = Math.PI + i * Math.PI / 4;
        g.lineBetween(x + Math.cos(angle) * size * 0.28, y + 4 + Math.sin(angle) * size * 0.28,
          x + Math.cos(angle) * size * 0.37, y + 4 + Math.sin(angle) * size * 0.37);
      }
    } else if (key === 'acceleration') {
      for (let i = 0; i < 3; i += 1) g.beginPath().moveTo(x - 10 + i * 7, y - 11)
        .lineTo(x + 1 + i * 7, y).lineTo(x - 10 + i * 7, y + 11).strokePath();
    } else if (key === 'control') {
      g.strokeCircle(x, y, size * 0.34).strokeCircle(x, y, 3.5)
        .lineBetween(x, y - size * 0.3, x, y + 3).lineBetween(x - size * 0.28, y - 2, x - 2, y + 4)
        .lineBetween(x + size * 0.28, y - 2, x + 2, y + 4);
    } else if (key === 'armor') {
      g.beginPath().moveTo(x, y - size * 0.38).lineTo(x + size * 0.32, y - size * 0.23)
        .lineTo(x + size * 0.25, y + size * 0.18).lineTo(x, y + size * 0.38)
        .lineTo(x - size * 0.25, y + size * 0.18).lineTo(x - size * 0.32, y - size * 0.23)
        .closePath().strokePath().lineBetween(x - 6, y, x - 1, y + 6).lineBetween(x - 1, y + 6, x + 8, y - 6);
    } else if (key === 'suspension') {
      g.lineBetween(x - 9, y - 15, x + 9, y - 15).lineBetween(x - 9, y + 15, x + 9, y + 15)
        .beginPath().moveTo(x, y - 13).lineTo(x - 6, y - 8).lineTo(x + 6, y - 3).lineTo(x - 6, y + 2)
        .lineTo(x + 6, y + 7).lineTo(x, y + 13).strokePath();
    } else {
      g.strokeCircle(x, y, size * 0.35).strokeCircle(x, y, size * 0.17)
        .lineBetween(x - size * 0.35, y, x + size * 0.35, y).lineBetween(x, y - size * 0.35, x, y + size * 0.35);
    }
  }

  private drawVehiclePanel(): void {
    const w = 1680, h = 900;
    const g = this.frame.clear();
    // Cockpit header and outer edge treatment; Three.js showroom remains the
    // actual full-screen background underneath all interface panels.
    g.lineStyle(2, 0x15b9db, 0.28).lineBetween(-w / 2 + 22, -h / 2 + 62, w / 2 - 22, -h / 2 + 62)
      .lineBetween(-w / 2 + 22, h / 2 - 24, w / 2 - 22, h / 2 - 24)
      .lineStyle(3, 0xff3148, 0.78).lineBetween(-w / 2 + 25, -h / 2 + 62, -w / 2 + 210, -h / 2 + 62)
      .lineStyle(2, 0x19c7e2, 0.68).lineBetween(w / 2 - 210, h / 2 - 24, w / 2 - 26, h / 2 - 24);
    const art = this.panelArt.clear();
    const panel = (x: number, y: number, width: number, height: number, accent: number, fill = 0x07111a) => {
      const points = [{ x: x - width / 2 + 14, y: y - height / 2 }, { x: x + width / 2 - 14, y: y - height / 2 },
        { x: x + width / 2, y: y - height / 2 + 14 }, { x: x + width / 2, y: y + height / 2 - 14 },
        { x: x + width / 2 - 14, y: y + height / 2 }, { x: x - width / 2 + 14, y: y + height / 2 },
        { x: x - width / 2, y: y + height / 2 - 14 }, { x: x - width / 2, y: y - height / 2 + 14 }];
      art.fillStyle(0x000000, 0.42).fillPoints(points.map(point => ({ x: point.x + 4, y: point.y + 5 })), true)
        .fillStyle(fill, 0.92).fillPoints(points, true).lineStyle(1, 0x7d929e, 0.45).strokePoints(points, true)
        .lineStyle(3, accent, 0.92).lineBetween(points[0]!.x + 8, points[0]!.y + 2, x - width * 0.2, points[0]!.y + 2);
    };
    panel(675, -405, 300, 68, 0xff3048, 0x09111a);
    panel(-180, -405, 304, 68, this.isGarage ? 0x1bc6e2 : 0xff3048, this.isGarage ? 0x0a1720 : 0x2a0d15);
    panel(160, -405, 350, 68, this.isGarage ? 0xff3048 : 0x1bc6e2, this.isGarage ? 0x2a0d15 : 0x0a1720);
    panel(-330, 424, 560, 76, 0x29c9df, 0x08111a);
    panel(290, 424, 560, 76, 0xff3048, 0x1c0b12);
    for (let row = 0; row < 2; row += 1) for (let column = 0; column < 3; column += 1) {
      const x = -520 + column * 365, y = 270 + row * 74;
      panel(x, y, 350, 69, column === 2 ? 0x1abbd7 : 0x6b7780, 0x07111b);
    }
    // Saldo token stacks and shopping cart are drawn from lines/circles, not glyphs.
    art.fillStyle(0xffb53b).fillCircle(550, -410, 8).fillCircle(558, -420, 7).fillCircle(566, -405, 7)
      .lineStyle(1.7, 0xffd481).strokeCircle(550, -410, 8).strokeCircle(558, -420, 7).strokeCircle(566, -405, 7);
    art.lineStyle(2.5, 0xfff5ea).lineBetween(-283, -412, -272, -412).lineBetween(-279, -409, -274, -398)
      .lineBetween(-274, -398, -258, -398).lineBetween(-258, -398, -255, -407).lineBetween(-280, -409, -257, -409)
      .fillCircle(-274, -393, 2.2).fillCircle(-260, -393, 2.2);
    art.lineStyle(2, 0xb4c8d1, 0.46).lineBetween(-790, -361, -790, -410).lineBetween(-780, -361, -780, -410);
    const cart = this.purchaseIcon.clear().setPosition(36, 424).setVisible(this.stage === 'paint' && !this.selectedVehicle?.purchaseLocked);
    cart.lineStyle(3, 0xfff4ec, 0.95).lineBetween(-14, -8, -8, -8).lineBetween(-10, -8, -5, 7)
      .lineBetween(-5, 7, 12, 7).lineBetween(12, 7, 16, -4).lineBetween(-8, -4, 14, -4)
      .fillCircle(-3, 13, 2.3).fillCircle(11, 13, 2.3);
  }

  private drawStatFrames(narrow: boolean): void {
    const g = this.statBars.clear();
    const width = narrow ? 292 : 350, height = 70, gap = narrow ? 16 : 15;
    const columns = narrow ? 2 : 3;
    const startX = narrow ? -153 : -520, stepX = narrow ? 306 : 365;
    const startY = narrow ? 490 : 270, stepY = narrow ? 82 : 74;
    this.attributeOrder.forEach((attribute, index) => {
      const column = index % columns, row = Math.floor(index / columns), x = startX + column * stepX, y = startY + row * stepY;
      const value = Math.max(0, Math.min(100, Number(this.selectedVehicle?.stats[attribute.key as keyof VehicleStats] ?? 0)));
      const points = [{ x: x - width / 2 + 10, y: y - height / 2 }, { x: x + width / 2 - 10, y: y - height / 2 },
        { x: x + width / 2, y: y - height / 2 + 10 }, { x: x + width / 2, y: y + height / 2 - 10 },
        { x: x + width / 2 - 10, y: y + height / 2 }, { x: x - width / 2 + 10, y: y + height / 2 },
        { x: x - width / 2, y: y + height / 2 - 10 }, { x: x - width / 2, y: y - height / 2 + 10 }];
      g.fillStyle(0x030a11, 0.92).fillPoints(points, true)
        .lineStyle(1, 0x77909d, 0.42).strokePoints(points, true)
        .lineStyle(2, 0xff3046, 0.86).lineBetween(points[0]!.x + 8, points[0]!.y, x - width * 0.22, points[0]!.y);
      const iconX = x - width / 2 + (narrow ? 25 : 31), iconY = y - 5;
      this.drawAttributeIcon(this.statIcons[index]!, attribute.key, iconX, iconY, narrow ? 23 : 31);
      this.statLabels[index]!.setPosition(x - width / 2 + (narrow ? 47 : 60), y - 17).setFontSize(narrow ? 9 : 11);
      this.statValues[index]!.setPosition(x + width / 2 - 12, y - 17).setOrigin(1, 0.5).setFontSize(narrow ? 14 : 18)
        .setText(`${value} / 100`);
      const left = x - width / 2 + (narrow ? 48 : 61), barWidth = width - (narrow ? 70 : 85), barY = y + 12;
      const count = 10, segmentGap = 3, segmentWidth = (barWidth - segmentGap * (count - 1)) / count;
      for (let segment = 0; segment < count; segment += 1) {
        g.fillStyle(value >= (segment + 1) * 10 ? 0xff3046 : 0x182632, 1)
          .fillRect(left + segment * (segmentWidth + segmentGap), barY, segmentWidth, narrow ? 5 : 7);
      }
    });
  }

  layout(w: number, h: number): void {
    const narrow = w < 700 && w < h;
    const landscapeCompact = !narrow && w <= 1000 && w > h;
    for (const item of [this.chrome, this.brand, this.edition, this.system, this.footerLeft, this.footerRight]) item.setVisible(false);
    this.fitContent(w, h, narrow ? 680 : 1680, narrow ? 1500 : landscapeCompact ? 730 : 900);

    if (narrow) {
      this.frame.clear(); this.panelArt.clear();
      this.logo.setPosition(-210, -685).setFontSize(30);
      this.logoRace.setPosition(-209, -657).setFontSize(14);
      this.shopTab.setPosition(-157, -604).setScale(0.84);
      this.garageTab.setPosition(157, -604).setScale(0.84);
      this.kicker.setPosition(0, -548).setFontSize(9);
      this.title.setPosition(0, -502).setFontSize(31).setOrigin(0.5, 0.5);
      this.subtitle.setPosition(0, -466).setFontSize(11).setOrigin(0.5, 0.5);
      this.bayLabel.setPosition(0, -431).setFontSize(11).setOrigin(0.5, 0.5);
      this.balanceTitle.setPosition(120, -684).setFontSize(8);
      this.balanceLabel.setPosition(120, -659).setFontSize(14);
      this.setPreviewBounds(0, -185, 620, 390);
      const cards = this.stage === 'vehicle' ? this.cards : this.paintCards;
      cards.forEach((card, index) => {
        card.setPosition(index % 2 ? 155 : -155, 75 + Math.floor(index / 2) * 76).setScale(0.58);
        card.label.setFontSize(15); card.detail.setFontSize(10);
        card.thumbnail?.setPosition(card.buttonWidth / 2 - 68, -1);
      });
      this.drawStatFrames(true);
      this.purchaseIcon.setVisible(false);
      this.confirmButton.setPosition(153, 750).setScale(0.58);
      this.backButton.setPosition(-153, 750).setScale(0.58);
      this.hint.setPosition(0, 844).setFontSize(9).setOrigin(0.5, 0.5);
      this.feedback.setPosition(0, 700).setFontSize(10).setWordWrapWidth(620);
      this.lockPanel.clear();
      this.loadingLabel.setPosition(0, -185).setFontSize(9);
      if (this.loadingLabel.text.includes('OFICINA ONLINE')) this.loadingLabel.setVisible(false);
      return;
    }

    this.drawVehiclePanel();
    this.logo.setPosition(-790, -410).setFontSize(36);
    this.logoRace.setPosition(-788, -377).setFontSize(17);
    this.shopTab.setPosition(-180, -405).setScale(0.95);
    this.garageTab.setPosition(175, -405).setScale(0.95);
    this.kicker.setPosition(-720, -336).setFontSize(13);
    this.title.setPosition(-720, -286).setFontSize(48).setOrigin(0, 0.5);
    this.subtitle.setPosition(-718, -239).setFontSize(16).setOrigin(0, 0.5);
    this.bayLabel.setPosition(-716, -199).setFontSize(13).setOrigin(0, 0.5);
    this.balanceTitle.setPosition(678, -421).setFontSize(11).setOrigin(0.5, 0.5);
    this.balanceLabel.setPosition(692, -389).setFontSize(23).setOrigin(0.5, 0.5);
    this.setPreviewBounds(0, 0, 1650, 865);
    const cards = this.stage === 'vehicle' ? this.cards : this.paintCards;
    cards.forEach((card, index) => {
      card.setPosition(this.stage === 'vehicle' ? 557 : 0, this.stage === 'vehicle' ? -193 + index * 96 : 0)
        .setScale(landscapeCompact ? 0.84 : 1);
      card.label.setFontSize(card.soldBadge.visible ? 16 : 19);
      card.detail.setFontSize(12);
      card.thumbnail?.setPosition(card.buttonWidth / 2 - 68, -1);
    });
    this.drawStatFrames(false);
    this.purchaseIcon.setPosition(24, 424).setVisible(this.stage === 'paint' && !this.selectedVehicle?.purchaseLocked);
    const buttonScale = landscapeCompact ? 0.84 : 1;
    const actionY = landscapeCompact ? 283 : 424;
    this.backButton.setPosition(-330, actionY).setScale(buttonScale);
    this.confirmButton.setPosition(290, actionY).setScale(buttonScale);
    this.feedback.setPosition(0, landscapeCompact ? 331 : 463).setFontSize(13).setWordWrapWidth(1080);
    this.hint.setPosition(0, landscapeCompact ? 339 : 480).setFontSize(landscapeCompact ? 10 : 12).setOrigin(0.5, 0.5);
    this.lockPanel.clear();
    if (this.selectedVehicle?.purchaseLocked) {
      this.lockPanel.fillStyle(0x080c13, 0.9).fillRoundedRect(-185, -12, 370, 110, 8)
        .lineStyle(2, 0xffbf75).strokeRoundedRect(-185, -12, 370, 110, 8)
        .lineStyle(3, 0xffbf75).strokeRoundedRect(-158, 32, 26, 25, 3).strokeRoundedRect(-153, 15, 16, 22, 7);
      this.lockLabel.setPosition(-10, 43).setFontSize(15);
    }
    this.loadingLabel.setPosition(0, 402).setFontSize(10);
    if (this.loadingLabel.text.includes('OFICINA ONLINE')) this.loadingLabel.setVisible(false);
  }
}
