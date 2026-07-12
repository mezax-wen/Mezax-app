import { folderCompleteness, safeFolderFileName, sortFolderDocuments } from './folderPlan';

const documents = [
  { name: 'ausweis.pdf', slot: 'Ausweiskopie' as const },
  { name: 'anschreiben.pdf', slot: 'Anschreiben' as const },
  { name: 'gehalt.pdf', slot: 'Gehaltsnachweise' as const },
];

const sorted = sortFolderDocuments(documents);
if (sorted[0].slot !== 'Anschreiben' || sorted[2].slot !== 'Ausweiskopie') {
  throw new Error('Dokumente werden nicht in der vorgesehenen Bewerbungsreihenfolge sortiert.');
}

const completeness = folderCompleteness(documents);
if (completeness.completed !== 3 || completeness.percent !== 60) {
  throw new Error('Vollständigkeit der Bewerbungsmappe ist fehlerhaft.');
}

if (safeFolderFileName('Wohnung / Berlin?') !== 'Mezax-Wohnung-Berlin.pdf') {
  throw new Error('Der Export-Dateiname wird nicht sicher erzeugt.');
}

console.info('Application Folder: Reihenfolge, Vollständigkeit und Dateiname erfolgreich geprüft.');
