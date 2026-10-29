import { drawStationFrame } from '../visuals/preparation/StationArt.ts';
import type Phaser from 'phaser';

type StationTextField = { label: Phaser.GameObjects.Text; value: Phaser.GameObjects.Text };
type StationModule = { arrange: (x: number, y: number, w: number, h: number, primary?: boolean) => unknown };
type VisibleGameObject = { setVisible: (visible: boolean) => unknown };
type StationLayoutScene = Phaser.Scene & {
  content: Phaser.GameObjects.Container;
  stationBackdrop: Phaser.GameObjects.Image;
  chrome: VisibleGameObject;
  brand: VisibleGameObject;
  edition: VisibleGameObject;
  system: VisibleGameObject;
  footerLeft: VisibleGameObject;
  footerRight: VisibleGameObject;
  title: Phaser.GameObjects.Image;
  stationKicker: Phaser.GameObjects.Text;
  settings: { position: (x: number, y: number) => void };
  pilotPanel: Phaser.GameObjects.Container;
  pilotFrame: Phaser.GameObjects.Graphics;
  pilotPortrait: Phaser.GameObjects.Image;
  pilotTag: Phaser.GameObjects.Text;
  pilotName: Phaser.GameObjects.Text;
  rivalPanel: Phaser.GameObjects.Container;
  rivalFrame: Phaser.GameObjects.Graphics;
  rivalPortrait: Phaser.GameObjects.Image;
  rivalTag: Phaser.GameObjects.Text;
  rivalName: Phaser.GameObjects.Text;
  campaign: Phaser.GameObjects.Container;
  campaignFrame: Phaser.GameObjects.Graphics;
  playerLabel: Phaser.GameObjects.Text;
  playerName: Phaser.GameObjects.Text;
  seasonLabel: Phaser.GameObjects.Text;
  campaignFields: StationTextField[];
  scoreProgress: Phaser.GameObjects.Graphics;
  scoreStatus: Phaser.GameObjects.Text;
  raceState: { attempt: { status: string }; score: number; targetScore: number };
  vehicleFrame: Phaser.GameObjects.Graphics;
  vehicleTitle: Phaser.GameObjects.Text;
  vehicleAbility: Phaser.GameObjects.Text;
  setPreviewBounds: (x: number, y: number, w: number, h: number) => void;
  loadingLabel?: Phaser.GameObjects.Text;
  rivalVehicle: Phaser.GameObjects.Container;
  rivalVehicleFrame: Phaser.GameObjects.Graphics;
  rivalVehicleTitle: Phaser.GameObjects.Text;
  rivalVehicleSoon: Phaser.GameObjects.Text;
  rivalVehicleShape: Phaser.GameObjects.Graphics;
  rivalPreview?: Phaser.GameObjects.Image | null;
  motor: StationModule;
  suspension: StationModule;
  armor: StationModule;
  modules: StationModule[];
  startButton: StationModule;
  rewardButton: Phaser.GameObjects.GameObject & { visible: boolean; arrange: StationModule['arrange'] };
  toast: Phaser.GameObjects.Text;
};

function portrait(panel: Phaser.GameObjects.Container, frame: Phaser.GameObjects.Graphics, image: Phaser.GameObjects.Image,
  tag: Phaser.GameObjects.Text, name: Phaser.GameObjects.Text, x: number, y: number, w: number, h: number, rival: boolean) {
  panel.setPosition(x, y).setSize(w, h);
  drawStationFrame(frame, w, h, { accent: rival ? 0xff326d : 0x71f6ff });
  const small = w < 220;
  tag.setPosition(-w / 2 + 22, -h / 2 + 20).setOrigin(0, 0.5).setFontSize(small ? 13 : 20);
  image.setPosition(0, 2).setDisplaySize(w - 34, h - 68);
  name.setPosition(0, h / 2 - 23).setFontSize(small ? 14 : 21).setScale(1);
  name.setScale(Math.min(1, (w - 34) / Math.max(1, name.width)));
}

