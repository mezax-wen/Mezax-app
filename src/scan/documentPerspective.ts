import { findDocumentBounds } from './imageOptimizer.ts';

export type ScanFilter = 'original' | 'color' | 'grayscale' | 'blackwhite';
export type ScanPoint = { x: number; y: number };
export type DocumentCorners = {
  topLeft: ScanPoint;
  topRight: ScanPoint;
  bottomRight: ScanPoint;
  bottomLeft: ScanPoint;
};
export type DocumentCornerAnalysis = {
  corners: DocumentCorners;
  width: number;
  height: number;
  automatic: boolean;
  message: string;
};
export type DocumentCornerDetectionMeta = {
  source: 'line-detection' | 'bounds-fallback';
};
type PixelPoint = ScanPoint;

const clamp = (value: number, minimum = 0, maximum = 1) => Math.min(maximum, Math.max(minimum, value));
const distance = (first: PixelPoint, second: PixelPoint) => Math.hypot(first.x - second.x, first.y - second.y);
const luminance = (red: number, green: number, blue: number) => red * 0.299 + green * 0.587 + blue * 0.114;

function normalizedBoundsCorners(
  bounds: { left: number; top: number; width: number; height: number },
  width: number,
  height: number,
): DocumentCorners {
  const left = clamp(bounds.left / width);
  const top = clamp(bounds.top / height);
  const right = clamp((bounds.left + bounds.width) / width);
  const bottom = clamp((bounds.top + bounds.height) / height);
  return {
    topLeft: { x: left, y: top },
    topRight: { x: right, y: top },
    bottomRight: { x: right, y: bottom },
    bottomLeft: { x: left, y: bottom },
  };
}

function fitLine(points: PixelPoint[], independent: 'x' | 'y') {
  if (points.length < 2) return null;
  const dependent = independent === 'x' ? 'y' : 'x';
  const meanIndependent = points.reduce((sum, point) => sum + point[independent], 0) / points.length;
  const meanDependent = points.reduce((sum, point) => sum + point[dependent], 0) / points.length;
  let numerator = 0;
  let denominator = 0;
  points.forEach((point) => {
    const delta = point[independent] - meanIndependent;
    numerator += delta * (point[dependent] - meanDependent);
    denominator += delta * delta;
  });
  const slope = denominator ? numerator / denominator : 0;
  return { slope, intercept: meanDependent - slope * meanIndependent };
}

function intersectVerticalHorizontal(
  vertical: { slope: number; intercept: number },
  horizontal: { slope: number; intercept: number },
): PixelPoint {
  const denominator = 1 - vertical.slope * horizontal.slope;
  if (Math.abs(denominator) < 0.00001) return { x: vertical.intercept, y: horizontal.intercept };
  const x = (vertical.slope * horizontal.intercept + vertical.intercept) / denominator;
  return { x, y: horizontal.slope * x + horizontal.intercept };
}

function polygonArea(corners: DocumentCorners) {
  const points = [corners.topLeft, corners.topRight, corners.bottomRight, corners.bottomLeft];
  return Math.abs(points.reduce((sum, point, index) => {
    const next = points[(index + 1) % points.length];
    return sum + point.x * next.y - next.x * point.y;
  }, 0) / 2);
}

const SAFE_FULL_FRAME_CORNERS: DocumentCorners = {
  topLeft: { x: 0.005, y: 0.005 },
  topRight: { x: 0.995, y: 0.005 },
  bottomRight: { x: 0.995, y: 0.995 },
  bottomLeft: { x: 0.005, y: 0.995 },
};

function crossProduct(first: ScanPoint, second: ScanPoint, third: ScanPoint) {
  return (second.x - first.x) * (third.y - second.y)
    - (second.y - first.y) * (third.x - second.x);
}

export function isValidDocumentCorners(corners: DocumentCorners) {
  const points = [corners.topLeft, corners.topRight, corners.bottomRight, corners.bottomLeft];
  if (points.some((point) => (
    !Number.isFinite(point.x)
    || !Number.isFinite(point.y)
    || point.x < 0
    || point.x > 1
    || point.y < 0
    || point.y > 1
  ))) return false;

  const turns = points.map((point, index) => crossProduct(
    point,
    points[(index + 1) % points.length],
    points[(index + 2) % points.length],
  ));
  const convex = turns.every((turn) => turn > 0.0005) || turns.every((turn) => turn < -0.0005);
  if (!convex) return false;
  const edges = points.map((point, index) => distance(point, points[(index + 1) % points.length]));
  return polygonArea(corners) >= 0.02 && edges.every((edge) => edge >= 0.06);
}

