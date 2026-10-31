'use strict';
// Scenery props drawn in code. Each maker returns { c, ax, ay } with (ax, ay) the ground anchor.

function disc(g, cx, cy, rx, ry, fn) {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
      if (dx * dx + dy * dy <= 1) { const col = fn(x, y, dx, dy); if (col) dot(g, x, y, col); }
    }
  }
}

function makePine(seed) {
  const { c, g } = mk(36, 60);
  rect(g, 16, 50, 4, 9, '#3b2a1a'); rect(g, 19, 50, 1, 9, '#2a1d12'); rect(g, 15, 58, 6, 1, '#241810');
  const tops = [3, 14, 25, 36];
  tops.forEach((top, k) => {
    const hw = 8 + k * 3, bot = top + 21;
    polyFn(g, [[18, top], [18 + hw, bot], [18 - hw, bot]], (x, y) => {
      const n = rnd(x, y, seed);
      let f = (x < 18 ? 1.05 : 0.68) * (0.84 + n * 0.32);
      if (y > bot - 3) f *= 0.72;
      if (n > 0.93) f *= 1.25;
      return shade('#25492a', f);
    });
  });
  outline(c, '#07100a');
  return { c, ax: 18, ay: 59 };
}
function makeDeadTree(seed) {
  const { c, g } = mk(40, 56);
  polyFn(g, [[17, 55], [23, 55], [22, 30], [19, 10], [18, 10], [17, 30]], (x, y) => shade('#3d3024', (x < 20 ? 1.1 : 0.7) * (0.85 + rnd(x, y, seed) * 0.3)));
  const col = '#2f251b';
  line(g, 19, 30, 7, 18, col); line(g, 19, 30, 6, 19, col); line(g, 7, 18, 3, 8, col); line(g, 7, 18, 11, 6, col);
  line(g, 20, 22, 33, 12, col); line(g, 20, 22, 34, 13, col); line(g, 33, 12, 36, 3, col); line(g, 33, 12, 28, 4, col);
  line(g, 19, 14, 14, 3, col); line(g, 19, 14, 23, 2, col);
  outline(c, '#07100a');
  return { c, ax: 20, ay: 55 };
}
function makeBush(seed) {
  const { c, g } = mk(24, 16);
  for (const [cx, cy, r] of [[7, 9, 6], [14, 8, 7], [11, 6, 6]]) {
    disc(g, cx, cy, r, r - 1, (x, y, dx, dy) => shade('#2b4a26', (dy < -0.2 ? 1.25 : 0.9 - dx * 0.2) * (0.85 + rnd(x, y, seed) * 0.3)));
  }
  dot(g, 8, 6, '#a02a2a'); dot(g, 15, 9, '#a02a2a'); dot(g, 12, 4, '#a02a2a');
  outline(c, '#07100a');
  return { c, ax: 12, ay: 14 };
}
function makeRock(seed, big) {
  const s = big ? 1.5 : 1;
  const { c, g } = mk(Math.round(22 * s), Math.round(16 * s));
  const p = [[2, 13], [5, 4], [12, 1], [19, 6], [20, 13]].map(([x, y]) => [x * s, y * s]);
  polyFn(g, p, (x, y) => shade('#6f6c66', (x < 11 * s ? 1.08 : 0.7) * (0.86 + rnd(x, y, seed) * 0.28)));
  outline(c, '#0b0806');
  return { c, ax: Math.round(11 * s), ay: Math.round(13 * s) };
}
function makeBarrel() {
  const { c, g } = mk(16, 22);
  for (let y = 4; y < 19; y++) {
    const bulge = y > 8 && y < 15 ? 0 : 1;
    for (let x = 2 + bulge; x < 14 - bulge; x++) {
      const f = x < 6 ? 1.15 : x > 10 ? 0.65 : 0.95;
      dot(g, x, y, shade('#78532e', f * (x % 3 === 0 ? 0.88 : 1)));
    }
  }
  rect(g, 2, 7, 12, 1, '#2d2a28'); rect(g, 2, 15, 12, 1, '#2d2a28');
  disc(g, 8, 4, 5, 2, () => '#8a6538');
  outline(c, '#0b0806');
  return { c, ax: 8, ay: 20 };
}
function makeCrate() {
  const { c, g } = mk(24, 24);
  drawBox(g, { ox: 12, oy: 5, x: 0, y: 0, w: 0.5, d: 0.5, z: 0, h: 11, wall: '#80603a', tex: 'plank', roof: { type: 'flat' }, seed: 61 });
  outline(c, '#0b0806');
  return { c, ax: 12, ay: 14 };
}
function makeHay() {
  const { c, g } = mk(32, 26);
  drawBox(g, { ox: 16, oy: 6, x: 0, y: 0, w: 0.6, d: 0.45, z: 0, h: 11, wall: '#c8a850', tex: 'plank', roof: { type: 'flat' }, seed: 63 });
  for (let k = 0; k < 14; k++) dot(g, 6 + Math.floor(rnd(k, 1, 9) * 20), 8 + Math.floor(rnd(k, 2, 9) * 12), '#e8cf78');
  outline(c, '#0b0806');
  return { c, ax: 16, ay: 17 };
}
function makeCart() {
  const { c, g } = mk(56, 36);
  drawBox(g, { ox: 28, oy: 6, x: 0.05, y: 0.1, w: 0.9, d: 0.55, z: 5, h: 9, wall: '#6e4e2e', tex: 'plank', roof: { type: 'flat' }, seed: 64 });
  for (let k = 0; k < 18; k++) dot(g, 14 + Math.floor(rnd(k, 3, 9) * 28), 14 + Math.floor(rnd(k, 4, 9) * 6), '#d0b058');
  for (const wx of [18, 38]) {
    disc(g, wx, 27, 6, 6, (x, y, dx, dy) => (dx * dx + dy * dy > 0.5 ? '#3a2a1a' : '#6a4a2a'));
    rect(g, wx - 1, 21, 2, 12, '#3a2a1a'); rect(g, wx - 6, 26, 12, 2, '#3a2a1a');
  }
  line(g, 48, 22, 55, 30, '#4a3320');
  outline(c, '#0b0806');
  return { c, ax: 28, ay: 30 };
}
function makeBench() {
  const { c, g } = mk(36, 20);
  drawBox(g, { ox: 18, oy: 4, x: 0, y: 0, w: 0.7, d: 0.22, z: 5, h: 3, wall: '#70512f', tex: 'plank', roof: { type: 'flat' }, seed: 65 });
  rect(g, 8, 13, 2, 5, '#3f2d1a'); rect(g, 26, 10, 2, 5, '#3f2d1a');
  outline(c, '#0b0806');
  return { c, ax: 18, ay: 14 };
}
function makeTable() {
  const { c, g } = mk(40, 30);
  drawBox(g, { ox: 20, oy: 4, x: 0, y: 0, w: 0.7, d: 0.42, z: 9, h: 3, wall: '#7e5c36', tex: 'plank', roof: { type: 'flat' }, seed: 66 });
  for (const [x, y] of [[8, 14], [30, 12], [18, 21], [22, 18]]) rect(g, x, y, 2, 7, '#3f2d1a');
  rect(g, 17, 9, 3, 4, '#c89a4a'); rect(g, 20, 10, 1, 2, '#c89a4a');
  outline(c, '#0b0806');
  return { c, ax: 20, ay: 24 };
}
function makeLamp() {
  const { c, g } = mk(16, 52);
  rect(g, 7, 12, 2, 38, '#2e2a26'); rect(g, 5, 49, 6, 2, '#2e2a26');
  rect(g, 4, 4, 8, 9, '#1b1612'); rect(g, 5, 5, 6, 7, '#ffcf6a'); rect(g, 6, 6, 4, 5, '#fff0b0');
  rect(g, 3, 2, 10, 2, '#2e2a26');
  outline(c, '#0b0806');
  return { c, ax: 8, ay: 50, lamp: [8, 9] };
}
function makeBrazier() {
  const { c, g } = mk(24, 30);
  disc(g, 12, 18, 9, 4, (x, y, dx, dy) => (dy < 0 ? '#4a4540' : shade('#3a3632', 1 - dy * 0.3)));
  rect(g, 11, 20, 2, 7, '#2e2a26'); rect(g, 8, 27, 8, 2, '#2e2a26');
  disc(g, 12, 17, 7, 3, () => '#c4501a');
  outline(c, '#0b0806');
  return { c, ax: 12, ay: 28, fire: [12, 15] };
}
function makeGrave(seed) {
  const { c, g } = mk(16, 24);
  const cross = seed % 2 === 0;
  if (cross) { rect(g, 6, 3, 3, 16, '#7a766e'); rect(g, 2, 7, 11, 3, '#7a766e'); rect(g, 6, 3, 1, 16, '#9a968c'); }
  else { polyFn(g, [[3, 20], [3, 7], [7, 3], [11, 7], [11, 20]], (x, y) => shade('#7a766e', (x < 7 ? 1.1 : 0.75) * (0.88 + rnd(x, y, seed) * 0.24))); rect(g, 6, 8, 2, 6, '#4a4640'); }
  rect(g, 2, 20, 12, 2, '#3a4a2a');
  outline(c, '#0b0806');
  return { c, ax: 8, ay: 22 };
}
function makeAnvil() {
  const { c, g } = mk(20, 16);
  rect(g, 6, 9, 8, 5, '#3a3835'); rect(g, 3, 5, 15, 4, '#5c5954'); rect(g, 1, 5, 4, 3, '#5c5954'); rect(g, 3, 5, 15, 1, '#8a8780');
  outline(c, '#0b0806');
  return { c, ax: 10, ay: 14 };
}
function makeRack() {
  const { c, g } = mk(40, 36);
  rect(g, 6, 8, 2, 24, '#4a3320'); rect(g, 32, 8, 2, 24, '#4a3320'); rect(g, 6, 8, 28, 2, '#4a3320'); rect(g, 6, 18, 28, 2, '#4a3320');
  for (const x of [11, 17, 23, 29]) { rect(g, x, 3, 2, 22, '#9a968c'); rect(g, x - 1, 22, 4, 2, '#5a3f2a'); dot(g, x, 3, '#d8d4c8'); }
  outline(c, '#0b0806');
  return { c, ax: 20, ay: 32 };
}
function makeCauldron() {
  const { c, g } = mk(28, 26);
  disc(g, 14, 18, 10, 6, (x, y, dx, dy) => shade('#2c2a28', 1 - dy * 0.3 - (dx > 0.4 ? 0.15 : 0)));
  disc(g, 14, 13, 9, 3.5, () => '#5fd070');
  for (const x of [6, 14, 21]) rect(g, x, 22, 2, 3, '#1c1a18');
  outline(c, '#0b0806');
  return { c, ax: 14, ay: 24, glow: [14, 13] };
}
function makeWell() {
  const { c, g } = mk(56, 52);
  const o = { ox: 28, oy: 12, x: 0, y: 0, w: 1, d: 1, z: 0, h: 13, wall: '#6f6c65', roof: { type: 'flat' }, seed: 71 };
  drawBox(g, o);
  const A = Pc(o, 0.16, 0.16, 13), B = Pc(o, 0.84, 0.16, 13), C2 = Pc(o, 0.84, 0.84, 13), D = Pc(o, 0.16, 0.84, 13);
  polyFn(g, [A, B, C2, D], (x, y) => (rnd(x, y, 2) < 0.18 ? '#3a6a8a' : '#17303f'));
  rect(g, 16, 2, 3, 20, '#4f3926'); rect(g, 37, 2, 3, 20, '#4f3926'); rect(g, 14, 1, 28, 3, '#5f4630');
  rect(g, 27, 4, 1, 8, '#8a7a5a'); rect(g, 25, 11, 5, 4, '#5a3f2a');
  outline(c, '#0b0806');
  return { c, ax: 28, ay: 12 + 17 };
}
function makeHatch() {
  const { c, g } = mk(TW + 4, TH + 4);
  polyFn(g, [[32, 3], [58, 16], [32, 29], [6, 16]], (x, y) => (y % 3 === 0 ? '#0a0705' : '#201710'));
  for (let k = 0; k < 5; k++) rect(g, 24 + k * 2, 11 + k * 2, 16 - k * 4, 1, '#6a665e');
  line(g, 32, 3, 58, 16, '#5a564e'); line(g, 58, 16, 32, 29, '#3a3732'); line(g, 32, 29, 6, 16, '#3a3732'); line(g, 6, 16, 32, 3, '#5a564e');
  return { c, ax: 34, ay: 2 };
}
function makeScarecrow() {
  const { c, g } = mk(24, 36);
  rect(g, 11, 9, 3, 25, '#5a3f2a'); rect(g, 3, 14, 19, 3, '#5a3f2a');
  rect(g, 8, 3, 9, 8, '#c4a560'); rect(g, 6, 2, 13, 3, '#3b2a1a'); rect(g, 9, 0, 7, 3, '#3b2a1a');
  dot(g, 10, 7, '#1b130d'); dot(g, 14, 7, '#1b130d'); rect(g, 11, 9, 3, 1, '#1b130d');
  rect(g, 3, 17, 5, 8, '#6b5230'); rect(g, 17, 17, 5, 8, '#6b5230'); rect(g, 8, 17, 9, 10, '#7a6238');
  outline(c, '#0b0806');
  return { c, ax: 12, ay: 33 };
}
function makeReeds(seed) {
  const { c, g } = mk(22, 26);
  for (let k = 0; k < 7; k++) {
    const x = 3 + k * 2 + Math.floor(rnd(k, seed, 4) * 2), top = 2 + Math.floor(rnd(k, seed, 5) * 10);
    rect(g, x, top, 1, 24 - top, k % 2 ? '#4a6a2e' : '#38521f');
    if (k % 3 === 0) rect(g, x - 1, top - 2, 3, 4, '#5a3d22');
  }
  return { c, ax: 11, ay: 24 };
}
function makeSign(text) {
  const { c, g } = mk(40, 36);
  rect(g, 18, 8, 3, 26, '#4f3926');
  rect(g, 6, 4, 28, 12, '#a8874f'); rect(g, 6, 4, 28, 1, '#c8a86a'); rect(g, 6, 15, 28, 1, '#6a4f2a');
  drawText(c.getContext('2d'), text, 8, 8, '#2a1e10');
  outline(c, '#0b0806');
  return { c, ax: 20, ay: 34 };
}

// A fence run one tile long. axis 'i' runs along +i from the tile's top vertex, 'j' along +j.
function makeFence(axis) {
  const { c, g } = mk(TW + 8, 36);
  // A is the tile's top vertex, B the far end of the edge.
  const A = axis === 'i' ? [4, 6] : [4 + TW / 2, 6], B = axis === 'i' ? [4 + TW / 2, 6 + TH / 2] : [4, 6 + TH / 2];
  for (const off of [6, 12]) { line(g, A[0], A[1] + off, B[0], B[1] + off, '#6b4c2c'); line(g, A[0], A[1] + off + 1, B[0], B[1] + off + 1, '#3f2d1a'); }
  for (const p of [A, B]) { rect(g, p[0] - 1, p[1] - 2, 3, 20, '#5a3f26'); rect(g, p[0] - 1, p[1] - 2, 1, 20, '#7a5a38'); }
  outline(c, '#0b0806');
  return { c, ax: A[0], ay: 6 };
}
