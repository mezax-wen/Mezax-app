import { reviewDocumentAssignment, slotForClassification } from './documentAssignment';

const schufa = {
  type: 'SCHUFA-Auskunft' as const,
  confidence: 92,
  matchedKeywords: ['SCHUFA'],
  explanation: 'Test',
};

if (slotForClassification('Gehaltsabrechnung') !== 'Gehaltsnachweise') {
  throw new Error('Gehaltsabrechnung wurde nicht dem Gehaltsnachweis zugeordnet.');
}

if (reviewDocumentAssignment('SCHUFA-Auskunft', schufa).status !== 'match') {
  throw new Error('Passende SCHUFA-Zuordnung wurde nicht bestätigt.');
}

const mismatch = reviewDocumentAssignment('Gehaltsnachweise', schufa);
if (mismatch.status !== 'mismatch' || mismatch.detectedSlot !== 'SCHUFA-Auskunft' || !mismatch.message.includes('Bitte prüfen')) {
  throw new Error('Falsche Dokumentzuordnung wurde nicht mit korrigierbarem Ziel gewarnt.');
}

if (reviewDocumentAssignment('Gehaltsnachweise', { ...schufa, confidence: 42 }).status !== 'uncertain') {
  throw new Error('Unsichere Erkennung darf keine Falschzuordnung behaupten.');
}

console.info('Document Assignment: Zuordnungsprüfung erfolgreich getestet.');
