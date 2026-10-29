import { GarageScene } from './GarageScene.js';
import { MenuButton } from '../ui/MenuButton.js';
import { COLORS, SCENES, text } from '../ui/theme.js';
import { getSelectedCharacter } from '../data/characters.js';
import { VEHICLES, INITIAL_VEHICLES, PAINTS, VEHICLE_ATTRIBUTES, getSelectedVehicle } from '../data/vehicles.js';

const credits = value => `${value.toLocaleString('pt-BR')} CR`;

// The first purchase and the full shop share presentation, not a second wallet.
export class VehicleSelectionScene extends GarageScene {
  constructor() { super(SCENES.vehicles); }

  create() {
    this.character = getSelectedCharacter(this.registry);
    if (!this.character) { this.scene.start(SCENES.characters); return; }
    if (this.game.championship.state.pendingResult) { this.scene.start(SCENES.results); return; }
    this.selection = getSelectedVehicle(this.registry);
    this.isShop = !!this.selection;
    this.options = this.isShop ? VEHICLES : INITIAL_VEHICLES;
    this.vehicleIndex = Math.max(0, this.options.findIndex(vehicle => vehicle.id === this.selection?.vehicle.id));
    this.paintIndex = Math.max(0, PAINTS.findIndex(paint => paint.id === this.selection?.paint.id));
    this.stage = 'vehicle';
    this.confirming = false;
    this.createGarageShell(this.isShop ? 'Loja de veículos. Todos os carros, preços e disponibilidade.'
      : 'Compra inicial. Escolha entre Thunder Bug, Camaro e Armored Car. Saldo inicial: 2.000 créditos.');
    this.focusIndex = this.vehicleIndex;
    this.frame = this.add.graphics();
    this.kicker = text(this, 0, 0, this.isShop ? 'PIT MARKET / LOJA DE VEÍCULOS' : '02 / GARAGEM / PRIMEIRA COMPRA', 13, '#71f6ff');
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
    this.content.add([this.frame, this.kicker, this.title, this.balanceLabel, this.subtitle, this.bayLabel,
      ...this.cards, ...this.paintCards, this.statBars, ...this.statLabels, ...this.statValues,
      this.lockPanel, this.lockLabel, this.backButton, this.confirmButton, this.hint, this.feedback]);
    this.updateSelectionView();
    this.resizeShell();
    this.mountGarage({ mode: 'selection', vehicleId: this.selectedVehicle.id,
      vehicleIds: this.options.map(vehicle => vehicle.id), paintId: this.selectedPaint.id });
    this.input.keyboard.addCapture(['LEFT', 'RIGHT', 'UP', 'DOWN', 'SPACE', 'TAB']);
    this.input.keyboard.on('keydown', event => {
      event.stopPropagation();
      if (event.repeat || this.transitioning || this.confirming) return;
      const key = event.key.toLowerCase();
      if (key === 'escape') this.goBack();
      else if (['arrowleft', 'a', 'arrowup'].includes(key) && this.focusIndex < this.optionCount) this.select(this.focusIndex - 1);
      else if (['arrowright', 'd', 'arrowdown'].includes(key) && this.focusIndex < this.optionCount) this.select(this.focusIndex + 1);
      else if (key === 'tab') {
        event.preventDefault();
        const next = (this.focusIndex + (event.shiftKey ? -1 : 1) + this.optionCount + 2) % (this.optionCount + 2);
        if (next < this.optionCount) this.select(next); else this.focusAction(next);
      } else if (key === 'enter' || event.code === 'Space') {
        if (this.focusIndex === this.optionCount + 1) this.goBack(); else this.confirm();
      }
    });
    this.events.once('shutdown', () => this.input.keyboard.removeCapture(['LEFT', 'RIGHT', 'UP', 'DOWN', 'SPACE', 'TAB']));
  }

  makeCard(label, index, locked = false) {
    const card = new MenuButton(this, { label, index: String(index + 1).padStart(2, '0'), locked,
      width: 330, labelSize: 17, onSelect: () => this.select(index), onActivate: () => this.select(index) });
    card.label.setY(-10);
    card.detail.setPosition(-99, 15).setOrigin(0, 0.5).setFontSize(12);
    return card;
  }

