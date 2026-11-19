import Phaser from 'phaser';
import { pilotIconTextureKey, pilotPortraitTextureKey, pilotWhiteIconTextureKey } from '../data/pilotIcons.ts';
import { getPilotProfile, PILOT_PROFILES } from '../data/pilotos/index.ts';
import { getUltimate } from '../data/ultimates.ts';
import { VEHICLE_TUNING_FIELDS, type VehicleTuningField } from '../data/vehicleTuningSchema.ts';
import guideArtwork from '../assets/ui/character-selection/character-selection-ui-guide.png';
import pilotRosterArtwork from '../assets/ui/character-selection/pilot-roster-sprite-sheet.png';
import axelRyderFullBodyArtwork from '../assets/characters/portraits/axel-ryder-full-body.png';
import brokThornFullBodyArtwork from '../assets/characters/portraits/brok-thorn-full-body.png';
import neonKiraFullBodyArtwork from '../assets/characters/portraits/neon-kira-full-body.png';
import leonardLyonFullBodyArtwork from '../assets/characters/portraits/leonard-lyon-full-body.png';
import roxZ7FullBodyArtwork from '../assets/characters/portraits/rox-z7-full-body.png';
import vyraNoctisFullBodyArtwork from '../assets/characters/portraits/vyra-noctis-full-body.png';
import daggerRavenFullBodyArtwork from '../assets/characters/portraits/dagger-raven-full-body.png';
import cyberDragonFullBodyArtwork from '../assets/characters/portraits/cyber-dragon-full-body.png';
import drakMareFullBodyArtwork from '../assets/characters/portraits/drax-mare-full-body.png';
import pilotMasterFrameArtwork from '../assets/ui/character-selection/frames/pilot-master-frame.png';
// Textura derivada do asset selecionado, encaixada na área visível da moldura existente.
import replacementPilotFrameArtwork from '../assets/moldura_principal_encaixada.png';
import greenFlagTrackFrameArtwork from '../assets/Moldura cromada com bandeira verde.png';
import bonusSpeedArtwork from '../assets/ui/character-selection/bonus-attributes/speed.png';
import bonusAccelerationArtwork from '../assets/ui/character-selection/bonus-attributes/acceleration.png';
import bonusControlArtwork from '../assets/ui/character-selection/bonus-attributes/control.png';
import bonusArmorArtwork from '../assets/ui/character-selection/bonus-attributes/armor.png';
import bonusTiresArtwork from '../assets/ui/character-selection/bonus-attributes/tires.png';
import bonusSuspensionArtwork from '../assets/ui/character-selection/bonus-attributes/suspension.png';
import bonusShotsArtwork from '../assets/ui/character-selection/bonus-attributes/shotCount.png';
import bonusBombsArtwork from '../assets/ui/character-selection/bonus-attributes/bombCount.png';
import bonusOilArtwork from '../assets/ui/character-selection/bonus-attributes/oilSlickCount.png';
import voltarisWorld from '../assets/planets/voltaris-world.png';
import voltarisTrack from '../assets/tracks/previews/voltaris-track.png';
import voltarisGlobeArtwork from '../assets/planets/voltaris-globe.png';
import neonKiraPlanetArtwork from '../assets/planets/neon-kira-planet.png';
import brokThornPlanetArtwork from '../assets/planets/brok-thorn-planet.png';
import leonardLyonPlanetArtwork from '../assets/planets/leonard-lyon-planet.png';
import roxZ7PlanetArtwork from '../assets/planets/rox-z7-planet.png';
import bladeRavenPlanetArtwork from '../assets/planets/dagger-raven-planet.png';
import vyraNoctisPlanetArtwork from '../assets/planets/vyra-noctis-planet.png';
import cyberDragonPlanetArtwork from '../assets/planets/cyber-dragon-planet.png';
import drakMarePlanetArtwork from '../assets/planets/drax-mare-planet.png';
import axelRyderTrackArtwork from '../assets/tracks/previews/axel-ryder-track.png';
import neonKiraTrackArtwork from '../assets/tracks/previews/neon-kira-track.png';
import leonardLyonTrackArtwork from '../assets/tracks/previews/leonard-lyon-track.png';
import brokThornTrackArtwork from '../assets/tracks/previews/brok-thorn-track.png';
import brokThornSelectedTrackArtwork from '../assets/tracks/previews/brok-thorn-track-selected.png';
import cyberDragonTrackArtwork from '../assets/tracks/previews/cyber-dragon-track.png';
import roxZ7TrackArtwork from '../assets/tracks/previews/rox-z7-track.png';
import vyraNoctisTrackArtwork from '../assets/tracks/previews/vyra-noctis-track.png';
import drakMareTrackArtwork from '../assets/tracks/previews/drax-mare-track.png';
import blankPilotFrameArtwork from '../assets/ui/character-selection/frames/pilot-empty-frame-template.png';
import axelDefinitiveFrameArtwork from '../assets/ui/character-selection/frames/axel-definitive-frame.png';
import axelRyderBackground from '../assets/characters/backgrounds/axel-ryder.png';
import neonKiraBackground from '../assets/characters/backgrounds/neon-kira.png';
import brokThornBackground from '../assets/characters/backgrounds/brok-thorn.png';
import leonardLyonBackground from '../assets/characters/backgrounds/leonard-lyon.png';
import roxZ7Background from '../assets/characters/backgrounds/rox-z7.png';
import vyraNoctisBackground from '../assets/characters/backgrounds/vyra-noctis.png';
import daggerRavenBackground from '../assets/characters/backgrounds/dagger-raven.png';
import cyberDragonBackground from '../assets/characters/backgrounds/cyber-dragon.png';
import draxMareBackground from '../assets/characters/backgrounds/drax-mare.png';
import fixedSelectionGround from '../assets/characters/scenarios/02_CHAO_FIXO_COM_REFLEXO_ESCAPAMENTOS.png';
import axelPilotScenario from '../assets/characters/scenarios/01_CENARIO_DINAMICO_AXEL_RYDER.png';
import neonKiraPilotScenario from '../assets/characters/scenarios/neon-kira-scenario.png';
import brokThornPilotScenario from '../assets/characters/scenarios/brok-thorn-scenario.png';
import leonardLyonPilotScenario from '../assets/characters/scenarios/leonard-lyon-scenario.png';
import roxZ7PilotScenario from '../assets/characters/scenarios/rox-z7-scenario.png';
import vyraNoctisPilotScenario from '../assets/characters/scenarios/vyra-noctis-scenario.png';
import daggerRavenPilotScenario from '../assets/characters/scenarios/dagger-raven-scenario.png';
import cyberDragonPilotScenario from '../assets/characters/scenarios/cyber-dragon-scenario.png';
import draxMarePilotScenario from '../assets/characters/scenarios/drax-mare-scenario.png';
import axelRyderCardPortrait from '../assets/characters/portraits/axel-ryder-card.png';
import neonKiraCardPortrait from '../assets/characters/portraits/neon-kira-card.png';
import brokThornCardPortrait from '../assets/characters/portraits/brok-thorn-card.png';
import leonardLyonCardPortrait from '../assets/characters/portraits/leonard-lyon-card.png';
import roxZ7CardPortrait from '../assets/characters/portraits/rox-z7-card.png';
import vyraNoctisCardPortrait from '../assets/characters/portraits/vyra-noctis-card.png';
import daggerRavenCardPortrait from '../assets/characters/portraits/dagger-raven-card.png';
import cyberDragonCardPortrait from '../assets/characters/portraits/cyber-dragon-card.png';
import draxMareCardPortrait from '../assets/characters/portraits/drax-mare-card.png';
import axelRyderSymbol from '../assets/characters/icons/vera-volt.png';
import neonKiraSymbol from '../assets/characters/icons/kira-comet.png';
import brokThornSymbol from '../assets/characters/icons/dax-voltage.png';
import leonardLyonSymbol from '../assets/characters/icons/atlas-knox.png';
import roxZ7Symbol from '../assets/characters/icons/echo-7.png';
import vyraNoctisSymbol from '../assets/characters/icons/zuri-spark.png';
import daggerRavenSymbol from '../assets/characters/icons/blade-raven.png';
import cyberDragonSymbol from '../assets/characters/icons/cyber-dragon.png';
import draxMareSymbol from '../assets/characters/icons/drak-mare.png';
import voltarisModule from '../assets/planets/modules/voltaris.png';
import nyra7Module from '../assets/planets/modules/nyra-7.png';
import thorgarModule from '../assets/planets/modules/thorgar.png';
import kaelithModule from '../assets/planets/modules/kaelith.png';
import solkarModule from '../assets/planets/modules/solkar.png';
import eclipsisModule from '../assets/planets/modules/eclipsis.png';

