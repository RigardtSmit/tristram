'use strict';
// The village: layout, terrain, buildings. All art is drawn here in code.

const HOME = {            // tile each character stands on (and where portals float above)
  'town-square': [7, 9],
  cain: [2, 4], lazarus: [4, 2], wirt: [4, 9], griswold: [11, 4],
  adria: [2, 6], farnham: [9, 13], ogden: [14, 8],
};
const PLACE = {
  'town-square': 'Town Square', cain: 'Cathedral archive', lazarus: 'Cathedral sanctum',
  wirt: 'The Inn cellar', griswold: 'The Forge', adria: "Adria's hut",
  farnham: 'The field beyond the walls', ogden: "Ogden's Tavern",
};

const WALL_ROW = 12, GATE_X = 7;
const SQUARE = { i0: 6, i1: 8, j0: 7, j1: 9 };
const PATHS = [   // straight runs [i0, j0, i1, j1] of dirt road
  [6, 7, 2, 7], [2, 7, 2, 4],            // west: Adria and Cain
  [6, 7, 6, 2], [6, 2, 4, 2],            // north: Lazarus
  [8, 7, 11, 7], [11, 7, 11, 4],         // east: Griswold
  [8, 10, 14, 10], [14, 10, 14, 8],      // south-east: Ogden
  [6, 9, 4, 9],                          // Wirt
  [7, 10, 7, 13], [7, 13, 9, 13],        // gate road and Farnham
];
const PATH_SET = new Set();
for (const [i0, j0, i1, j1] of PATHS) {
  for (let i = Math.min(i0, i1); i <= Math.max(i0, i1); i++) for (let j = Math.min(j0, j1); j <= Math.max(j0, j1); j++) PATH_SET.add(`${i},${j}`);
}

function inSquare(i, j) { return i >= SQUARE.i0 && i <= SQUARE.i1 && j >= SQUARE.j0 && j <= SQUARE.j1; }

function tileType(i, j) {
  if (j === 0 && i >= 4) return 'water';
  if (j === 1 && i >= 11) return 'water';
  if (j === WALL_ROW) return i === GATE_X ? 'dirt' : 'cobble';
  if (inSquare(i, j)) return 'cobble';
  if (PATH_SET.has(`${i},${j}`)) return 'dirt';
  if (j > WALL_ROW) return (i >= 3 && i <= 11 && j <= 14) ? 'field' : 'darkgrass';
  return 'grass';
}
const CLASS = { dirt: 'road', cobble: 'road', grass: 'green', darkgrass: 'green', field: 'green', water: 'water' };
function typeAt(i, j) { return i < 0 || j < 0 || i >= GRID || j >= GRID ? 'grass' : tileType(i, j); }

// ---- ground ---------------------------------------------------------------

function groundPixel(type, x, y) {
  const n = rnd(x, y, 3), m = rnd(x >> 1, y >> 1, 7), big = rnd(x >> 3, y >> 3, 13);
  switch (type) {
    case 'grass': {
      if (big < 0.05) return n < 0.5 ? '#3a2f1f' : '#33291b';                      // mud patch
      const c = n < 0.34 ? '#2a3b1d' : n < 0.7 ? '#334621' : '#25341a';
      if (n > 0.988) return ['#e0d54a', '#e8e8f0', '#c8607e'][Math.floor(rnd(x, y, 21) * 3)];   // flowers
      return n > 0.955 ? '#4a5f2c' : (m > 0.82 ? '#384d26' : c);
    }
    case 'darkgrass': {
      const c = n < 0.4 ? '#1d2a16' : n < 0.75 ? '#243219' : '#1a2412';
      return n > 0.97 ? '#36482b' : c;
    }
    case 'dirt': {
      if (big < 0.04) return n > 0.7 ? '#5a7480' : '#2c3d46';                        // puddle
      const rut = ((y * 2 - x) % 18 + 18) % 18 < 2;                                   // wheel ruts
      const c = n < 0.4 ? '#4c3b28' : n < 0.75 ? '#58452e' : '#40311f';
      if (rut) return '#33261a';
      return n > 0.95 ? '#74624a' : c;
    }
    case 'cobble': {
      const row = Math.floor(y / 5), off = (row % 2) * 6, cx = Math.floor((x + off) / 10);
      if (y % 5 === 0 || (x + off) % 10 === 0) return '#2a2825';
      const s = rnd(cx, row, 5);
      if (big < 0.08) return s < 0.5 ? '#3f5230' : '#364628';                         // moss
      return s < 0.3 ? '#57544e' : s < 0.65 ? '#4b4945' : '#625f58';
    }
    case 'field': {
      const stripe = Math.floor((x + y * 2) / 7) % 2;
      const c = stripe ? '#3a2b1a' : '#4c3a23';
      if (n > 0.92 && !stripe) return '#4f7a2c';
      return n < 0.1 ? '#2c2014' : c;
    }
    case 'water': {
      const wave = Math.sin((x + y * 2) * 0.35) > 0.8;
      return wave ? '#3b6c8c' : n < 0.5 ? '#1e4058' : '#183446';
    }
    default: return '#000';
  }
}

