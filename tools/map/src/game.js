'use strict';
// Game state, input and the render loop. Reads FACTORY_DATA (mock or live files); when served over http it polls /api/data.

const CHAR_NAMES = ['cain', 'wirt', 'griswold', 'adria', 'farnham', 'lazarus', 'ogden'];
const DISPLAY = {
  cain: 'Cain', wirt: 'Wirt', griswold: 'Griswold', adria: 'Adria', farnham: 'Farnham',
  lazarus: 'Lazarus', ogden: 'Ogden', barbarian: 'CEO',
};

const game = {
  data: null, art: null, street: null, cast: null, portals: null,
  state: null,          // derived: characters, portals, chips
  barb: { x: SPOT['town-square'], target: null, face: 1 },
  pace: Object.fromEntries(CHAR_NAMES.map((n, k) => [n, { off: 0, dir: k % 2 ? 1 : -1 }])),
  cam: 0, camTarget: 0, follow: true, zoom: 'street', viewW: 640,
  sel: null,            // { kind: 'portal'|'char'|'barb', id }
  hover: null,
  hits: [],             // clickable rectangles from the last frame
  onChange: () => {},
};

// ---- derive map state from the files -------------------------------------

function parseList(s) {
  if (!s || s === 'none') return [];
  return s.split(',').map((x) => x.trim()).filter(Boolean);
}

function deriveState(data) {
  const chars = {};
  for (const n of CHAR_NAMES) chars[n] = { name: n, state: 'idle', progress: 0, blocked: null, items: [] };
  const chips = [];
  for (const idea of data.ideas) {
    const active = parseList(idea.active_agents).map((e) => { const [a, p] = e.split(':'); return { agent: a, progress: Number(p) || 0 }; });
    const blocked = parseList(idea.blocked_agents).map((e) => {
      const [a, colour, ...rest] = e.split(':'); return { agent: a, colour, reason: rest.join(':') };
    });
    const closed = idea.state === 'CLOSED' || idea.state === 'STOPPED';
    if (!closed) {
      for (const a of active) if (chars[a.agent]) {
        chars[a.agent].items.push(idea.id);
        if (chars[a.agent].state !== 'blocked') { chars[a.agent].state = 'working'; chars[a.agent].progress = a.progress; }
      }
      for (const b of blocked) if (chars[b.agent]) {
        chars[b.agent].items.push(idea.id);
        chars[b.agent].state = 'blocked';
        chars[b.agent].blocked = { colour: b.colour, reason: b.reason, item: idea.id };
      }
      const stageLoc = {
        briefing: 'town-square', build: active[0]?.agent || blocked[0]?.agent || 'cain',
        'pre-review': 'farnham', review: 'lazarus', debrief: 'town-square', 'town-square': 'town-square',
      }[idea.stage] || 'town-square';
      chips.push({ id: idea.id, name: idea.name, loc: stageLoc, state: idea.state });
    }
  }
  const portals = data.queue.map((q) => ({ ...q, loc: q.location || 'town-square' }))
    .sort((a, b) => a.raised.localeCompare(b.raised));
  return { chars, chips, portals };
}

// ---- movement -----------------------------------------------------------

const spotOf = (loc) => SPOT[loc] ?? SPOT['town-square'];
function panTo(x) { game.follow = false; game.camTarget = x - game.viewW / 2; }
function walkToX(x) { game.barb.target = Math.max(10, Math.min(WORLD_W - 10, x)); game.follow = true; }
function walkToLocation(loc) { walkToX(spotOf(loc) - (loc === 'town-square' ? 0 : 34)); }

