import { allDocumentsReadyForExport } from './exportReadiness.ts';

if (allDocumentsReadyForExport([], {})) {
  throw new Error('Eine leere Mappe darf nicht exportbereit sein.');
}

if (allDocumentsReadyForExport([1, 2], { 1: { status: 'done' }, 2: { status: 'loading' } })) {
  throw new Error('Eine teilweise geprüfte Mappe darf nicht exportbereit sein.');
}

if (!allDocumentsReadyForExport([1, 2], { 1: { status: 'done' }, 2: { status: 'done' } })) {
  throw new Error('Eine vollständig geprüfte Mappe muss exportbereit sein.');
}

console.info('PDF-Export: Vollständige Dokumentprüfung erfolgreich abgesichert.');
