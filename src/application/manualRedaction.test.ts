import { createManualBox, toDocumentPoint } from './manualRedaction.ts';

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
