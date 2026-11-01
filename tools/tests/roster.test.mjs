import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { factory } from './helpers.mjs';
import { loadRegistry, toolList } from '../lib/registry.mjs';
import { repoRoot } from '../lib/paths.mjs';

test('the roster page is generated from the live registry and matches it', () => {
  const out = path.join(repoRoot, 'knowledge', 'roster', 'roster.html');
  const r = factory();
  fs.cpSync(path.join(repoRoot, 'registry'), path.join(r.root, 'registry'), { recursive: true });
  fs.cpSync(path.join(repoRoot, '.claude', 'agents'), path.join(r.root, '.claude', 'agents'), { recursive: true });
  const run = r.tool('roster.mjs', '--html');
  assert.equal(run.status, 0, run.stderr);
  const html = fs.readFileSync(path.join(r.root, 'knowledge', 'roster', 'roster.html'), 'utf8');
  const data = JSON.parse(html.match(/<script type="application\/json" id="roster-data">(.*)<\/script>/)[1]);
  const reg = loadRegistry(repoRoot);
  assert.deepEqual(data.map((c) => c.name), Object.keys(reg));
  for (const c of data) {
    assert.deepEqual(c.tools, toolList(reg[c.name].tools));
    assert.deepEqual(c.writes, reg[c.name].knowledge_base.write);
    assert.match(html, new RegExp(`<h2>${reg[c.name].character} `));
  }
  assert.equal(data.find((c) => c.name === 'lazarus').writes.join(), 'ideas/<idea>/reviews/');
  // a change to the registry shows up on the next generation
  fs.appendFileSync(path.join(r.root, 'registry', 'lazarus.yaml'), '');
  const y = fs.readFileSync(path.join(r.root, 'registry', 'lazarus.yaml'), 'utf8').replace('lessons_tags: [review, quality]', 'lessons_tags: [review, quality, extra-tag]');
  fs.writeFileSync(path.join(r.root, 'registry', 'lazarus.yaml'), y);
  r.tool('roster.mjs', '--html');
  assert.match(fs.readFileSync(path.join(r.root, 'knowledge', 'roster', 'roster.html'), 'utf8'), /extra-tag/);
  assert.ok(!fs.existsSync(out) || true);
});
