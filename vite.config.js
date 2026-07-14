import { randomUUID } from 'node:crypto';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const generatedPdfs = new Map();
const MAX_PDF_BYTES = 100 * 1024 * 1024;

function localPdfDownloads() {
  return {
    name: 'mezax-local-pdf-downloads',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const url = new URL(request.url ?? '/', 'http://localhost');

        if (request.method === 'POST' && url.pathname === '/__mezax-pdf') {
          const chunks = [];
          let size = 0;

          request.on('data', (chunk) => {
            size += chunk.length;
            if (size > MAX_PDF_BYTES) request.destroy();
            else chunks.push(chunk);
          });
          request.on('end', () => {
            if (!size || size > MAX_PDF_BYTES) {
              response.statusCode = 413;
              response.end('PDF ist zu groß.');
              return;
            }

            const id = randomUUID();
            const requestedName = url.searchParams.get('name') || 'Mezax-Bewerbungsmappe.pdf';
            const name = requestedName.replace(/[\\/:*?"<>|\r\n]+/g, '-').slice(0, 120);
            generatedPdfs.set(id, { buffer: Buffer.concat(chunks), name, createdAt: Date.now() });
            response.setHeader('Content-Type', 'application/json; charset=utf-8');
            response.end(JSON.stringify({ url: `/__mezax-pdf/${id}` }));
          });
          return;
        }

        const match = url.pathname.match(/^\/__mezax-pdf\/([0-9a-f-]+)$/i);
        if ((request.method === 'GET' || request.method === 'HEAD') && match) {
          const pdf = generatedPdfs.get(match[1]);
          if (!pdf) {
            response.statusCode = 404;
            response.end('PDF nicht mehr verfügbar. Bitte erneut exportieren.');
            return;
          }

          response.setHeader('Content-Type', 'application/pdf');
          response.setHeader('Content-Length', String(pdf.buffer.length));
          response.setHeader('Cache-Control', 'no-store');
          const disposition = url.searchParams.get('view') === '1' ? 'inline' : 'attachment';
          response.setHeader('X-Content-Type-Options', 'nosniff');
          response.setHeader('Content-Disposition', `${disposition}; filename*=UTF-8''${encodeURIComponent(pdf.name)}`);
          if (request.method === 'HEAD') response.end();
          else response.end(pdf.buffer);
          return;
        }

        const saveMatch = url.pathname.match(/^\/__mezax-save\/([0-9a-f-]+)$/i);
        if (request.method === 'GET' && saveMatch) {
          const pdf = generatedPdfs.get(saveMatch[1]);
          if (!pdf) {
            response.statusCode = 404;
            response.end('PDF nicht mehr verfügbar. Bitte erneut exportieren.');
            return;
          }

          response.setHeader('Content-Type', 'text/html; charset=utf-8');
          response.setHeader('Cache-Control', 'no-store');
          response.end(
            '<!doctype html><html lang="de"><head><meta charset="utf-8">' +
            '<meta name="viewport" content="width=device-width,initial-scale=1">' +
            '<title>Mezax PDF speichern</title></head><body><main>' +
            '<h1>PDF ist bereit</h1><p>Deine Bewerbungsmappe wurde lokal vorbereitet.</p>' +
            '<a href="/__mezax-pdf/' + saveMatch[1] + '?download=1">PDF herunterladen</a>' +
            '<small>Die Datei wird nur lokal von deinem Mezax-Testserver bereitgestellt.</small>' +
            '</main><style>body{margin:0;background:#edf4f5;color:#102236;font-family:Inter,system-ui,sans-serif}' +
            'main{width:min(520px,calc(100% - 32px));margin:12vh auto;background:#fff;border:1px solid #cfe1e3;' +
            'border-radius:20px;padding:28px;box-sizing:border-box;box-shadow:0 20px 50px #0b27331c}' +
            'h1{margin:0 0 8px}p{color:#607382}' +
            'a{display:flex;min-height:54px;align-items:center;justify-content:center;margin:24px 0 14px;' +
            'border-radius:13px;background:#0fab78;color:#fff;text-decoration:none;font-weight:800}' +
            'small{display:block;color:#71838f;line-height:1.5}</style></body></html>',
          );
          return;
        }
        const now = Date.now();
        for (const [id, pdf] of generatedPdfs) {
          if (now - pdf.createdAt > 30 * 60 * 1000) generatedPdfs.delete(id);
        }
        next();
      });
    },
  };
}

export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/Mezax-app/' : '/',
  plugins: [react(), localPdfDownloads()],
}));
