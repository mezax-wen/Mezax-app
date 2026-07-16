import { measureScanQuality } from './scanQuality.ts';

function createPixels(width: number, height: number, valueAt: (x: number, y: number) => number) {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      const value = valueAt(x, y);
      pixels[index] = value;
      pixels[index + 1] = value;
      pixels[index + 2] = value;
      pixels[index + 3] = 255;
    }
  }
  return pixels;
}

const sharpDocument = createPixels(1000, 1200, (x, y) => ((x % 28 < 5 || y % 74 < 4) ? 35 : 226));
const sharpResult = measureScanQuality(sharpDocument, 1000, 1200);
if (sharpResult.level !== 'good') throw new Error(`Scharfer Scan sollte gut sein, erhalten: ${sharpResult.level}`);

const darkDocument = createPixels(1000, 1200, (x) => (x % 80 < 3 ? 24 : 48));
const darkResult = measureScanQuality(darkDocument, 1000, 1200);
if (!darkResult.metrics.some((metric) => metric.id === 'brightness' && metric.status === 'poor')) {
  throw new Error('Dunkle Dokumente müssen als zu dunkel erkannt werden.');
}

const flatDocument = createPixels(1000, 1200, () => 182);
const flatResult = measureScanQuality(flatDocument, 1000, 1200);
if (!flatResult.metrics.some((metric) => metric.id === 'sharpness' && metric.status === 'poor')) {
  throw new Error('Strukturlose Aufnahmen müssen als unscharf erkannt werden.');
}

const lowResolution = createPixels(420, 560, (x) => (x % 24 < 5 ? 40 : 220));
const lowResolutionResult = measureScanQuality(lowResolution, 420, 560);
if (!lowResolutionResult.metrics.some((metric) => metric.id === 'resolution' && metric.status === 'poor')) {
  throw new Error('Zu kleine Scans müssen eine Auflösungswarnung erhalten.');
}

console.info('Scanqualität: Schärfe, Licht, Kontrast und Auflösung werden lokal bewertet.');
