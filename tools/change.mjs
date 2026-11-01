// Change request CLI (SPEC 8). Usage: node tools/change.mjs <command> <idea> ...
//   open <idea> --title "..." --why "..." --by ceo|cain   start changes/CR-NNN.md with an empty change map     (/change)
//   impact <idea> REQ-NN              the artifacts and tests that trace to a requirement
//   show <idea> [CR-NNN]              list the idea's change requests, or one with its validation
//   submit <idea> CR-NNN              Cain: the change map is complete, send it to the CEO
//   decide <idea> CR-NNN approve|reject|narrow --by ceo [--note "..."]
import { findIdea } from './lib/idea.mjs';
import * as C from './lib/change.mjs';
import { buildQueue } from './lib/queue.mjs';

const argv = process.argv.slice(2), cmd = argv[0];
const opt = (f) => { const i = argv.indexOf(f); return i === -1 ? undefined : argv[i + 1]; };
const pos = argv.slice(1).filter((a, i, all) => !a.startsWith('--') && !(all[i - 1] || '').startsWith('--'));
function fail(msg) { console.error(`change: ${msg}`); process.exit(1); }

try {
  const idea = findIdea(pos[0] ?? fail('usage: <open|impact|show|submit|decide> <idea> ...'));
  if (cmd === 'open') {
    if (!opt('--title') || !opt('--why')) fail('--title and --why are required');
    const id = C.open(idea, { title: opt('--title'), why: opt('--why'), by: opt('--by') });
    console.log(`${id} opened (DRAFT). Cain: node tools/change.mjs impact ${idea.name} <REQ-NN>, fill the change map in changes/${id}.md, then submit.`);
  } else if (cmd === 'impact') {
    const imp = C.impact(idea, pos[1] ?? fail('usage: impact <idea> REQ-NN'));
    for (const [k, v] of Object.entries(imp)) console.log(`${k.padEnd(20)} ${v || '-'}`);
  } else if (cmd === 'show') {
    const crs = pos[1] ? [C.find(idea, pos[1])] : C.list(idea);
    if (!crs.length) console.log('No change requests.');
    for (const cr of crs) {
      console.log(`${cr.id}  ${cr.status}  brief ${cr.briefFrom} -> ${cr.briefTo}  ${cr.title}`);
      if (pos[1]) { for (const p of C.validate(idea, cr)) console.log(`  problem: ${p}`); console.log(`  re-run: ${C.rerunAreas(cr).join(', ') || 'none'}`); }
    }
  } else if (cmd === 'submit') {
    C.submit(idea, pos[1] ?? fail('usage: submit <idea> CR-NNN'));
    console.log(`${pos[1]} is PROPOSED and waits for the CEO in /queue.`);
  } else if (cmd === 'decide') {
    const r = C.decide(idea, pos[1], pos[2], { by: opt('--by'), note: opt('--note') });
    console.log(`${pos[1]}: ${r.status}${r.areas ? `. Re-run: ${r.areas.join(', ') || 'nothing'}. Item is ${r.state}` : ''}.`);
  } else fail('commands: open, impact, show, submit, decide');
  if (['submit', 'decide'].includes(cmd)) buildQueue();
} catch (err) {
  fail(err.message);
}
