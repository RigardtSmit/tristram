// Lazarus's review CLI (SPEC 11.3). Usage: node tools/review.mjs <command> <idea> ...
//   start <idea>                     check that every pre-review check passed, move to IN_REVIEW, list the test-quality flags
//   flags <idea>                     the flags of this cycle and what Lazarus decided about each
//   flag <idea> <TQ-id> confirm|dismiss --reason "..." --by lazarus
//   verdict <idea> READY|NOT_READY --by lazarus [--finding "owner|what is wrong"]... [--improvement "..."]...
//   waive <idea> --file f --test "name" --reason "..." --by cain     (logged reason for a skipped/deleted/changed test)
import { findIdea, parseStatus } from './lib/idea.mjs';
import * as R from './lib/review.mjs';
import { buildQueue } from './lib/queue.mjs';
import fs from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2), cmd = argv[0];
const opt = (f) => { const i = argv.indexOf(f); return i === -1 ? undefined : argv[i + 1]; };
const all = (f) => argv.flatMap((a, i) => (a === f ? [argv[i + 1]] : []));
const pos = argv.slice(1).filter((a, i, v) => !a.startsWith('--') && !(v[i - 1] || '').startsWith('--'));
function fail(msg) { console.error(`review: ${msg}`); process.exit(1); }
const show = (fl) => console.log(`${fl.id}  ${fl.rule.padEnd(17)} ${fl.file}${fl.line ? `:${fl.line}` : ''} "${fl.test}"  ${fl.disposition ? `[${fl.disposition.decision}: ${fl.disposition.reason}]` : '[not reviewed]'}`);

try {
  const idea = findIdea(pos[0] ?? fail('usage: <start|flags|flag|verdict|waive> <idea> ...'));
  const cycle = () => Number(parseStatus(fs.readFileSync(path.join(idea.dir, 'status.md'), 'utf8')).cycle);
  if (cmd === 'start') {
    if (opt('--by') !== 'lazarus') fail('only Lazarus starts a review (--by lazarus)');
    const r = R.start(idea);
    console.log(`${idea.name} is IN_REVIEW (cycle ${r.cycle}). ${r.flags.length ? `Review these ${r.flags.length} test-quality flag(s) before the verdict:` : 'No test-quality flags.'}`);
    r.flags.forEach(show);
  } else if (cmd === 'flags') {
    const f = R.flagsOf(idea, cycle());
    if (!f.length) console.log('No test-quality flags.');
    f.forEach(show);
  } else if (cmd === 'flag') {
    if (opt('--by') !== 'lazarus') fail('only Lazarus reviews a flag (--by lazarus)');
    show(R.disposition(idea, pos[1], pos[2], opt('--reason')));
  } else if (cmd === 'verdict') {
    if (opt('--by') !== 'lazarus') fail('only Lazarus gives a verdict (--by lazarus)');
    const findings = all('--finding').map((s) => { const [owner, ...rest] = s.split('|'); return { owner: owner.trim().toLowerCase(), text: rest.join('|').trim() }; });
    const r = R.verdict(idea, { verdict: (pos[1] || '').toUpperCase().replace('-', '_'), findings, improvements: all('--improvement') });
    console.log(`reviews/review-${cycle() === r.cycle ? r.cycle : r.cycle - 1}.md written. ${idea.name} is now ${r.state}${r.state === 'BUILDING' ? ` (cycle ${r.cycle})` : ''}.`);
  } else if (cmd === 'waive') {
    R.waive(idea, { file: opt('--file'), test: opt('--test'), reason: opt('--reason'), by: opt('--by') });
    console.log('waiver recorded.');
  } else fail('commands: start, flags, flag, verdict, waive');
  try { buildQueue(); } catch { /* rebuilt by the next queue command */ }
} catch (err) {
  fail(err.message);
}
