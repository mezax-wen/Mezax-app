import { calculateRentalPrivacyScore, getRentalPrivacyRecommendation } from './privacyRecommendations.ts';

for (const label of ['Steuer-ID', 'Sozialversicherungsnummer', 'Ausweisnummer', 'Maschinenlesbare Zone (MRZ)', 'IBAN']) {
  const recommendation = getRentalPrivacyRecommendation(label);
  if (recommendation.action !== 'redact' || !recommendation.reason) {
    throw new Error(`Fehlende Schwärzungsempfehlung für ${label}`);
  }
}


const machineCode = getRentalPrivacyRecommendation('QR-Code / Barcode');
if (machineCode.action !== 'redact' || machineCode.level !== 'high') {
  throw new Error('QR-Codes und Barcodes muessen als sensible maschinenlesbare Daten behandelt werden.');
}

const signature = getRentalPrivacyRecommendation('Unterschrift');
if (signature.action !== 'review') {
  throw new Error('Unterschriften duerfen nicht ungefragt automatisch geschwaerzt werden.');
}
const unknown = getRentalPrivacyRecommendation('Unbekanntes Feld', 'Sonstiges');
if (unknown.action !== 'review') throw new Error('Unbekannte Felder müssen eine manuelle Prüfung verlangen.');

const protectedScore = calculateRentalPrivacyScore([{ label: 'Steuer-ID', selected: true }]);
const exposedScore = calculateRentalPrivacyScore([{ label: 'Steuer-ID', selected: false }]);
if (protectedScore !== 100 || exposedScore >= protectedScore) {
  throw new Error('Der Datenschutz-Score reagiert nicht korrekt auf eine offene Steuer-ID.');
}


const duplicateMrzScore = calculateRentalPrivacyScore([
  { label: 'Maschinenlesbare Zone (MRZ)', selected: false },
  { label: 'Maschinenlesbare Zone (MRZ)', selected: false },
]);
const singleMrzScore = calculateRentalPrivacyScore([
  { label: 'Maschinenlesbare Zone (MRZ)', selected: false },
]);
if (duplicateMrzScore !== singleMrzScore) {
  throw new Error('Mehrere MRZ-Zeilen duerfen den Datenschutz-Score nicht mehrfach belasten.');
}

console.info('Privacy Recommendations: Regeln und Score erfolgreich geprüft.');