function campaign(scene: StationLayoutScene, narrow: boolean) {
  const w = narrow ? 380 : 930, h = narrow ? 182 : 245;
  scene.campaign.setPosition(0, narrow ? -170 : -176).setSize(w, h);
  drawStationFrame(scene.campaignFrame, w, h, { accent: 0x7293a2 });
  const left = -w / 2 + (narrow ? 22 : 28);
  scene.playerLabel.setOrigin(0, 0.5).setPosition(left, narrow ? -58 : -72)
    .setFontSize(narrow ? 12 : 20).setColor('#ff345d');
  scene.playerName.setOrigin(0, 0.5).setPosition(left, narrow ? -36 : -40)
    .setFontSize(narrow ? 18 : 32).setWordWrapWidth(narrow ? 155 : 280);
  scene.seasonLabel.setPosition(0, -h / 2 + 12).setFontSize(narrow ? 8 : 11)
    .setVisible(scene.raceState.attempt.status === 'qualified');
  scene.campaignFields.forEach(({ label, value }, index: number) => {
    let x: number, y: number;
    if (index < 3) {
      x = narrow ? [-122, 0, 122][index] : [70, 255, 397][index];
      y = narrow ? 1 : -72;
    } else {
      x = narrow ? [-90, 90][index - 3] : [-155, 215][index - 3];
      y = narrow ? 42 : 7;
    }
    label.setPosition(x, y).setFontSize(narrow ? (index > 2 ? 9 : 10) : 16).setColor('#a2c3d7');
    value.setPosition(x, y + (narrow ? 18 : 29)).setFontSize(narrow ? 19 : 32)
      .setColor(index === 1 ? '#ff3c54' : index === 4 ? '#71f6ff' : '#edf7ff');
  });
  const g = scene.scoreProgress.clear(), barW = narrow ? 312 : 760;
  const y = narrow ? 73 : 78, barH = narrow ? 7 : 13;
  const progress = Math.max(0, Math.min(1, scene.raceState.score / scene.raceState.targetScore));
  const gap = narrow ? 2 : 4, count = 20, slot = (barW - gap * (count - 1)) / count;
  g.fillStyle(0x02070c).fillRect(-barW / 2 - 6, y - 5, barW + 12, barH + 10)
    .lineStyle(1, 0x385569).strokeRect(-barW / 2 - 6, y - 5, barW + 12, barH + 10);
  for (let i = 0; i < count; i++) {
    const x = -barW / 2 + i * (slot + gap), filled = Math.min(1, Math.max(0, progress * count - i));
    g.fillStyle(0x10242e).fillRect(x, y, slot, barH);
    if (filled) {
      const color = i < 7 ? 0xff2e35 : i < 14 ? 0xff7730 : 0xffdc59;
      g.fillStyle(color, 0.14).fillRect(x - 2, y - 3, slot * filled + 4, barH + 6)
        .fillStyle(color).fillRect(x, y, slot * filled, barH)
        .fillStyle(0xffe6a4).fillRect(x + 1, y + 1, Math.max(0, slot * filled - 2), 2);
    }
  }
  scene.scoreStatus.setPosition(0, narrow ? 91 : 111).setFontSize(narrow ? 8 : 11)
    .setWordWrapWidth(w - 30).setVisible(true);
}

/** Presentation only. Coordinates preserve the supplied reference's desktop
 * hierarchy, while portrait stacks the same information without changing rules. */
