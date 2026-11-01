// Merge a CLOSED idea into main (SPEC 16.1). Usage: node tools/merge.mjs <idea> --by ceo
// Only a CLOSED item merges; a STOPPED item keeps its branch and is never merged. Run from the main checkout.
// The branch is kept (history), the worktree is removed so the finished idea is read from main from now on.
import fs from 'node:fs';
import path from 'node:path';
import { findIdea, parseStatus, logEvent } from './lib/idea.mjs';
import { repoRoot, git } from './lib/paths.mjs';

const argv = process.argv.slice(2);
const name = argv[0];
const by = argv[argv.indexOf('--by') + 1];
function fail(msg) { console.error(`merge: ${msg}`); process.exit(1); }

try {
  if (!name || name.startsWith('--')) fail('usage: merge <idea> --by ceo');
  if (by !== 'ceo') fail('merging an idea into main is the CEO\'s decision (--by ceo)');
  const idea = findIdea(name);
  const st = parseStatus(fs.readFileSync(path.join(idea.dir, 'status.md'), 'utf8'));
  if (st.state !== 'CLOSED') fail(`${name} is ${st.state}. Only a CLOSED item merges${st.state === 'STOPPED' ? '; a STOPPED item keeps its branch and is not merged' : ''}`);
  if (idea.root === repoRoot) fail(`${name} is already in the main checkout`);
  if (git(['rev-parse', '--abbrev-ref', 'HEAD']) !== 'main') fail('run from the main checkout, on branch main');
  if (git(['status', '--porcelain', '--untracked-files=no'])) fail('the main checkout has uncommitted changes; commit or stash them first');
  if (git(['status', '--porcelain'], idea.root)) {
    logEvent(idea.dir, 'factory', 'final checkpoint before merge');
    git(['add', '-A'], idea.root);
    git(['commit', '-q', '-m', `checkpoint: ${st.id} closed (cycle ${st.cycle}, factory)`], idea.root);
  }
  git(['merge', '--no-ff', '-m', `Merge ${st.branch}: ${st.id} ${st.name} (closed after ${st.cycle} cycle(s))`, st.branch]);
  git(['worktree', 'remove', '--force', idea.root]);
  console.log(`${name} merged into main. Branch ${st.branch} kept; worktree removed.`);
} catch (err) {
  fail(err.message);
}