const GUIDE_SIZE = { width: 1671, height: 941 } as const;
const MODULE_WORLD_CROP = { x: 27, y: 12, width: 196, height: 202 } as const;
const MODULE_TRACK_CROP = { x: 503, y: 80, width: 342, height: 80 } as const;
const MODULE_EMBLEM_CROP = { x: 232, y: 14, width: 68, height: 68 } as const;
export const PILOT_DETAILS_FRAME_SIZE = { width: 1671, height: 941 } as const;
export const PILOT_MASTER_FRAME_TEXTURE_KEY = 'pilot-master-frame';
export const PILOT_REPLACEMENT_FRAME_TEXTURE_KEY = 'pilot-replacement-frame';
export const TRACK_EMPTY_QUADRANT_FRAME_TEXTURE_KEY = 'pilot-track-empty-quadrant-frame';
export const PILOT_BONUS_CARD_TEXTURE_KEYS = {
  speed: 'pilot-bonus-card-speed',
  acceleration: 'pilot-bonus-card-acceleration',
  control: 'pilot-bonus-card-control',
  armor: 'pilot-bonus-card-armor',
  tires: 'pilot-bonus-card-tires',
  suspension: 'pilot-bonus-card-suspension',
  shotCount: 'pilot-bonus-card-shotCount',
  bombCount: 'pilot-bonus-card-bombCount',
  oilSlickCount: 'pilot-bonus-card-oilSlickCount',
} as const satisfies Record<VehicleTuningField, string>;
const PILOT_BONUS_CARD_ARTWORKS: Record<VehicleTuningField, string> = {
  speed: bonusSpeedArtwork,
  acceleration: bonusAccelerationArtwork,
  control: bonusControlArtwork,
  armor: bonusArmorArtwork,
  tires: bonusTiresArtwork,
  suspension: bonusSuspensionArtwork,
  shotCount: bonusShotsArtwork,
  bombCount: bonusBombsArtwork,
  oilSlickCount: bonusOilArtwork,
};
export const PILOT_MASTER_FLAG_TEXTURE_KEY = 'pilot-master-flag-color';
export const PILOT_MASTER_FRAME_CROP = { x: 120, y: 78, width: 1371, height: 772 } as const;
export const PILOT_MASTER_FLAG_CROP = { x: 1255, y: 547, width: 128, height: 100 } as const;
const SPRITES = {
  informationPanel: { x: 758, y: 216, width: 535, height: 435 },
  backButton: { x: 47, y: 584, width: 311, height: 64 },
  confirmButton: { x: 402, y: 584, width: 307, height: 64 },
} as const;

const PILOT_CROPS = [
  ['axel-ryder', { x: 0, y: 0, width: 418, height: 418 }],
  ['neon-kira', { x: 418, y: 0, width: 418, height: 418 }],
  ['brok-thorn', { x: 836, y: 0, width: 418, height: 418 }],
  ['leonard-lyon', { x: 0, y: 418, width: 418, height: 388 }],
  ['rox-z7', { x: 418, y: 418, width: 418, height: 388 }],
  ['vyra-noctis', { x: 836, y: 418, width: 418, height: 388 }],
  ['dagger-raven', { x: 0, y: 806, width: 418, height: 387 }],
  ['cyber-dragon', { x: 418, y: 806, width: 418, height: 387 }],
  ['drax-mare', { x: 836, y: 806, width: 418, height: 387 }],
] as const;

const PILOT_MODULES = [
  ['voltaris', voltarisModule], ['nyra-7', nyra7Module], ['thorgar', thorgarModule],
  ['kaelith', kaelithModule], ['solkar', solkarModule], ['eclipsis', eclipsisModule],
] as const;

