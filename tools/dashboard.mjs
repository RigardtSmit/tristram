// Writes knowledge/roster/dashboard.html from record/metrics.jsonl and record/transitions.jsonl (SPEC 18.5).
// Usage: node tools/dashboard.mjs
import { writeDashboard } from './lib/dashboard.mjs';
console.log(`Wrote ${writeDashboard()}`);
