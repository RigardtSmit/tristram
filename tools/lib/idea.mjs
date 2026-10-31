// Idea state engine: reads and writes status.md, enforces the status machine (SPEC 4) and the build gate (SPEC 12).
import fs from 'node:fs';
import path from 'node:path';
import { repoRoot, nowIso } from './paths.mjs';

export const STATES = [
  'BRIEFING', 'BUILDING', 'PRE_REVIEW', 'IN_REVIEW', 'NOT_READY', 'DEBRIEF', 'CLOSED',
  'BLOCKED_FOR_CEO', 'ENVIRONMENT_BLOCKED', 'BUDGET_EXHAUSTED', 'PAUSED', 'STOPPED',
];

// Allowed moves. Cycle rules and the build gate are applied on top in transition().
const RESUME = ['BUILDING', 'PRE_REVIEW', 'IN_REVIEW'];
export const TRANSITIONS = {
  BRIEFING: ['BUILDING', 'STOPPED'],
  BUILDING: ['PRE_REVIEW', 'ENVIRONMENT_BLOCKED', 'BUDGET_EXHAUSTED', 'PAUSED', 'BLOCKED_FOR_CEO', 'STOPPED'],
  PRE_REVIEW: ['IN_REVIEW', 'BUILDING', 'ENVIRONMENT_BLOCKED', 'BUDGET_EXHAUSTED', 'PAUSED', 'BLOCKED_FOR_CEO', 'STOPPED'],
  IN_REVIEW: ['DEBRIEF', 'NOT_READY', 'ENVIRONMENT_BLOCKED', 'BUDGET_EXHAUSTED', 'PAUSED', 'BLOCKED_FOR_CEO', 'STOPPED'],
  NOT_READY: ['BUILDING', 'BLOCKED_FOR_CEO', 'STOPPED'],
  DEBRIEF: ['CLOSED', 'PAUSED', 'STOPPED'],
  BLOCKED_FOR_CEO: ['IN_REVIEW', 'BUILDING', 'STOPPED'],      // Town Square options A, B, C
  ENVIRONMENT_BLOCKED: [...RESUME, 'STOPPED'],
  BUDGET_EXHAUSTED: [...RESUME, 'STOPPED'],
  PAUSED: [...RESUME, 'DEBRIEF', 'STOPPED'],
  CLOSED: [],
  STOPPED: [],
};
const STAGE = {
  BRIEFING: 'briefing', BUILDING: 'build', PRE_REVIEW: 'pre-review', IN_REVIEW: 'review',
  NOT_READY: 'review', DEBRIEF: 'debrief', BLOCKED_FOR_CEO: 'town-square',
};
export const MAX_CYCLES = 3;

// ---- locating ideas ----------------------------------------------------------

function ideaDirsIn(root) {
  const dir = path.join(root, 'ideas');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((d) => fs.existsSync(path.join(dir, d, 'status.md')))
    .map((d) => path.join(dir, d));
}

// Every idea in the main checkout and in each worktree under .worktrees/.
export function listIdeas(root = repoRoot) {
  const roots = [root];
  const wt = path.join(root, '.worktrees');
  if (fs.existsSync(wt)) for (const d of fs.readdirSync(wt)) roots.push(path.join(wt, d));
  const out = [];
  for (const r of roots) for (const dir of ideaDirsIn(r)) {
    const status = parseStatus(fs.readFileSync(path.join(dir, 'status.md'), 'utf8'));
    out.push({ name: status.name, dir, root: r, status });
  }
  return out;
}

export function findIdea(name, root = repoRoot) {
  const hit = listIdeas(root).find((i) => i.name === name);
  if (!hit) {
    const known = listIdeas(root).map((i) => i.name).join(', ') || 'none';
    throw new Error(`no idea named "${name}". Known ideas: ${known}`);
  }
  return hit;
}

// ---- status.md ------------------------------------------------------------------

