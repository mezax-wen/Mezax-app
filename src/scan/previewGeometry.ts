export type PreviewSize = {
  width: number;
  height: number;
};

export function fitPreviewToStage(
  sourceWidth: number,
  sourceHeight: number,
  availableWidth: number,
  availableHeight: number,
): PreviewSize {
  const values = [sourceWidth, sourceHeight, availableWidth, availableHeight];
  if (values.some((value) => !Number.isFinite(value) || value <= 0)) {
    return { width: 1, height: 1 };
  }

  const scale = Math.min(availableWidth / sourceWidth, availableHeight / sourceHeight);
  return {
    width: Math.max(1, Math.floor(sourceWidth * scale)),
    height: Math.max(1, Math.floor(sourceHeight * scale)),
  };
}
