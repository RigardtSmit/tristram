// Alerts and the daily digest (SPEC 17.6). Generated from ceo/queue.json; sent by a plain script, never by Claude.
// Content is the summary and a local link only: no code, schema or customer data.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { repoRoot, nowIso } from './paths.mjs';
import { buildQueue } from './queue.mjs';
import { send, mailConfig } from './mail.mjs';

const stateFile = (root) => path.join(root, '.factory', 'notify-state.json');
const loadState = (root) => (fs.existsSync(stateFile(root)) ? JSON.parse(fs.readFileSync(stateFile(root), 'utf8')) : { alerted: {}, lastDigest: null });
function saveState(root, s) { fs.mkdirSync(path.dirname(stateFile(root)), { recursive: true }); fs.writeFileSync(stateFile(root), JSON.stringify(s, null, 2) + '\n'); }
const TAG = { red: 'RED', blue: 'BLUE', gold: 'GOLD', grey: 'GREY' };
const ageHours = (iso) => (Date.now() - Date.parse(iso)) / 3600000;
const age = (iso) => { const h = ageHours(iso); return h < 1.5 ? `${Math.max(1, Math.round(h * 60))} min` : h < 48 ? `${Math.round(h)} h` : `${Math.round(h / 24)} d`; };
const link = (root, e) => `${pathToFileURL(path.join(root, 'ceo', 'queue.json')).href}#${e.id}`;

// Immediate: a red portal or an exhausted budget, once per entry.
export const isAlert = (e) => e.colour === 'red' || e.type === 'BUDGET_EXHAUSTED';

export async function alerts(root = repoRoot, { dryRun = false } = {}) {
  const q = buildQueue(root), st = loadState(root), sent = [];
  for (const e of q.filter(isAlert)) {
    if (st.alerted[e.id]) continue;
    const subject = `[${TAG[e.colour]}] ${e.item}: ${e.summary.replace(/\s+/g, ' ').slice(0, 90)}`;
    const text = `${e.summary}\n\nType: ${e.type}   Raised: ${e.raised}   Item: ${e.item}\nOptions: ${e.options.join(' | ')}\n\nDecide it in Claude Code with /queue, or on the map.\nLocal link: ${link(root, e)}\n`;
    if (!dryRun) { await send({ subject, text }, root); st.alerted[e.id] = nowIso(); }
    sent.push(subject);
  }
  if (!dryRun) saveState(root, st);
  return sent;
}

export function digestText(q, root = repoRoot, overdueHours = 24) {
  const items = q.filter((e) => e.colour === 'blue' || e.colour === 'gold');
  const line = (e) => `- [${TAG[e.colour]}] ${e.id} ${e.item} (${age(e.raised)}${e.colour === 'blue' && ageHours(e.raised) > overdueHours ? ', OVERDUE' : ''}): ${e.summary}`;
  const sorted = [...items].sort((a, b) => (a.colour === b.colour ? a.raised.localeCompare(b.raised) : a.colour === 'blue' ? -1 : 1));
  return {
    count: items.length,
    subject: `[DIGEST] ${items.filter((e) => e.colour === 'blue').length} decision(s) waiting, ${items.filter((e) => e.colour === 'gold').length} warning(s)`,
    text: ['Waiting for you:', '', ...sorted.map(line), '', `Decide them with /queue in Claude Code. Local file: ${pathToFileURL(path.join(root, 'ceo', 'queue.json')).href}`, ''].join('\n'),
  };
}

// Once a day, after the configured hour. With nothing waiting no mail is sent.
export async function digest(root = repoRoot, { force = false, now = new Date() } = {}) {
  const cfg = mailConfig(root), st = loadState(root), today = now.toISOString().slice(0, 10);
  if (!force && (st.lastDigest === today || now.getUTCHours() < cfg.digest_hour)) return { sent: false, why: st.lastDigest === today ? 'already sent today' : 'before the digest hour' };
  const d = digestText(buildQueue(root), root, cfg.overdue_hours);
  if (!d.count) { st.lastDigest = today; saveState(root, st); return { sent: false, why: 'nothing is waiting' }; }
  await send({ subject: d.subject, text: d.text }, root);
  st.lastDigest = today; saveState(root, st);
  return { sent: true, subject: d.subject };
}
