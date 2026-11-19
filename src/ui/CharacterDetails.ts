import Phaser from 'phaser';
import { getEffectivePilotBonusAttributes, type PilotAttribute } from '../data/characters.ts';
import { getSelectedVehicle, VEHICLE_ATTRIBUTES } from '../data/vehicles.ts';
import { getPilotProfile } from '../data/pilotos/index.ts';
import { pilotWhiteIconTextureKey } from '../data/pilotIcons.ts';
import { getUltimate } from '../data/ultimates.ts';
import { COLORS, text } from './theme.ts';
import type { RacingCharacter } from './CharacterCard.ts';
import { applyPilotSelectionFont, PILOT_SELECTION_FONT } from './PilotSelectionTypography.ts';
import {
  PILOT_DETAILS_FRAME_SIZE,
  PILOT_MASTER_FLAG_CROP,
  PILOT_MASTER_FLAG_TEXTURE_KEY,
  PILOT_MASTER_FRAME_CROP,
  PILOT_BONUS_CARD_TEXTURE_KEYS,
  PILOT_REPLACEMENT_FRAME_TEXTURE_KEY,
  TRACK_EMPTY_QUADRANT_FRAME_TEXTURE_KEY,
} from './CharacterSelectionAssets.ts';

type PurpleBandTitleAlignment = {
  marker: { top: number; bottom: number };
  textX: number;
  textMaxRight: number;
};
const DETAIL_TEXT_RESOLUTION = 2;
export const PANEL_ARTWORK_WIDTH_SCALE = 1;
export const PANEL_ARTWORK_HEIGHT_SCALE = 1;
export const PANEL_ARTWORK_ASPECT_RATIO = PILOT_DETAILS_FRAME_SIZE.width / PILOT_DETAILS_FRAME_SIZE.height;
const PILOT_CIRCLE_ARTWORK = {
  // Centro e borda do círculo medidos diretamente no asset de substituição.
  center: { x: 540, y: 223 },
  outerRight: 615,
  innerDiameter: 112,
  visibleDiameterRatio: 0.8,
  safeRadiusRatio: 0.485,
  textGapSourcePixels: 24,
  textMaxRight: 1230,
} as const;
const PILOT_CARD_PORTRAIT = {
  x: 200, y: 500, width: 128, height: 160,
  cropX: 65, cropY: 15, cropWidth: 240, cropHeight: 300,
} as const;
type FullBodyPortraitSpec = {
  contentBounds: { x: number; y: number; width: number; height: number };
  scale: number;
};
const KIRA_REFERENCE = {
  sourceWidth: 887,
  sourceHeight: 1774,
  displayHeight: 990,
  contentBounds: { x: 127, y: 2, width: 670, height: 1764 },
} as const;
const REFERENCE_CONTENT_HEIGHT = KIRA_REFERENCE.contentBounds.height
  * KIRA_REFERENCE.displayHeight / KIRA_REFERENCE.sourceHeight;
// Medido a partir do Dagger Raven já aprovado, em coordenadas locais do painel.
const FULL_BODY_PORTRAIT_ANCHOR = { centerX: -248, feetY: 169.64 } as const;
const FULL_BODY_PORTRAITS: Partial<Record<RacingCharacter['id'], FullBodyPortraitSpec>> = {
  'axel-ryder': {
    contentBounds: { x: 226, y: 0, width: 585, height: 1549 },
    scale: 1,
  },
  'neon-kira': {
    contentBounds: { x: 171, y: 7, width: 664, height: 1540 },
    scale: 1,
  },
  'brok-thorn': {
    contentBounds: { x: 0, y: 0, width: 838, height: 1839 },
    scale: 1,
  },
  'leonard-lyon': {
    contentBounds: { x: 39, y: 6, width: 985, height: 1521 },
    scale: 1,
  },
  'rox-z7': {
    contentBounds: { x: 157, y: 2, width: 715, height: 1525 },
    scale: 1,
  },
  'vyra-noctis': {
    contentBounds: { x: 24, y: 10, width: 977, height: 1514 },
    scale: 1,
  },
  'dagger-raven': {
    contentBounds: { x: 14, y: 6, width: 1001, height: 1519 },
    scale: 1,
  },
  'cyber-dragon': {
    contentBounds: { x: 1, y: 1, width: 1017, height: 1535 },
    scale: 1,
  },
  'drax-mare': {
    contentBounds: { x: 1, y: 0, width: 1022, height: 1534 },
    scale: 1,
  },
};
// Retângulo interno medido no PNG da moldura; termina antes do quadriculado e da paisagem.
const TRACK_TITLE_BAND = { left: 80, top: 60, right: 640, bottom: 122, insetX: 12, insetY: 8 } as const;
const PLANET_ARTWORK_CENTER = { x: 1030, y: 439 } as const;
const PLANET_ARTWORK_SIZE = 140;
const BONUS_CARD_LAYOUT = {
  centersX: [585, 795],
  centerY: 650,
  maxWidth: 190,
  maxHeight: 72,
} as const;
const PLANET_TEXT_LAYOUT = {
  x: 1112, top: 390, descriptionOffsetY: 38, maxWidth: 230, descriptionWidth: 260,
} as const;
const PLANET_DESCRIPTION_MAX_HEIGHT = 78;
const PLANET_DESCRIPTION_TOP_GAP = 6;
const CHARACTER_DESCRIPTION_VIEWPORT = { left: 482, top: 365, right: 902, bottom: 494 } as const;
const CHARACTER_DESCRIPTION_ORIGIN = { x: 482, y: 365 } as const;
const CHARACTER_DESCRIPTION_RIGHT_INSET = 16;
const PURPLE_BAND_TITLE_ALIGNMENT = {
  lore: { marker: { top: 308, bottom: 388 }, textX: 443, textMaxRight: 650 },
  bonus: { marker: { top: 570, bottom: 632 }, textX: 443, textMaxRight: 650 },
  origin: { marker: { top: 308, bottom: 388 }, textX: 1036, textMaxRight: 1250 },
} as const;
const PURPLE_BAND_TITLE_FONT_SIZE = 12;
const DESCRIPTION_SCROLL_SPEED = 0.003;
const DESCRIPTION_LOOP_GAP_LINES = 2;
const LORE_WHEEL_PIXELS_PER_NOTCH = 0.65;
const TRACK_FRAME_TEXTURE_SIZE = { width: 1916, height: 821 } as const;
const SHOW_TRACK_PREVIEW_ARTWORK = true;
const SHOW_LEGACY_TRACK_PREVIEW_FRAME = false;
const TRACK_FRAME_SCALE = 0.97;
const TRACK_FRAME_WIDTH_SCALE = 1.025;
const TRACK_FRAME_HORIZONTAL_OFFSET = -1.9;
const TRACK_FRAME_VERTICAL_OFFSET = -7.5;
const TRACK_PANEL_VISIBLE_BOUNDS = { left: 950, top: 552, right: 1385, bottom: 723 } as const;
const TRACK_FRAME_ALPHA_BOUNDS = { left: 3, top: 24, right: 1916, bottom: 793 } as const;
const TRACK_FRAME_APERTURE_SEED = { x: 958, y: 410 } as const;
const TRACK_FLAG_RECOLOR_REGION = { left: 1530, top: 48, right: 1900, bottom: 330 } as const;
const TRACK_APERTURE_MASK_TEXTURE_KEY = 'pilot-track-aperture-mask-derived';
// Limites com alpha > 16: recorte antigo 1371×772 e asset novo 1671×941.
const LEGACY_FRAME_VISIBLE_BOUNDS = { x: 148, y: 1, width: 1212, height: 753 } as const;
const REPLACEMENT_FRAME_VISIBLE_BOUNDS = { x: 265, y: 80, width: 1219, height: 757 } as const;
const REPLACEMENT_FRAME_SCALE = (LEGACY_FRAME_VISIBLE_BOUNDS.width / PILOT_MASTER_FRAME_CROP.width)
  / (REPLACEMENT_FRAME_VISIBLE_BOUNDS.width / PILOT_DETAILS_FRAME_SIZE.width);
// Faixa de cabeçalho e ornamentos embutida no asset original da moldura.
const TRACK_FRAME_HEADER_REGION = { x: 22, y: 15, width: 535, height: 50 } as const;
const TRACK_TITLE_FONT_SIZE = 20;

export type CharacterPresentation = {
  accent: string;
  planetName: string;
  planetDescription: string;
  planetArtworkKey?: string;
  planetEmblemKey?: string;
  trackArtworkKey?: string;
  flagAccent?: string;
  showTrackArtwork?: boolean;
  showPlanetDetails?: boolean;
};

