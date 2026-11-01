// One build cycle (SPEC 4.1, 4.1.1). Usage: node tools/cycle.mjs <command> <idea>
//   start <idea>    make sure the idea is BUILDING in the right cycle; list what each owner carries over
//   end <idea>      run the pre-review checks, record defects, and move the idea on:
//                   all clear -> stays PRE_REVIEW for Lazarus; problems -> next cycle, or BLOCKED_FOR_CEO after cycle 3;
//                   a check that cannot run (exit 2) -> ENVIRONMENT_BLOCKED, and does not count as a cycle
//   checks <idea>   run the checks for the planned areas and print the result (changes nothing)
// Exit codes: 0 clear, 1 problems found, 2 environment failure.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { findIdea, parseStatus, transition, gate, MAX_CYCLES, logEvent } from './lib/idea.mjs';
import { readPlan, validatePlan, AREAS } from './lib/plan.mjs';
import { recordCheck, renderCycleView, openDefectList } from './lib/defects.mjs';
import { summary as handoverSummary } from './lib/handover.mjs';
import { needsReview } from './lib/questions.mjs';
import * as E from './lib/env.mjs';
import * as flaky from './lib/flaky.mjs';
import { buildQueue } from './lib/queue.mjs';
import { direction } from './lib/townsquare.mjs';
import { forPlan } from './lib/lessons.mjs';
import { activeFor, rerunAreas } from './lib/change.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const CHECKS = {
  schema: { check: 'db_check', owner: 'wirt', script: 'db_check.mjs' },
  api: { check: 'api_check', owner: 'griswold', script: 'api_check.mjs' },
  ui: { check: 'ui_check', owner: 'adria', script: 'ui_check.mjs' },
  tests: { check: 'test_check', owner: 'farnham', script: 'test_check.mjs' },
};

const [cmd, name] = process.argv.slice(2);
function fail(msg, code = 1) { console.error(`cycle: ${msg}`); process.exit(code); }
const state = (idea) => parseStatus(fs.readFileSync(path.join(idea.dir, 'status.md'), 'utf8'));

// One check's findings: each "- FAIL name: detail" line becomes "name: first line of detail".
function findingsOf(stdout) {
  const out = [];
  const lines = stdout.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^- FAIL (.*)$/);
    if (!m) continue;
    out.push(m[1].replace(/\s+/g, ' ').trim().slice(0, 200));
  }
  return out;
}

// Every way a cycle can end refreshes the CEO queue first, so portals always match the files.
function finish(code) { try { buildQueue(); } catch { /* rebuilt by the next queue command */ } process.exit(code); }
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

function execCheck(idea, area) {
  const c = CHECKS[area];
  const r = spawnSync(process.execPath, ['--no-warnings', path.join(here, 'checks', c.script), idea.name], { encoding: 'utf8' });
  return { area, ...c, code: r.status, stdout: r.stdout || '', stderr: r.stderr || '', findings: r.status === 1 ? findingsOf(r.stdout || '') : [] };
}

// A timeout is transient: retry twice with a short, growing wait before calling it an environment failure (SPEC 10.3).
function runCheck(idea, area) {
  const wait = Number(process.env.TRISTRAM_RETRY_WAIT_MS ?? 2000);
  let r = execCheck(idea, area), retries = 0;
  while (r.code === 2 && /timed out/i.test(r.stderr) && retries < 2) {
    retries += 1;
    sleep(wait * retries);
    r = execCheck(idea, area);
  }
  return { ...r, retries };
}

function plannedAreas(idea) {
  const plan = readPlan(idea);
  if (plan?.areas.length) return plan.areas.filter((a) => AREAS[a]);
  // no plan: fall back to whatever artifacts exist
  const a = path.join(idea.dir, 'artifacts');
  return Object.keys(CHECKS).filter((k) => ({ schema: 'schema/migrations', api: 'backend/api.yaml', ui: 'ui', tests: 'tests' }[k] && fs.existsSync(path.join(a, { schema: 'schema/migrations', api: 'backend/api.yaml', ui: 'ui', tests: 'tests' }[k]))));
}

