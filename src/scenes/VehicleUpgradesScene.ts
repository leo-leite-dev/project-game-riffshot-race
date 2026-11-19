import { TitleScene } from './TitleScene.ts';
import { MenuButton } from '../ui/MenuButton.ts';
import { CAMARO_UPGRADE, CAMARO_UPGRADE_ATTRIBUTE_KEYS, CAMARO_UPGRADE_ATTRIBUTES,
  camaroTopSpeedKmh, camaroUpgradeValue } from '../data/camaroUpgrades.ts';
import { getSelectedVehicle } from '../data/vehicles.ts';
import { COLORS, SCENES, text } from '../ui/theme.ts';
import type Phaser from 'phaser';

const money = (value: number) => `$ ${value.toLocaleString('pt-BR')}`;
const speed = (value: number) => `${value.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} km/h`;
const ATTRIBUTE_LABELS: Record<keyof typeof CAMARO_UPGRADE_ATTRIBUTES, string> = {
  speed: 'VELOCIDADE', acceleration: 'ACELERAÇÃO', armor: 'RESISTÊNCIA', control: 'CONTROLE',
  tires: 'PNEUS', suspension: 'SUSPENSÃO', shotCount: 'TIROS', bombCount: 'BOMBAS', oilSlickCount: 'ÓLEO',
};
type UpgradeRow = { attribute: keyof typeof CAMARO_UPGRADE_ATTRIBUTES; container: Phaser.GameObjects.Container; frame: Phaser.GameObjects.Graphics;
  label: Phaser.GameObjects.Text; value: Phaser.GameObjects.Text; indicators: Phaser.GameObjects.Graphics; indicatorCount: number };

export class VehicleUpgradesScene extends TitleScene {
  declare balance: Phaser.GameObjects.Text;
  declare kicker: Phaser.GameObjects.Text;
  declare title: Phaser.GameObjects.Text;
  declare panel: Phaser.GameObjects.Graphics;
  declare vehicle: Phaser.GameObjects.Text;
  declare price: Phaser.GameObjects.Text;
  declare rows: UpgradeRow[];
  declare selectedIndex: number;
  declare feedback: Phaser.GameObjects.Text;
  declare buyButton: MenuButton;
  declare backButton: MenuButton;
  declare focusIndex: number;
  declare buying: boolean;

  constructor() { super(SCENES.upgrades); }

  create() {
    const championship = this.game.championship;
    if (championship.state.pendingResult) { this.scene.start(SCENES.results); return; }
    const selected = getSelectedVehicle(this.registry);
    if (!selected) { this.scene.start(SCENES.preparation); return; }
    this.buying = false;
    this.selectedIndex = 0;
    this.createShell('RIFFSHOT RACING. Melhorias permanentes compradas com MONEY. Use Tab ou setas para navegar; Enter confirma; Escape volta à equipe.');
    this.kicker = text(this, 0, 0, 'PIT CONTROL  /  ATRIBUTOS DO CAMARO', 11, '#ff3a56');
    this.title = text(this, 0, 0, 'MELHORIAS / CAMARO', 31, COLORS.white, true);
    this.panel = this.add.graphics();
    this.vehicle = text(this, 0, 0, `VEÍCULO ATUAL / ${selected.vehicle.name}`, 13, '#71f6ff');
    this.balance = text(this, 0, 0, '', 21, '#ffcf73', true);
    this.price = text(this, 0, 0, '', 15, '#ffcf73', true);
    this.rows = CAMARO_UPGRADE_ATTRIBUTE_KEYS.map(attribute => {
      const frame = this.add.graphics();
      const label = text(this, 0, 0, '', 12, '#e8f7ff', true).setOrigin(0, 0.5);
      const value = text(this, 0, 0, '', 12, '#f0f6fc').setOrigin(1, 0.5);
      const indicators = this.add.graphics();
      const container = this.add.container(0, 0, [frame, label, value, indicators]);
      container.setSize(820, 32).setInteractive({ useHandCursor: true });
      container.setData('upgradeSlotCount', CAMARO_UPGRADE.maximumLevel);
      container.on('pointerdown', () => {
        this.selectedIndex = CAMARO_UPGRADE_ATTRIBUTE_KEYS.indexOf(attribute);
        this.focusAction(0);
        this.refresh();
      });
      return { attribute, container, frame, label, value, indicators, indicatorCount: CAMARO_UPGRADE.maximumLevel };
    });
    this.feedback = text(this, 0, 0, '', 14, '#ffcf73').setDepth(12);
    this.buyButton = new MenuButton(this, {
      label: 'COMPRAR VELOCIDADE', index: '↑', width: 480, labelSize: 22,
      onSelect: () => this.focusAction(0), onActivate: () => this.buyUpgrade(),
    });
    this.backButton = new MenuButton(this, {
      label: 'VOLTAR À ESTAÇÃO', index: '←', width: 480, labelSize: 20,
      onSelect: () => this.focusAction(1), onActivate: () => this.goTo(SCENES.preparation),
    });
    this.backButton.detail.setText('ESC');
    this.content.add([this.panel, this.kicker, this.title, this.vehicle, this.balance, this.price,
      ...this.rows.map(row => row.container), this.feedback, this.buyButton, this.backButton]);
    this.refresh();
    this.focusAction(0);
    this.resizeShell();
    this.input.keyboard?.addCapture(['UP', 'DOWN', 'LEFT', 'RIGHT', 'SPACE', 'TAB']);
    this.input.keyboard?.on('keydown', (event: KeyboardEvent) => {
      event.stopPropagation();
      if (this.transitioning || this.buying || event.repeat) return;
      const key = event.key.toLowerCase();
      if (key === 'escape') this.goTo(SCENES.preparation);
      else if (['arrowup', 'arrowdown'].includes(key)) {
        event.preventDefault();
        this.selectedIndex = (this.selectedIndex + (key === 'arrowdown' ? 1 : -1)
          + CAMARO_UPGRADE_ATTRIBUTE_KEYS.length) % CAMARO_UPGRADE_ATTRIBUTE_KEYS.length;
        this.refresh();
      } else if (['arrowleft', 'arrowright', 'tab'].includes(key)) {
        event.preventDefault();
        this.focusAction(this.focusIndex + ((key === 'arrowleft' || (key === 'tab' && event.shiftKey)) ? -1 : 1));
      } else if (key === 'enter' || event.code === 'Space') {
        event.preventDefault();
        if (this.focusIndex === 0) this.buyUpgrade();
        else this.goTo(SCENES.preparation);
      }
    });
    this.events.once('shutdown', () => this.input.keyboard?.removeCapture(['UP', 'DOWN', 'LEFT', 'RIGHT', 'SPACE', 'TAB']));
    this.game.events.on('championship-updated', this.refresh, this);
    this.events.once('shutdown', () => this.game.events.off('championship-updated', this.refresh, this));
  }

