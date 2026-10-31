'use strict';
// Lighting, fire, smoke, embers, fog and water sparkle.

const BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
const fxState = { particles: [], lightCache: new Map(), flames: null, fog: null, dark: null, last: 0, water: [] };

// A smooth round light with an eased falloff, squashed to sit flat on the isometric floor.
// The "hole" clears the night wash; the "tint" adds a faint warm colour on top.
const LIGHT_SCALE = 0.7;   // overall light radius, relative to the radii set on each source

function lightSprite(r, col) {
  const key = `${r}|${col}`;
  if (fxState.lightCache.has(key)) return fxState.lightCache.get(key);
  const size = r * 2 + 1;
  const [cr, cg, cb] = hexRgb(col);
  const paint = (rgb, peak) => {
    const { c, g } = mk(size, size);
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, r);
    for (const [at, a] of [[0, 1], [0.25, 0.86], [0.5, 0.55], [0.75, 0.22], [1, 0]]) gr.addColorStop(at, `rgba(${rgb},${(a * peak).toFixed(3)})`);
    g.translate(r, r); g.scale(1, 0.87);
    g.fillStyle = gr; g.fillRect(-r, -r / 0.87, size, size / 0.87);
    return c;
  };
  const v = { hole: paint('255,255,255', 1), tint: paint(`${cr},${cg},${cb}`, 0.3), r };
  fxState.lightCache.set(key, v);
  return v;
}

function buildFlames() {
  const frames = [];
  for (let f = 0; f < 4; f++) {
    const { c, g } = mk(20, 28);
    const tongues = [[10, 26, 7, 21], [5, 26, 4, 13], [15, 26, 4, 12]];
    tongues.forEach(([cx, base, hw, hgt], k) => {
      const sway = Math.round(Math.sin((f + k) * 1.7) * 2), top = base - hgt - ((f + k) % 2);
      polyFn(g, [[cx + sway, top], [cx + hw, base], [cx - hw, base]], (x, y) => {
        const t = (y - top) / (base - top), n = rnd(x, y, 40 + f);
        if (t > 0.72 && n > 0.2) return '#fff2a0';
        if (t > 0.45) return n > 0.25 ? '#ffb02e' : '#ff7a1a';
        return n > 0.3 ? '#e8501a' : '#a8300f';
      });
    });
    frames.push(c);
  }
  return frames;
}

function buildFog() {
  return [0, 1, 2].map((s) => {
    const { c, g } = mk(260, 70);
    for (let y = 0; y < 70; y++) for (let x = 0; x < 260; x++) {
      const dx = (x - 130) / 130, dy = (y - 35) / 35, d = Math.hypot(dx, dy);
      if (d < 1 && rnd(x >> 1, y >> 1, 60 + s) < (1 - d) * 0.5 && (x + y) % 2 === 0) dot(g, x, y, 'rgba(190,205,215,0.16)');
    }
    return c;
  });
}

function initFx(village) {
  fxState.flames = buildFlames();
  fxState.fog = buildFog();
  fxState.dark = mk(VW, VH);
  fxState.fogs = [
    { x: 100, y: 470, s: 0, v: 5 }, { x: 560, y: 520, s: 1, v: -4 }, { x: 320, y: 390, s: 2, v: 3 }, { x: 760, y: 330, s: 0, v: -3 },
  ];
  // water tiles for sparkle
  fxState.water = [];
  for (let j = 0; j < GRID; j++) for (let i = 0; i < GRID; i++) if (tileType(i, j) === 'water') fxState.water.push(tileCentre(i, j));
  fxState.fx = village.fx;
}

function emit(p) { if (fxState.particles.length < 600) fxState.particles.push(p); }