function step(dt) {
  const b = game.barb;
  if (b.target != null) {
    const dx = b.target - b.x, s = 72 * dt;
    b.face = dx >= 0 ? 1 : -1;
    if (Math.abs(dx) <= s) { b.x = b.target; b.target = null; } else b.x += Math.sign(dx) * s;
    if (game.follow) game.camTarget = b.x - game.viewW / 2;
  }
  for (const n of CHAR_NAMES) {                       // working characters pace in front of their place
    const p = game.pace[n];
    if (game.state.chars[n].state === 'working' && game.cast[n].walk) {
      p.off += p.dir * 14 * dt;
      if (Math.abs(p.off) >= 12) { p.off = Math.sign(p.off) * 12; p.dir = -p.dir; }
    } else if (Math.abs(p.off) > 0.5) { p.dir = -Math.sign(p.off); p.off += p.dir * 14 * dt; }
    else p.off = 0;
  }
  game.camTarget = Math.max(0, Math.min(WORLD_W - game.viewW, game.camTarget));
  game.cam += (game.camTarget - game.cam) * Math.min(1, dt * 6);
  if (Math.abs(game.camTarget - game.cam) < 0.5) game.cam = game.camTarget;
}

// ---- drawing --------------------------------------------------------------

// A sprite stands with its foot point at (x, FEET). Frames from an imported sheet carry their own anchor and scale in _a.
function drawSprite(g, spr, x, flip) {
  const a = spr._a || { x: spr.width / 2, y: spr.height, s: 1 };
  const w = Math.round(spr.width * a.s), h = Math.round(spr.height * a.s), y = Math.round(FEET + 2 - a.y * a.s);
  if (!flip) { g.drawImage(spr, Math.round(x - a.x * a.s), y, w, h); return; }
  g.save(); g.translate(Math.round(x + a.x * a.s), y); g.scale(-1, 1); g.drawImage(spr, 0, 0, w, h); g.restore();
}

// Optional: the CEO's own art from tools/map/local-assets/. Its diagonal walking rows serve as left and right on the street.
const CEO_SHEET_SCALE = 0.5;
function loadCeoSheet(cfg) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const key = cfg.key || [170, 170, 170];
      const frame = (a, col, row) => {
        const { c, g } = mk(a.cw, a.ch);
        g.drawImage(img, a.x0 + col * a.cw, a.y0 + row * a.ch, a.cw, a.ch, 0, 0, a.cw, a.ch);
        const d = g.getImageData(0, 0, a.cw, a.ch);
        for (let i = 0; i < d.data.length; i += 4) if (d.data[i] === key[0] && d.data[i + 1] === key[1] && d.data[i + 2] === key[2]) d.data[i + 3] = 0;
        g.putImageData(d, 0, 0);
        c._a = { x: a.anchorX, y: a.anchorY, s: CEO_SHEET_SCALE };
        return c;
      };
      const frames = (a, row) => Array.from({ length: a.frames }, (_, k) => frame(a, k, row));
      game.cast.barbarian = {
        idle: frames(cfg.idle, cfg.idle.row), idleMs: cfg.idle.ms, walkMs: cfg.walk.ms, head: 50,
        walkRight: frames(cfg.walk, cfg.walk.rows.se), walkLeft: frames(cfg.walk, cfg.walk.rows.sw),
      };
      resolve(true);
    };
    img.onerror = () => resolve(false);
    img.src = cfg.png;
  });
}

function ellipseDots(g, cx, cy, rx, ry, n, litCount, litCol, dimCol) {
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 - Math.PI / 2;
    rect(g, Math.round(cx + Math.cos(a) * rx), Math.round(cy + Math.sin(a) * ry), 2, 1, k < litCount ? litCol : dimCol);
  }
}

function drawMarker(g, cx, top, colour, t) {
  const col = colour === 'red' ? '#ff5a4a' : '#ffd24a';
  const y = top + (Math.floor(t / 400) % 2) * 2;
  rect(g, cx - 6, y, 13, 15, '#0b0806');
  rect(g, cx - 5, y + 1, 11, 13, col);
  rect(g, cx - 5, y + 1, 11, 2, shade(col, 1.3)); rect(g, cx + 3, y + 3, 3, 11, shade(col, 0.7));
  rect(g, cx - 1, y + 4, 3, 5, '#1b130d'); rect(g, cx - 1, y + 10, 3, 2, '#1b130d');
}

