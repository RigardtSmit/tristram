'use strict';
// Game state, input and the render loop. Reads FACTORY_DATA (mock or live files); when served over http it polls /api/data.

const CHAR_NAMES = ['cain', 'wirt', 'griswold', 'adria', 'farnham', 'lazarus', 'ogden'];
const DISPLAY = {
  cain: 'Cain', wirt: 'Wirt', griswold: 'Griswold', adria: 'Adria', farnham: 'Farnham',
  lazarus: 'Lazarus', ogden: 'Ogden', barbarian: 'CEO',
};

const game = {
  data: null, village: null, chars: null, portals: null, vignette: null,
  state: null,          // derived: characters, portals, chips
  barb: { i: 7.5, j: 9.5, path: [], face: 1, dir: 'front' },
  sel: null,            // { kind: 'portal'|'char'|'barb', id }
  hover: null,
  hits: [],             // clickable rectangles from the last frame
  portalPos: [],        // where portals were drawn, for sparks and lights
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

function isFree(i, j) {
  return i >= 0 && j >= 0 && i < GRID && j < GRID && !game.village.blocked[j][i];
}

function findPath(from, to) {
  const key = (i, j) => j * GRID + i;
  const prev = new Map([[key(from[0], from[1]), null]]);
  const queue = [from];
  let best = from, bestD = Math.abs(from[0] - to[0]) + Math.abs(from[1] - to[1]);
  while (queue.length) {
    const [i, j] = queue.shift();
    const d = Math.abs(i - to[0]) + Math.abs(j - to[1]);
    if (d < bestD) { best = [i, j]; bestD = d; }
    if (i === to[0] && j === to[1]) { best = [i, j]; break; }
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = i + di, nj = j + dj;
      if (!isFree(ni, nj) || prev.has(key(ni, nj))) continue;
      prev.set(key(ni, nj), [i, j]);
      queue.push([ni, nj]);
    }
  }
  const path = [];
  let cur = best;
  while (cur && !(cur[0] === from[0] && cur[1] === from[1])) {
    path.unshift(cur);
    cur = prev.get(key(cur[0], cur[1]));
  }
  return path;
}

function barbTile() { return [Math.floor(game.barb.i), Math.floor(game.barb.j)]; }
function walkTo(i, j) { game.barb.path = findPath(barbTile(), [i, j]); }

function walkToLocation(loc) {
  const [hi, hj] = HOME[loc] || HOME['town-square'];
  const options = loc === 'town-square' ? [[hi, hj]] : [[hi, hj + 1], [hi + 1, hj], [hi - 1, hj], [hi, hj - 1], [hi, hj]];
  const t = options.find(([i, j]) => isFree(i, j)) || [hi, hj];
  walkTo(t[0], t[1]);
}

function stepBarbarian(dt) {
  const b = game.barb;
  if (!b.path.length) return false;
  const [ti, tj] = b.path[0];
  const tx = ti + 0.5, ty = tj + 0.5;
  const dx = tx - b.i, dy = ty - b.j, dist = Math.hypot(dx, dy), step = 3.4 * dt;
  if (dx - dy !== 0) b.face = dx - dy > 0 ? 1 : -1;
  if (dx + dy !== 0) b.dir = dx + dy > 0 ? 'front' : 'back';
  b.dir4 = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'se' : 'nw') : (dy > 0 ? 'sw' : 'ne');
  if (dist <= step) { b.i = tx; b.j = ty; b.path.shift(); }
  else { b.i += (dx / dist) * step; b.j += (dy / dist) * step; }
  return true;
}

// ---- drawing --------------------------------------------------------------

const CS = 1.5;   // characters are drawn at 1.5x so they stand out against the buildings
// How far above the feet each name plate sits, to clear hats, mitres and horns.
const PLATE_DY = { cain: -80, wirt: -62, griswold: -72, adria: -96, farnham: -66, lazarus: -98, ogden: -72, barbarian: -90 };

