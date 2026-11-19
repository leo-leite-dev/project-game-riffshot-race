import { getSelectedCharacter } from '../data/characters.ts';
import { getOriginPlanet, getOriginPlanetArtworkKey } from '../data/originPlanets.ts';
import { getPlanetChallenge } from '../data/planetChallenges/index.ts';
import { pilotIconTextureKey } from '../data/pilotIcons.ts';
import { SCENES } from '../ui/theme.ts';
import { TitleScene } from './TitleScene.ts';
import mapArtworkUrl from '../assets/planets/map/galactic-map-background.png';

const MAP_BACKDROP_CROP = { x: 400, y: 190, width: 850, height: 480 } as const;
const MAP_BACKDROP_BLUR = 14;

/** Visão temporária do mapa; não inicia corridas nem altera progressão. */
export class GalacticMapScene extends TitleScene {
  private mapBackdrop!: Phaser.GameObjects.Image;
  private mapArtwork!: Phaser.GameObjects.Image;
  private planetArtwork?: Phaser.GameObjects.Image;
  private planetMaskShape?: Phaser.GameObjects.Graphics;
  private pilotIcon?: Phaser.GameObjects.Image;
  private pilotPortrait?: Phaser.GameObjects.Image;
  private pilotPortraitMask?: Phaser.GameObjects.Graphics;
  private originName?: Phaser.GameObjects.Text;
  private originSubtitle?: Phaser.GameObjects.Text;
  private pilotLabel?: Phaser.GameObjects.Text;
  private pilotName?: Phaser.GameObjects.Text;
  private challengeTitle?: Phaser.GameObjects.Text;
  private challengeRaces?: Phaser.GameObjects.Text;
  private challengeReward?: Phaser.GameObjects.Text;
  private challengeLessonTitle?: Phaser.GameObjects.Text;
  private challengeLesson?: Phaser.GameObjects.Text;
  private challengeButtonLabel?: Phaser.GameObjects.Text;
  private challengeButtonZone?: Phaser.GameObjects.Zone;

  constructor() { super(SCENES.galaxyMap); }

  preload(): void {
    this.load.image('galactic-map-artwork', mapArtworkUrl);
  }

