import { assignAndSortFolderDocument, folderCompleteness, rentalWatermark, safeFolderFileName, sortFolderDocuments } from './folderPlan.ts';

const documents = [
  { name: 'ausweis.pdf', slot: 'Ausweiskopie' as const },
  { name: 'anschreiben.pdf', slot: 'Anschreiben' as const },
  { name: 'gehalt.pdf', slot: 'Gehaltsnachweise' as const },
];

const sorted = sortFolderDocuments(documents);
if (sorted[0].slot !== 'Anschreiben' || sorted[2].slot !== 'Ausweiskopie') {
  throw new Error('Dokumente werden nicht in der vorgesehenen Bewerbungsreihenfolge sortiert.');
}

const automaticallySorted = assignAndSortFolderDocument([
  { id: 1, name: 'unbekannt.pdf', slot: 'Ausweiskopie' as const },
  { id: 2, name: 'gehalt.pdf', slot: 'Gehaltsnachweise' as const },
], 1, 'Anschreiben');
if (automaticallySorted[0].id !== 1 || automaticallySorted[0].slot !== 'Anschreiben') {
  throw new Error('Sicher erkannte Dokumente werden nicht neu zugeordnet und einsortiert.');
}

const completeness = folderCompleteness(documents);
if (completeness.completed !== 3 || completeness.percent !== 60) {
  throw new Error('Vollständigkeit der Bewerbungsmappe ist fehlerhaft.');
}
if (completeness.missing.join(',') !== 'Mieterselbstauskunft,SCHUFA-Auskunft') {
  throw new Error('Fehlende Dokumentarten werden nicht korrekt ermittelt.');
}

if (safeFolderFileName('Wohnung / Berlin?') !== 'Mezax-Wohnung-Berlin.pdf') {
  throw new Error('Der Export-Dateiname wird nicht sicher erzeugt.');
}


if (rentalWatermark('  Teststra\u00dfe 12, 12345 Berlin  ') !== 'Nur f\u00fcr Wohnungsbewerbung \u2013 Teststra\u00dfe 12, 12345 Berlin') {
  throw new Error('Das adressbezogene Wasserzeichen wurde nicht korrekt erstellt.');
}
if (rentalWatermark('   ') !== 'Nur f\u00fcr diese Wohnungsbewerbung') {
  throw new Error('Das Wasserzeichen ohne Adresse ist nicht korrekt.');
}

console.info('Application Folder: Reihenfolge, Vollständigkeit und Dateiname erfolgreich geprüft.');