export function isSafeAutomaticCrop(corners: DocumentCorners) {
  if (!isValidDocumentCorners(corners)) return false;
  const topWidth = distance(corners.topLeft, corners.topRight);
  const bottomWidth = distance(corners.bottomLeft, corners.bottomRight);
  const leftHeight = distance(corners.topLeft, corners.bottomLeft);
  const rightHeight = distance(corners.topRight, corners.bottomRight);
  const reachesGuideEdges = Math.max(corners.topLeft.x, corners.bottomLeft.x) <= 0.06
    && Math.min(corners.topRight.x, corners.bottomRight.x) >= 0.94
    && Math.max(corners.topLeft.y, corners.topRight.y) <= 0.06
    && Math.min(corners.bottomLeft.y, corners.bottomRight.y) >= 0.94;
  return reachesGuideEdges
    && polygonArea(corners) >= 0.84
    && Math.min(topWidth, bottomWidth) >= 0.88
    && Math.min(leftHeight, rightHeight) >= 0.88;
}

export function isSafeDetectedPaperCrop(corners: DocumentCorners) {
  if (!isValidDocumentCorners(corners)) return false;
  const area = polygonArea(corners);
  const topWidth = distance(corners.topLeft, corners.topRight);
  const bottomWidth = distance(corners.bottomLeft, corners.bottomRight);
  const leftHeight = distance(corners.topLeft, corners.bottomLeft);
  const rightHeight = distance(corners.topRight, corners.bottomRight);
  const oppositeEdgesConsistent = Math.min(topWidth, bottomWidth) / Math.max(topWidth, bottomWidth) >= 0.62
    && Math.min(leftHeight, rightHeight) / Math.max(leftHeight, rightHeight) >= 0.62;
  const topAtFrameEdge = Math.max(corners.topLeft.y, corners.topRight.y) <= 0.04;
  const bottomAtFrameEdge = Math.min(corners.bottomLeft.y, corners.bottomRight.y) >= 0.96;
  const leftAtFrameEdge = Math.max(corners.topLeft.x, corners.bottomLeft.x) <= 0.04;
  const rightAtFrameEdge = Math.min(corners.topRight.x, corners.bottomRight.x) >= 0.96;
  const boundaryPairsConsistent = topAtFrameEdge === bottomAtFrameEdge
    && leftAtFrameEdge === rightAtFrameEdge;

  return area >= 0.16
    && area <= 0.93
    && Math.min(topWidth, bottomWidth) >= 0.34
    && Math.min(leftHeight, rightHeight) >= 0.38
    && oppositeEdgesConsistent
    && boundaryPairsConsistent;
}

function detectedBoundaryContrast(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  corners: DocumentCorners,
) {
  const points = [corners.topLeft, corners.topRight, corners.bottomRight, corners.bottomLeft];
  const center = points.reduce((sum, point) => ({
    x: sum.x + point.x / 4,
    y: sum.y + point.y / 4,
  }), { x: 0, y: 0 });
  const offset = Math.max(2, Math.min(width, height) * 0.012);
  const sample = (point: ScanPoint) => {
    const x = Math.round(clamp(point.x) * (width - 1));
    const y = Math.round(clamp(point.y) * (height - 1));
    const index = (y * width + x) * 4;
    return luminance(pixels[index], pixels[index + 1], pixels[index + 2]);
  };
  let contrast = 0;
  let samples = 0;
  points.forEach((start, index) => {
    const end = points[(index + 1) % points.length];
    for (let step = 1; step <= 7; step += 1) {
      const position = step / 8;
      const edge = {
        x: start.x + (end.x - start.x) * position,
        y: start.y + (end.y - start.y) * position,
      };
      const towardCenterX = center.x - edge.x;
      const towardCenterY = center.y - edge.y;
      const length = Math.max(0.0001, Math.hypot(towardCenterX * width, towardCenterY * height));
      const shift = { x: towardCenterX / length * offset, y: towardCenterY / length * offset };
      contrast += sample({ x: edge.x + shift.x, y: edge.y + shift.y })
        - sample({ x: edge.x - shift.x, y: edge.y - shift.y });
      samples += 1;
    }
  });
  return samples ? contrast / samples : 0;
}

