// /new-idea <name>: creates the branch, worktree and idea folder (SPEC 5.1, 16.1, 20).
// Run from the main checkout. Usage: node tools/new-idea.mjs <name> [--date YYYY-MM-DD]
import fs from 'node:fs';
import path from 'node:path';
import { repoRoot, git, nowIso } from './lib/paths.mjs';

const NAME_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const args = process.argv.slice(2);
const dateArg = args.indexOf('--date');
const date = dateArg !== -1 ? args[dateArg + 1] : nowIso().slice(0, 10);
const name = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--date');

function die(msg) {
  console.error(`new-idea: ${msg}`);
  process.exit(1);
}

if (!name) die('usage: new-idea <name>');
if (!NAME_RE.test(name)) die(`"${name}" is not valid. Use lowercase letters, digits and single hyphens.`);
if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) die(`bad date "${date}"`);

if (git(['rev-parse', '--abbrev-ref', 'HEAD']) !== 'main') die('run from the main checkout, on branch main');

const branch = `idea/${name}`;
const folder = `${date}-${name}`;
const worktreeRel = `.worktrees/${name}`;
const worktreeAbs = path.join(repoRoot, worktreeRel);

// Names are unique for the life of the factory: check branch, worktree and any folder suffix.
const branches = git(['for-each-ref', '--format=%(refname:short)', 'refs/heads/idea/']).split('\n');
if (branches.includes(branch)) die(`branch ${branch} already exists`);
if (fs.existsSync(worktreeAbs)) die(`${worktreeRel} already exists`);
const roots = [repoRoot];
const wtDir = path.join(repoRoot, '.worktrees');
if (fs.existsSync(wtDir)) for (const d of fs.readdirSync(wtDir)) roots.push(path.join(wtDir, d));
let maxWi = 0;
for (const r of roots) {
  const ideas = path.join(r, 'ideas');
  if (!fs.existsSync(ideas)) continue;
  for (const d of fs.readdirSync(ideas)) {
    if (d.replace(/^\d{4}-\d{2}-\d{2}-/, '') === name) die(`an idea folder for "${name}" already exists (${d})`);
    const st = path.join(ideas, d, 'status.md');
    if (fs.existsSync(st)) {
      const m = fs.readFileSync(st, 'utf8').match(/^id: WI-(\d+)/m);
      if (m) maxWi = Math.max(maxWi, Number(m[1]));
    }
  }
}

// Work item numbers are global. The counter is git-ignored, so also respect numbers seen on disk.
const stateFile = path.join(repoRoot, '.factory', 'state.json');
let counter = 0;
if (fs.existsSync(stateFile)) counter = JSON.parse(fs.readFileSync(stateFile, 'utf8')).lastWorkItem ?? 0;
const wiNum = Math.max(counter, maxWi) + 1;
const id = `WI-${String(wiNum).padStart(3, '0')}`;

git(['worktree', 'add', '-b', branch, worktreeAbs, 'main']);

const ideaDir = path.join(worktreeAbs, 'ideas', folder);
const dirs = [
  'decisions', 'artifacts/schema', 'artifacts/backend', 'artifacts/ui', 'artifacts/tests',
  'handovers', 'changes', 'questions', 'cycles', 'reviews', 'town-square', 'record',
];
for (const d of dirs) {
  fs.mkdirSync(path.join(ideaDir, d), { recursive: true });
  fs.writeFileSync(path.join(ideaDir, d, '.gitkeep'), '');
}

const vars = { id, name, folder, branch, worktree: worktreeRel, created: nowIso() };
const fill = (t) => t.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? '');
const tpl = (f) => fs.readFileSync(path.join(repoRoot, 'tools', 'templates', 'idea', f), 'utf8');

fs.writeFileSync(path.join(ideaDir, 'status.md'), fill(tpl('status.md')));
fs.writeFileSync(path.join(ideaDir, 'brief.md'), fill(tpl('brief.md')));
fs.writeFileSync(path.join(ideaDir, 'plan.md'), `# Plan: ${name}\n\n(Cain writes this at the start of each cycle.)\n`);
fs.writeFileSync(path.join(ideaDir, 'lessons.md'), `# Lesson candidates: ${name}\n\nCandidates only. Not rules until the CEO approves them in a debrief.\n`);
fs.writeFileSync(path.join(ideaDir, 'record', 'log.md'), `# Log: ${name}\n\nAppend-only.\n\n- ${vars.created} factory: ${id} created on ${branch}\n`);
fs.writeFileSync(path.join(ideaDir, 'record', 'metrics.jsonl'), '');
fs.writeFileSync(
  path.join(ideaDir, 'record', 'transitions.jsonl'),
  JSON.stringify({ ts: vars.created, idea: folder, item: id, from: null, to: 'BRIEFING', note: 'created' }) + '\n',
);

fs.mkdirSync(path.dirname(stateFile), { recursive: true });
fs.writeFileSync(stateFile, JSON.stringify({ lastWorkItem: wiNum }) + '\n');

git(['add', '-A'], worktreeAbs);
git(['commit', '-m', `checkpoint: ${id} created (new-idea, cycle 0, factory)`], worktreeAbs);

console.log(`Created ${id}`);
console.log(`  folder:   ideas/${folder}/`);
console.log(`  branch:   ${branch}`);
console.log(`  worktree: ${worktreeRel}`);
