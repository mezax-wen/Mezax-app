import { findDocumentBounds } from './imageOptimizer.ts';

function syntheticImage(width: number, height: number) {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      const isPaper = x >= 20 && x < 80 && y >= 10 && y < 90;
      const value = isPaper ? 244 : 35;
      pixels[index] = value;
      pixels[index + 1] = value;
      pixels[index + 2] = value;
      pixels[index + 3] = 255;
    }
  }
  return pixels;
}

const bounds = findDocumentBounds(syntheticImage(100, 100), 100, 100);
if (bounds.left > 24 || bounds.top > 14 || bounds.width < 55 || bounds.height < 75) {
  throw new Error(`Dokumentrand falsch erkannt: ${JSON.stringify(bounds)}`);
}

const invalid = findDocumentBounds(new Uint8ClampedArray(0), 0, 0);
if (invalid.width !== 0 || invalid.height !== 0) throw new Error('Leere Bilder müssen sicher behandelt werden.');

console.info('Smart Scan: Dokumentränder werden lokal erkannt.');
