// CEO queue CLI. Usage: node tools/queue.mjs <command>
//   build                 rebuild ceo/queue.json from every idea
//   list                  text list of everything waiting for the CEO, with options          (/queue)
//   decide <CQ-id> <option> [--note "..."]   record the CEO's choice in the item's record and carry it out where it is mechanical
import fs from 'node:fs';
import path from 'node:path';
import { buildQueue } from './lib/queue.mjs';
import { findIdea, transition, acceptStack, logEvent } from './lib/idea.mjs';
import * as E from './lib/env.mjs';
import { decide as decideLesson } from './lib/lessons.mjs';
import { decide as decideChange } from './lib/change.mjs';
import { increase, config } from './lib/budget.mjs';

const argv = process.argv.slice(2);
const cmd = argv[0];
const opt = (f) => { const i = argv.indexOf(f); return i === -1 ? undefined : argv[i + 1]; };
function fail(msg) { console.error(`queue: ${msg}`); process.exit(1); }
const ICON = { blue: 'BLUE', gold: 'GOLD', red: 'RED ', grey: 'GREY' };
const age = (iso) => { const m = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000)); return m < 90 ? `${m} min` : m < 2880 ? `${Math.round(m / 60)} h` : `${Math.round(m / 1440)} d`; };

try {
  if (cmd === 'build') {
    const q = buildQueue();
    console.log(`ceo/queue.json: ${q.length} item(s).`);
  } else if (cmd === 'list') {
    const q = buildQueue();
    if (!q.length) { console.log('Nothing is waiting for you.'); process.exit(0); }
    for (const e of q) {
      console.log(`[${ICON[e.colour]}] ${e.id}  ${e.type}  (${age(e.raised)})`);
      console.log(`       ${e.summary}`);
      console.log(`       idea: ${e.idea}   detail: ${e.detail}`);
      console.log(`       options: ${e.options.join(' | ')}`);
    }
  } else if (cmd === 'decide') {
    const [, id, option] = argv;
    if (!id || !option) fail('usage: decide <CQ-id> <option>');
    const entry = buildQueue().find((e) => e.id === id) || fail(`no queue item ${id}`);
    if (!entry.options.includes(option)) fail(`"${option}" is not an option for ${id}. Options: ${entry.options.join(', ')}`);
    if (entry.idea === '_village') { console.log(`${id}: acknowledged. The cap resets at midnight UTC.`); process.exit(0); }
    const idea = findIdea(entry.idea);
    let did = 'recorded; the character or Cain acts on it';
    if (option === 'stop') { transition(idea, 'STOPPED', { actor: 'ceo', note: `CEO stopped the item (${id})` }); did = 'item STOPPED (branch kept, not merged)'; }
    else if (option === 'resume_when_fixed') { const r = E.resume(idea, { by: 'ceo' }); did = `resumed at cycle ${r.cycle}`; }
    else if (entry.type === 'LESSON_APPROVAL') { const r = decideLesson(idea, entry.summary.match(/^LC-\d+/)[0], option, { by: 'ceo', note: opt('--note'), edits: { title: opt('--title'), rule: opt('--rule'), tags: opt('--tags') } }); did = `${r.status}${r.lesson ? ` as ${r.lesson}` : ''}`; }
    else if (entry.type === 'CHANGE_REQUEST') { const r = decideChange(idea, entry.detail.match(/CR-\d+/)[0], option, { by: 'ceo', note: opt('--note') }); did = `${r.status}${r.areas ? `; re-run ${r.areas.join(', ') || 'nothing'}; item is ${r.state}` : ''}`; }
    else if (option === 'increase_budget') {
      const t = config().sizes[String(idea.status.size).toUpperCase()] ?? { tokens: 0, hours: 0 };
      const add = { tokens: Number(opt('--tokens') || t.tokens / 2), hours: Number(opt('--hours') || t.hours / 2) };
      increase(idea, add);
      if (idea.status.state === 'BUDGET_EXHAUSTED') transition(idea, 'BUILDING', { actor: 'ceo', note: 'budget increased' });
      did = `budget raised by ${add.tokens} tokens, ${add.hours} h (default: half the tier)`;
    }
    else if (/^approve_option_[ab]$/.test(option)) { acceptStack(idea, 'ceo', option.slice(-1).toUpperCase()); did = 'ADR-001 accepted'; }
    const rec = path.join(idea.dir, 'record', 'ceo-decisions.md');
    fs.appendFileSync(rec, `- ${new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')} ${id} ${entry.type}: ${option}${opt('--note') ? ` (${opt('--note')})` : ''}\n`);
    logEvent(idea.dir, 'ceo', `decided ${id}: ${option}`);
    buildQueue();
    console.log(`${id}: ${option}. ${did}.`);
  } else fail('commands: build, list, decide');
} catch (err) {
  fail(err.message);
}
