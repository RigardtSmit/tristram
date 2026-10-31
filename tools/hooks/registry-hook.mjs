// PostToolUse hook (matcher Edit|Write). Runs the registry check when a file under
// .claude/, registry/ or .mcp.json changes. PostToolUse cannot block; exit 2 sends stderr to Claude.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

let raw = '';
for await (const chunk of process.stdin) raw += chunk;

let input = {};
try {
  input = JSON.parse(raw);
} catch {
  process.exit(0);
}

const file = String(input.tool_input?.file_path ?? '').replace(/\\/g, '/');
if (!/(^|\/)(\.claude\/|registry\/|\.mcp\.json$)/.test(file)) process.exit(0);

const check = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'checks', 'registry_check.mjs');
const res = spawnSync(process.execPath, [check], { encoding: 'utf8', cwd: process.env.CLAUDE_PROJECT_DIR || process.cwd() });
if (res.status === 0) process.exit(0);
process.stderr.write(res.stderr || res.stdout || 'registry_check failed');
process.exit(2);