export class CharacterDetails extends Phaser.GameObjects.Container {
  character!: RacingCharacter;
  panelArtwork: Phaser.GameObjects.Zone;
  infoBackground: Phaser.GameObjects.Image;
  masterFrame: Phaser.GameObjects.Image;
  generalFrame: Phaser.GameObjects.Image;
  trackFrame: Phaser.GameObjects.Image;
  trackHeaderDecor: Phaser.GameObjects.Image;
  trackFlag: Phaser.GameObjects.Image;
  trackFlagIcon: Phaser.GameObjects.Image;
  private readonly designLayers: Phaser.GameObjects.Image[];
  tabsArtwork: Phaser.GameObjects.Graphics;
  pilotTabLabel: Phaser.GameObjects.Text;
  vehicleTabLabel: Phaser.GameObjects.Text;
  pilotTab: Phaser.GameObjects.Zone;
  vehicleTab: Phaser.GameObjects.Zone;
  vehiclePane: Phaser.GameObjects.Container;
  vehicleName: Phaser.GameObjects.Text;
  vehicleStatus: Phaser.GameObjects.Text;
  vehicleStatLabels: Phaser.GameObjects.Text[];
  vehicleStatValues: Phaser.GameObjects.Text[];
  vehicleStatBars: Phaser.GameObjects.Graphics;
  portrait: Phaser.GameObjects.Image;
  characterIconLayer: Phaser.GameObjects.Container;
  characterIcon: Phaser.GameObjects.Image;
  private readonly secondaryUltimateIcon: Phaser.GameObjects.Image;
  planetArtwork: Phaser.GameObjects.Image;
  planetEmblem: Phaser.GameObjects.Image;
  trackArtwork: Phaser.GameObjects.Image;
  trackTitle: Phaser.GameObjects.Text;
  planetName: Phaser.GameObjects.Text;
  planetDescription: Phaser.GameObjects.Text;
  loreTitle: Phaser.GameObjects.Text;
  planetTitle: Phaser.GameObjects.Text;
  // Text objects stay available for announcements/tests; the guide glyphs draw the large headings.
  name: string & Phaser.GameObjects.Text;
  profile: Phaser.GameObjects.Text;
  description: Phaser.GameObjects.Text;
  loreClip: Phaser.GameObjects.Graphics;
  loreScrollZone: Phaser.GameObjects.Zone;
  planetDescriptionClip: Phaser.GameObjects.Graphics;
  bonusTitle: Phaser.GameObjects.Text;
  bonusCards: Phaser.GameObjects.Image[];
  private panelVisualScale = 1;
  private portraitScaleCompensation = 1;
  private portraitResponsiveScale = 1;
  private fullBodyBaseDisplayHeight = 0;
  private activeFullBodyPortrait?: FullBodyPortraitSpec;
  private activeFullBodyPortraitKey?: string;
  private descriptionViewportHeight = 0;
  private descriptionBaseY = 0;
  private descriptionScrollOffset = 0;
  private descriptionLoopHeight = 0;
  private planetDescriptionBaseY = 0;
  private planetDescriptionViewportWidth = 0;
  private planetDescriptionViewportHeight = 0;
  private planetDescriptionScrollOffset = 0;
  private planetDescriptionLoopHeight = 0;
  private planetDescriptionContent = '';
  private trackArtworkSourceKey = '';
  private trackFrameAccent = '#ffffff';
  private activeTab: 'pilot' | 'vehicle' = 'pilot';
  private hasTrackArtwork = false;
  private hasPlanetDetails = false;
  private readonly inputPlugin: Phaser.Input.InputPlugin;