try {
  if (!cmd || !name) fail('usage: <start|end|checks> <idea>');
  const idea = findIdea(name);

  if (cmd === 'start') {
    let st = state(idea);
    if (st.state === 'BRIEFING') {
      const g = gate(idea.dir);
      if (!g.ok) fail(`build is blocked: ${g.problems.join('; ')}. Run /briefing ${name} first.`);
      transition(idea, 'BUILDING', { actor: 'factory', note: 'cycle 1 started' });
      st = state(idea);
    }
    if (st.state !== 'BUILDING') fail(`${name} is ${st.state}, not BUILDING. ${st.state === 'BLOCKED_FOR_CEO' ? `Run /town-square ${name}.` : 'Nothing to start.'}`);
    const cycle = Number(st.cycle);
    fs.mkdirSync(path.join(idea.dir, 'cycles', `cycle-${cycle}`), { recursive: true });
    logEvent(idea.dir, 'factory', `cycle ${cycle} started`);
    console.log(`Cycle ${cycle} of ${MAX_CYCLES} for ${name} (${st.id}), state BUILDING.`);
    for (const cr of activeFor(idea, cycle)) console.log(`Change ${cr.id} (${cr.title}) is built in this cycle. Cain plans only: ${rerunAreas(cr).join(', ') || 'nothing'}. Brief ${cr.briefTo}.`);
    const problems = validatePlan(idea);
    console.log(problems.length ? `Plan: Cain must write plan.md for cycle ${cycle}:\n  - ${problems.join('\n  - ')}` : `Plan: ok, areas ${readPlan(idea).areas.join(', ')}.`);
    const dir = direction(idea);
    if (dir) console.log(`CEO direction from Town Square ${dir.session}, for ${dir.to}: ${dir.text}`);
    const lessons = forPlan(idea, readPlan(idea)?.areas ?? []);
    if (lessons.length) console.log(`Approved lessons that apply (read them before you start): ${lessons.map((l) => `${l.id} ${l.title}`).join('; ')}`);
    const open = openDefectList(idea);
    if (open.length) {
      console.log('Carried over from the last cycle, by owner:');
      for (const o of [...new Set(open.map((d) => d.owner))]) { console.log(`  ${o}:`); for (const d of open.filter((x) => x.owner === o)) console.log(`    ${d.id} ${d.summary}`); }
    }
    const h = handoverSummary(idea);
    for (const [c, v] of Object.entries(h.unread)) if (v.length) console.log(`Unread handovers for ${c}: ${v.map((x) => x.id).join(', ')}`);
    const qs = needsReview(idea);
    if (qs.length) console.log(`Cain must review ${qs.length} assumption(s): node tools/questions.mjs review ${name}`);
    process.exit(0);
  }

  if (cmd === 'checks') {
    const areas = plannedAreas(idea);
    let worst = 0;
    for (const a of areas) {
      const r = runCheck(idea, a);
      console.log(`${a.padEnd(7)} ${r.check.padEnd(11)} exit ${r.code}  ${r.code === 0 ? 'pass' : r.code === 1 ? 'defect' : 'environment failure'}`);
      worst = Math.max(worst, r.code ?? 2);
    }
    if (!areas.length) console.log('No areas to check yet.');
    process.exit(worst);
  }

  if (cmd === 'end') {
    let st = state(idea);
    // PRE_REVIEW is allowed so that a cycle end interrupted half way can be repeated (SPEC 16.4); it never double-counts.
    if (st.state !== 'BUILDING' && st.state !== 'PRE_REVIEW') fail(`${name} is ${st.state}; a cycle can only end from BUILDING`);
    const cycle = Number(st.cycle);
    const planProblems = validatePlan(idea);
    if (planProblems.length) fail(`plan.md is not valid, so the cycle cannot be checked:\n  - ${planProblems.join('\n  - ')}`);
    const areas = readPlan(idea).areas;
    if (st.state === 'BUILDING') transition(idea, 'PRE_REVIEW', { actor: 'factory', note: `cycle ${cycle} pre-review checks` });

    const env = [], summary = [];
    for (const a of areas) {
      const r = runCheck(idea, a);
      summary.push(r);
      if (r.code === 2) { env.push(r); continue; }                     // environment failures never become defects
      if (r.code !== 0 && r.code !== 1) { env.push({ ...r, stderr: r.stderr || `exited ${r.code}` }); continue; }
      recordCheck(idea, { check: r.check, owner: r.owner, cycle, findings: r.findings });
      if (r.code === 0 && r.retries > 0) flaky.record(idea, { check: r.check, cycle, event: 'retry-pass', retries: r.retries });
      else if (r.code === 0 && flaky.isOpen(idea, r.check)) flaky.record(idea, { check: r.check, cycle, event: 'clean' });
    }
    renderCycleView(idea, cycle);
    for (const r of summary) {
      const verdict = r.code === 0 ? (r.retries ? `pass, but only after ${r.retries} retr${r.retries === 1 ? 'y' : 'ies'}: NOT A CLEAN PASS` : 'pass') : r.code === 1 ? `DEFECT (${r.findings.length})` : `ENVIRONMENT FAILURE${r.retries ? ` (after ${r.retries} retries)` : ''}`;
      console.log(`${r.check.padEnd(11)} ${verdict}`);
    }

    if (env.length) {
      const cause = env.map((r) => `${r.check}: ${(r.stderr.trim() || r.stdout.trim()).split('\n').slice(0, 3).join(' ')}`).join('\n');
      E.open(idea, { checks: env.map((r) => r.check), owner: env[0].owner, cause, resumeTo: 'BUILDING' });
      transition(idea, 'ENVIRONMENT_BLOCKED', { actor: 'factory', note: `${env.map((r) => r.check).join(', ')} could not run; does not count as a cycle` });
      try { buildQueue(); } catch { /* rebuilt by the next queue command */ }
      console.log(`\nEnvironment failure in ${env.map((r) => r.check).join(', ')}. ${name} is ENVIRONMENT_BLOCKED at cycle ${cycle}; this does not count toward the cycle limit.`);
      console.log(`${env[0].owner} has ${E.MAX_ATTEMPTS} attempts to fix it (node tools/env.mjs attempt ${name} --by ${env[0].owner} --note "..."), then Cain confirms and escalates to the CEO.`);
      finish(2);
    }

    // only the pre-review checks decide here; Lazarus's own findings are closed by his next verdict
    const open = openDefectList(idea).filter((d) => d.check.endsWith('_check'));
    if (!open.length) {
      console.log(`\nAll checks passed in cycle ${cycle}. ${name} stays PRE_REVIEW, ready for Lazarus.`);
      finish(0);
    }
    console.log(`\n${open.length} open defect(s). Routed to their owners:`);
    for (const o of [...new Set(open.map((d) => d.owner))]) { console.log(`  ${o}:`); for (const d of open.filter((x) => x.owner === o)) console.log(`    ${d.id} ${d.summary}`); }
    if (cycle >= MAX_CYCLES) {
      transition(idea, 'BLOCKED_FOR_CEO', { actor: 'factory', note: `pre-review failed on cycle ${cycle}` });
      console.log(`\nCycle ${cycle} of ${MAX_CYCLES} failed. ${name} is BLOCKED_FOR_CEO. Run /town-square ${name}.`);
    } else {
      transition(idea, 'BUILDING', { actor: 'factory', note: `defects found; cycle ${cycle + 1} starts` });
      console.log(`\nCycle ${cycle + 1} of ${MAX_CYCLES} starts. Run /cycle ${name} again; only the owners above need to work.`);
    }
    finish(1);
  }

  fail('commands: start, end, checks');
} catch (err) {
  fail(err.message);
}
