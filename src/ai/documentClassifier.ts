export type DocumentType =
  | 'Anschreiben'
  | 'Gehaltsabrechnung'
  | 'SCHUFA-Auskunft'
  | 'Mieterselbstauskunft'
  | 'Identitätsnachweis'
  | 'Arbeitsvertrag'
  | 'Kontoauszug'
  | 'Sonstiges';

export type DocumentClassification = {
  type: DocumentType;
  confidence: number;
  matchedKeywords: string[];
  explanation: string;
};

type ClassificationRule = {
  type: Exclude<DocumentType, 'Sonstiges'>;
  keywords: Array<{ label: string; pattern: RegExp; weight: number }>;
};

const rules: ClassificationRule[] = [
  {
    type: 'Anschreiben',
    keywords: [
      { label: 'Bewerbung um die Wohnung', pattern: /\bBEWERBUNG (?:UM|F[UÜ]R) (?:DIE )?WOHNUNG\b/, weight: 5 },
      { label: 'Sehr geehrte', pattern: /\bSEHR GEEHRTE\b/, weight: 2 },
      { label: 'Mietinteresse', pattern: /\bMIETINTERESSE\b/, weight: 2 },
      { label: 'Besichtigung', pattern: /\bBESICHTIGUNG\b/, weight: 1 },
    ],
  },
  {
    type: 'Gehaltsabrechnung',
    keywords: [
      { label: 'Gehalts-/Lohnabrechnung', pattern: /\b(?:GEHALTS|LOHN|ENTGELT)ABRECHNUNG\b/, weight: 4 },
      { label: 'Brutto', pattern: /\bBRUTTO(?:BEZUG|ENTGELT)?\b/, weight: 2 },
      { label: 'Netto', pattern: /\bNETTO(?:BEZUG|ENTGELT)?\b/, weight: 2 },
      { label: 'Lohnsteuer', pattern: /\bLOHNSTEUER\b/, weight: 2 },
      { label: 'Sozialversicherung', pattern: /\bSOZIALVERSICHERUNG\b/, weight: 1 },
    ],
  },
  {
    type: 'SCHUFA-Auskunft',
    keywords: [
      { label: 'SCHUFA', pattern: /\bSCHUFA\b/, weight: 5 },
      { label: 'Bonitätsauskunft', pattern: /\bBONIT[AÄ]TSAUSKUNFT\b/, weight: 3 },
      { label: 'Basisscore', pattern: /\bBASISSCORE\b/, weight: 2 },
      { label: 'Bonitätsinformationen', pattern: /\bBONIT[AÄ]TSINFORMATIONEN?\b/, weight: 2 },
    ],
  },
  {
    type: 'Mieterselbstauskunft',
    keywords: [
      { label: 'Mieterselbstauskunft', pattern: /\bMIETERSELBSTAUSKUNFT\b/, weight: 6 },
      { label: 'Mietinteressent', pattern: /\bMIETINTERESSENT(?:IN)?\b/, weight: 2 },
      { label: 'Einziehende Personen', pattern: /\bEINZIEHENDE PERSONEN\b/, weight: 2 },
      { label: 'Mietverhältnis', pattern: /\bMIETVERH[AÄ]LTNIS\b/, weight: 1 },
    ],
  },
  {
    type: 'Identitätsnachweis',
    keywords: [
      { label: 'Personalausweis', pattern: /\bPERS[O0]NAL\s*[- ]?\s*AUSWEIS\b/, weight: 5 },
      { label: 'Reisepass/Passport', pattern: /\b(?:REISEPASS|PASSPORT)\b/, weight: 5 },
      { label: 'Identity Card', pattern: /\bIDENTITY\s*CARD\b/, weight: 4 },
      { label: 'Dokumentennummer', pattern: /\b(?:DOKUMENT(?:EN)?|AUSWEIS)\s*(?:NUMMER|NR)\b|\bDOCUMENT\s*(?:NUMBER|NO)\b/, weight: 2 },
      { label: 'Bundesrepublik Deutschland', pattern: /\bBUNDESREPUBLIK\s+DEUTSCHLAND\b/, weight: 2 },
      { label: 'Staatsangehörigkeit', pattern: /\bSTAATSANGEH[OÖ]RIGKEIT\b|\bNATIONALITY\b/, weight: 1 },
      { label: 'Geburtsdatum', pattern: /\bGEBURTSDATUM\b|\bDATE\s+OF\s+BIRTH\b/, weight: 1 },
      { label: 'MRZ-Ausweiszeile', pattern: /\bI[D0]D\s*<+/, weight: 3 },
    ],
  },
  {
    type: 'Arbeitsvertrag',
    keywords: [
      { label: 'Arbeitsvertrag', pattern: /\bARBEITSVERTRAG\b/, weight: 6 },
      { label: 'Arbeitgeber', pattern: /\bARBEITGEBER\b/, weight: 2 },
      { label: 'Arbeitnehmer', pattern: /\bARBEITNEHMER(?:IN)?\b/, weight: 2 },
      { label: 'Probezeit', pattern: /\bPROBEZEIT\b/, weight: 1 },
      { label: 'Vergütung', pattern: /\bVERG[UÜ]TUNG\b/, weight: 1 },
    ],
  },
  {
    type: 'Kontoauszug',
    keywords: [
      { label: 'Kontoauszug', pattern: /\bKONTOAUSZUG\b/, weight: 6 },
      { label: 'Kontostand', pattern: /\bKONTOSTAND\b/, weight: 2 },
      { label: 'Buchungstag', pattern: /\bBUCHUNGSTAG\b/, weight: 2 },
      { label: 'Wertstellung', pattern: /\bWERTSTELLUNG\b/, weight: 2 },
      { label: 'IBAN', pattern: /\bIBAN\b/, weight: 1 },
    ],
  },
];

function normalize(text: string) {
  return text
    .toLocaleUpperCase('de-DE')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function classifyDocument(text: string): DocumentClassification {
  const normalized = normalize(text);
  if (!normalized) {
    return {
      type: 'Sonstiges',
      confidence: 0,
      matchedKeywords: [],
      explanation: 'Kein auswertbarer OCR-Text vorhanden.',
    };
  }

  const candidates = rules
    .map((rule) => {
      const matches = rule.keywords.filter((keyword) => keyword.pattern.test(normalized));
      return { rule, matches, score: matches.reduce((sum, keyword) => sum + keyword.weight, 0) };
    })
    .sort((a, b) => b.score - a.score);

  const best = candidates[0];
  if (!best || best.score < 3) {
    return {
      type: 'Sonstiges',
      confidence: Math.min(35, Math.round((best?.score ?? 0) * 10)),
      matchedKeywords: best?.matches.map((match) => match.label) ?? [],
      explanation: 'Die gefundenen Begriffe reichen für eine zuverlässige Zuordnung nicht aus.',
    };
  }

  const runnerUp = candidates[1]?.score ?? 0;
  const matchedKeywords = best.matches.map((match) => match.label);
  const confidence = Math.min(
    98,
    Math.round(45 + best.score * 5 + best.matches.length * 3 + Math.max(0, best.score - runnerUp) * 2),
  );

  return {
    type: best.rule.type,
    confidence,
    matchedKeywords,
    explanation: `Erkannt anhand von: ${matchedKeywords.join(', ')}.`,
  };
}
