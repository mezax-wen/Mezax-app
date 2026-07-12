import type { DocumentClassification, DocumentType } from '../ai/documentClassifier';
import type { RequiredDocument } from './folderPlan';

const documentSlots: Partial<Record<DocumentType, RequiredDocument>> = {
  Anschreiben: 'Anschreiben',
  Mieterselbstauskunft: 'Mieterselbstauskunft',
  Gehaltsabrechnung: 'Gehaltsnachweise',
  'SCHUFA-Auskunft': 'SCHUFA-Auskunft',
  Identitätsnachweis: 'Ausweiskopie',
};

export type DocumentAssignmentReview = {
  status: 'match' | 'mismatch' | 'uncertain';
  detectedSlot?: RequiredDocument;
  message: string;
};

export function slotForClassification(type: DocumentType) {
  return documentSlots[type];
}

export function reviewDocumentAssignment(
  expectedSlot: RequiredDocument | undefined,
  classification: DocumentClassification | undefined,
  minimumConfidence = 65,
): DocumentAssignmentReview {
  if (!expectedSlot || !classification || classification.confidence < minimumConfidence) {
    return {
      status: 'uncertain',
      message: 'Die Zuordnung konnte noch nicht sicher verglichen werden.',
    };
  }

  const detectedSlot = slotForClassification(classification.type);
  if (!detectedSlot) {
    return {
      status: 'uncertain',
      message: `${classification.type} ist keiner Pflichtkategorie eindeutig zugeordnet.`,
    };
  }

  if (detectedSlot !== expectedSlot) {
    return {
      status: 'mismatch',
      detectedSlot,
      message: `Unter „${expectedSlot}“ abgelegt, aber als „${classification.type}“ erkannt. Bitte prüfen.`,
    };
  }

  return {
    status: 'match',
    detectedSlot,
    message: `${classification.type} passt zur Kategorie „${expectedSlot}“.`,
  };
}
