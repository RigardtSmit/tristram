import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { factory, buildCycleOne } from './helpers.mjs';
import { send } from '../lib/mail.mjs';
import { digestText } from '../lib/notify.mjs';

const outbox = (x) => { const d = path.join(x.root, 'ceo', 'outbox'); return fs.existsSync(d) ? fs.readdirSync(d).sort().map((f) => fs.readFileSync(path.join(d, f), 'utf8')) : []; };
const redItem = () => {
  const x = factory(); buildCycleOne(x);
  x.tool('env.mjs', 'raise', 'demo', '--check', 'db_check', '--by', 'wirt', '--cause', 'scratch database unreachable');
  x.tool('env.mjs', 'attempt', 'demo', '--by', 'wirt', '--note', 'a'); x.tool('env.mjs', 'attempt', 'demo', '--by', 'wirt', '--note', 'b');
  x.tool('env.mjs', 'escalate', 'demo', '--by', 'cain', '--reason', 'external');
  return x;
};

test('a red portal sends exactly one alert, and the digest lists blue and gold items with age and overdue flags', () => {
  const x = redItem();
  const a = x.tool('queue/notify.mjs', 'alerts');
  assert.equal(a.status, 0, a.stderr);
  assert.match(a.stdout, /^\[RED\] 2026-01-01-demo: WI-001 demo: scratch database unreachable/);
  assert.equal(outbox(x).length, 1);
  assert.match(outbox(x)[0], /Subject: \[RED\] 2026-01-01-demo[\s\S]*Options: resume_when_fixed \| stop[\s\S]*Local link: file:\/\//);
  assert.match(x.tool('queue/notify.mjs', 'alerts').stdout, /No new alerts/);
  assert.equal(outbox(x).length, 1);                                                  // one email per entry, not per run

  const q = [
    { id: 'CQ-1', item: 'a', type: 'STACK_APPROVAL', colour: 'blue', raised: new Date(Date.now() - 30 * 3600000).toISOString(), summary: 'Approve the stack', options: [] },
    { id: 'CQ-2', item: 'b', type: 'BUDGET_WARNING', colour: 'gold', raised: new Date(Date.now() - 600000).toISOString(), summary: 'Used 72%', options: [] },
    { id: 'CQ-3', item: 'c', type: 'ENVIRONMENT_BLOCKED', colour: 'red', raised: new Date().toISOString(), summary: 'db down', options: [] },
  ];
  const d = digestText(q, x.root);
  assert.equal(d.subject, '[DIGEST] 1 decision(s) waiting, 1 warning(s)');
  assert.match(d.text, /\[BLUE\] CQ-1 a \(30 h, OVERDUE\): Approve the stack/);
  assert.match(d.text, /\[GOLD\] CQ-2 b \(10 min\): Used 72%/);
  assert.doesNotMatch(d.text, /CQ-3/);                                                // red items are alerts, not digest entries
});

test('the digest is sent once a day and not when nothing is waiting', () => {
  const x = factory();
  x.tool('questions.mjs', 'ask', 'demo', '--from', 'adria', '--question', 'Which brand colours?', '--blocking');
  x.tool('questions.mjs', 'escalate', 'demo', 'Q-001-01', '--reason', 'a product decision');
  assert.match(x.tool('queue/notify.mjs', 'digest', '--force').stdout, /Sent: \[DIGEST\] 2 decision/);   // the stack approval and the question
  assert.match(outbox(x)[0], /\[BLUE\] CQ-.*Which brand colours/);
  assert.match(x.tool('queue/notify.mjs', 'digest').stdout, /already sent today/);
  assert.equal(outbox(x).length, 1);
  assert.equal(digestText([], x.root).count, 0);                                       // nothing waiting: nothing to send
});

test('smtp: mail goes only to the account in the environment, and nothing is sent without credentials', async () => {
  const x = factory();
  const cfg = path.join(x.root, 'config', 'mail.json');
  const got = [];
  const server = net.createServer((s) => {
    let data = '', inData = false;
    s.write('220 fake\r\n');
    s.on('data', (d) => {
      data += d.toString();
      let i;
      while ((i = data.indexOf('\r\n')) !== -1) {
        const line = data.slice(0, i); data = data.slice(i + 2);
        if (inData) { if (line === '.') { inData = false; s.write('250 queued\r\n'); } else got.push(line); continue; }
        got.push(line);
        if (line.startsWith('EHLO')) s.write('250-fake\r\n250 AUTH LOGIN\r\n');
        else if (line === 'AUTH LOGIN') s.write('334 VXNlcm5hbWU6\r\n');
        else if (/^[A-Za-z0-9+/=]+$/.test(line) && got.filter((l) => l === 'AUTH LOGIN').length && !got.some((l) => l.startsWith('MAIL'))) s.write(got.filter((l) => /^[A-Za-z0-9+/=]+$/.test(l) && l !== 'AUTH LOGIN' && !l.startsWith('EHLO')).length === 1 ? '334 UGFzc3dvcmQ6\r\n' : '235 ok\r\n');
        else if (line.startsWith('MAIL')) s.write('250 ok\r\n');
        else if (line.startsWith('RCPT')) s.write('250 ok\r\n');
        else if (line === 'DATA') { inData = true; s.write('354 go\r\n'); }
        else if (line === 'QUIT') { s.write('221 bye\r\n'); s.end(); }
      }
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  fs.writeFileSync(cfg, JSON.stringify({ method: 'smtp', smtp: { host: '127.0.0.1', port: server.address().port, secure: false }, digest_hour: 8, overdue_hours: 24 }));
  await assert.rejects(send({ subject: 's', text: 't' }, x.root, {}), /TRISTRAM_MAIL_USER and TRISTRAM_MAIL_PASS are not set/);
  const r = await send({ subject: '[RED] x: y', text: 'body line' }, x.root, { TRISTRAM_MAIL_USER: 'ceo@example.com', TRISTRAM_MAIL_PASS: 'app-password' });
  server.close();
  assert.deepEqual([r.method, r.to], ['smtp', 'ceo@example.com']);
  assert.ok(got.includes('MAIL FROM:<ceo@example.com>') && got.includes('RCPT TO:<ceo@example.com>'));
  assert.ok(got.includes('Subject: [RED] x: y') && got.includes('body line'));
  assert.ok(!got.some((l) => l.includes('app-password')));                           // the password is only ever sent encoded, in the AUTH step
});
