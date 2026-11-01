// Resume (SPEC 16.4). Usage: node tools/resume.mjs <idea>
// Reads status.md, confirms the checkpoint commit exists, rejects unfinished writes, finishes a cycle end that was
// interrupted, and says what happens next. Every step it takes is safe to repeat, so a crash never double-counts a cycle.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { findIdea, parseStatus, logEvent } from './lib/idea.mjs';
import { openDefectList } from './lib/defects.mjs';
import { readPlan } from './lib/plan.mjs';
import { current as session } from './lib/townsquare.mjs';
import { buildQueue } from './lib/queue.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const name = process.argv[2];
function fail(msg) { console.error(`resume: ${msg}`); process.exit(1); }
const git = (args, cwd) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
const say = (m) => console.log(m);

try {
  const idea = findIdea(name ?? fail('usage: resume <idea>'));
  const st = () => parseStatus(fs.readFileSync(path.join(idea.dir, 'status.md'), 'utf8'));
  let s = st();
  say(`${s.id} ${s.name}: ${s.state}, cycle ${s.cycle}, stage ${s.stage}.`);

  // 1. the checkpoint must be a real commit
  const m = s.checkpoint.match(/^(.*) @ ([0-9a-f]{7,40})$/);
  if (m) {
    try { git(['cat-file', '-e', `${m[2]}^{commit}`], idea.root); say(`Checkpoint "${m[1]}" @ ${m[2]} exists.`); }
    catch { fail(`the checkpoint commit ${m[2]} named in status.md does not exist in ${idea.root}. Do not continue until the CEO decides how to recover`); }
  } else say('No checkpoint recorded yet; resuming from the start of the current state.');

  // 2. half-written artifacts are never trusted
  const tmp = [];
  (function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (e.name.endsWith('.tmp')) tmp.push(path.relative(idea.dir, p)); } })(idea.dir);
  if (tmp.length) fail(`unfinished writes found, remove or finish them and run resume again:\n  ${tmp.join('\n  ')}`);

  // 3. a cycle end that was cut off after PRE_REVIEW began: repeat it (recording is idempotent)
  const reviewed = fs.existsSync(path.join(idea.dir, 'reviews', `review-${s.cycle}.md`));
  if (s.state === 'PRE_REVIEW' && !reviewed) {
    const hasPlan = readPlan(idea)?.cycle === Number(s.cycle);
    if (hasPlan) {
      say('The last cycle end may have been interrupted; repeating it (nothing is counted twice).');
      const r = spawnSync(process.execPath, ['--no-warnings', path.join(here, 'cycle.mjs'), 'end', idea.name], { encoding: 'utf8' });
      process.stdout.write(r.stdout);
      if (r.stderr) process.stderr.write(r.stderr);
      s = st();
      say(`Now ${s.state}, cycle ${s.cycle}.`);
    }
  }
  logEvent(idea.dir, 'factory', `resumed in ${s.state}, cycle ${s.cycle}`);
  try { buildQueue(); } catch { /* rebuilt by the next queue command */ }

  // 4. what happens next
  const open = openDefectList(idea);
  const next = {
    BRIEFING: `Continue the briefing: /briefing ${idea.name}. The build gate opens when the brief and ADR-001 are both ACCEPTED.`,
    BUILDING: `Run /cycle ${idea.name}: Cain plans cycle ${s.cycle}${open.length ? `; ${open.length} defect(s) carry over (${[...new Set(open.map((d) => d.owner))].join(', ')})` : ''}.`,
    PRE_REVIEW: `All pre-review checks are clean. Run /review ${idea.name} for Lazarus.`,
    IN_REVIEW: `Lazarus is reviewing. Continue with /review ${idea.name} (flags, then the verdict).`,
    NOT_READY: `Lazarus found problems; run /cycle ${idea.name}.`,
    DEBRIEF: `Run /debrief ${idea.name}.`,
    BLOCKED_FOR_CEO: `Waiting for the CEO: /town-square ${idea.name}${session(idea) ? ` (session ${session(idea).base} is open)` : ''} or /queue.`,
    ENVIRONMENT_BLOCKED: `Waiting on an environment fix: node tools/env.mjs status ${idea.name}, or /queue if it was escalated.`,
    BUDGET_EXHAUSTED: `Waiting for the CEO's budget decision in /queue.`,
    PAUSED: `The item is paused. Resume it from the state it was paused in.`,
    CLOSED: 'Closed. Nothing to resume.', STOPPED: 'Stopped by the CEO. Nothing to resume.',
  }[s.state];
  say(`Next: ${next}`);
} catch (err) {
  fail(err.message);
}
