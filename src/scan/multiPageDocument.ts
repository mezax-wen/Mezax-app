import type { jsPDF } from 'jspdf';
import type { RequiredDocument } from '../application/folderPlan.ts';

type RenderedPage = {
  dataUrl: string;
  width: number;
  height: number;
};

export function shouldBundleSelection(slot: RequiredDocument | undefined, files: ArrayLike<File>) {
  return Boolean(slot) && slot !== 'Gehaltsnachweise' && files.length > 1;
}

export function smartScanFileName(slot: RequiredDocument | undefined, fallback = 'Dokument') {
  const normalized = (slot || fallback)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 52);
  return `${normalized || 'Dokument'}-mehrseitig.pdf`;
}

async function renderImageFile(file: File): Promise<RenderedPage> {
  const { optimizeDocumentImage } = await import('./imageOptimizer.ts');
  const url = URL.createObjectURL(file);
  try {
    const optimized = await optimizeDocumentImage(url);
    return {
      dataUrl: optimized.dataUrl,
      width: optimized.width,
      height: optimized.height,
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function renderPdfFile(file: File): Promise<RenderedPage[]> {
  const { getDocument } = await import('pdfjs-dist');
  const loadingTask = getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  try {
    const pdf = await loadingTask.promise;
    const pages: RenderedPage[] = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1.65 });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Eine PDF-Seite konnte nicht lokal vorbereitet werden.');
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: context, viewport }).promise;
      pages.push({
        dataUrl: canvas.toDataURL('image/jpeg', 0.92),
        width: canvas.width,
        height: canvas.height,
      });
    }
    return pages;
  } finally {
    await loadingTask.destroy();
  }
}

async function renderFile(file: File) {
  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  if (isPdf) return renderPdfFile(file);
  if (file.type.startsWith('image/')) return [await renderImageFile(file)];
  throw new Error(`${file.name} ist kein unterstütztes Bild oder PDF.`);
}

function addPageImage(output: jsPDF, page: RenderedPage, isFirst: boolean) {
  const orientation = page.width > page.height ? 'landscape' : 'portrait';
  if (!isFirst) output.addPage('a4', orientation);
  const pageWidth = output.internal.pageSize.getWidth();
  const pageHeight = output.internal.pageSize.getHeight();
  const margin = 16;
  const scale = Math.min(
    (pageWidth - margin * 2) / page.width,
    (pageHeight - margin * 2) / page.height,
  );
  const width = page.width * scale;
  const height = page.height * scale;
  output.setFillColor(255, 255, 255);
  output.rect(0, 0, pageWidth, pageHeight, 'F');
  output.addImage(
    page.dataUrl,
    'JPEG',
    (pageWidth - width) / 2,
    (pageHeight - height) / 2,
    width,
    height,
    undefined,
    'FAST',
  );
}

export async function createMultiPageDocument(
  files: File[],
  slot?: RequiredDocument,
  fallbackName?: string,
) {
  const { jsPDF: JsPDF } = await import('jspdf');
  if (!files.length) throw new Error('Keine Seiten zum Zusammenführen ausgewählt.');
  const renderedPages: RenderedPage[] = [];
  for (const file of files) renderedPages.push(...await renderFile(file));
  if (!renderedPages.length) throw new Error('Das mehrseitige Dokument enthält keine lesbaren Seiten.');

  const firstOrientation = renderedPages[0].width > renderedPages[0].height ? 'landscape' : 'portrait';
  const output = new JsPDF({ unit: 'pt', format: 'a4', orientation: firstOrientation, compress: true });
  renderedPages.forEach((page, index) => addPageImage(output, page, index === 0));
  const blob = output.output('blob');
  return new File(
    [blob],
    smartScanFileName(slot, fallbackName || files[0].name.replace(/\.[^.]+$/, '')),
    { type: 'application/pdf', lastModified: Date.now() },
  );
}