export function layoutStation(scene: StationLayoutScene, w: number, h: number) {
  const narrow = w < 700 && w < h;
  const designW = narrow ? 400 : 1600, designH = narrow ? 1070 : 900;
  const scale = Math.min((w - (narrow ? 16 : 24)) / designW, (h - 68) / designH, 1.2);
  scene.content.setPosition(w / 2, (h - 60) / 2 + 6).setScale(scale);
  const backdropScale = Math.max(w / 1664, h / 940);
  scene.stationBackdrop.setPosition(w / 2, h / 2).setDisplaySize(1664 * backdropScale, 940 * backdropScale);
  // This screen owns its header artwork, leaving the common shell untouched.
  for (const item of [scene.chrome, scene.brand, scene.edition, scene.system, scene.footerLeft, scene.footerRight]) item.setVisible(false);
  scene.title.setPosition(narrow ? -12 : -400, narrow ? -452 : -365)
    .setDisplaySize(narrow ? 370 : 780, narrow ? 69 : 146);
  scene.stationKicker.setPosition(narrow ? 0 : 520, narrow ? -411 : -354)
    .setFontSize(narrow ? 8 : 12).setColor('#ff3a56').setVisible(!narrow);
  scene.settings.position(Math.max(8, w - 64), 12);
  portrait(scene.pilotPanel, scene.pilotFrame, scene.pilotPortrait, scene.pilotTag, scene.pilotName,
    narrow ? -99 : -640, narrow ? -345 : -178, narrow ? 184 : 285, narrow ? 150 : 275, false);
  portrait(scene.rivalPanel, scene.rivalFrame, scene.rivalPortrait, scene.rivalTag, scene.rivalName,
    narrow ? 99 : 640, narrow ? -345 : -178, narrow ? 184 : 285, narrow ? 150 : 275, true);
  campaign(scene, narrow);

  const vx = narrow ? -63 : -162, vy = narrow ? 30 : 108;
  const vw = narrow ? 252 : 600, vh = narrow ? 200 : 300;
  scene.vehicleFrame.setPosition(vx, vy);
  drawStationFrame(scene.vehicleFrame, vw, vh, { accent: 0xff4439 });
  scene.vehicleTitle.setPosition(vx, vy - vh / 2 + (narrow ? 19 : 24))
    .setFontSize(narrow ? 12 : 22).setColor('#ff3d54');
  scene.vehicleAbility.setPosition(vx, vy + vh / 2 - 34).setFontSize(narrow ? 8 : 12).setColor('#ffcf49');
  scene.setPreviewBounds(vx, vy + 1, vw - 24, vh - 86);
  scene.loadingLabel?.setOrigin(0.5).setPosition(vx, vy + vh / 2 - 16).setFontSize(narrow ? 6 : 10);
  if (scene.loadingLabel?.parentContainer === scene.content) scene.content.bringToTop(scene.loadingLabel);
  // Three color indicators communicate the actual saved team color, not a fake
  // body repaint. They are decoration rather than unimplemented arrow controls.
  for (let i = 0; i < 3; i++) {
    const colors = [0xe53935, 0x1677ff, 0xffd027];
    scene.vehicleFrame.fillStyle(colors[i], 0.8).fillCircle((i - 1) * 18, vh / 2 - 34, narrow ? 3 : 4);
  }

  const rx = narrow ? 135 : 330, rw = narrow ? 124 : 355;
  scene.rivalVehicle.setPosition(rx, vy).setSize(rw, vh);
  drawStationFrame(scene.rivalVehicleFrame, rw, vh, { accent: 0xc53fff });
  scene.rivalVehicleTitle.setPosition(0, -vh / 2 + (narrow ? 19 : 24)).setFontSize(narrow ? 9 : 14).setColor('#a1d9e5');
  scene.rivalVehicleSoon.setPosition(0, vh / 2 - 24).setFontSize(narrow ? 10 : 19).setColor('#ed48e2');
  scene.rivalVehicleShape.setScale(narrow ? 0.65 : 1.5);
  scene.rivalPreview?.setPosition(0, 0).setDisplaySize(rw - 24, vh - 86);
  scene.motor.arrange(narrow ? -100 : -645, narrow ? 210 : 108, narrow ? 187 : 300, narrow ? 140 : 300);
  scene.suspension.arrange(narrow ? 100 : 650, narrow ? 175 : 25, narrow ? 187 : 290, narrow ? 70 : 134);
  scene.armor.arrange(narrow ? 100 : 650, narrow ? 247 : 187, narrow ? 187 : 290, narrow ? 66 : 134);
  scene.modules.forEach((button: StationModule, index: number) => {
    if (narrow) button.arrange(index < 3 ? (index - 1) * 131 : (index - 3.5) * 198,
      index < 3 ? 332 : 411, index < 3 ? 125 : 190, index < 3 ? 82 : 62);
    else button.arrange((index - 2) * 310, 315, 300, 78);
  });
  const reward = scene.rewardButton.visible;
  scene.startButton.arrange(reward ? (narrow ? -99 : -220) : 0, narrow ? 490 : 405,
    reward ? (narrow ? 188 : 510) : (narrow ? 360 : 640), narrow ? 78 : 98, true);
  scene.rewardButton.arrange(narrow ? 99 : 340, narrow ? 490 : 405, narrow ? 188 : 520, narrow ? 78 : 98);
  scene.toast.setPosition(w / 2, h - 62).setFontSize(13).setScale(1).setWordWrapWidth(w - 30);
}
