import { findIdentityDocumentNumber, findLabeledIdentityDocumentNumber, findValidIbans, isMachineReadableZoneLine, isValidIban, shouldDetectGermanTaxId, shouldDetectSocialSecurityNumber } from './sensitiveValidators';

if (!isValidIban('DE89 3704 0044 0532 0130 00')) throw new Error('Gültige Test-IBAN wurde abgelehnt.');
if (isValidIban('DE89 3704 0044 0532 0130 01')) throw new Error('IBAN mit falscher Prüfziffer wurde akzeptiert.');
const extracted = findValidIbans('IBANDE89370400440532013000BICCOBADEFFXXX');
if (extracted.length !== 1 || extracted[0].value !== 'DE89370400440532013000') throw new Error(`IBAN neben BIC wurde falsch extrahiert: ${JSON.stringify(extracted)}`);

if (!shouldDetectGermanTaxId('STEUERID12345678901', '12345678901')) {
  throw new Error('Steuer-ID mit eindeutigem Kontext wurde nicht erkannt.');
}
if (shouldDetectGermanTaxId('RECHNUNGSNUMMER12345678901', '12345678901')) {
  throw new Error('Harmlose 11-stellige Rechnungsnummer wurde als Steuer-ID akzeptiert.');
}

if (!shouldDetectSocialSecurityNumber('SOZIALVERSICHERUNG120390A123', '12039012A123')) {
  throw new Error('Sozialversicherungsnummer mit Kontext wurde nicht erkannt.');
}
if (shouldDetectSocialSecurityNumber('KUNDENNUMMER12039012A123', '12039012A123')) {
  throw new Error('Alphanumerische Kundennummer wurde als Sozialversicherungsnummer akzeptiert.');
}

const documentNumber = findIdentityDocumentNumber('DOKUMENTNRL01X00T471');
if (documentNumber?.value !== 'L01X00T471') throw new Error('Dokument Nr. wurde nicht erkannt.');
if (findIdentityDocumentNumber('REFERENZNUMMER12345678901')) throw new Error('Referenznummer wurde als Ausweisnummer erkannt.');

const positionedDocumentNumber = findLabeledIdentityDocumentNumber([
  { normalized: 'DOKUMENTNUMMER', left: 100, top: 100, width: 80, height: 12 },
  { normalized: 'L01X00T47', left: 100, top: 118, width: 70, height: 12 },
]);
if (positionedDocumentNumber?.normalized !== 'L01X00T47') throw new Error('Positionierte Dokumentnummer wurde nicht erkannt.');
if (findLabeledIdentityDocumentNumber([
  { normalized: 'DOKUMENTNUMMER', left: 100, top: 100, width: 80, height: 12 },
  { normalized: 'L01X00T47', left: 500, top: 400, width: 70, height: 12 },
])) throw new Error('Entfernte Nummer wurde falsch zugeordnet.');

if (!isMachineReadableZoneLine('IDD<<L01X00T471<<<<<<<<<<<<<<<')) throw new Error('Deutsche MRZ-Zeile wurde nicht erkannt.');
if (!isMachineReadableZoneLine('9001010F3001010D<<<<<<<<<<<<<<<')) throw new Error('MRZ-Datenzeile wurde nicht erkannt.');
if (isMachineReadableZoneLine('IBAN DE89 3704 0044 0532 0130 00')) throw new Error('IBAN wurde als MRZ-Zeile erkannt.');

console.info('Sensitive Detection: IBAN, Kontextregeln, Ausweisnummer und MRZ erfolgreich geprüft.');
