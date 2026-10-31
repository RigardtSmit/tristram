// Mocks CLI. Usage: node tools/mocks.mjs <command> <idea> [options]
//   generate <idea>                     (re)build mocks.md and mock-data.json from the frozen API contract
//   list <idea>                         the mocks and whether each has been replaced
//   replace <idea> <n> --by adria       mark a mock as replaced by the real call
//   serve <idea> [--port 4010]          run the mock API; ?mock_status=422 picks a documented error
import { findIdea } from './lib/idea.mjs';
import * as M from './lib/mocks.mjs';

const argv = process.argv.slice(2);
const cmd = argv[0];
const opt = (f) => { const i = argv.indexOf(f); return i === -1 ? undefined : argv[i + 1]; };
const positional = argv.slice(1).filter((a, i, all) => !a.startsWith('--') && !(all[i - 1] || '').startsWith('--'));
function fail(msg) { console.error(`mocks: ${msg}`); process.exit(1); }

try {
  const idea = findIdea(positional[0] ?? fail('usage: <command> <idea> ...'));
  if (cmd === 'generate') {
    const r = M.generate(idea);
    console.log(`Generated ${r.count} mocks from ${r.version}. Listed in artifacts/ui/mocks.md.`);
  } else if (cmd === 'list') {
    const m = M.readMocks(idea);
    if (!m) fail('no mocks yet. Run: generate');
    console.log(m.contract);
    for (const r of m.rows) console.log(`  ${String(r.n).padStart(2)}  ${r.endpoint.padEnd(28)} ${r.status.padEnd(8)} ${r.statuses}`);
  } else if (cmd === 'replace') {
    M.replace(idea, positional[1] ?? fail('usage: replace <idea> <n> --by adria'), opt('--by'));
    console.log(`Mock ${positional[1]} marked replaced.`);
  } else if (cmd === 'serve') {
    const port = Number(opt('--port') || 4010);
    await M.serve(idea, port);
    console.log(`Mock API for ${idea.name} on http://127.0.0.1:${port} (add ?mock_status=422 to get a documented error). Ctrl+C to stop.`);
  } else fail('commands: generate, list, replace, serve');
} catch (err) {
  fail(err.message);
}