// A sprite may carry its own anchor and scale in spr._a (used by an imported CEO sheet).
function drawSprite(g, spr, cx, cy, flip) {
  const a = spr._a || { x: FEET_X, y: FEET_Y, s: CS };
  const w = Math.round(spr.width * a.s), h = Math.round(spr.height * a.s);
  const y = Math.round(cy + 4 - a.y * a.s);
  if (!flip) { g.drawImage(spr, Math.round(cx - a.x * a.s), y, w, h); return; }
  g.save(); g.translate(Math.round(cx + (spr.width - a.x) * a.s), y); g.scale(-1, 1); g.drawImage(spr, 0, 0, w, h); g.restore();
}

// Optional: replace the CEO's drawn sprite with frames cut from a sheet in tools/map/local-assets/.
// cfg.idle and cfg.walk each describe a block of the sheet: origin, cell size, frame count and foot anchor.
// cfg.walk.rows maps the four isometric directions (se = +i, sw = +j, nw = -i, ne = -j) to sheet rows.
// Pixels exactly matching cfg.key (the sheet's flat background) become transparent.
function loadCeoSheet(cfg) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const key = cfg.key || [170, 170, 170];
      const cut = (a, col, row) => {
        const { c, g } = mk(a.cw, a.ch);
        g.drawImage(img, a.x0 + col * a.cw, a.y0 + row * a.ch, a.cw, a.ch, 0, 0, a.cw, a.ch);
        const d = g.getImageData(0, 0, a.cw, a.ch);
        for (let i = 0; i < d.data.length; i += 4) if (d.data[i] === key[0] && d.data[i + 1] === key[1] && d.data[i + 2] === key[2]) d.data[i + 3] = 0;
        g.putImageData(d, 0, 0);
        c._a = { x: a.anchorX, y: a.anchorY, s: cfg.scale ?? 1 };
        return c;
      };
      const frames = (a, row) => Array.from({ length: a.frames }, (_, k) => cut(a, k, row));
      const set = game.chars.barbarian;
      set.idle = frames(cfg.idle, cfg.idle.row);
      set.work = set.idle;
      set.idleMs = cfg.idle.ms;
      set.walkMs = cfg.walk.ms;
      set.walk4 = {};
      for (const [dir, row] of Object.entries(cfg.walk.rows)) set.walk4[dir] = frames(cfg.walk, row);
      if (cfg.plateDy) PLATE_DY.barbarian = cfg.plateDy;
      resolve(true);
    };
    img.onerror = () => resolve(false);
    img.src = cfg.png;
  });
}

function ellipseDots(g, cx, cy, rx, ry, n, litCount, litCol, dimCol, size) {
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 - Math.PI / 2;
    rect(g, Math.round(cx + Math.cos(a) * rx), Math.round(cy + Math.sin(a) * ry), size, 1, k < litCount ? litCol : dimCol);
  }
}

function drawMarker(g, cx, top, colour, t) {
  const col = colour === 'red' ? '#ff5a4a' : '#ffd24a';
  const y = top + (Math.floor(t / 400) % 2) * 2;
  rect(g, cx - 6, y, 13, 15, '#0b0806');
  rect(g, cx - 5, y + 1, 11, 13, col);
  rect(g, cx - 5, y + 1, 11, 2, shade(col, 1.3)); rect(g, cx + 3, y + 3, 3, 11, shade(col, 0.7));
  rect(g, cx - 1, y + 4, 3, 5, '#1b130d'); rect(g, cx - 1, y + 10, 3, 2, '#1b130d');
  rect(g, cx - 2, y + 15, 5, 1, '#0b0806'); rect(g, cx - 1, y + 16, 3, 1, '#0b0806');
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
  rect(g, Math.round(cx) - 2, y + 14, 5, 1, colour); rect(g, Math.round(cx) - 1, y + 15, 3, 1, colour);
}