  create(): void {
    const pilot = getSelectedCharacter(this.registry);
    if (!pilot) {
      this.scene.start(SCENES.characters);
      return;
    }
    this.createShell(`Mapa Galáctico. Piloto selecionado: ${pilot.name}.`);
    this.backdrop.image.setVisible(false);
    this.backdrop.motion.setVisible(false);
    this.content.setVisible(false);
    this.hideShellVisuals();
    this.mapBackdrop = this.add.image(0, 0, this.createBackdropTexture())
      .setOrigin(0.5).setDepth(-1).setTint(0x596783).setAlpha(0.9);
    this.mapArtwork = this.add.image(0, 0, 'galactic-map-artwork').setOrigin(0.5).setDepth(0);
    const originPlanet = getOriginPlanet(pilot.originPlanetId);
    const originArtworkKey = originPlanet ? getOriginPlanetArtworkKey(originPlanet) : undefined;
    if (originArtworkKey && this.textures.exists(originArtworkKey)) {
      this.planetArtwork = this.add.image(0, 0, originArtworkKey).setOrigin(0.5).setDepth(1);
      this.planetMaskShape = this.add.graphics().setVisible(false);
      this.planetArtwork.setMask(this.planetMaskShape.createGeometryMask());
    }
    const pilotIconKey = pilotIconTextureKey(pilot.id);
    if (this.textures.exists(pilotIconKey)) {
      this.pilotIcon = this.add.image(0, 0, pilotIconKey).setOrigin(0.5).setDepth(2);
    }
    const portraitKey = `pilot-card-portrait-${pilot.id}`;
    if (this.textures.exists(portraitKey)) {
      this.pilotPortrait = this.add.image(0, 0, portraitKey).setOrigin(0.5).setDepth(2);
      this.pilotPortraitMask = this.add.graphics().setVisible(false);
      this.pilotPortrait.setMask(this.pilotPortraitMask.createGeometryMask());
    }
    if (originPlanet) {
      this.originName = this.add.text(0, 0, originPlanet.name, {
        fontFamily: 'Oxanium, Arial, sans-serif', fontSize: '24px', fontStyle: 'italic 800',
        color: '#eafaff', stroke: '#07111e', strokeThickness: 2,
        padding: { top: 2, bottom: 2 },
      }).setOrigin(0, 0.5).setDepth(2).setResolution(2);
      this.originSubtitle = this.add.text(0, 0, 'PLANETA DE ORIGEM', {
        fontFamily: 'Oxanium, Arial, sans-serif', fontSize: '13px', fontStyle: 'italic 700',
        color: '#71f6ff', stroke: '#07111e', strokeThickness: 1.5,
        padding: { top: 2, bottom: 2 },
      }).setOrigin(0, 0.5).setDepth(2).setResolution(2);
    }
    const challenge = getPlanetChallenge(pilot.originPlanetId);
    if (challenge && challenge.pilotId === pilot.id) {
      this.challengeTitle = this.add.text(0, 0, challenge.challengeName, {
        fontFamily: 'Oxanium, Arial, sans-serif', fontSize: '15px', fontStyle: 'italic 800',
        color: '#ffffff', stroke: '#260608', strokeThickness: 2,
      }).setOrigin(0.5).setDepth(2).setResolution(2);
      this.challengeRaces = this.add.text(0, 0, `CORRIDAS: ${challenge.races}`, {
        fontFamily: 'Oxanium, Arial, sans-serif', fontSize: '13px', fontStyle: 'italic 700',
        color: '#eafaff', stroke: '#07111e', strokeThickness: 1.5,
      }).setOrigin(0.5).setDepth(2).setResolution(2);
      this.challengeReward = this.add.text(0, 0, `RECOMPENSA: ${challenge.reward} MONEY`, {
        fontFamily: 'Oxanium, Arial, sans-serif', fontSize: '13px', fontStyle: 'italic 700',
        color: '#ffcf65', stroke: '#07111e', strokeThickness: 1.5,
      }).setOrigin(0.5).setDepth(2).setResolution(2);
      this.challengeLessonTitle = this.add.text(0, 0, 'LIÇÃO DE ORIGEM', {
        fontFamily: 'Oxanium, Arial, sans-serif', fontSize: '13px', fontStyle: 'italic 800',
        color: '#71f6ff', stroke: '#07111e', strokeThickness: 1.5,
      }).setOrigin(0.5).setDepth(2).setResolution(2);
      this.challengeLesson = this.add.text(0, 0, challenge.lesson, {
        fontFamily: 'Oxanium, Arial, sans-serif', fontSize: '12px', fontStyle: 'italic 600',
        color: '#edf7ff', stroke: '#07111e', strokeThickness: 1,
        align: 'center', wordWrap: { width: 360 },
      }).setOrigin(0.5).setDepth(2).setResolution(2);
      this.challengeButtonLabel = this.add.text(0, 0, 'INICIAR DESAFIO', {
        fontFamily: 'Oxanium, Arial, sans-serif', fontSize: '18px', fontStyle: 'italic 800',
        color: '#ffffff', stroke: '#29070b', strokeThickness: 2,
      }).setOrigin(0.5).setDepth(3).setResolution(2);
      this.challengeButtonZone = this.add.zone(0, 0, 440, 78).setDepth(4)
        .setInteractive({ useHandCursor: true });
      this.challengeButtonZone.on('pointerdown', () => this.showChallengeFeedback());
      this.input.keyboard?.on('keydown-ENTER', () => this.showChallengeFeedback());
      this.input.keyboard?.on('keydown-SPACE', () => this.showChallengeFeedback());
    }
    this.pilotLabel = this.add.text(0, 0, 'PILOTO:', {
      fontFamily: 'Oxanium, Arial, sans-serif', fontSize: '16px', fontStyle: 'italic 700',
      color: '#71f6ff', stroke: '#07111e', strokeThickness: 1.5,
      padding: { top: 2, bottom: 2 },
    }).setOrigin(0, 0.5).setDepth(2).setResolution(2);
    this.pilotName = this.add.text(0, 0, pilot.name, {
      fontFamily: 'Oxanium, Arial, sans-serif', fontSize: '14px', fontStyle: 'italic 800',
      color: '#ffffff', stroke: '#07111e', strokeThickness: 2,
      padding: { top: 2, bottom: 2 },
    }).setOrigin(0, 0.5).setDepth(2).setResolution(2);
    this.input.keyboard?.on('keydown-ESC', () => this.returnToSelection());
    this.resizeShell();
  }

