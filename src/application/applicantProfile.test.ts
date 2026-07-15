import { emptyApplicantProfile, loadApplicantProfile, normalizeApplicantProfile, saveApplicantProfile } from './applicantProfile.ts';

const values = new Map<string, string>();
const storage = {
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => values.set(key, value),
};

const saved = saveApplicantProfile({
  name: '  Erika Testfrau  ',
  email: ' erika@example.test ',
  phone: ' +49 30 123456 ',
  currentAddress: ' Teststraße 12, 12345 Musterstadt ',
}, storage);

if (saved.name !== 'Erika Testfrau' || loadApplicantProfile(storage).currentAddress !== 'Teststraße 12, 12345 Musterstadt') {
  throw new Error('Bewerberprofil wurde nicht normalisiert und lokal gespeichert.');
}

values.set('mezax.applicant-profile.v1', '{ungültig');
if (JSON.stringify(loadApplicantProfile(storage)) !== JSON.stringify(emptyApplicantProfile)) {
  throw new Error('Ein beschädigtes Profil muss sicher auf leere Werte zurückfallen.');
}

if (normalizeApplicantProfile({ name: ' Denis ', email: undefined }).name !== 'Denis') {
  throw new Error('Teilweise Profildaten werden nicht robust normalisiert.');
}

console.log('Bewerberprofil: lokales Speichern, Normalisierung und Fehlerfall erfolgreich geprüft.');