function drawPlate(g, id, name, cx, y, hot) {
  const colour = CHAR_COLOUR[id];
  const w = 7 + 4 + textWidth(name) + 8, x = Math.round(cx - w / 2);
  rect(g, x - 1, y - 1, w + 2, 15, '#000');
  rect(g, x, y, w, 13, '#17120d');
  rect(g, x, y, w, 1, colour); rect(g, x, y, 1, 13, colour);
  rect(g, x, y + 12, w, 1, shade(colour, 0.5)); rect(g, x + w - 1, y, 1, 13, shade(colour, 0.5));
  drawIcon(g, id, x + 4, y + 3, colour);
  drawText(g, name, x + 4 + 7 + 3, y + 4, hot ? '#fff3b0' : '#f0e8d0', '#000');
}

function chipLabel(g, text, x, y, colourName) {
  const w = textWidth(text) + 8;
  rect(g, x - 1, y - 1, w + 2, 13, '#0b0806');
  rect(g, x, y, w, 11, '#cdb98a');
  rect(g, x, y + 10, w, 1, '#a08c5c');
  rect(g, x, y, 3, 11, colourName ? PORTAL_COLOURS[colourName].ring : '#6b5a3a');
  drawText(g, text, x + 6, y + 3, '#2a1e10');
}

// Tiled layers behind the street, moving slower than it.
function drawLayer(g, img, speed) {
  const w = img.width, off = -((game.cam * speed) % w);
  for (let x = Math.floor(off); x < game.viewW; x += w) g.drawImage(img, x, 0);
}

