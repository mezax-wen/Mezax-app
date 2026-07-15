import { batchScanProgress, pendingDocumentIds } from './scanBatch.ts';

const ids = [1, 2, 3];
const scans = {
  1: { status: 'done' as const, progress: 1 },
  2: { status: 'loading' as const, progress: 0.5 },
  3: { status: 'idle' as const, progress: 0 },
};

const progress = batchScanProgress(ids, scans);
if (progress.completed !== 1 || progress.total !== 3 || progress.percent !== 50) {
  throw new Error(`Unerwarteter Stapel-Fortschritt: ${JSON.stringify(progress)}`);
}

const pending = pendingDocumentIds(ids, scans);
if (pending.join(',') !== '2,3') throw new Error(`Falsche Scan-Warteschlange: ${pending.join(',')}`);

console.info('Batch Scan: Warteschlange und Gesamtfortschritt erfolgreich geprüft.');
