import { fitPreviewToStage } from './previewGeometry.ts';

const portrait = fitPreviewToStage(3000, 4000, 400, 300);
if (portrait.width !== 225 || portrait.height !== 300) {
  throw new Error(`Hochformat muss vollständig in die Bühne passen: ${portrait.width}x${portrait.height}`);
}

const landscape = fitPreviewToStage(4000, 3000, 240, 500);
if (landscape.width !== 240 || landscape.height !== 180) {
  throw new Error(`Querformat muss vollständig in die Bühne passen: ${landscape.width}x${landscape.height}`);
}

const invalid = fitPreviewToStage(0, 0, 0, 0);
if (invalid.width !== 1 || invalid.height !== 1) {
  throw new Error('Ungültige Größen brauchen einen sicheren Minimalwert.');
}

console.info('Scan-Vorschau: Hoch- und Querformat werden vollständig eingepasst.');
