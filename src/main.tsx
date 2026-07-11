import React, { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createWorker } from 'tesseract.js';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { jsPDF } from 'jspdf';

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  ChevronRight,
  Download,
  FileText,
  Home,
  LoaderCircle,
  LockKeyhole,
  Plus,
  ScanSearch,
  ShieldCheck,
  Upload,
  UserRound,
  WandSparkles,
  X,
} from 'lucide-react';
import './styles.css';
import { classifyDocument, type DocumentClassification } from './ai/documentClassifier';
import { calculateRentalPrivacyScore, getRentalPrivacyRecommendation } from './ai/privacyRecommendations';

type Screen = 'welcome' | 'dashboard' | 'new' | 'documents' | 'check' | 'result' | 'export';
type ScanStatus = 'idle' | 'loading' | 'done' | 'error';

type Doc = {
  id: number;
  name: string;
  size: number;
  type: string;
  url: string;
};

type WordBox = {
  text: string;
  normalized: string;
  left: number;
  top: number;
  width: number;
  height: number;
  confidence: number;
  lineKey: string;
};

type Detection = {
  id: string;
  label: string;
  value: string;
  confidence: number;
  selected: boolean;
  bbox: { left: number; top: number; width: number; height: number };
};

type PdfPageMeta = {
  top: number;
  width: number;
  height: number;
};

type ScanResult = {
  status: ScanStatus;
  progress: number;
  message: string;
  width: number;
  height: number;
  detections: Detection[];
  text: string;
  classification?: DocumentClassification;
  renderedUrl?: string;
  pdfPages?: PdfPageMeta[];
  error?: string;
};

const required = [
  'Anschreiben',
  'Mieterselbstauskunft',
  'Gehaltsnachweise',
  'SCHUFA-Auskunft',
  'Ausweiskopie',
];

const emptyScan: ScanResult = {
  status: 'idle',
  progress: 0,
  message: '',
  width: 0,
  height: 0,
  detections: [],
  text: '',
};