const TEXT_SPRITES = {
  'SELECIONAR PILOTO': { x: 52, y: 873, width: 238, height: 34 },
  CONFIRMAR: { x: 333, y: 873, width: 146, height: 34 },
  VOLTAR: { x: 520, y: 873, width: 101, height: 34 },
} as const;
const PILOT_FRAME_TEXTURE_PREFIX = 'pilot-empty-frame-';
const PILOT_FRAME_TEXTURE_SIZE = 512;
const AXEL_PLATE_SOURCE_BOUNDS = { x: 71, y: 16, width: 1112, height: 1222 } as const;
const STANDARD_FRAME_VISIBLE_BOUNDS = { x: 22, y: 7, width: 419, height: 492 } as const;
const AXEL_FRAME_HORIZONTAL_HALF_TRIM = 35.9;
const PILOT_BACKGROUND_APERTURE = [
  [82, 38], [378, 38], [413, 74], [413, 438],
  [381, 474], [82, 474], [49, 438], [49, 74],
] as const;
const AXEL_BACKGROUND_INSET = AXEL_FRAME_HORIZONTAL_HALF_TRIM * 463 / 1254;
const AXEL_BACKGROUND_APERTURE = [
  [82 + AXEL_BACKGROUND_INSET, 38], [378 - AXEL_BACKGROUND_INSET, 38],
  [413 - AXEL_BACKGROUND_INSET, 74], [413 - AXEL_BACKGROUND_INSET, 438],
  [381 - AXEL_BACKGROUND_INSET, 474], [82 + AXEL_BACKGROUND_INSET, 474],
  [49 + AXEL_BACKGROUND_INSET, 438], [49 + AXEL_BACKGROUND_INSET, 74],
] as const;
const PILOT_ASSETS = [
  ['axel-ryder', axelRyderBackground, axelRyderSymbol, axelRyderCardPortrait],
  ['neon-kira', neonKiraBackground, neonKiraSymbol, neonKiraCardPortrait],
  ['brok-thorn', brokThornBackground, brokThornSymbol, brokThornCardPortrait],
  ['leonard-lyon', leonardLyonBackground, leonardLyonSymbol, leonardLyonCardPortrait],
  ['rox-z7', roxZ7Background, roxZ7Symbol, roxZ7CardPortrait],
  ['vyra-noctis', vyraNoctisBackground, vyraNoctisSymbol, vyraNoctisCardPortrait],
  ['dagger-raven', daggerRavenBackground, daggerRavenSymbol, daggerRavenCardPortrait],
  ['cyber-dragon', cyberDragonBackground, cyberDragonSymbol, cyberDragonCardPortrait],
  ['drax-mare', draxMareBackground, draxMareSymbol, draxMareCardPortrait],
] as const;
const PILOT_PLATE_COLORS: Readonly<Record<string, string>> = {
  'axel-ryder': '#FF6A25', 'neon-kira': '#FF37C7', 'brok-thorn': '#64CFFF',
  'leonard-lyon': '#4BE134', 'rox-z7': '#00F0E6', 'vyra-noctis': '#9D49FF',
  'dagger-raven': '#FF2638', 'cyber-dragon': '#3269FF', 'drax-mare': '#FFCC27',
};