  constructor(scene: Phaser.Scene) {
    super(scene, 0, 0);
    this.inputPlugin = scene.input;
    scene.add.existing(this);
    this.panelArtwork = scene.add.zone(0, 0,
      610 * PANEL_ARTWORK_WIDTH_SCALE,
      610 * PANEL_ARTWORK_WIDTH_SCALE / PANEL_ARTWORK_ASPECT_RATIO * PANEL_ARTWORK_HEIGHT_SCALE)
      .setY(610 * PANEL_ARTWORK_WIDTH_SCALE / PANEL_ARTWORK_ASPECT_RATIO
        * (PANEL_ARTWORK_HEIGHT_SCALE - 1) / 2)
      .setVisible(false);
    this.infoBackground = scene.add.image(0, 0, 'riff-details-shell-masked');
    this.masterFrame = scene.add.image(0, 0, PILOT_REPLACEMENT_FRAME_TEXTURE_KEY)
      .setOrigin(0.5, 0.5)
      .setDisplaySize(this.frameWidth(PILOT_DETAILS_FRAME_SIZE.width),
        this.frameWidth(PILOT_DETAILS_FRAME_SIZE.height));
    this.infoBackground.setVisible(false);
    this.generalFrame = scene.add.image(0, 0, 'riff-details-floor');
    this.designLayers = [
      scene.add.image(0, 0, 'riff-details-pipe-top'),
      scene.add.image(0, 0, 'riff-details-pipe-left'),
      scene.add.image(0, 0, 'riff-details-pipe-right'),
      scene.add.image(0, 0, 'riff-details-pipe-bottom'),
      scene.add.image(0, 0, 'riff-details-header'),
      scene.add.image(0, 0, 'riff-details-lore'),
      scene.add.image(0, 0, 'riff-details-origin'),
      scene.add.image(0, 0, 'riff-details-bonus'),
    ];
    this.generalFrame.setVisible(false);
    this.designLayers.forEach(layer => layer.setVisible(false));
    this.tabsArtwork = scene.add.graphics();
    this.tabsArtwork.setVisible(false);
    this.pilotTabLabel = text(scene, 0, 0, 'PILOTO', 24, COLORS.white, true).setOrigin(0.5, 0.5)
      .setResolution(DETAIL_TEXT_RESOLUTION).setVisible(false);
    this.vehicleTabLabel = text(scene, 0, 0, 'VEÍCULO', 24, COLORS.white, true).setOrigin(0.5, 0.5)
      .setResolution(DETAIL_TEXT_RESOLUTION).setVisible(false);
    this.portrait = scene.add.image(0, 0, 'pilot-card-axel-ryder').setDisplaySize(1, 1).setVisible(false);
    this.characterIconLayer = scene.add.container(0, 0);
    this.characterIcon = scene.add.image(0, 0, '__DEFAULT').setVisible(false);
    this.secondaryUltimateIcon = scene.add.image(0, 0, '__DEFAULT').setVisible(false);
    this.characterIconLayer.add(this.characterIcon);
    this.characterIconLayer.add(this.secondaryUltimateIcon);
    this.name = text(scene, 0, 0, '', 34, COLORS.white, true).setOrigin(0, 0.5)
      .setResolution(DETAIL_TEXT_RESOLUTION) as string & Phaser.GameObjects.Text;
    this.profile = text(scene, 0, 0, '', 17, COLORS.white, true).setOrigin(0, 0.5)
      .setResolution(DETAIL_TEXT_RESOLUTION);
    this.description = text(scene, 0, 0, '', 10, '#f3eaf0').setOrigin(0, 0)
      .setStyle({ align: 'left', wordWrap: { width: 520 }, lineSpacing: 4 })
      .setResolution(DETAIL_TEXT_RESOLUTION);
    this.loreClip = scene.add.graphics();
    this.description.setMask(this.loreClip.createGeometryMask());
    this.loreScrollZone = scene.add.zone(0, 0, 1, 1).setOrigin(0, 0).setInteractive();
    scene.input.on('wheel', this.onLoreWheel);
    this.loreTitle = text(scene, 0, 0, 'LORE', PURPLE_BAND_TITLE_FONT_SIZE, COLORS.white, true).setOrigin(0.5, 0.5)
      .setResolution(DETAIL_TEXT_RESOLUTION);
    this.planetArtwork = scene.add.image(0, 0, 'pilot-world-voltaris');
    fitArtwork(this.planetArtwork, 100, 92);
    this.planetEmblem = scene.add.image(-130, -54, 'pilot-emblem-voltaris').setDisplaySize(23, 23);
    this.planetName = text(scene, -80, -48, '', 13, COLORS.white, true).setOrigin(0, 0.5)
      .setStyle({ stroke: '#481500', strokeThickness: 2 })
      .setResolution(DETAIL_TEXT_RESOLUTION);
    this.planetDescription = text(scene, -80, -31, '', 10, '#f7edf0').setOrigin(0, 0)
      .setStyle({ align: 'left', wordWrap: { width: 78 }, lineSpacing: 1 })
      .setResolution(DETAIL_TEXT_RESOLUTION);
    this.planetTitle = text(scene, 0, 0, 'ORIGEM', PURPLE_BAND_TITLE_FONT_SIZE, COLORS.white, true).setOrigin(0.5, 0.5)
      .setResolution(DETAIL_TEXT_RESOLUTION);
    this.pilotTab = scene.add.zone(0, 0, this.frameWidth(520), this.frameWidth(80))
      .setInteractive({ useHandCursor: true });
    this.vehicleTab = scene.add.zone(0, 0, this.frameWidth(520), this.frameWidth(80))
      .setInteractive({ useHandCursor: true });
    this.pilotTab.on('pointerdown', () => this.setTab('pilot'));
    this.vehicleTab.on('pointerdown', () => this.setTab('vehicle'));
    this.vehicleName = text(scene, 0, 0, '', 32, COLORS.white, true).setOrigin(0, 0.5)
      .setResolution(DETAIL_TEXT_RESOLUTION);
    this.vehicleStatus = text(scene, 0, 0, '', 16, '#f3eaf0').setOrigin(0, 0)
      .setResolution(DETAIL_TEXT_RESOLUTION);
    this.vehicleStatLabels = VEHICLE_ATTRIBUTES.map(attribute =>
      text(scene, 0, 0, attribute.label, 13, '#f5eaf3', true).setOrigin(0, 0.5)
        .setResolution(DETAIL_TEXT_RESOLUTION));
    this.vehicleStatValues = VEHICLE_ATTRIBUTES.map(() =>
      text(scene, 0, 0, '—', 14, '#fff', true).setOrigin(1, 0.5)
        .setResolution(DETAIL_TEXT_RESOLUTION));
    this.vehicleStatBars = scene.add.graphics();
    this.vehiclePane = scene.add.container(0, 0, [this.vehicleName, this.vehicleStatus,
      this.vehicleStatBars, ...this.vehicleStatLabels, ...this.vehicleStatValues]).setVisible(false);
    this.planetDescriptionClip = scene.add.graphics().setAlpha(0);
    this.planetDescription.setMask(this.planetDescriptionClip.createGeometryMask());
    this.trackArtwork = scene.add.image(0, 0, 'pilot-track-voltaris');
    this.trackFrame = scene.add.image(0, 0, TRACK_EMPTY_QUADRANT_FRAME_TEXTURE_KEY);
    this.trackHeaderDecor = scene.add.image(0, 0, 'riff-details-track-frame');
    this.trackFlag = scene.add.image(0, 0, PILOT_MASTER_FLAG_TEXTURE_KEY).setVisible(false);
    this.trackFlagIcon = scene.add.image(0, 0, 'pilot-symbol-white-axel-ryder');
    this.trackFlagIcon.setVisible(false);
    this.trackFrame.setVisible(false);
    this.trackHeaderDecor.setVisible(false);
    this.trackTitle = text(scene, 0, 0, '', 14, COLORS.white, true).setOrigin(0, 0.5)
      .setStyle({ stroke: '#050507', strokeThickness: 3 })
      .setShadow(1, 1, '#000000', 2, true, true)
      .setResolution(DETAIL_TEXT_RESOLUTION);
    this.bonusTitle = text(scene, 0, 0, 'BÔNUS DO PILOTO', PURPLE_BAND_TITLE_FONT_SIZE, COLORS.white, true).setOrigin(0.5, 0.5)
      .setStyle({ stroke: '#60020a', strokeThickness: 2 })
      .setResolution(DETAIL_TEXT_RESOLUTION);
    this.bonusCards = [0, 1].map(() => scene.add.image(
      0, 0, PILOT_BONUS_CARD_TEXTURE_KEYS.speed,
    ).setVisible(false));
    this.add([
      this.panelArtwork, this.infoBackground, this.masterFrame, ...this.designLayers, this.generalFrame,
      // A paisagem fica sob a moldura; cabeçalho e bandeiras são camadas independentes.
      this.trackArtwork, this.trackFrame, this.trackHeaderDecor,
      this.trackFlag, this.trackFlagIcon, this.trackTitle,
      this.tabsArtwork, this.pilotTabLabel, this.vehicleTabLabel, this.portrait,
      this.characterIconLayer, this.name, this.profile,
      this.description, this.loreScrollZone, this.loreTitle, this.planetArtwork, this.planetEmblem,
      this.planetTitle, this.planetName, this.planetDescription,
      this.bonusTitle, ...this.bonusCards,
      this.vehiclePane, this.pilotTab, this.vehicleTab,
    ]);
    const selectionText = [
      [this.pilotTabLabel, PILOT_SELECTION_FONT.weight.heading],
      [this.vehicleTabLabel, PILOT_SELECTION_FONT.weight.heading],
      [this.name, PILOT_SELECTION_FONT.weight.display],
      [this.profile, PILOT_SELECTION_FONT.weight.secondary],
      [this.description, PILOT_SELECTION_FONT.weight.body],
      [this.loreTitle, PILOT_SELECTION_FONT.weight.heading],
      [this.planetName, PILOT_SELECTION_FONT.weight.heading],
      [this.planetDescription, PILOT_SELECTION_FONT.weight.body],
      [this.planetTitle, PILOT_SELECTION_FONT.weight.heading],
      [this.vehicleName, PILOT_SELECTION_FONT.weight.heading],
      [this.vehicleStatus, PILOT_SELECTION_FONT.weight.body],
      ...this.vehicleStatLabels.map(label => [label, PILOT_SELECTION_FONT.weight.secondary] as const),
      ...this.vehicleStatValues.map(value => [value, PILOT_SELECTION_FONT.weight.heading] as const),
      [this.trackTitle, PILOT_SELECTION_FONT.weight.display],
      [this.bonusTitle, PILOT_SELECTION_FONT.weight.heading],
    ] as const;
    selectionText.forEach(([gameText, weight]) => applyPilotSelectionFont(gameText, weight));
    this.characterIcon.setVisible(false);
    this.name.setVisible(true);
    this.profile.setVisible(true);
    this.description.setVisible(true);
    this.planetArtwork.setVisible(false);
    this.planetTitle.setVisible(false);
    this.planetEmblem.setVisible(false);
    this.trackArtwork.setVisible(false);
    this.trackFrame.setVisible(false);
    this.trackHeaderDecor.setVisible(false);
    this.trackTitle.setVisible(false);
    this.planetName.setVisible(false);
    this.planetDescription.setVisible(false);
    this.bonusTitle.setVisible(false);
    this.loreTitle.setVisible(false);
    this.bonusCards.forEach(card => card.setVisible(false));
    this.loreClip.setAlpha(0);
    this.drawTabs();
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.disposeDescriptionMasks);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.removeLoreInputListeners);
  }

  getVisiblePortraitBounds(): { left: number; right: number; top: number; bottom: number } {
    const displayBounds = this.portrait.getBounds();
    const portraitSpec = FULL_BODY_PORTRAITS[this.character.id];
    if (!portraitSpec) {
      return {
        left: displayBounds.left,
        right: displayBounds.right,
        top: displayBounds.top,
        bottom: displayBounds.bottom,
      };
    }

    const portraitKey = getPilotProfile(this.character.id)?.fullBodyPortraitKey;
    if (!portraitKey) return {
      left: displayBounds.left, right: displayBounds.right,
      top: displayBounds.top, bottom: displayBounds.bottom,
    };
    const source = this.scene.textures.get(portraitKey).getSourceImage();
    const content = portraitSpec.contentBounds;
    return {
      left: displayBounds.left + displayBounds.width * content.x / source.width,
      right: displayBounds.left + displayBounds.width * (content.x + content.width) / source.width,
      top: displayBounds.top + displayBounds.height * content.y / source.height,
      bottom: displayBounds.top + displayBounds.height * (content.y + content.height) / source.height,
    };
  }

  setPanelVisualScale(scale: number): void {
    this.panelVisualScale = scale;
    this.applyPortraitScaleCompensation();
    this.syncFullBodyPortraitAnchor();
  }

  setPortraitResponsiveScale(scale: number): void {
    if (this.portraitResponsiveScale === scale) return;
    this.portraitResponsiveScale = scale;
    this.applyFullBodyPortraitSizing();
  }

  setCharacter(character: RacingCharacter, presentation: CharacterPresentation): void {
    this.character = character;
    this.activeTab = 'pilot';
    const profile = getPilotProfile(character.id);
    if (!profile) throw new Error(`Falta o perfil narrativo do piloto "${character.id}".`);
    this.name.setText(profile.nome).setWordWrapWidth(0).setFontSize(this.artworkWidth(44));
    const headerTextSourceX = this.getHeaderTextSourceX();
    this.fitNameToFrame(this.artworkWidth(PILOT_CIRCLE_ARTWORK.textMaxRight - headerTextSourceX));
    this.name.setPosition(...this.framePoint(headerTextSourceX, 188));
    this.name.x -= getVisibleTextLeftOffset(this.name);
    this.profile.setText(profile.titulo).setColor(COLORS.white).setFontSize(this.artworkWidth(19))
      .setWordWrapWidth(this.artworkWidth(PILOT_CIRCLE_ARTWORK.textMaxRight - headerTextSourceX))
      .setPosition(...this.framePoint(headerTextSourceX, 254));
    alignVisibleTextLeft(this.profile, this.name);
    this.description.setText(profile.lore).setFontSize(this.artworkWidth(13))
      .setWordWrapWidth(this.artworkWidth(
        CHARACTER_DESCRIPTION_VIEWPORT.right - CHARACTER_DESCRIPTION_ORIGIN.x,
      )).setLineSpacing(1);
    const descriptionOrigin = this.framePoint(
      CHARACTER_DESCRIPTION_ORIGIN.x, CHARACTER_DESCRIPTION_ORIGIN.y,
    );
    this.descriptionViewportHeight = this.framePoint(0, CHARACTER_DESCRIPTION_VIEWPORT.bottom)[1]
      - descriptionOrigin[1];
    this.descriptionScrollOffset = 0;
    this.description.setPosition(...descriptionOrigin);
    const descriptionRight = this.framePoint(CHARACTER_DESCRIPTION_VIEWPORT.right, 0)[0];
    this.description.setWordWrapWidth(Math.max(1,
      descriptionRight - this.description.x - this.artworkWidth(CHARACTER_DESCRIPTION_RIGHT_INSET)));
    this.descriptionLoopHeight = configureDescriptionLoop(this.description, profile.lore);
    this.descriptionBaseY = this.description.y;
    this.descriptionScrollOffset = 0;
    const ultimateIcons = profile.ultimateIds
      .map(id => getUltimate(id))
      .filter((ultimate): ultimate is NonNullable<typeof ultimate> => ultimate !== undefined);
    const iconObjects = [this.characterIcon, this.secondaryUltimateIcon];
    iconObjects.forEach(icon => icon.setVisible(false));
    const visibleDiameter = this.artworkWidth(
      PILOT_CIRCLE_ARTWORK.innerDiameter * PILOT_CIRCLE_ARTWORK.visibleDiameterRatio,
    );
    const safeRadius = this.artworkWidth(
      PILOT_CIRCLE_ARTWORK.innerDiameter * PILOT_CIRCLE_ARTWORK.safeRadiusRatio,
    );
    ultimateIcons.slice(0, iconObjects.length).forEach((ultimate, index) => {
      const icon = iconObjects[index]!;
      if (!this.scene.textures.exists(ultimate.iconKey)) return;
      icon.setTexture(ultimate.iconKey).clearTint().setVisible(true);
      fitAndCenterVisibleArtwork(
        icon,
        visibleDiameter / (ultimateIcons.length > 1 ? 2 : 1),
        safeRadius / (ultimateIcons.length > 1 ? 1.5 : 1),
      );
      if (ultimateIcons.length > 1) {
        icon.x += (index === 0 ? -1 : 1) * visibleDiameter * 0.24;
      }
    });
    this.trackFlag.setTint(Phaser.Display.Color.HexStringToColor(
      presentation.flagAccent ?? presentation.accent,
    ).color);
    this.trackFrameAccent = presentation.flagAccent ?? presentation.accent;
    this.trackFlagIcon.setTexture(pilotWhiteIconTextureKey(character.id)).clearTint();
    this.syncCharacterIconAnchor();
    const fullBodyPortrait = FULL_BODY_PORTRAITS[character.id];
    const fullBodyPortraitKey = profile.fullBodyPortraitKey;
    this.activeFullBodyPortrait = fullBodyPortrait;
    this.activeFullBodyPortraitKey = fullBodyPortraitKey;
    if (fullBodyPortrait && fullBodyPortraitKey && this.scene.textures.exists(fullBodyPortraitKey)) {
      const source = this.scene.textures.get(fullBodyPortraitKey).getSourceImage();
      this.portrait.setTexture(fullBodyPortraitKey).setCrop(0, 0, source.width, source.height);
      this.portrait.preFX?.clear();
      const content = fullBodyPortrait.contentBounds;
      this.fullBodyBaseDisplayHeight = this.frameWidth(
        REFERENCE_CONTENT_HEIGHT * fullBodyPortrait.scale * source.height / content.height,
      );
    } else {
      this.fullBodyBaseDisplayHeight = 0;
      this.portrait.preFX?.clear();
      this.portrait.setTexture(`pilot-card-${character.id}`)
        .setCrop(PILOT_CARD_PORTRAIT.cropX, PILOT_CARD_PORTRAIT.cropY,
          PILOT_CARD_PORTRAIT.cropWidth, PILOT_CARD_PORTRAIT.cropHeight)
        .setDisplaySize(this.frameWidth(PILOT_CARD_PORTRAIT.width), this.frameWidth(PILOT_CARD_PORTRAIT.height))
        .setPosition(...this.framePoint(
          PILOT_CARD_PORTRAIT.x, PILOT_CARD_PORTRAIT.y,
        ));
    }
    this.portraitScaleCompensation = 1;
    this.applyFullBodyPortraitSizing();
    this.portrait.setVisible(true);
    if (presentation.planetArtworkKey
      && this.scene.textures.exists(presentation.planetArtworkKey)) {
      this.planetArtwork.setTexture(presentation.planetArtworkKey);
      fitArtwork(this.planetArtwork, 100, 92);
    }
    if (presentation.planetEmblemKey
      && this.scene.textures.exists(presentation.planetEmblemKey)) {
      this.planetEmblem.setTexture(presentation.planetEmblemKey).setDisplaySize(23, 23);
    }
    const trackArtworkKey = presentation.trackArtworkKey;
    const hasTrackArtwork = Boolean(trackArtworkKey && this.scene.textures.exists(trackArtworkKey));
    this.trackArtworkSourceKey = trackArtworkKey ?? '';
    this.hasTrackArtwork = (presentation.showTrackArtwork ?? false) && hasTrackArtwork;
    if (hasTrackArtwork && trackArtworkKey) {
      this.trackArtwork.setTexture(trackArtworkKey);
    }
    this.trackArtwork.setVisible(SHOW_TRACK_PREVIEW_ARTWORK && this.hasTrackArtwork);
    const trackTitle = `PISTA DE ${presentation.planetName.toLocaleUpperCase('pt-BR')}`;
    this.trackTitle.setText(trackTitle).setFontSize(this.frameWidth(TRACK_TITLE_FONT_SIZE));
    this.trackTitle.setVisible(true);
    this.planetName.setText(presentation.planetName);
    this.planetDescriptionContent = presentation.planetDescription;
    this.planetDescription.setText(this.planetDescriptionContent);
    this.planetDescriptionScrollOffset = 0;
    const showPlanetDetails = presentation.showPlanetDetails ?? false;
    this.hasPlanetDetails = showPlanetDetails;
    this.planetArtwork.setVisible(showPlanetDetails && Boolean(presentation.planetArtworkKey)
      && this.scene.textures.exists(presentation.planetArtworkKey ?? ''));
    this.planetEmblem.setVisible(false);
    this.planetName.setVisible(showPlanetDetails);
    this.planetDescription.setVisible(showPlanetDetails);
    this.planetTitle.setVisible(showPlanetDetails);
    const bonusEntries = Object.entries(getEffectivePilotBonusAttributes(character)) as Array<
      [PilotAttribute, number]
    >;
    this.bonusCards.forEach((card, index) => {
      const entry = bonusEntries[index];
      if (!entry) {
        card.setVisible(false);
        return;
      }
      const [attribute] = entry;
      card.setTexture(PILOT_BONUS_CARD_TEXTURE_KEYS[attribute]);
      fitArtwork(card, this.artworkWidth(BONUS_CARD_LAYOUT.maxWidth),
        this.artworkWidth(BONUS_CARD_LAYOUT.maxHeight));
      card.setPosition(...this.framePoint(
        BONUS_CARD_LAYOUT.centersX[index]!, BONUS_CARD_LAYOUT.centerY,
      )).setVisible(true);
    });
    this.updateVehiclePane();
    this.updateTabVisibility();
    this.drawTabs();
    this.syncTrackModule();
  }

  setTab(tab: 'pilot' | 'vehicle'): void {
    if (this.activeTab === tab) return;
    this.activeTab = tab;
    if (tab === 'vehicle') this.updateVehiclePane();
    this.updateTabVisibility();
    this.drawTabs();
  }

  private updateTabVisibility(): void {
    const pilotVisible = this.activeTab === 'pilot';
    this.portrait.setVisible(pilotVisible);
    this.description.setVisible(pilotVisible);
    this.loreTitle.setVisible(false);
    this.planetArtwork.setVisible(pilotVisible && this.hasPlanetDetails);
    this.planetEmblem.setVisible(false);
    this.trackArtwork.setVisible(SHOW_TRACK_PREVIEW_ARTWORK && pilotVisible && this.hasTrackArtwork);
    this.trackFrame.setVisible(pilotVisible);
    this.trackHeaderDecor.setVisible(SHOW_LEGACY_TRACK_PREVIEW_FRAME
      && pilotVisible && this.hasTrackArtwork);
    this.trackFlag.setVisible(SHOW_LEGACY_TRACK_PREVIEW_FRAME && pilotVisible && this.hasTrackArtwork);
    this.trackFlagIcon.setVisible(false);
    // A área da prévia mantém o título mesmo quando a arte da pista está oculta/ausente.
    this.trackTitle.setVisible(pilotVisible);
    this.planetTitle.setVisible(false);
    this.planetName.setVisible(pilotVisible && this.hasPlanetDetails);
    this.planetDescription.setVisible(pilotVisible && this.hasPlanetDetails);
    this.bonusTitle.setVisible(false);
    const bonusEntries = this.character
      ? Object.keys(getEffectivePilotBonusAttributes(this.character)) as PilotAttribute[]
      : [];
    this.bonusCards.forEach((card, index) => card.setVisible(pilotVisible && Boolean(bonusEntries[index])));
    this.vehiclePane.setVisible(!pilotVisible);
    this.profile.setVisible(pilotVisible);
    this.name.setVisible(true);
  }

  private updateVehiclePane(): void {
    const selected = getSelectedVehicle(this.scene.registry);
    this.vehicleName.setText(selected?.vehicle.name ?? 'SEM VEÍCULO')
      .setFontSize(20).setWordWrapWidth(this.frameWidth(700))
      .setPosition(...this.framePoint(395, 430));
    this.vehicleStatus.setText(selected
      ? `PINTURA: ${selected.paint.name}`
      : 'SEM VEÍCULO EQUIPADO. CONFIRME PARA ABRIR A SELEÇÃO.')
      .setFontSize(12).setPosition(...this.framePoint(395, 485))
      .setWordWrapWidth(this.frameWidth(500));
    const columns = [
      { indexes: [0, 1, 2], left: 355, width: 485 },
      { indexes: [3, 4, 5], left: 930, width: 595 },
    ];
    const rowPositions = [680, 755, 830];
    this.vehicleStatBars.clear();
    this.vehicleStatLabels.forEach((label, index) => {
      const attribute = VEHICLE_ATTRIBUTES[index]!;
      const value = selected?.vehicle.stats[attribute.key as keyof typeof selected.vehicle.stats];
      const column = columns[index < 3 ? 0 : 1]!;
      const y = rowPositions[index % 3]!;
      label.setFontSize(10).setPosition(...this.framePoint(column.left, y));
      this.vehicleStatValues[index]!.setFontSize(11)
        .setText(value === undefined ? '—' : `${value} / 100`)
        .setPosition(...this.framePoint(column.left + column.width, y));
      const topLeft = this.framePoint(column.left, y + 23);
      const barEnd = this.framePoint(column.left + column.width, y + 23);
      this.vehicleStatBars.fillStyle(0x342232, 1)
        .fillRoundedRect(topLeft[0], topLeft[1], barEnd[0] - topLeft[0], this.frameWidth(8), 4);
      if (value !== undefined && value > 0) {
        this.vehicleStatBars.fillStyle(0xff344c, 1)
          .fillRoundedRect(topLeft[0], topLeft[1], (barEnd[0] - topLeft[0]) * value / 100,
            this.frameWidth(8), 4);
      }
    });
  }

  syncTrackClip(): void {
    this.syncDesignSprites();
    this.syncCharacterIconAnchor();
    this.syncTrackModule();
    this.bonusCards.forEach((card, index) => {
      fitArtwork(card, this.artworkWidth(BONUS_CARD_LAYOUT.maxWidth),
        this.artworkWidth(BONUS_CARD_LAYOUT.maxHeight));
      card.setPosition(...this.framePoint(
        BONUS_CARD_LAYOUT.centersX[index]!, BONUS_CARD_LAYOUT.centerY,
      ));
    });
    this.syncScaledTextResolution(this.description);
    this.syncScaledTextResolution(this.planetName);
    this.syncScaledTextResolution(this.planetDescription);
    this.syncCharacterDescriptionViewport();
  }

  updateDescriptionAnimations(deltaMs: number): void {
    if (deltaMs <= 0) return;
    this.descriptionScrollOffset = advanceDescriptionLoop(
      this.descriptionScrollOffset, this.descriptionLoopHeight, deltaMs,
    );
    this.planetDescriptionScrollOffset = advanceDescriptionLoop(
      this.planetDescriptionScrollOffset, this.planetDescriptionLoopHeight, deltaMs,
    );
    this.applyLoreDescriptionScroll();
    this.applyPlanetDescriptionScroll();
  }

  private readonly onLoreWheel = (
    _pointer: Phaser.Input.Pointer,
    _gameObjects: Phaser.GameObjects.GameObject[],
    _deltaX: number,
    deltaY: number,
  ): void => {
    if (!this.descriptionLoopHeight) return;
    this.descriptionScrollOffset = wrapDescriptionOffset(
      this.descriptionScrollOffset + deltaY * LORE_WHEEL_PIXELS_PER_NOTCH,
      this.descriptionLoopHeight,
    );
    this.applyLoreDescriptionScroll();
  };

  private applyLoreDescriptionScroll(): void {
    this.description.y = this.descriptionBaseY - this.descriptionScrollOffset;
  }

  private readonly removeLoreInputListeners = (): void => {
    this.inputPlugin.off('wheel', this.onLoreWheel);
  };

  private syncCharacterIconAnchor(): void {
    this.characterIconLayer.setPosition(...this.framePoint(
      PILOT_CIRCLE_ARTWORK.center.x, PILOT_CIRCLE_ARTWORK.center.y,
    ));
  }

  private getHeaderTextSourceX(): number {
    return PILOT_CIRCLE_ARTWORK.outerRight + PILOT_CIRCLE_ARTWORK.textGapSourcePixels;
  }

  private drawTabs(): void {
    this.pilotTab.setPosition(...this.framePoint(640, 292));
    this.vehicleTab.setPosition(...this.framePoint(1175, 292));
    this.pilotTab.setSize(this.frameWidth(520), this.frameWidth(80));
    this.vehicleTab.setSize(this.frameWidth(520), this.frameWidth(80));
    this.pilotTabLabel.setPosition(...this.framePoint(640, 292))
      .setColor(this.activeTab === 'pilot' ? '#ff536a' : '#b8afb9');
    this.vehicleTabLabel.setPosition(...this.framePoint(1175, 292))
      .setColor(this.activeTab === 'vehicle' ? '#ff536a' : '#b8afb9');
  }

  private applyPlanetDescriptionScroll(): void {
    this.planetDescription.y = this.planetDescriptionBaseY - this.planetDescriptionScrollOffset;
  }

  private syncTrackModule(): void {
    const masterFrameSource = this.masterFrame.texture.getSourceImage();
    const panelCenterX = (TRACK_PANEL_VISIBLE_BOUNDS.left + TRACK_PANEL_VISIBLE_BOUNDS.right) / 2
      * PILOT_DETAILS_FRAME_SIZE.width / masterFrameSource.width + TRACK_FRAME_HORIZONTAL_OFFSET;
    const panelCenterY = (TRACK_PANEL_VISIBLE_BOUNDS.top + TRACK_PANEL_VISIBLE_BOUNDS.bottom) / 2
      * PILOT_DETAILS_FRAME_SIZE.height / masterFrameSource.height + TRACK_FRAME_VERTICAL_OFFSET;
    this.trackFrame
      .setTexture(createTrackFrameTexture(this.scene, this.trackFrameAccent))
      .setPosition(...this.framePoint(panelCenterX, panelCenterY));
    fitArtwork(this.trackFrame,
      this.artworkWidth(440 * TRACK_FRAME_SCALE),
      this.artworkWidth(185 * TRACK_FRAME_SCALE));
    this.trackFrame.setDisplaySize(
      this.trackFrame.displayWidth * TRACK_FRAME_WIDTH_SCALE,
      this.trackFrame.displayHeight,
    );
    const visibleCenterOffsetX = (
      (TRACK_FRAME_ALPHA_BOUNDS.left + TRACK_FRAME_ALPHA_BOUNDS.right) / 2
      - TRACK_FRAME_TEXTURE_SIZE.width / 2
    ) * this.trackFrame.displayWidth / TRACK_FRAME_TEXTURE_SIZE.width;
    const visibleCenterOffsetY = (
      (TRACK_FRAME_ALPHA_BOUNDS.top + TRACK_FRAME_ALPHA_BOUNDS.bottom) / 2
      - TRACK_FRAME_TEXTURE_SIZE.height / 2
    ) * this.trackFrame.displayHeight / TRACK_FRAME_TEXTURE_SIZE.height;
    this.trackFrame.setPosition(
      this.trackFrame.x - visibleCenterOffsetX,
      this.trackFrame.y - visibleCenterOffsetY,
    );
    const previewTextureKey = this.trackArtworkSourceKey
      ? createTrackPreviewTexture(this.scene, this.trackArtworkSourceKey)
      : undefined;
    if (previewTextureKey) this.trackArtwork.setTexture(previewTextureKey);
    this.trackArtwork
      .setPosition(this.trackFrame.x, this.trackFrame.y)
      .setDisplaySize(this.trackFrame.displayWidth, this.trackFrame.displayHeight)
      .setVisible(SHOW_TRACK_PREVIEW_ARTWORK && this.activeTab === 'pilot'
        && this.hasTrackArtwork && Boolean(previewTextureKey));
    this.trackHeaderDecor
      .setTexture(createTrackHeaderDecorTexture(this.scene))
      .setPosition(...this.framePoint(1272.5, 671.5))
      .setDisplaySize(this.artworkWidth(585), this.artworkWidth(243));
    this.trackFlag
      .setPosition(...this.framePoint(1465, 634.5))
      .setDisplaySize(this.artworkWidth(160), this.artworkWidth(125));
    this.trackFlagIcon
      .setPosition(...this.framePoint(1465, 634.5))
      .setDisplaySize(this.artworkWidth(42), this.artworkWidth(42));
    const flagScale = PILOT_DETAILS_FRAME_SIZE.width / PILOT_MASTER_FRAME_CROP.width;
    const flagCenterX = (PILOT_MASTER_FLAG_CROP.x + PILOT_MASTER_FLAG_CROP.width / 2
      - PILOT_MASTER_FRAME_CROP.x) * flagScale;
    const flagCenterY = (PILOT_MASTER_FLAG_CROP.y + PILOT_MASTER_FLAG_CROP.height / 2
      - PILOT_MASTER_FRAME_CROP.y) * flagScale;
    this.trackFlag
      .setPosition(...this.framePoint(flagCenterX, flagCenterY))
      .setDisplaySize(this.artworkWidth(PILOT_MASTER_FLAG_CROP.width * flagScale),
        this.artworkWidth(PILOT_MASTER_FLAG_CROP.height * flagScale));
    const titleMaxWidth = this.trackFrame.displayWidth
      * (TRACK_TITLE_BAND.right - TRACK_TITLE_BAND.left - TRACK_TITLE_BAND.insetX * 2)
      / TRACK_FRAME_TEXTURE_SIZE.width;
    const titleMaxHeight = this.trackFrame.displayHeight
      * (TRACK_TITLE_BAND.bottom - TRACK_TITLE_BAND.top - TRACK_TITLE_BAND.insetY * 2)
      / TRACK_FRAME_TEXTURE_SIZE.height;
    const titleCenterY = this.trackFrame.y
      + ((TRACK_TITLE_BAND.top + TRACK_TITLE_BAND.bottom) / 2
        - TRACK_FRAME_TEXTURE_SIZE.height / 2)
        * this.trackFrame.displayHeight / TRACK_FRAME_TEXTURE_SIZE.height;
    const titleLeft = this.trackFrame.x
      + (TRACK_TITLE_BAND.left + TRACK_TITLE_BAND.insetX
        - TRACK_FRAME_TEXTURE_SIZE.width / 2)
        * this.trackFrame.displayWidth / TRACK_FRAME_TEXTURE_SIZE.width;
    const titleFontSize = this.artworkWidth(TRACK_TITLE_FONT_SIZE);
    this.trackTitle.setOrigin(0, 0.5).setFontSize(titleFontSize)
      .setStroke('#050507', Math.max(0.5, titleFontSize * 0.18))
      .setShadow(1, 1, '#000000', Math.min(2, titleFontSize * 0.18), true, true);
    const visibleTitleBounds = getVisibleTextBounds(this.trackTitle);
    const targetTitleHeight = titleMaxHeight * 0.9;
    const titleHorizontalScale = Math.min(1, titleMaxWidth * 0.95 / visibleTitleBounds.width);
    const titleVerticalScale = targetTitleHeight / visibleTitleBounds.height;
    this.trackTitle.setScale(titleHorizontalScale, titleVerticalScale)
      .setPosition(titleLeft,
        titleCenterY - getVisibleTextCenterOffsetY(this.trackTitle) * titleVerticalScale);
    this.syncScaledTextResolution(this.trackTitle);
    if (this.planetArtwork.visible) {
      this.planetArtwork.setPosition(...this.framePoint(
        PLANET_ARTWORK_CENTER.x, PLANET_ARTWORK_CENTER.y,
      ));
      fitArtwork(this.planetArtwork, this.artworkWidth(PLANET_ARTWORK_SIZE),
        this.artworkWidth(PLANET_ARTWORK_SIZE));
      this.planetDescription.setText(this.planetDescriptionContent);
      this.planetName.setFontSize(this.artworkWidth(27))
        .setPosition(...this.framePoint(PLANET_TEXT_LAYOUT.x, PLANET_TEXT_LAYOUT.top));
      const planetNameMaxWidth = this.artworkWidth(PLANET_TEXT_LAYOUT.maxWidth);
      if (this.planetName.width > planetNameMaxWidth) {
        this.planetName.setScale(planetNameMaxWidth / this.planetName.width, 1);
      } else {
        this.planetName.setScale(1);
      }
      this.planetDescription
        .setFontSize(this.artworkWidth(12))
        .setLineSpacing(1)
        .setWordWrapWidth(this.artworkWidth(PLANET_TEXT_LAYOUT.descriptionWidth))
        .setPosition(...this.framePoint(
          PLANET_TEXT_LAYOUT.x,
          PLANET_TEXT_LAYOUT.top + PLANET_TEXT_LAYOUT.descriptionOffsetY,
        ));
      let descriptionFontSize = this.artworkWidth(12);
      const minimumDescriptionFontSize = this.artworkWidth(9);
      const descriptionViewportHeight = this.artworkWidth(PLANET_DESCRIPTION_MAX_HEIGHT);
      while (this.planetDescription.height > descriptionViewportHeight
        && descriptionFontSize > minimumDescriptionFontSize) {
        descriptionFontSize = Math.max(minimumDescriptionFontSize,
          descriptionFontSize - this.artworkWidth(1));
        this.planetDescription.setFontSize(descriptionFontSize);
      }
      this.planetDescriptionLoopHeight = configureDescriptionLoop(
        this.planetDescription, this.planetDescriptionContent,
      );
      this.planetDescriptionScrollOffset = 0;
      alignPlanetTextColumnLeft(this.planetName, this.planetDescription);
      this.planetDescriptionBaseY = this.planetDescription.y;
      this.planetDescriptionViewportWidth = this.artworkWidth(PLANET_TEXT_LAYOUT.descriptionWidth);
      this.planetDescriptionViewportHeight = descriptionViewportHeight;
      this.applyPlanetDescriptionScroll();
      this.syncPlanetDescriptionViewport();
    }
  }

  private alignPurpleBandTitle(
    title: Phaser.GameObjects.Text,
    alignment: PurpleBandTitleAlignment,
  ): void {
    const [textX] = this.framePoint(alignment.textX, 0);
    const markerCenterSourceY = (alignment.marker.top + alignment.marker.bottom) / 2;
    const markerCenterY = artworkPoint(
      this.panelArtwork.y,
      this.panelArtwork.height,
      PILOT_DETAILS_FRAME_SIZE.height,
      markerCenterSourceY,
    );
    const availableWidth = alignment.textMaxRight - alignment.textX;
    const maxWidth = this.frameWidth(availableWidth);
    let fontSize = PURPLE_BAND_TITLE_FONT_SIZE;
    title.setOrigin(0, 0.5).setPosition(textX, markerCenterY).setFontSize(fontSize);
    while (title.width > maxWidth && fontSize > 8) {
      fontSize -= 1;
      title.setFontSize(fontSize);
    }
    title.y = markerCenterY - getVisibleTextCenterOffsetY(title);
  }

  private syncPlanetDescriptionViewport(): void {
    if (!this.planetDescription.visible) return;
    const matrix = this.getWorldTransformMatrix();
    const topLeft = matrix.transformPoint(this.planetDescription.x, this.planetDescriptionBaseY);
    const bottomRight = matrix.transformPoint(
      this.planetDescription.x + this.planetDescriptionViewportWidth,
      this.planetDescriptionBaseY + this.planetDescriptionViewportHeight,
    );
    const planetNameBottom = this.planetName.getBounds().bottom;
    const clipTop = planetNameBottom + this.frameWidth(PLANET_DESCRIPTION_TOP_GAP)
      * Math.hypot(matrix.c, matrix.d);
    this.planetDescriptionClip.clear().fillStyle(0xffffff, 1)
      .fillRect(topLeft.x, clipTop, bottomRight.x - topLeft.x, bottomRight.y - clipTop);
  }

  private framePoint(sourceX: number, sourceY: number): [number, number] {
    const frame = this.getReplacementFrameGeometry();
    return [
      frame.x + (sourceX - PILOT_DETAILS_FRAME_SIZE.width / 2)
        * frame.width / PILOT_DETAILS_FRAME_SIZE.width,
      frame.y + (sourceY - PILOT_DETAILS_FRAME_SIZE.height / 2)
        * frame.height / PILOT_DETAILS_FRAME_SIZE.height,
    ];
  }

  private frameWidth(sourceWidth: number): number {
    return sourceWidth * this.panelArtwork.width / PILOT_DETAILS_FRAME_SIZE.width;
  }

  private artworkWidth(sourceWidth: number): number {
    return this.frameWidth(sourceWidth * REPLACEMENT_FRAME_SCALE);
  }

  private syncCharacterDescriptionViewport(): void {
    const topLeftLocal = this.framePoint(
      CHARACTER_DESCRIPTION_VIEWPORT.left, CHARACTER_DESCRIPTION_VIEWPORT.top,
    );
    const bottomRightLocal = this.framePoint(
      CHARACTER_DESCRIPTION_VIEWPORT.right, CHARACTER_DESCRIPTION_VIEWPORT.bottom,
    );
    const matrix = this.getWorldTransformMatrix();
    const topLeft = matrix.transformPoint(topLeftLocal[0], topLeftLocal[1]);
    const bottomRight = matrix.transformPoint(bottomRightLocal[0], bottomRightLocal[1]);
    this.loreClip.clear().fillStyle(0xffffff, 1).fillRect(
      topLeft.x, topLeft.y, bottomRight.x - topLeft.x, bottomRight.y - topLeft.y,
    );
    this.loreScrollZone
      .setPosition(topLeftLocal[0], topLeftLocal[1])
      .setSize(bottomRightLocal[0] - topLeftLocal[0], bottomRightLocal[1] - topLeftLocal[1]);
  }

  private syncScaledTextResolution(gameText: Phaser.GameObjects.Text): void {
    const matrix = gameText.getWorldTransformMatrix();
    const scaleX = Math.hypot(matrix.a, matrix.b);
    const scaleY = Math.hypot(matrix.c, matrix.d);
    const deviceScale = Math.max(window.devicePixelRatio || 1, 1);
    const resolution = Math.max(DETAIL_TEXT_RESOLUTION,
      Math.ceil(Math.max(scaleX, scaleY) * deviceScale));

    if (gameText.style.resolution !== resolution) {
      gameText.setResolution(resolution);
    }
  }

  private readonly disposeDescriptionMasks = (): void => {
    this.description.clearMask(true);
    this.planetDescription.clearMask(true);
  };

  private fitNameToFrame(maxWidth: number): void {
    let fontSize = this.artworkWidth(44);
    while (this.name.width > maxWidth && fontSize > this.artworkWidth(26)) {
      fontSize -= this.artworkWidth(1);
      this.name.setFontSize(fontSize);
    }
  }

  private applyPortraitScaleCompensation(): void {
    const targetCompensation = 1 / this.panelVisualScale;
    const relativeCompensation = targetCompensation / this.portraitScaleCompensation;
    this.portrait.setScale(
      this.portrait.scaleX * relativeCompensation,
      this.portrait.scaleY * relativeCompensation,
    );
    this.portraitScaleCompensation = targetCompensation;
  }

  private applyFullBodyPortraitSizing(): void {
    const portraitSpec = this.activeFullBodyPortrait;
    const portraitKey = this.activeFullBodyPortraitKey;
    if (!portraitSpec || !portraitKey || this.fullBodyBaseDisplayHeight <= 0) return;
    const source = this.scene.textures.get(portraitKey).getSourceImage();
    const displayHeight = this.fullBodyBaseDisplayHeight * this.portraitResponsiveScale;
    this.portraitScaleCompensation = 1;
    this.portrait.setDisplaySize(source.width * displayHeight / source.height, displayHeight);
    this.applyPortraitScaleCompensation();
    this.syncFullBodyPortraitAnchor();
  }

  private syncFullBodyPortraitAnchor(): void {
    const portraitSpec = this.activeFullBodyPortrait;
    const portraitKey = this.activeFullBodyPortraitKey;
    if (!portraitSpec || !portraitKey) return;

    const source = this.scene.textures.get(portraitKey).getSourceImage();
    const content = portraitSpec.contentBounds;
    const sourcePixelScale = this.portrait.displayHeight / source.height;
    this.portrait.setPosition(
      FULL_BODY_PORTRAIT_ANCHOR.centerX
        - (content.x + content.width / 2 - source.width / 2) * sourcePixelScale,
      FULL_BODY_PORTRAIT_ANCHOR.feetY
        - (content.y + content.height - source.height / 2) * sourcePixelScale,
    );
  }

  private syncDesignSprites(): void {
    const frame = this.getReplacementFrameGeometry();
    this.masterFrame
      .setPosition(frame.x, frame.y)
      .setDisplaySize(frame.width, frame.height)
      .setVisible(true);
  }

  private getReplacementFrameGeometry(): { x: number; y: number; width: number; height: number } {
    const legacyDisplayWidth = this.frameWidth(PILOT_DETAILS_FRAME_SIZE.width);
    const legacyDisplayHeight = this.frameWidth(
      PILOT_DETAILS_FRAME_SIZE.width * PILOT_MASTER_FRAME_CROP.height / PILOT_MASTER_FRAME_CROP.width,
    );
    const replacementDisplayWidth = this.frameWidth(
      PILOT_DETAILS_FRAME_SIZE.width * REPLACEMENT_FRAME_SCALE,
    );
    const replacementDisplayHeight = this.frameWidth(
      PILOT_DETAILS_FRAME_SIZE.height * REPLACEMENT_FRAME_SCALE,
    );
    const legacyVisibleCenterX = (LEGACY_FRAME_VISIBLE_BOUNDS.x
      + LEGACY_FRAME_VISIBLE_BOUNDS.width / 2 - PILOT_MASTER_FRAME_CROP.width / 2)
      * legacyDisplayWidth / PILOT_MASTER_FRAME_CROP.width;
    const legacyVisibleCenterY = (LEGACY_FRAME_VISIBLE_BOUNDS.y
      + LEGACY_FRAME_VISIBLE_BOUNDS.height / 2 - PILOT_MASTER_FRAME_CROP.height / 2)
      * legacyDisplayHeight / PILOT_MASTER_FRAME_CROP.height;
    const replacementVisibleCenterX = (REPLACEMENT_FRAME_VISIBLE_BOUNDS.x
      + REPLACEMENT_FRAME_VISIBLE_BOUNDS.width / 2 - PILOT_DETAILS_FRAME_SIZE.width / 2)
      * replacementDisplayWidth / PILOT_DETAILS_FRAME_SIZE.width;
    const replacementVisibleCenterY = (REPLACEMENT_FRAME_VISIBLE_BOUNDS.y
      + REPLACEMENT_FRAME_VISIBLE_BOUNDS.height / 2 - PILOT_DETAILS_FRAME_SIZE.height / 2)
      * replacementDisplayHeight / PILOT_DETAILS_FRAME_SIZE.height;

    return {
      x: legacyVisibleCenterX - replacementVisibleCenterX,
      y: legacyVisibleCenterY - replacementVisibleCenterY,
      width: replacementDisplayWidth,
      height: replacementDisplayHeight,
    };
  }
}