function drawBanner(g, b, t, idx) {
  const col = CHAR_COLOUR[b.ch];
  const x = Math.round(b.x), y = Math.round(b.y);
  rect(g, x - 1, y - 30, 2, 31, '#2c2018'); rect(g, x - 2, y - 32, 4, 3, '#c8b45a');
  const len = 20;
  for (let i = 0; i < len; i++) {
    const wave = Math.round(Math.sin(t / 240 + i * 0.45 + idx) * (1 + i * 0.09));
    const hgt = 14 - Math.floor(i / 7) * 1;
    const tail = i > len - 5 ? (i - (len - 5)) : 0;                       // swallow-tail cut
    for (let j = 0; j < hgt; j++) {
      if (tail && Math.abs(j - hgt / 2) < tail * 0.9) continue;
      rect(g, x + 1 + i, y - 30 + j + wave, 1, 1, shade(col, (j < 2 ? 1.25 : j > hgt - 3 ? 0.65 : 1) * (0.92 + rnd(i, j, 4) * 0.12)));
    }
  }
  drawIcon(g, b.ch, x + 5, y - 27 + Math.round(Math.sin(t / 240 + 2.2 + idx) * 1), '#1b130d');
}

function chipLabel(g, text, x, y, colourName) {
  const w = textWidth(text) + 8;
  rect(g, x - 1, y - 1, w + 2, 13, '#0b0806');
  rect(g, x, y, w, 11, '#cdb98a');
  rect(g, x, y + 10, w, 1, '#a08c5c');
  rect(g, x, y, 3, 11, colourName ? PORTAL_COLOURS[colourName].ring : '#6b5a3a');
  drawText(g, text, x + 6, y + 3, '#2a1e10');
}