function Logo({ small = false }: { small?: boolean }) {
  return (
    <div className={small ? 'logo small' : 'logo'} aria-label="Mezax">
      <svg viewBox="0 0 100 112" role="img">
        <path
          d="M16 18 L50 43 L84 18 V72 C84 88 69 99 50 106 C31 99 16 88 16 72 Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="10"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

function normalizeToken(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function parseTsv(tsv: string): WordBox[] {
  const rows = tsv.split(/\r?\n/).slice(1);
  const words: WordBox[] = [];

  for (const row of rows) {
    if (!row.trim()) continue;
    const columns = row.split('\t');
    if (columns.length < 12 || Number(columns[0]) !== 5) continue;

    const text = columns.slice(11).join('\t').trim();
    const normalized = normalizeToken(text);
    if (!normalized) continue;

    words.push({
      text,
      normalized,
      left: Number(columns[6]),
      top: Number(columns[7]),
      width: Number(columns[8]),
      height: Number(columns[9]),
      confidence: Number(columns[10]),
      lineKey: `${columns[1]}-${columns[2]}-${columns[3]}-${columns[4]}`,
    });
  }

  return words;
}

function unionBox(words: WordBox[]) {
  const left = Math.min(...words.map((word) => word.left));
  const top = Math.min(...words.map((word) => word.top));
  const right = Math.max(...words.map((word) => word.left + word.width));
  const bottom = Math.max(...words.map((word) => word.top + word.height));
  return { left, top, width: right - left, height: bottom - top };
}

function detectSensitiveData(words: WordBox[]): Detection[] {
  const lines = new Map<string, WordBox[]>();
  for (const word of words) {
    const line = lines.get(word.lineKey) ?? [];
    line.push(word);
    lines.set(word.lineKey, line);
  }

  const detections: Detection[] = [];
  const seen = new Set<string>();

  function addDetection(label: string, value: string, matchedWords: WordBox[]) {
    if (!matchedWords.length) return;
    const bbox = unionBox(matchedWords);
    const key = `${label}-${Math.round(bbox.left)}-${Math.round(bbox.top)}-${value}`;
    if (seen.has(key)) return;
    seen.add(key);

    detections.push({
      id: key,
      label,
      value,
      confidence: Math.round(
        matchedWords.reduce((sum, word) => sum + Math.max(0, word.confidence), 0) / matchedWords.length,
      ),
      selected: true,
      bbox,
    });
  }

  for (const lineWordsUnsorted of lines.values()) {
    const lineWords = [...lineWordsUnsorted].sort((a, b) => a.left - b.left);
    let compact = '';
    const ranges: Array<{ start: number; end: number; word: WordBox }> = [];

    for (const word of lineWords) {
      const start = compact.length;
      compact += word.normalized;
      ranges.push({ start, end: compact.length, word });
    }

    function wordsForRange(start: number, end: number) {
      return ranges
        .filter((range) => range.end > start && range.start < end)
        .map((range) => range.word);
    }

    const patterns = [
      { label: 'IBAN', regex: /[A-Z]{2}\d{2}[A-Z0-9]{11,30}/g },
      { label: 'Sozialversicherungsnummer', regex: /\d{8}[A-Z]\d{3}/g },
    ];

    for (const pattern of patterns) {
      for (const match of compact.matchAll(pattern.regex)) {
        const start = match.index ?? 0;
        addDetection(pattern.label, match[0], wordsForRange(start, start + match[0].length));
      }
    }

    const taxContext = /STEUER|IDENTIFIKATION|IDNR|TIN/.test(compact);
    for (const match of compact.matchAll(/\d{11}/g)) {
      const start = match.index ?? 0;
      const matchedWords = wordsForRange(start, start + match[0].length);
      if (taxContext || matchedWords.length >= 2) {
        addDetection('Steuer-ID', match[0], matchedWords);
      }
    }

    const idLabel = /(AUSWEISNUMMER|DOKUMENTENNUMMER|DOCUMENTNUMBER|DOCUMENTNO)/.exec(compact);
    if (idLabel) {
      const afterLabel = compact.slice((idLabel.index ?? 0) + idLabel[0].length);
      const idMatch = /[A-Z0-9]{8,10}/.exec(afterLabel);
      if (idMatch) {
        const start = (idLabel.index ?? 0) + idLabel[0].length + (idMatch.index ?? 0);
        addDetection('Ausweisnummer', idMatch[0], wordsForRange(start, start + idMatch[0].length));
      }
    }
  }

  return detections;
}

function maskedValue(value: string) {
  if (value.length <= 5) return '•••••';
  return `${value.slice(0, 2)}${'•'.repeat(Math.min(9, value.length - 4))}${value.slice(-2)}`;
}

async function imageSize(url: string) {
  const image = new Image();
  image.src = url;
  await image.decode();
  return { width: image.naturalWidth, height: image.naturalHeight };
}


async function renderPdfToComposite(url: string, onProgress?: (page: number, total: number) => void) {
  const loadingTask = getDocument(url);
  const pdf = await loadingTask.promise;
  const scale = 1.7;
  const renderedPages: Array<{ canvas: HTMLCanvasElement; width: number; height: number }> = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    onProgress?.(pageNumber, pdf.numPages);
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('PDF-Seite konnte nicht gerendert werden.');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: context, viewport }).promise;
    renderedPages.push({ canvas, width: canvas.width, height: canvas.height });
  }

  const width = Math.max(...renderedPages.map((page) => page.width));
  const height = renderedPages.reduce((sum, page) => sum + page.height, 0);
  const composite = document.createElement('canvas');
  composite.width = width;
  composite.height = height;
  const context = composite.getContext('2d', { alpha: false });
  if (!context) throw new Error('PDF-Vorschau konnte nicht erzeugt werden.');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, width, height);

  const pages: PdfPageMeta[] = [];
  let top = 0;
  for (const page of renderedPages) {
    context.drawImage(page.canvas, 0, top);
    pages.push({ top, width: page.width, height: page.height });
    top += page.height;
  }

  return {
    width,
    height,
    pages,
    dataUrl: composite.toDataURL('image/jpeg', 0.94),
  };
}