  private returnToSelection(): void {
    this.goTo(SCENES.characters);
  }

  layout(width: number, height: number): void {
    this.hideShellVisuals();
    const source = this.mapArtwork?.texture.getSourceImage();
    if (!source) return;
    const scale = Math.min(width / source.width, height / source.height);
    const backdropSource = this.mapBackdrop.texture.getSourceImage();
    const backdropScale = Math.max(
      width / backdropSource.width,
      height / backdropSource.height,
    );
    this.mapBackdrop.setPosition(width / 2, height / 2)
      .setDisplaySize(
        backdropSource.width * backdropScale,
        backdropSource.height * backdropScale,
      );
    this.mapArtwork.setPosition(width / 2, height / 2)
      .setDisplaySize(source.width * scale, source.height * scale);
    if (this.planetArtwork && this.planetMaskShape) {
      const centerX = width / 2 + (274 - source.width / 2) * scale;
      const centerY = height / 2 + (278 - source.height / 2) * scale;
      const diameter = 190 * scale;
      const planetSource = this.planetArtwork.texture.getSourceImage();
      const planetScale = Math.min(diameter / planetSource.width, diameter / planetSource.height);
      this.planetArtwork.setPosition(centerX, centerY)
        .setDisplaySize(planetSource.width * planetScale, planetSource.height * planetScale);
      this.planetMaskShape.clear().fillStyle(0xffffff).fillCircle(centerX, centerY, diameter / 2);
    }
    const point = (x: number, y: number): [number, number] => [
      width / 2 + (x - source.width / 2) * scale,
      height / 2 + (y - source.height / 2) * scale,
    ];
    const place = (image: Phaser.GameObjects.Image | undefined, x: number, y: number,
      objectWidth: number, objectHeight = objectWidth): void => {
      if (!image) return;
      const [screenX, screenY] = point(x, y);
      image.setPosition(screenX, screenY).setDisplaySize(objectWidth * scale, objectHeight * scale);
    };
    const placeText = (
      label: Phaser.GameObjects.Text | undefined,
      x: number,
      y: number,
      minScreenFontSize: number,
    ): void => {
      if (!label) return;
      const [screenX, screenY] = point(x, y);
      const baseFontSize = Number.parseFloat(String(label.style.fontSize)) || 1;
      const textScale = Math.max(scale, minScreenFontSize / baseFontSize);
      const resolution = Math.max(2,
        Math.ceil(2 * (window.devicePixelRatio || 1) / textScale));
      if (label.style.resolution !== resolution) label.setResolution(resolution);
      label.setPosition(screenX, screenY).setScale(textScale);
    };

    if (this.pilotIcon) {
      const iconSource = this.pilotIcon.texture.getSourceImage();
      const iconScale = Math.min(48 / iconSource.width, 48 / iconSource.height);
      const [x, y] = point(1250, 218);
      this.pilotIcon.setPosition(x, y).setDisplaySize(
        iconSource.width * iconScale * scale,
        iconSource.height * iconScale * scale,
      );
    }
    const compactPortrait = scale < 0.32;
    placeText(this.originSubtitle, 1305, compactPortrait ? 178 : 204, 7.5);
    placeText(this.originName, 1305, compactPortrait ? 232 : 242, 8.5);

    const portraitSize = 68;
    if (this.pilotPortrait) {
      const sourceImage = this.pilotPortrait.texture.getSourceImage();
      const cropSize = Math.min(sourceImage.width, sourceImage.height);
      this.pilotPortrait.setCrop(
        Math.floor((sourceImage.width - cropSize) / 2),
        Math.floor((sourceImage.height - cropSize) / 2),
        cropSize,
        cropSize,
      );
    }
    place(this.pilotPortrait, 1240, 310, portraitSize);
    if (this.pilotPortraitMask) {
      const [x, y] = point(1240, 310);
      this.pilotPortraitMask.clear().fillStyle(0xffffff)
        .fillRect(x - portraitSize * scale / 2, y - portraitSize * scale / 2,
          portraitSize * scale, portraitSize * scale);
    }
    placeText(this.pilotLabel, 1320, compactPortrait ? 270 : 287, 8);
    placeText(this.pilotName, 1320, 327, 0);
    placeText(this.challengeTitle, 1390, 356, 8);
    placeText(this.challengeRaces, 1400, 389, 8);
    placeText(this.challengeReward, 1400, 426, 8);
    placeText(this.challengeLessonTitle, 1400, 494, 8);
    if (this.challengeLesson) {
      const [x, y] = point(1400, 548);
      this.challengeLesson.setPosition(x, y).setWordWrapWidth(350)
        .setScale(Math.max(scale, 7 / 12));
    }
    placeText(this.challengeButtonLabel, 1400, 731, 9);
    if (this.challengeButtonZone) {
      const [x, y] = point(1400, 731);
      this.challengeButtonZone.setPosition(x, y).setScale(scale);
    }
  }

