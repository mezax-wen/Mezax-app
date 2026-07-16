export type CameraSize = {
  width: number;
  height: number;
};

export type CameraRect = CameraSize & {
  left: number;
  top: number;
};

export type CameraCrop = {
  x: number;
  y: number;
  width: number;
  height: number;
};

const clamp = (value: number, minimum: number, maximum: number) => (
  Math.min(maximum, Math.max(minimum, value))
);

export function calculateCameraCrop(
  source: CameraSize,
  display: CameraRect,
  guide: CameraRect,
  mirrored = false,
): CameraCrop {
  if (source.width <= 0 || source.height <= 0 || display.width <= 0 || display.height <= 0) {
    throw new Error('Kamera- und Anzeigegröße müssen positiv sein.');
  }

  const scale = Math.max(display.width / source.width, display.height / source.height);
  const visibleSourceWidth = display.width / scale;
  const visibleSourceHeight = display.height / scale;
  const visibleSourceX = (source.width - visibleSourceWidth) / 2;
  const visibleSourceY = (source.height - visibleSourceHeight) / 2;

  const guideLeft = clamp(guide.left - display.left, 0, display.width);
  const guideTop = clamp(guide.top - display.top, 0, display.height);
  const guideRight = clamp(guide.left + guide.width - display.left, guideLeft, display.width);
  const guideBottom = clamp(guide.top + guide.height - display.top, guideTop, display.height);
  const cropWidth = (guideRight - guideLeft) / scale;
  const cropHeight = (guideBottom - guideTop) / scale;
  const unmirroredX = visibleSourceX + guideLeft / scale;
  const x = mirrored
    ? source.width - (unmirroredX + cropWidth)
    : unmirroredX;

  return {
    x: clamp(x, 0, source.width - cropWidth),
    y: clamp(visibleSourceY + guideTop / scale, 0, source.height - cropHeight),
    width: cropWidth,
    height: cropHeight,
  };
}