  refresh(): void {
    const state = this.game.championship.state;
    const levels = state.permanentUpgrades[CAMARO_UPGRADE.vehicleId];
    const selected = this.rows[this.selectedIndex]!;
    const level = levels[selected.attribute];
    const nextPrice = CAMARO_UPGRADE.prices[level];
    this.balance.setText(`MONEY DISPONÍVEL  /  ${money(state.money)}`);
    this.rows.forEach((row, index) => {
      const rowLevel = levels[row.attribute];
      const current = camaroUpgradeValue(row.attribute, rowLevel);
      const next = rowLevel < CAMARO_UPGRADE.maximumLevel ? camaroUpgradeValue(row.attribute, rowLevel + 1) : null;
      const format = (value: number) => row.attribute === 'speed'
        ? speed(camaroTopSpeedKmh(value))
        : ['shotCount', 'bombCount', 'oilSlickCount'].includes(row.attribute) ? String(value) : `${value} PTS`;
      row.label.setText(`${ATTRIBUTE_LABELS[row.attribute]}  ${rowLevel}/${CAMARO_UPGRADE.maximumLevel}`);
      row.value.setText(next === null ? `${format(current)}  •  MÁX.` : `${format(current)}  →  ${format(next)}`);
      row.label.setColor(index === this.selectedIndex ? '#71f6ff' : '#e8f7ff');
      row.frame.clear().fillStyle(index === this.selectedIndex ? 0x123143 : 0x07111e,
        index === this.selectedIndex ? 0.82 : 0.28)
        .lineStyle(1, index === this.selectedIndex ? 0x2a849a : 0x273a49, index === this.selectedIndex ? 0.9 : 0.45)
        .fillRoundedRect(-410, -15, 820, 30, 4).strokeRoundedRect(-410, -15, 820, 30, 4);
      this.drawLevelIndicators(row.indicators, rowLevel, row.attribute === 'speed' ? 0xffb637 : 0x43cce4);
    });
    const selectedLevel = levels[selected.attribute];
    const selectedCurrent = camaroUpgradeValue(selected.attribute, selectedLevel);
    const selectedNext = selectedLevel < CAMARO_UPGRADE.maximumLevel
      ? camaroUpgradeValue(selected.attribute, selectedLevel + 1) : null;
    const selectedValue = (value: number) => selected.attribute === 'speed'
      ? speed(camaroTopSpeedKmh(value))
      : ['shotCount', 'bombCount', 'oilSlickCount'].includes(selected.attribute) ? String(value) : `${value} PTS`;
    this.price.setText(nextPrice === undefined ? `${ATTRIBUTE_LABELS[selected.attribute]}  /  NÍVEL MÁXIMO`
      : `PRÓXIMA: ${money(nextPrice)}  /  ${selectedValue(selectedCurrent)}${selectedNext === null ? '' : ` → ${selectedValue(selectedNext)}`}`);
    this.buyButton.label.setText(`COMPRAR ${ATTRIBUTE_LABELS[selected.attribute]}`);
    this.buyButton.locked = false;
    this.buyButton.detail.setText(nextPrice === undefined ? 'MÁXIMO' : !this.game.championship.writable ? 'SAVE BLOQ.'
      : state.money < nextPrice ? 'MONEY INSUF.' : 'COMPRAR');
    this.buyButton.setSelected(this.focusIndex === 0);
  }