function renderGround() {
  const { c, g } = mk(VW, VH);
  rect(g, 0, 0, VW, VH, '#0b0907');
  for (let j = 0; j < GRID; j++) {
    for (let i = 0; i < GRID; i++) {
      const [cx, cy] = P(i, j), type = tileType(i, j), cls = CLASS[type];
      for (let y = cy; y < cy + TH; y++) {
        const hw = (TW / 2) * (1 - Math.abs(y + 0.5 - (cy + TH / 2)) / (TH / 2));
        const x0 = Math.round(cx - hw), x1 = Math.round(cx + hw);
        for (let x = x0; x < x1; x++) {
          const u = (x + 0.5 - cx) / (TW / 2), v = (y + 0.5 - (cy + TH / 2)) / (TH / 2), e = Math.abs(u) + Math.abs(v);
          let col = groundPixel(type, x, y);
          if (e > 0.8) {
            const ni = u >= 0 ? (v >= 0 ? [i + 1, j] : [i, j - 1]) : (v >= 0 ? [i, j + 1] : [i - 1, j]);
            const ncls = CLASS[typeAt(ni[0], ni[1])], r = rnd(x, y, 31);
            if (cls === 'road' && ncls === 'green' && e > 0.84) col = r < 0.6 ? (r < 0.3 ? '#77736a' : '#4a4640') : '#2c2a26';   // stone edging
            else if (cls === 'green' && ncls === 'road' && e > 0.9 && r < 0.5) col = '#5a4a32';                                  // trodden verge
            else if (cls === 'green' && ncls === 'water' && e > 0.86) col = r < 0.5 ? '#3a2e1e' : '#2a2216';                      // muddy bank
            else if (cls === 'water' && ncls !== 'water' && e > 0.86 && r < 0.6) col = '#9cc0d0';                                 // foam
          }
          dot(g, x, y, col);
        }
      }
    }
  }
  // lift the whole ground a little so the unlit parts stay readable at night
  const img = g.getImageData(0, 0, VW, VH), px = img.data;
  for (let k = 0; k < px.length; k += 4) {
    px[k] = Math.min(255, px[k] * 1.28); px[k + 1] = Math.min(255, px[k + 1] * 1.28); px[k + 2] = Math.min(255, px[k + 2] * 1.28);
  }
  g.putImageData(img, 0, 0);
  return c;
}

// ---- boxes (walls and roofs) ---------------------------------------------

function Pc(o, x, y, z) { return [o.ox + (x - y) * TW / 2, o.oy + (x + y) * TH / 2 - z]; }

function wallCol(o, face, u, v, x, y) {
  let f = face === 'L' ? 1 : 0.62;
  f *= 0.9 + rnd(x, y, o.seed || 1) * 0.2;
  if (o.tex === 'plank') { if (u % 7 === 0) f *= 0.78; if (v % 16 === 15) f *= 0.7; }
  else if (o.tex === 'plaster') { f *= 1.05; if (rnd(x >> 2, y >> 2, 4) < 0.1) f *= 0.88; }
  else {
    const row = Math.floor(v / 6), off = (row % 2) * 5, cell = Math.floor((u + off) / 11);
    if (v % 6 === 0 || (u + off) % 11 === 0) f *= 0.68;
    else f *= 0.92 + rnd(cell, row, o.seed || 1) * 0.16;
  }
  return shade(o.wall, f);
}

