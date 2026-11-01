// Budget CLI. Usage: node tools/budget.mjs <command>
//   show <idea>                       spend per cycle and per character, thresholds crossed        (/budget)
//   set-size <idea> <S|M|L> --by ceo  set the item's size tier (Cain proposes, the CEO approves)
//   increase <idea> [--tokens N] [--hours N] --by ceo   raise the ceiling and resume if BUDGET_EXHAUSTED
//   village                           today's use against the daily cap
//   record --transcript <file> --agent <name> [--idea <name>]   what the SubagentStop hook does
import { findIdea, setStatusFields, logEvent, transition } from './lib/idea.mjs';
import { usage, crossed, increase, villageStatus, evaluate } from './lib/budget.mjs';
import { recordInvocation } from './lib/invocation.mjs';

const argv = process.argv.slice(2), cmd = argv[0];
const opt = (f) => { const i = argv.indexOf(f); return i === -1 ? undefined : argv[i + 1]; };
const pos = argv.slice(1).filter((a, i, all) => !a.startsWith('--') && !(all[i - 1] || '').startsWith('--'));
function fail(msg) { console.error(`budget: ${msg}`); process.exit(1); }
const n = (v) => Number(v).toLocaleString('en-US');
const pct = (v) => `${Math.round(v * 100)}%`;

try {
  if (cmd === 'show') {
    const idea = findIdea(pos[0] ?? fail('usage: show <idea>'));
    const u = usage(idea);
    if (!u.ceilings) { console.log(`${idea.name}: no size tier set. Cain proposes S, M or L at the briefing; the CEO approves it (node tools/budget.mjs set-size ${idea.name} <S|M|L> --by ceo).`); process.exit(0); }
    console.log(`${idea.name}: size ${u.ceilings.size}, ${u.state}`);
    console.log(`  Tokens: ${n(u.tokens)} of ${n(u.ceilings.tokens)} (${pct(u.tokenPct)})`);
    console.log(`  Time:   ${u.hours.toFixed(1)} h of ${u.ceilings.hours} h (${pct(u.timePct)})`);
    console.log(`  Used:   ${pct(u.pct)} of the item budget; ${u.invocations} invocation(s)`);
    console.log('  Per cycle (share of the ceiling):');
    for (const c of ['1', '2', '3']) { const s = u.cycles[c]; console.log(`    cycle ${c}: ${n(s?.tokens ?? 0)} of ${n(u.shares[c])}${s && s.tokens > u.shares[c] ? '  OVER ITS SHARE' : ''}`); }
    console.log(`    reserve (Lazarus, debrief): ${n(u.shares.reserve)}`);
    console.log('  Per character:');
    for (const [a, s] of Object.entries(u.agents)) console.log(`    ${a.padEnd(9)} ${n(s.tokens)} tokens, ${s.invocations} invocation(s)`);
    const x = crossed(idea);
    console.log(`  Thresholds crossed: ${x.length ? x.map((c) => `${c.name} at ${c.pct}%`).join(', ') : 'none'}`);
  } else if (cmd === 'set-size') {
    const [name, size] = pos;
    if (!name || !['S', 'M', 'L'].includes(String(size).toUpperCase())) fail('usage: set-size <idea> <S|M|L> --by ceo');
    if (opt('--by') !== 'ceo') fail('only the CEO approves a size tier (--by ceo)');
    const idea = findIdea(name);
    setStatusFields(idea, { size: size.toUpperCase() });
    logEvent(idea.dir, 'ceo', `size tier set to ${size.toUpperCase()}`);
    console.log(`${name}: size ${size.toUpperCase()}.`);
  } else if (cmd === 'increase') {
    if (opt('--by') !== 'ceo') fail('no agent raises its own budget (--by ceo)');
    const idea = findIdea(pos[0] ?? fail('usage: increase <idea> --tokens N --hours N --by ceo'));
    increase(idea, { tokens: Number(opt('--tokens') || 0), hours: Number(opt('--hours') || 0) });
    if (idea.status.state === 'BUDGET_EXHAUSTED' || usage(idea).state === 'BUDGET_EXHAUSTED') transition(idea, 'BUILDING', { actor: 'ceo', note: 'budget increased' });
    const u = usage(idea);
    console.log(`${idea.name}: ceiling now ${n(u.ceilings.tokens)} tokens, ${u.ceilings.hours} h (${pct(u.pct)} used), ${u.state}.`);
  } else if (cmd === 'village') {
    const v = villageStatus();
    console.log(`Today (${v.day}): ${v.invocations} of ${v.cap.invocations} invocations, ${n(v.tokens)} of ${n(v.cap.tokens)} tokens${v.capped ? '  CAP REACHED: new invocations are paused' : ''}`);
  } else if (cmd === 'record') {
    const idea = opt('--idea') ? findIdea(opt('--idea')) : undefined;
    const r = recordInvocation({ transcript: opt('--transcript') ?? fail('--transcript is required'), agent: opt('--agent') ?? 'unknown', idea });
    console.log(`${r.rec.agent} #${r.rec.invocation}: ${n(r.rec.tokens_in)} in, ${n(r.rec.tokens_out)} out, ${r.rec.tool_calls} tool calls${r.events.length ? `; ${r.events.join(', ')}` : ''}`);
  } else fail('commands: show, set-size, increase, village, record');
} catch (err) {
  fail(err.message);
}
