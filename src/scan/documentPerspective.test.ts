import { findDocumentCorners, isSafeAutomaticCrop, isSafeDetectedPaperCrop, isValidDocumentCorners, previewFilter, type DocumentCornerDetectionMeta } from './documentPerspective.ts';

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

const almostFullFrame = {
  topLeft: { x: 0.04, y: 0.03 },
  topRight: { x: 0.96, y: 0.04 },
  bottomRight: { x: 0.95, y: 0.97 },
  bottomLeft: { x: 0.03, y: 0.96 },
};
if (!isSafeAutomaticCrop(almostFullFrame)) {
  throw new Error('Ein vollständiges, konvexes Blatt muss als sicherer Zuschnitt gelten.');
}

const partialBrightRegion = {
  topLeft: { x: 0.22, y: 0.18 },
  topRight: { x: 0.82, y: 0.18 },
  bottomRight: { x: 0.82, y: 0.72 },
  bottomLeft: { x: 0.22, y: 0.72 },
};
if (isSafeAutomaticCrop(partialBrightRegion)) {
  throw new Error('Eine Teilfläche darf niemals als vollständiges Blatt zugeschnitten werden.');
}

const deceptiveLargeRegion = {
  topLeft: { x: 0.10, y: 0.05 },
  topRight: { x: 0.90, y: 0.05 },
  bottomRight: { x: 0.90, y: 0.95 },
  bottomLeft: { x: 0.10, y: 0.95 },
};
if (isSafeAutomaticCrop(deceptiveLargeRegion)) {
  throw new Error('Auch eine große innere Teilfläche darf nicht automatisch zugeschnitten werden.');
}
if (!isSafeDetectedPaperCrop(deceptiveLargeRegion)) {
  throw new Error('Nach dem Foto muss ein vollständiges Blatt mit sichtbarem Tischrand zugeschnitten werden.');
}

const smallerCompletePage = {
  topLeft: { x: 0.19, y: 0.18 },
  topRight: { x: 0.79, y: 0.11 },
  bottomRight: { x: 0.80, y: 0.84 },
  bottomLeft: { x: 0.22, y: 0.80 },
};
if (!isSafeDetectedPaperCrop(smallerCompletePage)) {
  throw new Error('Ein vollständig erkanntes Blatt muss auch mit größerem Abstand zur Kamera übernommen werden.');
}

const almostEntireFrame = {
  topLeft: { x: 0.01, y: 0.01 },
  topRight: { x: 0.99, y: 0.01 },
  bottomRight: { x: 0.99, y: 0.99 },
  bottomLeft: { x: 0.01, y: 0.99 },
};
if (isSafeDetectedPaperCrop(almostEntireFrame)) {
  throw new Error('Der fast vollständige Kamerarahmen darf nicht als sicher erkanntes Blatt gelten.');
}

const halfPageAtTopEdge = {
  topLeft: { x: 0.04, y: 0.02 },
  topRight: { x: 0.96, y: 0.02 },
  bottomRight: { x: 0.94, y: 0.58 },
  bottomLeft: { x: 0.05, y: 0.58 },
};
if (isSafeDetectedPaperCrop(halfPageAtTopEdge)) {
  throw new Error('Ein nur teilweise sichtbares Blatt darf nicht automatisch zugeschnitten werden.');
}

const crossedCorners = {
  topLeft: { x: 0.03, y: 0.03 },
  topRight: { x: 0.96, y: 0.96 },
  bottomRight: { x: 0.96, y: 0.03 },
  bottomLeft: { x: 0.03, y: 0.96 },
};
if (isSafeAutomaticCrop(crossedCorners)) throw new Error('Gekreuzte Ecken müssen verworfen werden.');
if (isValidDocumentCorners(crossedCorners)) throw new Error('Gekreuzte manuelle Ecken müssen ungültig sein.');

const whitePixels = new Uint8ClampedArray(40 * 40 * 4);
whitePixels.fill(255);
const fallbackMeta: DocumentCornerDetectionMeta = { source: 'line-detection' };
findDocumentCorners(whitePixels, 40, 40, fallbackMeta);
if (fallbackMeta.source !== 'bounds-fallback') {
  throw new Error('Ein interner Vollbild-Fallback darf nie als echte Linienerkennung gelten.');
}

const texturedWidth = 180;
const texturedHeight = 240;
const texturedPixels = new Uint8ClampedArray(texturedWidth * texturedHeight * 4);
for (let y = 0; y < texturedHeight; y += 1) {
  for (let x = 0; x < texturedWidth; x += 1) {
    const index = (y * texturedWidth + x) * 4;
    const insidePaper = x >= 44 && x <= 136 && y >= 24 && y <= 216;
    const texture = 118 + ((x * 17 + y * 11) % 48);
    const textLine = insidePaper && y % 19 < 2 && x > 55 && x < 125;
    const value = textLine ? 54 : insidePaper ? 238 : texture;
    texturedPixels[index] = value;
    texturedPixels[index + 1] = insidePaper ? value : Math.max(0, value - 7);
    texturedPixels[index + 2] = insidePaper ? value : Math.max(0, value - 12);
    texturedPixels[index + 3] = 255;
  }
}
const texturedMeta: DocumentCornerDetectionMeta = { source: 'bounds-fallback' };
const texturedCorners = findDocumentCorners(texturedPixels, texturedWidth, texturedHeight, texturedMeta);
if (texturedMeta.source !== 'line-detection') {
  throw new Error('Ein helles Blatt auf strukturiertem Hintergrund muss erkannt werden.');
}
assertNear(texturedCorners.topLeft.x, 44 / texturedWidth, 'Texturtest oben links x');
assertNear(texturedCorners.topLeft.y, 24 / texturedHeight, 'Texturtest oben links y');
assertNear(texturedCorners.bottomRight.x, 136 / texturedWidth, 'Texturtest unten rechts x');
assertNear(texturedCorners.bottomRight.y, 216 / texturedHeight, 'Texturtest unten rechts y');
console.info('Dokument-Scaneditor: schräge Blattecken und Filter werden lokal vorbereitet.');
