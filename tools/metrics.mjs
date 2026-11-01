// /metrics [idea] [agent] [cycle]: the dashboard's figures as text. Usage: node tools/metrics.mjs [idea] [--agent name] [--cycle N]
import { metricsText } from './lib/dashboard.mjs';
const argv = process.argv.slice(2);
const opt = (f) => { const i = argv.indexOf(f); return i === -1 ? undefined : argv[i + 1]; };
const idea = argv.find((a, i) => !a.startsWith('--') && !(argv[i - 1] || '').startsWith('--'));
try { console.log(metricsText(undefined, { idea, agent: opt('--agent'), cycle: opt('--cycle') })); } catch (err) { console.error(`metrics: ${err.message}`); process.exit(1); }
