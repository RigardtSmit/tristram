'use strict';
// The village as a side-view street (SPEC 19.1), composed from the Gothicvania art listed in tools/map/art.json.
// Everything is measured in art pixels; the canvas is scaled up by the browser.

const WORLD_W = 1540, WORLD_H = 288, FEET = 250;

// Left to right along the street: where each character stands, and where portals appear.
const SPOT = { farnham: 70, adria: 232, griswold: 430, 'town-square': 632, ogden: 830, wirt: 1024, cain: 1196, lazarus: 1420 };
const PLACE = {
  'town-square': 'Town Square', cain: 'Cathedral archive', lazarus: 'Cathedral sanctum',
  wirt: 'The Inn cellar', griswold: 'The Forge', adria: "Adria's hut",
  farnham: 'The field beyond the walls', ogden: "Ogden's Tavern",
};

function loadArt(uris) {
  const out = {};
  return Promise.all(Object.entries(uris).map(([name, src]) => new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => { out[name] = img; resolve(); };
    img.onerror = () => reject(new Error(`art "${name}" did not load`));
    img.src = src;
  }))).then(() => out);
}

// Cut a horizontal sheet into frames.
function cut(img, fw, from = 0, n = Math.floor(img.width / fw)) {
  return Array.from({ length: n }, (_, k) => {
    const { c, g } = mk(fw, img.height);
    g.drawImage(img, (from + k) * fw, 0, fw, img.height, 0, 0, fw, img.height);
    return c;
  });
}
const single = (img) => { const { c, g } = mk(img.width, img.height); g.drawImage(img, 0, 0); return c; };

// Rotate the hue of a frame, so one drawn character can play two people.
function hueShift(src, deg, sat = 1) {
  const { c, g } = mk(src.width, src.height);
  g.drawImage(src, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height), a = deg * Math.PI / 180, cos = Math.cos(a), sin = Math.sin(a);
  const m = [0.213 + cos * 0.787 - sin * 0.213, 0.715 - cos * 0.715 - sin * 0.715, 0.072 - cos * 0.072 + sin * 0.928,
    0.213 - cos * 0.213 + sin * 0.143, 0.715 + cos * 0.285 + sin * 0.14, 0.072 - cos * 0.072 - sin * 0.283,
    0.213 - cos * 0.213 - sin * 0.787, 0.715 - cos * 0.715 + sin * 0.715, 0.072 + cos * 0.928 + sin * 0.072];
  for (let i = 0; i < d.data.length; i += 4) {
    const [r, gr, b] = [d.data[i], d.data[i + 1], d.data[i + 2]], l = (r + gr + b) / 3;
    d.data[i] = l + (m[0] * r + m[1] * gr + m[2] * b - l) * sat;
    d.data[i + 1] = l + (m[3] * r + m[4] * gr + m[5] * b - l) * sat;
    d.data[i + 2] = l + (m[6] * r + m[7] * gr + m[8] * b - l) * sat;
  }
  g.putImageData(d, 0, 0);
  return c;
}

// Every character: idle and walk frames, how high the head is, and optionally a separate "working" animation.
function buildCast(art) {
  const monk = (kind, n) => Array.from({ length: n }, (_, k) => single(art[`monk-${kind}${k + 1}`]));
  const recolour = (frames, deg, sat) => frames.map((f) => hueShift(f, deg, sat));
  const hatIdle = cut(art['hat-idle'], 39), hatWalk = cut(art['hat-walk'], 39);
  const bIdle = cut(art['bearded-idle'], 40), bWalk = cut(art['bearded-walk'], 40);
  return {
    cain: { idle: cut(art['oldman-idle'], 34), walk: cut(art['oldman-walk'], 34), head: 42 },
    griswold: { idle: bIdle, walk: bWalk, head: 47 },
    adria: { idle: cut(art['woman-idle'], 37), walk: cut(art['woman-walk'], 37), head: 46 },
    ogden: { idle: hatIdle, walk: hatWalk, head: 52 },
    wirt: { idle: recolour(hatIdle, 150), walk: recolour(hatWalk, 150), head: 52 },
    farnham: { idle: monk('idle', 4), walk: monk('walk', 6), head: 50 },
    lazarus: { idle: cut(art.wizard, 81, 0, 5), work: cut(art.wizard, 81, 5, 5), head: 54 },
    barbarian: { idle: recolour(bIdle, 320, 1.3), walk: recolour(bWalk, 320, 1.3), head: 47 },
  };
}

