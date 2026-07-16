import { findDocumentBounds } from './imageOptimizer.ts';

export type ScanFilter = 'original' | 'color' | 'grayscale' | 'blackwhite';
export type ScanPoint = { x: number; y: number };
export type DocumentCorners = {
  topLeft: ScanPoint;
  topRight: ScanPoint;
  bottomRight: ScanPoint;
  bottomLeft: ScanPoint;
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

export function findDocumentCorners(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
): DocumentCorners {
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
  const threshold = dark + Math.max(18, (light - dark) * 0.3);
  const isPaper = (x: number, y: number) => {
    const index = (Math.round(y) * width + Math.round(x)) * 4;
    return luminance(pixels[index], pixels[index + 1], pixels[index + 2]) >= threshold;
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
    x: clamp(point.x / width),
    y: clamp(point.y / height),
  });
  const detected: DocumentCorners = {
    topLeft: toNormalized(intersectVerticalHorizontal(leftLine, topLine)),
    topRight: toNormalized(intersectVerticalHorizontal(rightLine, topLine)),
    bottomRight: toNormalized(intersectVerticalHorizontal(rightLine, bottomLine)),
    bottomLeft: toNormalized(intersectVerticalHorizontal(leftLine, bottomLine)),
  };
  const valid = polygonArea(detected) >= 0.24
    && detected.topLeft.x < detected.topRight.x
    && detected.bottomLeft.x < detected.bottomRight.x
    && detected.topLeft.y < detected.bottomLeft.y
    && detected.topRight.y < detected.bottomRight.y;
  return valid ? detected : fallback;
}

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Das Dokumentfoto konnte nicht geladen werden.'));
    image.src = url;
  });
}

export async function analyzeDocumentCorners(url: string) {
  const image = await loadImage(url);
  const scale = Math.min(1, 1200 / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Die lokale Kantenerkennung ist auf diesem Gerät nicht verfügbar.');
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const data = context.getImageData(0, 0, canvas.width, canvas.height);
  return {
    corners: findDocumentCorners(data.data, canvas.width, canvas.height),
    width: image.naturalWidth,
    height: image.naturalHeight,
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

export async function renderDocumentScan(url: string, corners: DocumentCorners, filter: ScanFilter) {
  const image = await loadImage(url);
  const source = {
    topLeft: { x: corners.topLeft.x * image.naturalWidth, y: corners.topLeft.y * image.naturalHeight },
    topRight: { x: corners.topRight.x * image.naturalWidth, y: corners.topRight.y * image.naturalHeight },
    bottomRight: { x: corners.bottomRight.x * image.naturalWidth, y: corners.bottomRight.y * image.naturalHeight },
    bottomLeft: { x: corners.bottomLeft.x * image.naturalWidth, y: corners.bottomLeft.y * image.naturalHeight },
  };
  const rawWidth = Math.max(distance(source.topLeft, source.topRight), distance(source.bottomLeft, source.bottomRight));
  const rawHeight = Math.max(distance(source.topLeft, source.bottomLeft), distance(source.topRight, source.bottomRight));
  const scale = Math.min(1, 2200 / Math.max(rawWidth, rawHeight));
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
  const context = canvas.getContext('2d', { alpha: false, willReadFrequently: filter === 'blackwhite' });
  if (!context) throw new Error('Die lokale Scanverarbeitung ist auf diesem Gerät nicht verfügbar.');
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
    canvas.toBlob((result) => result ? resolve(result) : reject(new Error('Der Scan konnte nicht gespeichert werden.')), 'image/jpeg', 0.94);
  });
  const baseName = originalName.replace(/\.[^.]+$/, '').slice(0, 60) || 'mezax-dokument';
  return new File([blob], `${baseName}-scan.jpg`, { type: 'image/jpeg', lastModified: Date.now() });
}
