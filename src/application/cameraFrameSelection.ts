export function measureFrameSharpness(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
): number {
  if (width < 3 || height < 3 || pixels.length < width * height * 4) return 0;

  const luminance = new Float32Array(width * height);
  for (let index = 0; index < width * height; index += 1) {
    const offset = index * 4;
    luminance[index] = (
      pixels[offset] * 0.2126
      + pixels[offset + 1] * 0.7152
      + pixels[offset + 2] * 0.0722
    );
  }

  const responses: number[] = [];
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = y * width + x;
      const laplacian = Math.abs(
        luminance[index] * 4
        - luminance[index - 1]
        - luminance[index + 1]
        - luminance[index - width]
        - luminance[index + width],
      );
      responses.push(laplacian);
    }
  }

  if (!responses.length) return 0;
  responses.sort((left, right) => right - left);
  const strongestCount = Math.max(1, Math.round(responses.length * 0.12));
  let total = 0;
  for (let index = 0; index < strongestCount; index += 1) total += responses[index];
  return total / strongestCount;
}

export function selectSharpestFrame(scores: number[]): number {
  if (!scores.length) return -1;
  let bestIndex = 0;
  for (let index = 1; index < scores.length; index += 1) {
    if (scores[index] > scores[bestIndex]) bestIndex = index;
  }
  return bestIndex;
}