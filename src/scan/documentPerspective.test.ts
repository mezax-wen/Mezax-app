import { findDocumentCorners, previewFilter } from './documentPerspective.ts';

const width = 120;
const height = 120;
const polygon = [
  { x: 20, y: 10 },
  { x: 105, y: 16 },
  { x: 96, y: 108 },
  { x: 12, y: 100 },
];

function insidePolygon(x: number, y: number) {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
    const currentPoint = polygon[index];
    const previousPoint = polygon[previous];
    const intersects = ((currentPoint.y > y) !== (previousPoint.y > y))
      && x < ((previousPoint.x - currentPoint.x) * (y - currentPoint.y)) / (previousPoint.y - currentPoint.y) + currentPoint.x;
    if (intersects) inside = !inside;
  }
  return inside;
}

const pixels = new Uint8ClampedArray(width * height * 4);
for (let y = 0; y < height; y += 1) {
  for (let x = 0; x < width; x += 1) {
    const index = (y * width + x) * 4;
    const value = insidePolygon(x, y) ? 244 : 28;
    pixels[index] = value;
    pixels[index + 1] = value;
    pixels[index + 2] = value;
    pixels[index + 3] = 255;
  }
}

const corners = findDocumentCorners(pixels, width, height);
const assertNear = (actual: number, expected: number, label: string) => {
  if (Math.abs(actual - expected) > 0.13) {
    throw new Error(`${label}: erwartet etwa ${expected}, erhalten ${actual}`);
  }
};

assertNear(corners.topLeft.x, 20 / width, 'Oben links x');
assertNear(corners.topLeft.y, 10 / height, 'Oben links y');
assertNear(corners.topRight.x, 105 / width, 'Oben rechts x');
assertNear(corners.bottomRight.y, 108 / height, 'Unten rechts y');
assertNear(corners.bottomLeft.x, 12 / width, 'Unten links x');

if (previewFilter('original') !== 'none') throw new Error('Originalfilter darf das Bild nicht verändern.');
if (!previewFilter('blackwhite').includes('grayscale')) throw new Error('Schwarzweißvorschau muss Graustufen verwenden.');

console.info('Dokument-Scaneditor: schräge Blattecken und Filter werden lokal vorbereitet.');