function render(t) {
  const { g } = game.screen;
  const S = game.state;
  g.drawImage(game.village.ground, 0, 0);

  const drawables = game.village.objects.map((o) => ({ key: o.key, draw: () => g.drawImage(o.c, o.x, o.y) }));
  const hits = [];
  const frameIdx = (period, off) => Math.floor((t + off) / period) % 2;
  const fx = game.village.fx;

  fx.fires.forEach((f) => drawables.push({ key: f.key + 0.05, draw: () => drawFlame(g, f.x, f.y, t + f.x * 7, f.kind === 'forge' ? 1.2 : 0.95) }));
  fx.banners.forEach((b, k) => drawables.push({ key: b.key + 0.1, draw: () => drawBanner(g, b, t, k) }));

  const plates = [];
  CHAR_NAMES.forEach((n, idx) => {
    const [ci, cj] = HOME[n];
    const [cx, cy] = tileCentre(ci, cj);
    const st = S.chars[n], set = game.chars[n];
    const spr = st.state === 'working' ? set.work[frameIdx(340, idx * 97)] : set.idle[frameIdx(700, idx * 211)];
    const colour = CHAR_COLOUR[n], hot = game.sel?.id === n || game.hover === n;
    drawables.push({
      key: ci + cj + 1,
      draw: () => {
        // aura under the feet in the character's own colour, plus a progress ring while working
        ellipseDots(g, cx, cy + 5, 19, 9.5, 36, hot ? 36 : 36, colour, colour, 2);
        if (st.state === 'working') ellipseDots(g, cx, cy + 5, 25, 12.5, 32, Math.round(st.progress * 32), '#ffd24a', '#3b3426', 3);
        drawSprite(g, spr, cx, cy, false);
      },
    });
    plates.push({ id: n, name: DISPLAY[n].toUpperCase(), cx, cy, st, hot });
    hits.push({ kind: 'char', id: n, x: cx - 24, y: cy + PLATE_DY[n] - 4, w: 48, h: -PLATE_DY[n] + 18 });
  });

  const b = game.barb, moving = b.path.length > 0;
  const [bx, by] = P(b.i, b.j);
  const bset = game.chars.barbarian;
  // With an imported sheet he has four true walking directions; otherwise one drawn sprite, mirrored.
  const walkFrames = bset.walk4 ? bset.walk4[b.dir4 || 'sw'] : bset.walk[b.dir];
  const bspr = moving
    ? walkFrames[Math.floor(t / (bset.walkMs || 130)) % walkFrames.length]
    : bset.idle[Math.floor(t / (bset.idleMs || 700)) % bset.idle.length];
  const mirror = !bset.walk4 && b.face < 0;
  drawables.push({
    key: b.i + b.j + 0.5,
    draw: () => { ellipseDots(g, bx, by + 5, 19, 9.5, 36, 36, CHAR_COLOUR.barbarian, CHAR_COLOUR.barbarian, 2); drawSprite(g, bspr, bx, by, mirror); },
  });
  plates.push({ id: 'barbarian', name: 'CEO', cx: bx, cy: by, st: null, hot: game.sel?.id === 'barbarian' || game.hover === 'barbarian' });
  hits.push({ kind: 'barb', id: 'barbarian', x: bx - 24, y: by + PLATE_DY.barbarian - 4, w: 48, h: -PLATE_DY.barbarian + 18 });

  drawables.sort((p, q) => p.key - q.key);
  for (const d of drawables) d.draw();
  drawParticles(g);
  drawFog(g);

  // portals float above their location; they light the area around them
  const group = {};
  for (const q of S.portals) (group[q.loc] ||= []).push(q);
  const portalLights = [], portalDraws = [];
  game.portalPos = [];
  for (const [loc, list] of Object.entries(group)) {
    const [hi, hj] = HOME[loc] || HOME['town-square'];
    const [cx, cy] = tileCentre(hi, hj);
    list.forEach((q, k) => {
      // each portal stands on the ground just beside its location, side by side when there are several
      const gx = Math.round(cx + 40 + k * 46), gy = Math.round(cy + 8);
      const px = gx - PORTAL_W / 2;
      const py = gy - PORTAL_H + Math.round(Math.sin(t / 520 + k + hi) * 2);
      const pc = PORTAL_COLOURS[q.colour];
      portalLights.push({ x: px + PORTAL_W / 2, y: py + PORTAL_H / 2, r: 60, col: pc.ring, flicker: true });
      portalDraws.push({ q, px, py, gx, gy });
      game.portalPos.push({ x: px + PORTAL_W / 2, y: py + PORTAL_H / 2, col: pc.glow });
    });
  }

  drawLighting(g, t, fx.lights, portalLights);

  for (const { q, px, py, gx, gy } of portalDraws) {
    ellipseDots(g, gx, gy - 1, 22, 8, 30, 30, PORTAL_COLOURS[q.colour].ring, PORTAL_COLOURS[q.colour].ring, 2);   // gate ring on the ground
    g.drawImage(game.portals[q.colour][Math.floor(t / 110) % PORTAL_FRAMES], px, py);
    hits.push({ kind: 'portal', id: q.id, x: px, y: py, w: PORTAL_W, h: PORTAL_H });
    if (game.sel?.id === q.id) {
      for (const [x, y, dx, dy] of [[px - 3, py - 3, 1, 1], [px + PORTAL_W + 2, py - 3, -1, 1], [px - 3, py + PORTAL_H + 2, 1, -1], [px + PORTAL_W + 2, py + PORTAL_H + 2, -1, -1]]) {
        rect(g, dx > 0 ? x : x - 4, y, 5, 1, '#fff3b0');
        rect(g, x, dy > 0 ? y : y - 4, 1, 5, '#fff3b0');
      }
    }
  }

  // work-item chips beside their location
  const perLoc = {};
  for (const chip of S.chips) {
    const [hi, hj] = HOME[chip.loc] || HOME['town-square'];
    const [cx, cy] = tileCentre(hi, hj);
    const k = perLoc[chip.loc] = (perLoc[chip.loc] ?? -1) + 1;
    const col = chip.state === 'BLOCKED_FOR_CEO' ? 'blue' : chip.state === 'ENVIRONMENT_BLOCKED' ? 'red' : null;
    chipLabel(g, chip.id, Math.round(cx + 24), Math.round(cy - 18 + k * 15), col);
  }

  // name plates, markers and place names sit on top so every agent is easy to find
  for (const p of plates) {
    const y0 = Math.round(p.cy) + PLATE_DY[p.id];
    drawPlate(g, p.id, p.name, Math.round(p.cx), y0, p.hot);
    if (p.st?.state === 'blocked') drawMarker(g, Math.round(p.cx), y0 - 24, p.st.blocked.colour, t);
    if (p.hot && p.id !== 'barbarian') drawTextCentred(g, PLACE[p.id].toUpperCase(), Math.round(p.cx), Math.round(p.cy) + 18, '#ffe9a8', '#0b0806');
    if (p.hot && p.id === 'barbarian') drawTextCentred(g, 'BARBARIAN', Math.round(p.cx), Math.round(p.cy) + 18, '#ffe9a8', '#0b0806');
  }
  const sq = tileCentre(...HOME['town-square']);
  drawTextCentred(g, 'TOWN SQUARE', Math.round(sq[0]), Math.round(sq[1]) + 34, '#d8c898', '#0b0806');

  if (game.sel && game.sel.kind !== 'portal') {
    const pl = plates.find((e) => e.id === game.sel.id);
    if (pl) { const ax = Math.round(pl.cx), ay = Math.round(pl.cy) + PLATE_DY[pl.id] - 38 - (st2(t)); rect(g, ax - 4, ay, 9, 1, '#fff3b0'); rect(g, ax - 3, ay + 1, 7, 1, '#fff3b0'); rect(g, ax - 1, ay + 2, 3, 1, '#fff3b0'); }
  }

  g.drawImage(game.vignette, 0, 0);
  g.drawImage(game.legend, 14, 14);
  game.hits = hits;
}

