import { GarageScene } from './GarageScene.js';
import { MenuButton } from '../ui/MenuButton.js';
import { COLORS, SCENES, text } from '../ui/theme.js';
import { getSelectedCharacter } from '../data/characters.js';
import { VEHICLE, PAINTS, VEHICLE_ATTRIBUTES, getSelectedVehicle, confirmVehicle, getVehicleDisplayName } from '../data/vehicles.js';

export class VehicleSelectionScene extends GarageScene {
  constructor() { super(SCENES.vehicles); }

  create() {
    this.character = getSelectedCharacter(this.registry);
    if (!this.character) { this.scene.start(SCENES.characters); return; }
    this.createGarageShell(`Seleção de Veículo. Piloto: ${this.character.name}. Carregando oficina 3D.`);
    this.selectedIndex = Math.max(0, PAINTS.findIndex(paint => paint.id === getSelectedVehicle(this.registry)?.paint.id));
    this.focusIndex = this.selectedIndex;
    this.confirming = false;
    this.vehicleDisplayName = getVehicleDisplayName();
    this.frame = this.add.graphics();
    this.kicker = text(this, 0, 0, '02 / GARAGEM    —    NEON MOTORWORKS', 13, '#71f6ff');
    this.title = text(this, 0, 0, `${this.vehicleDisplayName} / ${PAINTS[this.selectedIndex].name}`, 34, COLORS.white, true);
    this.subtitle = text(this, 0, 0, `PILOTO: ${this.character.name}   /   TRÊS PINTURAS. MESMA MÁQUINA.`, 12, COLORS.muted);
    this.bayLabel = text(this, 0, 0, 'BAY 01   /   PRÉ-SELEÇÃO', 11, '#71f6ff');
    this.cards = PAINTS.map((paint, index) => {
      const card = new MenuButton(this, {
        label: paint.name, index: `0${index + 1}`, width: 330, labelSize: 20,
        onSelect: () => this.select(index), onActivate: () => this.select(index),
      });
      card.detail.setText('●').setColor(paint.color);
      return card;
    });
    this.statBars = this.add.graphics();
    this.statLabels = VEHICLE_ATTRIBUTES.map(({ label }) => text(this, 0, 0, label, 11, COLORS.muted));
    this.statValues = VEHICLE_ATTRIBUTES.map(({ key }) => text(this, 0, 0, `${VEHICLE.stats[key]} / 100`, 17, COLORS.white, true));
    this.confirmButton = new MenuButton(this, {
      label: 'CONFIRMAR', index: '→', width: 282, labelSize: 20,
      onSelect: () => this.focusAction(3), onActivate: () => this.confirm(),
    });
    this.confirmButton.detail.setText('ENTER');
    this.confirmButton.label.setText('CARREGANDO');
    this.backButton = new MenuButton(this, {
      label: 'VOLTAR', index: '←', width: 282, labelSize: 20,
      onSelect: () => this.focusAction(4), onActivate: () => this.goTo(SCENES.characters),
    });
    this.backButton.detail.setText('ESC');
    // Keep the previous garage's explicit pilot-change affordance.
    this.changeButton = this.backButton;
    this.hint = text(this, 0, 0, '← → / A D  PINTURA     ENTER  CONFIRMAR     ESC  PILOTO', 12, COLORS.muted);
    this.content.add([this.frame, this.kicker, this.title, this.subtitle, this.bayLabel,
      ...this.cards, this.statBars, ...this.statLabels, ...this.statValues,
      this.backButton, this.confirmButton, this.hint]);
    this.select(this.selectedIndex);
    this.resizeShell();
    this.mountGarage({ mode: 'selection', paintId: PAINTS[this.selectedIndex].id });
    this.input.keyboard.addCapture(['LEFT', 'RIGHT', 'SPACE', 'TAB']);
    this.input.keyboard.on('keydown', event => {
      event.stopPropagation();
      if (event.repeat || this.transitioning || this.confirming) return;
      const key = event.key.toLowerCase();
      if (key === 'escape') this.goTo(SCENES.characters);
      if (['arrowleft', 'a'].includes(key)) this.select(this.selectedIndex - 1);
      if (['arrowright', 'd'].includes(key)) this.select(this.selectedIndex + 1);
      if (key === 'tab') {
        event.preventDefault();
        const next = (this.focusIndex + (event.shiftKey ? -1 : 1) + 5) % 5;
        if (next < 3) this.select(next); else this.focusAction(next);
      }
      if (key === 'enter' || event.code === 'Space') {
        if (this.focusIndex === 4) this.goTo(SCENES.characters); else this.confirm();
      }
    });
    this.events.once('shutdown', () => this.input.keyboard.removeCapture(['LEFT', 'RIGHT', 'SPACE', 'TAB']));
  }

  onGarageReady() {
    this.confirmButton.label.setText('CONFIRMAR');
    this.vehicleDisplayName = getVehicleDisplayName(this.garageView.resources.source);
    this.title.setText(`${this.vehicleDisplayName} / ${PAINTS[this.selectedIndex].name}`);
    this.garageView.setFocus(this.selectedIndex);
    this.preview.setInteractive({ useHandCursor: true }).on('pointerdown', pointer => {
      if (this.confirming || this.transitioning) return;
      const bounds = this.preview.getBounds();
      const index = this.garageView.pick((pointer.x - bounds.x) / bounds.width, (pointer.y - bounds.y) / bounds.height);
      if (index !== null) this.select(index);
    });
    this.announceSelection();
  }

  onGarageError() { this.confirmButton.label.setText('3D INDISP.'); }

