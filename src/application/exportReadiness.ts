export type ExportScanState = {
  status?: string;
};

export function allDocumentsReadyForExport(
  documentIds: number[],
  scans: Record<number, ExportScanState | undefined>,
) {
  return documentIds.length > 0
    && documentIds.every((documentId) => scans[documentId]?.status === 'done');
}

