// Checkpoint (SPEC 16): commit the idea after a completed step and record the commit in status.md.
// Usage: node tools/checkpoint.mjs <idea> --step "schema frozen v1" --character wirt
// Safe to repeat: with nothing new to commit it records the current commit and changes nothing else.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { findIdea, parseStatus, setStatusFields, logEvent } from './lib/idea.mjs';
import { needsReview } from './lib/questions.mjs';

const argv = process.argv.slice(2);
const name = argv[0];
const opt = (f) => { const i = argv.indexOf(f); return i === -1 ? undefined : argv[i + 1]; };
function fail(msg, code = 1) { console.error(`checkpoint: ${msg}`); process.exit(code); }
if (!name || name.startsWith('--')) fail('usage: checkpoint <idea> --step "..." --character <name>');
const step = opt('--step') || fail('--step is required, for example --step "schema frozen v1"');
const who = opt('--character') || fail('--character is required');

const git = (args, cwd) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

try {
  const idea = findIdea(name);
  const root = idea.root;
  const st = parseStatus(fs.readFileSync(path.join(idea.dir, 'status.md'), 'utf8'));
  const branch = git(['rev-parse', '--abbrev-ref', 'HEAD'], root);
  if (branch !== `idea/${name}`) fail(`${root} is on branch ${branch}, not idea/${name}`);

  // Half-written artifacts are never checkpointed (SPEC 16.3).
  const leftovers = [];
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p); else if (e.name.endsWith('.tmp')) leftovers.push(path.relative(root, p));
    }
  })(idea.dir);
  if (leftovers.length) fail(`unfinished writes found, finish or remove them first:\n  ${leftovers.join('\n  ')}`);

  const rel = path.relative(root, idea.dir).replace(/\\/g, '/');
  const paths = [rel, 'knowledge/stacks'].filter((p) => fs.existsSync(path.join(root, p)));
  git(['add', '-A', '--', ...paths], root);
  const dirty = git(['status', '--porcelain', '--', ...paths], root);
  let hash;
  if (dirty) {
    git(['commit', '-q', '-m', `checkpoint: ${st.id} ${step} (cycle ${st.cycle}, ${who})`], root);
  }
  hash = git(['rev-parse', '--short', 'HEAD'], root);

  // Record the commit in status.md, then commit that record.
  setStatusFields(idea, { checkpoint: `${step} @ ${hash}` });
  logEvent(idea.dir, who, `checkpoint "${step}" at ${hash}`);
  git(['add', '-A', '--', rel], root);
  if (git(['status', '--porcelain', '--', rel], root)) git(['commit', '-q', '-m', `checkpoint record: ${st.id} ${hash}`], root);

  console.log(`Checkpoint ${hash}: ${step} (cycle ${st.cycle}, ${who})${dirty ? '' : ' [nothing new to commit]'}`);
  const pending = needsReview(idea);
  if (pending.length) {
    console.log(`\nCain must review ${pending.length} assumption(s) before the next step:`);
    for (const q of pending) console.log(`  ${q.id}  ${q.assumption}`);
    console.log(`Run: node tools/questions.mjs review ${name}`);
  }
} catch (err) {
  fail(err.stderr?.toString().trim() || err.message);
}