/** Recorta os nove cards fornecidos e prepara, em memória, os elementos de interface. */
export function preloadCharacterSelectionAssets(scene: Phaser.Scene): void {
  const ultimateIcons = new Map<string, string>();
  for (const profile of PILOT_PROFILES) {
    for (const id of profile.ultimateIds) {
      const definition = getUltimate(id);
      if (definition) ultimateIcons.set(definition.iconKey, definition.iconPath);
    }
  }
  for (const [key, path] of ultimateIcons) scene.load.image(key, path);
  scene.load.image('pilot-bonus-icon-shots', '/assets/ui/hud/icons/shots.png');
  scene.load.image('pilot-bonus-icon-bomb', '/assets/ui/hud/icons/bomb.png');
  scene.load.image('pilot-bonus-icon-oil', '/assets/ui/hud/icons/oil.png');
  scene.load.image('pilot-selection-fixed-ground', fixedSelectionGround);
  scene.load.image('pilot-selection-scenario-axel-ryder', axelPilotScenario);
  scene.load.image('pilot-selection-scenario-neon-kira', neonKiraPilotScenario);
  scene.load.image('pilot-selection-scenario-brok-thorn', brokThornPilotScenario);
  scene.load.image('pilot-selection-scenario-leonard-lyon', leonardLyonPilotScenario);
  scene.load.image('pilot-selection-scenario-rox-z7', roxZ7PilotScenario);
  scene.load.image('pilot-selection-scenario-vyra-noctis', vyraNoctisPilotScenario);
  scene.load.image('pilot-selection-scenario-dagger-raven', daggerRavenPilotScenario);
  scene.load.image('pilot-selection-scenario-cyber-dragon', cyberDragonPilotScenario);
  scene.load.image('pilot-selection-scenario-drax-mare', draxMarePilotScenario);
  const redesignedPanelSprites = [
    ['riff-details-shell', 'background/field-shell.png'],
    ['riff-details-floor', 'background/floor-reflections.png'],
    ['riff-details-pipe-top', 'structure/pipes/top-strip.png'],
    ['riff-details-pipe-left', 'structure/pipes/left-strip.png'],
    ['riff-details-pipe-right', 'structure/pipes/right-strip.png'],
    ['riff-details-pipe-bottom', 'structure/pipes/bottom-strip.png'],
    ['riff-details-header', 'header/header.png'],
    ['riff-details-lore', 'panels/lore/panel.png'],
    ['riff-details-origin', 'panels/origin/panel.png'],
    ['riff-details-bonus', 'panels/bonus/panel.png'],
    ['riff-details-track-frame', 'panels/track/frame.png'],
    ['riff-details-track-flag', 'panels/track/flag.png'],
    ['riff-details-track-mask', 'panels/track/aperture-mask.png'],
  ] as const;
  redesignedPanelSprites.forEach(([key, file]) =>
    scene.load.image(key, `/assets/ui/RIFFSHOT-RACING-SPRITES/CLEAN-FINAL/${file}`));
  scene.load.image('pilot-ui-guide', guideArtwork);
  scene.load.image('pilot-empty-frame-source', blankPilotFrameArtwork);
  scene.load.image('pilot-axel-definitive-frame-source', axelDefinitiveFrameArtwork);
  PILOT_ASSETS.forEach(([pilotId, artwork]) =>
    scene.load.image(`pilot-background-source-${pilotId}`, artwork));
  PILOT_ASSETS.forEach(([pilotId, , artwork]) =>
    scene.load.image(pilotIconTextureKey(pilotId), artwork));
  PILOT_ASSETS.forEach(([pilotId, , , artwork]) =>
    scene.load.image(pilotPortraitTextureKey(pilotId), artwork));
  scene.load.image('pilot-world-voltaris-globe', voltarisGlobeArtwork);
  scene.load.image('pilot-world-neon-kira', neonKiraPlanetArtwork);
  scene.load.image('pilot-world-brok-thorn', brokThornPlanetArtwork);
  scene.load.image('pilot-world-leonard-lyon', leonardLyonPlanetArtwork);
  scene.load.image('pilot-world-rox-z7', roxZ7PlanetArtwork);
  scene.load.image('pilot-world-dagger-raven', bladeRavenPlanetArtwork);
  scene.load.image('pilot-world-vyra-noctis', vyraNoctisPlanetArtwork);
  scene.load.image('pilot-world-cyber-dragon', cyberDragonPlanetArtwork);
  scene.load.image('pilot-world-drax-mare', drakMarePlanetArtwork);
  scene.load.image('pilot-track-axel-ryder', axelRyderTrackArtwork);
  scene.load.image('pilot-track-neon-kira', neonKiraTrackArtwork);
  scene.load.image('pilot-track-leonard-lyon', leonardLyonTrackArtwork);
  scene.load.image('pilot-track-brok-thorn', brokThornTrackArtwork);
  scene.load.image('pilot-track-brok-thorn-selected', brokThornSelectedTrackArtwork);
  scene.load.image('pilot-track-cyber-dragon', cyberDragonTrackArtwork);
  scene.load.image('pilot-track-rox-z7', roxZ7TrackArtwork);
  scene.load.image('pilot-track-vyra-noctis', vyraNoctisTrackArtwork);
  scene.load.image('pilot-track-drax-mare', drakMareTrackArtwork);
  scene.load.image('pilot-roster-source', pilotRosterArtwork);
  const fullBodyPortraits = [
    ['axel-ryder', axelRyderFullBodyArtwork], ['brok-thorn', brokThornFullBodyArtwork],
    ['neon-kira', neonKiraFullBodyArtwork], ['leonard-lyon', leonardLyonFullBodyArtwork],
    ['rox-z7', roxZ7FullBodyArtwork], ['vyra-noctis', vyraNoctisFullBodyArtwork],
    ['dagger-raven', daggerRavenFullBodyArtwork], ['cyber-dragon', cyberDragonFullBodyArtwork],
    ['drax-mare', drakMareFullBodyArtwork],
  ] as const;
  fullBodyPortraits.forEach(([pilotId, artwork]) => {
    const textureKey = getPilotProfile(pilotId)?.fullBodyPortraitKey;
    if (textureKey) scene.load.image(textureKey, artwork);
  });
  scene.load.image('pilot-master-frame-source', pilotMasterFrameArtwork);
  scene.load.image(PILOT_REPLACEMENT_FRAME_TEXTURE_KEY, replacementPilotFrameArtwork);
  scene.load.image(TRACK_EMPTY_QUADRANT_FRAME_TEXTURE_KEY, greenFlagTrackFrameArtwork);
  VEHICLE_TUNING_FIELDS.forEach(attribute => {
    scene.load.image(PILOT_BONUS_CARD_TEXTURE_KEYS[attribute], PILOT_BONUS_CARD_ARTWORKS[attribute]);
  });
  PILOT_MODULES.forEach(([planet, artwork]) => scene.load.image(`pilot-module-${planet}`, artwork));
  scene.load.image('pilot-world-voltaris', voltarisWorld);
  scene.load.image('pilot-track-voltaris', voltarisTrack);
}

export function createCharacterSelectionAssets(
  scene: Phaser.Scene,
  frameColors: Readonly<Record<string, string>>,
): void {
  createPilotMasterFrameTexture(scene);
  createWhitePilotSymbols(scene);
  createPilotTextures(scene);
  createPilotBackgroundTextures(scene);
  createPilotFrameTextures(scene, frameColors);
  const axelPlateTemplate = createAxelFrameLayers(scene, frameColors['axel-ryder']);
  if (axelPlateTemplate) createPilotPlateTextures(scene, axelPlateTemplate);
  createPlanetAndTrackTextures(scene);
  createMaskedFrameShell(scene);

  // A folha-guia fornece apenas elementos compartilhados da interface, nunca os cards.
  const guide = scene.textures.get('pilot-ui-guide').getSourceImage();
  if (!isCanvasSource(guide)) return;

  createTexture(scene, guide, 'pilot-ui-information-panel', SPRITES.informationPanel);
  createTexture(scene, guide, 'pilot-ui-back-button', SPRITES.backButton);
  createTexture(scene, guide, 'pilot-ui-confirm-button', SPRITES.confirmButton);

  createTexture(scene, guide, 'pilot-ui-planet-badge', { x: 1319, y: 250, width: 322, height: 72 });
  createTexture(scene, guide, 'pilot-ui-track-frame', { x: 1317, y: 361, width: 328, height: 95 });
  createTexture(scene, guide, 'pilot-ui-attribute-frame', { x: 1313, y: 514, width: 332, height: 96 });

  for (const [label, rect] of Object.entries(TEXT_SPRITES)) {
    createTexture(scene, guide, textTextureKey(label), rect, removeGuideTextBackground);
  }

}

