import { TitleScene } from './TitleScene.ts';
import { CHARACTERS, getSelectedCharacter } from '../data/characters.ts';
import {
  getOriginPlanet,
  getOriginPlanetArtworkKey,
  getOriginPlanetTrackPreview,
} from '../data/originPlanets.ts';
import { getPilotProfile } from '../data/pilotos/index.ts';
import { CharacterCard, CHARACTER_CARD_GAP } from '../ui/CharacterCard.ts';
import {
  CharacterDetails,
  PANEL_ARTWORK_ASPECT_RATIO,
  PANEL_ARTWORK_HEIGHT_SCALE,
  PANEL_ARTWORK_WIDTH_SCALE,
} from '../ui/CharacterDetails.ts';
import { MenuButton } from '../ui/MenuButton.ts';
import { createCharacterSelectionAssets, preloadCharacterSelectionAssets } from '../ui/CharacterSelectionAssets.ts';
import type { CharacterPresentation } from '../ui/CharacterDetails.ts';
import { COLORS, SCENES, text } from '../ui/theme.ts';
import Phaser from 'phaser';
import { applyPilotSelectionFont, PILOT_SELECTION_FONT } from '../ui/PilotSelectionTypography.ts';
import type { CharacterCard as CharacterCardType } from '../ui/CharacterCard.ts';
import type { CharacterDetails as CharacterDetailsType } from '../ui/CharacterDetails.ts';
import type { MenuButton as MenuButtonType } from '../ui/MenuButton.ts';

// IDs persistidos ficam intactos; esta camada só define a apresentação aprovada do novo elenco.
type PilotPresentation = Omit<CharacterPresentation,
  'planetName' | 'planetDescription' | 'planetArtworkKey' | 'planetEmblemKey'
  | 'trackArtworkKey' | 'showTrackArtwork'>;

const PRESENTATION: Record<(typeof CHARACTERS)[number]['id'], PilotPresentation> = {
  'axel-ryder': { accent: '#FF6A25', flagAccent: '#e51d2a', showPlanetDetails: true },
  'neon-kira': { accent: '#FF37C7', showPlanetDetails: true },
  'brok-thorn': { accent: '#64CFFF', showPlanetDetails: true },
  'leonard-lyon': { accent: '#4BE134', showPlanetDetails: true },
  'rox-z7': { accent: '#00F0E6', showPlanetDetails: true },
  'vyra-noctis': { accent: '#9D49FF', showPlanetDetails: true },
  'dagger-raven': { accent: '#FF2638', showPlanetDetails: true },
  'cyber-dragon': { accent: '#3269FF', showPlanetDetails: true },
  'drax-mare': { accent: '#FFCC27', showPlanetDetails: true },
};
const NARROW_COMPOSITION_WIDTH = 680;
const DETAILS_PANEL_VISUAL_SCALE = 1.08;
const PILOT_GRID_REFERENCE = {
  width: 1600,
  height: 1000,
  scale: 0.4346578914718809,
  left: 24,
  centerY: 482.5792188411397,
} as const;
const PILOT_SCENARIO_TEXTURE_BY_ID: Partial<Record<(typeof CHARACTERS)[number]['id'], string>> = {
  'axel-ryder': 'pilot-selection-scenario-axel-ryder',
  'neon-kira': 'pilot-selection-scenario-neon-kira',
  'brok-thorn': 'pilot-selection-scenario-brok-thorn',
  'leonard-lyon': 'pilot-selection-scenario-leonard-lyon',
  'rox-z7': 'pilot-selection-scenario-rox-z7',
  'vyra-noctis': 'pilot-selection-scenario-vyra-noctis',
  'dagger-raven': 'pilot-selection-scenario-dagger-raven',
  'cyber-dragon': 'pilot-selection-scenario-cyber-dragon',
  'drax-mare': 'pilot-selection-scenario-drax-mare',
};

