export const requiredDocumentOrder = [
  'Anschreiben',
  'Mieterselbstauskunft',
  'Gehaltsnachweise',
  'SCHUFA-Auskunft',
  'Ausweiskopie',
] as const;

export type RequiredDocument = typeof requiredDocumentOrder[number];

export function sortFolderDocuments<T extends { slot?: RequiredDocument; name: string }>(documents: T[]) {
  return [...documents].sort((left, right) => {
    const leftIndex = left.slot ? requiredDocumentOrder.indexOf(left.slot) : requiredDocumentOrder.length;
    const rightIndex = right.slot ? requiredDocumentOrder.indexOf(right.slot) : requiredDocumentOrder.length;
    return leftIndex - rightIndex || left.name.localeCompare(right.name, 'de');
  });
}

export function folderCompleteness(documents: Array<{ slot?: RequiredDocument }>) {
  const completed = new Set(documents.flatMap((document) => document.slot ? [document.slot] : [])).size;
  return {
    completed,
    total: requiredDocumentOrder.length,
    percent: Math.round((completed / requiredDocumentOrder.length) * 100),
  };
}

export function safeFolderFileName(title: string) {
  const safeTitle = title
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9äöüÄÖÜß_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return `Mezax-${safeTitle || 'Wohnungsbewerbung'}.pdf`;
}

export function rentalWatermark(address: string) {
  const normalizedAddress = address.trim().replace(/\s+/g, ' ');
  return normalizedAddress
    ? 'Nur f\u00fcr Wohnungsbewerbung \u2013 ' + normalizedAddress
    : 'Nur f\u00fcr diese Wohnungsbewerbung';
}
