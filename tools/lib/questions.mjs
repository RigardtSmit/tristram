// Question log (SPEC 9). One file per character in questions/<character>.md.
import fs from 'node:fs';
import path from 'node:path';
import { nowIso } from './paths.mjs';
import { parseStatus, logEvent, writeAtomic } from './idea.mjs';

const CHARACTERS = ['cain', 'wirt', 'griswold', 'adria', 'farnham', 'lazarus', 'ogden'];
const ID_RE = /^Q-\d{3}-\d{2,}$/;

function qdir(idea) { return path.join(idea.dir, 'questions'); }
function itemNumber(idea) {
  const id = parseStatus(fs.readFileSync(path.join(idea.dir, 'status.md'), 'utf8')).id;   // WI-014
  return id.replace(/^WI-/, '');
}

// All entries across every character's log, in file order.
export function readAll(idea) {
  const out = [];
  if (!fs.existsSync(qdir(idea))) return out;
  for (const f of fs.readdirSync(qdir(idea)).filter((n) => n.endsWith('.md')).sort()) {
    const text = fs.readFileSync(path.join(qdir(idea), f), 'utf8').replace(/\r\n/g, '\n');
    for (const block of text.split(/^(?=Q-\d{3}-\d{2,}\s)/m).filter((b) => /^Q-\d{3}-\d{2,}\s/.test(b))) out.push(parseEntry(block, f));
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

export function parseEntry(block, file) {
  const head = block.match(/^(Q-\d{3}-\d{2,})\s+(\S+)\s+(\S+)/);
  const field = (k) => block.match(new RegExp(`^${k}: (.*)$`, 'm'))?.[1]?.trim() ?? '';
  const answer = field('Answer');
  const pending = /^pending\b/i.test(answer);
  return {
    id: head[1], by: head[2], raised: head[3], file,
    question: field('Question'), blocking: /^yes/i.test(field('Blocking')),
    assumption: field('Assumption'), answer, pending,
    decider: pending ? (answer.match(/\((\w+)\)/)?.[1] ?? 'Cain').toLowerCase() : null,
    reviewed: field('Reviewed'),
  };
}

function nextId(idea) {
  const all = readAll(idea);
  const seq = all.reduce((m, q) => Math.max(m, Number(q.id.split('-')[2])), 0) + 1;
  return `Q-${itemNumber(idea)}-${String(seq).padStart(2, '0')}`;
}

export function ask(idea, from, { question, blocking = false, assumption = '' }) {
  from = String(from || '').toLowerCase();
  if (!CHARACTERS.includes(from)) throw new Error(`"${from}" is not a character. Use one of: ${CHARACTERS.join(', ')}`);
  if (!question?.trim()) throw new Error('a question is required');
  if (!blocking && !assumption.trim()) throw new Error('a non-blocking question must state the assumption you will proceed on');
  const id = nextId(idea);
  const entry = [
    `${id}  ${from}  ${nowIso()}`,
    `Question: ${question.trim()}`,
    `Blocking: ${blocking ? 'yes (waiting; work on anything independent)' : 'no (proceeding on the assumption below)'}`,
    `Assumption: ${blocking ? 'none' : assumption.trim()}`,
    'Answer: pending (Cain)',
    `Reviewed: ${blocking ? 'n/a' : 'pending'}`,
    '',
  ].join('\n');
  fs.mkdirSync(qdir(idea), { recursive: true });
  const file = path.join(qdir(idea), `${from}.md`);
  const prev = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').replace(/\n*$/, '\n\n') : `# Questions: ${from}\n\n`;
  writeAtomic(file, prev + entry);
  logEvent(idea.dir, from, `asked ${id}${blocking ? ' (blocking)' : ''}`);
  return id;
}

function rewrite(idea, id, edit) {
  if (!ID_RE.test(id)) throw new Error(`"${id}" is not a question id like Q-001-01`);
  const q = readAll(idea).find((x) => x.id === id);
  if (!q) throw new Error(`no question ${id}`);
  const file = path.join(qdir(idea), q.file);
  const text = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  const re = new RegExp(`^${id}\\s[\\s\\S]*?(?=^Q-\\d{3}-\\d{2,}\\s|(?![\\s\\S]))`, 'm');
  const block = text.match(re)[0];
  const updated = edit(block, q);
  writeAtomic(file, text.replace(block, () => updated));   // function form: a "$" in the text is never a pattern
  return q;
}
const setField = (block, key, value) => block.replace(new RegExp(`^${key}: .*$`, 'm'), () => `${key}: ${value}`);

// Cain answers from the brief, standards or lessons; the CEO answers anything in the CEO column.
export function answer(idea, id, { text, by }) {
  by = String(by || '').toLowerCase();
  if (!['cain', 'ceo'].includes(by)) throw new Error('only Cain or the CEO can answer (use --by cain or --by ceo)');
  if (!text?.trim()) throw new Error('an answer is required');
  const q = rewrite(idea, id, (b) => setField(b, 'Answer', `${text.trim()} (answered by ${by}, ${nowIso().slice(0, 10)})`));
  logEvent(idea.dir, by, `answered ${id}`);
  return q;
}

// Cain escalates to the CEO only for CEO decisions, or when best practice is unclear (SPEC 9.2).
export function escalate(idea, id, reason) {
  if (!reason?.trim()) throw new Error('say why this is a CEO decision (--reason)');
  rewrite(idea, id, (b) => setField(b, 'Answer', `pending (CEO) - escalated by Cain: ${reason.trim()}`));
  logEvent(idea.dir, 'cain', `escalated ${id} to the CEO`);
}

// The CEO may accept an assumption as it stands, which closes it for Lazarus's check.
export function acceptAssumption(idea, id, by) {
  if (by !== 'ceo') throw new Error('only the CEO can accept an assumption (use --by ceo)');
  const q = readAll(idea).find((x) => x.id === id);
  if (!q) throw new Error(`no question ${id}`);
  if (q.blocking) throw new Error(`${id} is a blocking question; it needs an answer, not an acceptance`);
  rewrite(idea, id, (b) => setField(b, 'Answer', `accepted as assumed (by ceo, ${nowIso().slice(0, 10)})`));
  logEvent(idea.dir, 'ceo', `accepted assumption ${id}`);
}

// Checkpoint review (SPEC 9.2): Cain looks at every non-blocking question not yet reviewed.
export function needsReview(idea) {
  return readAll(idea).filter((q) => !q.blocking && /^pending/i.test(q.reviewed));
}
export function reviewOne(idea, id, { decision, by, note = '' }) {
  if (by !== 'cain') throw new Error('Cain reviews assumptions at checkpoints (use --by cain)');
  if (!['keep', 'revise'].includes(decision)) throw new Error('decision must be keep or revise');
  const q = readAll(idea).find((x) => x.id === id);
  if (!q) throw new Error(`no question ${id}`);
  if (q.blocking) throw new Error(`${id} is blocking; there is no assumption to review`);
  rewrite(idea, id, (b) => setField(b, 'Reviewed', `${decision} by cain, ${nowIso().slice(0, 10)}${note ? ` - ${note}` : ''}`));
  logEvent(idea.dir, 'cain', `reviewed assumption ${id}: ${decision}`);
}

// For the debrief (SPEC 9.3): assumptions never answered, and whether the CEO accepted them.
export function debriefAssumptions(idea) {
  return readAll(idea).filter((q) => !q.blocking).map((q) => ({
    ...q,
    closed: !q.pending,
  }));
}
export function openQuestions(idea) { return readAll(idea).filter((q) => q.pending); }
