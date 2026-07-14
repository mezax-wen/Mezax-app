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

        const now = Date.now();
        for (const [id, pdf] of generatedPdfs) {
          if (now - pdf.createdAt > 30 * 60 * 1000) generatedPdfs.delete(id);
        }
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), localPdfDownloads()],
});
