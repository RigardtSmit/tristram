// Lessons (SPEC 14). A candidate lives in ideas/<idea>/lessons.md and is never a rule. Only a lesson the CEO approved in a
// debrief is written to knowledge/lessons/L-NNNN-<topic>.md and indexed in INDEX.md. Nothing else is read as a rule.
import fs from 'node:fs';
import path from 'node:path';
import { repoRoot, nowIso } from './paths.mjs';
import { writeAtomic, logEvent, parseStatus } from './idea.mjs';

const read = (f) => fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
const candFile = (idea) => path.join(idea.dir, 'lessons.md');
const libDir = (root) => path.join(root, 'knowledge', 'lessons');
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48);

// ---- candidates -------------------------------------------------------------------------------------------

export function candidates(idea) {
  if (!fs.existsSync(candFile(idea))) return [];
  return read(candFile(idea)).split(/^## /m).slice(1).map((blk) => {
    const head = blk.split('\n')[0], f = (n) => blk.match(new RegExp(`^${n}:\\s*(.*)$`, 'm'))?.[1]?.trim() ?? '';
    const [id, status] = head.split('|').map((s) => s.trim());
    return { id, status, title: f('Title'), tags: f('Tags').split(',').map((t) => t.trim()).filter(Boolean), trigger: f('Trigger'), rule: f('Rule'), checkedBy: f('Checked by'),
      evidence: f('Evidence'), lazarus: f('Lazarus'), decision: f('Decision'), lesson: f('Lesson'), raw: blk };
  });
}
const find = (idea, id) => candidates(idea).find((c) => c.id === id) ?? (() => { throw new Error(`no lesson candidate ${id}`); })();

