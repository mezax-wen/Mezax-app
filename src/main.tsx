import React, { useEffect, useMemo, useState } from 'react';
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
import LandingPage from './landing/LandingPage';
import { classifyDocument, type DocumentClassification } from './ai/documentClassifier';
import { findIdentityDocumentNumber, findLabeledIdentityDocumentNumber, findValidIbans, isMachineReadableZoneLine, shouldDetectGermanTaxId, shouldDetectSocialSecurityNumber } from './ai/sensitiveValidators';
import { calculateRentalPrivacyScore, getRentalPrivacyRecommendation } from './ai/privacyRecommendations';
import { folderCompleteness, rentalWatermark, requiredDocumentOrder, safeFolderFileName, sortFolderDocuments, type RequiredDocument } from './application/folderPlan';
import { batchScanProgress, pendingDocumentIds } from './application/scanBatch';
import { createManualBox, toDocumentPoint, type DocumentPoint } from './application/manualRedaction';
import { reviewDocumentAssignment, slotForClassification } from './application/documentAssignment';
import { createPdfPagePlan } from './application/pdfPagePlan';
import { allDocumentsReadyForExport } from './application/exportReadiness';
import {
  listApplicationDrafts,
  loadApplicationDraft,
  removeApplicationDraft,
  saveApplicationDraft,
  type ApplicationDraft,
  type DraftSummary,
} from './application/draftStorage';

type Screen = 'welcome' | 'dashboard' | 'folders' | 'new' | 'documents' | 'check' | 'result' | 'export';
type ScanStatus = 'idle' | 'loading' | 'done' | 'error';

type Doc = {
  id: number;
  name: string;
  size: number;
  type: string;
  url: string;
  file: File;
  slot?: RequiredDocument;
};

