import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { AlertTriangle, Camera, Check, LoaderCircle, Plus, ScanSearch, SlidersHorizontal, X } from 'lucide-react';
import {
  analyzeDocumentCorners,
  createScannedDocumentFile,
  isValidDocumentCorners,
  previewFilter,
  type DocumentCorners,
  type ScanFilter,
} from './documentPerspective';
import { analyzeDocumentScanQuality, type ScanQualityResult } from './scanQuality';
import { fitPreviewToStage, type PreviewSize } from './previewGeometry';

type CornerKey = keyof DocumentCorners;

type DocumentScanEditorProps = {
  sourceUrl: string;
  sourceName: string;
  label: string;
  pageCount?: number;
  onCancel: () => void;
  onRetake: () => void;
  onUse: (file: File) => Promise<void> | void;
  onUseAndContinue?: (file: File) => Promise<void> | void;
};

const defaultCorners: DocumentCorners = {
  topLeft: { x: 0.005, y: 0.005 },
  topRight: { x: 0.995, y: 0.005 },
  bottomRight: { x: 0.995, y: 0.995 },
  bottomLeft: { x: 0.005, y: 0.995 },
};

const filters: Array<{ id: ScanFilter; label: string }> = [
  { id: 'original', label: 'Original' },
  { id: 'color', label: 'Farbe' },
  { id: 'grayscale', label: 'Grau' },
  { id: 'blackwhite', label: 'S/W' },
];

