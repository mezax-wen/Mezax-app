export type DocumentBounds = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type SmartScanEnhancement = {
  cropped: boolean;
  originalWidth: number;
  originalHeight: number;
  width: number;
  height: number;
  contrastBoost: number;
};

export type OptimizedDocumentImage = SmartScanEnhancement & {
  dataUrl: string;
};

function luminance(red: number, green: number, blue: number) {
  return red * 0.299 + green * 0.587 + blue * 0.114;
}

export function findDocumentBounds(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
): DocumentBounds {
  if (!width || !height || pixels.length < width * height * 4) {
    return { left: 0, top: 0, width, height };
  }

  const step = Math.max(2, Math.round(Math.min(width, height) / 420));
  const cornerSize = Math.max(1, Math.round(Math.min(width, height) * 0.06));
  let cornerTotal = 0;
  let cornerSamples = 0;

  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const inCorner = (x < cornerSize || x >= width - cornerSize)
        && (y < cornerSize || y >= height - cornerSize);
      if (!inCorner) continue;
      const index = (y * width + x) * 4;
      cornerTotal += luminance(pixels[index], pixels[index + 1], pixels[index + 2]);
      cornerSamples += 1;
    }
  }

  const cornerLuminance = cornerSamples ? cornerTotal / cornerSamples : 110;
  const threshold = Math.min(225, Math.max(135, cornerLuminance + 28));
  const xs: number[] = [];
  const ys: number[] = [];

  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const index = (y * width + x) * 4;
      const red = pixels[index];
      const green = pixels[index + 1];
      const blue = pixels[index + 2];
      const chroma = Math.max(red, green, blue) - Math.min(red, green, blue);
      if (luminance(red, green, blue) >= threshold && chroma < 85) {
        xs.push(x);
        ys.push(y);
      }
    }
  }

  const minimumSamples = Math.max(40, Math.round((width * height) / (step * step) * 0.04));
  if (xs.length < minimumSamples) return { left: 0, top: 0, width, height };

  xs.sort((a, b) => a - b);
  ys.sort((a, b) => a - b);
  const low = Math.floor(xs.length * 0.008);
  const high = Math.min(xs.length - 1, Math.ceil(xs.length * 0.992));
  const padding = Math.round(Math.min(width, height) * 0.012);
  const left = Math.max(0, xs[low] - padding);
  const top = Math.max(0, ys[low] - padding);
  const right = Math.min(width, xs[high] + padding);
  const bottom = Math.min(height, ys[high] + padding);
  const detectedWidth = right - left;
  const detectedHeight = bottom - top;
  const detectedArea = detectedWidth * detectedHeight;

  if (
    detectedWidth < width * 0.5
    || detectedHeight < height * 0.5
    || detectedArea < width * height * 0.32
  ) {
    return { left: 0, top: 0, width, height };
  }

  return { left, top, width: detectedWidth, height: detectedHeight };
}

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Das Dokumentfoto konnte nicht geladen werden.'));
    image.src = url;
  });
}

export async function optimizeDocumentImage(url: string, options: { crop?: boolean } = {}): Promise<OptimizedDocumentImage> {
  const image = await loadImage(url);
  const originalWidth = image.naturalWidth;
  const originalHeight = image.naturalHeight;
  const analysisScale = Math.min(1, 1400 / Math.max(originalWidth, originalHeight));
  const analysisCanvas = document.createElement('canvas');
  analysisCanvas.width = Math.max(1, Math.round(originalWidth * analysisScale));
  analysisCanvas.height = Math.max(1, Math.round(originalHeight * analysisScale));
  const analysisContext = analysisCanvas.getContext('2d', { willReadFrequently: true });
  if (!analysisContext) throw new Error('Die lokale Bildoptimierung ist auf diesem Gerät nicht verfügbar.');
  analysisContext.drawImage(image, 0, 0, analysisCanvas.width, analysisCanvas.height);
  const imageData = analysisContext.getImageData(0, 0, analysisCanvas.width, analysisCanvas.height);
  const detected = options.crop === false
    ? { left: 0, top: 0, width: analysisCanvas.width, height: analysisCanvas.height }
    : findDocumentBounds(imageData.data, analysisCanvas.width, analysisCanvas.height);
  const scaleBack = 1 / analysisScale;
  const source = {
    left: Math.round(detected.left * scaleBack),
    top: Math.round(detected.top * scaleBack),
    width: Math.round(detected.width * scaleBack),
    height: Math.round(detected.height * scaleBack),
  };
  const cropped = source.left > originalWidth * 0.025
    || source.top > originalHeight * 0.025
    || source.width < originalWidth * 0.95
    || source.height < originalHeight * 0.95;
  const outputScale = Math.min(1, 1800 / Math.max(source.width, source.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(source.width * outputScale));
  canvas.height = Math.max(1, Math.round(source.height * outputScale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Die lokale Bildoptimierung ist auf diesem Gerät nicht verfügbar.');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.filter = 'contrast(1.14) brightness(1.035) saturate(0.9)';
  context.drawImage(
    image,
    source.left,
    source.top,
    source.width,
    source.height,
    0,
    0,
    canvas.width,
    canvas.height,
  );
  context.filter = 'none';

  return {
    dataUrl: canvas.toDataURL('image/jpeg', 0.93),
    cropped,
    originalWidth,
    originalHeight,
    width: canvas.width,
    height: canvas.height,
    contrastBoost: 14,
  };
}