function updateFx(dt, t, portals) {
  const fx = fxState.fx;
  for (const s of fx.smoke) if (Math.random() < dt * 2.2) emit({ kind: 'smoke', x: s.x, y: s.y, vx: 5 + Math.random() * 4, vy: -(9 + Math.random() * 5), life: 0, max: 3.2 + Math.random() });
  for (const f of fx.fires) {
    if (f.kind === 'forge' && Math.random() < dt * 14) emit({ kind: 'ember', x: f.x + (Math.random() - 0.5) * 18, y: f.y, vx: (Math.random() - 0.5) * 12, vy: -(18 + Math.random() * 22), life: 0, max: 1 + Math.random() });
    if (f.kind === 'brazier' && Math.random() < dt * 5) emit({ kind: 'ember', x: f.x + (Math.random() - 0.5) * 6, y: f.y, vx: (Math.random() - 0.5) * 6, vy: -(14 + Math.random() * 12), life: 0, max: 0.9 + Math.random() * 0.6 });
  }
  for (const p of portals) if (Math.random() < dt * 8) emit({ kind: 'spark', x: p.x + (Math.random() - 0.5) * 24, y: p.y + (Math.random() - 0.3) * 34, vx: (Math.random() - 0.5) * 10, vy: -(8 + Math.random() * 12), life: 0, max: 0.9, col: p.col });
  if (fxState.water.length && Math.random() < dt * 14) {
    const [wx, wy] = fxState.water[Math.floor(Math.random() * fxState.water.length)];
    emit({ kind: 'glint', x: wx + (Math.random() - 0.5) * 30, y: wy + (Math.random() - 0.5) * 10, vx: 0, vy: 0, life: 0, max: 0.7 });
  }
  for (const p of fxState.particles) { p.life += dt; p.x += p.vx * dt; p.y += p.vy * dt; if (p.kind === 'smoke') p.vx += dt * 2; }
  fxState.particles = fxState.particles.filter((p) => p.life < p.max);
  for (const f of fxState.fogs) { f.x += f.v * dt; if (f.x > VW + 140) f.x = -260; if (f.x < -280) f.x = VW + 100; }
}

function drawParticles(g) {
  for (const p of fxState.particles) {
    const k = p.life / p.max, x = Math.round(p.x), y = Math.round(p.y);
    if (p.kind === 'smoke') {
      const sz = 2 + Math.floor(k * 5), a = 0.5 * (1 - k);
      g.fillStyle = `rgba(150,148,142,${a.toFixed(2)})`; g.fillRect(x, y, sz, sz - 1);
    } else if (p.kind === 'ember') {
      g.fillStyle = k < 0.5 ? '#ffd060' : '#ff6a20'; g.fillRect(x, y, 1, 1);
    } else if (p.kind === 'spark') {
      g.fillStyle = p.col; g.globalAlpha = 1 - k; g.fillRect(x, y, 2, 2); g.globalAlpha = 1;
    } else if (p.kind === 'glint') {
      g.fillStyle = k < 0.5 ? '#bfe0f0' : '#6a9ab0'; g.fillRect(x, y, 2, 1);
    }
  }
}

function drawFlame(g, x, y, t, scale) {
  const f = fxState.flames[Math.floor(t / 90) % 4];
  const w = Math.round(20 * scale), h = Math.round(28 * scale);
  g.drawImage(f, Math.round(x - w / 2), Math.round(y - h + 2), w, h);
}

// Night wash with the lights cut out, then a warm tint added on top.
function drawLighting(g, t, lights, extra) {
  const D = fxState.dark;
  D.g.globalCompositeOperation = 'source-over';
  D.g.clearRect(0, 0, VW, VH);
  D.g.fillStyle = 'rgba(10,14,34,0.30)';
  D.g.fillRect(0, 0, VW, VH);
  D.g.globalCompositeOperation = 'destination-out';
  const all = lights.concat(extra);
  const spr = all.map((l, k) => {
    const flick = l.flicker ? Math.round(Math.sin(t / 130 + k * 2.1) * 2 + Math.sin(t / 53 + k) * 1.5) : 0;
    return { l, s: lightSprite(Math.max(8, Math.round(l.r * LIGHT_SCALE) + flick), l.col) };
  });
  for (const { l, s } of spr) D.g.drawImage(s.hole, Math.round(l.x - s.r), Math.round(l.y - s.r));
  D.g.globalCompositeOperation = 'source-over';
  g.drawImage(D.c, 0, 0);
  g.globalCompositeOperation = 'lighter';
  for (const { l, s } of spr) g.drawImage(s.tint, Math.round(l.x - s.r), Math.round(l.y - s.r));
  g.globalCompositeOperation = 'source-over';
}

function drawFog(g) {
  for (const f of fxState.fogs) g.drawImage(fxState.fog[f.s], Math.round(f.x), Math.round(f.y));
}