type PreparedPdf = {
  url: string;
  name: string;
  file: File;
  downloadUrl?: string;
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

const required = requiredDocumentOrder;

const emptyScan: ScanResult = {
  status: 'idle',
  progress: 0,
  message: '',
  width: 0,
  height: 0,
  detections: [],
  text: '',
};

function createDraftId() {
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : 'draft-' + Date.now() + '-' + Math.random().toString(16).slice(2);
}

function formatDraftDate(timestamp: number) {
  return new Intl.DateTimeFormat('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(timestamp);
}

function Logo({ small = false }: { small?: boolean }) {
  return (
    <div className={small ? 'logo small' : 'logo'} aria-label="Mezax">
      <img src="/mezax-logo.png" alt="" />
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
    const rawLine = lineWords.map((word) => word.text).join(' ');
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

    for (const match of findValidIbans(compact)) {
      addDetection('IBAN', match.value, wordsForRange(match.index, match.index + match.value.length));
    }

    for (const match of compact.matchAll(/\d{8}[A-Z]\d{3}/g)) {
      if (!shouldDetectSocialSecurityNumber(compact, match[0])) continue;
      const start = match.index ?? 0;
      addDetection('Sozialversicherungsnummer', match[0], wordsForRange(start, start + match[0].length));
    }

    for (const match of compact.matchAll(/\d{11}/g)) {
      if (!shouldDetectGermanTaxId(compact, match[0])) continue;
      const start = match.index ?? 0;
      addDetection('Steuer-ID', match[0], wordsForRange(start, start + match[0].length));
    }

    const identityNumber = findIdentityDocumentNumber(compact);
    if (identityNumber) {
      addDetection(
        'Ausweisnummer',
        identityNumber.value,
        wordsForRange(identityNumber.index, identityNumber.index + identityNumber.value.length),
      );
    }

    if (isMachineReadableZoneLine(rawLine)) {
      addDetection('Maschinenlesbare Zone (MRZ)', 'MRZ-Zeile', lineWords);
    }
  }

  if (!detections.some((detection) => detection.label === 'Ausweisnummer')) {
    const positionedNumber = findLabeledIdentityDocumentNumber(words);
    if (positionedNumber) {
      addDetection('Ausweisnummer', positionedNumber.normalized, [positionedNumber]);
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

async function loadBrowserImage(url: string) {
  const image = new Image();
  image.src = url;
  await image.decode();
  return image;
}

async function renderImageAsPng(url: string, width = 520, height = 640) {
  const response = await fetch(url);
  if (!response.ok) throw new Error('Mezax-Logo konnte nicht geladen werden.');
  const objectUrl = URL.createObjectURL(await response.blob());

  try {
    const image = await loadBrowserImage(objectUrl);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Mezax-Logo konnte nicht vorbereitet werden.');
    context.drawImage(image, 0, 0, width, height);
    return canvas.toDataURL('image/png');
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function addCoverPhoto(
  output: jsPDF,
  image: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const canvas = document.createElement('canvas');
  canvas.width = 480;
  canvas.height = 600;
  const context = canvas.getContext('2d');
  if (!context) return;

  const targetRatio = canvas.width / canvas.height;
  const sourceRatio = image.naturalWidth / image.naturalHeight;
  let sourceWidth = image.naturalWidth;
  let sourceHeight = image.naturalHeight;
  let sourceX = 0;
  let sourceY = 0;

  if (sourceRatio > targetRatio) {
    sourceWidth = image.naturalHeight * targetRatio;
    sourceX = (image.naturalWidth - sourceWidth) / 2;
  } else {
    sourceHeight = image.naturalWidth / targetRatio;
    sourceY = (image.naturalHeight - sourceHeight) / 2;
  }

  context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, canvas.width, canvas.height);
  output.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', x, y, width, height, undefined, 'FAST');
  output.setDrawColor(18, 174, 181);
  output.setLineWidth(1.5);
  output.rect(x, y, width, height);
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
  const [showSplash, setShowSplash] = useState(true);
  const [screen, setScreen] = useState<Screen>('welcome');
  const [title, setTitle] = useState('');
  const [address, setAddress] = useState('');
  const [docs, setDocs] = useState<Doc[]>([]);
  const [preview, setPreview] = useState<Doc | null>(null);
  const [watermark, setWatermark] = useState(() => rentalWatermark(address));
  const [watermarkCustomized, setWatermarkCustomized] = useState(false);
  const [includeCover, setIncludeCover] = useState(true);
  const [showApplicantPhoto, setShowApplicantPhoto] = useState(true);
  const [showRentalAddress, setShowRentalAddress] = useState(true);
  const [showMezaxNotice, setShowMezaxNotice] = useState(true);
  const [applicantName, setApplicantName] = useState('');
  const [applicantEmail, setApplicantEmail] = useState('');
  const [applicantPhone, setApplicantPhone] = useState('');
  const [applicantCurrentAddress, setApplicantCurrentAddress] = useState('');
  const [applicantPhoto, setApplicantPhoto] = useState<{ name: string; url: string; file: File } | null>(null);
  const [preparedFolder, setPreparedFolder] = useState<PreparedPdf | null>(null);
  const [fixed, setFixed] = useState(false);
  const [scans, setScans] = useState<Record<number, ScanResult>>({});
  const [redactionsApplied, setRedactionsApplied] = useState<Record<number, boolean>>({});
  const [draftId, setDraftId] = useState(createDraftId);
  const [draftActive, setDraftActive] = useState(false);
  const [drafts, setDrafts] = useState<DraftSummary[]>([]);
  const [draftStatus, setDraftStatus] = useState<'idle' | 'loading' | 'saving' | 'saved' | 'error'>('idle');
  const [draftError, setDraftError] = useState('');

  useEffect(() => {
    const timer = window.setTimeout(() => setShowSplash(false), 1500);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => () => {
    if (applicantPhoto) URL.revokeObjectURL(applicantPhoto.url);
  }, [applicantPhoto]);
  useEffect(() => {
    let active = true;
    listApplicationDrafts()
      .then((storedDrafts) => {
        if (active) setDrafts(storedDrafts);
      })
      .catch((error) => {
        if (!active) return;
        setDraftStatus('error');
        setDraftError(error instanceof Error ? error.message : 'Entw\u00fcrfe konnten nicht geladen werden.');
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!draftActive) return;

    setDraftStatus('saving');
    setDraftError('');
    const timer = window.setTimeout(() => {
      const updatedAt = Date.now();
      const draft: ApplicationDraft = {
        id: draftId,
        title,
        address,
        watermark,
        watermarkCustomized,
        includeCover,
        showApplicantPhoto,
        showRentalAddress,
        showMezaxNotice,
        applicantName,
        applicantEmail,
        applicantPhone,
        applicantCurrentAddress,
        applicantPhoto: applicantPhoto ? { name: applicantPhoto.name, file: applicantPhoto.file } : null,
        documents: docs.map((doc) => ({
          id: doc.id,
          name: doc.name,
          size: doc.size,
          type: doc.type,
          slot: doc.slot,
          file: doc.file,
        })),
        updatedAt,
      };

      saveApplicationDraft(draft)
        .then(() => {
          setDraftStatus('saved');
          setDrafts((current) => [
            {
              id: draft.id,
              title: draft.title,
              address: draft.address,
              updatedAt,
              documentCount: draft.documents.length,
            },
            ...current.filter((item) => item.id !== draft.id),
          ].sort((left, right) => right.updatedAt - left.updatedAt));
        })
        .catch((error) => {
          setDraftStatus('error');
          setDraftError(error instanceof Error ? error.message : 'Entwurf konnte nicht gespeichert werden.');
        });
    }, 700);

    return () => window.clearTimeout(timer);
  }, [
    address,
    applicantCurrentAddress,
    applicantEmail,
    applicantName,
    applicantPhone,
    applicantPhoto,
    docs,
    draftActive,
    draftId,
    includeCover,
    showApplicantPhoto,
    showMezaxNotice,
    showRentalAddress,
    title,
    watermark,
    watermarkCustomized,
  ]);
  useEffect(() => {
    setPreparedFolder((current) => {
      if (current) URL.revokeObjectURL(current.url);
      return null;
    });
  }, [
    address,
    applicantCurrentAddress,
    applicantEmail,
    applicantName,
    applicantPhone,
    applicantPhoto,
    docs,
    includeCover,
    redactionsApplied,
    scans,
    showApplicantPhoto,
    showMezaxNotice,
    showRentalAddress,
    title,
    watermark,
  ]);
  const [confirmingExport, setConfirmingExport] = useState<number | null>(null);
  const [exportingFolder, setExportingFolder] = useState(false);
  const [batchScanning, setBatchScanning] = useState(false);
  const [manualMode, setManualMode] = useState(false);
  const [manualDraft, setManualDraft] = useState<{ start: DocumentPoint; end: DocumentPoint } | null>(null);

  const completeness = useMemo(() => folderCompleteness(docs), [docs]);
  const completedRequired = completeness.completed;
  const completion = completeness.percent;
  const missingRequired = completeness.missing;
  const exportReady = allDocumentsReadyForExport(docs.map((doc) => doc.id), scans);

  const batchProgress = useMemo(() => batchScanProgress(docs.map((doc) => doc.id), scans), [docs, scans]);

  const findings = useMemo(() => {
    const all = Object.values(scans).flatMap((scan) => scan.detections.filter((item) => item.selected));
    const counts = new Map<string, number>();
    for (const detection of all) counts.set(detection.label, (counts.get(detection.label) ?? 0) + 1);
    return [...counts.entries()];
  }, [scans]);

  function releaseWorkspaceUrls() {
    for (const doc of docs) URL.revokeObjectURL(doc.url);
    if (applicantPhoto) URL.revokeObjectURL(applicantPhoto.url);
    if (preparedFolder) URL.revokeObjectURL(preparedFolder.url);
  }

  function resetWorkspace() {
    releaseWorkspaceUrls();
    setDocs([]);
    setPreview(null);
    setScans({});
    setRedactionsApplied({});
    setPreparedFolder(null);
    setFixed(false);
    setTitle('');
    setAddress('');
    setWatermark(rentalWatermark(''));
    setWatermarkCustomized(false);
    setIncludeCover(true);
    setShowApplicantPhoto(true);
    setShowRentalAddress(true);
    setShowMezaxNotice(true);
    setApplicantName('');
    setApplicantEmail('');
    setApplicantPhone('');
    setApplicantCurrentAddress('');
    setApplicantPhoto(null);
  }

  function startNewDraft() {
    setDraftActive(false);
    resetWorkspace();
    setDraftId(createDraftId());
    setDraftStatus('idle');
    setDraftError('');
    setScreen('new');
    window.setTimeout(() => setDraftActive(true), 0);
  }

  async function openSavedDraft(id: string) {
    setDraftStatus('loading');
    setDraftError('');
    try {
      const stored = await loadApplicationDraft(id);
      if (!stored) throw new Error('Der Entwurf wurde nicht gefunden.');

      setDraftActive(false);
      releaseWorkspaceUrls();
      const restoredDocs: Doc[] = stored.documents.map((doc) => {
        const file = new File([doc.file], doc.name, { type: doc.type || doc.file.type });
        return {
          id: doc.id,
          name: doc.name,
          size: doc.size,
          type: doc.type,
          slot: doc.slot,
          file,
          url: URL.createObjectURL(file),
        };
      });
      const restoredPhoto = stored.applicantPhoto
        ? new File([stored.applicantPhoto.file], stored.applicantPhoto.name, { type: stored.applicantPhoto.file.type })
        : null;

      setDraftId(stored.id);
      setTitle(stored.title);
      setAddress(stored.address);
      setWatermark(stored.watermark);
      setWatermarkCustomized(stored.watermarkCustomized);
      setIncludeCover(stored.includeCover);
      setShowApplicantPhoto(stored.showApplicantPhoto);
      setShowRentalAddress(stored.showRentalAddress);
      setShowMezaxNotice(stored.showMezaxNotice);
      setApplicantName(stored.applicantName);
      setApplicantEmail(stored.applicantEmail);
      setApplicantPhone(stored.applicantPhone);
      setApplicantCurrentAddress(stored.applicantCurrentAddress);
      setApplicantPhoto(restoredPhoto ? {
        name: restoredPhoto.name,
        file: restoredPhoto,
        url: URL.createObjectURL(restoredPhoto),
      } : null);
      setDocs(restoredDocs);
      setPreview(null);
      setScans({});
      setRedactionsApplied({});
      setPreparedFolder(null);
      setFixed(false);
      setDraftStatus('saved');
      setDraftActive(true);
      setScreen(restoredDocs.length ? 'documents' : 'new');
    } catch (error) {
      setDraftStatus('error');
      setDraftError(error instanceof Error ? error.message : 'Entwurf konnte nicht ge\u00f6ffnet werden.');
    }
  }

  async function deleteSavedDraft(id: string) {
    if (!window.confirm('Diesen lokal gespeicherten Entwurf wirklich l\u00f6schen?')) return;
    try {
      await removeApplicationDraft(id);
      setDrafts((current) => current.filter((draft) => draft.id !== id));
      if (draftId === id) {
        setDraftActive(false);
        resetWorkspace();
        setDraftId(createDraftId());
      }
    } catch (error) {
      setDraftStatus('error');
      setDraftError(error instanceof Error ? error.message : 'Entwurf konnte nicht gel\u00f6scht werden.');
    }
  }

  function addFiles(fileList: FileList | null, slot?: RequiredDocument) {
    if (!fileList) return;
    const selectedFiles = Array.from(fileList);
    if (!selectedFiles.length) return;
    setDocs((current) => [
      ...current,
      ...selectedFiles.map((file, index) => ({
        id: Date.now() + index,
        name: file.name,
        size: file.size,
        type: file.type || '',
        url: URL.createObjectURL(file),
        file,
        slot,
      })),
    ]);
  }

  function selectApplicantPhoto(fileList: FileList | null) {
    const file = fileList?.[0];
    if (!file || !file.type.startsWith('image/')) return;

    setApplicantPhoto((current) => {
      if (current) URL.revokeObjectURL(current.url);
      return { name: file.name, url: URL.createObjectURL(file), file };
    });
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

  function correctDocumentAssignment(docId: number, slot: RequiredDocument) {
    setDocs((current) => current.map((doc) => doc.id === docId ? { ...doc, slot } : doc));
    setPreview((current) => current?.id === docId ? { ...current, slot } : current);
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
      const inferredSlot = slotForClassification(classification.type);
      if (inferredSlot) {
        setDocs((current) => current.map((item) => item.id === doc.id ? { ...item, slot: item.slot ?? inferredSlot } : item));
      }

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

  async function scanAllDocuments() {
    const pendingIds = pendingDocumentIds(docs.map((doc) => doc.id), scans);
    if (!pendingIds.length) return;

    setBatchScanning(true);
    try {
      for (const id of pendingIds) {
        const doc = docs.find((item) => item.id === id);
        if (doc) await scanDocument(doc);
      }
    } finally {
      setBatchScanning(false);
    }
  }

  function openPreview(doc: Doc) {
    setManualMode(false);
    setManualDraft(null);
    setConfirmingExport(null);
    setPreview(doc);
    const supported = doc.type.startsWith('image/') || doc.type === 'application/pdf' || doc.name.toLowerCase().endsWith('.pdf');
    if (supported && !scans[doc.id]) {
      window.setTimeout(() => scanDocument(doc), 250);
    }
  }

  function manualPoint(event: React.PointerEvent<HTMLDivElement>, scan: ScanResult) {
    return toDocumentPoint(
      event.clientX,
      event.clientY,
      event.currentTarget.getBoundingClientRect(),
      scan.width,
      scan.height,
    );
  }

  function beginManualRedaction(event: React.PointerEvent<HTMLDivElement>, scan: ScanResult) {
    if (!manualMode || scan.status !== 'done' || !scan.width || !scan.height) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = manualPoint(event, scan);
    setManualDraft({ start: point, end: point });
  }

  function updateManualRedaction(event: React.PointerEvent<HTMLDivElement>, scan: ScanResult) {
    if (!manualMode || !manualDraft) return;
    const point = manualPoint(event, scan);
    setManualDraft((current) => current ? { ...current, end: point } : null);
  }

  function finishManualRedaction(event: React.PointerEvent<HTMLDivElement>, docId: number, scan: ScanResult) {
    if (!manualMode || !manualDraft) return;
    const box = createManualBox(manualDraft.start, manualPoint(event, scan));
    setManualDraft(null);
    if (!box) return;

    const id = `manual-${docId}-${Date.now()}`;
    setScans((current) => ({
      ...current,
      [docId]: {
        ...current[docId],
        detections: [
          ...current[docId].detections,
          {
            id,
            label: 'Manuelle Schwärzung',
            value: 'Manuell ausgewählt',
            confidence: 100,
            selected: true,
            bbox: box,
          },
        ],
      },
    }));
    setRedactionsApplied((current) => ({ ...current, [docId]: false }));
    setConfirmingExport(null);
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
    setConfirmingExport(null);
  }

  function toggleDetectionGroup(docId: number, detectionIds: string[]) {
    setScans((current) => {
      const groupIds = new Set(detectionIds);
      const groupedDetections = current[docId].detections.filter((detection) => groupIds.has(detection.id));
      const allSelected = groupedDetections.every((detection) => detection.selected);
      return {
        ...current,
        [docId]: {
          ...current[docId],
          detections: current[docId].detections.map((detection) =>
            groupIds.has(detection.id) ? { ...detection, selected: !allSelected } : detection,
          ),
        },
      };
    });
    setRedactionsApplied((current) => ({ ...current, [docId]: false }));
    setConfirmingExport(null);
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

  async function downloadApplicationFolder() {
    const exportable = sortFolderDocuments(docs).filter((doc) => {
      const scan = scans[doc.id];
      return scan?.status === 'done' && Boolean(scan.renderedUrl);
    });
    if (!exportable.length) return;
    if (exportable.length !== docs.length) {
      window.alert('Bitte öffne und prüfe zuerst jedes hinzugefügte Dokument. Ungeprüfte Dateien werden nicht exportiert.');
      return;
    }
    if (includeCover && !applicantName.trim()) {
      window.alert('Bitte trage für das Deckblatt den Namen der Bewerberin oder des Bewerbers ein.');
      return;
    }

    const confirmed = window.confirm(
      'Jetzt wird eine neue, dauerhaft geschwärzte PDF erzeugt. Die Originaldateien bleiben unverändert. Fortfahren?',
    );
    if (!confirmed) return;

    setExportingFolder(true);
    try {
      const output = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4', compress: true });
      const pageWidth = output.internal.pageSize.getWidth();
      const pageHeight = output.internal.pageSize.getHeight();
      const pagePlan = createPdfPagePlan(
        exportable.map((doc) => ({
          id: doc.id,
          name: doc.name,
          pageCount: scans[doc.id]?.pdfPages?.length || 1,
        })),
        includeCover,
      );
      const planByDocument = new Map(pagePlan.map((entry) => [entry.id, entry]));

      if (includeCover) {
        output.setFillColor(255, 255, 255);
        output.rect(0, 0, pageWidth, pageHeight, 'F');
        output.setFillColor(12, 175, 181);
        output.rect(0, 0, pageWidth, 12, 'F');
        output.setFillColor(231, 249, 248);
        output.rect(0, 12, 14, pageHeight - 12, 'F');

        const logoPng = await renderImageAsPng('/mezax-logo.png');
        output.addImage(logoPng, 'PNG', 48, 38, 38, 47, undefined, 'FAST');
        output.setFont('helvetica', 'bold');
        output.setTextColor(8, 79, 88);
        output.setFontSize(17);
        output.text('MEZAX', 96, 68);

        output.setTextColor(12, 31, 47);
        output.setFontSize(29);
        output.text('Bewerbungsmappe', 48, 126);
        output.setFont('helvetica', 'normal');
        output.setTextColor(70, 91, 105);
        output.setFontSize(14);
        output.text('für die Wohnungsbewerbung', 48, 151);

        if (showApplicantPhoto && applicantPhoto) {
          const photoImage = await loadBrowserImage(applicantPhoto.url);
          addCoverPhoto(output, photoImage, pageWidth - 138, 48, 90, 112);
        }

        output.setDrawColor(208, 228, 229);
        output.setLineWidth(0.8);
        output.line(48, 176, pageWidth - 48, 176);

        output.setFont('helvetica', 'bold');
        output.setTextColor(12, 175, 181);
        output.setFontSize(9);
        output.text('BEWERBERIN / BEWERBER', 48, 199);
        output.setTextColor(12, 31, 47);
        output.setFontSize(18);
        output.text(applicantName.trim(), 48, 222);

        const contactLines = [
          applicantEmail.trim(),
          applicantPhone.trim(),
          applicantCurrentAddress.trim(),
        ].filter(Boolean);
        output.setFont('helvetica', 'normal');
        output.setTextColor(72, 91, 105);
        output.setFontSize(10);
        contactLines.forEach((line, index) => {
          output.text(line, 48, 242 + index * 16, { maxWidth: showApplicantPhoto && applicantPhoto ? 360 : 495 });
        });

        if (showRentalAddress && address.trim()) {
          output.setFillColor(239, 250, 249);
          output.roundedRect(48, 294, pageWidth - 96, 50, 7, 7, 'F');
          output.setFont('helvetica', 'bold');
          output.setTextColor(12, 138, 145);
          output.setFontSize(8);
          output.text('GEWÜNSCHTE WOHNUNG', 62, 313);
          output.setFont('helvetica', 'normal');
          output.setTextColor(22, 51, 64);
          output.setFontSize(11);
          output.text(address.trim(), 62, 331, { maxWidth: pageWidth - 124 });
        }

        const contentsTop = 381;
        output.setFont('helvetica', 'bold');
        output.setTextColor(12, 31, 47);
        output.setFontSize(15);
        output.text('Inhaltsübersicht', 48, contentsTop);
        output.setDrawColor(12, 175, 181);
        output.setLineWidth(2);
        output.line(48, contentsTop + 10, 115, contentsTop + 10);

        const columnCount = pagePlan.length > 12 ? 2 : 1;
        const rowsPerColumn = Math.max(1, Math.ceil(pagePlan.length / columnCount));
        const columnGap = 24;
        const columnWidth = (pageWidth - 96 - columnGap * (columnCount - 1)) / columnCount;
        const rowHeight = Math.min(21, 270 / rowsPerColumn);
        output.setFontSize(rowHeight < 16 ? 7.5 : 9.5);

        const fitText = (value: string, maxWidth: number) => {
          if (output.getTextWidth(value) <= maxWidth) return value;
          let shortened = value;
          while (shortened.length > 4 && output.getTextWidth(shortened + '…') > maxWidth) {
            shortened = shortened.slice(0, -1);
          }
          return shortened + '…';
        };

        pagePlan.forEach((entry, index) => {
          const column = Math.floor(index / rowsPerColumn);
          const row = index % rowsPerColumn;
          const x = 48 + column * (columnWidth + columnGap);
          const y = contentsTop + 34 + row * rowHeight;
          const doc = exportable.find((item) => item.id === entry.id);
          const documentLabel = doc?.slot ? doc.slot + ' · ' + entry.name : entry.name;
          const pageNumberWidth = output.getTextWidth(entry.pageLabel);
          output.setFont('helvetica', 'normal');
          output.setTextColor(38, 58, 71);
          output.text(fitText(documentLabel, columnWidth - pageNumberWidth - 18), x, y);
          output.setDrawColor(210, 224, 226);
          output.setLineDashPattern([1.5, 2], 0);
          output.line(x + Math.max(30, columnWidth - pageNumberWidth - 55), y - 2, x + columnWidth - pageNumberWidth - 8, y - 2);
          output.setLineDashPattern([], 0);
          output.setFont('helvetica', 'bold');
          output.setTextColor(12, 138, 145);
          output.text(entry.pageLabel, x + columnWidth, y, { align: 'right' });
        });

        if (showMezaxNotice) {
          output.setFillColor(242, 250, 249);
          output.roundedRect(48, 712, pageWidth - 96, 46, 7, 7, 'F');
          output.setFont('helvetica', 'normal');
          output.setTextColor(57, 79, 91);
          output.setFontSize(9.5);
          output.text(
            'Diese Unterlagen wurden mit Mezax datenschutzfreundlich geprüft und zusammengestellt.',
            62,
            731,
            { maxWidth: pageWidth - 124 },
          );
        }

        const createdOn = new Intl.DateTimeFormat('de-DE', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
        }).format(new Date());
        output.setFont('helvetica', 'normal');
        output.setTextColor(100, 116, 126);
        output.setFontSize(8.5);
        output.text('Erstellt am ' + createdOn, 48, 786);
        output.setFont('helvetica', 'bold');
        output.setFontSize(10);
        const sloganPrefix = 'Teile Dokumente. ';
        const sloganSuffix = 'Nicht deine Daten.';
        const sloganX = pageWidth - 48 - output.getTextWidth(sloganPrefix + sloganSuffix);
        output.setTextColor(8, 79, 88);
        output.text(sloganPrefix, sloganX, 786);
        output.setTextColor(12, 175, 181);
        output.text(sloganSuffix, sloganX + output.getTextWidth(sloganPrefix), 786);
      }

      let hasRenderedPage = includeCover;
      for (const doc of exportable) {
        const scan = scans[doc.id];
        const planEntry = planByDocument.get(doc.id);
        if (!scan?.renderedUrl || !planEntry) continue;
        const image = await loadBrowserImage(scan.renderedUrl);
        const pages = scan.pdfPages?.length
          ? scan.pdfPages
          : [{ top: 0, width: scan.width || image.naturalWidth, height: scan.height || image.naturalHeight }];

        for (let pageIndex = 0; pageIndex < pages.length; pageIndex += 1) {
          const page = pages[pageIndex];
          const canvas = document.createElement('canvas');
          canvas.width = page.width;
          canvas.height = page.height;
          const context = canvas.getContext('2d');
          if (!context) continue;
          context.fillStyle = '#ffffff';
          context.fillRect(0, 0, page.width, page.height);
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

          if (hasRenderedPage) output.addPage('a4', 'portrait');
          hasRenderedPage = true;
          const margin = 38;
          const ratio = Math.min((pageWidth - margin * 2) / page.width, (pageHeight - 90) / page.height);
          const drawWidth = page.width * ratio;
          const drawHeight = page.height * ratio;
          output.addImage(
            canvas.toDataURL('image/jpeg', 0.93),
            'JPEG',
            (pageWidth - drawWidth) / 2,
            35,
            drawWidth,
            drawHeight,
            undefined,
            'FAST',
          );
          output.setTextColor(145, 154, 166);
          output.setFontSize(13);
          output.text(watermark || 'Nur für diese Wohnungsbewerbung', pageWidth / 2, pageHeight / 2, { align: 'center', angle: 45 });
          output.setFontSize(9);
          output.text(
            (doc.slot ?? doc.name) + ' · Seite ' + (planEntry.startPage + pageIndex),
            38,
            pageHeight - 24,
          );
        }
      }

      const fileName = safeFolderFileName(title);
      const blob = output.output('blob');
      let downloadUrl: string | undefined;
      try {
        const response = await fetch(`/__mezax-pdf?name=${encodeURIComponent(fileName)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/pdf' },
          body: blob,
        });
        if (response.ok) {
          const result = await response.json() as { url?: string };
          downloadUrl = result.url;
        }
      } catch {
        // Der normale Browser-Blob bleibt als Offline-Fallback verfügbar.
      }
      setPreparedFolder((current) => {
        if (current) URL.revokeObjectURL(current.url);
        return {
          url: URL.createObjectURL(blob),
          name: fileName,
          file: new File([blob], fileName, { type: 'application/pdf' }),
          downloadUrl,
        };
      });
    } finally {
      setExportingFolder(false);
    }
  }

  async function sharePreparedFolder() {
    if (!preparedFolder || typeof navigator.share !== 'function') return;

    const shareData: ShareData = {
      files: [preparedFolder.file],
      title: 'Mezax Bewerbungsmappe',
      text: 'Geschützte Bewerbungsmappe',
    };

    try {
      if (typeof navigator.canShare === 'function' && !navigator.canShare(shareData)) return;
      await navigator.share(shareData);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      window.alert('Die PDF konnte nicht über das Teilen-Menü geöffnet werden. Nutze bitte „PDF öffnen“.');
    }
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
    const manualBox = manualDraft ? createManualBox(manualDraft.start, manualDraft.end, 0) : null;
    const assignmentReview = reviewDocumentAssignment(preview.slot, scan.classification);
    const reviewGroups = scan.detections.reduce<Array<{ key: string; detections: Detection[] }>>((groups, detection) => {
      if (detection.label === 'Maschinenlesbare Zone (MRZ)') {
        const existingGroup = groups.find((group) => group.key === 'mrz');
        if (existingGroup) {
          existingGroup.detections.push(detection);
          return groups;
        }
        groups.push({ key: 'mrz', detections: [detection] });
        return groups;
      }
      groups.push({ key: detection.id, detections: [detection] });
      return groups;
    }, []);

    return (
      <div className="previewOverlay">
        <div className="previewTop">
          <button className="icon" onClick={() => { setPreview(null); setManualMode(false); setManualDraft(null); }} aria-label="Vorschau schließen">
            <X />
          </button>
          <div>
            <b>{preview.name}</b>
            <small>{(preview.size / 1048576).toFixed(2)} MB · lokal geöffnet</small>
          </div>
        </div>

        <div className="previewBody">
          {(isImage || (isPdf && scan.renderedUrl)) ? (
            <div className={manualMode ? 'imageStage manualMode' : 'imageStage'} onPointerDown={(event) => beginManualRedaction(event, scan)} onPointerMove={(event) => updateManualRedaction(event, scan)} onPointerUp={(event) => finishManualRedaction(event, preview.id, scan)}>
              <img src={scan.renderedUrl ?? preview.url} alt={preview.name} draggable={false} />
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
              {manualBox && scan.width > 0 && scan.height > 0 && (
                <div className="manualDraftBox" style={{ left: `${(manualBox.left / scan.width) * 100}%`, top: `${(manualBox.top / scan.height) * 100}%`, width: `${(manualBox.width / scan.width) * 100}%`, height: `${(manualBox.height / scan.height) * 100}%` }} />
              )}
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
                  <b>{reviewGroups.length ? reviewGroups.length + ' Empfehlung(en)' : 'Keine eindeutigen Treffer'}</b>
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

              {assignmentReview.status === 'mismatch' && (
                <div className="warning assignmentWarning">
                  <AlertTriangle />
                  <div>
                    <p><b>Möglicherweise falsch zugeordnet</b><br />{assignmentReview.message}</p>
                    {assignmentReview.detectedSlot && (
                      <button className="secondary compact assignmentCorrection" onClick={() => correctDocumentAssignment(preview.id, assignmentReview.detectedSlot!)}>
                        Als „{assignmentReview.detectedSlot}“ einordnen
                      </button>
                    )}
                  </div>
                </div>
              )}

              <button className={manualMode ? 'secondary compact manualActive' : 'secondary compact'} onClick={() => { setManualMode((active) => !active); setManualDraft(null); }}>
                {manualMode ? <><Check /> Manuelle Auswahl beenden</> : <><Plus /> Fehlende Stelle selbst markieren</>}
              </button>
              {manualMode && <small className="manualHint">Ziehe mit Finger oder Maus einen Rahmen über die Information. Kleine versehentliche Berührungen werden ignoriert.</small>}

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
                  {reviewGroups.map((group) => {
                    const detection = group.detections[0];
                    const allSelected = group.detections.every((item) => item.selected);
                    const someSelected = group.detections.some((item) => item.selected);
                    const averageConfidence = Math.round(
                      group.detections.reduce((sum, item) => sum + item.confidence, 0) / group.detections.length,
                    );
                    const detail = group.detections.length > 1
                      ? group.detections.length + ' erkannte Zeilen - OCR durchschnittlich ' + averageConfidence + '%'
                      : maskedValue(detection.value) + ' - OCR ' + detection.confidence + '%';
                    return (
                      <button key={group.key} onClick={() => toggleDetectionGroup(preview.id, group.detections.map((item) => item.id))}>
                        <span className={someSelected ? 'tick selected' : 'tick'}>{allSelected ? <Check /> : someSelected ? '-' : null}</span>
                        <span><b>{detection.label} - {getRentalPrivacyRecommendation(detection.label, scan.classification?.type).title}</b><small>{getRentalPrivacyRecommendation(detection.label, scan.classification?.type).reason}</small><small>{detail}</small></span>
                      </button>
                    );
                  })}
                </div>
              )}

              {selectedCount > 0 && !applied && (
                <button className="primary" onClick={() => { setRedactionsApplied((current) => ({ ...current, [preview.id]: true })); setConfirmingExport(null); }}>
                  <WandSparkles /> {selectedCount} Schwärzung(en) anwenden
                </button>
              )}

              {selectedCount > 0 && applied && confirmingExport !== preview.id && (
                <div className="redactionActions">
                  <button className="secondary compact" onClick={() => { setRedactionsApplied((current) => ({ ...current, [preview.id]: false })); setConfirmingExport(null); }}>
                    <ArrowLeft /> Auswahl weiter bearbeiten
                  </button>
                  <button className="primary" onClick={() => setConfirmingExport(preview.id)}>
                    <Download /> Geschützte {isPdf ? 'PDF' : 'Kopie'} speichern
                  </button>
                </div>
              )}

              {selectedCount > 0 && applied && confirmingExport === preview.id && (
                <div className="exportConfirmation">
                  <div className="warning">
                    <LockKeyhole />
                    <p><b>Endgültige geschützte Kopie erstellen?</b><br />In der exportierten Datei können die Schwärzungen nicht rückgängig gemacht werden. Das Original bleibt unverändert.</p>
                  </div>
                  <button className="secondary compact" onClick={() => setConfirmingExport(null)}>Abbrechen</button>
                  <button className="primary" onClick={() => { setConfirmingExport(null); void (isPdf ? downloadRedactedPdf(preview, scan) : downloadRedacted(preview, scan)); }}>
                    <Download /> Endgültig exportieren
                  </button>
                </div>
              )}
            </>
          )}

          {(isImage || isPdf) && scan.status === 'idle' && (
            <button className="primary" onClick={() => scanDocument(preview)}>
              <ScanSearch /> Automatisch prüfen
            </button>
          )}

          <small className="localNote">Die Datei bleibt lokal im Browser. Automatische und manuelle Schwärzungen müssen vor dem Export geprüft werden. Beta-Erkennung ohne Garantie.</small>
        </div>
      </div>
    );
  };

  if (screen === 'welcome') {
    return (
      <main className="app welcome">
        <section>
          <img className="startBrandShield" src="/mezax-logo.png" alt="Mezax" />
          <img className="startWordmarkImage" src="/mezax-wordmark.png" alt="Mezax" />
          <p className="startSlogan">Teile Dokumente. <span>Nicht deine Daten.</span></p>
        </section>
        <div className="trust">
          <div><ShieldCheck /><p><b>Datenschutz zuerst</b><small>Sensible Daten werden geprüft.</small></p></div>
          <div><ScanSearch /><p><b>Lokale OCR-Beta</b><small>Bilder und PDFs werden direkt im Browser analysiert.</small></p></div>
          <div><LockKeyhole /><p><b>Du entscheidest</b><small>Jeder Vorschlag kann bestätigt oder abgewählt werden.</small></p></div>
        </div>
        <button className="primary" onClick={() => setScreen('dashboard')}>Los geht’s</button>
        <small className="note">Prototyp v0.6 · Für Tests nur Beispieldokumente verwenden</small>
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
          <button className="primary big" onClick={startNewDraft}><Plus /> Neue Bewerbungsmappe</button>
          <h3>Meine Mappen</h3>
          <div className="draftList">
            {drafts.length ? drafts.map((draft) => (
              <article
                className="card draftCard"
                key={draft.id}
                role="button"
                tabIndex={0}
                onClick={() => openSavedDraft(draft.id)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') openSavedDraft(draft.id);
                }}
              >
                <div className="fileicon"><Home /></div>
                <div>
                  <b>{draft.title.trim() || 'Wohnungsbewerbung'}</b>
                  <small>{draft.address.trim() || 'Adresse noch offen'}</small>
                  <small>{draft.documentCount} Dokument(e) · {formatDraftDate(draft.updatedAt)}</small>
                </div>
                <span>Entwurf</span>
                <button className="icon draftDelete" type="button" aria-label="Entwurf löschen" onClick={(event) => {
                  event.stopPropagation();
                  deleteSavedDraft(draft.id);
                }}><X /></button>
              </article>
            )) : (
              <div className="emptyDrafts">
                <FileText />
                <p><b>Noch keine gespeicherte Mappe</b><small>Dein erster Entwurf erscheint automatisch hier.</small></p>
              </div>
            )}
          </div>
          {draftStatus === 'error' && <p className="draftError">{draftError}</p>}
          <div className="info"><ShieldCheck /><p><b>Mezax Check</b><small>Prüfe Bilder jetzt automatisch auf ausgewählte sensible Nummern.</small></p></div>
        </section>
        <nav>
          <button className="active"><Home /><small>Übersicht</small></button>
          <button onClick={() => setScreen('folders')}><FileText /><small>Mappen</small></button>
          <button><ShieldCheck /><small>Check</small></button>
          <button><UserRound /><small>Profil</small></button>
        </nav>
      </main>
    );
  }

  if (screen === 'folders') {
    return (
      <main className="app">
        <Header name="Meine Mappen" />
        <section className="content foldersPage">
          <div className="info localStorageInfo"><ShieldCheck /><p><b>Nur auf diesem Gerät gespeichert</b><small>Deine Unterlagen werden nicht in eine Cloud hochgeladen.</small></p></div>
          <div className="foldersHeading"><div><h2>Gespeicherte Bewerbungen</h2><p className="muted">Tippe auf eine Mappe, um sie weiterzubearbeiten.</p></div></div>
          <button className="primary" onClick={startNewDraft}><Plus /> Neue Bewerbungsmappe</button>
          <div className="draftList foldersList">
            {drafts.length ? drafts.map((draft) => (
              <article
                className="card draftCard"
                key={draft.id}
                role="button"
                tabIndex={0}
                onClick={() => openSavedDraft(draft.id)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') openSavedDraft(draft.id);
                }}
              >
                <div className="fileicon"><Home /></div>
                <div>
                  <b>{draft.title.trim() || 'Wohnungsbewerbung'}</b>
                  <small>{draft.address.trim() || 'Adresse noch offen'}</small>
                  <small>{draft.documentCount} Dokument(e) · {formatDraftDate(draft.updatedAt)}</small>
                </div>
                <span>Entwurf</span>
                <button className="icon draftDelete" type="button" aria-label="Entwurf löschen" onClick={(event) => {
                  event.stopPropagation();
                  deleteSavedDraft(draft.id);
                }}><X /></button>
              </article>
            )) : (
              <div className="emptyDrafts">
                <FileText />
                <p><b>Noch keine gespeicherte Mappe</b><small>Erstelle zuerst eine neue Bewerbungsmappe.</small></p>
              </div>
            )}
          </div>
          {draftStatus === 'error' && <p className="draftError">{draftError}</p>}
        </section>
        <nav>
          <button onClick={() => setScreen('dashboard')}><Home /><small>Übersicht</small></button>
          <button className="active"><FileText /><small>Mappen</small></button>
          <button disabled={!docs.length} onClick={() => docs.length && setScreen('check')}><ShieldCheck /><small>Check</small></button>
          <button disabled><UserRound /><small>Profil</small></button>
        </nav>
      </main>
    );
  }

  if (screen === 'new') {
    return (
      <main className="app">
        <Header name="Neue Mappe" back="dashboard" />
        <section className="content">
          {draftActive && <div className={'draftSaveStatus ' + draftStatus}><ShieldCheck /><span>{draftStatus === 'saving' ? 'Wird lokal gespeichert …' : draftStatus === 'error' ? 'Speichern fehlgeschlagen' : 'Lokal auf diesem Gerät gespeichert'}</span></div>}
          <div className="steps"><b>1</b><i /><span>2</span><i /><span>3</span></div>
          <h2>Auf welche Wohnung bewirbst du dich?</h2>
          <p className="muted">Diese Angaben helfen dir, die Mappe später wiederzufinden.</p>
          <label>Adresse der gewünschten Wohnung <span className="optionalMark">Optional</span>
            <input value={address} placeholder="z. B. Musterstraße 12, 10115 Berlin" onChange={(event) => {
              const nextAddress = event.target.value;
              setAddress(nextAddress);
              if (!watermarkCustomized) setWatermark(rentalWatermark(nextAddress));
            }} />
            <small className="fieldHint">Gemeint ist die Wohnung aus dem Angebot – nicht deine aktuelle Wohnadresse.</small>
          </label>
          <label>Name der Mappe <span className="optionalMark">Optional</span>
            <input value={title} placeholder="z. B. Wohnung Berlin-Mitte" onChange={(event) => setTitle(event.target.value)} />
            <small className="fieldHint">Dieser Name ist nur für deine Übersicht und den PDF-Dateinamen.</small>
          </label>
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
          {draftActive && <div className={'draftSaveStatus ' + draftStatus}><ShieldCheck /><span>{draftStatus === 'saving' ? 'Wird lokal gespeichert …' : draftStatus === 'error' ? 'Speichern fehlgeschlagen' : 'Lokal auf diesem Gerät gespeichert'}</span></div>}
          <div className="steps"><span>1</span><i /><b>2</b><i /><span>3</span></div>
          <h2>Dokumente hinzufügen</h2>
          <p className="muted">Öffne ein Bild oder PDF: Die automatische Prüfung startet direkt.</p>
          <label className="drop">
            <Upload /><b>Dateien auswählen</b><span>PDF, JPG oder PNG</span>
            <input className="nativeFileInput" multiple type="file" accept="application/pdf,image/jpeg,image/png" onChange={(event) => {
              addFiles(event.currentTarget.files);
              event.currentTarget.value = '';
            }} />
          </label>
          <h3>Empfohlene Unterlagen</h3>
          <div className="folderProgress">
            <div><b>{completion}% vollständig</b><small>{completedRequired} von {required.length} Kategorien vorhanden</small></div>
            <div className="progressTrack"><span style={{ width: `${completion}%` }} /></div>
          </div>
          {missingRequired.length > 0 && (
            <div className="missingDocuments">
              <AlertTriangle />
              <div><b>Noch empfohlene Unterlagen</b><small>{missingRequired.join(' · ')}</small></div>
            </div>
          )}
          <div className="list recommendedList">{required.map((item) => {
            const assigned = docs.find((doc) => doc.slot === item);
            return (
              <label className={assigned ? 'recommendedDoc ready' : 'recommendedDoc'} key={item}>
                <FileText />
                <span><b>{item}</b><small>{assigned?.name ?? 'Noch nicht hinzugefügt'}</small></span>
                <input className="nativeFileInput" multiple={item === 'Gehaltsnachweise'} type="file" accept="application/pdf,image/jpeg,image/png" onChange={(event) => {
                  addFiles(event.currentTarget.files, item);
                  event.currentTarget.value = '';
                }} />
                {assigned ? <Check /> : <Plus />}
              </label>
            );
          })}</div>

          {docs.length > 0 && (
            <>
              <h3>Ausgewählte Dateien</h3>
              <div className="list">
                {docs.map((doc) => {
                  const scan = scans[doc.id];
                  const assignmentReview = reviewDocumentAssignment(doc.slot, scan?.classification);
                  return (
                    <div key={doc.id}>
                      <FileText />
                      <span>
                        <b>{doc.name}</b>
                        <small>{doc.slot ? `${doc.slot} · ` : ''}</small>
                        <small>{(doc.size / 1048576).toFixed(2)} MB{scan?.status === 'done' ? ` · ${scan.classification?.type ?? 'Sonstiges'} (${scan.classification?.confidence ?? 0}%) · ${scan.detections.length} Treffer` : ''}</small>
                        {assignmentReview.status === 'mismatch' && <small className="assignmentMismatch">⚠ {assignmentReview.message}</small>}
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
    const allCompleted = docs.length > 0 && batchProgress.completed === docs.length;
    return (
      <main className="app">
        <Header name="Mezax Check" back="documents" />
        <section className="content center">
          <div className="ring"><Logo /></div>
          <h2>{allCompleted ? 'Prüfung abgeschlossen' : 'Unterlagen automatisch prüfen'}</h2>
          <p className="muted">Die hochgeladenen Dateien wurden lokal auf sensible Angaben geprüft.</p>
          <div className={'folderProgress completenessStatus ' + (completion === 100 ? 'complete' : '')}>
            <div><b>Bewerbungsmappe: {completion}% vollständig</b><small>{completedRequired} von {required.length} empfohlenen Dokumentarten vorhanden</small></div>
            <div className="progressTrack"><span style={{ width: completion + '%' }} /></div>
          </div>
          {missingRequired.length > 0 && (
            <div className="missingDocuments compact">
              <AlertTriangle />
              <div><b>Noch nicht enthalten</b><small>{missingRequired.join(' · ')}</small></div>
            </div>
          )}
          <div className="folderProgress batchProgress">
            <div><b>Prüffortschritt: {batchProgress.completed} von {batchProgress.total}</b><small>{batchScanning ? 'Mezax arbeitet Dokument für Dokument' : 'Alle hinzugefügten Dateien geprüft'}</small></div>
            <div className="progressTrack"><span style={{ width: batchProgress.percent + '%' }} /></div>
          </div>
          <div className="analysis">
            <div><Check /> Dokumente hinzugefügt</div>
            <div><Check /> Bilder und PDFs bleiben lokal</div>
            <div className={allCompleted ? '' : 'pending'}>{allCompleted ? <Check /> : <i />} OCR und Dokumenttyp-Erkennung</div>
            <div className={allCompleted ? '' : 'pending'}>{allCompleted ? <Check /> : <i />} Datenschutzempfehlungen vorbereitet</div>
          </div>
          {allCompleted ? (
            <button className="primary" onClick={() => setScreen('result')}>Ergebnis anzeigen</button>
          ) : (
            <button className="primary" disabled={batchScanning} onClick={scanAllDocuments}>
              {batchScanning ? <><LoaderCircle className="spin" /> Prüfung läuft …</> : <><ScanSearch /> Alle Dokumente prüfen</>}
            </button>
          )}
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
          <label>Wasserzeichen<input value={watermark} onChange={(event) => {
            setWatermark(event.target.value);
            setWatermarkCustomized(true);
          }} /></label>
          <div className="warning"><LockKeyhole /><p><b>Beta-Hinweis:</b> Automatische Treffer müssen immer kontrolliert werden. Der Export erstellt eine neue, flach gerenderte Gesamt-PDF; prüfe vor dem Versand trotzdem jede Seite.</p></div>
        </section>
        <footer><button className="primary" onClick={() => { setFixed(true); setScreen('export'); }}>Vorschläge übernehmen</button></footer>
      </main>
    );
  }

  return (
    <main className="app">
      <Header name="Export" back="result" />
      <section className="content exportPage">
        <div className="exportIntro">
          <div className="success"><Check /></div>
          <h2>Prüfung abgeschlossen</h2>
          <p className="muted">Erstelle eine neue, geschützte Gesamt-PDF. Deine Originaldateien bleiben unverändert.</p>
        </div>

        <div className="exportSettings">
          <h3>Export-Einstellungen</h3>
          <label className="settingSwitch">
            <span><b>Deckblatt einfügen</b><small>Eine professionelle A4-Titelseite mit Inhaltsübersicht.</small></span>
            <input type="checkbox" checked={includeCover} onChange={(event) => setIncludeCover(event.target.checked)} />
            <i aria-hidden="true" />
          </label>

          {includeCover && (
            <>
              <div className="applicantFields">
                <label>Bewerbername <span className="requiredMark">Pflichtfeld</span>
                  <input value={applicantName} onChange={(event) => setApplicantName(event.target.value)} placeholder="Vor- und Nachname" />
                </label>
                <label>E-Mail (optional)
                  <input type="email" value={applicantEmail} onChange={(event) => setApplicantEmail(event.target.value)} placeholder="name@beispiel.de" />
                </label>
                <label>Telefonnummer (optional)
                  <input type="tel" value={applicantPhone} onChange={(event) => setApplicantPhone(event.target.value)} placeholder="+49 …" />
                </label>
                <label>Aktuelle Adresse (optional)
                  <input value={applicantCurrentAddress} onChange={(event) => setApplicantCurrentAddress(event.target.value)} placeholder="Straße, PLZ Ort" />
                </label>
              </div>

              <div className="photoSetting">
                <div>
                  <b>Bewerberfoto (optional)</b>
                  <small>Wird oben rechts auf dem Deckblatt zugeschnitten.</small>
                </div>
                {applicantPhoto && (
                  <div className="photoSelection">
                    <img src={applicantPhoto.url} alt="Ausgewähltes Bewerberfoto" />
                    <span>{applicantPhoto.name}</span>
                    <button type="button" className="icon" aria-label="Bewerberfoto entfernen" onClick={() => {
                      setApplicantPhoto((current) => {
                        if (current) URL.revokeObjectURL(current.url);
                        return null;
                      });
                    }}><X /></button>
                  </div>
                )}
                <label className="photoUpload">
                  <Upload />
                  <span>{applicantPhoto ? 'Anderes Foto auswählen' : 'Foto auswählen'}</span>
                  <input type="file" accept="image/*" onChange={(event) => {
                    selectApplicantPhoto(event.target.files);
                    event.target.value = '';
                  }} />
                </label>
              </div>

              <label className="settingSwitch">
                <span><b>Bewerberfoto anzeigen</b><small>Nur wirksam, wenn ein Foto ausgewählt wurde.</small></span>
                <input type="checkbox" checked={showApplicantPhoto} onChange={(event) => setShowApplicantPhoto(event.target.checked)} />
                <i aria-hidden="true" />
              </label>
              <label className="settingSwitch">
                <span><b>Wohnungsadresse anzeigen</b><small>{address.trim() || 'Noch keine Wohnungsadresse angegeben.'}</small></span>
                <input type="checkbox" checked={showRentalAddress} onChange={(event) => setShowRentalAddress(event.target.checked)} />
                <i aria-hidden="true" />
              </label>
              <label className="settingSwitch">
                <span><b>Mezax-Hinweis anzeigen</b><small>Datenschutzfreundliche Prüfung auf dem Deckblatt bestätigen.</small></span>
                <input type="checkbox" checked={showMezaxNotice} onChange={(event) => setShowMezaxNotice(event.target.checked)} />
                <i aria-hidden="true" />
              </label>
            </>
          )}
        </div>

        <div className="exportSummary">
          <div><Check /> {includeCover ? 'Genau eine Deckblattseite mit Inhaltsübersicht' : 'Export ohne Deckblatt'}</div>
          <div><Check /> Automatisch sortierte Unterlagen</div>
          <div><Check /> Ausgewählte Schwärzungen fest eingebrannt</div>
          <div><Check /> Originaldateien bleiben unverändert</div>
        </div>

        {preparedFolder && (
          <div className="preparedPdf" id="prepared-pdf">
            <div className="preparedPdfTitle">
              <Check />
              <span><b>PDF ist bereit</b><small>{preparedFolder.name}</small></span>
            </div>
            <button className="primary" type="button" onClick={() => window.location.assign(preparedFolder.downloadUrl ?? preparedFolder.url)}>
              <Download /> PDF aufs Handy herunterladen
            </button>
            {typeof navigator.share === 'function' && (
              <button className="secondary" type="button" onClick={sharePreparedFolder}>
                <Upload /> Teilen oder auf dem Handy speichern
              </button>
            )}
            <a className="secondary pdfDownloadLink" href={preparedFolder.downloadUrl ?? preparedFolder.url} download={preparedFolder.name}>
              <FileText /> Alternativen Download öffnen
            </a>
            <small className="preparedPdfHint">Auf iPhone: PDF öffnen, dann „Teilen“ → „In Dateien sichern“. Auf Android findest du sie anschließend unter „Downloads“.</small>
          </div>
        )}

        {!exportReady && (
          <p className="exportValidation">Bitte prüfe zuerst alle hinzugefügten Dokumente. Eine teilweise geprüfte Mappe kann aus Sicherheitsgründen nicht exportiert werden.</p>
        )}
        {includeCover && !applicantName.trim() && (
          <p className="exportValidation">Bitte ergänze den Bewerbernamen, um das Deckblatt zu erstellen.</p>
        )}
        <button
          className="primary"
          disabled={
            exportingFolder
            || !exportReady
            || (includeCover && !applicantName.trim())
          }
          onClick={downloadApplicationFolder}
        >
          <Download /> {exportingFolder ? 'PDF wird erstellt …' : 'Geschützte Bewerbungsmappe erstellen'}
        </button>
        <button className="secondary" onClick={() => setScreen('documents')}>Zurück zu Dokumenten</button>
      </section>
    </main>
  );

}

const showLandingPage = window.location.pathname === '/landing';

createRoot(document.getElementById('root')!).render(
  showLandingPage ? <LandingPage /> : <App />
);