  private showChallengeFeedback(): void {
    const label = this.challengeButtonLabel;
    if (!label || !this.challengeButtonZone?.input?.enabled) return;
    label.setText('DESAFIO SELECIONADO').setColor('#71f6ff');
    this.tweens.killTweensOf(label);
    label.setScale(label.scaleX * 0.96, label.scaleY * 0.96);
    this.time.delayedCall(850, () => {
      label.setText('INICIAR DESAFIO').setColor('#ffffff');
      this.layout(this.scale.width, this.scale.height);
    });
  }

  private createBackdropTexture(): string {
    const textureKey = 'galactic-map-fill-backdrop';
    if (this.textures.exists(textureKey)) return textureKey;
    const source = this.textures.get('galactic-map-artwork').getSourceImage();
    if (!(source instanceof HTMLImageElement || source instanceof HTMLCanvasElement)) {
      return 'galactic-map-artwork';
    }
    const texture = this.textures.createCanvas(
      textureKey,
      MAP_BACKDROP_CROP.width,
      MAP_BACKDROP_CROP.height,
    );
    if (!texture) return 'galactic-map-artwork';

    const context = texture.context;
    const blur = MAP_BACKDROP_BLUR;
    context.filter = `blur(${blur}px)`;
    context.drawImage(
      source,
      MAP_BACKDROP_CROP.x,
      MAP_BACKDROP_CROP.y,
      MAP_BACKDROP_CROP.width,
      MAP_BACKDROP_CROP.height,
      -blur,
      -blur,
      MAP_BACKDROP_CROP.width + blur * 2,
      MAP_BACKDROP_CROP.height + blur * 2,
    );
    context.filter = 'none';
    texture.refresh();
    return textureKey;
  }

  private hideShellVisuals(): void {
    for (const overlay of [this.chrome, this.brand, this.edition, this.system, this.footerLeft,
      this.footerRight, this.toast, this.saveNotice]) overlay?.setVisible(false);
  }
}
