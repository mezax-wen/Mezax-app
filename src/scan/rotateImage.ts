function loadImage(sourceUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Die Scan-Seite konnte nicht geladen werden.'));
    image.src = sourceUrl;
  });
}

export async function rotateImageFileClockwise(file: File): Promise<File> {
  const sourceUrl = URL.createObjectURL(file);

  try {
    const image = await loadImage(sourceUrl);
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalHeight;
    canvas.height = image.naturalWidth;
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('Die Scan-Seite konnte nicht gedreht werden.');

    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.translate(canvas.width, 0);
    context.rotate(Math.PI / 2);
    context.drawImage(image, 0, 0, image.naturalWidth, image.naturalHeight);

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((result) => {
        if (result) resolve(result);
        else reject(new Error('Die gedrehte Scan-Seite konnte nicht gespeichert werden.'));
      }, 'image/jpeg', 0.98);
    });
    const baseName = file.name.replace(/\.[^.]+$/, '');
    return new File([blob], baseName + '-gedreht.jpg', {
      type: 'image/jpeg',
      lastModified: Date.now(),
    });
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}