function createPilotMasterFrameTexture(scene: Phaser.Scene): void {
  const source = scene.textures.get('pilot-master-frame-source').getSourceImage();
  if (!isCanvasSource(source)) return;

  const canvas = document.createElement('canvas');
  canvas.width = PILOT_MASTER_FRAME_CROP.width;
  canvas.height = PILOT_MASTER_FRAME_CROP.height;
  const context = canvas.getContext('2d');
  if (!context) return;

  context.drawImage(source, PILOT_MASTER_FRAME_CROP.x, PILOT_MASTER_FRAME_CROP.y,
    PILOT_MASTER_FRAME_CROP.width, PILOT_MASTER_FRAME_CROP.height,
    0, 0, PILOT_MASTER_FRAME_CROP.width, PILOT_MASTER_FRAME_CROP.height);
  const framePixels = context.getImageData(0, 0, canvas.width, canvas.height);
  const flagCanvas = document.createElement('canvas');
  flagCanvas.width = PILOT_MASTER_FLAG_CROP.width;
  flagCanvas.height = PILOT_MASTER_FLAG_CROP.height;
  const flagContext = flagCanvas.getContext('2d');
  if (!flagContext) return;
  const flagPixels = flagContext.createImageData(flagCanvas.width, flagCanvas.height);
  for (let y = 0; y < flagCanvas.height; y += 1) {
    for (let x = 0; x < flagCanvas.width; x += 1) {
      const frameX = PILOT_MASTER_FLAG_CROP.x - PILOT_MASTER_FRAME_CROP.x + x;
      const frameY = PILOT_MASTER_FLAG_CROP.y - PILOT_MASTER_FRAME_CROP.y + y;
      const frameIndex = (frameY * canvas.width + frameX) * 4;
      const flagIndex = (y * flagCanvas.width + x) * 4;
      const red = framePixels.data[frameIndex]!;
      const green = framePixels.data[frameIndex + 1]!;
      const blue = framePixels.data[frameIndex + 2]!;
      const alpha = framePixels.data[frameIndex + 3]!;
      if (alpha === 0 || green < 30 || green <= red * 1.05 || green <= blue * 1.05) continue;

      const shade = Math.max(red, green, blue);
      flagPixels.data[flagIndex] = shade;
      flagPixels.data[flagIndex + 1] = shade;
      flagPixels.data[flagIndex + 2] = shade;
      flagPixels.data[flagIndex + 3] = alpha;
      framePixels.data[frameIndex + 3] = 0;
    }
  }
  context.putImageData(framePixels, 0, 0);
  flagContext.putImageData(flagPixels, 0, 0);
  if (scene.textures.exists(PILOT_MASTER_FRAME_TEXTURE_KEY)) {
    scene.textures.remove(PILOT_MASTER_FRAME_TEXTURE_KEY);
  }
  scene.textures.addCanvas(PILOT_MASTER_FRAME_TEXTURE_KEY, canvas)?.refresh();
  if (scene.textures.exists(PILOT_MASTER_FLAG_TEXTURE_KEY)) {
    scene.textures.remove(PILOT_MASTER_FLAG_TEXTURE_KEY);
  }
  scene.textures.addCanvas(PILOT_MASTER_FLAG_TEXTURE_KEY, flagCanvas)?.refresh();
}

function createMaskedFrameShell(scene: Phaser.Scene): void {
  const source = scene.textures.get('riff-details-shell').getSourceImage();
  if (!isCanvasSource(source)) return;

  const canvas = document.createElement('canvas');
  canvas.width = source.width;
  canvas.height = source.height;
  const context = canvas.getContext('2d');
  if (!context) return;

  context.drawImage(source, 0, 0);
  context.globalCompositeOperation = 'destination-in';
  context.beginPath();
  context.moveTo(292, 0);
  context.lineTo(1552, 0);
  context.quadraticCurveTo(1671, 0, 1671, 119);
  context.lineTo(1671, 797);
  context.quadraticCurveTo(1671, 917, 1550, 917);
  context.lineTo(298, 917);
  context.quadraticCurveTo(175, 917, 175, 794);
  context.lineTo(175, 123);
  context.quadraticCurveTo(175, 0, 292, 0);
  context.closePath();
  context.fillStyle = '#ffffff';
  context.fill();

  const key = 'riff-details-shell-masked';
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const texture = scene.textures.addCanvas(key, canvas);
  texture?.refresh();
}

function createWhitePilotSymbols(scene: Phaser.Scene): void {
  for (const [pilotId] of PILOT_ASSETS) {
    const source = scene.textures.get(pilotIconTextureKey(pilotId)).getSourceImage();
    if (!isCanvasSource(source)) continue;

    const scan = document.createElement('canvas');
    scan.width = source.width;
    scan.height = source.height;
    const scanContext = scan.getContext('2d', { willReadFrequently: true });
    if (!scanContext) continue;
    scanContext.drawImage(source, 0, 0);
    const pixels = scanContext.getImageData(0, 0, source.width, source.height).data;
    let left = source.width;
    let top = source.height;
    let right = -1;
    let bottom = -1;
    for (let y = 0; y < source.height; y += 1) {
      for (let x = 0; x < source.width; x += 1) {
        if (pixels[(y * source.width + x) * 4 + 3] <= 16) continue;
        left = Math.min(left, x);
        top = Math.min(top, y);
        right = Math.max(right, x + 1);
        bottom = Math.max(bottom, y + 1);
      }
    }
    if (right <= left || bottom <= top) continue;

    const key = pilotWhiteIconTextureKey(pilotId);
    if (scene.textures.exists(key)) scene.textures.remove(key);
    const texture = scene.textures.createCanvas(key, right - left, bottom - top);
    if (!texture) continue;
    texture.context.drawImage(source, left, top, right - left, bottom - top,
      0, 0, right - left, bottom - top);
    texture.context.globalCompositeOperation = 'source-in';
    texture.context.fillStyle = '#ffffff';
    texture.context.fillRect(0, 0, source.width, source.height);
    texture.context.globalCompositeOperation = 'source-over';
    texture.refresh();
  }
}

function createPilotTextures(scene: Phaser.Scene): void {
  const source = scene.textures.get('pilot-roster-source').getSourceImage();
  if (!isCanvasSource(source)) return;

  for (const [id, crop] of PILOT_CROPS) {
    createTexture(scene, source, `pilot-card-${id}`, crop, preserveCardArtwork);
  }
}

