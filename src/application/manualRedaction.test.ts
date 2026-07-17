import { createManualBox, scaleDocumentBox, toDocumentPoint } from './manualRedaction.ts';

const point = toDocumentPoint(150, 100, { left: 50, top: 50, width: 200, height: 100 }, 1000, 500);
if (point.x !== 500 || point.y !== 250) throw new Error(`Falsche Koordinatenumrechnung: ${JSON.stringify(point)}`);

const reversed = createManualBox({ x: 300, y: 200 }, { x: 100, y: 80 });
if (!reversed || reversed.left !== 100 || reversed.top !== 80 || reversed.width !== 200 || reversed.height !== 120) {
  throw new Error(`Rückwärts gezogener Bereich ist fehlerhaft: ${JSON.stringify(reversed)}`);
}

if (createManualBox({ x: 10, y: 10 }, { x: 12, y: 12 }) !== null) {
  throw new Error('Versehentliche Mini-Markierungen müssen verworfen werden.');
}

console.info('Manual Redaction: Touch-/Mauskoordinaten und Rechtecke erfolgreich geprüft.');

const highResolutionBox = scaleDocumentBox(
  { left: 90, top: 120, width: 360, height: 60 },
  { width: 900, height: 1200 },
  { width: 2700, height: 3600 },
);
if (highResolutionBox.left !== 270 || highResolutionBox.top !== 360
  || highResolutionBox.width !== 1080 || highResolutionBox.height !== 180) {
  throw new Error(`High-resolution box scaling failed: ${JSON.stringify(highResolutionBox)}`);
}

const clampedBox = scaleDocumentBox(
  { left: 850, top: 1150, width: 100, height: 100 },
  { width: 900, height: 1200 },
  { width: 1800, height: 2400 },
);
if (clampedBox.left !== 1700 || clampedBox.top !== 2300
  || clampedBox.width !== 100 || clampedBox.height !== 100) {
  throw new Error(`Out-of-bounds box was not clamped: ${JSON.stringify(clampedBox)}`);
}
