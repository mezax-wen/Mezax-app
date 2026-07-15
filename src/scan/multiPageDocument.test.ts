import { shouldBundleSelection, smartScanFileName } from './multiPageDocument.ts';

const fakeFiles = { length: 2 } as ArrayLike<File>;
if (!shouldBundleSelection('Ausweiskopie', fakeFiles)) throw new Error('Ausweis-Vorder- und Rückseite müssen gebündelt werden.');
if (!shouldBundleSelection('SCHUFA-Auskunft', fakeFiles)) throw new Error('Mehrseitige SCHUFA muss gebündelt werden.');
if (shouldBundleSelection('Gehaltsnachweise', fakeFiles)) throw new Error('Mehrere Gehaltsnachweise bleiben einzelne Dokumente.');
if (smartScanFileName('SCHUFA-Auskunft') !== 'SCHUFA-Auskunft-mehrseitig.pdf') throw new Error('Unerwarteter Smart-Scan-Dateiname.');

console.info('Smart Scan: Mehrseitige Unterlagen werden passend gebündelt.');