export default function DocumentScanEditor({
  sourceUrl,
  sourceName,
  label,
  pageCount = 1,
  onCancel,
  onRetake,
  onUse,
  onUseAndContinue,
}: DocumentScanEditorProps) {
  const [corners, setCorners] = useState<DocumentCorners>(defaultCorners);
  const [filter, setFilter] = useState<ScanFilter>('color');
  const [analysisStatus, setAnalysisStatus] = useState<'loading' | 'detected' | 'fallback' | 'manual' | 'error'>('loading');
  const [analysisMessage, setAnalysisMessage] = useState('');
  const [qualityStatus, setQualityStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [quality, setQuality] = useState<ScanQualityResult | null>(null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const stageRef = useRef<HTMLDivElement | null>(null);
  const imageFrameRef = useRef<HTMLDivElement | null>(null);
  const [sourceSize, setSourceSize] = useState<PreviewSize | null>(null);
  const [previewSize, setPreviewSize] = useState<PreviewSize | null>(null);
  const cornersValid = isValidDocumentCorners(corners);

  useEffect(() => {
    let active = true;
    setAnalysisStatus('loading');
    setQuality(null);
    setQualityStatus('idle');
    setError('');
    setAnalysisMessage('');
    setSourceSize(null);
    setPreviewSize(null);
    analyzeDocumentCorners(sourceUrl)
      .then((result) => {
        if (!active) return;
        setSourceSize({ width: result.width, height: result.height });
        setCorners(result.corners);
        setAnalysisStatus(result.automatic ? 'detected' : 'fallback');
        setAnalysisMessage(result.message);
      })
      .catch((reason) => {
        if (!active) return;
        setCorners(defaultCorners);
        setAnalysisStatus('error');
        const message = reason instanceof Error ? reason.message : 'Dokumentränder konnten nicht erkannt werden.';
        setAnalysisMessage(message);
        setError(message);
      });
    return () => {
      active = false;
    };
  }, [sourceUrl]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || !sourceSize) return;

    const updatePreviewSize = () => {
      const styles = window.getComputedStyle(stage);
      const horizontalPadding = Number.parseFloat(styles.paddingLeft) + Number.parseFloat(styles.paddingRight);
      const verticalPadding = Number.parseFloat(styles.paddingTop) + Number.parseFloat(styles.paddingBottom);
      const next = fitPreviewToStage(
        sourceSize.width,
        sourceSize.height,
        Math.max(1, stage.clientWidth - horizontalPadding),
        Math.max(1, stage.clientHeight - verticalPadding),
      );
      setPreviewSize((current) => (
        current?.width === next.width && current.height === next.height ? current : next
      ));
    };

    updatePreviewSize();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(updatePreviewSize);
    observer?.observe(stage);
    window.addEventListener('resize', updatePreviewSize);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', updatePreviewSize);
    };
  }, [sourceSize]);

  useEffect(() => {
    if (analysisStatus === 'loading') return;
    if (!cornersValid) {
      setQuality(null);
      setQualityStatus('error');
      return;
    }
    let active = true;
    const timer = window.setTimeout(() => {
      setQualityStatus('loading');
      analyzeDocumentScanQuality(sourceUrl, corners, analysisStatus === 'detected')
        .then((result) => {
          if (!active) return;
          setQuality(result);
          setQualityStatus('done');
        })
        .catch(() => {
          if (!active) return;
          setQuality(null);
          setQualityStatus('error');
        });
    }, 350);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [analysisStatus, corners, cornersValid, sourceUrl]);

  const updateCorner = (key: CornerKey, event: ReactPointerEvent<HTMLButtonElement>) => {
    const rect = imageFrameRef.current?.getBoundingClientRect();
    if (!rect?.width || !rect.height) return;
    const point = {
      x: Math.min(0.995, Math.max(0.005, (event.clientX - rect.left) / rect.width)),
      y: Math.min(0.995, Math.max(0.005, (event.clientY - rect.top) / rect.height)),
    };
    setCorners((current) => ({ ...current, [key]: point }));
    setAnalysisStatus('manual');
    setAnalysisMessage('Ecken manuell angepasst. Prüfe, ob das gesamte Blatt innerhalb der Markierung liegt.');
  };

  const startCornerDrag = (key: CornerKey, event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    updateCorner(key, event);
  };

  const moveCorner = (key: CornerKey, event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    event.preventDefault();
    updateCorner(key, event);
  };

  const useScan = async (continueScanning = false) => {
    if (!cornersValid) {
      setError('Die vier Eckpunkte dürfen sich nicht kreuzen und müssen eine lesbare Fläche umschließen.');
      return;
    }
    if (processing) return;
    setProcessing(true);
    setError('');
    try {
      const file = await createScannedDocumentFile(sourceUrl, corners, filter, sourceName);
      if (continueScanning && onUseAndContinue) await onUseAndContinue(file);
      else await onUse(file);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Der Scan konnte nicht erstellt werden.');
      setProcessing(false);
    }
  };

  const points = [
    corners.topLeft,
    corners.topRight,
    corners.bottomRight,
    corners.bottomLeft,
  ].map((point) => `${point.x * 1000},${point.y * 1000}`).join(' ');
  const qualityClass = quality?.level ?? (qualityStatus === 'error' ? 'check' : 'loading');
  const qualityHint = quality?.metrics.find((metric) => metric.status === 'poor')
    ?? quality?.metrics.find((metric) => metric.status === 'check')
    ?? quality?.metrics[0];
  const analysisTitle = !cornersValid
    ? 'Ecken ungültig'
    : analysisStatus === 'detected'
    ? 'Blatt sicher erkannt'
    : analysisStatus === 'manual'
      ? 'Ecken manuell gesetzt'
    : analysisStatus === 'fallback'
      ? 'Ecken bitte prüfen'
      : analysisStatus === 'loading' ? 'Blatterkennung läuft …' : 'Ecken manuell prüfen';

  return (
    <div className="scanEditorOverlay" role="dialog" aria-modal="true" aria-label="Dokumentscan bearbeiten">
      <div className="scanEditorTop">
        <button className="icon" type="button" onClick={onCancel} aria-label="Foto verwerfen">
          <X />
        </button>
        <div>
          <b>Scan bearbeiten</b>
          <small>{label} · Seite {pageCount} · bleibt lokal</small>
        </div>
      </div>

      <div ref={stageRef} className="scanEditorStage">
        <div
          ref={imageFrameRef}
          className={`scanEditorImageFrame${previewSize ? ' fitted' : ''}`}
          style={previewSize ? { width: `${previewSize.width}px`, height: `${previewSize.height}px` } : undefined}
        >
          <img
            src={sourceUrl}
            alt="Aufgenommenes Dokument mit erkannten Rändern"
            style={{ filter: previewFilter(filter) }}
            onLoad={(event) => setSourceSize({
              width: event.currentTarget.naturalWidth,
              height: event.currentTarget.naturalHeight,
            })}
          />
          <svg className="scanCornerPolygon" viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden="true">
            <polygon points={points} />
          </svg>
          {(Object.keys(corners) as CornerKey[]).map((key) => {
            const point = corners[key];
            return (
              <button
                key={key}
                className="scanCornerHandle"
                type="button"
                style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%` }}
                aria-label="Dokumentecke verschieben"
                onPointerDown={(event) => startCornerDrag(key, event)}
                onPointerMove={(event) => moveCorner(key, event)}
              />
            );
          })}
          {analysisStatus === 'loading' && (
            <div className="scanEdgeLoading">
              <LoaderCircle className="spin" />
              <span>Dokumentränder werden erkannt …</span>
            </div>
          )}
        </div>
      </div>

      <div className="scanEditorPanel">
        <div className="scanEditorStatus">
          <ScanSearch />
          <span>
            <b>{analysisTitle}</b>
            <small>{!cornersValid
              ? 'Ordne die Punkte im Uhrzeigersinn an: oben links, oben rechts, unten rechts, unten links.'
              : analysisMessage || (
              analysisStatus === 'loading'
                ? 'Das Foto wird nur lokal auf deinem Gerät geprüft.'
                : 'Ziehe die vier türkisen Punkte genau auf die Blattecken.'
            )}</small>
          </span>
        </div>

        <div className={`scanQualityCard ${qualityClass}`}>
          {qualityStatus === 'loading' || qualityStatus === 'idle'
            ? <LoaderCircle className="spin" />
            : quality?.level === 'good'
              ? <Check />
              : <AlertTriangle />}
          <span>
            <b>{qualityStatus === 'loading' || qualityStatus === 'idle'
              ? 'Scanqualität wird geprüft …'
              : quality?.title ?? 'Qualität bitte selbst prüfen'}</b>
            <small>{quality
              ? `${qualityHint?.message ?? 'Bitte Vorschau prüfen'} · ${quality.score}/100`
              : 'Die Prüfung läuft vollständig auf deinem Gerät.'}</small>
          </span>
          {quality && (
            <div className="scanQualityMetrics">
              {quality.metrics.map((metric) => (
                <em className={metric.status} key={metric.id}>
                  {metric.status === 'good' ? <Check /> : <AlertTriangle />}
                  {metric.label}
                </em>
              ))}
            </div>
          )}
        </div>

        <div className="scanFilterSection">
          <span><SlidersHorizontal /> Darstellung</span>
          <div className="scanFilterOptions" role="group" aria-label="Scanfilter wählen">
            {filters.map((item) => (
              <button
                key={item.id}
                type="button"
                className={filter === item.id ? 'active' : ''}
                onClick={() => setFilter(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {error && <p className="scanEditorError">{error}</p>}

        <div className="scanEditorActions">
          <button className="secondary" type="button" onClick={onRetake} disabled={processing}>
            <Camera /> Neu
          </button>
          {onUseAndContinue && (
            <button className="secondary scanNextAction" type="button" onClick={() => void useScan(true)} disabled={processing || analysisStatus === 'loading' || !cornersValid}>
              <Plus /> Weitere Seite
            </button>
          )}
          <button className="primary scanUseAction" type="button" onClick={() => void useScan()} disabled={processing || analysisStatus === 'loading' || !cornersValid}>
            {processing ? <LoaderCircle className="spin" /> : <Check />}
            {processing ? 'Wird optimiert …' : quality?.level === 'retry' ? 'Trotzdem verwenden' : 'Scan verwenden'}
          </button>
        </div>
      </div>
    </div>
  );
}
