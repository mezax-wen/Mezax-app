import { measureFrameSharpness, selectSharpestFrame } from './cameraFrameSelection';

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

function imagePixels(width: number, height: number, valueAt: (x: number, y: number) => number) {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const value = valueAt(x, y);
      pixels[offset] = value;
      pixels[offset + 1] = value;
      pixels[offset + 2] = value;
      pixels[offset + 3] = 255;
    }
  }
  return pixels;
}

const width = 96;
const height = 96;
const sharpTextLikePattern = imagePixels(width, height, (x) => (Math.floor(x / 3) % 2 ? 230 : 25));
const softPattern = imagePixels(width, height, (x) => Math.round(128 + Math.sin(x / 12) * 35));

const sharpScore = measureFrameSharpness(sharpTextLikePattern, width, height);
const softScore = measureFrameSharpness(softPattern, width, height);
assert(sharpScore > softScore, 'Klare Textkanten müssen schärfer bewertet werden als weiche Verläufe.');
assert(selectSharpestFrame([softScore, sharpScore, softScore]) === 1, 'Das schärfste Bild muss ausgewählt werden.');
assert(selectSharpestFrame([]) === -1, 'Eine leere Bildserie hat kein bestes Bild.');
assert(selectSharpestFrame([5, 5, 4]) === 0, 'Bei Gleichstand bleibt das erste scharfe Bild erhalten.');

console.log('cameraFrameSelection tests passed');