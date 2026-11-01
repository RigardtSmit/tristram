// The guard (SPEC 20): decides whether a character may make a tool call. Used by tools/hooks/guard.mjs.
// A character may write only the paths in its registry file (knowledge_base.write); Lazarus's Bash is read-only;
// nobody writes the protected logs or pushes/rewrites history.
import path from 'node:path';
import { loadRegistry, CHARACTERS } from './registry.mjs';
import { repoRoot } from './paths.mjs';

const norm = (p) => String(p).replace(/\\/g, '/');

// A path relative to the repository (or the idea's worktree), with the worktree prefix removed.
export function relPath(file, root = repoRoot) {
  let p = norm(file);
  const r = norm(root).replace(/\/$/, '');
  if (p.toLowerCase().startsWith(`${r.toLowerCase()}/`)) p = p.slice(r.length + 1);
  return p.replace(/^\.worktrees\/[^/]+\//, '').replace(/^\.\//, '');
}

const PROTECTED = [/(^|\/)record\/(metrics|transitions)\.jsonl$/, /(^|\/)\.git\//, /^\.claude\/(settings|agents)/, /^config\//];

export function mayWrite(agent, file, registry, root = repoRoot) {
  const rel = relPath(file, root);
  if (rel.startsWith('..') || /^[a-z]:\//i.test(rel)) return { allow: false, reason: `${rel} is outside the factory` };
  if (PROTECTED.some((r) => r.test(rel))) return { allow: false, reason: `${rel} is written by hooks or the CEO, not by characters` };
  const reg = registry[agent];
  if (!reg) return { allow: true };
  const globs = (reg.knowledge_base?.write ?? []).map((g) => String(g).replace(/\s+#.*$/, '').trim());
  for (const g of globs) {
    const re = new RegExp(`^${g.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/<idea>/g, '[^/]+')}`);
    if (re.test(rel)) {
      if (rel.startsWith('knowledge/lessons/') && agent === 'ogden') return { allow: true, note: 'only after a recorded CEO approval' };
      return { allow: true };
    }
  }
  return { allow: false, reason: `${cap(agent)} may write only: ${globs.join(', ') || 'nothing'}. ${rel} is not among them` };
}
const cap = (s) => s[0].toUpperCase() + s.slice(1);

const READ_ONLY = new Set(['ls', 'cat', 'head', 'tail', 'grep', 'rg', 'wc', 'sort', 'uniq', 'diff', 'cut', 'tr', 'echo', 'pwd', 'stat', 'file', 'basename', 'dirname', 'find', 'sha256sum', 'git']);
const GIT_READ = new Set(['log', 'show', 'diff', 'status', 'ls-files', 'blame', 'rev-parse', 'branch', 'describe', 'shortlog']);
const NEVER = [/\bgit\s+(push|reset|clean|checkout\s+--|rebase|commit|merge|branch\s+-[dD])\b/, /\bgit\s+.*--force\b/, /\brm\s+-[a-z]*r[a-z]*f?\s+\/?\s*$/];

export function mayRunBash(agent, command) {
  const cmd = String(command ?? '');
  for (const r of NEVER) if (r.test(cmd)) return { allow: false, reason: 'history is never rewritten or pushed by a character' };
  if (/(^|[\s>])(\S*)(metrics|transitions)\.jsonl/.test(cmd) && /[>]|\btee\b|\bsed\s+-i|\brm\b|\bmv\b/.test(cmd)) return { allow: false, reason: 'the logs are written by hooks' };
  if (agent !== 'lazarus') return { allow: true };
  // Lazarus: read-only inspection. No redirects into files, no command that changes anything.
  const stripped = cmd.replace(/\d?>\s*&\d|\d?>\s*\/dev\/null/g, '');
  if (/>/.test(stripped)) return { allow: false, reason: 'Lazarus does not write files with Bash; his only write location is reviews/ (through the Write tool)' };
  for (const seg of stripped.split(/\|\||&&|\||;/).map((s) => s.trim()).filter(Boolean)) {
    const words = seg.split(/\s+/), first = words[0].replace(/^.*\//, '');
    if (!READ_ONLY.has(first)) {
      // reading check results through the review tool is allowed
      if (/^node\s+tools\/review\.mjs\s+(flags|start|flag|verdict)\b/.test(seg)) continue;
      if (/^node\s+tools\/(idea|defects|budget|queue|questions)\.mjs\s+(status|list|show|village)\b/.test(seg)) continue;
      return { allow: false, reason: `Lazarus's Bash is read-only inspection; "${first}" is not allowed` };
    }
    if (first === 'git' && !GIT_READ.has(words[1])) return { allow: false, reason: `Lazarus may only read git history; "git ${words[1]}" is not allowed` };
    if (first === 'find' && /-(exec|delete|ok|fprint)/.test(seg)) return { allow: false, reason: 'find may not run commands or delete' };
    if (first === 'git' && words[1] === 'branch' && words.length > 2 && !/^-(-list|a|r|v)$/.test(words[2])) return { allow: false, reason: 'git branch may only list' };
  }
  return { allow: true };
}

export function decide({ agent, tool, input, root = repoRoot, registry = loadRegistry(root) }) {
  const who = String(agent ?? '').toLowerCase();
  if (!CHARACTERS.includes(who)) return { allow: true };           // the main session (CEO / moderator) and non-characters
  if (tool === 'Write' || tool === 'Edit' || tool === 'NotebookEdit') return mayWrite(who, input.file_path ?? input.notebook_path ?? '', registry, root);
  if (tool === 'Bash') return mayRunBash(who, input.command);
  return { allow: true };
}