// The drawn street: ground, buildings and props. Sky and roofs scroll behind it at their own pace.
function buildStreet(art) {
  const { c, g } = mk(WORLD_W, WORLD_H);
  const stand = (img, x, flip) => {
    const y = FEET - img.height + 2;
    if (!flip) { g.drawImage(img, x, y); return; }
    g.save(); g.translate(x + img.width, y); g.scale(-1, 1); g.drawImage(img, 0, 0); g.restore();
  };

  // the cathedral, cut away so the archive and the sanctum show: window, column and altar bays under one roof
  const X0 = 1112, bays = [[0, 160], [176, 128], [320, 128]], top = FEET - 192 + 2;
  let nx = X0;
  for (const [sx, w] of bays) { g.drawImage(art.nave, sx, 0, w, 192, nx, top, w, 192); nx += w; }
  polyFn(g, [[X0 - 12, top + 1], [X0 + 208, 8], [nx + 12, top + 1]], (x, y) => ((y % 6 === 0 || (x + (y % 12 < 6 ? 0 : 4)) % 8 === 0) ? '#1a152c' : '#241d3a'));
  rect(g, X0 - 12, top, nx - X0 + 24, 3, '#120e20');
  rect(g, X0 + 206, 0, 4, 14, '#a07a3c'); rect(g, X0 + 202, 3, 12, 3, '#a07a3c');
  rect(g, X0 - 6, top, 6, 192, '#1a152c'); rect(g, nx, top, 6, 192, '#1a152c');

  // the field beyond the walls: an open fence
  for (let x = 6; x < 136; x += 26) { rect(g, x, FEET - 26, 4, 28, '#3a2a2e'); rect(g, x, FEET - 26, 1, 28, '#6a4a3e'); }
  rect(g, 6, FEET - 21, 134, 3, '#4e3836'); rect(g, 6, FEET - 11, 134, 3, '#4e3836');

  stand(hueShift(single(art['house-a']), 300, 0.9), 150);          // Adria's hut, tinted
  stand(art['house-c'], 320);                                      // the Forge
  stand(art['house-b'], 725);                                      // Ogden's Tavern
  stand(art['house-a'], 942, true);                                // the Inn
  stand(art.lamp, 546); stand(art.well, 566); stand(art.wagon, 660); stand(art.lamp, 716);
  g.drawImage(art.sign, 770, 150);
  stand(art.barrel, 400); stand(art.barrel, 508);
  stand(art.barrel, 770); stand(art.barrel, 900);
  stand(art['crate-stack'], 1050); stand(art.crate, 1006 - 40);

  for (let x = 0; x < WORLD_W; x += art.ground.width) g.drawImage(art.ground, x, 288 - art.ground.height);
  for (const [loc, x] of Object.entries(SPOT)) drawTextCentred(g, PLACE[loc].toUpperCase(), x, FEET + 18, '#d8c898', '#0b0806');
  return c;
}

// Fixed light sources: the street lamps, the forge's fire and the cathedral's candles.
const LIGHTS = [
  { x: 563, y: 150, r: 46, col: '#ffb060' }, { x: 733, y: 150, r: 46, col: '#ffb060' },
  { x: 372, y: 212, r: 60, col: '#ff6a20', fire: true }, { x: 470, y: 212, r: 60, col: '#ff6a20', fire: true },
  { x: 1150, y: 170, r: 40, col: '#ff9040' }, { x: 1224, y: 170, r: 40, col: '#ff9040' },
  { x: 1420, y: 170, r: 50, col: '#ff9040' },
];
function drawLight(g, x, y, r, col, a) {
  const gr = g.createRadialGradient(x, y, 0, x, y, r), [cr, cg, cb] = hexRgb(col);
  gr.addColorStop(0, `rgba(${cr},${cg},${cb},${a})`); gr.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);
  g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
}

// Sparks rising from the forge.
const embers = Array.from({ length: 10 }, (_, k) => ({ x: 372 + (k % 2) * 98 + k, y: 200 - k * 5, v: 10 + (k % 4) * 4 }));
function drawEmbers(g, dt) {
  for (const e of embers) {
    e.y -= e.v * dt; e.x += Math.sin(e.y / 8) * dt * 6;
    if (e.y < 150) e.y = 216;
    rect(g, Math.round(e.x), Math.round(e.y), 1, 1, e.y > 185 ? '#ffc060' : '#c84a18');
  }
}