function drawBox(g, o) {
  const { x, y, w, d, z = 0, h } = o;
  const D = Pc(o, x, y + d, z), C = Pc(o, x + w, y + d, z), B = Pc(o, x + w, y, z);
  const up = (p, k) => [p[0], p[1] - k];
  polyFn(g, [D, C, up(C, h), up(D, h)], (px, py) => {
    const u = px - Math.round(D[0]);
    return wallCol(o, 'L', u, Math.round(D[1]) + (u >> 1) - py, px, py);
  });
  polyFn(g, [C, B, up(B, h), up(C, h)], (px, py) => {
    const u = px - Math.round(C[0]);
    return wallCol(o, 'R', u, Math.round(C[1]) - (u >> 1) - py, px, py);
  });
  const zt = z + h;
  const A2 = Pc(o, x, y, zt), B2 = Pc(o, x + w, y, zt), C2 = Pc(o, x + w, y + d, zt), D2 = Pc(o, x, y + d, zt);
  const r = o.roof;
  if (!r || r.type === 'flat') {
    polyFn(g, [A2, B2, C2, D2], (px, py) => shade(o.wall, 1.14 * (0.92 + rnd(px, py, 5) * 0.16)));
    line(g, D2[0], D2[1], C2[0], C2[1], shade(o.wall, 1.4)); line(g, C2[0], C2[1], B2[0], B2[1], shade(o.wall, 1.25));
  } else {
    const m = 0.16;
    const rA = Pc(o, x - m, y - m, zt), rB = Pc(o, x + w + m, y - m, zt);
    const rC = Pc(o, x + w + m, y + d + m, zt), rD = Pc(o, x - m, y + d + m, zt);
    const apex = Pc(o, x + w / 2, y + d / 2, zt + r.h);
    const shingle = (f) => (px, py) => {
      const row = Math.floor(py / 4), off = (row % 2) * 3;
      let k = f * (0.88 + rnd(px, py, 9) * 0.22);
      if (py % 4 === 0) k *= 0.7;
      else if ((px + off) % 6 === 0) k *= 0.82;
      return shade(r.col, k);
    };
    polyFn(g, [rD, rC, apex], shingle(1));
    polyFn(g, [rC, rB, apex], shingle(0.6));
    line(g, apex[0], apex[1], rC[0], rC[1], shade(r.col, 1.5));            // front hip
    line(g, apex[0], apex[1], rD[0], rD[1], shade(r.col, 1.25));
    line(g, apex[0], apex[1], rB[0], rB[1], shade(r.col, 0.5));
    line(g, rD[0], rD[1], rC[0], rC[1], shade(r.col, 0.45));               // eave shadow
    line(g, rC[0], rC[1], rB[0], rB[1], shade(r.col, 0.35));
    void rA;
    o.apex = apex;
  }
}

