import { renderDocumentScan, type DocumentCorners } from './documentPerspective.ts';

export type ScanQualityLevel = 'good' | 'check' | 'retry';

export type ScanQualityMetric = {
  id: 'sharpness' | 'brightness' | 'contrast' | 'resolution';
  label: string;
  status: 'good' | 'check' | 'poor';
  message: string;
};

export type ScanQualityResult = {
  score: number;
  level: ScanQualityLevel;
  title: string;
  metrics: ScanQualityMetric[];
};

const luminance = (red: number, green: number, blue: number) => red * 0.299 + green * 0.587 + blue * 0.114;

export function measureScanQuality(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
): ScanQualityResult {
  if (!width || !height || pixels.length < width * height * 4) {
    return {
      score: 0,
      level: 'retry',
      title: 'Neu fotografieren empfohlen',
      metrics: [{ id: 'resolution', label: 'Auflösung', status: 'poor', message: 'Bilddaten fehlen' }],
    };
  }

  const step = Math.max(1, Math.round(Math.min(width, height) / 420));
  let count = 0;
  let sum = 0;
  let sumSquares = 0;
  let edgeTotal = 0;
  let edgeCount = 0;
  let previousRow = new Float32Array(Math.ceil(width / step));

  for (let y = 0; y < height; y += step) {
    let previous = -1;
    let column = 0;
    const currentRow = new Float32Array(previousRow.length);
    for (let x = 0; x < width; x += step) {
      const index = (y * width + x) * 4;
      const value = luminance(pixels[index], pixels[index + 1], pixels[index + 2]);
      currentRow[column] = value;
      sum += value;
      sumSquares += value * value;
      count += 1;
      if (previous >= 0) {
        edgeTotal += Math.abs(value - previous);
        edgeCount += 1;
      }
      if (y > 0) {
        edgeTotal += Math.abs(value - previousRow[column]);
        edgeCount += 1;
      }
      previous = value;
      column += 1;
    }
    previousRow = currentRow;
  }

  const average = sum / Math.max(1, count);
  const contrast = Math.sqrt(Math.max(0, sumSquares / Math.max(1, count) - average * average));
  const sharpness = edgeTotal / Math.max(1, edgeCount);
  const shortEdge = Math.min(width, height);
  let score = 100;

  const metrics: ScanQualityMetric[] = [];
  if (sharpness < 5.5) {
    score -= 36;
    metrics.push({ id: 'sharpness', label: 'Schärfe', status: 'poor', message: 'Dokument wirkt unscharf' });
  } else if (sharpness < 10) {
    score -= 15;
    metrics.push({ id: 'sharpness', label: 'Schärfe', status: 'check', message: 'Text bitte kurz prüfen' });
  } else {
    metrics.push({ id: 'sharpness', label: 'Schärfe', status: 'good', message: 'Text wirkt klar' });
  }

  if (average < 62) {
    score -= 28;
    metrics.push({ id: 'brightness', label: 'Licht', status: 'poor', message: 'Aufnahme ist zu dunkel' });
  } else if (average < 88 || average > 232) {
    score -= 12;
    metrics.push({ id: 'brightness', label: 'Licht', status: 'check', message: average < 88 ? 'Mehr Licht wäre besser' : 'Sehr hell – Text prüfen' });
  } else {
    metrics.push({ id: 'brightness', label: 'Licht', status: 'good', message: 'Gut ausgeleuchtet' });
  }

  if (contrast < 18) {
    score -= 24;
    metrics.push({ id: 'contrast', label: 'Kontrast', status: 'poor', message: 'Text hebt sich kaum ab' });
  } else if (contrast < 30) {
    score -= 10;
    metrics.push({ id: 'contrast', label: 'Kontrast', status: 'check', message: 'Kontrast bitte prüfen' });
  } else {
    metrics.push({ id: 'contrast', label: 'Kontrast', status: 'good', message: 'Dokument gut lesbar' });
  }

  if (shortEdge < 620) {
    score -= 32;
    metrics.push({ id: 'resolution', label: 'Auflösung', status: 'poor', message: 'Zu wenig Bilddetails' });
  } else if (shortEdge < 900) {
    score -= 12;
    metrics.push({ id: 'resolution', label: 'Auflösung', status: 'check', message: 'Für kleine Schrift knapp' });
  } else {
    metrics.push({ id: 'resolution', label: 'Auflösung', status: 'good', message: 'Ausreichend Details' });
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  const level: ScanQualityLevel = score >= 80 ? 'good' : score >= 58 ? 'check' : 'retry';
  return {
    score,
    level,
    title: level === 'good' ? 'Scanqualität: sehr gut' : level === 'check' ? 'Scanqualität bitte prüfen' : 'Neu fotografieren empfohlen',
    metrics,
  };
}
export async function analyzeDocumentScanQuality(url: string, corners: DocumentCorners) {
  const canvas = await renderDocumentScan(url, corners, 'original', 900);
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Die lokale Qualitätsprüfung ist auf diesem Gerät nicht verfügbar.');
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  return measureScanQuality(imageData.data, canvas.width, canvas.height);
}