export function parseStatus(text) {
  const out = {};
  for (const line of text.replace(/\r\n/g, '\n').split('\n')) {
    if (line.startsWith('## ')) break;
    const m = line.match(/^([a-z_]+): (.*)$/);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

// Write to a temporary file, then move it into place (SPEC 16.3).
export function writeAtomic(file, text) {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, file);
}

function updateStatusFile(dir, updates, historyRow) {
  const file = path.join(dir, 'status.md');
  let text = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  const split = text.indexOf('\n## History');
  let head = split === -1 ? text : text.slice(0, split);
  const tail = split === -1 ? '' : text.slice(split);
  for (const [k, v] of Object.entries(updates)) {
    const re = new RegExp(`^${k}: .*$`, 'm');
    head = re.test(head) ? head.replace(re, `${k}: ${v}`) : `${head.replace(/\n*$/, '\n')}${k}: ${v}\n`;
  }
  let out = head + tail;
  if (historyRow) out = out.replace(/\n*$/, '\n') + historyRow + '\n';
  writeAtomic(file, out);
}

// For scripts that need to record a field such as the last checkpoint.
export function setStatusFields(idea, updates) { updateStatusFile(idea.dir, updates); }

function appendLine(file, line) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, line + '\n');
}
export function logEvent(dir, actor, text) {
  appendLine(path.join(dir, 'record', 'log.md'), `- ${nowIso()} ${actor} ${text}`);
}

// ---- brief and ADR-001 -------------------------------------------------------------