function render(t, dt) {
  const { g } = game.screen, S = game.state, hits = [], cam = Math.round(game.cam), inView = (x, m = 80) => x > cam - m && x < cam + game.viewW + m;
  drawLayer(g, game.art.sky, 0.1);
  drawLayer(g, game.art.roofs, 0.35);
  g.drawImage(game.street, cam, 0, game.viewW, WORLD_H, 0, 0, game.viewW, WORLD_H);

  g.save();
  g.translate(-cam, 0);

  // the lights of the village
  g.globalCompositeOperation = 'lighter';
  for (const l of LIGHTS) if (inView(l.x)) drawLight(g, l.x, l.y, l.r, l.col, (l.fire ? 0.3 + Math.sin(t / 90 + l.x) * 0.08 : 0.2) + Math.sin(t / 700 + l.x) * 0.03);
  const group = {};
  for (const q of S.portals) (group[q.loc] ||= []).push(q);
  const placed = [];
  for (const [loc, list] of Object.entries(group)) {
    list.forEach((q, k) => {
      const gx = spotOf(loc) + 34 + k * 40, py = FEET - PORTAL_H + 2 + Math.round(Math.sin(t / 520 + k + gx) * 1.5);
      placed.push({ q, gx, px: gx - PORTAL_W / 2, py });
      drawLight(g, gx, py + PORTAL_H / 2, 52, PORTAL_COLOURS[q.colour].ring, 0.28);
    });
  }
  g.globalCompositeOperation = 'source-over';
  drawEmbers(g, dt);

  for (const { q, gx, px, py } of placed) {
    ellipseDots(g, gx, FEET + 1, 17, 4, 24, 24, PORTAL_COLOURS[q.colour].ring, PORTAL_COLOURS[q.colour].ring);
    g.drawImage(game.portals[q.colour][Math.floor(t / 110) % PORTAL_FRAMES], px, py);
    hits.push({ kind: 'portal', id: q.id, x: px, y: py, w: PORTAL_W, h: PORTAL_H });
    if (game.sel?.id === q.id) {
      for (const [x, y, dx, dy] of [[px - 3, py - 3, 1, 1], [px + PORTAL_W + 2, py - 3, -1, 1], [px - 3, py + PORTAL_H + 2, 1, -1], [px + PORTAL_W + 2, py + PORTAL_H + 2, -1, -1]]) {
        rect(g, dx > 0 ? x : x - 4, y, 5, 1, '#fff3b0');
        rect(g, x, dy > 0 ? y : y - 4, 1, 5, '#fff3b0');
      }
    }
  }

  // the characters
  const plates = [];
  CHAR_NAMES.forEach((n, idx) => {
    const st = S.chars[n], c = game.cast[n], p = game.pace[n], x = SPOT[n] + p.off, moving = p.off !== 0 && c.walk;
    const list = st.state === 'working' && c.work ? c.work : moving ? c.walk : c.idle;
    const spr = list[Math.floor((t + idx * 137) / (moving ? 110 : 170)) % list.length];
    const colour = CHAR_COLOUR[n], hot = game.sel?.id === n || game.hover === n;
    ellipseDots(g, x, FEET + 1, 15, 4, 24, 24, colour, colour);
    if (st.state === 'working') ellipseDots(g, x, FEET + 1, 20, 6, 28, Math.round(st.progress * 28), '#ffd24a', '#3b3426');
    drawSprite(g, spr, x, moving ? p.dir < 0 : false);
    const y0 = FEET - c.head - 16;
    plates.push({ id: n, name: DISPLAY[n].toUpperCase(), x, y: y0, st, hot });
    hits.push({ kind: 'char', id: n, x: x - 20, y: y0 - 2, w: 40, h: FEET - y0 + 6 });
  });

  const b = game.barb, bc = game.cast.barbarian, walking = b.target != null, right = b.face > 0;
  let bspr, bflip = false;
  if (walking && bc.walkRight) { const l = right ? bc.walkRight : bc.walkLeft; bspr = l[Math.floor(t / (bc.walkMs || 110)) % l.length]; }
  else if (walking) { bspr = bc.walk[Math.floor(t / 110) % bc.walk.length]; bflip = !right; }
  else { bspr = bc.idle[Math.floor(t / (bc.idleMs || 170)) % bc.idle.length]; bflip = !bc.walkRight && !right; }
  ellipseDots(g, b.x, FEET + 1, 15, 4, 24, 24, CHAR_COLOUR.barbarian, CHAR_COLOUR.barbarian);
  drawSprite(g, bspr, b.x, bflip);
  const by = FEET - bc.head - 16;
  plates.push({ id: 'barbarian', name: 'CEO', x: b.x, y: by, st: null, hot: game.sel?.id === 'barbarian' || game.hover === 'barbarian' });
  hits.push({ kind: 'barb', id: 'barbarian', x: b.x - 20, y: by - 2, w: 40, h: FEET - by + 6 });

  // work items beside their place
  const perLoc = {};
  for (const chip of S.chips) {
    const k = perLoc[chip.loc] = (perLoc[chip.loc] ?? -1) + 1;
    const col = chip.state === 'BLOCKED_FOR_CEO' ? 'blue' : chip.state === 'ENVIRONMENT_BLOCKED' ? 'red' : null;
    chipLabel(g, chip.id, spotOf(chip.loc) - 58, FEET - 46 + k * 14, col);
  }

  for (const p of plates) {
    drawPlate(g, p.id, p.name, Math.round(p.x), p.y, p.hot);
    if (p.st?.state === 'blocked') drawMarker(g, Math.round(p.x), p.y - 18, p.st.blocked.colour, t);
  }
  if (game.sel && game.sel.kind !== 'portal') {
    const pl = plates.find((e) => e.id === game.sel.id);
    if (pl) { const ax = Math.round(pl.x), ay = pl.y - 7 - (Math.floor(t / 300) % 2 ? 2 : 0); rect(g, ax - 4, ay, 9, 1, '#fff3b0'); rect(g, ax - 3, ay + 1, 7, 1, '#fff3b0'); rect(g, ax - 1, ay + 2, 3, 1, '#fff3b0'); }
  }
  g.restore();

  game.hits = hits.map((h) => ({ ...h, x: h.x - cam }));
  if (game.zoom === 'street') drawGuides(g, placed, cam);
}