function makeLoopingDescription(content: string): string {
  return `${content}${'\n'.repeat(DESCRIPTION_LOOP_GAP_LINES)}${content}`;
}

function configureDescriptionLoop(
  textObject: Phaser.GameObjects.Text,
  content: string,
): number {
  textObject.setText(content);
  const contentHeight = textObject.height;
  const fontSize = Number.parseFloat(String(textObject.style.fontSize)) || 10;
  const lineSpacing = 1;
  const lineHeight = fontSize + lineSpacing;
  textObject.setText(makeLoopingDescription(content));
  const actualLoopHeight = textObject.height - contentHeight;
  return Math.max(lineHeight, actualLoopHeight);
}

function advanceDescriptionLoop(offset: number, loopHeight: number, deltaMs: number): number {
  return loopHeight > 0
    ? wrapDescriptionOffset(offset + Math.min(deltaMs, 50) * DESCRIPTION_SCROLL_SPEED, loopHeight)
    : 0;
}

function wrapDescriptionOffset(offset: number, loopHeight: number): number {
  if (loopHeight <= 0) return 0;
  return ((offset % loopHeight) + loopHeight) % loopHeight;
}

function fitArtwork(image: Phaser.GameObjects.Image, maxWidth: number, maxHeight: number): void {
  const source = image.texture.getSourceImage();
  const aspectRatio = source.width / source.height;
  const width = Math.min(maxWidth, maxHeight * aspectRatio);
  image.setDisplaySize(width, width / aspectRatio);
}