export class CharacterSelectionScene extends TitleScene {
  declare selectedIndex: number;
  declare focusIndex: number;
  declare kicker: Phaser.GameObjects.Text;
  declare title: Phaser.GameObjects.Text;
  declare roster: Phaser.GameObjects.Container;
  declare cards: CharacterCardType[];
  declare details: CharacterDetailsType;
  declare confirmButton: MenuButtonType;
  declare backButton: MenuButtonType;
  declare hint: Phaser.GameObjects.Text;
  private selectionBackdrop!: Phaser.GameObjects.Graphics;
  private selectionGround!: Phaser.GameObjects.Image;
  private pilotBackdrop!: Phaser.GameObjects.Image;

  constructor() { super(SCENES.characters); }

  preload(): void {
    void document.fonts.load('italic 800 48px Oxanium');
    void document.fonts.load('italic 500 16px Oxanium');
    preloadCharacterSelectionAssets(this);
  }

  create(): void {
    const frameColors = Object.fromEntries(
      CHARACTERS.map(({ id }) => [id, PRESENTATION[id].accent]),
    );
    createCharacterSelectionAssets(this, frameColors);
    this.createShell('Seleção de pilotos. Escolha um piloto e confirme com Enter.');
    this.backdrop.image.setVisible(false);
    this.backdrop.motion.setVisible(false);
    this.chrome.setVisible(false);
    this.brand.setVisible(false);
    this.edition.setVisible(false);
    this.system.setVisible(false);
    this.footerLeft.setVisible(false);
    this.footerRight.setVisible(false);
    this.selectionBackdrop = this.add.graphics().setDepth(-22);
    this.pilotBackdrop = this.add.image(0, 0, 'pilot-selection-scenario-axel-ryder')
      .setOrigin(0.5, 0.5).setDepth(-21).setVisible(false);
    this.selectionGround = this.add.image(0, 0, 'pilot-selection-fixed-ground')
      .setOrigin(0.5, 0.5).setDepth(-20);
    const previous = getSelectedCharacter(this.registry);
    this.selectedIndex = Math.max(0, CHARACTERS.findIndex(character => character.id === previous?.id));
    this.kicker = text(this, 0, -300, '1 JOGADOR  /  01 — PILOTO  /  02 — VEÍCULO', 13, '#ff4657');
    this.title = text(this, 0, -251, 'SELECIONAR PILOTO', 31, COLORS.white, true)
      .setOrigin(0.5, 0.5)
      .setFontSize(48)
      .setStyle({ color: '#ffffff', stroke: '#870d1c', strokeThickness: 2,
        padding: { top: 4, bottom: 4, left: 4, right: 4 } });
    applyPilotSelectionFont(this.title, PILOT_SELECTION_FONT.weight.display).setResolution(2);
    this.roster = this.add.container(0, 0);
    this.cards = CHARACTERS.map((character, index) => new CharacterCard(this, character, index,
      PRESENTATION[character.id].accent, i => this.select(i)));
    this.roster.add(this.cards);
    this.details = new CharacterDetails(this);
    this.details.setVisible(true);
    this.confirmButton = new MenuButton(this, {
      label: 'CONFIRMAR', index: '→', width: 315, labelSize: 17,
      onSelect: () => this.focusAction(CHARACTERS.length), onActivate: () => this.confirm(),
    });
    this.confirmButton.detail.setText('ENTER');
    this.backButton = new MenuButton(this, {
      label: 'VOLTAR', index: '←', width: 315, labelSize: 17,
      onSelect: () => this.focusAction(CHARACTERS.length + 1),
      onActivate: () => { if (!this.transitioning) this.goTo(SCENES.menu); },
    });
    this.backButton.detail.setText('ESC');
    this.backButton.addAt(this.add.image(0, 0, 'pilot-ui-back-button').setDisplaySize(315, 65), 0);
    this.confirmButton.addAt(this.add.image(0, 0, 'pilot-ui-confirm-button').setDisplaySize(315, 65), 0);
    this.confirmButton.setBuiltInVisualsVisible(false);
    this.backButton.setBuiltInVisualsVisible(false);
    for (const [button, labelX, labelHeight] of [[this.backButton, 0, 28], [this.confirmButton, 22, 28]] as const) {
      button.number.setVisible(false);
      button.detail.setVisible(false);
      button.label.setPosition(labelX, 0).setOrigin(0.5, 0.5).setVisible(true)
        .setFontSize(labelHeight - 3)
        .setStyle({ color: '#ffffff', stroke: '#18040a', strokeThickness: 2 });
      applyPilotSelectionFont(button.label, PILOT_SELECTION_FONT.weight.display).setResolution(2);
    }
    this.hint = text(this, 0, 316, '← ↑ ↓ →  PILOTO     ENTER  CONFIRMAR     ESC  MENU', 12, COLORS.muted);
    applyPilotSelectionFont(this.hint, PILOT_SELECTION_FONT.weight.secondary).setResolution(2);
    // Mantém as informações dos cards legíveis quando a arte ampliada avança sobre a grade.
    this.content.add([this.kicker, this.title, this.details, this.roster, this.confirmButton, this.backButton, this.hint]);
    // Mantém os dados já escolhidos, mas exige interação para realçar um card ao entrar.
    this.select(this.selectedIndex, false);
    this.resizeShell();
    this.cards.forEach((card, index) => card.playEntrance(70 + index * 65));

    this.input.keyboard?.addCapture(['UP', 'DOWN', 'LEFT', 'RIGHT', 'SPACE', 'TAB']);
    this.input.keyboard?.on('keydown', (event: KeyboardEvent) => {
      event.stopPropagation();
      if (this.transitioning || event.repeat) return;
      if (event.key === 'Escape') this.goTo(SCENES.menu);
      if (event.key.toLowerCase() === 'p') this.details.setTab('pilot');
      if (event.key.toLowerCase() === 'v') this.details.setTab('vehicle');
      if (event.key === 'Tab') {
        event.preventDefault();
        const next = (this.focusIndex + (event.shiftKey ? -1 : 1) + CHARACTERS.length + 2) % (CHARACTERS.length + 2);
        if (next < CHARACTERS.length) this.select(next);
        else this.focusAction(next);
      }
      const offset = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -3, ArrowDown: 3 }[event.key];
      if (offset) this.select(this.selectedIndex + offset);
      if (event.key === 'Enter' || event.code === 'Space') {
        if (this.focusIndex === CHARACTERS.length + 1) this.goTo(SCENES.menu);
        else this.confirm();
      }
    });
    this.events.once('shutdown', () => this.input.keyboard?.removeCapture(['UP', 'DOWN', 'LEFT', 'RIGHT', 'SPACE', 'TAB']));
  }

  select(index: number, highlightCard = true): void {
    if (this.transitioning) return;
    this.selectedIndex = (index + CHARACTERS.length) % CHARACTERS.length;
    this.focusIndex = this.selectedIndex;
    this.cards.forEach((card, cardIndex) => card.setSelected(highlightCard && cardIndex === this.selectedIndex));
    const character = CHARACTERS[this.selectedIndex];
    const scenarioTexture = PILOT_SCENARIO_TEXTURE_BY_ID[character.id];
    if (scenarioTexture) this.pilotBackdrop?.setTexture(scenarioTexture);
    this.pilotBackdrop?.setVisible(scenarioTexture !== undefined);
    const originPlanet = getOriginPlanet(character.originPlanetId);
    const profile = getPilotProfile(character.id);
    const trackPreview = originPlanet
      ? getOriginPlanetTrackPreview(originPlanet, character.id)
      : undefined;
    if (!originPlanet || !profile) {
      throw new Error(`Dados de origem incompletos para o piloto "${character.id}".`);
    }
    const presentation: CharacterPresentation = {
      ...PRESENTATION[character.id],
      planetName: originPlanet.name,
      planetDescription: originPlanet.description,
      planetArtworkKey: getOriginPlanetArtworkKey(originPlanet) ?? '',
      planetEmblemKey: originPlanet.emblemKey,
      trackArtworkKey: trackPreview?.artworkKey,
      showTrackArtwork: trackPreview?.showArtwork ?? false,
    };
    this.details.setCharacter(character, presentation);
    this.updateActions();
    this.announce(`Seleção de piloto. ${character.name}. ${character.profile}.`);
  }

  focusAction(index: number): void {
    if (this.transitioning) return;
    this.focusIndex = index;
    this.updateActions();
  }

  updateActions(): void {
    this.backButton.setSelected(this.focusIndex === CHARACTERS.length + 1);
    this.confirmButton.setSelected(this.focusIndex !== CHARACTERS.length + 1);
  }

  private openGalaxyMap(): void {
    if (this.transitioning) return;
    this.game.championship.select({ pilotId: CHARACTERS[this.selectedIndex].id });
    this.goTo(SCENES.galaxyMap);
  }

  confirm(): void {
    this.openGalaxyMap();
  }

  update(time: number, delta: number): void {
    super.update(time, delta);
    this.details?.updateDescriptionAnimations(delta);
  }

  layout(w: number, h: number): void {
    for (const shellItem of [this.brand, this.edition, this.system, this.footerLeft, this.footerRight]) {
      shellItem.setVisible(false);
    }
    const narrow = w < 720;
    const compact = h < 650;
    this.brand.setText('RIFFSHOT RACING').setOrigin(0.5, 0.5)
      .setPosition(w / 2, 27).setFontSize(36)
      .setVisible(!narrow);
    applyPilotSelectionFont(this.brand, PILOT_SELECTION_FONT.weight.display).setResolution(2);
    this.fitContent(w, h, narrow ? NARROW_COMPOSITION_WIDTH : 1260, narrow ? 1450 : compact ? 650 : 760);
    const scale = compact ? 0.83 : 1;
    this.kicker.setPosition(0, narrow ? -600 : -366).setVisible(false);
    this.roster.setPosition(narrow ? 0 : -360, narrow ? -180 : compact ? 48 : -8).setScale(compact ? 0.83 : 1);
    this.layoutPilotGrid();
    this.drawSelectionBackdrop(w, h);
    this.details.panelArtwork
      .setSize(610 * PANEL_ARTWORK_WIDTH_SCALE,
        610 * PANEL_ARTWORK_WIDTH_SCALE / PANEL_ARTWORK_ASPECT_RATIO * PANEL_ARTWORK_HEIGHT_SCALE)
      .setPosition(0, 610 * PANEL_ARTWORK_WIDTH_SCALE / PANEL_ARTWORK_ASPECT_RATIO
        * (PANEL_ARTWORK_HEIGHT_SCALE - 1) / 2);
    this.details.setPortraitResponsiveScale(narrow ? 0.7 : 1);
    if (narrow) {
      this.details.setPosition(0, 445).setScale(scale * DETAILS_PANEL_VISUAL_SCALE);
      this.details.setPanelVisualScale(DETAILS_PANEL_VISUAL_SCALE);
      this.details.syncTrackClip();
    }
    else this.alignDesktopPanel(w, compact);
    this.details.syncTrackClip();
    if (!narrow) this.applyFixedDesktopGrid(w, h);
    this.positionTitleAboveRoster();
    const buttonX = narrow ? 155 : 165;
    this.backButton.setScale(scale);
    this.confirmButton.setScale(scale);
    const buttonY = (this.details.panelArtwork.getBounds().bottom + (narrow ? 30 : 8)
      + this.backButton.getBounds().height / 2 - this.content.y) / this.content.scaleY;
    this.backButton.setPosition(-buttonX, buttonY);
    this.confirmButton.setPosition(buttonX, buttonY);
    const buttonBottom = Math.max(this.backButton.getBounds().bottom, this.confirmButton.getBounds().bottom);
    this.hint.setFontSize(14).setColor('#f1e5e7');
    this.hint.setPosition(0, (buttonBottom + 26 + this.hint.height / 2 - this.content.y) / this.content.scaleY)
      .setVisible(!compact);
    this.hint.setText(narrow ? 'TOQUE NO PILOTO E CONFIRME  /  ESC VOLTA'
      : '← ↑ ↓  PILOTO     P / V  ABAS     ENTER  CONFIRMAR     ESC  MENU');
  }

  private positionTitleAboveRoster(): void {
    const bounds = this.getRosterBounds();
    const maxTitleWidth = bounds.width * 0.94;
    let fontSize = 48;
    this.title.setFontSize(fontSize);
    while (this.title.getBounds().width > maxTitleWidth && fontSize > 20) {
      fontSize -= 1;
      this.title.setFontSize(fontSize);
    }
    const titleWorldY = bounds.top - 18 - this.title.height * this.content.scaleY / 2;
    const localPosition = this.content.getWorldTransformMatrix().applyInverse(
      (bounds.left + bounds.right) / 2,
      titleWorldY,
      new Phaser.Math.Vector2(),
    );
    this.title.setPosition(localPosition.x, localPosition.y);
  }

  private applyFixedDesktopGrid(width: number, height: number): void {
    const parentScaleX = Math.max(this.content.scaleX, 0.001);
    const parentScaleY = Math.max(this.content.scaleY, 0.001);
    const viewportScale = width / PILOT_GRID_REFERENCE.width;
    this.roster.setScale(PILOT_GRID_REFERENCE.scale * viewportScale);

    const bounds = this.getRosterBounds();
    const targetLeft = PILOT_GRID_REFERENCE.left * viewportScale;
    const targetCenterY = PILOT_GRID_REFERENCE.centerY * height / PILOT_GRID_REFERENCE.height;
    this.roster.x += (targetLeft - bounds.left) / parentScaleX;
    this.roster.y += (targetCenterY - (bounds.top + bounds.bottom) / 2) / parentScaleY;
  }

  private alignDesktopPanel(width: number, compact: boolean): void {
    const artworkRatio = PANEL_ARTWORK_ASPECT_RATIO * PANEL_ARTWORK_WIDTH_SCALE;
    const artworkHeight = 610 * PANEL_ARTWORK_WIDTH_SCALE / PANEL_ARTWORK_ASPECT_RATIO;
    const contentScaleX = this.content.scaleX;
    const contentScaleY = this.content.scaleY;
    const gap = compact ? 14 : 24;
    const sideMargin = compact ? 20 : 24;
    const maxRosterScale = compact ? 0.83 : 1;

    this.roster.setScale(1);
    const baseBounds = this.getRosterBounds();
    const panelGrowth = compact ? 1 : 1.1;
    const compositionWidth = baseBounds.width + baseBounds.height * panelGrowth * artworkRatio + gap;
    const availableWidth = Math.max(1, width - sideMargin * 2);
    const layoutRosterScale = Math.min(maxRosterScale, availableWidth / compositionWidth);
    this.roster.setScale(layoutRosterScale);

    let rosterBounds = this.getRosterBounds();
    const panelHeight = rosterBounds.height * panelGrowth;
    const panelWidth = panelHeight * artworkRatio;
    const totalWidth = rosterBounds.width + gap + panelWidth;
    const desiredRosterLeft = (width - totalWidth) / 2;
    this.roster.x += (desiredRosterLeft - rosterBounds.left) / contentScaleX;
    rosterBounds = this.getRosterBounds();

    const detailsScale = panelHeight / (contentScaleY * artworkHeight);
    const panelCenterY = (rosterBounds.top + rosterBounds.bottom) / 2;
    const grownPanelWidth = panelWidth * DETAILS_PANEL_VISUAL_SCALE;
    const grownCenterX = width - sideMargin - grownPanelWidth / 2;

    this.details
      .setScale(detailsScale * DETAILS_PANEL_VISUAL_SCALE)
      .setPosition(
        (grownCenterX - this.content.x) / contentScaleX,
        (panelCenterY - this.content.y) / contentScaleY,
      );
    this.details.setPanelVisualScale(DETAILS_PANEL_VISUAL_SCALE);
    this.details.syncTrackClip();
  }

  private layoutPilotGrid(): void {
    for (let row = 0; row < 3; row += 1) {
      const rowCards = this.cards.slice(row * 3, row * 3 + 3);
      const rowWidth = rowCards.reduce((width, card) => width + card.visualWidth, 0)
        + CHARACTER_CARD_GAP * (rowCards.length - 1);
      let nextCardLeft = -rowWidth / 2;

      rowCards.forEach(card => {
        card.x = nextCardLeft + card.visualWidth / 2;
        nextCardLeft += card.visualWidth + CHARACTER_CARD_GAP;
      });
    }

    for (let column = 0; column < 3; column += 1) {
      const columnCards = [this.cards[column]!, this.cards[column + 3]!, this.cards[column + 6]!];
      const rowOffsets = [0];
      for (let row = 1; row < 3; row += 1) {
        const previous = columnCards[row - 1]!;
        const current = columnCards[row]!;
        rowOffsets.push(rowOffsets[row - 1]!
          + previous.visualBottomOffset - current.visualTopOffset + CHARACTER_CARD_GAP);
      }
      const visualTop = rowOffsets[0]! + columnCards[0]!.visualTopOffset;
      const visualBottom = rowOffsets[2]! + columnCards[2]!.visualBottomOffset;
      const centerOffset = (visualTop + visualBottom) / 2;
      columnCards.forEach((card, row) => {
        card.y = rowOffsets[row]! - centerOffset;
      });
    }
  }

  private getRosterBounds(): { left: number; right: number; top: number; bottom: number; width: number; height: number } {
    const bounds = this.cards.map(card => {
      const current = card.getBounds();
      const factor = 1 / Math.max(card.scaleX, 0.001);
      const centerX = (current.left + current.right) / 2;
      const centerY = (current.top + current.bottom) / 2;
      const halfWidth = current.width * factor / 2;
      const halfHeight = current.height * factor / 2;
      return {
        left: centerX - halfWidth,
        right: centerX + halfWidth,
        top: centerY - halfHeight,
        bottom: centerY + halfHeight,
      };
    });
    const left = Math.min(...bounds.map(item => item.left));
    const right = Math.max(...bounds.map(item => item.right));
    const top = Math.min(...bounds.map(item => item.top));
    const bottom = Math.max(...bounds.map(item => item.bottom));
    return {
      left,
      right,
      top,
      bottom,
      width: right - left,
      height: bottom - top,
    };
  }

  private drawSelectionBackdrop(width: number, height: number): void {
    const graphics = this.selectionBackdrop.clear();
    graphics.fillStyle(0x05090f, 1).fillRect(0, 0, width, height);
    this.layoutSelectionBackdrops(width, height);
  }

  private layoutSelectionBackdrops(width: number, height: number): void {
    const fitToViewport = (image: Phaser.GameObjects.Image): void => {
      const source = image.texture.getSourceImage();
      const coverScale = Math.max(width / source.width, height / source.height);
      image.setPosition(width / 2, height / 2)
        .setDisplaySize(source.width * coverScale, source.height * coverScale);
    };
    fitToViewport(this.pilotBackdrop);
    fitToViewport(this.selectionGround);
  }
}
