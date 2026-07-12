export type DocumentPoint = { x: number; y: number };
export type DocumentBox = { left: number; top: number; width: number; height: number };

export type DisplayRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export function toDocumentPoint(
  clientX: number,
  clientY: number,
  rect: DisplayRect,
  documentWidth: number,
  documentHeight: number,
): DocumentPoint {
  const relativeX = Math.max(0, Math.min(rect.width, clientX - rect.left));
  const relativeY = Math.max(0, Math.min(rect.height, clientY - rect.top));
  return {
    x: (relativeX / rect.width) * documentWidth,
    y: (relativeY / rect.height) * documentHeight,
  };
}

export function createManualBox(
  start: DocumentPoint,
  end: DocumentPoint,
  minimumSize = 8,
): DocumentBox | null {
  const left = Math.min(start.x, end.x);
  const top = Math.min(start.y, end.y);
  const width = Math.abs(end.x - start.x);
  const height = Math.abs(end.y - start.y);
  if (width < minimumSize || height < minimumSize) return null;
  return { left, top, width, height };
}
