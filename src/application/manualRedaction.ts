export type DocumentPoint = { x: number; y: number };
export type DocumentBox = { left: number; top: number; width: number; height: number };
export type DocumentSize = { width: number; height: number };

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

export function scaleDocumentBox(
  box: DocumentBox,
  source: DocumentSize,
  target: DocumentSize,
): DocumentBox {
  if (source.width <= 0 || source.height <= 0 || target.width <= 0 || target.height <= 0) {
    return { ...box };
  }

  const scaleX = target.width / source.width;
  const scaleY = target.height / source.height;
  const left = Math.max(0, Math.min(target.width, box.left * scaleX));
  const top = Math.max(0, Math.min(target.height, box.top * scaleY));
  const right = Math.max(left, Math.min(target.width, (box.left + box.width) * scaleX));
  const bottom = Math.max(top, Math.min(target.height, (box.top + box.height) * scaleY));

  return {
    left,
    top,
    width: right - left,
    height: bottom - top,
  };
}