function App() {
  const [screen, setScreen] = useState<Screen>('welcome');
  const [title, setTitle] = useState('Wohnung in Berlin');
  const [address, setAddress] = useState('Musterstraße 12, 10115 Berlin');
  const [docs, setDocs] = useState<Doc[]>([]);
  const [preview, setPreview] = useState<Doc | null>(null);
  const [watermark, setWatermark] = useState('Nur für Wohnungsbewerbung – Musterstraße 12');
  const [fixed, setFixed] = useState(false);
  const [scans, setScans] = useState<Record<number, ScanResult>>({});
  const [redactionsApplied, setRedactionsApplied] = useState<Record<number, boolean>>({});

  const findings = useMemo(() => {
    const all = Object.values(scans).flatMap((scan) => scan.detections.filter((item) => item.selected));
    const counts = new Map<string, number>();
    for (const detection of all) counts.set(detection.label, (counts.get(detection.label) ?? 0) + 1);
    return [...counts.entries()];
  }, [scans]);

  function addFiles(fileList: FileList | null) {
    if (!fileList) return;
    setDocs((current) => [
      ...current,
      ...Array.from(fileList).map((file, index) => ({
        id: Date.now() + index,
        name: file.name,
        size: file.size,
        type: file.type || '',
        url: URL.createObjectURL(file),
      })),
    ]);
  }

  function removeDoc(id: number) {
    setDocs((current) => {
      const target = current.find((doc) => doc.id === id);
      if (target) URL.revokeObjectURL(target.url);
      return current.filter((doc) => doc.id !== id);
    });
    setScans((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
  }

  async function scanDocument(doc: Doc) {
    const isImage = doc.type.startsWith('image/');
    const isPdf = doc.type === 'application/pdf' || doc.name.toLowerCase().endsWith('.pdf');
    if (!isImage && !isPdf) return;
    if (scans[doc.id]?.status === 'loading' || scans[doc.id]?.status === 'done') return;

    setScans((current) => ({
      ...current,
      [doc.id]: { ...emptyScan, status: 'loading', message: isPdf ? 'PDF-Seiten werden vorbereitet …' : 'OCR wird vorbereitet …', progress: 0.03 },
    }));

    let worker: Awaited<ReturnType<typeof createWorker>> | null = null;

    try {
      let sourceUrl = doc.url;
      let dimensions = await imageSize(doc.url).catch(() => ({ width: 0, height: 0 }));
      let pdfPages: PdfPageMeta[] | undefined;

      if (isPdf) {
        const rendered = await renderPdfToComposite(doc.url, (page, total) => {
          setScans((current) => ({
            ...current,
            [doc.id]: {
              ...(current[doc.id] ?? emptyScan),
              status: 'loading',
              progress: Math.min(0.28, 0.04 + (page / total) * 0.24),
              message: `PDF-Seite ${page} von ${total} wird gerendert …`,
            },
          }));
        });
        sourceUrl = rendered.dataUrl;
        dimensions = { width: rendered.width, height: rendered.height };
        pdfPages = rendered.pages;
      }

      worker = await createWorker('deu', 1, {
        logger: (event) => {
          const raw = typeof event.progress === 'number' ? event.progress : 0;
          const progress = isPdf ? 0.3 + raw * 0.68 : raw;
          const labels: Record<string, string> = {
            'loading tesseract core': 'Prüfmodul wird geladen …',
            'initializing tesseract': 'Prüfmodul wird gestartet …',
            'loading language traineddata': 'Deutsche Texterkennung wird geladen …',
            'initializing api': 'Texterkennung wird vorbereitet …',
            'recognizing text': 'Sensible Angaben werden gesucht …',
          };
          setScans((current) => ({
            ...current,
            [doc.id]: {
              ...(current[doc.id] ?? emptyScan),
              status: 'loading',
              progress,
              message: labels[event.status] ?? 'Dokument wird geprüft …',
              width: dimensions.width,
              height: dimensions.height,
              renderedUrl: sourceUrl,
              pdfPages,
            },
          }));
        },
      });

      const result = await worker.recognize(sourceUrl, {}, { tsv: true });
      const data = result.data as typeof result.data & { tsv?: string };
      const words = parseTsv(data.tsv ?? '');
      const detections = detectSensitiveData(words);
      const classification = classifyDocument(data.text ?? '');

      setScans((current) => ({
        ...current,
        [doc.id]: {
          status: 'done',
          progress: 1,
          message: detections.length
            ? `${detections.length} mögliche sensible Stelle(n) gefunden`
            : 'Keine eindeutigen Muster gefunden',
          width: dimensions.width,
          height: dimensions.height,
          detections,
          text: data.text ?? '',
          classification,
          renderedUrl: sourceUrl,
          pdfPages,
        },
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
      setScans((current) => ({
        ...current,
        [doc.id]: {
          ...emptyScan,
          status: 'error',
          message: 'Prüfung fehlgeschlagen',
          error: message,
        },
      }));
    } finally {
      if (worker) await worker.terminate();
    }
  }

  function openPreview(doc: Doc) {
    setPreview(doc);
    const supported = doc.type.startsWith('image/') || doc.type === 'application/pdf' || doc.name.toLowerCase().endsWith('.pdf');
    if (supported && !scans[doc.id]) {
      window.setTimeout(() => scanDocument(doc), 250);
    }
  }

  function toggleDetection(docId: number, detectionId: string) {
    setScans((current) => ({
      ...current,
      [docId]: {
        ...current[docId],
        detections: current[docId].detections.map((detection) =>
          detection.id === detectionId ? { ...detection, selected: !detection.selected } : detection,
        ),
      },
    }));
    setRedactionsApplied((current) => ({ ...current, [docId]: false }));
  }

  async function downloadRedacted(doc: Doc, scan: ScanResult) {
    const image = new Image();
    image.src = doc.url;
    await image.decode();

    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d');
    if (!context) return;

    context.drawImage(image, 0, 0);
    context.fillStyle = '#000000';
    for (const detection of scan.detections.filter((item) => item.selected)) {
      const padding = Math.max(3, Math.round(detection.bbox.height * 0.12));
      context.fillRect(
        Math.max(0, detection.bbox.left - padding),
        Math.max(0, detection.bbox.top - padding),
        Math.min(canvas.width, detection.bbox.width + padding * 2),
        Math.min(canvas.height, detection.bbox.height + padding * 2),
      );
    }

    const link = document.createElement('a');
    const baseName = doc.name.replace(/\.[^.]+$/, '');
    link.download = `${baseName}-geschuetzt.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  }

  async function downloadRedactedPdf(doc: Doc, scan: ScanResult) {
    if (!scan.renderedUrl || !scan.pdfPages?.length) return;
    const image = new Image();
    image.src = scan.renderedUrl;
    await image.decode();

    const output = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4', compress: true });
    scan.pdfPages.forEach((page, pageIndex) => {
      if (pageIndex > 0) output.addPage('a4', 'portrait');

      const canvas = document.createElement('canvas');
      canvas.width = page.width;
      canvas.height = page.height;
      const context = canvas.getContext('2d');
      if (!context) return;

      context.drawImage(image, 0, page.top, page.width, page.height, 0, 0, page.width, page.height);
      context.fillStyle = '#000000';

      for (const detection of scan.detections.filter((item) => item.selected)) {
        const centerY = detection.bbox.top + detection.bbox.height / 2;
        if (centerY < page.top || centerY >= page.top + page.height) continue;
        const padding = Math.max(3, Math.round(detection.bbox.height * 0.12));
        context.fillRect(
          Math.max(0, detection.bbox.left - padding),
          Math.max(0, detection.bbox.top - page.top - padding),
          Math.min(page.width, detection.bbox.width + padding * 2),
          Math.min(page.height, detection.bbox.height + padding * 2),
        );
      }

      const pageWidth = output.internal.pageSize.getWidth();
      const pageHeight = output.internal.pageSize.getHeight();
      const ratio = Math.min(pageWidth / page.width, pageHeight / page.height);
      const drawWidth = page.width * ratio;
      const drawHeight = page.height * ratio;
      const x = (pageWidth - drawWidth) / 2;
      const y = (pageHeight - drawHeight) / 2;
      output.addImage(canvas.toDataURL('image/jpeg', 0.94), 'JPEG', x, y, drawWidth, drawHeight, undefined, 'FAST');
    });

    const baseName = doc.name.replace(/\.[^.]+$/, '');
    output.save(`${baseName}-geschuetzt.pdf`);
  }

  const Header = ({ name, back }: { name: string; back?: Screen }) => (
    <header>
      {back ? (
        <button className="icon" onClick={() => setScreen(back)} aria-label="Zurück">
          <ArrowLeft />
        </button>
      ) : (
        <Logo small />
      )}
      <b>{name}</b>
      <i />
    </header>
  );

  const Preview = () => {
    if (!preview) return null;
    const isImage = preview.type.startsWith('image/');
    const isPdf = preview.type === 'application/pdf' || preview.name.toLowerCase().endsWith('.pdf');
    const scan = scans[preview.id] ?? emptyScan;
    const applied = redactionsApplied[preview.id] ?? false;
    const selectedCount = scan.detections.filter((item) => item.selected).length;
    const privacyScore = calculateRentalPrivacyScore(scan.detections);

    return (
      <div className="previewOverlay">
        <div className="previewTop">
          <button className="icon" onClick={() => setPreview(null)} aria-label="Vorschau schließen">
            <X />
          </button>
          <div>
            <b>{preview.name}</b>
            <small>{(preview.size / 1048576).toFixed(2)} MB · lokal geöffnet</small>
          </div>
        </div>

        <div className="previewBody">
          {(isImage || (isPdf && scan.renderedUrl)) ? (
            <div className="imageStage">
              <img src={scan.renderedUrl ?? preview.url} alt={preview.name} />
              {scan.status === 'done' && scan.width > 0 &&
                scan.detections.map((detection) => (
                  <button
                    key={detection.id}
                    className={`redactionBox ${detection.selected ? 'selected' : ''} ${applied ? 'applied' : ''}`}
                    style={{
                      left: `${(detection.bbox.left / scan.width) * 100}%`,
                      top: `${(detection.bbox.top / scan.height) * 100}%`,
                      width: `${(detection.bbox.width / scan.width) * 100}%`,
                      height: `${(detection.bbox.height / scan.height) * 100}%`,
                    }}
                    onClick={() => toggleDetection(preview.id, detection.id)}
                    aria-label={`${detection.label} ${detection.selected ? 'abwählen' : 'auswählen'}`}
                  />
                ))}
            </div>
          ) : isPdf ? (
            <div className="pdfRendering"><LoaderCircle className="spin" /><span>PDF wird vorbereitet …</span></div>
          ) : (
            <div className="noPreview">
              <FileText />
              <h3>Keine Vorschau verfügbar</h3>
            </div>
          )}
        </div>

        <div className="previewPanel">
          {(isImage || isPdf) && scan.status === 'loading' && (
            <div className="scanProgress">
              <div className="scanTitle"><LoaderCircle className="spin" /><b>Automatische Prüfung läuft</b></div>
              <p>{scan.message}</p>
              <div className="progressTrack"><span style={{ width: `${Math.max(4, scan.progress * 100)}%` }} /></div>
              <small>Beim ersten Scan werden Komponenten geladen. Das kann auf dem Handy etwas dauern.</small>
            </div>
          )}

          {(isImage || isPdf) && scan.status === 'error' && (
            <div className="scanError">
              <AlertTriangle />
              <div><b>Prüfung fehlgeschlagen</b><small>{scan.error}</small></div>
              <button className="secondary compact" onClick={() => {
                setScans((current) => ({ ...current, [preview.id]: emptyScan }));
                scanDocument(preview);
              }}>Erneut versuchen</button>
            </div>
          )}

          {(isImage || isPdf) && scan.status === 'done' && (
            <>
              <div className="scanSummary">
                <ShieldCheck />
                <div>
                  <b>{scan.detections.length ? `${scan.detections.length} Vorschlag/Vorschläge` : 'Keine eindeutigen Treffer'}</b>
                  <small>{scan.detections.length ? 'Tippe auf einen Treffer, um ihn an- oder abzuwählen.' : 'Das Dokument muss trotzdem visuell geprüft werden.'}</small>
                </div>
              </div>

              {scan.classification && (
                <div className="info documentClassification">
                  <FileText />
                  <p>
                    <b>{scan.classification.type} · {scan.classification.confidence}% sicher erkannt</b>
                    <small>{scan.classification.explanation}</small>
                  </p>
                </div>
              )}

              {scan.detections.length > 0 && (
                <div className="info">
                  <ShieldCheck />
                  <p>
                    <b>Datenschutz-Score: {privacyScore}/100</b>
                    <small>Der Wert aktualisiert sich, wenn du Empfehlungen an- oder abwählst.</small>
                  </p>
                </div>
              )}

              {scan.detections.length > 0 && (
                <div className="detectionList">
                  {scan.detections.map((detection) => (
                    <button key={detection.id} onClick={() => toggleDetection(preview.id, detection.id)}>
                      <span className={detection.selected ? 'tick selected' : 'tick'}>{detection.selected && <Check />}</span>
                      <span><b>{detection.label} · {getRentalPrivacyRecommendation(detection.label, scan.classification?.type).title}</b><small>{getRentalPrivacyRecommendation(detection.label, scan.classification?.type).reason}</small><small>{maskedValue(detection.value)} · OCR {detection.confidence}%</small></span>
                    </button>
                  ))}
                </div>
              )}

              {selectedCount > 0 && !applied && (
                <button className="primary" onClick={() => setRedactionsApplied((current) => ({ ...current, [preview.id]: true }))}>
                  <WandSparkles /> {selectedCount} Schwärzung(en) anwenden
                </button>
              )}

              {selectedCount > 0 && applied && (
                <button className="primary" onClick={() => isPdf ? downloadRedactedPdf(preview, scan) : downloadRedacted(preview, scan)}>
                  <Download /> Geschützte {isPdf ? 'PDF' : 'Kopie'} speichern
                </button>
              )}
            </>
          )}

          {(isImage || isPdf) && scan.status === 'idle' && (
            <button className="primary" onClick={() => scanDocument(preview)}>
              <ScanSearch /> Automatisch prüfen
            </button>
          )}

          <small className="localNote">Die Datei bleibt lokal im Browser. Empfehlungen ersetzen keine rechtliche Beratung und müssen vor dem Export geprüft werden. Beta-Erkennung ohne Garantie.</small>
        </div>
      </div>
    );
  };

  if (screen === 'welcome') {
    return (
      <main className="app welcome">
        <section>
          <Logo />
          <h1>Mezax</h1>
          <p className="tag">Teile Dokumente.<br /><span>Nicht deine Daten.</span></p>
        </section>
        <div className="trust">
          <div><ShieldCheck /><p><b>Datenschutz zuerst</b><small>Sensible Daten werden geprüft.</small></p></div>
          <div><ScanSearch /><p><b>Lokale OCR-Beta</b><small>Bilder und PDFs werden direkt im Browser analysiert.</small></p></div>
          <div><LockKeyhole /><p><b>Du entscheidest</b><small>Jeder Vorschlag kann bestätigt oder abgewählt werden.</small></p></div>
        </div>
        <button className="primary" onClick={() => setScreen('dashboard')}>Los geht’s</button>
        <small className="note">Prototyp v0.5 · Für Tests nur Beispieldokumente verwenden</small>
      </main>
    );
  }

  if (screen === 'dashboard') {
    return (
      <main className="app">
        <Header name="Übersicht" />
        <section className="content">
          <div className="greet">
            <div><p>Willkommen</p><h2>Deine Bewerbungen</h2></div>
            <div className="avatar"><UserRound /></div>
          </div>
          <button className="primary big" onClick={() => setScreen('new')}><Plus /> Neue Bewerbungsmappe</button>
          <h3>Meine Mappen</h3>
          <article className="card">
            <div className="fileicon"><Home /></div>
            <div><b>{title}</b><small>{address}</small></div>
            <span>Entwurf</span>
          </article>
          <div className="info"><ShieldCheck /><p><b>Mezax Check</b><small>Prüfe Bilder jetzt automatisch auf ausgewählte sensible Nummern.</small></p></div>
        </section>
        <nav>
          <button className="active"><Home /><small>Übersicht</small></button>
          <button><FileText /><small>Mappen</small></button>
          <button><ShieldCheck /><small>Check</small></button>
          <button><UserRound /><small>Profil</small></button>
        </nav>
      </main>
    );
  }

  if (screen === 'new') {
    return (
      <main className="app">
        <Header name="Neue Mappe" back="dashboard" />
        <section className="content">
          <div className="steps"><b>1</b><i /><span>2</span><i /><span>3</span></div>
          <h2>Für welche Wohnung?</h2>
          <p className="muted">Diese Angaben erscheinen später auf Deckblatt und Wasserzeichen.</p>
          <label>Bezeichnung<input value={title} onChange={(event) => setTitle(event.target.value)} /></label>
          <label>Adresse<input value={address} onChange={(event) => setAddress(event.target.value)} /></label>
          <label>Vermieter / Ansprechpartner<input placeholder="Optional" /></label>
        </section>
        <footer><button className="primary" onClick={() => setScreen('documents')}>Weiter <ChevronRight /></button></footer>
      </main>
    );
  }

  if (screen === 'documents') {
    return (
      <main className="app">
        <Header name="Unterlagen" back="new" />
        <section className="content">
          <div className="steps"><span>1</span><i /><b>2</b><i /><span>3</span></div>
          <h2>Dokumente hinzufügen</h2>
          <p className="muted">Öffne ein Bild oder PDF: Die automatische Prüfung startet direkt.</p>
          <label className="drop">
            <Upload /><b>Dateien auswählen</b><span>PDF, JPG oder PNG</span>
            <input hidden multiple type="file" accept=".pdf,image/*" onChange={(event) => addFiles(event.target.files)} />
          </label>
          <h3>Empfohlene Unterlagen</h3>
          <div className="list">{required.map((item) => <div key={item}><FileText /><span>{item}</span><Plus /></div>)}</div>

          {docs.length > 0 && (
            <>
              <h3>Ausgewählte Dateien</h3>
              <div className="list">
                {docs.map((doc) => {
                  const scan = scans[doc.id];
                  return (
                    <div key={doc.id}>
                      <FileText />
                      <span>
                        <b>{doc.name}</b>
                        <small>{(doc.size / 1048576).toFixed(2)} MB{scan?.status === 'done' ? ` · ${scan.classification?.type ?? 'Sonstiges'} (${scan.classification?.confidence ?? 0}%) · ${scan.detections.length} Treffer` : ''}</small>
                      </span>
                      <button className="openBtn" onClick={() => openPreview(doc)}>Öffnen</button>
                      <button className="icon" onClick={() => removeDoc(doc.id)} aria-label="Datei entfernen"><X /></button>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </section>
        <footer><button className="primary" disabled={!docs.length} onClick={() => setScreen('check')}>Zur Prüfung <ChevronRight /></button></footer>
        <Preview />
      </main>
    );
  }

  if (screen === 'check') {
    const completed = Object.values(scans).filter((scan) => scan.status === 'done').length;
    return (
      <main className="app">
        <Header name="Mezax Check" back="documents" />
        <section className="content center">
          <div className="ring"><Logo /></div>
          <h2>Deine Unterlagen</h2>
          <p className="muted">{completed} von {docs.length} Dokument(en) wurden automatisch geprüft.</p>
          <div className="analysis">
            <div><Check /> Dokumente hinzugefügt</div>
            <div><Check /> Bildvorschau verfügbar</div>
            <div className={completed ? '' : 'pending'}>{completed ? <Check /> : <i />} Automatische Bildprüfung</div>
            <div className="pending"><i /> PDF-Prüfung folgt</div>
          </div>
          <button className="primary" onClick={() => setScreen('result')}>Ergebnis anzeigen</button>
        </section>
      </main>
    );
  }

  if (screen === 'result') {
    return (
      <main className="app">
        <Header name="Datenschutz-Check" back="check" />
        <section className="content">
          <div className="score">
            <strong>{fixed ? 'A+' : findings.length ? 'B' : '–'}</strong>
            <p><b>{fixed ? 'Vorschläge bestätigt' : findings.length ? 'Verbesserungen empfohlen' : 'Noch keine Treffer'}</b><small>{fixed ? 'Ausgewählte Vorschläge wurden übernommen.' : 'Öffne Bilder, um sie automatisch prüfen zu lassen.'}</small></p>
          </div>
          <h3>Gefundene Daten</h3>
          <div className="list findings">
            {findings.length ? findings.map(([label, count]) => (
              <div key={label}><ShieldCheck /><span><b>{label}</b><small>{count} Fundstelle(n)</small></span><em>Prüfen</em></div>
            )) : <div><AlertTriangle /><span><b>Keine Ergebnisse</b><small>Es wurde noch nichts erkannt oder geprüft.</small></span></div>}
          </div>
          <label>Wasserzeichen<input value={watermark} onChange={(event) => setWatermark(event.target.value)} /></label>
          <div className="warning"><LockKeyhole /><p><b>Beta-Hinweis:</b> Automatische Treffer müssen immer kontrolliert werden. Die aktuelle Exportfunktion erzeugt geschützte PNG-Kopien einzelner Bilder.</p></div>
        </section>
        <footer><button className="primary" onClick={() => { setFixed(true); setScreen('export'); }}>Vorschläge übernehmen</button></footer>
      </main>
    );
  }

  return (
    <main className="app">
      <Header name="Export" back="result" />
      <section className="content center">
        <div className="success"><Check /></div>
        <h2>Prüfung abgeschlossen</h2>
        <p className="muted">Geschützte Bildkopien speicherst du direkt in der jeweiligen Vorschau.</p>
        <div className="export">
          <div><Check /> Lokale Bildanalyse</div>
          <div><Check /> Automatische Vorschläge</div>
          <div><Check /> Irreversibel gerenderte PNG-Kopie</div>
          <div><AlertTriangle /> PDF-Mappe folgt als nächster Baustein</div>
        </div>
        <button className="secondary" onClick={() => setScreen('documents')}>Zurück zu Dokumenten</button>
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
