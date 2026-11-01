// The metrics dashboard (SPEC 18.4, 18.5): one generated page, regenerated after each invocation, plus the same figures as text.
import fs from 'node:fs';
import path from 'node:path';
import { repoRoot } from './paths.mjs';
import { rollup } from './rollup.mjs';

const fmtTime = (s) => (s < 90 ? `${Math.round(s)} s` : s < 5400 ? `${Math.round(s / 60)} min` : `${(s / 3600).toFixed(1)} h`);
const n = (v) => Number(v).toLocaleString('en-US');

export function metricsText(root = repoRoot, { idea, agent, cycle } = {}) {
  const r = rollup(root), out = [];
  const ideas = r.ideas.filter((i) => !idea || i.name === idea);
  if (idea && !ideas.length) throw new Error(`no idea named "${idea}"`);
  if (!idea) {
    out.push(`Factory: ${r.factory.items} item(s), ${n(r.factory.tokens)} tokens, ${r.factory.invocations} invocation(s), ${fmtTime(r.factory.seconds)} of agent time`);
    out.push(`Today (${r.factory.quota.day}): ${r.factory.quota.invocations}/${r.factory.quota.cap.invocations} invocations, ${n(r.factory.quota.tokens)}/${n(r.factory.quota.cap.tokens)} tokens`);
    out.push(`Items by state: ${Object.entries(r.factory.by_state).map(([s, c]) => `${s} ${c}`).join(', ') || 'none'}`);
    out.push(`Average cycles per closed item: ${r.factory.avg_cycles_per_closed_item ?? 'n/a'}`);
  }
  for (const i of ideas) {
    out.push('', `${i.name} (${i.id}, ${i.state}): ${n(i.tokens)} tokens, ${i.invocations} invocation(s), working ${fmtTime(i.working_seconds)}, waiting ${fmtTime(i.waiting_seconds)}; defects raised ${i.defects.raised}, fixed ${i.defects.fixed}`);
    for (const c of i.cycles.filter((x) => cycle == null || x.cycle === Number(cycle))) {
      out.push(`  cycle ${c.cycle}: ${n(c.tokens)} tokens, ${c.invocations} invocation(s), ${fmtTime(c.seconds)}; defects +${c.defects_raised} fixed ${c.defects_fixed} persisted ${c.defects_persisted}`);
      for (const a of c.agents.filter((x) => !agent || x.agent === agent)) out.push(`    ${a.agent.padEnd(9)} ${n(a.tokens)} tokens, ${a.invocations} invocation(s), ${fmtTime(a.seconds)}`);
    }
  }
  if (agent && !idea) out.push('', `${agent} overall: ${r.agents[agent] ? `${n(r.agents[agent].tokens)} tokens, ${r.agents[agent].invocations} invocation(s), ${fmtTime(r.agents[agent].seconds)}` : 'no invocations'}`);
  return out.join('\n');
}