// The legend sits in the top-left corner of the canvas, drawn once.
function buildLegend() {
  const rows = [
    ['blue', 'BLUE  CEO DECISION'], ['gold', 'GOLD  WARNING'], ['red', 'RED   BLOCKED OUTSIDE'], ['grey', 'GREY  INFO ONLY'],
  ];
  const w = 214, h = 22 + rows.length * 14 + 6 + 3 * 14 + 8;
  const { c, g } = mk(w, h);
  rect(g, 0, 0, w, h, '#000');
  rect(g, 1, 1, w - 2, h - 2, '#17120d');
  rect(g, 1, 1, w - 2, 1, '#6b6256'); rect(g, 1, 1, 1, h - 2, '#6b6256');
  drawText(g, 'LEGEND', 8, 7, '#c8a85a', '#000', 2);
  let y = 24;
  for (const [col, label] of rows) {
    const p = PORTAL_COLOURS[col].ring;
    polyFn(g, [[13, y], [19, y + 5], [13, y + 10], [7, y + 5]], () => p);
    drawText(g, label, 26, y + 1, '#e6dcc2', '#000', 2);
    y += 14;
  }
  y += 6;
  const states = [['#8a8270', 'IDLE  AT REST'], ['#ffd24a', 'WORKING  WITH RING'], ['#ff5a4a', '!  BLOCKED, MARKER']];
  for (const [col, label] of states) {
    rect(g, 7, y, 11, 10, '#000'); rect(g, 8, y + 1, 9, 8, col);
    drawText(g, label, 26, y + 1, '#e6dcc2', '#000', 2);
    y += 14;
  }
  return c;
}
function st2(t) { return Math.floor(t / 300) % 2 ? 2 : 0; }

