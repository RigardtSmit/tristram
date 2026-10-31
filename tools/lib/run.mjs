// Run a stack command (declared in artifacts/<area>/factory.json) and report what happened.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

// factory.json tells the checks how to build and test an area on this idea's stack:
//   { "install": "npm ci", "build": "npm run build", "test": "npm test", "dist": "dist" }
export function readFactoryJson(areaDir) {
  const f = path.join(areaDir, 'factory.json');
  if (!fs.existsSync(f)) return null;
  try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (err) { throw new Error(`${f} is not valid JSON: ${err.message}`); }
}

// code: the exit code. kind: 'ok' | 'failed' | 'environment' (could not run, or timed out).
export function run(cmd, cwd, timeoutMs = 300000) {
  if (process.env.TRISTRAM_CMD_TIMEOUT_MS) timeoutMs = Number(process.env.TRISTRAM_CMD_TIMEOUT_MS);   // tests and tuning
  // The idea's own commands must not inherit state from whatever launched the factory (a parent test runner,
  // for instance, makes a nested "node --test" report success whatever happens).
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  const r = spawnSync(cmd, { cwd, shell: true, encoding: 'utf8', timeout: timeoutMs, maxBuffer: 32 * 1024 * 1024, env });
  const out = `${r.stdout || ''}${r.stderr || ''}`;
  if (r.error?.code === 'ETIMEDOUT') return { kind: 'environment', code: null, out, why: `timed out after ${timeoutMs / 1000}s: ${cmd}` };
  if (r.error) return { kind: 'environment', code: null, out, why: `could not run "${cmd}": ${r.error.message}` };
  return { kind: r.status === 0 ? 'ok' : 'failed', code: r.status, out, why: '' };
}

export const tail = (s, n = 15) => s.trim().split('\n').slice(-n).join('\n');
