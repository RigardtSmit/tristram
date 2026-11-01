// Debrief CLI (SPEC 13.2). Usage: node tools/debrief.mjs <start|close> <idea>
//   start <idea>               what the debrief must cover: the verdict and each lesson candidate with Lazarus's recommendation
//   close <idea> --by ogden    write record/debrief.md and move the item to CLOSED (refused while a candidate is undecided)
import { findIdea } from './lib/idea.mjs';
import { briefing, close } from './lib/debrief.mjs';
import { buildQueue } from './lib/queue.mjs';

const argv = process.argv.slice(2), cmd = argv[0];
const opt = (f) => { const i = argv.indexOf(f); return i === -1 ? undefined : argv[i + 1]; };
function fail(msg) { console.error(`debrief: ${msg}`); process.exit(1); }
try {
  const idea = findIdea(argv[1] ?? fail('usage: <start|close> <idea>'));
  if (cmd === 'start') {
    const b = briefing(idea);
    console.log(`${b.st.name}: debrief. ${b.review ? b.review.split('\n')[0] : 'No review file.'}`);
    console.log(b.candidates.length ? 'Lesson candidates (the CEO decides each in /queue):' : 'No lesson candidates. Ogden drafts them from lessons.md and the defect history.');
    for (const c of b.candidates) console.log(`  ${c.id} ${c.status} [${c.tags.join(', ')}] ${c.title}\n     Lazarus: ${c.lazarus || 'not yet'}`);
    buildQueue();
  } else if (cmd === 'close') {
    const r = close(idea, { by: opt('--by') });
    buildQueue();
    console.log(`${idea.name} is CLOSED after ${r.cycles} cycle(s). record/debrief.md written.`);
  } else fail('commands: start, close');
} catch (err) {
  fail(err.message);
}
