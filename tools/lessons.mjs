// Lessons CLI (SPEC 14). Usage: node tools/lessons.mjs <command> ...
//   candidate <idea> --title --tags a,b --trigger --rule [--checked-by] --evidence --by ogden
//   recommend <idea> LC-NN approve|edit|reject --reason "..." --by lazarus
//   decide <idea> LC-NN approve|reject --by ceo [--title ...] [--rule ...] [--tags a,b] [--note ...]
//   list [<idea>]                  the library, or one idea's candidates with their status
//   relevant --tags a,b            approved lessons that match the tags
//   verify                         every library lesson has a recorded CEO approval
import { findIdea } from './lib/idea.mjs';
import * as L from './lib/lessons.mjs';

const argv = process.argv.slice(2), cmd = argv[0];
const opt = (f) => { const i = argv.indexOf(f); return i === -1 ? undefined : argv[i + 1]; };
const pos = argv.slice(1).filter((a, i, v) => !a.startsWith('--') && !(v[i - 1] || '').startsWith('--'));
function fail(msg) { console.error(`lessons: ${msg}`); process.exit(1); }

try {
  if (cmd === 'candidate') {
    const id = L.addCandidate(findIdea(pos[0] ?? fail('usage: candidate <idea> ...')), { title: opt('--title'), tags: opt('--tags'), trigger: opt('--trigger'), rule: opt('--rule'), checkedBy: opt('--checked-by'), evidence: opt('--evidence'), by: opt('--by') });
    console.log(`${id} drafted (PENDING). It is not a rule until the CEO approves it in the debrief.`);
  } else if (cmd === 'recommend') {
    L.recommend(findIdea(pos[0]), pos[1], pos[2], { reason: opt('--reason'), by: opt('--by') });
    console.log(`${pos[1]}: Lazarus recommends ${pos[2]}.`);
  } else if (cmd === 'decide') {
    const r = L.decide(findIdea(pos[0]), pos[1], pos[2], { by: opt('--by'), note: opt('--note'), edits: { title: opt('--title'), rule: opt('--rule'), tags: opt('--tags') } });
    console.log(`${pos[1]}: ${r.status}${r.lesson ? ` as ${r.lesson} (knowledge/lessons/${r.file})` : ''}.`);
  } else if (cmd === 'list') {
    if (pos[0]) for (const c of L.candidates(findIdea(pos[0]))) console.log(`${c.id}  ${c.status.padEnd(8)} [${c.tags.join(', ')}] ${c.title}${c.lazarus ? `\n        Lazarus: ${c.lazarus}` : ''}`);
    else { const lib = L.library(); if (!lib.length) console.log('The library is empty.'); for (const l of lib) console.log(`${l.id}  [${l.tags.join(', ')}] ${l.title}`); }
  } else if (cmd === 'relevant') {
    for (const l of L.relevant((opt('--tags') ?? '').split(','))) console.log(`${l.id}  ${l.title}: ${l.rule}`);
  } else if (cmd === 'verify') {
    const p = L.verifyLibrary();
    if (p.length) { console.error(p.join('\n')); process.exit(1); }
    console.log('Every library lesson has a recorded CEO approval.');
  } else fail('commands: candidate, recommend, decide, list, relevant, verify');
} catch (err) {
  fail(err.message);
}
