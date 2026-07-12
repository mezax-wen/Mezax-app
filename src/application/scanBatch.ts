export type BatchScanState = {
  status?: 'idle' | 'loading' | 'done' | 'error';
  progress?: number;
};

export function pendingDocumentIds(
  documentIds: number[],
  scans: Record<number, BatchScanState>,
) {
  return documentIds.filter((id) => scans[id]?.status !== 'done');
}

export function batchScanProgress(
  documentIds: number[],
  scans: Record<number, BatchScanState>,
) {
  if (!documentIds.length) return { completed: 0, total: 0, percent: 0 };

  const completed = documentIds.filter((id) => scans[id]?.status === 'done').length;
  const progress = documentIds.reduce((sum, id) => {
    const scan = scans[id];
    if (scan?.status === 'done') return sum + 1;
    return sum + Math.max(0, Math.min(1, scan?.progress ?? 0));
  }, 0);

  return {
    completed,
    total: documentIds.length,
    percent: Math.round((progress / documentIds.length) * 100),
  };
}
