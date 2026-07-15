import { createPdfPagePlan } from './pdfPagePlan.ts';

const withCover = createPdfPagePlan([
  { id: 1, name: 'Anschreiben', pageCount: 1 },
  { id: 2, name: 'Gehaltsnachweise', pageCount: 3 },
], true);

if (withCover[0].pageLabel !== '2' || withCover[1].pageLabel !== '3\u20135') {
  throw new Error('Seitenzahlen mit Deckblatt sind fehlerhaft.');
}

const withoutCover = createPdfPagePlan([
  { id: 1, name: 'Anschreiben', pageCount: 1 },
  { id: 2, name: 'Gehaltsnachweise', pageCount: 3 },
], false);

if (withoutCover[0].pageLabel !== '1' || withoutCover[1].pageLabel !== '2\u20134') {
  throw new Error('Seitenzahlen ohne Deckblatt sind fehlerhaft.');
}

console.info('PDF-Seitenplan erfolgreich gepr\u00fcft.');
