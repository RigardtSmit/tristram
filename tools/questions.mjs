// Question log CLI. Usage: node tools/questions.mjs <command> <idea> [options]
//   ask <idea> --from <character> --question "..." [--blocking] [--assumption "..."]
//   answer <idea> <Q-id> --by cain|ceo --answer "..."
//   escalate <idea> <Q-id> --reason "..."                 (Cain only: CEO decisions)
//   accept-assumption <idea> <Q-id> --by ceo
//   list <idea> [--open | --assumptions | --all]
//   review <idea>                                         what Cain must review at this checkpoint (exit 1 if any)
//   review-one <idea> <Q-id> --by cain --decision keep|revise [--note "..."]
//   debrief <idea>                                        assumptions for the debrief and Lazarus's check
import { findIdea } from './lib/idea.mjs';
import * as Q from './lib/questions.mjs';

const argv = process.argv.slice(2);
const cmd = argv[0];
const opt = (flag) => { const i = argv.indexOf(flag); return i === -1 ? undefined : argv[i + 1]; };
const has = (flag) => argv.includes(flag);
const positional = argv.slice(1).filter((a, i, all) => !a.startsWith('--') && !(all[i - 1] || '').startsWith('--') || (all[i - 1] === '--blocking' && !a.startsWith('--')));
function fail(msg) { console.error(`questions: ${msg}`); process.exit(1); }

const line = (q) => `${q.id}  ${q.by.padEnd(9)} ${q.blocking ? 'BLOCKING' : 'assumed '}  ${q.pending ? `pending (${q.decider})` : 'answered'}  ${q.question}`;

try {
  const idea = findIdea(positional[0] ?? fail('usage: <command> <idea> ...'));
  if (cmd === 'ask') {
    const id = Q.ask(idea, opt('--from'), { question: opt('--question'), blocking: has('--blocking'), assumption: opt('--assumption') || '' });
    console.log(`Logged ${id}. ${has('--blocking') ? 'Blocking: work on anything independent, or wait.' : 'Proceed on your stated assumption; Cain reviews it at the next checkpoint.'}`);
  } else if (cmd === 'answer') {
    Q.answer(idea, positional[1] ?? fail('usage: answer <idea> <Q-id>'), { text: opt('--answer'), by: opt('--by') });
    console.log(`Answered ${positional[1]}.`);
  } else if (cmd === 'escalate') {
    Q.escalate(idea, positional[1] ?? fail('usage: escalate <idea> <Q-id>'), opt('--reason'));
    console.log(`${positional[1]} escalated to the CEO. It now waits in the CEO's queue.`);
  } else if (cmd === 'accept-assumption') {
    Q.acceptAssumption(idea, positional[1] ?? fail('usage: accept-assumption <idea> <Q-id>'), opt('--by'));
    console.log(`Assumption ${positional[1]} accepted by the CEO.`);
  } else if (cmd === 'list') {
    const all = Q.readAll(idea);
    const rows = has('--all') ? all : has('--assumptions') ? all.filter((q) => !q.blocking) : all.filter((q) => q.pending);
    if (!rows.length) console.log(has('--all') ? 'No questions logged.' : 'Nothing open.');
    for (const q of rows) console.log(line(q));
  } else if (cmd === 'review') {
    const rows = Q.needsReview(idea);
    if (!rows.length) { console.log('Checkpoint review: no assumptions waiting.'); process.exit(0); }
    console.log(`Checkpoint review: ${rows.length} assumption(s) for Cain`);
    for (const q of rows) console.log(`${line(q)}\n    assumption: ${q.assumption}`);
    process.exit(1);
  } else if (cmd === 'review-one') {
    Q.reviewOne(idea, positional[1] ?? fail('usage: review-one <idea> <Q-id>'), { decision: opt('--decision'), by: opt('--by'), note: opt('--note') || '' });
    console.log(`Reviewed ${positional[1]}.`);
  } else if (cmd === 'debrief') {
    const rows = Q.debriefAssumptions(idea);
    if (!rows.length) console.log('No assumptions were made.');
    for (const q of rows) console.log(`${q.id}  ${q.closed ? 'closed ' : 'OPEN   '} ${q.assumption}\n    answer: ${q.answer}\n    reviewed: ${q.reviewed}`);
    process.exit(rows.some((q) => !q.closed) ? 1 : 0);
  } else {
    fail('commands: ask, answer, escalate, accept-assumption, list, review, review-one, debrief');
  }
} catch (err) {
  fail(err.message);
}