  private drawLevelIndicators(graphics: Phaser.GameObjects.Graphics, level: number, accent: number): void {
    const g = graphics.clear();
    const count = CAMARO_UPGRADE.maximumLevel, gap = 4, slotWidth = 15, slotHeight = 14;
    const startX = -220;
    for (let index = 0; index < count; index += 1) {
      const x = startX + index * (slotWidth + gap);
      const active = index < level;
      g.fillStyle(active ? accent : 0x132433, active ? 0.95 : 1)
        .lineStyle(1, active ? 0xffdd81 : 0x476170, 1)
        .fillRoundedRect(x, -slotHeight / 2, slotWidth, slotHeight, 3)
        .strokeRoundedRect(x, -slotHeight / 2, slotWidth, slotHeight, 3);
      if (active) g.fillStyle(0xfff0bd).fillRect(x + 6, -2, slotWidth - 12, 4);
    }
  }

  buyUpgrade(): void {
    if (this.transitioning || this.buying) return;
    const state = this.game.championship.state;
    const attribute = CAMARO_UPGRADE_ATTRIBUTE_KEYS[this.selectedIndex]!;
    const level = state.permanentUpgrades[CAMARO_UPGRADE.vehicleId][attribute];
    const price = CAMARO_UPGRADE.prices[level];
    if (price === undefined) { this.showFeedback(`${ATTRIBUTE_LABELS[attribute]} já está no nível máximo.`); return; }
    if (state.money < price) { this.showFeedback('MONEY insuficiente. Nenhuma compra foi realizada.'); return; }
    if (!this.game.championship.writable) {
      this.showFeedback(this.game.championship.warning ?? 'O save não pode ser gravado; compra cancelada.');
      return;
    }
    this.buying = true;
    if (!this.game.championship.purchaseCamaroUpgrade(attribute)) {
      this.buying = false;
      this.showFeedback(this.game.championship.warning ?? 'Compra não concluída. Seu saldo foi preservado.');
      return;
    }
    this.buying = false;
    this.showFeedback(`${ATTRIBUTE_LABELS[attribute]} melhorado por ${money(price)}. Aplicado na próxima corrida.`);
    this.refresh();
  }

  showFeedback(message: string): void {
    this.feedback.setText(message).setColor('#ffcf73');
    this.announce(message);
  }

  focusAction(index: number): void {
    this.focusIndex = (index + 2) % 2;
    this.buyButton.setSelected(this.focusIndex === 0);
    this.backButton.setSelected(this.focusIndex === 1);
  }

  layout(w: number, h: number): void {
    this.fitContent(w, h, 850, 620);
    const small = w < 600;
    this.kicker.setPosition(0, -332).setFontSize(small ? 8 : 11);
    this.title.setPosition(0, -303).setFontSize(small ? 24 : 31);
    this.panel.clear().fillStyle(0x07111e, 0.91).lineStyle(2, 0x2e6475, 0.9)
      .fillRoundedRect(-430, -270, 860, 545, 10).strokeRoundedRect(-430, -270, 860, 545, 10);
    this.vehicle.setPosition(0, -245).setFontSize(small ? 11 : 13);
    this.balance.setPosition(0, -210).setFontSize(small ? 15 : 19);
    this.rows.forEach((row, index) => {
      const y = -174 + index * 31;
      row.container.setPosition(0, y);
      row.label.setPosition(-397, 0).setFontSize(small ? 9 : 12);
      row.value.setPosition(397, 0).setFontSize(small ? 9 : 12);
    });
    this.price.setPosition(0, 110).setFontSize(small ? 10 : 14).setWordWrapWidth(w - 60);
    this.buyButton.setPosition(0, 192);
    this.buyButton.label.setFontSize(small ? 18 : 22);
    this.backButton.setPosition(0, 255);
    this.backButton.label.setFontSize(small ? 17 : 20);
    this.feedback.setPosition(0, 139).setFontSize(small ? 10 : 12).setWordWrapWidth(w - 36);
  }
}
