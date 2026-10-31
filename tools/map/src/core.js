'use strict';
// Pixel-art core: constants, projection, pixel helpers, tiny bitmap font.

const TW = 64, TH = 32;          // isometric tile size in screen pixels (2:1)
const VW = 960, VH = 640;        // internal resolution, scaled up by whole numbers
const OX = 480, OY = 122;        // screen position of tile (0,0)'s top vertex
const GRID = 15;
const K = 4 / 3;                 // art scale relative to the first 48px-tile design
const R = (n) => Math.round(n * K);

// Each character's signature colour (name plates, banners, ground aura).
const CHAR_COLOUR = {
  cain: '#e8c040', wirt: '#38c0b0', griswold: '#ee6a1e', adria: '#b068f0',
  farnham: '#68c040', lazarus: '#e03050', ogden: '#e8e0d0', barbarian: '#f4f4f4',
};

function line(g, x0, y0, x1, y1, col) {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  g.fillStyle = col;
  for (;;) {
    g.fillRect(x0, y0, 1, 1);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}

// 7x7 role icons for the name plates.
const ICONS = {
  cain: '#######' + '#.....#' + '#.###.#' + '#.....#' + '#.###.#' + '#.....#' + '#######',
  wirt: '.#####.' + '#.....#' + '.#####.' + '#.....#' + '.#####.' + '#.....#' + '.#####.',
  griswold: '.#####.' + '.#####.' + '..###..' + '...#...' + '...#...' + '...#...' + '...#...',
  adria: '#......' + '##.....' + '###....' + '####...' + '#####..' + '..##...' + '...##..',
  farnham: '..###..' + '...#...' + '...#...' + '..###..' + '.#####.' + '#######' + '.#####.',
  lazarus: '#######' + '#.....#' + '#.....#' + '#.....#' + '.#...#.' + '..#.#..' + '...#...',
  ogden: '.##.##.' + '#..#..#' + '#..#..#' + '#..#..#' + '#..#..#' + '#.###.#' + '.#...#.',
  barbarian: '#.#.#.#' + '#######' + '#######' + '.#####.' + '.......' + '.......' + '.......',
};
function drawIcon(g, name, x, y, col) {
  const s = ICONS[name]; g.fillStyle = col;
  for (let k = 0; k < 49; k++) if (s[k] === '#') g.fillRect(x + (k % 7), y + Math.floor(k / 7), 1, 1);
}

function mk(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.imageSmoothingEnabled = false;
  return { c, g };
}

// Deterministic noise in [0,1).
function rnd(x, y, s) {
  let n = (x * 374761393 + y * 668265263 + (s || 0) * 69069) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

function hexRgb(h) {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function shade(h, f) {
  const [r, g, b] = hexRgb(h);
  const c = (v) => Math.max(0, Math.min(255, Math.round(v * f)));
  return `rgb(${c(r)},${c(g)},${c(b)})`;
}

function rect(g, x, y, w, h, col) { g.fillStyle = col; g.fillRect(x, y, w, h); }
function dot(g, x, y, col) { g.fillStyle = col; g.fillRect(x, y, 1, 1); }

// Fill a polygon one pixel at a time (no antialiasing). fn(x, y) returns a colour or null.
function polyFn(g, pts, fn) {
  let minY = Infinity, maxY = -Infinity;
  for (const p of pts) { minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); }
  minY = Math.floor(minY); maxY = Math.ceil(maxY);
  for (let y = minY; y < maxY; y++) {
    const yc = y + 0.5, xs = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      if ((a[1] <= yc && b[1] > yc) || (b[1] <= yc && a[1] > yc)) {
        xs.push(a[0] + (yc - a[1]) * (b[0] - a[0]) / (b[1] - a[1]));
      }
    }
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const x0 = Math.round(xs[k]), x1 = Math.round(xs[k + 1]);
      for (let x = x0; x < x1; x++) {
        const col = fn(x, y);
        if (col) { g.fillStyle = col; g.fillRect(x, y, 1, 1); }
      }
    }
  }
}

// World projection. Tile (i,j): top vertex at P(i,j).
function P(i, j) { return [(i - j) * TW / 2 + OX, (i + j) * TH / 2 + OY]; }
function tileCentre(i, j) { return P(i + 0.5, j + 0.5); }
function screenToTile(sx, sy) {
  const u = (sx - OX) / (TW / 2), v = (sy - OY) / (TH / 2);
  return [Math.floor((u + v) / 2), Math.floor((v - u) / 2)];
}