function faceBase(o, face) {
  const z = o.z || 0;
  return face === 'L' ? Pc(o, o.x, o.y + o.d, z) : Pc(o, o.x + o.w, o.y + o.d, z);
}
function faceLen(o, face) { return Math.round((face === 'L' ? o.w : o.d) * TW / 2); }
function faceXY(o, face, u, v) {
  const b = faceBase(o, face);
  return [Math.round(b[0]) + u, Math.round(b[1]) + (face === 'L' ? (u >> 1) : -(u >> 1)) - v];
}
function faceRect(g, o, face, u0, v0, w, h, col) {
  for (let a = 0; a < w; a++) {
    const [sx, sy] = faceXY(o, face, u0 + a, 0);
    g.fillStyle = col;
    g.fillRect(sx, sy - v0 - h, 1, h);
  }
}
// Window at a fraction along the face; lit panes also register a light.
function win(g, out, o, face, frac, v, w, h, lit, glow) {
  const u = Math.round(faceLen(o, face) * frac - w / 2);
  faceRect(g, o, face, u - 1, v - 1, w + 2, h + 2, '#1b130d');
  faceRect(g, o, face, u, v, w, h, lit);
  faceRect(g, o, face, u, v + h - 1, w, 1, shade(lit, 0.7));
  faceRect(g, o, face, u + Math.floor(w / 2), v, 1, h, '#2b1e12');
  faceRect(g, o, face, u, v + Math.floor(h / 2), w, 1, '#2b1e12');
  faceRect(g, o, face, u - 2, v - 2, w + 4, 1, shade(o.wall, 0.55));    // sill
  if (glow && out) { const [sx, sy] = faceXY(o, face, u + Math.floor(w / 2), v + Math.floor(h / 2)); out.lights.push({ x: sx, y: sy, r: glow.r, col: glow.col, flicker: glow.flicker }); }
}
function door(g, o, face, frac, w, h, col) {
  const u = Math.round(faceLen(o, face) * frac - w / 2);
  faceRect(g, o, face, u - 2, 0, w + 4, h + 3, '#150f0a');
  faceRect(g, o, face, u, 0, w, h, col || '#3b2616');
  faceRect(g, o, face, u + 1, h, w - 2, 1, col || '#3b2616');
  faceRect(g, o, face, u + Math.floor(w / 2), 0, 1, h, shade(col || '#3b2616', 0.6));
  faceRect(g, o, face, u + w - 3, Math.floor(h / 2), 2, 2, '#c8b45a');
  // stone steps
  const x = o.x + o.w * frac;
  drawBox(g, { ox: o.ox, oy: o.oy, x: x - 0.34, y: o.y + o.d, w: 0.68, d: 0.26, z: 0, h: 4, wall: '#6f6b63', roof: { type: 'flat' }, seed: 5 });
}
function timber(g, o, face, fracs, v0, h) {
  const len = faceLen(o, face);
  for (const f of fracs) faceRect(g, o, face, Math.round(len * f) - 1, v0, 3, h, '#2e2014');
  faceRect(g, o, face, 0, v0 + h - 3, len, 3, '#2e2014');
  faceRect(g, o, face, 0, v0 + Math.floor(h / 2), len, 2, '#2e2014');
}

function line2(g, a, b, col) { line(g, a[0], a[1], b[0], b[1], col); }

function outline(c, col) {
  const g = c.getContext('2d'), w = c.width, h = c.height;
  const src = g.getImageData(0, 0, w, h), d = src.data;
  const [r, gg, b] = hexRgb(col);
  const solid = (x, y) => x >= 0 && y >= 0 && x < w && y < h && d[(y * w + x) * 4 + 3] > 0;
  const out = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!solid(x, y) && (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1))) out.push([x, y]);
  }
  g.fillStyle = `rgb(${r},${gg},${b})`;
  for (const [x, y] of out) g.fillRect(x, y, 1, 1);
}

function spriteFor(w, d, up) {
  const { c, g } = mk((w + d) * (TW / 2) + 28, (w + d) * (TH / 2) + up + 28);
  return { c, g, ox: d * (TW / 2) + 14, oy: up + 14, out: { lights: [], smoke: [], fires: [], banners: [] } };
}
function chimney(s, o, x, y, z, h) {
  const c = { ox: o.ox, oy: o.oy, x, y, w: 0.3, d: 0.3, z, h, wall: '#58544d', roof: { type: 'flat' }, seed: 17 };
  drawBox(s.g, c);
  const top = Pc(c, x + 0.15, y + 0.15, z + h);
  s.out.smoke.push({ x: top[0], y: top[1] });
}
function finish(s, x0, y0, w, d) {
  outline(s.c, '#0b0806');
  return { sprite: s.c, ax: s.ox, ay: s.oy, x0, y0, w, d, out: s.out };
}

// ---- buildings -------------------------------------------------------------

