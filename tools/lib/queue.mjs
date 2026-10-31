// The CEO queue (SPEC 17): everything waiting for the CEO, generated from the ideas' own files.
// ceo/queue.json is rebuilt on demand and git-ignored; ids are kept stable in ceo/queue-index.json.
import fs from 'node:fs';
import path from 'node:path';
import { repoRoot, nowIso } from './paths.mjs';
import { listIdeas, writeAtomic, docStatus } from './idea.mjs';
import { current as currentEnv } from './env.mjs';
import { readAll as readQuestions } from './questions.mjs';
import { openDefectList } from './defects.mjs';
import { open as openFlaky } from './flaky.mjs';

const rel = (idea, p) => path.relative(idea.dir, p).replace(/\\/g, '/');
const readIf = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n') : null);

function lastTransition(idea, to) {
  const t = readIf(path.join(idea.dir, 'record', 'transitions.jsonl'));
  const hits = (t || '').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((e) => e.to === to);
  return hits.length ? hits[hits.length - 1].ts : null;
}

// What needs the CEO right now, as { key, item, type, colour, raised, summary, options, detail } (no ids yet).
export function collect(idea) {
  const out = [];
  const st = idea.status;
  const folder = path.basename(idea.dir);

  const adr = readIf(path.join(idea.dir, 'decisions', 'ADR-001-stack.md'));
  if (docStatus(adr) === 'PROPOSED') {
    out.push({ key: 'stack', item: folder, type: 'STACK_APPROVAL', colour: 'blue', raised: fs.statSync(path.join(idea.dir, 'decisions', 'ADR-001-stack.md')).mtime.toISOString().replace(/\.\d{3}Z$/, 'Z'),
      summary: `Approve the stack for ${st.id} ${st.name}`, options: ['approve_option_a', 'approve_option_b', 'new_proposal'], detail: 'decisions/ADR-001-stack.md' });
  }

  if (st.state === 'BLOCKED_FOR_CEO') {
    const defects = openDefectList(idea);
    const owners = [...new Set(defects.map((d) => d.owner))];
    out.push({ key: 'blocked', item: folder, type: 'BLOCKED_FOR_CEO', colour: 'blue', raised: lastTransition(idea, 'BLOCKED_FOR_CEO') || nowIso(),
      summary: `${st.id} ${st.name} is blocked after cycle ${st.cycle}: ${defects.length ? defects.slice(0, 2).map((d) => `${d.id} ${d.summary}`).join('; ') : 'no open defects recorded'}`.slice(0, 220),
      options: ['send_to_lazarus', ...owners.map((o) => `return_to:${o}`), 'stop'], detail: `cycles/cycle-${st.cycle}/defects.md` });
  }

  const env = currentEnv(idea);
  if (env?.status === 'escalated') {
    out.push({ key: `env-${env.cycle}`, item: folder, type: 'ENVIRONMENT_BLOCKED', colour: 'red', raised: env.escalation.ts,
      summary: `${st.id} ${st.name}: ${env.cause.split('\n')[0]} (after ${env.attempts.length} attempts by ${env.owner})`.slice(0, 220), options: ['resume_when_fixed', 'stop'], detail: `cycles/cycle-${env.cycle}/env.md`, location: env.owner });
  }

  for (const f of openFlaky(idea)) {
    out.push({ key: `flaky-${f.check}`, item: folder, type: 'FLAKY_CHECK', colour: 'gold', raised: f.ts,
      summary: `${f.check} passed only after ${f.retries} retr${f.retries === 1 ? 'y' : 'ies'} in cycle ${f.cycle} of ${st.id} ${st.name}`, options: ['acknowledge'], detail: `record/flaky.jsonl` });
  }

  for (const q of readQuestions(idea).filter((x) => x.pending && x.decider === 'ceo')) {
    out.push({ key: `q-${q.id}`, item: folder, type: 'QUESTION', colour: 'blue', raised: q.raised,
      summary: `${q.id} from ${q.by}: ${q.question}`.slice(0, 220), options: q.blocking ? ['answer'] : ['answer', 'accept_assumption'], detail: `questions/${q.file}`, location: q.by });
  }
  return out;
}

export function buildQueue(root = repoRoot) {
  const ideas = listIdeas(root);
  const entries = ideas.flatMap((i) => collect(i).map((e) => ({ ...e, idea: i.name })));
  const idxFile = path.join(root, 'ceo', 'queue-index.json');
  const idx = fs.existsSync(idxFile) ? JSON.parse(fs.readFileSync(idxFile, 'utf8')) : { counter: {}, ids: {} };
  for (const e of entries) {
    const k = `${e.idea}|${e.key}`;
    if (!idx.ids[k]) {
      const day = e.raised.slice(0, 10);
      idx.counter[day] = (idx.counter[day] || 0) + 1;
      idx.ids[k] = `CQ-${day}-${String(idx.counter[day]).padStart(3, '0')}`;
    }
    e.id = idx.ids[k];
  }
  entries.sort((a, b) => a.raised.localeCompare(b.raised));
  const out = entries.map(({ id, item, type, colour, raised, summary, options, detail, location, idea }) => ({ id, item, type, colour, raised, summary, options, detail, ...(location ? { location } : {}), idea }));
  fs.mkdirSync(path.join(root, 'ceo'), { recursive: true });
  writeAtomic(path.join(root, 'ceo', 'queue.json'), JSON.stringify(out, null, 2) + '\n');
  writeAtomic(idxFile, JSON.stringify(idx, null, 2) + '\n');
  return out;
}
