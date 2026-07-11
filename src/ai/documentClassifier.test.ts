import { classifyDocument } from './documentClassifier';

const cases = [
  ['Gehaltsabrechnung', 'Gehaltsabrechnung Januar Brutto Netto Lohnsteuer Sozialversicherung'],
  ['SCHUFA-Auskunft', 'SCHUFA BonitätsAuskunft Basisscore Bonitätsinformationen'],
  ['Mieterselbstauskunft', 'Mieterselbstauskunft Mietinteressent einziehende Personen Mietverhältnis'],
  ['Identitätsnachweis', 'PERSONALAUSWEIS Dokumentennummer Staatsangehörigkeit'],
  ['Arbeitsvertrag', 'Arbeitsvertrag zwischen Arbeitgeber und Arbeitnehmer Vergütung Probezeit'],
  ['Kontoauszug', 'Kontoauszug Kontostand Buchungstag Wertstellung IBAN'],
  ['Sonstiges', 'Dies ist ein freundliches Anschreiben für eine Wohnung.'],
] as const;

for (const [expected, text] of cases) {
  const result = classifyDocument(text);
  if (result.type !== expected) {
    throw new Error(`Erwartet ${expected}, erhalten ${result.type}: ${result.explanation}`);
  }
}

console.info(`Document AI: ${cases.length} Klassifikationsfälle erfolgreich.`);
