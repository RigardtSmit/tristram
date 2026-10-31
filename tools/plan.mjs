// plan.md CLI. Usage: node tools/plan.mjs <new|validate> <idea>
//   new <idea>        start plan.md for the current cycle from the template (Cain then fills it in)
//   validate <idea>   exit 1 if plan.md is missing something the cycle needs
import fs from 'node:fs';
import path from 'node:path';
import { repoRoot } from './lib/paths.mjs';
import { findIdea, parseStatus } from './lib/idea.mjs';
import { validatePlan } from './lib/plan.mjs';

const [cmd, name] = process.argv.slice(2);
function fail(msg) { console.error(`plan: ${msg}`); process.exit(1); }
try {
  if (!cmd || !name) fail('usage: <new|validate> <idea>');
  const idea = findIdea(name);
  if (cmd === 'new') {
    const st = parseStatus(fs.readFileSync(path.join(idea.dir, 'status.md'), 'utf8'));
    const target = path.join(idea.dir, 'plan.md');
    if (fs.existsSync(target) && !/\(Cain writes this/.test(fs.readFileSync(target, 'utf8')) && /^\*\*Cycle:\*\*\s*\d+/m.test(fs.readFileSync(target, 'utf8'))) {
      // keep last cycle's plan as history before starting the new one
      const old = fs.readFileSync(target, 'utf8');
      const prev = old.match(/^\*\*Cycle:\*\*\s*(\d+)/m)[1];
      if (Number(prev) !== Number(st.cycle)) fs.writeFileSync(path.join(idea.dir, `plan-cycle-${prev}.md`), old);
      else fail(`plan.md already exists for cycle ${st.cycle}. Edit it instead`);
    }
    const tpl = fs.readFileSync(path.join(repoRoot, 'tools', 'templates', 'idea', 'plan.md'), 'utf8');
    fs.writeFileSync(target, tpl.replace(/\{\{name\}\}/g, name).replace(/\{\{cycle\}\}/g, st.cycle));
    console.log(`plan.md started for cycle ${st.cycle}. Fill in the work items, dependencies and parallel steps.`);
  } else if (cmd === 'validate') {
    const problems = validatePlan(idea);
    console.log(problems.length ? `plan.md needs work:\n  - ${problems.join('\n  - ')}` : 'plan.md is valid.');
    process.exit(problems.length ? 1 : 0);
  } else fail('commands: new, validate');
} catch (err) {
  fail(err.message);
}
