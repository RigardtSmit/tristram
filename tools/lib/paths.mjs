import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

// Root of the main checkout (tools/lib -> repo root).
export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// Normalise a Windows or POSIX path to forward slashes, relative to root when inside it.
export function toRel(p, root = repoRoot) {
  const abs = path.resolve(root, p.replace(/\\/g, '/'));
  const rel = path.relative(root, abs).replace(/\\/g, '/');
  return rel;
}

export function git(args, cwd = repoRoot) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

export function nowIso() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}
