// Contract CLI. Usage: node tools/contract.mjs <command> <idea> <schema|api> [options]
//   init <idea> schema [--engine sqlite]     create a DRAFT contract (Wirt, Griswold)
//   status <idea> schema                     draft or frozen, version, and whether the files still match
//   freeze <idea> schema --by cain           run the check, then mark FROZEN v1 (Cain only)
//   verify <idea> schema                     exit 1 if a frozen contract's files changed
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findIdea } from './lib/idea.mjs';
import { initContract, freeze, verify, readContract } from './lib/contract.mjs';

const argv = process.argv.slice(2);
const [cmd, name, kind] = argv;
const opt = (f) => { const i = argv.indexOf(f); return i === -1 ? undefined : argv[i + 1]; };
const here = path.dirname(fileURLToPath(import.meta.url));
function fail(msg) { console.error(`contract: ${msg}`); process.exit(1); }

// The check that must pass before a contract freezes.
const CHECKS = { schema: ['db_check.mjs'], api: ['api_check.mjs', '--contract-only'] };

try {
  if (!cmd || !name || !kind) fail('usage: <init|status|freeze|verify> <idea> <schema|api>');
  const idea = findIdea(name);
  if (cmd === 'init') {
    initContract(idea, kind, { engine: opt('--engine') || 'sqlite' });
    console.log(`${kind} contract created as DRAFT.`);
  } else if (cmd === 'status') {
    const c = readContract(idea, kind);
    if (!c) fail(`no ${kind} contract yet`);
    const v = verify(idea, kind);
    console.log(`${kind}: ${c.status} ${c.version}${c.engine ? `, engine ${c.engine}` : ''}${v.frozen ? (v.ok ? ', files match the freeze' : `, CHANGED since the freeze`) : ''}`);
    process.exit(v.ok ? 0 : 1);
  } else if (cmd === 'verify') {
    const v = verify(idea, kind);
    console.log(v.ok ? `${kind}: ok${v.frozen ? ` (FROZEN ${v.version}, unchanged)` : ' (DRAFT)'}` : `${kind}: ${v.problem}`);
    process.exit(v.ok ? 0 : 1);
  } else if (cmd === 'freeze') {
    if (opt('--by') !== 'cain') fail('Cain freezes contracts (use --by cain)');
    let checkPassed = false;
    const [script, ...extra] = CHECKS[kind] ?? [];
    if (script) {
      const r = spawnSync(process.execPath, ['--no-warnings', path.join(here, 'checks', script), name, ...extra], { encoding: 'utf8' });
      process.stdout.write(r.stdout);
      if (r.status === 2) { console.error(r.stderr); fail('environment failure while checking; the contract was not frozen'); }
      checkPassed = r.status === 0;
    } else checkPassed = true;
    const out = freeze(idea, kind, { by: 'cain', checkPassed });
    console.log(`${kind} contract FROZEN ${out.version}. Handover to the dependent characters is next.`);
  } else fail('commands: init, status, freeze, verify');
} catch (err) {
  fail(err.message);
}