function createPilotBackgroundTextures(scene: Phaser.Scene): void {
  const frameSource = scene.textures.get('pilot-empty-frame-source').getSourceImage();
  if (!isCanvasSource(frameSource)) return;
  const frameScale = PILOT_FRAME_TEXTURE_SIZE / Math.max(frameSource.width, frameSource.height);
  const textureWidth = Math.round(frameSource.width * frameScale);

  for (const [pilotId] of PILOT_ASSETS) {
    const source = scene.textures.get(`pilot-background-source-${pilotId}`).getSourceImage();
    if (!isCanvasSource(source)) continue;

    const key = `pilot-background-${pilotId}`;
    if (scene.textures.exists(key)) scene.textures.remove(key);
    const texture = scene.textures.createCanvas(
      key,
      textureWidth,
      PILOT_FRAME_TEXTURE_SIZE,
    );
    if (!texture) continue;

    const context = texture.context;
    const aperture = pilotId === 'axel-ryder'
      ? AXEL_BACKGROUND_APERTURE
      : PILOT_BACKGROUND_APERTURE;
    const apertureX = aperture.map(([x]) => x);
    const apertureY = aperture.map(([, y]) => y);
    const left = Math.min(...apertureX);
    const right = Math.max(...apertureX);
    const top = Math.min(...apertureY);
    const bottom = Math.max(...apertureY);
    const apertureWidth = right - left;
    const apertureHeight = bottom - top;
    const coverScale = Math.max(apertureWidth / source.width, apertureHeight / source.height);
    const drawWidth = source.width * coverScale;
    const drawHeight = source.height * coverScale;

    context.beginPath();
    aperture.forEach(([x, y], index) => {
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    });
    context.closePath();
    context.clip();
    context.drawImage(
      source,
      left + (apertureWidth - drawWidth) / 2,
      top + (apertureHeight - drawHeight) / 2,
      drawWidth,
      drawHeight,
    );
    texture.refresh();
  }
}

function createPilotPlateTextures(
  scene: Phaser.Scene,
  axelPlateTemplate: HTMLCanvasElement,
): void {
  const standardFrame = scene.textures.get('pilot-empty-frame-source').getSourceImage();
  if (!isCanvasSource(standardFrame)) return;
  const frameScale = PILOT_FRAME_TEXTURE_SIZE / Math.max(standardFrame.width, standardFrame.height);
  const textureWidth = Math.round(standardFrame.width * frameScale);
  const textureHeight = Math.round(standardFrame.height * frameScale);

  for (const [pilotId, color] of Object.entries(PILOT_PLATE_COLORS)) {
    if (pilotId === 'axel-ryder') continue;
    const key = `pilot-empty-plate-${pilotId}`;
    if (scene.textures.exists(key)) scene.textures.remove(key);
    const plateCanvas = document.createElement('canvas');
    plateCanvas.width = textureWidth;
    plateCanvas.height = textureHeight;
    const context = plateCanvas.getContext('2d');
    if (!context) continue;
    context.drawImage(
      axelPlateTemplate,
      AXEL_PLATE_SOURCE_BOUNDS.x,
      AXEL_PLATE_SOURCE_BOUNDS.y,
      AXEL_PLATE_SOURCE_BOUNDS.width,
      AXEL_PLATE_SOURCE_BOUNDS.height,
      STANDARD_FRAME_VISIBLE_BOUNDS.x,
      STANDARD_FRAME_VISIBLE_BOUNDS.y,
      STANDARD_FRAME_VISIBLE_BOUNDS.width,
      STANDARD_FRAME_VISIBLE_BOUNDS.height,
    );
    recolorRedFramePixels(context, textureWidth, textureHeight, color);
    createFrameTexture(scene, key, plateCanvas, textureWidth, textureHeight);
  }
}

function createAxelFrameLayers(
  scene: Phaser.Scene,
  accent: string,
): HTMLCanvasElement | null {
  const source = scene.textures.get('pilot-axel-definitive-frame-source').getSourceImage();
  if (!isCanvasSource(source)) return null;
  const sourceCanvas = document.createElement('canvas');
  sourceCanvas.width = source.width;
  sourceCanvas.height = source.height;
  const sourceContext = sourceCanvas.getContext('2d', { willReadFrequently: true });
  if (!sourceContext) return null;
  sourceContext.drawImage(source, 0, 0);
  const sourcePixels = sourceContext.getImageData(0, 0, source.width, source.height);
  const rearPixels = sourceContext.createImageData(source.width, source.height);
  const platePixels = sourceContext.createImageData(source.width, source.height);
  const barPath = [
    [369, 930], [1105, 930], [1128, 950], [1128, 1074], [1098, 1128], [369, 1128],
  ] as const;
  const slashPaths = [
    [[781, 1194], [851, 1114], [914, 1114], [846, 1194]],
    [[858, 1194], [929, 1114], [993, 1114], [923, 1194]],
    [[936, 1194], [1007, 1114], [1078, 1114], [1002, 1194]],
  ] as const;

  for (let y = 0; y < source.height; y += 1) {
    for (let x = 0; x < source.width; x += 1) {
      let inFrontPlate = false;
      if (y >= 850 && y <= 1200) {
        const pixelX = x + 0.5;
        const pixelY = y + 0.5;
        if (x >= 94 && x <= 422 && y >= 850 && y <= 1200) {
          const inOuterRing = ellipseContains(pixelX, pixelY, 258, 1025, 163, 173);
          const inRingOpening = ellipseContains(pixelX, pixelY, 258, 1025, 106, 116);
          inFrontPlate = inOuterRing && !inRingOpening;
        }
        if (!inFrontPlate && x >= 360 && x <= 1135 && y >= 925 && y <= 1135) {
          inFrontPlate = polygonContains(pixelX, pixelY, barPath);
        }
        if (!inFrontPlate && x >= 770 && x <= 1085 && y >= 1105) {
          inFrontPlate = slashPaths.some(path => polygonContains(pixelX, pixelY, path));
        }
      }
      const offset = (y * source.width + x) * 4;
      const targetPixels = inFrontPlate ? platePixels.data : rearPixels.data;
      targetPixels[offset] = sourcePixels.data[offset]!;
      targetPixels[offset + 1] = sourcePixels.data[offset + 1]!;
      targetPixels[offset + 2] = sourcePixels.data[offset + 2]!;
      targetPixels[offset + 3] = sourcePixels.data[offset + 3]!;
    }
  }

  const rearCanvas = document.createElement('canvas');
  const plateCanvas = document.createElement('canvas');
  rearCanvas.width = plateCanvas.width = source.width;
  rearCanvas.height = plateCanvas.height = source.height;
  const rearContext = rearCanvas.getContext('2d');
  const plateContext = plateCanvas.getContext('2d');
  if (!rearContext || !plateContext) return null;
  rearContext.putImageData(rearPixels, 0, 0);
  plateContext.putImageData(platePixels, 0, 0);
  verifyAxelFrameReconstruction(sourcePixels, rearCanvas, plateCanvas);

  const correctedRear = trimAxelStraightSections(rearCanvas);
  const correctedPlate = trimAxelStraightSections(plateCanvas);
  const correctedRearContext = correctedRear.getContext('2d');
  const correctedPlateContext = correctedPlate.getContext('2d');
  if (!correctedRearContext || !correctedPlateContext) return null;
  recolorRedFramePixels(correctedRearContext, source.width, source.height, accent);
  recolorRedFramePixels(correctedPlateContext, source.width, source.height, accent);
  createFrameTexture(scene, 'pilot-axel-frame-back', correctedRear, source.width, source.height);
  createFrameTexture(scene, 'pilot-axel-frame-back-selected', correctedRear,
    source.width, source.height, true);
  createFrameTexture(scene, 'pilot-axel-frame-plate', correctedPlate, source.width, source.height);
  return plateCanvas;
}

