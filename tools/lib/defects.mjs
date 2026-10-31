// Defects (SPEC 5.1, 10, 18.3). A defect keeps the same DEF id across cycles so persistence can be tracked.
// The append-only event log is cycles/defects.jsonl; cycles/cycle-N/defects.md is a view of it.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { nowIso } from './paths.mjs';
import { parseStatus, logEvent, writeAtomic } from './idea.mjs';

const logFile = (idea) => path.join(idea.dir, 'cycles', 'defects.jsonl');
const keyOf = (check, finding) => crypto.createHash('sha1').update(`${check}|${finding.trim().replace(/\s+/g, ' ')}`).digest('hex').slice(0, 12);

export function readEvents(idea) {
  const f = logFile(idea);
  if (!fs.existsSync(f)) return [];
  return fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
}

// Current state of every defect: id -> { id, key, owner, check, summary, state, raisedIn, lastCycle, history[] }
export function defectState(idea) {
  const out = new Map();
  for (const e of readEvents(idea)) {
    let d = out.get(e.id);
    if (!d) { d = { id: e.id, key: e.key, owner: e.owner, check: e.check, summary: e.summary, state: 'open', raisedIn: e.cycle, history: [] }; out.set(e.id, d); }
    d.lastCycle = e.cycle;
    d.history.push({ cycle: e.cycle, result: e.result });
    d.state = e.result === 'fixed' ? 'fixed' : 'open';
  }
  return out;
}

function append(idea, e) {
  fs.mkdirSync(path.dirname(logFile(idea)), { recursive: true });
  const line = { ts: nowIso(), ...e };
  fs.appendFileSync(logFile(idea), JSON.stringify(line) + '\n');
  // mirror into the transitions log so the dashboard can see defect events (FORMATS.md)
  fs.appendFileSync(path.join(idea.dir, 'record', 'transitions.jsonl'), JSON.stringify({ ts: line.ts, type: 'defect', id: e.id, owner: e.owner, cycle: e.cycle, result: e.result }) + '\n');
}

function nextId(idea) {
  const item = parseStatus(fs.readFileSync(path.join(idea.dir, 'status.md'), 'utf8')).id.replace(/^WI-/, '');
  const seq = [...defectState(idea).keys()].reduce((m, id) => Math.max(m, Number(id.split('-')[2])), 0) + 1;
  return `DEF-${item}-${String(seq).padStart(2, '0')}`;
}

// Record one check's result for a cycle. `findings` is empty when the check passed.
// Returns the changes: raised, persisted, reintroduced, fixed (arrays of defect ids).
export function recordCheck(idea, { check, owner, cycle, findings }) {
  const state = defectState(idea);
  const mine = [...state.values()].filter((d) => d.check === check);
  const byKey = new Map(mine.map((d) => [d.key, d]));
  const seen = new Set();
  const changes = { raised: [], persisted: [], reintroduced: [], fixed: [] };
  for (const finding of findings) {
    const key = keyOf(check, finding);
    seen.add(key);
    const prev = byKey.get(key);
    if (!prev) {
      const id = nextId(idea);
      append(idea, { event: 'defect', id, key, owner, check, cycle, summary: finding, result: 'raised' });
      changes.raised.push(id);
    } else if (prev.state === 'open') {
      append(idea, { event: 'defect', id: prev.id, key, owner, check, cycle, summary: prev.summary, result: 'persisted' });
      changes.persisted.push(prev.id);
    } else {
      append(idea, { event: 'defect', id: prev.id, key, owner, check, cycle, summary: prev.summary, result: 'reintroduced' });
      changes.reintroduced.push(prev.id);
    }
  }
  for (const d of mine) {
    if (d.state === 'open' && !seen.has(d.key)) {
      append(idea, { event: 'defect', id: d.id, key: d.key, owner, check, cycle, summary: d.summary, result: 'fixed' });
      changes.fixed.push(d.id);
    }
  }
  return changes;
}

export function openDefectList(idea) { return [...defectState(idea).values()].filter((d) => d.state === 'open'); }

// cycles/cycle-N/defects.md: what happened to each defect in that cycle.
export function renderCycleView(idea, cycle) {
  const rows = readEvents(idea).filter((e) => e.cycle === cycle);
  const lines = [`# Defects, cycle ${cycle}`, '', '| Defect | Owner | Check | Result | Summary |', '|---|---|---|---|---|'];
  for (const e of rows) lines.push(`| ${e.id} | ${e.owner} | ${e.check} | ${e.result} | ${String(e.summary).replace(/\|/g, '/')} |`);
  if (!rows.length) lines.push('| none | | | | |');
  const dir = path.join(idea.dir, 'cycles', `cycle-${cycle}`);
  fs.mkdirSync(dir, { recursive: true });
  writeAtomic(path.join(dir, 'defects.md'), lines.join('\n') + '\n');
  logEvent(idea.dir, 'factory', `defects for cycle ${cycle}: ${rows.map((r) => `${r.id} ${r.result}`).join(', ') || 'none'}`);
}