// When the street does not fit: a strip showing the whole village, and an arrow at the edge for each portal out of view.
function drawGuides(g, placed, cam) {
  const mw = Math.min(280, game.viewW - 20), mx = Math.round((game.viewW - mw) / 2), my = 5, sc = mw / WORLD_W;
  rect(g, mx - 1, my - 1, mw + 2, 12, '#000'); rect(g, mx, my, mw, 10, '#17120d');
  rect(g, mx + Math.round(cam * sc), my, Math.max(4, Math.round(game.viewW * sc)), 10, '#3a3228');
  for (const n of CHAR_NAMES) rect(g, mx + Math.round(SPOT[n] * sc), my + 7, 2, 2, CHAR_COLOUR[n]);
  for (const { q, gx } of placed) rect(g, mx + Math.round(gx * sc) - 1, my + 1, 3, 5, PORTAL_COLOURS[q.colour].ring);
  rect(g, mx + Math.round(game.barb.x * sc), my + 1, 1, 8, '#fff');
  game.hits.push({ kind: 'pan', map: { x: mx, w: mw }, x: mx, y: my - 2, w: mw, h: 14 });
  let left = 0, right = 0;
  for (const { q, gx } of placed) {
    const side = gx < cam ? 'l' : gx > cam + game.viewW ? 'r' : null;
    if (!side) continue;
    const k = side === 'l' ? left++ : right++, ax = side === 'l' ? 4 : game.viewW - 16, ay = 100 + k * 16, col = PORTAL_COLOURS[q.colour].ring;
    rect(g, ax - 1, ay - 1, 14, 14, '#000'); rect(g, ax, ay, 12, 12, '#17120d');
    for (let i = 0; i < 5; i++) rect(g, side === 'l' ? ax + 3 + i : ax + 8 - i, ay + 2 + i, 1, 8 - i * 2 > 0 ? 8 - i * 2 : 1, col);
    game.hits.push({ kind: 'portal', id: q.id, pan: gx, x: ax, y: ay, w: 12, h: 12 });
  }
}

// ---- input -----------------------------------------------------------------

function canvasPoint(e) {
  const r = game.screen.c.getBoundingClientRect();
  return [(e.clientX - r.left) * (game.viewW / r.width), (e.clientY - r.top) * (WORLD_H / r.height)];
}
function hitAt(x, y) {
  const inside = (h) => x >= h.x && x < h.x + h.w && y >= h.y && y < h.y + h.h;
  return game.hits.filter((h) => h.kind === 'pan' || h.pan != null).find(inside)
    || game.hits.find((h) => h.kind === 'portal' && inside(h)) || game.hits.find(inside) || null;
}

function select(sel) { game.sel = sel; game.onChange(); }

function selectPortal(id, walk) {
  const q = game.state.portals.find((p) => p.id === id);
  if (!q) return;
  select({ kind: 'portal', id });
  panTo(spotOf(q.loc));
  if (walk && q.colour === 'blue') walkToLocation(q.loc);
}

function initInput() {
  const el = game.screen.c;
  let down = null;
  el.addEventListener('pointerdown', (e) => { down = { x: e.clientX, cam: game.camTarget, moved: false }; });
  window.addEventListener('pointerup', () => { setTimeout(() => { down = null; }, 0); });
  el.addEventListener('pointermove', (e) => {
    if (down && e.buttons && Math.abs(e.clientX - down.x) > 4) {
      down.moved = true; game.follow = false;
      game.camTarget = down.cam - (e.clientX - down.x) * (game.viewW / el.getBoundingClientRect().width);
      el.style.cursor = 'grabbing';
      return;
    }
    const [x, y] = canvasPoint(e), h = hitAt(x, y);
    game.hover = h && (h.kind === 'char' || h.kind === 'barb') ? h.id : null;
    el.style.cursor = h ? 'pointer' : 'crosshair';
  });
  el.addEventListener('click', (e) => {
    if (down?.moved) return;
    const [x, y] = canvasPoint(e), h = hitAt(x, y);
    if (h?.kind === 'pan') { panTo((x - h.map.x) / h.map.w * WORLD_W); return; }
    if (h?.kind === 'portal') { selectPortal(h.id, false); return; }
    if (h) { select({ kind: h.kind, id: h.id }); return; }
    walkToX(x + game.cam); game.sel = null; game.onChange();
  });
  el.addEventListener('mouseleave', () => { game.hover = null; });
  el.addEventListener('wheel', (e) => { if (game.zoom !== 'street') return; e.preventDefault(); game.follow = false; game.camTarget += (e.deltaX || e.deltaY) * 0.5; }, { passive: false });
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    game.follow = false; game.camTarget += (e.key === 'ArrowLeft' ? -1 : 1) * 80;
  });
  document.getElementById('zoom').addEventListener('click', () => {
    game.zoom = game.zoom === 'street' ? 'whole' : 'street';
    fitCanvas();
  });
}