function trimAxelStraightSections(source: HTMLCanvasElement): HTMLCanvasElement {
  const center = source.width / 2;
  const trim = AXEL_FRAME_HORIZONTAL_HALF_TRIM;
  const leftEnd = center - trim;
  const rightStart = center + trim;
  const output = document.createElement('canvas');
  output.width = source.width;
  output.height = source.height;
  const context = output.getContext('2d');
  if (!context) return output;

  context.drawImage(source, 0, 0, leftEnd, source.height,
    trim, 0, leftEnd, source.height);
  context.drawImage(source, rightStart, 0, source.width - rightStart, source.height,
    center, 0, source.width - rightStart, source.height);
  return output;
}

function ellipseContains(
  x: number,
  y: number,
  centerX: number,
  centerY: number,
  radiusX: number,
  radiusY: number,
): boolean {
  const dx = (x - centerX) / radiusX;
  const dy = (y - centerY) / radiusY;
  return dx * dx + dy * dy <= 1;
}

function polygonContains(
  x: number,
  y: number,
  points: ReadonlyArray<readonly [number, number]>,
): boolean {
  let inside = false;
  for (let current = 0, previous = points.length - 1; current < points.length; previous = current++) {
    const [currentX, currentY] = points[current]!;
    const [previousX, previousY] = points[previous]!;
    if ((currentY > y) !== (previousY > y)
      && x < ((previousX - currentX) * (y - currentY)) / (previousY - currentY) + currentX) {
      inside = !inside;
    }
  }
  return inside;
}

function verifyAxelFrameReconstruction(
  source: ImageData,
  rear: HTMLCanvasElement,
  plate: HTMLCanvasElement,
): void {
  const output = document.createElement('canvas');
  output.width = source.width;
  output.height = source.height;
  const context = output.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Não foi possível validar as camadas da moldura do Axel.');
  context.drawImage(rear, 0, 0);
  context.drawImage(plate, 0, 0);
  const composed = context.getImageData(0, 0, source.width, source.height).data;
  for (let offset = 0; offset < source.data.length; offset += 4) {
    if (source.data[offset + 3] === 0) continue;
    if (Math.abs(composed[offset]! - source.data[offset]!) > 1
      || Math.abs(composed[offset + 1]! - source.data[offset + 1]!) > 1
      || Math.abs(composed[offset + 2]! - source.data[offset + 2]!) > 1
      || Math.abs(composed[offset + 3]! - source.data[offset + 3]!) > 1) {
      throw new Error('As camadas separadas do Axel não recompõem o asset original.');
    }
  }
}

function createPilotFrameTextures(
  scene: Phaser.Scene,
  frameColors: Readonly<Record<string, string>>,
): void {
  const source = scene.textures.get('pilot-empty-frame-source').getSourceImage();
  if (!isCanvasSource(source)) return;
  const workCanvas = document.createElement('canvas');
  workCanvas.width = source.width;
  workCanvas.height = source.height;
  const workContext = workCanvas.getContext('2d');
  if (!workContext) return;
  const sourceScale = PILOT_FRAME_TEXTURE_SIZE / Math.max(source.width, source.height);
  const textureWidth = Math.round(source.width * sourceScale);
  const textureHeight = Math.round(source.height * sourceScale);

  for (const [pilotId, color] of Object.entries(frameColors)) {
    const normalKey = `${PILOT_FRAME_TEXTURE_PREFIX}${pilotId}`;
    const selectedKey = `${normalKey}-selected`;
    for (const key of [normalKey, selectedKey]) {
      if (scene.textures.exists(key)) scene.textures.remove(key);
    }

    workContext.clearRect(0, 0, source.width, source.height);
    workContext.drawImage(source, 0, 0);
    recolorRedFramePixels(workContext, source.width, source.height, color);
    createFrameTexture(scene, normalKey, workCanvas, textureWidth, textureHeight);
    createFrameTexture(scene, selectedKey, workCanvas, textureWidth, textureHeight, true);
  }
}

function createFrameTexture(
  scene: Phaser.Scene,
  key: string,
  source: HTMLCanvasElement,
  width: number,
  height: number,
  intensifyColor = false,
): void {
  const texture = scene.textures.createCanvas(key, width, height);
  if (!texture) return;
  texture.context.drawImage(source, 0, 0, width, height);
  if (intensifyColor) intensifyFrameColor(texture.context, width, height);
  texture.refresh();
}

function intensifyFrameColor(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
): void {
  const image = context.getImageData(0, 0, width, height);
  const pixels = image.data;

  for (let offset = 0; offset < pixels.length; offset += 4) {
    if (pixels[offset + 3] === 0) continue;

    const [hue, saturation, value] = rgbToHsv(
      pixels[offset]!, pixels[offset + 1]!, pixels[offset + 2]!,
    );
    if (saturation < 0.14) continue;

    const [red, green, blue] = hsvToRgb(hue, Math.min(1, saturation + 0.22), Math.min(1, value * 1.12));
    pixels[offset] = red;
    pixels[offset + 1] = green;
    pixels[offset + 2] = blue;
  }

  context.putImageData(image, 0, 0);
}