function buildCathedral() {
  const s = spriteFor(3, 3, R(22) + R(26) + R(24) + 20);
  const base = { ox: s.ox, oy: s.oy, x: 0, y: 0, w: 3, d: 3, z: 0, h: R(24), wall: '#6c685f', roof: { type: 'flat' }, seed: 11 };
  drawBox(s.g, base);
  for (const f of [0.14, 0.86]) { win(s.g, s.out, base, 'L', f, 10, 6, 14, '#d4a84a', { r: 34, col: '#d8b860' }); win(s.g, s.out, base, 'R', f, 10, 6, 14, '#bf9640', { r: 30, col: '#d8b860' }); }
  win(s.g, s.out, base, 'R', 0.5, 12, 6, 14, '#bf9640', { r: 30, col: '#d8b860' });
  // buttresses
  for (const f of [0.3, 0.7]) faceRect(s.g, base, 'L', Math.round(96 * f) - 3, 0, 6, R(22), '#5d5950');
  door(s.g, base, 'L', 0.5, 16, 24, '#4b2f1a');
  const tower = { ox: s.ox, oy: s.oy, x: 1, y: 1, w: 1, d: 1, z: R(24), h: R(26), wall: '#615d55', roof: { type: 'pyr', h: R(24), col: '#33313d' }, seed: 12 };
  drawBox(s.g, tower);
  win(s.g, s.out, tower, 'L', 0.5, 14, 5, 12, '#d4a84a', { r: 28, col: '#d8b860' });
  win(s.g, s.out, tower, 'R', 0.5, 14, 5, 12, '#bf9640');
  const apex = tower.apex;
  rect(s.g, Math.round(apex[0]) - 1, Math.round(apex[1]) - 12, 3, 13, '#c8b45f');
  rect(s.g, Math.round(apex[0]) - 4, Math.round(apex[1]) - 9, 9, 3, '#c8b45f');
  const tl = Pc(base, 0, 0, R(24)), tr = Pc(base, 3, 0, R(24));
  s.out.banners.push({ x: tl[0] + 6, y: tl[1] + 3, ch: 'cain' });
  s.out.banners.push({ x: tr[0] - 6, y: tr[1] + 3, ch: 'lazarus' });
  return finish(s, 1, 1, 3, 3);
}

function buildInn() {
  const s = spriteFor(3, 2, R(18) + R(15) + 24);
  const o = { ox: s.ox, oy: s.oy, x: 0, y: 0, w: 3, d: 2, z: 0, h: R(18), wall: '#a99a78', tex: 'plaster', roof: { type: 'pyr', h: R(15), col: '#61291f' }, seed: 21 };
  drawBox(s.g, o);
  timber(s.g, o, 'L', [0.02, 0.33, 0.66, 0.98], 0, R(18));
  timber(s.g, o, 'R', [0.02, 0.5, 0.98], 0, R(18));
  for (const f of [0.17, 0.5, 0.83]) if (f !== 0.5) win(s.g, s.out, o, 'L', f, 9, 8, 9, '#f0b24a', { r: 36, col: '#f0b24a', flicker: true });
  door(s.g, o, 'L', 0.5, 12, 17, '#4a2f1a');
  win(s.g, s.out, o, 'R', 0.25, 9, 8, 9, '#f0b24a', { r: 30, col: '#f0b24a', flicker: true });
  win(s.g, s.out, o, 'R', 0.75, 9, 8, 9, '#f0b24a');
  chimney(s, o, 2.2, 0.35, R(18) + 6, 16);
  const ap = o.apex; s.out.banners.push({ x: ap[0], y: ap[1], ch: 'wirt' });
  return finish(s, 1, 9, 3, 2);
}

function buildForge() {
  const s = spriteFor(2, 2, R(15) + R(11) + 40);
  const o = { ox: s.ox, oy: s.oy, x: 0, y: 0, w: 2, d: 2, z: 0, h: R(15), wall: '#5d5a53', roof: { type: 'pyr', h: R(11), col: '#3a3731' }, seed: 31 };
  drawBox(s.g, o);
  chimney(s, o, 1.25, 0.2, R(15) + 6, 20);
  faceRect(s.g, o, 'L', 14, 0, 40, 22, '#130e0a');                         // open forge front
  faceRect(s.g, o, 'L', 16, 1, 36, 15, '#a8480f');
  faceRect(s.g, o, 'L', 20, 2, 28, 10, '#e07a20');
  faceRect(s.g, o, 'L', 26, 3, 16, 5, '#ffcf60');
  faceRect(s.g, o, 'L', 10, 0, 4, 24, '#3f3b35'); faceRect(s.g, o, 'L', 52, 0, 4, 24, '#3f3b35');
  const [fx, fy] = faceXY(o, 'L', 34, 12);
  s.out.fires.push({ x: fx, y: fy - 4, kind: 'forge' });
  s.out.lights.push({ x: fx, y: fy, r: 90, col: '#ff8a2a', flicker: true });
  win(s.g, s.out, o, 'R', 0.5, 9, 8, 8, '#d17a28', { r: 30, col: '#e08a30' });
  const ap = o.apex; s.out.banners.push({ x: ap[0], y: ap[1], ch: 'griswold' });
  return finish(s, 11, 2, 2, 2);
}

