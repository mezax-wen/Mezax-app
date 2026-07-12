import { findValidIbans, isValidIban, shouldDetectGermanTaxId, shouldDetectSocialSecurityNumber } from './sensitiveValidators';

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

console.info('Sensitive Detection: IBAN-Prüfziffer und Kontextregeln erfolgreich geprüft.');
