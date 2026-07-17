import { renderDocumentScan, type DocumentCorners } from './documentPerspective.ts';

export type ScanQualityLevel = 'good' | 'check' | 'retry';

export type ScanQualityMetric = {
  id: 'framing' | 'sharpness' | 'brightness' | 'contrast' | 'resolution';
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
const pointDistance = (
  first: { x: number; y: number },
  second: { x: number; y: number },
) => Math.hypot(first.x - second.x, first.y - second.y);

function strongestTextEdges(values: Float32Array, gridWidth: number, gridHeight: number) {
  const responses: number[] = [];
  let detailedPixels = 0;

  for (let y = 1; y < gridHeight - 1; y += 1) {
    for (let x = 1; x < gridWidth - 1; x += 1) {
      const index = y * gridWidth + x;
      const center = values[index];
      const response = Math.abs(
        4 * center
        - values[index - 1]
        - values[index + 1]
        - values[index - gridWidth]
        - values[index + gridWidth],
      );
      responses.push(response);
      if (response >= 12) detailedPixels += 1;
    }
  }

  if (!responses.length) return { strength: 0, coverage: 0 };
  responses.sort((first, second) => second - first);
  const strongestCount = Math.max(1, Math.ceil(responses.length * 0.1));
  const strength = responses
    .slice(0, strongestCount)
    .reduce((sum, response) => sum + response, 0) / strongestCount;
  return { strength, coverage: detailedPixels / responses.length };
}

export function measureScanQuality(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  sourceShortEdge = Math.min(width, height),
  framingSafe = true,
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
  const gridWidth = Math.ceil(width / step);
  const gridHeight = Math.ceil(height / step);
  const values = new Float32Array(gridWidth * gridHeight);
  let count = 0;
  let sum = 0;
  let sumSquares = 0;

  for (let y = 0, gridY = 0; y < height; y += step, gridY += 1) {
    for (let x = 0, gridX = 0; x < width; x += step, gridX += 1) {
      const index = (y * width + x) * 4;
      const value = luminance(pixels[index], pixels[index + 1], pixels[index + 2]);
      values[gridY * gridWidth + gridX] = value;
      sum += value;
      sumSquares += value * value;
      count += 1;
    }
  }

  const average = sum / Math.max(1, count);
  const contrast = Math.sqrt(Math.max(0, sumSquares / Math.max(1, count) - average * average));
  const detail = strongestTextEdges(values, gridWidth, gridHeight);
  let score = 100;

  const metrics: ScanQualityMetric[] = [];
  if (framingSafe) {
    metrics.push({ id: 'framing', label: 'Blattränder', status: 'good', message: 'Alle vier Blattränder sicher erkannt' });
  } else {
    score -= 12;
    metrics.push({ id: 'framing', label: 'Blattränder', status: 'check', message: 'Blattränder bitte in der Vorschau prüfen' });
  }

  if (detail.strength < 14 || detail.coverage < 0.003) {
    score -= 32;
    metrics.push({ id: 'sharpness', label: 'Schärfe', status: 'poor', message: 'Zu wenig klare Textkanten erkannt' });
  } else if (detail.strength < 28 || detail.coverage < 0.012) {
    score -= 12;
    metrics.push({ id: 'sharpness', label: 'Schärfe', status: 'check', message: 'Kleine Schrift bitte kurz prüfen' });
  } else {
    metrics.push({ id: 'sharpness', label: 'Schärfe', status: 'good', message: 'Textkanten wirken klar' });
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

  if (sourceShortEdge < 620) {
    score -= 32;
    metrics.push({ id: 'resolution', label: 'Auflösung', status: 'poor', message: 'Zu wenig Bilddetails' });
  } else if (sourceShortEdge < 900) {
    score -= 12;
    metrics.push({ id: 'resolution', label: 'Auflösung', status: 'check', message: 'Für kleine Schrift knapp' });
  } else {
    metrics.push({ id: 'resolution', label: 'Auflösung', status: 'good', message: 'Ausreichend Details' });
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  const hasPoorMetric = metrics.some((metric) => metric.status === 'poor');
  const hasCheckMetric = metrics.some((metric) => metric.status === 'check');
  const level: ScanQualityLevel = score < 58 || hasPoorMetric
    ? 'retry'
    : score < 80 || hasCheckMetric ? 'check' : 'good';
  return {
    score,
    level,
    title: level === 'good' ? 'Dokument vollständig und gut lesbar' : level === 'check' ? 'Aufnahme bitte prüfen' : 'Neu fotografieren empfohlen',
    metrics,
  };
}

function loadSourceShortEdge(url: string, corners: DocumentCorners) {
  return new Promise<number>((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const toPixels = (point: { x: number; y: number }) => ({
        x: point.x * image.naturalWidth,
        y: point.y * image.naturalHeight,
      });
      const topLeft = toPixels(corners.topLeft);
      const topRight = toPixels(corners.topRight);
      const bottomRight = toPixels(corners.bottomRight);
      const bottomLeft = toPixels(corners.bottomLeft);
      const scanWidth = Math.max(
        pointDistance(topLeft, topRight),
        pointDistance(bottomLeft, bottomRight),
      );
      const scanHeight = Math.max(
        pointDistance(topLeft, bottomLeft),
        pointDistance(topRight, bottomRight),
      );
      resolve(Math.min(scanWidth, scanHeight));
    };
    image.onerror = () => reject(new Error('Die Originalauflösung des Dokumentfotos konnte nicht gelesen werden.'));
    image.src = url;
  });
}

export async function analyzeDocumentScanQuality(url: string, corners: DocumentCorners, framingSafe = true) {
  const [canvas, sourceShortEdge] = await Promise.all([
    renderDocumentScan(url, corners, 'original', 900),
    loadSourceShortEdge(url, corners),
  ]);
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Die lokale Qualitätsprüfung ist auf diesem Gerät nicht verfügbar.');
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  return measureScanQuality(imageData.data, canvas.width, canvas.height, sourceShortEdge, framingSafe);
}