function buildHut() {
  const s = spriteFor(2, 2, R(13) + R(16) + 34);
  const o = { ox: s.ox, oy: s.oy, x: 0, y: 0, w: 2, d: 2, z: 0, h: R(13), wall: '#524a39', tex: 'plank', roof: { type: 'pyr', h: R(16), col: '#2f4e32' }, seed: 41 };
  drawBox(s.g, o);
  chimney(s, o, 0.3, 1.2, R(13) + 5, 16);
  door(s.g, o, 'L', 0.28, 11, 15, '#2c1d12');
  win(s.g, s.out, o, 'L', 0.7, 8, 8, 8, '#7ee08a', { r: 36, col: '#5fd070', flicker: true });
  win(s.g, s.out, o, 'R', 0.5, 8, 8, 8, '#7ee08a', { r: 26, col: '#5fd070' });
  // hanging herb bundles
  for (const [u, col] of [[44, '#4a7a34'], [50, '#7a5a34'], [56, '#4a7a34']]) { faceRect(s.g, o, 'L', u, 15, 3, 7, col); faceRect(s.g, o, 'L', u + 1, 22, 1, 3, '#3a2a1a'); }
  const ap = o.apex; s.out.banners.push({ x: ap[0], y: ap[1], ch: 'adria' });
  return finish(s, 0, 5, 2, 2);
}

function buildTavern() {
  const s = spriteFor(3, 2, R(18) + R(15) + 24);
  const o = { ox: s.ox, oy: s.oy, x: 0, y: 0, w: 3, d: 2, z: 0, h: R(18), wall: '#9c8a68', tex: 'plaster', roof: { type: 'pyr', h: R(15), col: '#5c3a26' }, seed: 51 };
  drawBox(s.g, o);
  timber(s.g, o, 'L', [0.02, 0.4, 0.98], 0, R(18));
  timber(s.g, o, 'R', [0.02, 0.5, 0.98], 0, R(18));
  for (const f of [0.15, 0.27]) win(s.g, s.out, o, 'L', f, 9, 8, 9, '#f6bc58', { r: 40, col: '#f0b24a', flicker: true });
  win(s.g, s.out, o, 'L', 0.88, 9, 8, 9, '#f6bc58');
  door(s.g, o, 'L', 0.6, 13, 17, '#4a2f1a');
  win(s.g, s.out, o, 'R', 0.25, 9, 8, 9, '#f6bc58', { r: 30, col: '#f0b24a' });
  win(s.g, s.out, o, 'R', 0.75, 9, 8, 9, '#f6bc58');
  chimney(s, o, 2.3, 0.3, R(18) + 6, 16);
  // hanging sign with a mug
  faceRect(s.g, o, 'L', 20, 20, 2, 12, '#1b130d'); faceRect(s.g, o, 'L', 20, 31, 20, 2, '#1b130d');
  faceRect(s.g, o, 'L', 22, 14, 16, 14, '#1b130d'); faceRect(s.g, o, 'L', 23, 15, 14, 12, '#a8874f');
  faceRect(s.g, o, 'L', 27, 17, 5, 7, '#f3ead0'); faceRect(s.g, o, 'L', 32, 18, 2, 4, '#f3ead0'); faceRect(s.g, o, 'L', 27, 23, 5, 1, '#d8a040');
  const ap = o.apex; s.out.banners.push({ x: ap[0], y: ap[1], ch: 'ogden' });
  return finish(s, 11, 8, 3, 2);
}

