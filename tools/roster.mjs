// /roster [name] [--html]
import { CHARACTERS, loadRegistry, loadAgent, toolList } from './lib/registry.mjs';

const args = process.argv.slice(2);
if (args.includes('--html')) {
  console.error('roster --html is built in phase A13. Not available yet.');
  process.exit(1);
}
const name = args.find((a) => !a.startsWith('--'))?.toLowerCase();
const registry = loadRegistry();

function knowledgeCount(reg) {
  const kb = reg.knowledge_base ?? {};
  return (kb.read?.length ?? 0) + (kb.write?.length ?? 0);
}

if (name) {
  const reg = registry[name];
  if (!reg) {
    console.error(`Unknown character "${name}". Known: ${CHARACTERS.join(', ')}`);
    process.exit(1);
  }
  const agent = loadAgent(name);
  console.log(`${reg.character}: ${reg.role}`);
  console.log(`  Charter:    ${reg.charter}`);
  console.log(`  Model:      ${agent?.front?.model ?? '?'} (max turns ${agent?.front?.maxTurns ?? '?'})`);
  console.log(`  Tools:      ${toolList(reg.tools).join(', ')}`);
  console.log(`  Skills:     ${(reg.skills ?? []).map((s) => s.name).join(', ') || 'none'}`);
  console.log(`  Connectors: ${(reg.connectors ?? []).map((c) => `${c.name} (${c.access})`).join(', ') || 'none'}`);
  console.log(`  Reads:`);
  for (const p of reg.knowledge_base?.read ?? []) console.log(`    - ${p}`);
  console.log(`  Writes:`);
  for (const p of reg.knowledge_base?.write ?? []) console.log(`    - ${p}`);
  console.log(`  Checks:     ${(reg.checks_owned ?? []).join(', ') || 'none'}`);
  console.log(`  Lesson tags: ${(reg.lessons_tags ?? []).join(', ')}`);
} else {
  const rows = CHARACTERS.map((n) => {
    const r = registry[n];
    return r
      ? [r.character, r.role, toolList(r.tools).join(' '), String(r.skills?.length ?? 0), String(r.connectors?.length ?? 0), String(knowledgeCount(r))]
      : [n, 'MISSING', '', '', '', ''];
  });
  const head = ['Character', 'Role', 'Tools', 'Skills', 'Connectors', 'Knowledge'];
  const all = [head, ...rows];
  const w = head.map((_, i) => Math.max(...all.map((r) => r[i].length)));
  for (const r of all) console.log(r.map((c, i) => c.padEnd(w[i])).join('  ').trimEnd());
}