function createTrackPreviewTexture(scene: Phaser.Scene, sourceKey: string): string | undefined {
  const textureKey = `track-preview-${sourceKey}`;
  if (scene.textures.exists(textureKey)) return textureKey;

  const apertureMask = createTrackApertureMask(scene);
  if (!apertureMask) return undefined;
  const source = scene.textures.get(sourceKey).getSourceImage();
  if (!(source instanceof HTMLImageElement || source instanceof HTMLCanvasElement)) return undefined;
  const texture = scene.textures.createCanvas(textureKey,
    TRACK_FRAME_TEXTURE_SIZE.width, TRACK_FRAME_TEXTURE_SIZE.height);
  if (!texture) return undefined;

  const sourceAspect = source.width / source.height;
  const targetAspect = TRACK_FRAME_TEXTURE_SIZE.width / TRACK_FRAME_TEXTURE_SIZE.height;
  let sourceX = 0;
  let sourceY = 0;
  let sourceWidth = source.width;
  let sourceHeight = source.height;
  if (sourceAspect > targetAspect) {
    sourceWidth = source.height * targetAspect;
    sourceX = (source.width - sourceWidth) / 2;
  } else {
    sourceHeight = source.width / targetAspect;
    sourceY = (source.height - sourceHeight) / 2;
  }

  texture.context.drawImage(source, sourceX, sourceY, sourceWidth, sourceHeight,
    0, 0, TRACK_FRAME_TEXTURE_SIZE.width, TRACK_FRAME_TEXTURE_SIZE.height);
  texture.context.globalCompositeOperation = 'destination-in';
  texture.context.drawImage(apertureMask, 0, 0);
  texture.context.globalCompositeOperation = 'source-over';
  texture.refresh();
  return textureKey;
}

