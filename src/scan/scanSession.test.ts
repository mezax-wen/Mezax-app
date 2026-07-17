import { moveScanPage, removeScanPage } from './scanSession.ts';

const pages = [
  { id: 'a', name: 'Seite 1' },
  { id: 'b', name: 'Seite 2' },
  { id: 'c', name: 'Seite 3' },
];

const moved = moveScanPage(pages, 2, -1);
if (moved.map((page) => page.id).join(',') !== 'a,c,b') {
  throw new Error('Eine Scan-Seite wurde nicht korrekt nach vorne verschoben.');
}
if (pages.map((page) => page.id).join(',') !== 'a,b,c') {
  throw new Error('Die ursprüngliche Seitenfolge darf nicht verändert werden.');
}
if (moveScanPage(pages, 0, -1).map((page) => page.id).join(',') !== 'a,b,c') {
  throw new Error('Die erste Seite darf nicht aus der Liste hinaus verschoben werden.');
}
if (removeScanPage(pages, 'b').map((page) => page.id).join(',') !== 'a,c') {
  throw new Error('Eine Scan-Seite wurde nicht korrekt entfernt.');
}

console.info('Mehrseiten-Scan: Reihenfolge und Löschen funktionieren.');