function rewrite(idea, id, edits) {
  const text = read(candFile(idea));
  const parts = text.split(/^(?=## )/m);
  const out = parts.map((p) => {
    if (!p.startsWith(`## ${id} `) && !p.startsWith(`## ${id}|`)) return p;
    let blk = p;
    if (edits.status) blk = blk.replace(/^## .*$/m, `## ${id} | ${edits.status}`);
    for (const [k, v] of Object.entries(edits.fields ?? {})) {
      const re = new RegExp(`^${k}:.*$`, 'm');
      blk = re.test(blk) ? blk.replace(re, `${k}: ${v}`) : `${blk.replace(/\n*$/, '\n')}${k}: ${v}\n\n`.replace(/\n\n\n$/, '\n\n');
    }
    return blk;
  });
  writeAtomic(candFile(idea), out.join(''));
}

export function addCandidate(idea, { title, tags, trigger, rule, checkedBy = 'none yet', evidence, by }) {
  if (by !== 'ogden') throw new Error('Ogden drafts lesson candidates (--by ogden)');
  for (const [k, v] of Object.entries({ title, tags, trigger, rule, evidence })) if (!v) throw new Error(`--${k} is required: a candidate needs a trigger, a rule, tags and the evidence behind it`);
  const id = `LC-${String(candidates(idea).length + 1).padStart(2, '0')}`;
  const blk = `## ${id} | PENDING\nTitle: ${title}\nTags: ${tags}\nTrigger: ${trigger}\nRule: ${rule}\nChecked by: ${checkedBy}\nEvidence: ${evidence}\n\n`;
  const cur = fs.existsSync(candFile(idea)) ? read(candFile(idea)) : `# Lesson candidates: ${path.basename(idea.dir)}\n\nCandidates only. None of these is a rule until the CEO approves it in the debrief.\n\n`;
  writeAtomic(candFile(idea), cur.replace(/\n*$/, '\n\n') + blk);
  logEvent(idea.dir, 'ogden', `drafted lesson candidate ${id}: ${title}`);
  return id;
}

export function recommend(idea, id, rec, { reason, by }) {
  if (by !== 'lazarus') throw new Error('Lazarus recommends on lesson candidates (--by lazarus)');
  if (!['approve', 'edit', 'reject'].includes(rec)) throw new Error('recommend approve, edit or reject');
  if (!reason) throw new Error('give the evidence for the recommendation (--reason)');
  const c = find(idea, id);
  if (c.status !== 'PENDING') throw new Error(`${id} is ${c.status}`);
  rewrite(idea, id, { fields: { Lazarus: `${rec}: ${reason}` } });
  logEvent(idea.dir, 'lazarus', `recommends ${rec} for lesson candidate ${id}`);
}

// ---- the library ------------------------------------------------------------------------------------------

export function library(root = repoRoot) {
  const dir = libDir(root);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => /^L-\d{4}-.*\.md$/.test(f)).sort().map((f) => {
    const text = read(path.join(dir, f)), fm = text.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? '';
    const g = (k) => fm.match(new RegExp(`^${k}:\\s*(.*)$`, 'm'))?.[1]?.trim() ?? '';
    return { file: f, id: g('id'), title: g('title'), tags: g('tags').replace(/^\[|\]$/g, '').split(',').map((t) => t.trim().toLowerCase()).filter(Boolean), source: g('source'), approved: g('approved'),
      rule: text.match(/\*\*Rule:\*\*\s*(.*)/)?.[1] ?? '' };
  });
}

// The CEO decides a candidate. Approval writes the lesson to the library and indexes it; nothing else does.
export function decide(idea, id, decision, { by, note, edits = {}, root = repoRoot }) {
  if (by !== 'ceo') throw new Error('a lesson becomes a rule only when the CEO approves it (--by ceo)');
  if (!['approve', 'reject'].includes(decision)) throw new Error('decision is approve or reject (edit with --title/--rule/--tags, then approve)');
  const c = find(idea, id);
  if (c.status !== 'PENDING') throw new Error(`${id} is already ${c.status}`);
  if (!c.lazarus) throw new Error(`${id}: Lazarus has not recommended yet. He checks each candidate against the evidence before the CEO decides`);
  const stamp = nowIso().slice(0, 10), rec = c.lazarus.split(':')[0];
  const ceoLog = path.join(idea.dir, 'record', 'ceo-decisions.md');
  fs.mkdirSync(path.dirname(ceoLog), { recursive: true });
  if (decision === 'reject') {
    rewrite(idea, id, { status: 'REJECTED', fields: { Decision: `rejected by the CEO ${stamp}${note ? ` (${note})` : ''}` } });
    fs.appendFileSync(ceoLog, `- ${nowIso()} ${id} lesson candidate: rejected${note ? ` (${note})` : ''}\n`);
    return { status: 'REJECTED' };
  }
  const title = edits.title || c.title, rule = edits.rule || c.rule, tags = (edits.tags || c.tags.join(',')).split(',').map((t) => t.trim()).filter(Boolean);
  const dir = libDir(root);
  fs.mkdirSync(dir, { recursive: true });
  const n = library(root).reduce((m, l) => Math.max(m, Number(l.id.replace(/\D/g, ''))), 0) + 1, lid = `L-${String(n).padStart(4, '0')}`;
  const file = `${lid}-${slug(title)}.md`;
  const edited = edits.title || edits.rule || edits.tags ? ', edited by the CEO' : '';
  writeAtomic(path.join(dir, file), `---\nid: ${lid}\ntitle: ${title}\ntags: [${tags.join(', ')}]\nsource: ideas/${path.basename(idea.dir)}/\napproved: ${stamp} (Debrief; Lazarus recommended ${rec}${edited})\n---\n\n**Trigger:** ${c.trigger}\n**Rule:** ${rule}\n**Checked by:** ${c.checkedBy}\n`);
  const indexFile = path.join(dir, 'INDEX.md');
  const cur = fs.existsSync(indexFile) ? read(indexFile) : '# Lessons index\n\n';
  writeAtomic(indexFile, cur.replace(/\n*$/, '\n') + `- ${lid} [${tags.join(', ')}] ${title} (${file})\n`);
  rewrite(idea, id, { status: 'APPROVED', fields: { Decision: `approved by the CEO ${stamp}`, Lesson: lid } });
  fs.appendFileSync(ceoLog, `- ${nowIso()} ${id} lesson candidate: approved as ${lid}${note ? ` (${note})` : ''}\n`);
  logEvent(idea.dir, 'ogden', `wrote ${lid} to the library after CEO approval of ${id}`);
  return { status: 'APPROVED', lesson: lid, file };
}

// Approved lessons whose tags match any of the given tags.
export function relevant(tags, root = repoRoot) {
  const want = new Set(tags.map((t) => t.toLowerCase()));
  return library(root).filter((l) => l.tags.some((t) => want.has(t)));
}

// Every lesson has a recorded CEO approval in its source idea (SPEC 14): used by lessons_check.
export function verifyLibrary(root = repoRoot) {
  const problems = [];
  for (const l of library(root)) {
    if (!/^\d{4}-\d{2}-\d{2} \(Debrief/.test(l.approved)) { problems.push(`${l.id} has no recorded approval`); continue; }
    const src = path.join(root, l.source.replace(/\/$/, ''), 'record', 'ceo-decisions.md');
    const wt = fs.existsSync(path.join(root, '.worktrees')) ? fs.readdirSync(path.join(root, '.worktrees')).map((d) => path.join(root, '.worktrees', d, l.source.replace(/\/$/, ''), 'record', 'ceo-decisions.md')) : [];
    const hit = [src, ...wt].find((f) => fs.existsSync(f) && read(f).includes(`approved as ${l.id}`));
    if (!hit) problems.push(`${l.id}: the CEO's approval is not recorded in ${l.source}record/ceo-decisions.md`);
  }
  return problems;
}

// Lessons that apply to the work of a cycle: tags from the planned areas, their owners and the stack.
export function forPlan(idea, areas, root = repoRoot) {
  const AREA_TAGS = { schema: ['schema', 'database', 'wirt'], api: ['api', 'griswold'], ui: ['ui', 'ux', 'adria'], tests: ['testing', 'tests', 'farnham'] };
  const tags = ['cain', ...areas.flatMap((a) => AREA_TAGS[a] ?? [])];
  const stack = parseStatus(read(path.join(idea.dir, 'status.md'))).active_stack;
  return relevant([...tags, ...String(stack).toLowerCase().split(/\W+/).filter((w) => w.length > 2)], root);
}
