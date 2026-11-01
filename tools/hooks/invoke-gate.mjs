// PreToolUse hook on Agent: refuses a new invocation when the village daily cap is reached, or when the item
// it names is BUDGET_EXHAUSTED or STOPPED (SPEC 15.2). Exit 2 blocks and sends the reason to Claude.
import { repoRoot } from '../lib/paths.mjs';

let raw = '';
for await (const chunk of process.stdin) raw += chunk;
let input = {};
try { input = JSON.parse(raw); } catch { process.exit(0); }
try {
  const { villageStatus } = await import('../lib/budget.mjs');
  const { ideaFromText } = await import('../lib/metrics.mjs');
  const v = villageStatus(repoRoot);
  if (v.capped) {
    process.stderr.write(`The village daily cap is reached (${v.invocations}/${v.cap.invocations} invocations, ${v.tokens}/${v.cap.tokens} tokens today). New invocations are paused until tomorrow or until the CEO raises config/budget.json.\n`);
    process.exit(2);
  }
  const idea = ideaFromText(`${input.tool_input?.prompt ?? ''}\n${input.tool_input?.description ?? ''}`, repoRoot);
  if (idea && ['BUDGET_EXHAUSTED', 'STOPPED'].includes(idea.status.state)) {
    process.stderr.write(`${idea.status.name} is ${idea.status.state}. Do not invoke characters for it until the CEO decides (/queue).\n`);
    process.exit(2);
  }
} catch (err) {
  process.stderr.write(`invoke-gate: ${err.message}\n`);
}
process.exit(0);
