// Flaky checks (SPEC 10.3, 10.4): a check that passes only on a retry is logged as such and is not a clean pass.
// It is reported to the CEO (a gold portal) until the same check next passes cleanly.
import fs from 'node:fs';
import path from 'node:path';
import { nowIso } from './paths.mjs';
import { logEvent } from './idea.mjs';

const file = (idea) => path.join(idea.dir, 'record', 'flaky.jsonl');
function events(idea) {
  return fs.existsSync(file(idea)) ? fs.readFileSync(file(idea), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
}
export function record(idea, { check, cycle, event, retries = 0 }) {
  fs.mkdirSync(path.dirname(file(idea)), { recursive: true });
  fs.appendFileSync(file(idea), JSON.stringify({ ts: nowIso(), check, cycle, event, retries }) + '\n');
  if (event === 'retry-pass') logEvent(idea.dir, 'factory', `${check} passed only after ${retries} retr${retries === 1 ? 'y' : 'ies'}: not a clean pass`);
}
// Checks whose latest event is a retry-pass, with when it was first flagged.
export function open(idea) {
  const last = new Map();
  for (const e of events(idea)) last.set(e.check, e);
  return [...last.values()].filter((e) => e.event === 'retry-pass');
}
export function isOpen(idea, check) { return open(idea).some((e) => e.check === check); }
