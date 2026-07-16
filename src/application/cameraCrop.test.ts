import { calculateCameraCrop } from './cameraCrop.ts';

const closeTo = (actual: number, expected: number, label: string) => {
  if (Math.abs(actual - expected) > 0.01) {
    throw new Error(`${label}: erwartet ${expected}, erhalten ${actual}`);
  }
};

const portraitCrop = calculateCameraCrop(
  { width: 1080, height: 1920 },
  { left: 0, top: 100, width: 430, height: 1000 },
  { left: 50, top: 250, width: 330, height: 700 },
);

closeTo(portraitCrop.x, 223.2, 'Portrait x');
closeTo(portraitCrop.y, 288, 'Portrait y');
closeTo(portraitCrop.width, 633.6, 'Portrait Breite');
closeTo(portraitCrop.height, 1344, 'Portrait Höhe');

const mirroredCrop = calculateCameraCrop(
  { width: 1600, height: 1200 },
  { left: 10, top: 20, width: 400, height: 600 },
  { left: 30, top: 120, width: 300, height: 400 },
  true,
);

closeTo(mirroredCrop.x, 560, 'Gespiegelt x');
closeTo(mirroredCrop.y, 200, 'Gespiegelt y');
closeTo(mirroredCrop.width, 600, 'Gespiegelt Breite');
closeTo(mirroredCrop.height, 800, 'Gespiegelt Höhe');

console.info('Kamera-Zuschnitt: sichtbarer Dokumentrahmen wird korrekt auf Kamerapixel abgebildet.');