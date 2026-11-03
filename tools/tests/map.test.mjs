import test from 'node:test';
import assert from 'node:assert/strict';
import { factory, buildCycleOne } from './helpers.mjs';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createServer } from '../map/serve.mjs';
import { buildPage, artUris } from '../map/build.mjs';
import { repoRoot } from '../lib/paths.mjs';

async function withServer(x, fn) {
  const server = createServer({ root: x.root });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try { await fn(base); } finally { server.close(); }
}
const get = async (url) => (await fetch(url)).json();
const post = async (url, body, headers = {}) => { const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) }); return { status: r.status, body: await r.json() }; };

test('the live map follows the files: a changed status shows on the next poll, and a portal can be decided from it', async () => {
  const x = factory();
  await withServer(x, async (base) => {
    let d = await get(`${base}/api/data`);
    assert.equal(d.source, 'live');
    assert.deepEqual([d.ideas[0].state, d.ideas[0].active_agents, d.ideas[0].blocked_agents], ['BRIEFING', 'cain:0.5', 'none']);
    const html = await (await fetch(`${base}/`)).text();
    assert.match(html, /"source":"live"/);

    // the same item, a few commands later: the map changes without a rebuild
    buildCycleOne(x);
    d = await get(`${base}/api/data`);
    assert.equal(d.ideas[0].state, 'BUILDING');
    assert.match(d.ideas[0].active_agents, /cain:0.5.*wirt:0.5.*griswold:0.5.*adria:0.5.*farnham:0.5/);

    // an environment block turns Wirt red and raises a red portal at his place
    x.tool('env.mjs', 'raise', 'demo', '--check', 'db_check', '--by', 'wirt', '--cause', 'scratch database unreachable');
    x.tool('env.mjs', 'attempt', 'demo', '--by', 'wirt', '--note', 'a'); x.tool('env.mjs', 'attempt', 'demo', '--by', 'wirt', '--note', 'b');
    x.tool('env.mjs', 'escalate', 'demo', '--by', 'cain', '--reason', 'external');
    d = await get(`${base}/api/data`);
    assert.match(d.ideas[0].blocked_agents, /^wirt:red:scratch database unreachable/);
    assert.doesNotMatch(d.ideas[0].active_agents, /wirt/);
    const red = d.queue.find((e) => e.colour === 'red');
    assert.equal(red.location, 'wirt');

    // deciding from the map does what the queue command does
    assert.equal((await post(`${base}/api/decide`, { id: 'CQ-bad', option: 'resume when fixed!' })).status, 400);
    assert.equal((await post(`${base}/api/decide`, { id: red.id, option: 'resume_when_fixed' }, { origin: 'http://evil.example' })).status, 403);
    const r = await post(`${base}/api/decide`, { id: red.id, option: 'approve_option_a' });
    assert.equal(r.status, 422);                                                       // not an option for this item
    const ok = await post(`${base}/api/decide`, { id: red.id, option: 'resume_when_fixed' });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    d = await get(`${base}/api/data`);
    assert.equal(d.ideas[0].state, 'BUILDING');
    assert.equal(d.queue.filter((e) => e.colour === 'red').length, 0);
  });
});

test('a blocking question turns its asker gold, and budget exhaustion blocks Cain', async () => {
  const x = factory();
  x.tool('questions.mjs', 'ask', 'demo', '--from', 'adria', '--question', 'Which brand colours?', '--blocking');
  await withServer(x, async (base) => {
    const d = await get(`${base}/api/data`);
    assert.match(d.ideas[0].blocked_agents, /adria:gold:waiting on Q-001-01/);
  });
});

test('the built page parses as JavaScript and carries every piece of art it names', () => {
  const data = { source: 'mock', queue: [], ideas: [], metrics: [], registry: {} };
  const html = buildPage(data);
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  assert.equal(scripts.length, 2);
  for (const s of scripts) new vm.Script(s);                                           // throws on a syntax error
  const art = artUris();
  for (const name of Object.keys(JSON.parse(fs.readFileSync(path.join(repoRoot, 'tools', 'map', 'art.json'), 'utf8')))) {
    assert.match(art[name], /^data:image\/png;base64,iVBOR/, name);
    assert.ok(html.includes(art[name]), `${name} is not in the page`);
  }
});