  get selectedVehicle() { return this.options[this.vehicleIndex]; }
  get selectedPaint() { return PAINTS[this.paintIndex]; }
  get optionCount() { return this.stage === 'vehicle' ? this.options.length : PAINTS.length; }
  get owned() { return this.game.championship.ownsVehicle(this.selectedVehicle.id); }
  get unavailable() {
    return this.selectedVehicle.purchaseLocked || (!this.owned && this.game.championship.state.money < this.selectedVehicle.price);
  }

  onGarageReady() {
    this.garageView.setSelectionStage(this.stage, this.vehicleIndex, this.paintIndex);
    this.preview.setInteractive({ useHandCursor: true }).on('pointerdown', pointer => {
      if (this.confirming || this.transitioning || this.stage !== 'vehicle') return;
      const bounds = this.preview.getBounds();
      const index = this.garageView.pick((pointer.x - bounds.x) / bounds.width, (pointer.y - bounds.y) / bounds.height);
      if (index !== null) this.select(index);
    });
    this.updateSelectionView();
    this.announceSelection();
  }

  onGarageError() { this.showFeedback('Preview 3D indisponível. A loja continua disponível.'); }

  updateSelectionView() {
    const vehicle = this.selectedVehicle;
    const state = this.game.championship.state;
    this.vehicleDisplayName = vehicle.name;
    this.title.setText(vehicle.name);
    this.balanceLabel.setText(`SEU SALDO / ${credits(state.money)}`);
    this.selectedIndex = this.stage === 'vehicle' ? this.vehicleIndex : this.paintIndex;
    this.subtitle.setText(this.stage === 'vehicle'
      ? this.owned ? 'NA SUA GARAGEM / EQUIPAR SEM CUSTO' : `PREÇO / ${credits(vehicle.price)}   •   COMPRA ÚNICA`
      : `COR DA EQUIPE / ${this.selectedPaint.name}   •   TEXTURA ORIGINAL DO MODELO PRESERVADA`);
    this.bayLabel.setText(this.stage === 'vehicle' ? `MODELO ${this.vehicleIndex + 1} / ${this.options.length}` : 'PERSONALIZAÇÃO / COR DA EQUIPE');
    this.cards.forEach((card, index) => {
      const item = this.options[index];
      const owned = this.game.championship.ownsVehicle(item.id);
      card.setVisible(this.stage === 'vehicle');
      card.detail.setText(item.purchaseLocked ? `${credits(item.price)} / FASE 2`
        : owned ? 'ADQUIRIDO / EQUIPAR' : `${credits(item.price)}${state.money < item.price ? ' / SEM SALDO' : ''}`);
    });
    this.paintCards.forEach((card, index) => {
      card.setVisible(this.stage === 'paint');
      card.detail.setText('COR DA EQUIPE').setColor(PAINTS[index].color);
    });
    this.statValues.forEach((label, index) => label.setText(`${vehicle.stats[VEHICLE_ATTRIBUTES[index].key]} / 100`));
    this.confirmButton.locked = !!this.unavailable;
    this.confirmButton.label.setText(vehicle.purchaseLocked ? 'BLOQUEADO / FASE 2'
      : this.unavailable ? 'SALDO INSUFICIENTE' : this.stage === 'vehicle' ? 'COR DA EQUIPE'
        : this.owned ? 'EQUIPAR VEÍCULO' : 'COMPRAR E EQUIPAR');
    this.backButton.label.setText(this.stage === 'paint' ? 'VOLTAR AOS CARROS' : this.isShop ? 'VOLTAR À EQUIPE' : 'TROCAR PILOTO');
    this.hint.setText('← →  ESCOLHER    TAB  AÇÕES    ENTER  CONFIRMAR    ESC  VOLTAR');
    this.lockLabel.setText(vehicle.purchaseLocked ? 'BLOQUEADO\nCHEFÃO DA FASE 2\nAINDA NÃO LIBERADO' : '');
    this.updateActions();
    this.garageView?.setSelectionStage(this.stage, this.vehicleIndex, this.paintIndex);
    if (this.previewBounds) this.layout(this.scale.width, this.scale.height);
  }