// ---- start --------------------------------------------------------------------

// "Close up" shows part of the street at a whole-number scale and scrolls; "Whole street" fits all of it in the window.
function fitCanvas() {
  const wide = window.innerWidth >= 1000;
  const availW = (wide ? window.innerWidth - 360 : window.innerWidth) - 16, availH = window.innerHeight - 16;
  let scale;
  if (game.zoom === 'whole') { scale = availW / WORLD_W; game.viewW = WORLD_W; }
  else {
    scale = Math.max(1, Math.min(Math.round(availW / 620), Math.floor(availH / WORLD_H)));
    game.viewW = Math.min(WORLD_W, Math.ceil(availW / scale));
  }
  const el = game.screen.c;
  el.width = game.viewW; el.height = WORLD_H;
  game.screen.g.imageSmoothingEnabled = false;
  el.style.width = Math.floor(game.viewW * scale) + 'px';
  el.style.height = Math.floor(WORLD_H * scale) + 'px';
  document.getElementById('zoom').textContent = game.zoom === 'street' ? 'Whole street' : 'Close up';
  game.camTarget = Math.max(0, Math.min(WORLD_W - game.viewW, game.camTarget));
  if (game.zoom === 'whole') { game.cam = 0; game.camTarget = 0; }
}

// A map opened from the local server (serve.mjs) follows the factory's files and can carry out the CEO's decisions.
function isServed() { return location.protocol === 'http:' && FACTORY_DATA_SOURCE() === 'live'; }
function FACTORY_DATA_SOURCE() { return window.FACTORY_DATA && window.FACTORY_DATA.source; }

function refreshData(data) {
  game.data = data;
  game.state = deriveState(data);
  if (game.sel && game.sel.kind === 'portal' && !game.state.portals.some((p) => p.id === game.sel.id)) game.sel = null;
  game.onChange();
}

async function pollData() {
  try {
    const r = await fetch('/api/data', { cache: 'no-store' });
    if (r.ok) refreshData(await r.json());
  } catch { /* the server is gone; the map keeps what it has */ }
}

async function startGame(data) {
  game.data = data;
  game.art = await loadArt(window.FACTORY_ART);
  game.screen = (() => { const c = document.getElementById('screen'); return { c, g: c.getContext('2d') }; })();
  game.street = buildStreet(game.art);
  game.cast = buildCast(game.art);
  game.portals = buildPortals();
  game.state = deriveState(data);
  if (data.ceoSheet) await loadCeoSheet(data.ceoSheet);
  initInput();
  if (location.hash === '#whole') game.zoom = 'whole';
  fitCanvas();
  window.addEventListener('resize', fitCanvas);
  game.cam = game.camTarget = game.barb.x - game.viewW / 2;

  // The CEO walks to the oldest blue portal on load.
  const firstBlue = game.state.portals.find((p) => p.colour === 'blue');
  if (firstBlue) { game.sel = { kind: 'portal', id: firstBlue.id }; walkToLocation(firstBlue.loc); }

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    step(dt);
    render(now, dt);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  game.onChange();
  if (isServed()) setInterval(pollData, 3000);
}