function createTrackFrameTexture(scene: Phaser.Scene, accent: string): string {
  const colorMatch = /^#?([\da-f]{6})$/i.exec(accent);
  if (!colorMatch) return TRACK_EMPTY_QUADRANT_FRAME_TEXTURE_KEY;
  const textureKey = `pilot-track-frame-${colorMatch[1]!.toLowerCase()}`;
  if (scene.textures.exists(textureKey)) return textureKey;

  const source = scene.textures.get(TRACK_EMPTY_QUADRANT_FRAME_TEXTURE_KEY).getSourceImage();
  if (!(source instanceof HTMLImageElement || source instanceof HTMLCanvasElement)) {
    return TRACK_EMPTY_QUADRANT_FRAME_TEXTURE_KEY;
  }
  const canvas = document.createElement('canvas');
  canvas.width = TRACK_FRAME_TEXTURE_SIZE.width;
  canvas.height = TRACK_FRAME_TEXTURE_SIZE.height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return TRACK_EMPTY_QUADRANT_FRAME_TEXTURE_KEY;
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  recolorTrackFlag(context, canvas.width, canvas.height, `#${colorMatch[1]!}`);
  const texture = scene.textures.addCanvas(textureKey, canvas);
  texture?.refresh();
  return texture ? textureKey : TRACK_EMPTY_QUADRANT_FRAME_TEXTURE_KEY;
}

