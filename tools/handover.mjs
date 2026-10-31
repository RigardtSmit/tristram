// Handover CLI. Usage: node tools/handover.mjs <command> <idea> [options]
//   create <idea> --from griswold --to adria,farnham --contract "api.yaml FROZEN v1" [--changed "..."] [--ready] [--mocks "1, 2"]
//   list <idea> [--to <character>] [--unread]
//   ack <idea> <HO-id> --by adria --version "api.yaml FROZEN v1"
//   summary <idea>          open handovers and the contract version each engineer is using   (/handover)
import { findIdea } from './lib/idea.mjs';
import * as H from './lib/handover.mjs';

const argv = process.argv.slice(2);
const cmd = argv[0];
const opt = (f) => { const i = argv.indexOf(f); return i === -1 ? undefined : argv[i + 1]; };
const has = (f) => argv.includes(f);
const positional = argv.slice(1).filter((a, i, all) => !a.startsWith('--') && !(all[i - 1] || '').startsWith('--'));
function fail(msg) { console.error(`handover: ${msg}`); process.exit(1); }

try {
  const idea = findIdea(positional[0] ?? fail('usage: <command> <idea> ...'));
  if (cmd === 'create') {
    const id = H.create(idea, { from: opt('--from'), to: opt('--to'), contract: opt('--contract'), changed: opt('--changed'), ready: has('--ready'), mocks: opt('--mocks') });
    console.log(`Created ${id}. Each addressee reads it at the start of its stage and acknowledges it with: node tools/handover.mjs ack ${idea.name} ${id} --by <name> --version "<contract>"`);
  } else if (cmd === 'list') {
    const to = opt('--to')?.toLowerCase();
    let rows = H.list(idea);
    if (to) rows = rows.filter((h) => h.to.includes(to));
    if (has('--unread') && to) rows = rows.filter((h) => !h.acks.some((a) => a.by === to));
    if (!rows.length) console.log('No handovers.');
    for (const h of rows) console.log(`${h.id}  ${h.from} -> ${h.to.join(', ')}  ${h.contract}  ready: ${h.ready ? 'yes' : 'no'}  mocks: ${h.mocks}  acks: ${h.acks.map((a) => a.by).join(', ') || 'none'}`);
  } else if (cmd === 'ack') {
    H.ack(idea, positional[1] ?? fail('usage: ack <idea> <HO-id>'), { by: opt('--by'), version: opt('--version') });
    console.log(`Acknowledged ${positional[1]}.`);
  } else if (cmd === 'summary') {
    const s = H.summary(idea);
    console.log(`Handovers for ${idea.name}: ${s.all.length}`);
    for (const h of s.all) console.log(`  ${h.id}  ${h.from} -> ${h.to.join(', ')}  ${h.contract}  ready: ${h.ready ? 'yes' : 'no'}`);
    console.log('Contract version each engineer last built against:');
    for (const c of ['wirt', 'griswold', 'adria', 'farnham']) console.log(`  ${c.padEnd(9)} ${s.using[c] ?? 'nothing acknowledged yet'}`);
    const waiting = Object.entries(s.unread).filter(([, v]) => v.length);
    if (waiting.length) { console.log('Not yet acknowledged:'); for (const [c, v] of waiting) console.log(`  ${c}: ${v.map((h) => h.id).join(', ')}`); }
  } else fail('commands: create, list, ack, summary');
} catch (err) {
  fail(err.message);
}
