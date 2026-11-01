// Town Square CLI (SPEC 13). The main session is the moderator: it carries each statement and records it here.
//   open <idea> [--kind blocked|debrief]     start a recorded session; prints who is summoned
//   say <idea> --speaker <name> --text "..." append a statement to the transcript (returns S<n>)
//   options <idea>                           the defects and the options A, B and C
//   decide <idea> A|B|C --by ceo [--to <character>] [--direction "..."] [--reason "..."] [--rely S1,S3]
import { findIdea } from './lib/idea.mjs';
import * as T from './lib/townsquare.mjs';
import { buildQueue } from './lib/queue.mjs';

const argv = process.argv.slice(2), cmd = argv[0];
const opt = (f) => { const i = argv.indexOf(f); return i === -1 ? undefined : argv[i + 1]; };
const pos = argv.slice(1).filter((a, i, v) => !a.startsWith('--') && !(v[i - 1] || '').startsWith('--'));
function fail(msg) { console.error(`townsquare: ${msg}`); process.exit(1); }
try {
  const idea = findIdea(pos[0] ?? fail('usage: <open|say|options|decide> <idea> ...'));
  if (cmd === 'open') {
    const r = T.open(idea, { kind: opt('--kind') });
    console.log(`Town Square ${r.base} opened. Summoned: ${r.summoned.join(', ')}. Transcript: ideas/${idea.dir.split(/[\\/]/).pop()}/town-square/${r.base}-transcript.md`);
  } else if (cmd === 'say') {
    console.log(T.say(idea, { speaker: opt('--speaker'), text: opt('--text') }));
  } else if (cmd === 'options') {
    const o = T.options(idea);
    for (const d of o.defects) console.log(`  ${d.id} (${d.owner}, ${d.check}): ${d.summary}  [${d.history.map((h) => `${h.cycle}:${h.result}`).join(' ')}]`);
    for (const x of o.options) console.log(`${x.key}${x.to ? ` (${x.to})` : ''}. ${x.label}`);
  } else if (cmd === 'decide') {
    const r = T.decide(idea, pos[1], { by: opt('--by'), to: opt('--to'), direction: opt('--direction'), reason: opt('--reason'), rely: (opt('--rely') ?? '').split(',').filter(Boolean) });
    buildQueue();
    console.log(`Town Square ${r.base}: option ${r.key}. ${idea.name} is now ${r.state}. Transcript and summary are in town-square/.`);
  } else fail('commands: open, say, options, decide');
} catch (err) {
  fail(err.message);
}
