// /roster --html (SPEC A13): a single page generated from the live configuration, so it cannot drift from the registry.
import fs from 'node:fs';
import path from 'node:path';
import { CHARACTERS, loadRegistry, loadAgent, toolList } from './registry.mjs';
import { repoRoot, nowIso } from './paths.mjs';
import { listIdeas } from './idea.mjs';
import { readMetrics } from './metrics.mjs';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function rosterData(root = repoRoot) {
  const reg = loadRegistry(root), recs = listIdeas(root).flatMap(readMetrics);
  return CHARACTERS.map((n) => {
    const r = reg[n], a = loadAgent(n, root), mine = recs.filter((x) => x.agent === n);
    return {
      name: n, character: r?.character ?? n, role: r?.role ?? 'MISSING', model: a?.front?.model ?? null, maxTurns: a?.front?.maxTurns ?? null,
      tools: toolList(r?.tools), skills: (r?.skills ?? []).map((s) => s.name ?? s), connectors: (r?.connectors ?? []).map((c) => `${c.name} (${c.access})`),
      reads: r?.knowledge_base?.read ?? [], writes: r?.knowledge_base?.write ?? [], checks: r?.checks_owned ?? [], lessonTags: r?.lessons_tags ?? [],
      invocations: mine.length, tokens: mine.reduce((s, x) => s + (x.tokens_in || 0) + (x.tokens_out || 0), 0),
    };
  });
}

export function rosterHtml(root = repoRoot) {
  const data = rosterData(root);
  const list = (items) => (items.length ? `<ul>${items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>` : '<p class="none">none</p>');
  const cards = data.map((c) => `<section class="card" id="${c.name}">
  <h2>${esc(c.character)} <span>${esc(c.role)}</span></h2>
  <p class="meta">Model <b>${esc(c.model ?? '?')}</b> · max turns <b>${esc(c.maxTurns ?? '?')}</b> · ${c.invocations} invocation(s), ${c.tokens.toLocaleString('en-US')} tokens</p>
  <h3>Tools</h3><p>${c.tools.map((t) => `<code>${esc(t)}</code>`).join(' ')}</p>
  <h3>Reads</h3>${list(c.reads)}<h3>Writes</h3>${list(c.writes)}
  <h3>Checks owned</h3>${list(c.checks)}<h3>Lesson tags</h3><p>${c.lessonTags.map((t) => `<code>${esc(t)}</code>`).join(' ') || '<span class="none">none</span>'}</p>
</section>`).join('\n');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Tristram roster</title>
<style>
:root{--bg:#1b1713;--card:#2a231c;--ink:#e8dcc4;--dim:#a8977a;--accent:#d4a24c;--line:#4a3d2e}
@media (prefers-color-scheme: light){:root{--bg:#f4ecda;--card:#fffaf0;--ink:#2a2118;--dim:#6b5a42;--accent:#8a5a14;--line:#d8c9a8}}
body{margin:0;padding:24px 16px;background:var(--bg);color:var(--ink);font:15px/1.5 Georgia,serif}
h1{margin:0 0 4px}.sub{color:var(--dim);margin:0 0 20px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:16px}
.card{background:var(--card);border:1px solid var(--line);border-radius:6px;padding:14px 16px}
h2{margin:0;font-size:20px;color:var(--accent)}h2 span{font-size:13px;color:var(--dim);font-weight:normal;margin-left:6px}
h3{margin:12px 0 2px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--dim)}
ul{margin:0;padding-left:18px}li{font-size:13px;word-break:break-all}.meta{color:var(--dim);font-size:13px}.none{color:var(--dim)}
code{background:var(--bg);padding:1px 6px;border-radius:3px;font-size:13px}
</style></head><body>
<h1>Tristram roster</h1><p class="sub">Generated ${esc(nowIso())} from registry/*.yaml and .claude/agents/*.md. Do not edit.</p>
<div class="grid">
${cards}
</div>
<script type="application/json" id="roster-data">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>
</body></html>
`;
}

export function writeRoster(root = repoRoot) {
  const out = path.join(root, 'knowledge', 'roster', 'roster.html');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, rosterHtml(root));
  return out;
}