function createTrackHeaderDecorTexture(scene: Phaser.Scene): string {
  const textureKey = 'riff-details-track-header-decor';
  if (scene.textures.exists(textureKey)) return textureKey;

  const source = scene.textures.get('riff-details-track-frame').getSourceImage();
  if (!(source instanceof HTMLImageElement || source instanceof HTMLCanvasElement)) {
    return 'riff-details-track-frame';
  }
  const texture = scene.textures.createCanvas(textureKey, source.width, source.height);
  if (!texture) return 'riff-details-track-frame';

  texture.context.drawImage(source,
    TRACK_FRAME_HEADER_REGION.x,
    TRACK_FRAME_HEADER_REGION.y,
    TRACK_FRAME_HEADER_REGION.width,
    TRACK_FRAME_HEADER_REGION.height,
    TRACK_FRAME_HEADER_REGION.x,
    TRACK_FRAME_HEADER_REGION.y,
    TRACK_FRAME_HEADER_REGION.width,
    TRACK_FRAME_HEADER_REGION.height,
  );
  texture.refresh();
  return textureKey;
}

function createTrackApertureMask(scene: Phaser.Scene): HTMLCanvasElement | undefined {
  if (scene.textures.exists(TRACK_APERTURE_MASK_TEXTURE_KEY)) {
    const cached = scene.textures.get(TRACK_APERTURE_MASK_TEXTURE_KEY).getSourceImage();
    if (cached instanceof HTMLCanvasElement) return cached;
  }

  const frameSource = scene.textures.get(TRACK_EMPTY_QUADRANT_FRAME_TEXTURE_KEY).getSourceImage();
  if (!(frameSource instanceof HTMLImageElement || frameSource instanceof HTMLCanvasElement)) return;

  const width = TRACK_FRAME_TEXTURE_SIZE.width;
  const height = TRACK_FRAME_TEXTURE_SIZE.height;
  const frameCanvas = document.createElement('canvas');
  frameCanvas.width = width;
  frameCanvas.height = height;
  const frameContext = frameCanvas.getContext('2d', { willReadFrequently: true });
  if (!frameContext) return;
  frameContext.drawImage(frameSource, 0, 0, width, height);
  const framePixels = frameContext.getImageData(0, 0, width, height).data;
  const pixelCount = width * height;
  const visited = new Uint8Array(pixelCount);
  const queue = new Int32Array(pixelCount);
  const maskPixels = frameContext.createImageData(width, height);
  const seed = TRACK_FRAME_APERTURE_SEED.y * width + TRACK_FRAME_APERTURE_SEED.x;
  if (framePixels[seed * 4 + 3]! > 16) return;

  let head = 0;
  let tail = 0;
  queue[tail++] = seed;
  visited[seed] = 1;
  const visit = (neighbor: number): void => {
    if (neighbor < 0 || visited[neighbor]
      || framePixels[neighbor * 4 + 3]! > 16) return;
    visited[neighbor] = 1;
    queue[tail++] = neighbor;
  };
  while (head < tail) {
    const index = queue[head++]!;
    const x = index % width;
    const offset = index * 4;
    maskPixels.data[offset] = 255;
    maskPixels.data[offset + 1] = 255;
    maskPixels.data[offset + 2] = 255;
    maskPixels.data[offset + 3] = 255;
    visit(x > 0 ? index - 1 : -1);
    visit(x + 1 < width ? index + 1 : -1);
    visit(index >= width ? index - width : -1);
    visit(index + width < pixelCount ? index + width : -1);
  }

  const apertureMask = document.createElement('canvas');
  apertureMask.width = width;
  apertureMask.height = height;
  const context = apertureMask.getContext('2d');
  if (!context) return;
  context.putImageData(maskPixels, 0, 0);
  scene.textures.addCanvas(TRACK_APERTURE_MASK_TEXTURE_KEY, apertureMask)?.refresh();
  return apertureMask;
}

