import { summarizeApplicationDraft, type ApplicationDraft } from './draftStorage.ts';

const draft: ApplicationDraft = {
  id: 'test-draft',
  title: 'Testwohnung',
  address: 'Teststraße 12',
  watermark: '',
  watermarkCustomized: false,
  includeCover: true,
  showApplicantPhoto: false,
  showRentalAddress: true,
  showMezaxNotice: true,
  applicantName: '',
  applicantEmail: '',
  applicantPhone: '',
  applicantCurrentAddress: '',
  applicantPhoto: null,
  updatedAt: 1,
  documents: [
    { id: 1, name: 'anschreiben.pdf', size: 1, type: 'application/pdf', slot: 'Anschreiben', file: new Blob() },
    { id: 2, name: 'gehalt.pdf', size: 1, type: 'application/pdf', slot: 'Gehaltsnachweise', file: new Blob() },
  ],
};

const summary = summarizeApplicationDraft(draft);

if (summary.documentCount !== 2 || summary.completedCategories !== 2 || summary.totalCategories !== 5) {
  throw new Error('Die gespeicherten Dokumentkategorien werden nicht korrekt zusammengefasst.');
}

if (summary.completenessPercent !== 40) {
  throw new Error('Der Vollständigkeitswert einer gespeicherten Mappe ist fehlerhaft.');
}

if (summary.missingCategories.join(',') !== 'Mieterselbstauskunft,SCHUFA-Auskunft,Ausweiskopie') {
  throw new Error('Fehlende Kategorien einer gespeicherten Mappe werden nicht korrekt ausgewiesen.');
}

console.info('Gespeicherte Mappe: Status und fehlende Kategorien erfolgreich geprüft.');