function readIf(file) { return fs.existsSync(file) ? fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n') : null; }
export function docStatus(text) { return text?.match(/^\*\*Status:\*\*\s*([A-Z_]+)/m)?.[1] ?? null; }
export function briefVersion(text) { return text?.match(/^\*\*Version:\*\*\s*(v\d+)/m)?.[1] ?? 'v1'; }

// A real brief has at least one requirement and one acceptance criterion with text.
export function briefHasContent(text) {
  const row = (prefix) => new RegExp(`^\\|\\s*${prefix}-\\d+\\s*\\|\\s*\\S.*\\|`, 'm');
  return row('REQ').test(text || '') && row('AC').test(text || '');
}

// The build gate: no build until brief.md and ADR-001 are both ACCEPTED.
export function gate(dir) {
  const problems = [];
  const brief = readIf(path.join(dir, 'brief.md'));
  if (brief == null) problems.push('brief.md is missing');
  else if (docStatus(brief) !== 'ACCEPTED') problems.push(`brief.md is ${docStatus(brief) ?? 'unmarked'}, not ACCEPTED`);
  const adr = readIf(path.join(dir, 'decisions', 'ADR-001-stack.md'));
  if (adr == null) problems.push('decisions/ADR-001-stack.md is missing');
  else if (docStatus(adr) !== 'ACCEPTED') problems.push(`ADR-001 is ${docStatus(adr) ?? 'unmarked'}, not ACCEPTED`);
  return { ok: problems.length === 0, problems };
}

function setDocStatus(file, from, to, extra) {
  let text = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  text = text.replace(/^\*\*Status:\*\*.*$/m, `**Status:** ${to}`);
  const lines = [`**Accepted:** ${nowIso().slice(0, 10)}`, ...(extra || [])];
  text = text.replace(/^\*\*Status:\*\*.*$/m, (m) => `${m}\n${lines.join('\n')}`);
  writeAtomic(file, text);
}

export function acceptBrief(idea, by) {
  requireCeo(by);
  const file = path.join(idea.dir, 'brief.md');
  const text = readIf(file);
  if (text == null) throw new Error('brief.md is missing');
  const status = docStatus(text);
  if (status === 'ACCEPTED') throw new Error('brief.md is already ACCEPTED');
  if (!briefHasContent(text)) throw new Error('brief.md has no requirement and acceptance criterion with text. Fill in the brief first.');
  setDocStatus(file, status, 'ACCEPTED');
  const v = briefVersion(text);
  updateStatusFile(idea.dir, { brief: `${v} accepted` });
  logEvent(idea.dir, 'ceo', `accepted brief ${v}`);
  return v;
}

export function acceptStack(idea, by, option) {
  requireCeo(by);
  if (!option) throw new Error('say which option was approved, for example --option A');
  const file = path.join(idea.dir, 'decisions', 'ADR-001-stack.md');
  const text = readIf(file);
  if (text == null) throw new Error('decisions/ADR-001-stack.md is missing. Cain writes the proposal first.');
  const status = docStatus(text);
  if (status !== 'PROPOSED') throw new Error(`ADR-001 is ${status ?? 'unmarked'}; only a PROPOSED ADR can be accepted`);
  setDocStatus(file, status, 'ACCEPTED', [`**Decision:** Option ${option}`]);
  updateStatusFile(idea.dir, { active_stack: `ADR-001 option ${option}` });
  logEvent(idea.dir, 'ceo', `accepted ADR-001 stack, option ${option}`);
}

function requireCeo(by) {
  if (by !== 'ceo') throw new Error('this is a CEO decision. Run it only after the CEO has approved, with --by ceo');
}

// ---- transitions ------------------------------------------------------------------------

export function transition(idea, to, { note = '', actor = 'factory' } = {}) {
  const st = parseStatus(fs.readFileSync(path.join(idea.dir, 'status.md'), 'utf8'));
  const from = st.state;
  if (!STATES.includes(to)) throw new Error(`unknown state ${to}`);
  if (!TRANSITIONS[from]) throw new Error(`current state "${from}" is not a known state`);
  if (!TRANSITIONS[from].includes(to)) {
    throw new Error(`cannot move from ${from} to ${to}. Allowed: ${TRANSITIONS[from].join(', ') || 'none (terminal)'}`);
  }
  let cycle = Number(st.cycle || 0);
  if (from === 'BRIEFING' && to === 'BUILDING') {
    const g = gate(idea.dir);
    if (!g.ok) throw new Error(`build is blocked: ${g.problems.join('; ')}`);
    cycle = 1;
  } else if (to === 'BUILDING' && (from === 'PRE_REVIEW' || from === 'NOT_READY')) {
    // Cycle rule (SPEC 4.1.1): problems found start the next cycle, but cycle 3 ends in BLOCKED_FOR_CEO.
    if (cycle >= MAX_CYCLES) throw new Error(`cycle ${cycle} of ${MAX_CYCLES} is used up. Move to BLOCKED_FOR_CEO instead`);
    cycle += 1;
  }
  const ts = nowIso();
  const updates = { state: to, cycle: String(cycle) };
  if (STAGE[to]) updates.stage = STAGE[to];
  updateStatusFile(idea.dir, updates, `| ${ts} | ${from} | ${to} | ${note || actor} |`);
  appendLine(path.join(idea.dir, 'record', 'transitions.jsonl'), JSON.stringify({
    ts, idea: path.basename(idea.dir), item: st.id, from, to, cycle, actor, note,
  }));
  logEvent(idea.dir, actor, `status ${from} -> ${to}${note ? ` (${note})` : ''}`);
  return { from, to, cycle };
}

// ---- reporting ------------------------------------------------------------------------------

export function lastLogLines(dir, n = 5) {
  const text = readIf(path.join(dir, 'record', 'log.md'));
  if (!text) return [];
  return text.split('\n').filter((l) => l.startsWith('- ')).slice(-n);
}

export function openDefects(dir) {
  const cyc = path.join(dir, 'cycles');
  if (!fs.existsSync(cyc)) return [];
  const latest = fs.readdirSync(cyc).filter((d) => /^cycle-\d+$/.test(d)).sort((a, b) => Number(a.slice(6)) - Number(b.slice(6))).pop();
  const text = latest && readIf(path.join(cyc, latest, 'defects.md'));
  if (!text) return [];
  return text.split('\n').filter((l) => /DEF-\d+-\d+/.test(l) && !/\b(FIXED|CLOSED)\b/.test(l));
}

export function describe(idea) {
  const st = parseStatus(fs.readFileSync(path.join(idea.dir, 'status.md'), 'utf8'));
  const brief = readIf(path.join(idea.dir, 'brief.md')), adr = readIf(path.join(idea.dir, 'decisions', 'ADR-001-stack.md'));
  const g = gate(idea.dir);
  return {
    st,
    briefStatus: docStatus(brief) ?? 'missing',
    adrStatus: docStatus(adr) ?? 'not written',
    gate: g,
    defects: openDefects(idea.dir),
    log: lastLogLines(idea.dir, 5),
  };
}