function oppositeEdgeConsistency(corners: DocumentCorners) {
  const topWidth = distance(corners.topLeft, corners.topRight);
  const bottomWidth = distance(corners.bottomLeft, corners.bottomRight);
  const leftHeight = distance(corners.topLeft, corners.bottomLeft);
  const rightHeight = distance(corners.topRight, corners.bottomRight);
  return Math.min(topWidth, bottomWidth) / Math.max(topWidth, bottomWidth)
    + Math.min(leftHeight, rightHeight) / Math.max(leftHeight, rightHeight);
}

function stabilizeDetectedQuadrilateral(
  corners: DocumentCorners,
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
) {
  const originalConsistency = oppositeEdgeConsistency(corners);
  if (originalConsistency >= 1.48) return corners;

  const point = (x: number, y: number): ScanPoint => ({ x: clamp(x), y: clamp(y) });
  const { topLeft, topRight, bottomRight, bottomLeft } = corners;
  const candidates: DocumentCorners[] = [
    {
      ...corners,
      topLeft: point(
        topRight.x + bottomLeft.x - bottomRight.x,
        topRight.y + bottomLeft.y - bottomRight.y,
      ),
    },
    {
      ...corners,
      topRight: point(
        topLeft.x + bottomRight.x - bottomLeft.x,
        topLeft.y + bottomRight.y - bottomLeft.y,
      ),
    },
    {
      ...corners,
      bottomRight: point(
        topRight.x + bottomLeft.x - topLeft.x,
        topRight.y + bottomLeft.y - topLeft.y,
      ),
    },
    {
      ...corners,
      bottomLeft: point(
        topLeft.x + bottomRight.x - topRight.x,
        topLeft.y + bottomRight.y - topRight.y,
      ),
    },
  ].filter(isValidDocumentCorners);

  const score = (candidate: DocumentCorners) => {
    const keys: Array<keyof DocumentCorners> = ['topLeft', 'topRight', 'bottomRight', 'bottomLeft'];
    const displacement = keys.reduce(
      (sum, key) => sum + distance(corners[key], candidate[key]),
      0,
    );
    return oppositeEdgeConsistency(candidate) * 20
      + detectedBoundaryContrast(pixels, width, height, candidate)
      - displacement * 8;
  };
  const originalScore = score(corners);
  const best = candidates.reduce(
    (current, candidate) => (score(candidate) > score(current) ? candidate : current),
    corners,
  );
  return score(best) >= originalScore + 2 ? best : corners;
}
function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((first, second) => first - second);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function robustFitLine(points: PixelPoint[], independent: 'x' | 'y') {
  let selected = points;
  for (let pass = 0; pass < 2; pass += 1) {
    const line = fitLine(selected, independent);
    if (!line || selected.length < 8) return line;
    const dependent = independent === 'x' ? 'y' : 'x';
    const residuals = selected
      .map((point) => Math.abs(point[dependent] - (line.slope * point[independent] + line.intercept)))
      .sort((first, second) => first - second);
    const cutoff = Math.max(2, residuals[Math.floor(residuals.length * 0.72)] ?? 2);
    selected = selected.filter((point) => (
      Math.abs(point[dependent] - (line.slope * point[independent] + line.intercept)) <= cutoff
    ));
  }
  return fitLine(selected, independent);
}