function makeWallBlock(tower) {
  const h = tower ? R(36) : R(15);
  const { c, g } = mk(TW + 16, h + TH + 36);
  const o = { ox: TW / 2 + 8, oy: h + 22, x: 0, y: 0, w: 1, d: 1, z: 0, h, wall: tower ? '#5e5a52' : '#68645c', roof: tower ? { type: 'pyr', h: R(14), col: '#3a3844' } : { type: 'flat' }, seed: tower ? 81 : 82 };
  drawBox(g, o);
  if (!tower) {
    for (let k = 0; k < 4; k++) { const p = Pc(o, 0.1 + k * 0.27, 0.1 + k * 0.27, h); rect(g, Math.round(p[0]) - 3, Math.round(p[1]) - 4, 6, 4, '#756f66'); }
  } else {
    const out = { lights: [] };
    win(g, out, o, 'L', 0.5, 18, 5, 10, '#d4a84a');
  }
  outline(c, '#0b0806');
  return { c, ax: o.ox, ay: o.oy };
}

// ---- the whole village --------------------------------------------------------

function buildVillage() {
  const ground = renderGround();
  const objects = [];   // { key, c, x, y }
  const blocked = [];
  const fx = { lights: [], smoke: [], fires: [], banners: [], glows: [] };
  for (let j = 0; j < GRID; j++) blocked.push(new Array(GRID).fill(false));
  const block = (x0, y0, w, d) => { for (let j = y0; j < y0 + d; j++) for (let i = x0; i < x0 + w; i++) blocked[j][i] = true; };

  const buildings = [buildCathedral(), buildInn(), buildForge(), buildHut(), buildTavern()];
  for (const b of buildings) {
    const [px, py] = P(b.x0, b.y0), key = b.x0 + b.w - 1 + b.y0 + b.d - 1 + 0.5;
    objects.push({ key, c: b.sprite, x: px - b.ax, y: py - b.ay });
    block(b.x0, b.y0, b.w, b.d);
    const at = (p) => ({ ...p, x: Math.round(px - b.ax + p.x), y: Math.round(py - b.ay + p.y) });
    for (const k of ['lights', 'smoke', 'fires', 'banners']) for (const p of b.out[k]) fx[k].push({ ...at(p), key });
  }

  // Place a prop on a tile (optionally nudged); registers its lights and fires.
  const place = (spr, i, j, o = {}) => {
    const [cx, cy] = tileCentre(i, j);
    const x = Math.round(cx - spr.ax + (o.dx || 0)), y = Math.round(cy - spr.ay + (o.dy || 0));
    const key = o.key ?? i + j + 0.5;
    objects.push({ key, c: spr.c, x, y });
    if (spr.lamp) fx.lights.push({ x: x + spr.lamp[0], y: y + spr.lamp[1], r: 52, col: '#ffcf6a', flicker: true });
    if (spr.fire) { fx.fires.push({ x: x + spr.fire[0], y: y + spr.fire[1], kind: 'brazier', key }); fx.lights.push({ x: x + spr.fire[0], y: y + spr.fire[1], r: 64, col: '#ff9a3a', flicker: true }); }
    if (spr.glow) fx.lights.push({ x: x + spr.glow[0], y: y + spr.glow[1], r: 34, col: '#5fd070', flicker: true });
    if (o.block !== false) blocked[j][i] = true;
  };
  const edge = (spr, i, j, key) => { const [px, py] = P(i, j); objects.push({ key, c: spr.c, x: px - spr.ax, y: py - spr.ay }); };

  // town wall, gate towers and the gate road
  const wall = makeWallBlock(false), tower = makeWallBlock(true);
  for (let i = 0; i < GRID; i++) {
    if (i === GATE_X) continue;
    const spr = (i === GATE_X - 1 || i === GATE_X + 1) ? tower : wall;
    const [px, py] = P(i, WALL_ROW);
    objects.push({ key: i + WALL_ROW + 0.5, c: spr.c, x: px - spr.ax, y: py - spr.ay });
    blocked[WALL_ROW][i] = true;
  }
  for (const i of [GATE_X - 1, GATE_X + 1]) { const [px, py] = P(i, WALL_ROW); fx.lights.push({ x: px, y: py - 30, r: 40, col: '#d8b860' }); }

  // the central square
  place(makeWell(), 7, 8, { key: 7 + 8 + 0.6, dy: -2 });
  const brazier = makeBrazier();
  place(brazier, 5, 6); place(brazier, 9, 6); place(brazier, 5, 10);   // (9,10) is the road to the tavern
  const bench = makeBench(); place(bench, 6, 10, { block: false }); place(bench, 8, 6, { block: false });

  // cathedral: graveyard and lamps
  for (const [i, j, s] of [[4, 4, 0], [5, 4, 1], [4, 5, 2], [5, 5, 3], [3, 5, 4]]) place(makeGrave(s), i, j, { dx: (s - 2) * 3 });
  place(makeLamp(), 1, 4); place(makeLamp(), 3, 4);
  // Inn: the hatch to Wirt's cellar, barrels, and a cart
  const [hx, hy] = P(4, 10);
  objects.push({ key: 0, c: makeHatch().c, x: hx - 32, y: hy - 3 });
  place(makeBarrel(), 1, 11); place(makeBarrel(), 2, 11, { dx: 8 }); place(makeCart(), 0, 10);
  // Forge: anvil, rack, barrels
  place(makeAnvil(), 12, 4); place(makeRack(), 13, 3); place(makeBarrel(), 13, 2);
  // Adria's hut: cauldron and crates
  place(makeCauldron(), 1, 7); place(makeCrate(), 0, 7); place(makeBush(5), 0, 8);
  // Tavern: tables, benches and barrels outside
  const table = makeTable(), tbench = makeBench();
  place(table, 12, 11); place(tbench, 11, 11, { block: false, dy: 4 }); place(table, 14, 11); place(makeBarrel(), 10, 9); place(makeBarrel(), 10, 8, { dx: -8 });
  // gate road lamps
  place(makeLamp(), 6, 11); place(makeLamp(), 8, 11);

  // fenced field beyond the wall, with hay and scarecrows
  const fenceI = makeFence('i'), fenceJ = makeFence('j');
  for (let i = 3; i <= 11; i++) if (i !== 7 && i !== 8 && i !== 9) edge(fenceI, i, 13, i + 13 - 0.4);
  for (let i = 8; i <= 9; i++) edge(fenceI, i, 14, i + 14 + 0.9);   // keep the path to Farnham open
  for (let j = 13; j <= 14; j++) edge(fenceJ, 3, j, 3 + j - 0.4);
  place(makeScarecrow(), 5, 14); place(makeScarecrow(), 10, 14, { dx: -6 });
  place(makeHay(), 4, 13, { block: false }); place(makeHay(), 11, 13, { block: false });

  // the stream on the north-east edge
  for (let i = 5; i < GRID; i += 2) place(makeReeds(i), i, 1, { block: false, dy: 8 });
  for (let i = 4; i < GRID; i++) blocked[0][i] = true;
  for (let i = 11; i < GRID; i++) blocked[1][i] = true;

  // trees: a ring of pines, gnarled dead trees, bushes and rocks, never in front of a character
  const pines = [makePine(1), makePine(2), makePine(3)], dead = [makeDeadTree(1), makeDeadTree(2)];
  const bushes = [makeBush(1), makeBush(2)], rocks = [makeRock(1), makeRock(2)];
  const nearHome = (i, j, r) => Object.values(HOME).some(([hi, hj]) => Math.abs(hi - i) + Math.abs(hj - j) <= r);
  for (let j = 0; j < GRID; j++) for (let i = 0; i < GRID; i++) {
    const type = tileType(i, j);
    if (blocked[j][i] || type === 'dirt' || type === 'cobble' || type === 'field' || type === 'water') continue;
    const onEdge = i === 0 || j === 0 || i === GRID - 1 || j === GRID - 1 || j === 1 && i >= 3;
    if (nearHome(i, j, onEdge ? 1 : 2)) continue;
    const r = rnd(i, j, 99);
    if (onEdge && (i + j) % 2 === 0 && r < 0.92) { place(r < 0.2 ? dead[(i + j) % 2] : pines[(i * 7 + j) % 3], i, j); }
    else if (!onEdge && r < 0.05) place(r < 0.012 ? dead[i % 2] : pines[(i + j) % 3], i, j);
    else if (!onEdge && r < 0.1) place(bushes[(i + j) % 2], i, j, { block: false });
    else if (r > 0.95) place(rocks[(i + j) % 2], i, j, { block: false });
  }
  place(makeSign('TRISTRAM'), 8, 11, { block: false, dx: 6 });

  // the CEO's own light and portal-free glow spots
  objects.sort((a, b) => a.key - b.key);
  return { ground, objects, blocked, fx };
}