export function dashboardHtml(root = repoRoot) {
  const data = rollup(root);
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Tristram dashboard</title>
<style>
:root{--bg:#1b1713;--card:#2a231c;--ink:#e8dcc4;--dim:#a8977a;--accent:#d4a24c;--line:#4a3d2e;--bar:#8a5a14}
@media (prefers-color-scheme: light){:root{--bg:#f4ecda;--card:#fffaf0;--ink:#2a2118;--dim:#6b5a42;--accent:#8a5a14;--line:#d8c9a8;--bar:#c58a2a}}
*{box-sizing:border-box}body{margin:0;padding:20px 16px;background:var(--bg);color:var(--ink);font:14px/1.5 Georgia,serif}
h1{margin:0}.sub{color:var(--dim);margin:2px 0 14px}nav{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px}
button,select{background:var(--card);color:var(--ink);border:1px solid var(--line);border-radius:4px;padding:6px 10px;font:inherit}
button.on{border-color:var(--accent);color:var(--accent)}.filters{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px;color:var(--dim)}
.tiles{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:10px;margin-bottom:16px}
.tile{background:var(--card);border:1px solid var(--line);border-radius:6px;padding:10px 12px}.tile b{display:block;font-size:22px;color:var(--accent)}.tile span{color:var(--dim);font-size:12px}
table{border-collapse:collapse;width:100%;background:var(--card);border:1px solid var(--line)}th,td{text-align:left;padding:6px 10px;border-bottom:1px solid var(--line);font-size:13px}
th{color:var(--dim);font-weight:normal;font-size:12px;text-transform:uppercase;letter-spacing:.05em}td.num,th.num{text-align:right;font-variant-numeric:tabular-nums}
tr.click{cursor:pointer}tr.click:hover{background:var(--bg)}.bar{height:8px;background:var(--bar);border-radius:2px;min-width:1px}
.scroll{overflow-x:auto}.empty{color:var(--dim);padding:20px}
</style></head><body>
<h1>Tristram dashboard</h1><p class="sub" id="gen"></p>
<nav id="tabs"></nav><div class="filters" id="filters"></div><main id="view"></main>
<script type="application/json" id="data">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>
<script>
const D = JSON.parse(document.getElementById('data').textContent);
const f = { idea: '', stage: '', agent: '', cycle: '', from: '' };
let tab = 'factory';
const n = (v) => Number(v).toLocaleString('en-US');
const t = (s) => (s < 90 ? Math.round(s) + ' s' : s < 5400 ? Math.round(s / 60) + ' min' : (s / 3600).toFixed(1) + ' h');
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const tile = (b, s) => '<div class="tile"><b>' + esc(b) + '</b><span>' + esc(s) + '</span></div>';
const pass = (r) => (!f.idea || r.idea === f.idea) && (!f.stage || r.stage === f.stage) && (!f.agent || r.agent === f.agent) && (!f.cycle || String(r.cycle) === f.cycle) && (!f.from || (r.ts_end || '') >= f.from);
const rows = () => D.invocations.filter(pass);
function table(head, body, click) {
  if (!body.length) return '<p class="empty">Nothing matches these filters.</p>';
  return '<div class="scroll"><table><tr>' + head.map((h) => '<th' + (h[1] ? ' class="num"' : '') + '>' + esc(h[0]) + '</th>').join('') + '</tr>' +
    body.map((r) => '<tr' + (click ? ' class="click" data-go="' + esc(r.go) + '"' : '') + '>' + r.cells.map((c, i) => '<td' + (head[i][1] ? ' class="num"' : '') + '>' + c + '</td>').join('') + '</tr>').join('') + '</table></div>';
}
function agg(list, key) {
  const m = new Map();
  for (const r of list) { const k = key(r); const a = m.get(k) ?? { tokens: 0, inv: 0, sec: 0, tools: 0 }; a.tokens += r.tokens_in + r.tokens_out; a.inv += 1; a.tools += r.tool_calls || 0; a.sec += r.ts_start && r.ts_end ? Math.max(0, (Date.parse(r.ts_end) - Date.parse(r.ts_start)) / 1000) : 0; m.set(k, a); }
  return [...m.entries()].sort((a, b) => String(a[0]).localeCompare(String(b[0])));
}
const views = {
  factory() {
    const F = D.factory, q = F.quota;
    return '<div class="tiles">' + tile(F.items, 'items') + tile(n(F.tokens), 'tokens in total') + tile(F.invocations, 'invocations') + tile(t(F.seconds), 'agent time') +
      tile(q.invocations + ' / ' + q.cap.invocations, 'invocations today (cap)') + tile(n(q.tokens) + ' / ' + n(q.cap.tokens), 'tokens today (cap)') +
      tile(F.waiting_for_ceo.length, 'waiting for the CEO') + tile(F.avg_cycles_per_closed_item == null ? 'n/a' : F.avg_cycles_per_closed_item.toFixed(1), 'average cycles per closed item') + '</div>' +
      '<h3>Items</h3>' + table([['Item'], ['State'], ['Cycle', 1], ['Tokens', 1], ['Invocations', 1], ['Working', 1], ['Waiting', 1]],
        D.ideas.filter((i) => !f.idea || i.name === f.idea).map((i) => ({ go: 'idea:' + i.name, cells: [esc(i.id + ' ' + i.name), esc(i.state), i.cycle, n(i.tokens), i.invocations, t(i.working_seconds), t(i.waiting_seconds)] })), true) +
      '<h3>Waiting for the CEO</h3>' + table([['Entry'], ['Type'], ['Colour'], ['Raised']], F.waiting_for_ceo.map((e) => ({ cells: [esc(e.id), esc(e.type), esc(e.colour), esc(e.raised)] })));
  },
  idea() {
    const list = D.ideas.filter((i) => !f.idea || i.name === f.idea);
    return list.map((i) => '<h3>' + esc(i.id + ' ' + i.name) + ' (' + esc(i.state) + ')</h3><div class="tiles">' + tile(n(i.tokens), 'tokens') + tile(i.invocations, 'invocations') + tile(t(i.working_seconds), 'working time') + tile(t(i.waiting_seconds), 'waiting time (CEO, environment, budget)') + tile(i.defects.raised + ' / ' + i.defects.fixed + ' / ' + i.defects.persisted, 'defects raised / fixed / persisted') + '</div>' +
      '<h4>Cycles</h4>' + table([['Cycle'], ['Tokens', 1], ['Invocations', 1], ['Time', 1], ['Raised', 1], ['Fixed', 1], ['Persisted', 1], ['Checks']], i.cycles.map((c) => ({ go: 'cycle:' + i.name + ':' + c.cycle, cells: [c.cycle, n(c.tokens), c.invocations, t(c.seconds), c.defects_raised, c.defects_fixed, c.defects_persisted, esc(c.checks.join(', '))] })), true) +
      '<h4>Stages</h4>' + table([['Stage'], ['Tokens', 1], ['Invocations', 1]], i.stages.map((s) => ({ cells: [esc(s.stage), n(s.tokens), s.invocations] }))) +
      '<h4>Timeline</h4>' + table([['State'], ['Cycle', 1], ['From'], ['Duration', 1], ['']], i.timeline.map((s) => ({ cells: [esc(s.state), s.cycle, esc(s.from), t(s.seconds), s.waiting ? 'waiting' : 'working'] })))).join('') || '<p class="empty">No ideas yet.</p>';
  },
  agent() {
    const list = rows(), by = agg(list, (r) => r.agent), max = Math.max(1, ...by.map(([, a]) => a.tokens));
    return table([['Character'], ['Tokens', 1], ['Invocations', 1], ['Time', 1], ['Tool calls', 1], ['']], by.map(([k, a]) => ({ go: 'agent:' + k, cells: [esc(k), n(a.tokens), a.inv, t(a.sec), a.tools, '<div class="bar" style="width:' + Math.round((a.tokens / max) * 160) + 'px"></div>'] })), true) +
      '<h3>Per cycle</h3>' + table([['Character'], ['Cycle', 1], ['Tokens', 1], ['Invocations', 1], ['Time', 1]], agg(list, (r) => r.agent + '|' + String(r.cycle ?? 0).padStart(2, '0')).map(([k, a]) => { const [ag, c] = k.split('|'); return { cells: [esc(ag), Number(c), n(a.tokens), a.inv, t(a.sec)] }; }));
  },
  cycle() {
    const list = rows();
    return table([['Idea'], ['Cycle', 1], ['Character'], ['Invocations', 1], ['Tokens', 1], ['Time', 1]], agg(list, (r) => r.idea + '|' + String(r.cycle ?? 0).padStart(2, '0') + '|' + r.agent).map(([k, a]) => { const [i, c, ag] = k.split('|'); return { cells: [esc(i), Number(c), esc(ag), a.inv, n(a.tokens), t(a.sec)] }; }));
  },
  invocation() {
    return table([['When'], ['Idea'], ['Cycle', 1], ['Character'], ['Reason'], ['Model'], ['In', 1], ['Out', 1], ['Tools', 1], ['Checks']],
      rows().slice().reverse().map((r) => ({ cells: [esc(r.ts_end), esc(r.idea), r.cycle ?? '', esc(r.agent + ' #' + r.invocation), esc(r.reason), esc(r.model), n(r.tokens_in), n(r.tokens_out), r.tool_calls, esc((r.checks_run || []).join(', '))] })));
  },
};
const names = { factory: 'Factory', idea: 'Idea', agent: 'Agent', cycle: 'Cycle', invocation: 'Invocation' };
function draw() {
  document.getElementById('gen').textContent = 'Generated ' + D.generated + ' from record/metrics.jsonl and record/transitions.jsonl. Time comes from hook timestamps and status changes, never from agent estimates.';
  document.getElementById('tabs').innerHTML = Object.keys(views).map((k) => '<button data-tab="' + k + '" class="' + (k === tab ? 'on' : '') + '">' + names[k] + '</button>').join('');
  const opt = (label, key, vals) => '<label>' + label + ' <select data-f="' + key + '"><option value="">all</option>' + vals.map((v) => '<option' + (String(v) === f[key] ? ' selected' : '') + '>' + esc(v) + '</option>').join('') + '</select></label>';
  const u = (k) => [...new Set(D.invocations.map((r) => r[k]).filter((x) => x != null))].sort();
  document.getElementById('filters').innerHTML = opt('Idea', 'idea', D.ideas.map((i) => i.name)) + opt('Stage', 'stage', u('stage')) + opt('Agent', 'agent', u('agent')) + opt('Cycle', 'cycle', u('cycle')) +
    '<label>Since <input type="date" data-f="from" value="' + esc(f.from) + '" style="background:var(--card);color:var(--ink);border:1px solid var(--line);padding:4px"></label>';
  document.getElementById('view').innerHTML = views[tab]();
}
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-tab]'); if (b) { tab = b.dataset.tab; draw(); return; }
  const r = e.target.closest('[data-go]'); if (!r) return;
  const [kind, a, c] = r.dataset.go.split(':');
  if (kind === 'idea') { f.idea = a; tab = 'idea'; } else if (kind === 'agent') { f.agent = a; tab = 'invocation'; } else if (kind === 'cycle') { f.idea = a; f.cycle = c; tab = 'cycle'; }
  draw();
});
document.addEventListener('change', (e) => { if (e.target.dataset.f) { f[e.target.dataset.f] = e.target.value; draw(); } });
draw();
</script></body></html>
`;
}

export function writeDashboard(root = repoRoot) {
  const out = path.join(root, 'knowledge', 'roster', 'dashboard.html');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, dashboardHtml(root));
  return out;
}
