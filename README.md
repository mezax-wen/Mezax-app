# Mezax App v0.5

Mobile-first React prototype for a privacy-focused housing application workflow.

## New in v0.5

- Local image preview
- Automatic OCR for JPG/PNG images using Tesseract.js
- Beta detection for IBAN, German tax ID, German social-security number and labelled ID-document numbers
- Suggested redaction boxes directly on the image
- Select/deselect each suggestion
- Render and download an irreversibly flattened redacted PNG copy
- PDF preview remains available; automatic PDF OCR is planned for the next version

## Important limitations

This is a beta prototype, not a production security product. OCR can miss data or produce false positives. Always review every document visually. Use only sample documents while testing.

The document image is processed in the browser. On first use, OCR components and German language data are downloaded. A production release should self-host those components and undergo security and legal review.

## Start

```bash
npm.cmd install
npm.cmd run dev -- --host
```

Open the displayed Network URL on a phone connected to the same Wi-Fi.

## Next milestones

1. Render PDF pages locally and run OCR per page
2. Add manual correction as a safety net
3. Add watermark rendering
4. Merge redacted pages into a real PDF
5. Add document-type detection and housing-application rules
6. Security, accessibility and legal review


## Neu in v0.5

- Mehrseitige PDFs werden lokal im Browser gerendert.
- OCR und sensible Mustererkennung laufen auf dem gerenderten PDF.
- Treffer werden direkt auf den PDF-Seiten markiert.
- Gewählte Schwärzungen werden in eine neue, flach gerenderte PDF eingebrannt.
- Originaldateien werden nicht an einen Mezax-Server gesendet.

Hinweis: Die automatische Erkennung ist weiterhin Beta. Vor Versand muss jede Seite visuell kontrolliert werden.