function recolorRedFramePixels(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  color: string,
): void {
  const match = /^#([\da-f]{6})$/i.exec(color);
  if (!match) throw new Error(`Cor de moldura inválida: ${color}`);

  const hex = Number.parseInt(match[1]!, 16);
  const [targetHue, targetSaturation] = rgbToHsv(
    (hex >> 16) & 0xff,
    (hex >> 8) & 0xff,
    hex & 0xff,
  );
  const image = context.getImageData(0, 0, width, height);
  const pixels = image.data;

  for (let offset = 0; offset < pixels.length; offset += 4) {
    if (pixels[offset + 3] === 0) continue;

    const [hue, saturation, value] = rgbToHsv(
      pixels[offset]!, pixels[offset + 1]!, pixels[offset + 2]!,
    );
    if (saturation < 0.14 || (hue > 0.08 && hue < 0.92)) continue;

    const [red, green, blue] = hsvToRgb(targetHue, targetSaturation, value);
    pixels[offset] = red;
    pixels[offset + 1] = green;
    pixels[offset + 2] = blue;
  }

  context.putImageData(image, 0, 0);
}

function rgbToHsv(red: number, green: number, blue: number): [number, number, number] {
  const r = red / 255;
  const g = green / 255;
  const b = blue / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  let hue = 0;

  if (delta > 0) {
    if (max === r) hue = ((g - b) / delta) % 6;
    else if (max === g) hue = (b - r) / delta + 2;
    else hue = (r - g) / delta + 4;
    hue /= 6;
    if (hue < 0) hue += 1;
  }

  return [hue, max === 0 ? 0 : delta / max, max];
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

function preserveCardArtwork(): void {
  // A folha contém os recortes e o alfa finais; não aplicar keying nem redesenhar seus pixels.
}

function createPlanetAndTrackTextures(scene: Phaser.Scene): void {
  // Composite files are sources only; the panel displays these isolated crops without their extra frame.
  for (const [planet] of PILOT_MODULES) {
    const source = scene.textures.get(`pilot-module-${planet}`).getSourceImage();
    if (!isCanvasSource(source)) continue;

    if (!scene.textures.exists(`pilot-world-${planet}`)) {
      createTexture(scene, source, `pilot-world-${planet}`, MODULE_WORLD_CROP, trimPlanetCropEdges);
    }
    if (!scene.textures.exists(`pilot-track-${planet}`)) {
      createTexture(scene, source, `pilot-track-${planet}`, MODULE_TRACK_CROP, removeConnectedBlack);
    }
    if (!scene.textures.exists(`pilot-emblem-${planet}`)) {
      createTexture(scene, source, `pilot-emblem-${planet}`, MODULE_EMBLEM_CROP, removeConnectedBlack);
    }
  }
}

function trimPlanetCropEdges(context: CanvasRenderingContext2D, width: number, height: number): void {
  removeConnectedBlack(context, width, height);
  const image = context.getImageData(0, 0, width, height);
  for (let y = 0; y < Math.min(18, height); y += 1) {
    for (let x = 0; x < Math.min(20, width); x += 1) {
      image.data[(y * width + x) * 4 + 3] = 0;
    }
  }
  context.putImageData(image, 0, 0);
}

export function textTextureKey(label: string): string {
  return `pilot-ui-text-${label.toLowerCase().replaceAll(' ', '-')}`;
}

export function addCharacterSpriteText(
  scene: Phaser.Scene,
  parent: Phaser.GameObjects.Container,
  label: string,
  x: number,
  y: number,
  displayHeight: number,
  tint?: number,
): Phaser.GameObjects.Image | undefined {
  const key = textTextureKey(label);
  if (!scene.textures.exists(key)) return undefined;
  const source = scene.textures.get(key).getSourceImage();
  const width = displayHeight * source.width / source.height;
  const image = scene.add.image(x, y, key).setDisplaySize(width, displayHeight);
  if (tint !== undefined) image.setTint(tint);
  parent.add(image);
  return image;
}

function isCanvasSource(source: unknown): source is HTMLImageElement | HTMLCanvasElement {
  return source instanceof HTMLImageElement || source instanceof HTMLCanvasElement;
}

function createTexture(
  scene: Phaser.Scene,
  source: CanvasImageSource,
  key: string,
  rect: { x: number; y: number; width: number; height: number },
  transform?: (context: CanvasRenderingContext2D, width: number, height: number) => void,
): void {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const texture = scene.textures.createCanvas(key, rect.width, rect.height);
  if (!texture) return;
  texture.context.drawImage(source, rect.x, rect.y, rect.width, rect.height, 0, 0, rect.width, rect.height);
  if (transform) transform(texture.context, rect.width, rect.height);
  else removeConnectedBlack(texture.context, rect.width, rect.height);
  texture.refresh();
}

function removeConnectedBlack(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  maxChannel = 14,
): void {
  const image = context.getImageData(0, 0, width, height);
  const pixels = image.data;
  const queue = new Int32Array(width * height);
  let head = 0;
  let tail = 0;
  const addExteriorBlack = (index: number): void => {
    const offset = index * 4;
    if (pixels[offset + 3] === 0
      || Math.max(pixels[offset], pixels[offset + 1], pixels[offset + 2]) > maxChannel) return;
    pixels[offset + 3] = 0;
    queue[tail++] = index;
  };

  for (let x = 0; x < width; x += 1) {
    addExteriorBlack(x);
    addExteriorBlack((height - 1) * width + x);
  }
  for (let y = 1; y < height - 1; y += 1) {
    addExteriorBlack(y * width);
    addExteriorBlack(y * width + width - 1);
  }
  while (head < tail) {
    const index = queue[head++];
    const x = index % width;
    if (x > 0) addExteriorBlack(index - 1);
    if (x + 1 < width) addExteriorBlack(index + 1);
    if (index >= width) addExteriorBlack(index - width);
    if (index + width < width * height) addExteriorBlack(index + width);
  }
  context.putImageData(image, 0, 0);
}

function removeGuideTextBackground(context: CanvasRenderingContext2D, width: number, height: number): void {
  const image = context.getImageData(0, 0, width, height);
  for (let offset = 0; offset < image.data.length; offset += 4) {
    const red = image.data[offset];
    const green = image.data[offset + 1];
    const blue = image.data[offset + 2];
    const brightness = (red + green + blue) / 3;
    const saturation = Math.max(red, green, blue) - Math.min(red, green, blue);
    image.data[offset + 3] = saturation > 100
      ? 0
      : Math.round(Math.max(0, Math.min(1, (brightness - 55) / 110)) * 255);
  }
  context.putImageData(image, 0, 0);
}
