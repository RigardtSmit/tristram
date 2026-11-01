// PreToolUse hook on Write, Edit and Bash: the guard (SPEC 20). Exit 2 blocks the call and sends the reason to the character.
// Calls from the main session carry no agent_type and pass: the CEO and the moderator are not restricted here.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

let raw = '';
for await (const chunk of process.stdin) raw += chunk;
let input = {};
try { input = JSON.parse(raw); } catch { process.exit(0); }
try {
  const root = process.env.CLAUDE_PROJECT_DIR || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  const { decide } = await import(new URL('../lib/guard.mjs', import.meta.url));
  const r = decide({ agent: input.agent_type, tool: input.tool_name, input: input.tool_input ?? {}, root });
  if (!r.allow) { process.stderr.write(`Blocked by the guard: ${r.reason}\n`); process.exit(2); }
} catch (err) {
  process.stderr.write(`guard: ${err.message}\n`);   // a broken guard must not stop the factory; the failure is visible
}
process.exit(0);
