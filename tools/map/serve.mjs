// Serves the live village map on this machine only (SPEC 19.2). Usage: node tools/map/serve.mjs [--port 4173]
//   GET  /            the map page; it polls /api/data every few seconds, so a changed status.md shows on the next poll
//   GET  /api/data    the live data (every status.md, the CEO queue, metrics)
//   POST /api/decide  { id, option, note } carries out the CEO's choice with `queue.mjs decide`; only same-origin requests
// Bound to 127.0.0.1, so nothing outside this machine can decide anything.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { liveData } from '../lib/mapdata.mjs';
import { buildPage } from './build.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');

export function createServer({ root: r = root } = {}) {
  return http.createServer((req, res) => {
    const send = (code, body, type = 'application/json') => { res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store' }); res.end(typeof body === 'string' ? body : JSON.stringify(body)); };
    try {
      if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) return send(200, buildPage(liveData(r)), 'text/html; charset=utf-8');
      if (req.method === 'GET' && req.url === '/api/data') return send(200, liveData(r));
      if (req.method === 'POST' && req.url === '/api/decide') {
        const origin = req.headers.origin;
        if (origin && new URL(origin).host !== req.headers.host) return send(403, { error: 'cross-origin request refused' });
        let body = '';
        req.on('data', (c) => { body += c; if (body.length > 10000) req.destroy(); });
        req.on('end', () => {
          try {
            const { id, option, note } = JSON.parse(body || '{}');
            if (!/^CQ-[\d-]+$/.test(String(id)) || !/^[a-z_:\-]+$/.test(String(option))) return send(400, { error: 'bad id or option' });
            const args = ['--no-warnings', path.join(r, 'tools', 'queue.mjs'), 'decide', id, option, ...(note ? ['--note', String(note).slice(0, 500)] : [])];
            const out = spawnSync(process.execPath, args, { encoding: 'utf8', cwd: r });
            send(out.status === 0 ? 200 : 422, { ok: out.status === 0, message: (out.stdout || out.stderr).trim() });
          } catch (err) { send(400, { error: err.message }); }
        });
        return undefined;
      }
      return send(404, { error: 'not found' });
    } catch (err) { return send(500, { error: err.message }); }
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const i = process.argv.indexOf('--port'), port = i === -1 ? 4173 : Number(process.argv[i + 1]);
  createServer().listen(port, '127.0.0.1', () => console.log(`The village is open at http://127.0.0.1:${port}/ (Ctrl+C to close)`));
}