function findCenterSeededPaperCorners(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
): DocumentCorners | null {
  const sampleStep = Math.max(1, Math.round(Math.min(width, height) / 150));
  const samples: Array<{
    red: number;
    green: number;
    blue: number;
    light: number;
    chroma: number;
  }> = [];
  for (let y = Math.round(height * 0.22); y <= height * 0.82; y += sampleStep) {
    for (let x = Math.round(width * 0.22); x <= width * 0.78; x += sampleStep) {
      const index = (y * width + x) * 4;
      const red = pixels[index];
      const green = pixels[index + 1];
      const blue = pixels[index + 2];
      samples.push({
        red,
        green,
        blue,
        light: luminance(red, green, blue),
        chroma: Math.max(red, green, blue) - Math.min(red, green, blue),
      });
    }
  }
  if (samples.length < 20) return null;
  samples.sort((first, second) => first.light - second.light);
  const brighterSamples = samples.slice(Math.floor(samples.length * 0.58));
  const targetRed = median(brighterSamples.map((sample) => sample.red));
  const targetGreen = median(brighterSamples.map((sample) => sample.green));
  const targetBlue = median(brighterSamples.map((sample) => sample.blue));
  const targetLight = median(brighterSamples.map((sample) => sample.light));
  const targetChroma = median(brighterSamples.map((sample) => sample.chroma));
  const totalPixels = width * height;
  const mask = new Uint8Array(totalPixels);

  for (let index = 0; index < totalPixels; index += 1) {
    const pixel = index * 4;
    const red = pixels[pixel];
    const green = pixels[pixel + 1];
    const blue = pixels[pixel + 2];
    const light = luminance(red, green, blue);
    const chroma = Math.max(red, green, blue) - Math.min(red, green, blue);
    const colorDistance = Math.abs(red - targetRed)
      + Math.abs(green - targetGreen)
      + Math.abs(blue - targetBlue);
    if (light >= targetLight - 45
      && chroma <= Math.max(65, targetChroma + 28)
      && colorDistance <= 150) {
      mask[index] = 1;
    }
  }

  let seed = -1;
  const centerX = Math.floor(width / 2);
  const centerY = Math.floor(height / 2);
  for (let radius = 0; radius <= Math.max(width, height) / 3 && seed < 0; radius += 1) {
    const candidates = [
      [centerX + radius, centerY],
      [centerX - radius, centerY],
      [centerX, centerY + radius],
      [centerX, centerY - radius],
    ];
    for (const [x, y] of candidates) {
      if (x < 0 || x >= width || y < 0 || y >= height) continue;
      const candidate = y * width + x;
      if (mask[candidate]) {
        seed = candidate;
        break;
      }
    }
  }
  if (seed < 0) return null;

  const visited = new Uint8Array(totalPixels);
  const queue = new Int32Array(totalPixels);
  const component: number[] = [];
  let head = 0;
  let tail = 0;
  let minX = width;
  let maxX = -1;
  let minY = height;
  let maxY = -1;
  queue[tail++] = seed;
  visited[seed] = 1;

  while (head < tail) {
    const current = queue[head++];
    const x = current % width;
    const y = Math.floor(current / width);
    component.push(current);
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
    for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
      for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
        if (!offsetX && !offsetY) continue;
        const nextX = x + offsetX;
        const nextY = y + offsetY;
        if (nextX < 0 || nextX >= width || nextY < 0 || nextY >= height) continue;
        const next = nextY * width + nextX;
        if (!mask[next] || visited[next]) continue;
        visited[next] = 1;
        queue[tail++] = next;
      }
    }
  }

  const componentWidth = maxX - minX + 1;
  const componentHeight = maxY - minY + 1;
  const boxArea = componentWidth * componentHeight;
  const touchedFrameEdges = Number(minX <= 1)
    + Number(maxX >= width - 2)
    + Number(minY <= 1)
    + Number(maxY >= height - 2);
  if (component.length < totalPixels * 0.06
    || componentWidth < width * 0.32
    || componentHeight < height * 0.35
    || boxArea < totalPixels * 0.10
    || boxArea > totalPixels * 0.93
    || component.length / boxArea < 0.34
    || touchedFrameEdges >= 2) {
    return null;
  }

  const rowMin = new Int32Array(height).fill(width);
  const rowMax = new Int32Array(height).fill(-1);
  const columnMin = new Int32Array(width).fill(height);
  const columnMax = new Int32Array(width).fill(-1);
  component.forEach((current) => {
    const x = current % width;
    const y = Math.floor(current / width);
    rowMin[y] = Math.min(rowMin[y], x);
    rowMax[y] = Math.max(rowMax[y], x);
    columnMin[x] = Math.min(columnMin[x], y);
    columnMax[x] = Math.max(columnMax[x], y);
  });

  const leftPoints: PixelPoint[] = [];
  const rightPoints: PixelPoint[] = [];
  const topPoints: PixelPoint[] = [];
  const bottomPoints: PixelPoint[] = [];
  for (let y = minY; y <= maxY; y += 1) {
    if (rowMax[y] - rowMin[y] < componentWidth * 0.42) continue;
    leftPoints.push({ x: rowMin[y], y });
    rightPoints.push({ x: rowMax[y], y });
  }
  for (let x = minX; x <= maxX; x += 1) {
    if (columnMax[x] - columnMin[x] < componentHeight * 0.42) continue;
    topPoints.push({ x, y: columnMin[x] });
    bottomPoints.push({ x, y: columnMax[x] });
  }

  const leftLine = robustFitLine(leftPoints, 'y');
  const rightLine = robustFitLine(rightPoints, 'y');
  const topLine = robustFitLine(topPoints, 'x');
  const bottomLine = robustFitLine(bottomPoints, 'x');
  if (!leftLine || !rightLine || !topLine || !bottomLine) return null;
  const normalize = (point: PixelPoint): ScanPoint => ({
    x: clamp(point.x / width),
    y: clamp(point.y / height),
  });
  const corners: DocumentCorners = {
    topLeft: normalize(intersectVerticalHorizontal(leftLine, topLine)),
    topRight: normalize(intersectVerticalHorizontal(rightLine, topLine)),
    bottomRight: normalize(intersectVerticalHorizontal(rightLine, bottomLine)),
    bottomLeft: normalize(intersectVerticalHorizontal(leftLine, bottomLine)),
  };
  return isSafeDetectedPaperCrop(corners) ? corners : null;
}
export function findDocumentCorners(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  metadata?: DocumentCornerDetectionMeta,
): DocumentCorners {
  if (metadata) metadata.source = 'bounds-fallback';
  const bounds = findDocumentBounds(pixels, width, height);
  if (!width || !height || pixels.length < width * height * 4) {
    return normalizedBoundsCorners(bounds, Math.max(1, width), Math.max(1, height));
  }

  const fallback = normalizedBoundsCorners(bounds, width, height);
  const step = Math.max(2, Math.round(Math.min(width, height) / 360));
  const samples: number[] = [];
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const index = (y * width + x) * 4;
      samples.push(luminance(pixels[index], pixels[index + 1], pixels[index + 2]));
    }
  }
  samples.sort((a, b) => a - b);
  const dark = samples[Math.floor(samples.length * 0.12)] ?? 30;
  const light = samples[Math.floor(samples.length * 0.88)] ?? 220;
  const centerSeededPaper = findCenterSeededPaperCorners(pixels, width, height);
  if (centerSeededPaper) {
    if (metadata) metadata.source = 'line-detection';
    return centerSeededPaper;
  }
  const threshold = dark + Math.max(24, (light - dark) * 0.58);
  const isPaper = (x: number, y: number) => {
    const index = (Math.round(y) * width + Math.round(x)) * 4;
    const red = pixels[index];
    const green = pixels[index + 1];
    const blue = pixels[index + 2];
    const chroma = Math.max(red, green, blue) - Math.min(red, green, blue);
    return luminance(red, green, blue) >= threshold && chroma <= 68;
  };

  const leftPoints: PixelPoint[] = [];
  const rightPoints: PixelPoint[] = [];
  const topPoints: PixelPoint[] = [];
  const bottomPoints: PixelPoint[] = [];
  const boundRight = Math.min(width - 1, bounds.left + bounds.width);
  const boundBottom = Math.min(height - 1, bounds.top + bounds.height);

  for (let y = bounds.top; y <= boundBottom; y += step) {
    let left = -1;
    let right = -1;
    for (let x = bounds.left; x <= boundRight; x += step) {
      if (!isPaper(x, y)) continue;
      if (left < 0) left = x;
      right = x;
    }
    if (left >= 0 && right - left >= bounds.width * 0.42) {
      leftPoints.push({ x: left, y });
      rightPoints.push({ x: right, y });
    }
  }

  for (let x = bounds.left; x <= boundRight; x += step) {
    let top = -1;
    let bottom = -1;
    for (let y = bounds.top; y <= boundBottom; y += step) {
      if (!isPaper(x, y)) continue;
      if (top < 0) top = y;
      bottom = y;
    }
    if (top >= 0 && bottom - top >= bounds.height * 0.42) {
      topPoints.push({ x, y: top });
      bottomPoints.push({ x, y: bottom });
    }
  }

  const leftLine = fitLine(leftPoints, 'y');
  const rightLine = fitLine(rightPoints, 'y');
  const topLine = fitLine(topPoints, 'x');
  const bottomLine = fitLine(bottomPoints, 'x');
  if (!leftLine || !rightLine || !topLine || !bottomLine) return fallback;

  const toNormalized = (point: PixelPoint): ScanPoint => ({
    x: point.x / width,
    y: point.y / height,
  });
  const rawDetected: DocumentCorners = {
    topLeft: toNormalized(intersectVerticalHorizontal(leftLine, topLine)),
    topRight: toNormalized(intersectVerticalHorizontal(rightLine, topLine)),
    bottomRight: toNormalized(intersectVerticalHorizontal(rightLine, bottomLine)),
    bottomLeft: toNormalized(intersectVerticalHorizontal(leftLine, bottomLine)),
  };
  const rawPoints = [rawDetected.topLeft, rawDetected.topRight, rawDetected.bottomRight, rawDetected.bottomLeft];
  const withinOverscan = rawPoints.every((point) => (
    point.x >= -0.03 && point.x <= 1.03 && point.y >= -0.03 && point.y <= 1.03
  ));
  const clampPoint = (point: ScanPoint): ScanPoint => ({ x: clamp(point.x), y: clamp(point.y) });
  const detected: DocumentCorners = {
    topLeft: clampPoint(rawDetected.topLeft),
    topRight: clampPoint(rawDetected.topRight),
    bottomRight: clampPoint(rawDetected.bottomRight),
    bottomLeft: clampPoint(rawDetected.bottomLeft),
  };
  const stabilized = stabilizeDetectedQuadrilateral(detected, pixels, width, height);
  const valid = withinOverscan && polygonArea(stabilized) >= 0.24 && isValidDocumentCorners(stabilized);
  if (valid && metadata) metadata.source = 'line-detection';
  return valid ? stabilized : fallback;
}

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Das Dokumentfoto konnte nicht geladen werden.'));
    image.src = url;
  });
}

