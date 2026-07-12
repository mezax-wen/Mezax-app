import { calculateRentalPrivacyScore, getRentalPrivacyRecommendation } from './privacyRecommendations';

for (const label of ['Steuer-ID', 'Sozialversicherungsnummer', 'Ausweisnummer', 'Maschinenlesbare Zone (MRZ)', 'IBAN']) {
  const recommendation = getRentalPrivacyRecommendation(label);
  if (recommendation.action !== 'redact' || !recommendation.reason) {
    throw new Error(`Fehlende Schwärzungsempfehlung für ${label}`);
  }
}

const unknown = getRentalPrivacyRecommendation('Unbekanntes Feld', 'Sonstiges');
if (unknown.action !== 'review') throw new Error('Unbekannte Felder müssen eine manuelle Prüfung verlangen.');

const protectedScore = calculateRentalPrivacyScore([{ label: 'Steuer-ID', selected: true }]);
const exposedScore = calculateRentalPrivacyScore([{ label: 'Steuer-ID', selected: false }]);
if (protectedScore !== 100 || exposedScore >= protectedScore) {
  throw new Error('Der Datenschutz-Score reagiert nicht korrekt auf eine offene Steuer-ID.');
}

console.info('Privacy Recommendations: Regeln und Score erfolgreich geprüft.');
