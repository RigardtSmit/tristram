// Environment block CLI. Usage: node tools/env.mjs <command> <idea> [options]
//   raise <idea> --check db_check --by wirt --cause "scratch database unreachable"   an engineer reports a block mid-build
//   status <idea>                                          the open block, its attempts and who is next
//   attempt <idea> --by <owner> --note "what I tried" [--outcome failed|fixed]       the owner's try (two at most)
//   recheck <idea>                                         run the blocked checks again; says whether they run now
//   escalate <idea> --by cain --reason "..."               Cain confirms it is environmental: the CEO gets a red portal
//   resume <idea> --by <owner|cain|ceo>                    back to work in the same cycle
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findIdea, parseStatus } from './lib/idea.mjs';
import * as E from './lib/env.mjs';
import { buildQueue } from './lib/queue.mjs';
import fs from 'node:fs';

const argv = process.argv.slice(2);
const [cmd, name] = argv;
const opt = (f) => { const i = argv.indexOf(f); return i === -1 ? undefined : argv[i + 1]; };
const here = path.dirname(fileURLToPath(import.meta.url));
const OWNER = { db_check: 'wirt', api_check: 'griswold', ui_check: 'adria', test_check: 'farnham' };
function fail(msg) { console.error(`env: ${msg}`); process.exit(1); }
const refreshQueue = () => { try { buildQueue(); } catch { /* the queue is rebuilt on the next command */ } };

try {
  if (!cmd || !name) fail('usage: <raise|status|attempt|recheck|escalate|resume> <idea>');
  const idea = findIdea(name);
  if (cmd === 'raise') {
    const check = opt('--check') || fail('--check is required (db_check, api_check, ui_check or test_check)');
    const st = parseStatus(fs.readFileSync(path.join(idea.dir, 'status.md'), 'utf8'));
    E.open(idea, { checks: [check], owner: OWNER[check] || opt('--by'), cause: opt('--cause') || fail('--cause is required'), resumeTo: st.state === 'PRE_REVIEW' ? 'BUILDING' : st.state, actor: opt('--by') || 'factory', move: true });
    refreshQueue();
    console.log(`${name} is ENVIRONMENT_BLOCKED at cycle ${st.cycle}. This does not count toward the cycle limit. The owner has ${E.MAX_ATTEMPTS} attempts to fix it.`);
  } else if (cmd === 'status') {
    const e = E.current(idea);
    if (!e) { console.log('No open environment block.'); process.exit(0); }
    console.log(`Environment block, cycle ${e.cycle}: ${e.status}`);
    console.log(`  Owner: ${e.owner}   Checks: ${e.checks.join(', ')}   Resumes to: ${e.resumeTo}`);
    console.log(`  Cause: ${e.cause.split('\n')[0]}`);
    for (const [i, a] of e.attempts.entries()) console.log(`  Attempt ${i + 1}: ${a.note} (${a.outcome})`);
    console.log(e.status === 'escalated' ? `  Raised to the CEO: ${e.escalation.reason}` : e.attempts.length >= E.MAX_ATTEMPTS ? '  Next: Cain confirms and escalates.' : `  Next: ${e.owner} tries (${E.MAX_ATTEMPTS - e.attempts.length} attempt(s) left).`);
  } else if (cmd === 'attempt') {
    const n = E.attempt(idea, { by: opt('--by'), note: opt('--note'), outcome: opt('--outcome') });
    console.log(`Attempt ${n} of ${E.MAX_ATTEMPTS} recorded.${n >= E.MAX_ATTEMPTS ? ' If it is still blocked, Cain confirms and escalates.' : ''}`);
  } else if (cmd === 'recheck') {
    const e = E.current(idea) || fail('no open environment block');
    let worst = 0;
    for (const c of e.checks) {
      const r = spawnSync(process.execPath, ['--no-warnings', path.join(here, 'checks', `${c}.mjs`), name], { encoding: 'utf8' });
      console.log(`${c}: exit ${r.status} (${r.status === 2 ? 'still an environment failure' : 'runs now'})`);
      worst = Math.max(worst, r.status ?? 2);
    }
    process.exit(worst === 2 ? 2 : 0);
  } else if (cmd === 'escalate') {
    E.escalate(idea, { by: opt('--by'), reason: opt('--reason') });
    refreshQueue();
    console.log('Raised to the CEO. A red portal now shows in ceo/queue.json and on the map.');
  } else if (cmd === 'resume') {
    const r = E.resume(idea, { by: opt('--by') });
    refreshQueue();
    console.log(`${name} resumes: ENVIRONMENT_BLOCKED -> ${r.to}, still cycle ${r.cycle}. Run /cycle ${name}.`);
  } else fail('commands: raise, status, attempt, recheck, escalate, resume');
} catch (err) {
  fail(err.message);
}