export async function analyzeDocumentCorners(url: string): Promise<DocumentCornerAnalysis> {
  const image = await loadImage(url);
  const scale = Math.min(1, 1200 / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Die lokale Kantenerkennung ist auf diesem Gerät nicht verfügbar.');
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const data = context.getImageData(0, 0, canvas.width, canvas.height);
  const metadata: DocumentCornerDetectionMeta = { source: 'bounds-fallback' };
  const candidate = findDocumentCorners(data.data, canvas.width, canvas.height, metadata);
  const detected = metadata.source === 'line-detection' && isValidDocumentCorners(candidate);
  const automatic = detected && isSafeDetectedPaperCrop(candidate);
  return {
    corners: detected ? candidate : SAFE_FULL_FRAME_CORNERS,
    width: image.naturalWidth,
    height: image.naturalHeight,
    automatic,
    message: automatic
      ? 'Papierkanten sicher erkannt. Tisch und Hintergrund werden entfernt.'
      : detected
        ? 'Papierkanten erkannt. Bitte prüfe kurz, ob die vier Punkte auf den Blattecken liegen.'
        : 'Papierkanten nicht sicher erkannt. Bitte richte die vier Punkte in der Vorschau auf das Blatt aus.',
  };
}

function affineTransform(source: PixelPoint[], destination: PixelPoint[]) {
  const [first, second, third] = source;
  const denominator = first.x * (second.y - third.y)
    + second.x * (third.y - first.y)
    + third.x * (first.y - second.y);
  if (Math.abs(denominator) < 0.00001) throw new Error('Die markierten Dokumentecken sind ungültig.');
  const solve = (values: number[]) => ({
    x: (values[0] * (second.y - third.y) + values[1] * (third.y - first.y) + values[2] * (first.y - second.y)) / denominator,
    y: (values[0] * (third.x - second.x) + values[1] * (first.x - third.x) + values[2] * (second.x - first.x)) / denominator,
    offset: (
      values[0] * (second.x * third.y - third.x * second.y)
      + values[1] * (third.x * first.y - first.x * third.y)
      + values[2] * (first.x * second.y - second.x * first.y)
    ) / denominator,
  });
  const horizontal = solve(destination.map((point) => point.x));
  const vertical = solve(destination.map((point) => point.y));
  return { a: horizontal.x, b: vertical.x, c: horizontal.y, d: vertical.y, e: horizontal.offset, f: vertical.offset };
}

function drawTriangle(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  source: PixelPoint[],
  destination: PixelPoint[],
  filter: string,
) {
  const matrix = affineTransform(source, destination);
  context.save();
  context.beginPath();
  context.moveTo(destination[0].x, destination[0].y);
  context.lineTo(destination[1].x, destination[1].y);
  context.lineTo(destination[2].x, destination[2].y);
  context.closePath();
  context.clip();
  context.setTransform(matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f);
  context.filter = filter;
  context.drawImage(image, 0, 0);
  context.restore();
}

export function previewFilter(filter: ScanFilter) {
  if (filter === 'color') return 'contrast(1.14) brightness(1.035) saturate(0.92)';
  if (filter === 'grayscale') return 'grayscale(1) contrast(1.16) brightness(1.03)';
  if (filter === 'blackwhite') return 'grayscale(1) contrast(1.6) brightness(1.08)';
  return 'none';
}

function sharpenDocumentText(context: CanvasRenderingContext2D, width: number, height: number) {
  const imageData = context.getImageData(0, 0, width, height);
  const source = new Uint8ClampedArray(imageData.data);
  const output = imageData.data;
  const amount = 0.18;
  const rowStride = width * 4;

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = y * rowStride + x * 4;
      for (let channel = 0; channel < 3; channel += 1) {
        const center = source[index + channel];
        const neighbours = source[index - 4 + channel]
          + source[index + 4 + channel]
          + source[index - rowStride + channel]
          + source[index + rowStride + channel];
        output[index + channel] = Math.max(0, Math.min(255, center * (1 + 4 * amount) - neighbours * amount));
      }
    }
  }
  context.putImageData(imageData, 0, 0);
}

