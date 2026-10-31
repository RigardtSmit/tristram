// Bundles the map into one HTML file with the data inlined, so it opens from file://.
// Usage: node tools/map/build.mjs [--data mock|live]   (live arrives in B2)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const mode = process.argv.includes('--data') ? process.argv[process.argv.indexOf('--data') + 1] : 'mock';
if (mode !== 'mock') {
  console.error('Only mock data is available in B1. Live data arrives in B2.');
  process.exit(1);
}

function parseStatus(text) {
  const out = {};
  for (const line of text.replace(/\r\n/g, '\n').split('\n')) {
    const m = line.match(/^([a-z_]+): (.*)$/);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

const mock = path.join(here, 'mock');
const queue = JSON.parse(fs.readFileSync(path.join(mock, 'queue.json'), 'utf8'));
const ideasDir = path.join(mock, 'ideas');
const ideas = fs.readdirSync(ideasDir).sort().map((d) => parseStatus(fs.readFileSync(path.join(ideasDir, d, 'status.md'), 'utf8')));
const metrics = fs.readFileSync(path.join(mock, 'metrics.mock.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));

const registry = {};
for (const f of fs.readdirSync(path.join(root, 'registry'))) {
  if (!f.endsWith('.yaml')) continue;
  const r = YAML.parse(fs.readFileSync(path.join(root, 'registry', f), 'utf8'));
  registry[f.replace('.yaml', '')] = { character: r.character, role: r.role, tools: r.tools, skills: r.skills ?? [], connectors: r.connectors ?? [] };
}

// Optional CEO sprite sheet: tools/map/local-assets/ceo.png plus ceo.json describing its frames.
// The folder is git-ignored, so third-party art you supply stays out of the repository.
let ceoSheet = null;
const localDir = path.join(here, 'local-assets');
if (fs.existsSync(path.join(localDir, 'ceo.png')) && fs.existsSync(path.join(localDir, 'ceo.json'))) {
  ceoSheet = JSON.parse(fs.readFileSync(path.join(localDir, 'ceo.json'), 'utf8'));
  const bytes = fs.readFileSync(path.join(localDir, 'ceo.png'));
  const mime = bytes.subarray(0, 4).toString('latin1') === 'GIF8' ? 'image/gif' : 'image/png';   // the saved file may be a GIF named .png
  ceoSheet.png = `data:${mime};base64,` + bytes.toString('base64');
  console.log('Using local CEO sprite sheet.');
}

const data = { source: 'mock', queue, ideas, metrics, registry, ceoSheet };
const order = ['core', 'world', 'props', 'chars', 'portals', 'fx', 'game', 'ui'];
const code = order.map((n) => fs.readFileSync(path.join(here, 'src', `${n}.js`), 'utf8')).join('\n');
const tpl = fs.readFileSync(path.join(here, 'src', 'template.html'), 'utf8');

// Use function replacers so "$" in the code is never read as a replacement pattern.
const html = tpl
  .replace('/*DATA*/', () => `window.FACTORY_DATA = ${JSON.stringify(data).replace(/</g, '\\u003c')};`)
  .replace('/*CODE*/', () => code);

const outDir = path.join(here, 'dist');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'map.html'), html);
console.log(`Wrote tools/map/dist/map.html (${(html.length / 1024).toFixed(0)} KB, ${mode} data)`);
