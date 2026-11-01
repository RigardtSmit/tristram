// Sending the CEO's mail (SPEC 17.7). Two methods, chosen in config/mail.json:
//   outbox  writes each message to ceo/outbox/ and sends nothing (the default until the CEO chooses a method)
//   smtp    Gmail SMTP with an app password; the account comes from the environment and mail only ever goes to that account
// Credentials are read from TRISTRAM_MAIL_USER and TRISTRAM_MAIL_PASS and never stored in the repository.
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import tls from 'node:tls';
import { repoRoot, nowIso } from './paths.mjs';

export const mailConfig = (root = repoRoot) => JSON.parse(fs.readFileSync(path.join(root, 'config', 'mail.json'), 'utf8'));

function smtpSend({ host, port, secure }, user, pass, to, subject, text) {
  return new Promise((resolve, reject) => {
    const sock = secure ? tls.connect({ host, port, servername: host }) : net.connect({ host, port });
    let buf = '', step = 0, done = false;
    const b64 = (s) => Buffer.from(s).toString('base64');
    const msg = [`From: ${user}`, `To: ${to}`, `Subject: ${subject}`, `Date: ${new Date().toUTCString()}`, 'MIME-Version: 1.0', 'Content-Type: text/plain; charset=utf-8', '', text.replace(/^\./gm, '..').replace(/\r?\n/g, '\r\n'), '.'].join('\r\n');
    const script = [
      [220, 'EHLO tristram'], [250, 'AUTH LOGIN'], [334, b64(user)], [334, b64(pass)], [235, `MAIL FROM:<${user}>`], [250, `RCPT TO:<${to}>`], [250, 'DATA'], [354, msg], [250, 'QUIT'],
    ];
    const finish = (err) => { if (done) return; done = true; sock.destroy(); err ? reject(err) : resolve(); };
    sock.setTimeout(20000, () => finish(new Error('the mail server did not answer in time')));
    sock.on('error', finish);
    sock.on('data', (d) => {
      buf += d.toString();
      let m;
      while ((m = buf.match(/^(\d{3})([ -])[^\n]*\r?\n/))) {                       // one full reply at a time; "250-" lines continue
        buf = buf.slice(m[0].length);
        if (m[2] === '-') continue;
        const code = Number(m[1]);
        if (step >= script.length) return finish();
        if (code !== script[step][0]) return finish(new Error(`mail server said ${code} at step ${step + 1}, expected ${script[step][0]}`));
        sock.write(script[step][1] + '\r\n');
        step += 1;
      }
    });
    sock.on('close', () => finish(step >= script.length ? undefined : new Error('the mail server closed the connection early')));
  });
}

export async function send({ subject, text }, root = repoRoot, env = process.env) {
  const cfg = mailConfig(root);
  if (cfg.method === 'smtp') {
    const user = env.TRISTRAM_MAIL_USER, pass = env.TRISTRAM_MAIL_PASS;
    if (!user || !pass) throw new Error('TRISTRAM_MAIL_USER and TRISTRAM_MAIL_PASS are not set in the environment, so nothing was sent');
    await smtpSend(cfg.smtp, user, pass, user, subject, text);       // to self only
    return { method: 'smtp', to: user };
  }
  const dir = path.join(root, 'ceo', 'outbox');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${nowIso().replace(/[:]/g, '-')}-${String(fs.readdirSync(dir).length + 1).padStart(3, '0')}.txt`);
  fs.writeFileSync(file, `Subject: ${subject}\n\n${text}\n`);
  return { method: 'outbox', file };
}
