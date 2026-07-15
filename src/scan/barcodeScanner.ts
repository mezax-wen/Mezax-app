import { BrowserMultiFormatReader } from '@zxing/browser';
import { BarcodeFormat } from '@zxing/library';

export type LocalCodeDetection = {
  label: 'QR-Code / Barcode';
  value: string;
  format: string;
  bbox: { left: number; top: number; width: number; height: number };
};

export async function detectLocalCode(
  imageUrl: string,
  imageWidth: number,
  imageHeight: number,
): Promise<LocalCodeDetection[]> {
  const reader = new BrowserMultiFormatReader();
  try {
    const result = await reader.decodeFromImageUrl(imageUrl);
    const points = result.getResultPoints();
    const xs = points.map((point) => point.getX());
    const ys = points.map((point) => point.getY());
    const fallbackSize = Math.max(40, Math.min(imageWidth, imageHeight) * 0.18);
    const padding = Math.max(8, Math.min(imageWidth, imageHeight) * 0.012);
    const left = xs.length ? Math.max(0, Math.min(...xs) - padding) : 0;
    const top = ys.length ? Math.max(0, Math.min(...ys) - padding) : 0;
    const right = xs.length ? Math.min(imageWidth, Math.max(...xs) + padding) : fallbackSize;
    const bottom = ys.length ? Math.min(imageHeight, Math.max(...ys) + padding) : fallbackSize;
    const format = BarcodeFormat[result.getBarcodeFormat()] ?? 'Code';
    return [{
      label: 'QR-Code / Barcode',
      value: result.getText() || format,
      format,
      bbox: {
        left,
        top,
        width: Math.max(fallbackSize * 0.4, right - left),
        height: Math.max(fallbackSize * 0.4, bottom - top),
      },
    }];
  } catch {
    return [];
  }
}
