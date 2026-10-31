// Defects CLI. Usage: node tools/defects.mjs list <idea> [--all]
import { findIdea } from './lib/idea.mjs';
import { defectState } from './lib/defects.mjs';

const argv = process.argv.slice(2);
const [cmd, name] = argv;
function fail(msg) { console.error(`defects: ${msg}`); process.exit(1); }
try {
  if (cmd !== 'list' || !name) fail('usage: list <idea> [--all]');
  const idea = findIdea(name);
  const all = argv.includes('--all');
  const rows = [...defectState(idea).values()].filter((d) => all || d.state === 'open');
  if (!rows.length) console.log(all ? 'No defects recorded.' : 'No open defects.');
  for (const d of rows) console.log(`${d.id}  ${d.state.padEnd(5)} ${d.owner.padEnd(9)} ${d.check.padEnd(10)} raised in cycle ${d.raisedIn}  [${d.history.map((h) => `${h.cycle}:${h.result}`).join(' ')}]  ${d.summary}`);
} catch (err) {
  fail(err.message);
}
