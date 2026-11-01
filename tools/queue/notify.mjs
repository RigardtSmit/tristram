// The notifier (SPEC 17.7), run by a scheduled job on the CEO's machine. Uses no Claude quota.
//   node tools/queue/notify.mjs alerts [--dry-run]    one email per new red portal or exhausted budget (run every 5 minutes)
//   node tools/queue/notify.mjs digest [--force]      the daily digest of blue and gold items (run daily; sends once per day)
//   node tools/queue/notify.mjs test                  send one test message to yourself
//   node tools/queue/notify.mjs schedule              print the Windows Task Scheduler commands (nothing is registered)
import path from 'node:path';
import { alerts, digest } from '../lib/notify.mjs';
import { send, mailConfig } from '../lib/mail.mjs';
import { repoRoot } from '../lib/paths.mjs';

const argv = process.argv.slice(2), cmd = argv[0];
try {
  if (cmd === 'alerts') {
    const s = await alerts(repoRoot, { dryRun: argv.includes('--dry-run') });
    console.log(s.length ? s.join('\n') : 'No new alerts.');
  } else if (cmd === 'digest') {
    const r = await digest(repoRoot, { force: argv.includes('--force') });
    console.log(r.sent ? `Sent: ${r.subject}` : `Not sent: ${r.why}.`);
  } else if (cmd === 'test') {
    const r = await send({ subject: '[TEST] Tristram notifier', text: 'If you can read this, the notifier works.\n' });
    console.log(`Test message via ${r.method}${r.file ? `: ${r.file}` : ` to ${r.to}`}.`);
  } else if (cmd === 'schedule') {
    const node = process.execPath, script = path.join(repoRoot, 'tools', 'queue', 'notify.mjs');
    console.log(`Method in config/mail.json: ${mailConfig().method}. Nothing is registered by this command. To enable, run:\n`);
    console.log(`schtasks /Create /TN "Tristram alerts" /SC MINUTE /MO 5 /TR "\\"${node}\\" \\"${script}\\" alerts"`);
    console.log(`schtasks /Create /TN "Tristram digest" /SC DAILY /ST 08:00 /TR "\\"${node}\\" \\"${script}\\" digest"`);
    console.log('\nFor smtp, set TRISTRAM_MAIL_USER and TRISTRAM_MAIL_PASS (a Gmail app password) as user environment variables first.');
  } else { console.error('commands: alerts, digest, test, schedule'); process.exit(1); }
} catch (err) { console.error(`notify: ${err.message}`); process.exit(1); }
