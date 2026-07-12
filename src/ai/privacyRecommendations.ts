import type { DocumentType } from './documentClassifier';

export type PrivacyRecommendation = {
  action: 'redact' | 'review';
  level: 'high' | 'medium';
  title: string;
  reason: string;
  disclaimer: string;
};

const commonDisclaimer = 'Empfehlung für eine Wohnungsbewerbung – bitte vor dem Export selbst prüfen.';

const rentalRules: Record<string, Omit<PrivacyRecommendation, 'disclaimer'>> = {
  'Steuer-ID': {
    action: 'redact',
    level: 'high',
    title: 'Schwärzen empfohlen',
    reason: 'Die Steuer-ID ist für die Prüfung einer Wohnungsbewerbung normalerweise nicht erforderlich.',
  },
  Sozialversicherungsnummer: {
    action: 'redact',
    level: 'high',
    title: 'Schwärzen empfohlen',
    reason: 'Die Sozialversicherungsnummer ist kein üblicher Nachweis für Einkommen oder Bonität.',
  },
  Ausweisnummer: {
    action: 'redact',
    level: 'high',
    title: 'Schwärzen empfohlen',
    reason: 'Zur Identitätsprüfung genügt regelmäßig das Vorzeigen; eine sichtbare Dokumentnummer ist meist nicht nötig.',
  },
  'Maschinenlesbare Zone (MRZ)': {
    action: 'redact',
    level: 'high',
    title: 'Schwärzen empfohlen',
    reason: 'Die maschinenlesbare Zone enthält gebündelte Identitätsdaten und sollte bei einer Wohnungsbewerbung nicht sichtbar mitgesendet werden.',
  },
  IBAN: {
    action: 'redact',
    level: 'medium',
    title: 'Schwärzen empfohlen',
    reason: 'Für die Wohnungsbewerbung ist die IBAN meist nicht erforderlich und wird typischerweise erst später benötigt.',
  },
};

export function getRentalPrivacyRecommendation(
  detectionLabel: string,
  documentType: DocumentType = 'Sonstiges',
): PrivacyRecommendation {
  const rule = rentalRules[detectionLabel];
  if (rule) return { ...rule, disclaimer: commonDisclaimer };

  return {
    action: 'review',
    level: 'medium',
    title: 'Bitte selbst prüfen',
    reason: `Für „${detectionLabel}“ gibt es bei ${documentType} noch keine eindeutige Mezax-Regel.`,
    disclaimer: commonDisclaimer,
  };
}

export function calculateRentalPrivacyScore(
  detections: Array<{ label: string; selected: boolean }>,
) {
  if (!detections.length) return 100;

  const outstandingRisk = detections.reduce((risk, detection) => {
    const recommendation = getRentalPrivacyRecommendation(detection.label);
    if (recommendation.action !== 'redact' || detection.selected) return risk;
    return risk + (recommendation.level === 'high' ? 22 : 12);
  }, 0);

  return Math.max(0, 100 - outstandingRisk);
}