function buildVignette() {
  const { c, g } = mk(VW, VH);
  const gr = g.createRadialGradient(VW / 2, VH / 2, VH * 0.42, VW / 2, VH / 2, VW * 0.62);
  gr.addColorStop(0, 'rgba(6,5,3,0)'); gr.addColorStop(1, 'rgba(6,5,3,0.55)');
  g.fillStyle = gr; g.fillRect(0, 0, VW, VH);
  return c;
}

// ---- input -----------------------------------------------------------------

function canvasPoint(e) {
  const r = game.screen.c.getBoundingClientRect();
  return [(e.clientX - r.left) * (VW / r.width), (e.clientY - r.top) * (VH / r.height)];
}
function hitAt(x, y) {
  for (let k = game.hits.length - 1; k >= 0; k--) {
    const h = game.hits[k];
    if (h.kind === 'portal' && x >= h.x && x < h.x + h.w && y >= h.y && y < h.y + h.h) return h;
  }
  for (let k = game.hits.length - 1; k >= 0; k--) {
    const h = game.hits[k];
    if (h.kind !== 'portal' && x >= h.x && x < h.x + h.w && y >= h.y && y < h.y + h.h) return h;
  }
  return null;
}

function select(sel) { game.sel = sel; game.onChange(); }

function selectPortal(id, walk) {
  const q = game.state.portals.find((p) => p.id === id);
  if (!q) return;
  select({ kind: 'portal', id });
  if (walk && q.colour === 'blue') walkToLocation(q.loc);
}

function initInput() {
  const el = game.screen.c;
  el.addEventListener('click', (e) => {
    const [x, y] = canvasPoint(e);
    const h = hitAt(x, y);
    if (h) { select({ kind: h.kind, id: h.id }); return; }
    const [ti, tj] = screenToTile(x, y);
    if (isFree(ti, tj)) { walkTo(ti, tj); game.sel = null; game.onChange(); }
  });
  el.addEventListener('mousemove', (e) => {
    const [x, y] = canvasPoint(e);
    const h = hitAt(x, y);
    game.hover = h && h.kind !== 'portal' ? h.id : null;
    el.style.cursor = h ? 'pointer' : 'crosshair';
  });
  el.addEventListener('mouseleave', () => { game.hover = null; });
}

// ---- start --------------------------------------------------------------------

// The canvas is shown 25% larger than its internal 960x640 (1200x800), then shrinks to fit the window.
const DISPLAY_SCALE = 1.25;
function fitCanvas() {
  const wide = window.innerWidth >= VW * DISPLAY_SCALE + 360;
  const availW = wide ? window.innerWidth - 360 : window.innerWidth - 16;
  const fit = Math.min(availW / VW, (window.innerHeight - 16) / VH);
  const scale = fit >= DISPLAY_SCALE * 2 ? DISPLAY_SCALE * 2 : Math.min(DISPLAY_SCALE, fit);
  const w = VW * scale;
  const el = game.screen.c;
  el.style.width = Math.floor(w) + 'px';
  el.style.height = Math.floor(w * VH / VW) + 'px';
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

function startGame(data) {
  game.data = data;
  game.screen = (() => { const c = document.getElementById('screen'); const g = c.getContext('2d'); g.imageSmoothingEnabled = false; return { c, g }; })();
  game.village = buildVillage();
  game.chars = buildCharacters();
  game.portals = buildPortals();
  game.vignette = buildVignette();
  game.legend = buildLegend();
  game.state = deriveState(data);
  initFx(game.village);
  if (data.ceoSheet) loadCeoSheet(data.ceoSheet);
  initInput();
  fitCanvas();
  window.addEventListener('resize', fitCanvas);

  // The CEO walks to the oldest blue portal on load.
  const firstBlue = game.state.portals.find((p) => p.colour === 'blue');
  if (firstBlue) { game.sel = { kind: 'portal', id: firstBlue.id }; walkToLocation(firstBlue.loc); }

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    stepBarbarian(dt);
    updateFx(dt, now, game.portalPos);
    render(now);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  game.onChange();
  if (isServed()) setInterval(pollData, 3000);
}