export async function renderDocumentScan(
  url: string,
  corners: DocumentCorners,
  filter: ScanFilter,
  maxDimension = 3400,
) {
  if (!isValidDocumentCorners(corners)) {
    throw new Error('Die markierten Dokumentecken sind ungültig. Bitte ordne die vier Punkte neu an.');
  }
  const image = await loadImage(url);
  const source = {
    topLeft: { x: corners.topLeft.x * image.naturalWidth, y: corners.topLeft.y * image.naturalHeight },
    topRight: { x: corners.topRight.x * image.naturalWidth, y: corners.topRight.y * image.naturalHeight },
    bottomRight: { x: corners.bottomRight.x * image.naturalWidth, y: corners.bottomRight.y * image.naturalHeight },
    bottomLeft: { x: corners.bottomLeft.x * image.naturalWidth, y: corners.bottomLeft.y * image.naturalHeight },
  };
  const rawWidth = Math.max(distance(source.topLeft, source.topRight), distance(source.bottomLeft, source.bottomRight));
  const rawHeight = Math.max(distance(source.topLeft, source.bottomLeft), distance(source.topRight, source.bottomRight));
  const scale = Math.min(1, maxDimension / Math.max(rawWidth, rawHeight));
  const width = Math.max(1, Math.round(rawWidth * scale));
  const height = Math.max(1, Math.round(rawHeight * scale));
  const destination = {
    topLeft: { x: 0, y: 0 },
    topRight: { x: width, y: 0 },
    bottomRight: { x: width, y: height },
    bottomLeft: { x: 0, y: height },
  };
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { alpha: false, willReadFrequently: filter !== 'original' });
  if (!context) throw new Error('Die lokale Scanverarbeitung ist auf diesem Gerät nicht verfügbar.');
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, width, height);
  const filterValue = previewFilter(filter);
  drawTriangle(context, image, [source.topLeft, source.topRight, source.bottomRight], [destination.topLeft, destination.topRight, destination.bottomRight], filterValue);
  drawTriangle(context, image, [source.topLeft, source.bottomRight, source.bottomLeft], [destination.topLeft, destination.bottomRight, destination.bottomLeft], filterValue);

  if (filter === 'blackwhite') {
    const imageData = context.getImageData(0, 0, width, height);
    for (let index = 0; index < imageData.data.length; index += 4) {
      const value = luminance(imageData.data[index], imageData.data[index + 1], imageData.data[index + 2]) >= 176 ? 255 : 0;
      imageData.data[index] = value;
      imageData.data[index + 1] = value;
      imageData.data[index + 2] = value;
    }
    context.putImageData(imageData, 0, 0);
  } else if (filter === 'color' || filter === 'grayscale') {
    sharpenDocumentText(context, width, height);
  }
  return canvas;
}

export async function createScannedDocumentFile(
  url: string,
  corners: DocumentCorners,
  filter: ScanFilter,
  originalName: string,
) {
  const canvas = await renderDocumentScan(url, corners, filter);
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((result) => result ? resolve(result) : reject(new Error('Der Scan konnte nicht gespeichert werden.')), 'image/jpeg', 0.99);
  });
  const baseName = originalName.replace(/\.[^.]+$/, '').slice(0, 60) || 'mezax-dokument';
  return new File([blob], `${baseName}-scan.jpg`, { type: 'image/jpeg', lastModified: Date.now() });
}
