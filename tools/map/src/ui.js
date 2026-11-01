'use strict';
// Side panel: queue list, selection detail, legend. Decision buttons work when the map is served by tools/map/serve.mjs.

const STATE_TEXT = { idle: 'Idle', working: 'Working', blocked: 'Blocked' };

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function ago(iso) {
  const mins = Math.max(0, Math.round(((isServed() ? Date.now() : Date.parse('2026-10-31T18:00:00Z')) - Date.parse(iso)) / 60000));
  return mins < 90 ? `${mins} min` : mins < 2880 ? `${Math.round(mins / 60)} h` : `${Math.round(mins / 1440)} d`;
}

function renderQueue() {
  const ul = document.getElementById('qlist');
  ul.replaceChildren();
  const portals = game.state.portals;
  document.getElementById('qcount').textContent = String(portals.length);
  if (!portals.length) { ul.appendChild(el('li', 'empty', 'Nothing is waiting for you.')); return; }
  for (const q of portals) {
    const li = el('li', 'qrow' + (game.sel?.id === q.id ? ' sel' : ''));
    li.tabIndex = 0;
    const gem = el('span', 'gem ' + q.colour);
    const body = el('div', 'qbody');
    body.appendChild(el('div', 'qtype', q.type.replace(/_/g, ' ').toLowerCase()));
    body.appendChild(el('div', 'qsum', q.summary));
    body.appendChild(el('div', 'qmeta', `${q.item.replace(/^\d{4}-\d{2}-\d{2}-/, '')} · ${PLACE[q.loc] || q.loc} · ${ago(q.raised)}`));
    li.append(gem, body);
    const go = () => selectPortal(q.id, true);
    li.addEventListener('click', go);
    li.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
    ul.appendChild(li);
  }
}

async function decide(q, option, button) {
  const out = document.querySelector('#detail .result');
  button.disabled = true;
  try {
    const r = await fetch('/api/decide', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: q.id, option }) });
    const j = await r.json();
    if (out) out.textContent = j.message || j.error || '';
    await pollData();
  } catch (err) { if (out) out.textContent = 'Could not reach the local server: ' + err.message; button.disabled = false; }
}

function renderDetail() {
  const box = document.getElementById('detail');
  box.replaceChildren();
  const sel = game.sel;
  if (!sel) {
    box.appendChild(el('h2', null, 'The village'));
    box.appendChild(el('p', 'hint', 'Click a portal, a character, or the ground. Click the ground to walk the CEO there. Blue portals pull him to them.'));
    return;
  }
  if (sel.kind === 'portal') {
    const q = game.state.portals.find((p) => p.id === sel.id);
    if (!q) return;
    box.appendChild(el('h2', null, q.type.replace(/_/g, ' ').toLowerCase()));
    const tag = el('div', 'tag ' + q.colour, `${PORTAL_COLOURS[q.colour].name}: ${PORTAL_COLOURS[q.colour].meaning}`);
    box.appendChild(tag);
    box.appendChild(el('p', null, q.summary));
    const dl = el('dl');
    for (const [k, v] of [['Item', q.item], ['Where', PLACE[q.loc] || q.loc], ['Raised', `${q.raised.replace('T', ' ').replace('Z', '')} (${ago(q.raised)} ago)`], ['Detail', q.detail], ['Entry', q.id]]) {
      dl.append(el('dt', null, k), el('dd', null, v));
    }
    box.appendChild(dl);
    const row = el('div', 'opts');
    for (const o of q.options) {
      const b = el('button', 'stone', o.replace(/_/g, ' ').replace(':', ' to '));
      const needsText = o === 'answer' || o === 'new_proposal';
      b.disabled = !isServed() || needsText;
      b.title = needsText ? 'Answer this in Claude Code (/questions or /queue)' : isServed() ? 'Carry out this decision' : 'Open the map with tools/map/serve.mjs to decide here';
      b.addEventListener('click', () => decide(q, o, b));
      row.appendChild(b);
    }
    box.appendChild(row);
    box.appendChild(el('p', 'note', isServed() ? 'Choosing an option records your decision in the item's record and carries it out.' : 'Sample or snapshot data: buttons are inactive. Run node tools/map/serve.mjs for the live map.'));
    box.appendChild(el('p', 'note result', ''));
    return;
  }
  if (sel.kind === 'barb') {
    box.appendChild(el('h2', null, 'The CEO'));
    box.appendChild(el('p', null, 'Barbarian. Owner and Product Owner. The class is visual only and grants no permissions.'));
    return;
  }
  const name = sel.id;
  const reg = game.data.registry[name];
  const st = game.state.chars[name];
  box.appendChild(el('h2', null, DISPLAY[name]));
  box.appendChild(el('div', 'tag ' + (st.state === 'blocked' ? st.blocked.colour : st.state), `${STATE_TEXT[st.state]}${st.blocked ? ': ' + st.blocked.reason : ''}`));
  const dl = el('dl');
  const rows = [['Role', reg?.role ?? ''], ['Place', PLACE[name]], ['Tools', (reg?.tools || []).join(', ')],
    ['Skills', String(reg?.skills?.length ?? 0)], ['Connectors', String(reg?.connectors?.length ?? 0)],
    ['Working on', st.items.length ? st.items.join(', ') : 'nothing']];
  const runs = game.data.metrics.filter((m) => m.agent === name);
  if (runs.length) {
    const tin = runs.reduce((a, m) => a + m.tokens_in, 0), tout = runs.reduce((a, m) => a + m.tokens_out, 0);
    rows.push(['Invocations', `${runs.length} (${tin.toLocaleString()} in, ${tout.toLocaleString()} out tokens)`]);
  }
  for (const [k, v] of rows) dl.append(el('dt', null, k), el('dd', null, v));
  box.appendChild(dl);
}

// The legend now lives in the top-left corner of the canvas (see buildLegend in game.js).
function initUI() {
  game.onChange = () => { renderQueue(); renderDetail(); };
}