// 3x5 bitmap font. Each glyph is five 3-character rows joined together.
const GLYPHS = {
  A: '.#.' + '#.#' + '###' + '#.#' + '#.#', B: '##.' + '#.#' + '##.' + '#.#' + '##.',
  C: '.##' + '#..' + '#..' + '#..' + '.##', D: '##.' + '#.#' + '#.#' + '#.#' + '##.',
  E: '###' + '#..' + '##.' + '#..' + '###', F: '###' + '#..' + '##.' + '#..' + '#..',
  G: '.##' + '#..' + '#.#' + '#.#' + '.##', H: '#.#' + '#.#' + '###' + '#.#' + '#.#',
  I: '###' + '.#.' + '.#.' + '.#.' + '###', J: '..#' + '..#' + '..#' + '#.#' + '.#.',
  K: '#.#' + '#.#' + '##.' + '#.#' + '#.#', L: '#..' + '#..' + '#..' + '#..' + '###',
  M: '#.#' + '###' + '###' + '#.#' + '#.#', N: '##.' + '#.#' + '#.#' + '#.#' + '#.#',
  O: '.#.' + '#.#' + '#.#' + '#.#' + '.#.', P: '##.' + '#.#' + '##.' + '#..' + '#..',
  Q: '.#.' + '#.#' + '#.#' + '##.' + '.##', R: '##.' + '#.#' + '##.' + '#.#' + '#.#',
  S: '.##' + '#..' + '.#.' + '..#' + '##.', T: '###' + '.#.' + '.#.' + '.#.' + '.#.',
  U: '#.#' + '#.#' + '#.#' + '#.#' + '###', V: '#.#' + '#.#' + '#.#' + '#.#' + '.#.',
  W: '#.#' + '#.#' + '###' + '###' + '#.#', X: '#.#' + '#.#' + '.#.' + '#.#' + '#.#',
  Y: '#.#' + '#.#' + '.#.' + '.#.' + '.#.', Z: '###' + '..#' + '.#.' + '#..' + '###',
  0: '###' + '#.#' + '#.#' + '#.#' + '###', 1: '.#.' + '##.' + '.#.' + '.#.' + '###',
  2: '##.' + '..#' + '.#.' + '#..' + '###', 3: '##.' + '..#' + '.#.' + '..#' + '##.',
  4: '#.#' + '#.#' + '###' + '..#' + '..#', 5: '###' + '#..' + '##.' + '..#' + '##.',
  6: '.##' + '#..' + '###' + '#.#' + '###', 7: '###' + '..#' + '.#.' + '.#.' + '.#.',
  8: '###' + '#.#' + '###' + '#.#' + '###', 9: '###' + '#.#' + '###' + '..#' + '##.',
  '-': '...' + '...' + '###' + '...' + '...', ':': '...' + '.#.' + '...' + '.#.' + '...',
  '.': '...' + '...' + '...' + '...' + '.#.', '/': '..#' + '..#' + '.#.' + '#..' + '#..',
  '%': '#.#' + '..#' + '.#.' + '#..' + '#.#', '!': '.#.' + '.#.' + '.#.' + '...' + '.#.',
  "'": '.#.' + '.#.' + '...' + '...' + '...', ' ': '.'.repeat(15),
};

function textWidth(s) { return s.length * 4 - 1; }

function drawText(g, s, x, y, col, shadow) {
  s = s.toUpperCase();
  for (let pass = shadow ? 0 : 1; pass < 2; pass++) {
    g.fillStyle = pass === 0 ? shadow : col;
    const ox = pass === 0 ? 1 : 0, oy = pass === 0 ? 1 : 0;
    for (let n = 0; n < s.length; n++) {
      const gl = GLYPHS[s[n]] || GLYPHS[' '];
      for (let k = 0; k < 15; k++) {
        if (gl[k] === '#') g.fillRect(x + n * 4 + (k % 3) + ox, y + Math.floor(k / 3) + oy, 1, 1);
      }
    }
  }
}
function drawTextCentred(g, s, cx, y, col, shadow) {
  drawText(g, s, Math.round(cx - textWidth(s) / 2), y, col, shadow);
}
