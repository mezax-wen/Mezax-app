import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Camera, Check, LoaderCircle, ScanSearch, SlidersHorizontal, X } from 'lucide-react';
import {
  analyzeDocumentCorners,
  createScannedDocumentFile,
  previewFilter,
  type DocumentCorners,
  type ScanFilter,
} from './documentPerspective';

type CornerKey = keyof DocumentCorners;

type DocumentScanEditorProps = {
  sourceUrl: string;
  sourceName: string;
  label: string;
  onCancel: () => void;
  onRetake: () => void;
  onUse: (file: File) => Promise<void> | void;
};

const defaultCorners: DocumentCorners = {
  topLeft: { x: 0.04, y: 0.04 },
  topRight: { x: 0.96, y: 0.04 },
  bottomRight: { x: 0.96, y: 0.96 },
  bottomLeft: { x: 0.04, y: 0.96 },
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
  onCancel,
  onRetake,
  onUse,
}: DocumentScanEditorProps) {
  const [corners, setCorners] = useState<DocumentCorners>(defaultCorners);
  const [filter, setFilter] = useState<ScanFilter>('color');
  const [analysisStatus, setAnalysisStatus] = useState<'loading' | 'done' | 'error'>('loading');
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const imageFrameRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let active = true;
    setAnalysisStatus('loading');
    setError('');
    analyzeDocumentCorners(sourceUrl)
      .then((result) => {
        if (!active) return;
        setCorners(result.corners);
        setAnalysisStatus('done');
      })
      .catch((reason) => {
        if (!active) return;
        setCorners(defaultCorners);
        setAnalysisStatus('error');
        setError(reason instanceof Error ? reason.message : 'Dokumentränder konnten nicht erkannt werden.');
      });
    return () => {
      active = false;
    };
  }, [sourceUrl]);

  const updateCorner = (key: CornerKey, event: ReactPointerEvent<HTMLButtonElement>) => {
    const rect = imageFrameRef.current?.getBoundingClientRect();
    if (!rect?.width || !rect.height) return;
    const point = {
      x: Math.min(0.995, Math.max(0.005, (event.clientX - rect.left) / rect.width)),
      y: Math.min(0.995, Math.max(0.005, (event.clientY - rect.top) / rect.height)),
    };
    setCorners((current) => ({ ...current, [key]: point }));
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

  const useScan = async () => {
    if (processing) return;
    setProcessing(true);
    setError('');
    try {
      const file = await createScannedDocumentFile(sourceUrl, corners, filter, sourceName);
      await onUse(file);
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

  return (
    <div className="scanEditorOverlay" role="dialog" aria-modal="true" aria-label="Dokumentscan bearbeiten">
      <div className="scanEditorTop">
        <button className="icon" type="button" onClick={onCancel} aria-label="Foto verwerfen">
          <X />
        </button>
        <div>
          <b>Scan bearbeiten</b>
          <small>{label} · bleibt lokal</small>
        </div>
      </div>

      <div className="scanEditorStage">
        <div ref={imageFrameRef} className="scanEditorImageFrame">
          <img
            src={sourceUrl}
            alt="Aufgenommenes Dokument mit erkannten Rändern"
            style={{ filter: previewFilter(filter) }}
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
            <b>{analysisStatus === 'done' ? 'Dokumentränder erkannt' : 'Ecken prüfen'}</b>
            <small>Ziehe die vier türkisen Punkte genau auf die Blattecken.</small>
          </span>
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
          <button className="primary" type="button" onClick={() => void useScan()} disabled={processing || analysisStatus === 'loading'}>
            {processing ? <LoaderCircle className="spin" /> : <Check />}
            {processing ? 'Wird optimiert …' : 'Scan verwenden'}
          </button>
        </div>
      </div>
    </div>
  );
}