  announceSelection() {
    const presentation = this.garageView?.resources.source === 'original' ? 'Modelo visual original da versão pública.' : 'Prévia local do modelo Air Blade.';
    this.announce(`Seleção de Veículo. Piloto: ${this.character.name}. ${this.vehicleDisplayName} ${PAINTS[this.selectedIndex].name}. Pintura ${this.selectedIndex + 1} de 3. ${presentation} Enter confirma; Escape troca o piloto.`);
  }

  select(index) {
    if (this.transitioning || this.confirming) return;
    this.selectedIndex = (index + PAINTS.length) % PAINTS.length;
    this.focusIndex = this.selectedIndex;
    this.title.setText(`${this.vehicleDisplayName} / ${PAINTS[this.selectedIndex].name}`);
    this.bayLabel.setText(`BAY 0${this.selectedIndex + 1}  /  PRÉ-SELEÇÃO  /  ${this.selectedIndex + 1} DE 3`);
    this.garageView?.setFocus(this.selectedIndex);
    this.updateActions();
    if (this.previewBounds) this.layout(this.scale.width, this.scale.height);
    this.announceSelection();
  }

  focusAction(index) {
    if (this.transitioning || this.confirming) return;
    this.focusIndex = index;
    this.updateActions();
  }

  updateActions() {
    this.cards.forEach((card, i) => {
      card.setSelected(i === this.selectedIndex);
      card.detail.setColor(PAINTS[i].color);
    });
    this.confirmButton.setSelected(this.focusIndex !== 4);
    this.backButton.setSelected(this.focusIndex === 4);
  }

  confirm() {
    if (this.transitioning || this.confirming || !this.garageView) return;
    this.confirming = true;
    confirmVehicle(this.registry, this.selectedIndex);
    this.loadingLabel.setText('TRANSFERÊNCIA EM CURSO  /  COMANDOS BLOQUEADOS');
    this.confirmButton.label.setText('TRANSFERINDO').setFontSize(16);
    this.announce(`${this.vehicleDisplayName} ${PAINTS[this.selectedIndex].name} confirmado. Braço mecânico transferindo veículo para a preparação.`);
    this.garageView.confirm(() => this.goTo(SCENES.preparation));
  }

  goTo(key) {
    if (this.confirming && key !== SCENES.preparation) return;
    super.goTo(key);
  }

  layout(w, h) {
    const narrow = w < 700 && w < h;
    const compact = !narrow && h < 600;
    this.fitContent(w, h, narrow ? 620 : 1140, narrow ? 1080 : compact ? 530 : 800);
    this.kicker.setPosition(0, narrow ? -495 : -355).setVisible(!compact);
    this.title.setPosition(0, narrow ? -448 : compact ? -211 : -310).setFontSize(narrow ? 29 : 34);
    this.subtitle.setPosition(0, narrow ? -404 : -265).setVisible(!compact);
    if (narrow) this.subtitle.setText(`PILOTO CONFIRMADO: ${this.character.name}`);
    else this.subtitle.setText(`PILOTO: ${this.character.name}   /   TRÊS PINTURAS. MESMA MÁQUINA.`);
    const preview = narrow ? [0, -155, 580, 440] : compact ? [-150, -22, 790, 290] : [0, -50, 1080, 390];
    this.setPreviewBounds(...preview);
    const [x, y, width, height] = preview;
    this.frame.clear().lineStyle(1, 0x365470, 0.9).strokeRect(x - width / 2, y - height / 2, width, height);
    this.frame.lineStyle(3, COLORS.cyan, 0.9).lineBetween(x - width / 2, y - height / 2, x - width / 2 + 65, y - height / 2);
    this.bayLabel.setPosition(x - width / 2 + 12, y - height / 2 + 17).setOrigin(0, 0.5);
    this.cards.forEach((card, i) => {
      card.setPosition((i - 1) * (narrow ? 196 : compact ? 272 : 365) + (compact ? -150 : 0), narrow ? 115 : compact ? 155 : 195);
      card.setScale(narrow ? 0.55 : compact ? 0.78 : 1);
      card.label.setFontSize(narrow ? 28 : 20);
    });
    this.statBars.clear();
    VEHICLE_ATTRIBUTES.forEach(({ key }, i) => {
      const sx = narrow ? (i % 2 - 0.5) * 292 : compact ? 410 : (i - 1.5) * 267;
      const sy = narrow ? 208 + Math.floor(i / 2) * 90 : compact ? -119 + i * 70 : 268;
      this.statLabels[i].setPosition(sx, sy - 22);
      this.statValues[i].setPosition(sx, sy);
      const bw = narrow ? 232 : compact ? 180 : 220;
      this.statBars.fillStyle(0x23354a).fillRect(sx - bw / 2, sy + 20, bw, 5);
      this.statBars.fillStyle(Number.parseInt(PAINTS[this.selectedIndex].color.slice(1), 16)).fillRect(sx - bw / 2, sy + 20, bw * VEHICLE.stats[key] / 100, 5);
    });
    this.backButton.setPosition(-152, narrow ? 390 : compact ? 225 : 350);
    this.confirmButton.setPosition(152, narrow ? 390 : compact ? 225 : 350);
    this.loadingLabel.setPosition(0, narrow ? 465 : 309).setFontSize(narrow ? 11 : 10).setVisible(!compact);
    this.hint.setPosition(0, narrow ? 505 : 406).setVisible(!compact);
    this.hint.setText(narrow ? 'TOQUE NA PINTURA E CONFIRME  /  ESC VOLTA' : '← → / A D  PINTURA     ENTER  CONFIRMAR     ESC  PILOTO');
  }
}
