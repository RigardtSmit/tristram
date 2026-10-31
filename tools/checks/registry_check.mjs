// Registry consistency check (SPEC 6.5). Exit 0 pass, 1 defect, 2 environment failure.
import fs from 'node:fs';
import path from 'node:path';
import { repoRoot } from '../lib/paths.mjs';
import { CHARACTERS, loadRegistry, loadAgent, toolList, loadMcpServers } from '../lib/registry.mjs';

const root = process.env.FACTORY_ROOT ? path.resolve(process.env.FACTORY_ROOT) : repoRoot;
const problems = [];
const fail = (msg) => problems.push(msg);

let registry;
let mcp;
try {
  registry = loadRegistry(root);
  mcp = loadMcpServers(root);
} catch (err) {
  console.error(`registry_check: cannot read configuration: ${err.message}`);
  process.exit(2);
}

// A path may contain <placeholders> or a trailing "(tags: ...)" note. Check the part before them.
function existingPrefix(p) {
  let clean = p.replace(/\s*\(.*\)\s*$/, '').replace(/\s+#.*$/, '').trim();
  const idx = clean.indexOf('<');
  if (idx !== -1) clean = clean.slice(0, idx);
  return clean.replace(/\/+$/, '');
}

const FORBIDDEN_WRITE = ['knowledge/standards', 'knowledge/lessons', 'registry'];
const same = (a, b) => a.length === b.length && a.every((x) => b.includes(x));

for (const name of CHARACTERS) {
  const reg = registry[name];
  const agent = loadAgent(name, root);
  if (!reg) { fail(`${name}: registry/${name}.yaml is missing`); continue; }
  if (!agent) { fail(`${name}: .claude/agents/${name}.md is missing`); continue; }
  if (!agent.front) { fail(`${name}: agent file has no frontmatter`); continue; }
  const f = agent.front;

  if (f.name !== name) fail(`${name}: agent frontmatter name is "${f.name}"`);
  if (!f.description) fail(`${name}: agent frontmatter has no description`);
  if (!f.model) fail(`${name}: agent frontmatter has no model`);
  if (!f.maxTurns) fail(`${name}: agent frontmatter has no maxTurns`);
  if (String(reg.character).toLowerCase() !== name) fail(`${name}: registry character is "${reg.character}"`);
  if (reg.charter !== `.claude/agents/${name}.md`) fail(`${name}: registry charter path is "${reg.charter}"`);

  const agentTools = toolList(f.tools).filter((t) => !t.startsWith('mcp__'));
  const agentMcp = toolList(f.tools).filter((t) => t.startsWith('mcp__'));
  if (!same(agentTools, reg.tools ?? [])) {
    fail(`${name}: agent tools [${agentTools}] differ from registry tools [${reg.tools ?? []}]`);
  }

  const regSkills = (reg.skills ?? []).map((s) => s.name);
  if (!same(toolList(f.skills), regSkills)) {
    fail(`${name}: agent skills [${toolList(f.skills)}] differ from registry skills [${regSkills}]`);
  }
  for (const s of reg.skills ?? []) {
    if (!fs.existsSync(path.join(root, s.path))) fail(`${name}: skill path ${s.path} does not exist`);
  }

  const regConnectors = (reg.connectors ?? []).map((c) => c.name);
  for (const c of regConnectors) {
    if (!(c in mcp)) fail(`${name}: connector "${c}" is not defined in .mcp.json`);
    if (!agentMcp.some((t) => t.startsWith(`mcp__${c}__`))) {
      fail(`${name}: connector "${c}" is in the registry but not in the agent's tools`);
    }
  }
  for (const t of agentMcp) {
    const server = t.split('__')[1];
    if (!regConnectors.includes(server)) fail(`${name}: agent tool ${t} is not a registry connector`);
  }

  const kb = reg.knowledge_base ?? {};
  for (const section of ['read', 'write']) {
    for (const p of kb[section] ?? []) {
      const prefix = existingPrefix(p);
      if (prefix && !fs.existsSync(path.join(root, prefix))) {
        fail(`${name}: knowledge_base.${section} path ${p} does not exist`);
      }
    }
  }
  for (const p of kb.write ?? []) {
    const clean = existingPrefix(p);
    for (const bad of FORBIDDEN_WRITE) {
      if (clean === bad || clean.startsWith(`${bad}/`)) {
        const ogdenException = name === 'ogden' && bad === 'knowledge/lessons';
        if (!ogdenException) fail(`${name}: may not write to ${p}`);
      }
    }
  }
}

if (problems.length) {
  console.error(`registry_check: FAIL (${problems.length})`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`registry_check: PASS (${CHARACTERS.length} characters)`);