  announceSelection() {
    this.announce(`${this.isShop ? 'Loja' : 'Compra inicial'}. ${this.selectedVehicle.name}. ${this.owned ? 'Adquirido.'
      : `Preço ${credits(this.selectedVehicle.price)}.`} Saldo ${credits(this.game.championship.state.money)}. ${this.selectedVehicle.purchaseLocked
      ? this.selectedVehicle.unlockMessage : this.unavailable ? 'Saldo insuficiente.' : 'Enter para continuar.'}`);
  }

  select(index) {
    if (this.transitioning || this.confirming) return;
    const next = (index + this.optionCount) % this.optionCount;
    if (this.stage === 'vehicle') this.vehicleIndex = next; else this.paintIndex = next;
    this.focusIndex = next;
    this.feedback.setText('');
    this.updateSelectionView();
    this.announceSelection();
  }

  focusAction(index) {
    if (this.transitioning || this.confirming) return;
    this.focusIndex = index;
    this.updateActions();
  }

  updateActions() {
    const cards = this.stage === 'vehicle' ? this.cards : this.paintCards;
    cards.forEach((card, index) => card.setSelected(this.focusIndex === index));
    this.confirmButton.setSelected(this.focusIndex === this.optionCount);
    this.backButton.setSelected(this.focusIndex === this.optionCount + 1);
  }

  showFeedback(message) { this.feedback.setText(message); this.announce(message); }

  confirm() {
    if (this.transitioning || this.confirming) return;
    const vehicle = this.selectedVehicle;
    if (this.unavailable) {
      this.showFeedback(vehicle.purchaseLocked ? vehicle.unlockMessage : `Faltam ${credits(vehicle.price - this.game.championship.state.money)} para comprar.`);
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
    if (!this.owned && !window.confirm(`COMPRAR ${vehicle.name}?\n\nPreço: ${credits(vehicle.price)}\nSaldo após a compra: ${credits(this.game.championship.state.money - vehicle.price)}\n\nO carro ficará na sua garagem. Confirmar compra?`)) {
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
    if (this.garageView) this.garageView.confirm(() => this.goTo(SCENES.preparation));
    else this.goTo(SCENES.preparation);
  }

  goBack() {
    if (this.stage === 'paint') {
      this.stage = 'vehicle'; this.focusIndex = this.vehicleIndex;
      this.updateSelectionView(); this.announceSelection();
    } else this.goTo(this.isShop ? SCENES.preparation : SCENES.characters);
  }

  goTo(key) {
    if (this.confirming && key !== SCENES.preparation) return;
    super.goTo(key);
  }

  layout(w, h) {
    const narrow = w < 700 && w < h;
    const compact = !narrow && h < 600;
    this.fitContent(w, h, narrow ? 620 : 1200, narrow ? 1120 : compact ? 640 : 780);
    this.kicker.setPosition(0, narrow ? -502 : compact ? -296 : -350);
    this.title.setPosition(narrow ? 0 : -205, narrow ? -454 : compact ? -250 : -297).setFontSize(narrow ? 30 : 32);
    this.balanceLabel.setPosition(narrow ? 0 : 410, narrow ? -411 : compact ? -250 : -297).setFontSize(narrow ? 17 : 16);
    this.subtitle.setPosition(narrow ? 0 : -195, narrow ? -374 : compact ? -214 : -257).setFontSize(11);
    const preview = narrow ? [0, -190, 580, 310] : compact ? [-190, -57, 790, 280] : [-190, -34, 790, 390];
    this.setPreviewBounds(...preview);
    const [x, y, width, height] = preview;
    this.frame.clear().lineStyle(1, 0x365470, 0.9).strokeRect(x - width / 2, y - height / 2, width, height);
    this.bayLabel.setPosition(x - width / 2 + 12, y - height / 2 + 17).setOrigin(0, 0.5);
    const cards = this.stage === 'vehicle' ? this.cards : this.paintCards;
    cards.forEach((card, index) => {
      card.setPosition(narrow ? ((index % 2) - 0.5) * 304 : 410,
        narrow ? 20 + Math.floor(index / 2) * 82 : (compact ? -157 : -193) + index * (compact ? 74 : 85));
      card.setScale(narrow ? 0.86 : compact ? 0.8 : 0.9);
      card.label.setFontSize(narrow ? 22 : 17);
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
        .fillRect(sx - bw / 2, sy + 20, bw * this.selectedVehicle.stats[key] / 100, 5);
    });
    this.lockPanel.clear();
    if (this.selectedVehicle.purchaseLocked) {
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
