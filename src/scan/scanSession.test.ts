import { moveScanPage, removeScanPage, replaceScanPage } from './scanSession.ts';

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

const replaced = replaceScanPage(pages, 'b', { id: 'b', name: 'Neue Seite 2' });
if (replaced.map((page) => page.name).join(',') !== 'Seite 1,Neue Seite 2,Seite 3') {
  throw new Error('Eine Scan-Seite wurde nicht an ihrer bisherigen Position ersetzt.');
}
if (pages[1].name !== 'Seite 2') {
  throw new Error('Beim Ersetzen darf die urspruengliche Seitenliste nicht veraendert werden.');
}

console.info('Mehrseiten-Scan: Reihenfolge und Löschen funktionieren.');
