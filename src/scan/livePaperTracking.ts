import { isValidDocumentCorners, type DocumentCorners, type ScanPoint } from './documentPerspective.ts';

const distance = (first: ScanPoint, second: ScanPoint) => Math.hypot(first.x - second.x, first.y - second.y);

function polygonArea(corners: DocumentCorners) {
  const points = [corners.topLeft, corners.topRight, corners.bottomRight, corners.bottomLeft];
  return Math.abs(points.reduce((sum, point, index) => {
    const next = points[(index + 1) % points.length];
    return sum + point.x * next.y - next.x * point.y;
  }, 0) / 2);
}

export function isPlausibleLivePaper(corners: DocumentCorners) {
  if (!isValidDocumentCorners(corners)) return false;
  const topWidth = distance(corners.topLeft, corners.topRight);
  const bottomWidth = distance(corners.bottomLeft, corners.bottomRight);
  const leftHeight = distance(corners.topLeft, corners.bottomLeft);
  const rightHeight = distance(corners.topRight, corners.bottomRight);
  const width = Math.max(topWidth, bottomWidth);
  const height = Math.max(leftHeight, rightHeight);
  const widthConsistency = Math.min(topWidth, bottomWidth) / width;
  const heightConsistency = Math.min(leftHeight, rightHeight) / height;

  return polygonArea(corners) >= 0.16
    && width >= 0.38
    && height >= 0.38
    && widthConsistency >= 0.48
    && heightConsistency >= 0.48;
}

export function smoothLivePaperCorners(
  previous: DocumentCorners | null,
  current: DocumentCorners,
  currentWeight = 0.58,
): DocumentCorners {
  if (!previous) return current;
  const keys: Array<keyof DocumentCorners> = ['topLeft', 'topRight', 'bottomRight', 'bottomLeft'];
  const averageJump = keys.reduce((sum, key) => sum + distance(previous[key], current[key]), 0) / keys.length;
  if (averageJump > 0.18) return current;
  const previousWeight = 1 - currentWeight;
  return Object.fromEntries(keys.map((key) => [key, {
    x: previous[key].x * previousWeight + current[key].x * currentWeight,
    y: previous[key].y * previousWeight + current[key].y * currentWeight,
  }])) as DocumentCorners;
}

export function livePaperPolygonPoints(corners: DocumentCorners) {
  return [corners.topLeft, corners.topRight, corners.bottomRight, corners.bottomLeft]
    .map((point) => `${(point.x * 100).toFixed(2)},${(point.y * 100).toFixed(2)}`)
    .join(' ');
}