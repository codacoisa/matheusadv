import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';

const root = path.resolve(process.argv[2] || '_site');
const port = Number(process.argv[3] || 4173);
const mountPath = '/officejur';
const contentTypes = {
  '.b64': 'text/plain; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
};

function resolveRequestPath(requestUrl) {
  const pathname = decodeURIComponent(new URL(requestUrl, 'http://localhost').pathname);
  const unmounted = pathname === mountPath
    ? '/'
    : pathname.startsWith(`${mountPath}/`)
      ? pathname.slice(mountPath.length)
      : pathname;
  const relative = unmounted.endsWith('/') ? `${unmounted}index.html` : unmounted;
  const resolved = path.resolve(root, `.${relative}`);
  return resolved === root || resolved.startsWith(`${root}${path.sep}`) ? resolved : null;
}

const server = http.createServer(async (request, response) => {
  const file = resolveRequestPath(request.url || '/');
  if (!file) {
    response.writeHead(403).end('Forbidden');
    return;
  }

  try {
    const body = await fs.readFile(file);
    response.writeHead(200, {
      'Content-Type': contentTypes[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    response.end(request.method === 'HEAD' ? undefined : body);
  } catch (error) {
    const status = error?.code === 'ENOENT' || error?.code === 'EISDIR' ? 404 : 500;
    response.writeHead(status).end(status === 404 ? 'Not found' : 'Internal server error');
  }
});

server.listen(port, '127.0.0.1', () => {
  process.stdout.write(`OfficeJur disponível em http://127.0.0.1:${port}${mountPath}/\n`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
