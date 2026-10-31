import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { repoRoot } from './paths.mjs';

export const CHARACTERS = ['cain', 'wirt', 'griswold', 'adria', 'farnham', 'lazarus', 'ogden'];

export function loadRegistry(root = repoRoot) {
  const out = {};
  for (const name of CHARACTERS) {
    const file = path.join(root, 'registry', `${name}.yaml`);
    out[name] = fs.existsSync(file) ? YAML.parse(fs.readFileSync(file, 'utf8')) : null;
  }
  return out;
}

// Parse the YAML frontmatter of an agent file. Returns null if there is none.
export function loadAgent(name, root = repoRoot) {
  const file = path.join(root, '.claude', 'agents', `${name}.md`);
  if (!fs.existsSync(file)) return null;
  const text = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  const m = text.match(/^---\n([\s\S]*?)\n---\n/);
  if (!m) return { file, front: null, body: text };
  return { file, front: YAML.parse(m[1]), body: text.slice(m[0].length) };
}

// tools may be a comma string or a YAML list.
export function toolList(value) {
  if (value == null) return [];
  const arr = Array.isArray(value) ? value : String(value).split(',');
  return arr.map((s) => String(s).trim()).filter(Boolean);
}

export function loadMcpServers(root = repoRoot) {
  const file = path.join(root, '.mcp.json');
  if (!fs.existsSync(file)) return {};
  return JSON.parse(fs.readFileSync(file, 'utf8')).mcpServers ?? {};
}
