import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('.', import.meta.url));
const port = Number(process.env.PORT || 4173);
const publicFiles = new Set(['index.html', 'styles.css', 'app.js', 'domain.js', 'storage.js', 'favicon.svg']);
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml' };
const server = http.createServer(async (req, res) => {
  if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); res.end(); return; }
  let filename;
  try { filename = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).replace(/^\//, '') || 'index.html'; }
  catch { res.writeHead(400); res.end('Solicitud inválida'); return; }
  if (!publicFiles.has(filename)) { res.writeHead(404); res.end('No encontrado'); return; }
  try {
    const body = await readFile(path.join(root, filename));
    res.writeHead(200, {
      'Content-Type': `${types[path.extname(filename)]}; charset=utf-8`,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'self'",
    });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch { res.writeHead(500); res.end('No se pudo leer el archivo'); }
});
server.on('error', error => { console.error(`No se pudo iniciar el servidor: ${error.message}`); process.exitCode = 1; });
server.listen(port, '127.0.0.1', () => console.log(`ReservaFácil listo en http://localhost:${port}`));