function recolorTrackFlag(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  accent: string,
): void {
  const match = /^#([\da-f]{6})$/i.exec(accent);
  if (!match) return;
  const hex = Number.parseInt(match[1]!, 16);
  const [targetHue, targetSaturation] = rgbToHsv(
    (hex >> 16) & 0xff,
    (hex >> 8) & 0xff,
    hex & 0xff,
  );
  const image = context.getImageData(0, 0, width, height);
  const pixels = image.data;
  const region = TRACK_FLAG_RECOLOR_REGION;
  for (let y = region.top; y < Math.min(region.bottom, height); y += 1) {
    for (let x = region.left; x < Math.min(region.right, width); x += 1) {
      const offset = (y * width + x) * 4;
      if (pixels[offset + 3]! <= 16) continue;
      const [hue, saturation, value] = rgbToHsv(
        pixels[offset]!, pixels[offset + 1]!, pixels[offset + 2]!,
      );
      if (hue < 0.17 || hue > 0.48 || saturation < 0.16) continue;
      const [red, green, blue] = hsvToRgb(targetHue, Math.max(targetSaturation, 0.68), value);
      pixels[offset] = red;
      pixels[offset + 1] = green;
      pixels[offset + 2] = blue;
    }
  }
  context.putImageData(image, 0, 0);
}

function rgbToHsv(red: number, green: number, blue: number): [number, number, number] {
  const r = red / 255;
  const g = green / 255;
  const b = blue / 255;
  const maximum = Math.max(r, g, b);
  const minimum = Math.min(r, g, b);
  const delta = maximum - minimum;
  let hue = 0;
  if (delta > 0) {
    if (maximum === r) hue = ((g - b) / delta) % 6;
    else if (maximum === g) hue = (b - r) / delta + 2;
    else hue = (r - g) / delta + 4;
    hue /= 6;
    if (hue < 0) hue += 1;
  }
  return [hue, maximum === 0 ? 0 : delta / maximum, maximum];
}

function hsvToRgb(hue: number, saturation: number, value: number): [number, number, number] {
  const sector = hue * 6;
  const index = Math.floor(sector);
  const fraction = sector - index;
  const p = value * (1 - saturation);
  const q = value * (1 - fraction * saturation);
  const t = value * (1 - (1 - fraction) * saturation);
  const channels: readonly [number, number, number] = [
    [value, q, p, p, t, value][index % 6]!,
    [t, value, value, q, p, p][index % 6]!,
    [p, p, t, value, value, q][index % 6]!,
  ];
  return channels.map(channel => Math.round(channel * 255)) as [number, number, number];
}

function artworkPoint(center: number, displaySize: number, sourceSize: number, sourcePoint: number): number {
  return center + (sourcePoint - sourceSize / 2) * displaySize / sourceSize;
}

function getVisibleTextCenterOffsetY(title: Phaser.GameObjects.Text): number {
  const context = title.canvas.getContext('2d');
  if (!context || title.height <= 0) return 0;

  const { width, height } = title.canvas;
  const pixels = context.getImageData(0, 0, width, height).data;
  let top = height;
  let bottom = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (pixels[(y * width + x) * 4 + 3]! <= 32) continue;
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
    }
  }
  if (bottom < top) return 0;

  const canvasScaleY = height / title.height;
  const visibleCenterY = (top + bottom + 1) / 2 / canvasScaleY;
  return visibleCenterY - title.displayOriginY;
}

function getVisibleTextBounds(title: Phaser.GameObjects.Text): {
  left: number; top: number; right: number; bottom: number; width: number; height: number;
} {
  const context = title.canvas.getContext('2d');
  if (!context || title.width <= 0 || title.height <= 0) {
    return { left: 0, top: 0, right: title.width, bottom: title.height,
      width: title.width, height: title.height };
  }

  const { width, height } = title.canvas;
  const pixels = context.getImageData(0, 0, width, height).data;
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (pixels[(y * width + x) * 4 + 3]! <= 32) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x + 1);
      bottom = Math.max(bottom, y + 1);
    }
  }
  if (right < 0) {
    return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 };
  }

  const canvasScaleX = width / title.width;
  const canvasScaleY = height / title.height;
  const visibleBounds = {
    left: left / canvasScaleX - title.displayOriginX,
    top: top / canvasScaleY - title.displayOriginY,
    right: right / canvasScaleX - title.displayOriginX,
    bottom: bottom / canvasScaleY - title.displayOriginY,
  };
  return {
    ...visibleBounds,
    width: visibleBounds.right - visibleBounds.left,
    height: visibleBounds.bottom - visibleBounds.top,
  };
}

function alignVisibleTextLeft(
  textObject: Phaser.GameObjects.Text,
  reference: Phaser.GameObjects.Text,
): void {
  textObject.x = reference.x
    + getVisibleTextLeftOffset(reference)
    - getVisibleTextLeftOffset(textObject, true);
}

function alignPlanetTextColumnLeft(
  name: Phaser.GameObjects.Text,
  description: Phaser.GameObjects.Text,
): void {
  const visibleNameLeft = name.x + getVisibleTextLeftOffset(name) * name.scaleX;
  description.x = visibleNameLeft
    - getVisibleTextLeftOffset(description, true) * description.scaleX;
}

function getVisibleTextLeftOffset(
  textObject: Phaser.GameObjects.Text,
  firstLineOnly = false,
): number {
  const context = textObject.canvas.getContext('2d');
  if (!context || textObject.width <= 0) return -textObject.displayOriginX;

  const { width, height } = textObject.canvas;
  const pixels = context.getImageData(0, 0, width, height).data;
  let left = width;
  let lastInkRow = -1;
  for (let y = 0; y < height; y += 1) {
    let rowLeft = width;
    for (let x = 0; x < width; x += 1) {
      if (pixels[(y * width + x) * 4 + 3] > 0) rowLeft = Math.min(rowLeft, x);
    }
    if (rowLeft === width) continue;
    if (firstLineOnly && lastInkRow >= 0 && y - lastInkRow > 3) break;
    left = Math.min(left, rowLeft);
    lastInkRow = y;
  }
  if (left === width) return -textObject.displayOriginX;

  const canvasScaleX = width / textObject.width;
  return left / canvasScaleX - textObject.displayOriginX;
}

function fitAndCenterVisibleArtwork(
  image: Phaser.GameObjects.Image,
  visibleDiameter: number,
  safeRadius: number,
): void {
  const source = image.texture.getSourceImage();
  const isCanvas = source instanceof HTMLCanvasElement;
  if (!isCanvas && !(source instanceof HTMLImageElement)) {
    image.setPosition(0, 0);
    return;
  }
  const width = isCanvas ? source.width : source.naturalWidth;
  const height = isCanvas ? source.height : source.naturalHeight;
  const canvas = isCanvas ? source : document.createElement('canvas');
  if (!isCanvas) {
    canvas.width = width;
    canvas.height = height;
  }
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) {
    image.setPosition(0, 0);
    return;
  }

  let pixels: Uint8ClampedArray;
  try {
    if (canvas !== source) context.drawImage(source, 0, 0, width, height);
    pixels = context.getImageData(0, 0, width, height).data;
  } catch {
    image.setPosition(0, 0);
    return;
  }
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (pixels[(y * width + x) * 4 + 3] <= 16) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x + 1);
      bottom = Math.max(bottom, y + 1);
    }
  }

  if (right < 0) {
    image.setPosition(0, 0);
    return;
  }

  const visibleCenterX = (left + right) / 2;
  const visibleCenterY = (top + bottom) / 2;
  let maxRadiusSquared = 0;
  for (let y = top; y < bottom; y += 1) {
    for (let x = left; x < right; x += 1) {
      if (pixels[(y * width + x) * 4 + 3] <= 16) continue;
      const dx = x + 0.5 - visibleCenterX;
      const dy = y + 0.5 - visibleCenterY;
      maxRadiusSquared = Math.max(maxRadiusSquared, dx * dx + dy * dy);
    }
  }
  if (maxRadiusSquared === 0) {
    image.setPosition(0, 0);
    return;
  }
  const scale = Math.min(
    visibleDiameter / Math.max(right - left, bottom - top),
    safeRadius / Math.sqrt(maxRadiusSquared),
  );
  image.setDisplaySize(width * scale, height * scale);
  image.setPosition(
    -(visibleCenterX - width / 2) * scale,
    -(visibleCenterY - height / 2) * scale,
  );
}
