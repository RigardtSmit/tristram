// Idea CLI. Usage: node tools/idea.mjs <command> [name] [options]
//   list                          all ideas and their state
//   status <name>                 stage, cycle, stack, gate, defects, last log entries   (/status)
//   gate <name>                   exit 0 if the build gate is open, 1 if not
//   accept-brief <name> --by ceo  record the CEO's approval of brief.md
//   accept-stack <name> --by ceo --option A|B   record the CEO's approval of ADR-001
//   set-state <name> <STATE> [--note "..."] [--actor name]
import { listIdeas, findIdea, describe, gate, acceptBrief, acceptStack, transition, STATES, MAX_CYCLES } from './lib/idea.mjs';

const argv = process.argv.slice(2);
const cmd = argv[0];
const opt = (flag) => { const i = argv.indexOf(flag); return i === -1 ? undefined : argv[i + 1]; };
const positional = argv.slice(1).filter((a, i, all) => !a.startsWith('--') && !(all[i - 1] || '').startsWith('--'));

function fail(msg, code = 1) { console.error(`idea: ${msg}`); process.exit(code); }

try {
  if (cmd === 'list') {
    const ideas = listIdeas();
    if (!ideas.length) { console.log('No ideas yet. Start one with /new-idea <name>.'); process.exit(0); }
    const rows = ideas.map((i) => [i.status.id, i.name, i.status.state, `${i.status.cycle}/${MAX_CYCLES}`, i.status.active_stack]);
    const all = [['Item', 'Idea', 'State', 'Cycle', 'Stack'], ...rows];
    const w = all[0].map((_, c) => Math.max(...all.map((r) => String(r[c]).length)));
    for (const r of all) console.log(r.map((v, c) => String(v).padEnd(w[c])).join('  ').trimEnd());
  } else if (cmd === 'status') {
    const idea = findIdea(positional[0] ?? fail('usage: status <name>'));
    const d = describe(idea);
    console.log(`${d.st.id} ${d.st.name}`);
    console.log(`  State:    ${d.st.state}   Stage: ${d.st.stage}   Cycle: ${d.st.cycle} of ${MAX_CYCLES}`);
    console.log(`  Stack:    ${d.st.active_stack}`);
    console.log(`  Brief:    ${d.briefStatus}${d.st.brief !== 'none' ? ` (${d.st.brief})` : ''}`);
    console.log(`  ADR-001:  ${d.adrStatus}`);
    console.log(`  Build gate: ${d.gate.ok ? 'open' : 'closed: ' + d.gate.problems.join('; ')}`);
    console.log(`  Open defects: ${d.defects.length}${d.defects.length ? '\n' + d.defects.map((l) => '    ' + l.trim()).join('\n') : ''}`);
    { const { usage } = await import('./lib/budget.mjs'); const u = usage(idea); console.log(u.ceilings ? `  Budget:   ${u.ceilings.size}, ${Math.round(u.pct * 100)}% used (${u.tokens} tokens, ${u.hours.toFixed(1)} h)` : '  Budget:   no size tier set (node tools/budget.mjs set-size)'); }
    console.log('  Last log entries:');
    for (const l of d.log) console.log(`    ${l}`);
  } else if (cmd === 'gate') {
    const idea = findIdea(positional[0] ?? fail('usage: gate <name>'));
    const g = gate(idea.dir);
    console.log(g.ok ? 'gate: open' : `gate: closed\n  - ${g.problems.join('\n  - ')}`);
    process.exit(g.ok ? 0 : 1);
  } else if (cmd === 'accept-brief') {
    const idea = findIdea(positional[0] ?? fail('usage: accept-brief <name> --by ceo'));
    console.log(`Brief ${acceptBrief(idea, opt('--by'))} accepted for ${idea.name}.`);
  } else if (cmd === 'accept-stack') {
    const idea = findIdea(positional[0] ?? fail('usage: accept-stack <name> --by ceo --option A'));
    acceptStack(idea, opt('--by'), opt('--option'));
    console.log(`ADR-001 accepted for ${idea.name}.`);
  } else if (cmd === 'set-state') {
    const idea = findIdea(positional[0] ?? fail('usage: set-state <name> <STATE>'));
    const to = (positional[1] ?? fail(`usage: set-state <name> <STATE>. States: ${STATES.join(', ')}`)).toUpperCase();
    const r = transition(idea, to, { note: opt('--note') || '', actor: opt('--actor') || 'factory' });
    console.log(`${idea.name}: ${r.from} -> ${r.to} (cycle ${r.cycle})`);
  } else {
    fail('commands: list, status, gate, accept-brief, accept-stack, set-state');
  }
} catch (err) {
  fail(err.message);
}
