'use strict';
// Portals: swirling ellipses in the four portal colours (SPEC 17.3).

const PORTAL_W = 42, PORTAL_H = 58, PORTAL_FRAMES = 8;
const PORTAL_COLOURS = {
  blue: { ring: '#5aa0ff', mid: '#2a62c8', deep: '#10265e', glow: '#8cc0ff', name: 'Blue', meaning: 'CEO decision needed' },
  gold: { ring: '#ffd24a', mid: '#c8901c', deep: '#5a3c08', glow: '#ffe488', name: 'Gold', meaning: 'Warning, action optional' },
  red: { ring: '#ff5a4a', mid: '#b82418', deep: '#4e0e0a', glow: '#ff9a8c', name: 'Red', meaning: 'Stopped by something outside the village' },
  grey: { ring: '#c8c8c8', mid: '#7a7a7a', deep: '#2e2e2e', glow: '#e8e8e8', name: 'Grey', meaning: 'Information only' },
};

function portalFrame(col, t) {
  const { c, g } = mk(PORTAL_W, PORTAL_H);
  const cx = PORTAL_W / 2, cy = PORTAL_H / 2, a = 15, b = 24;
  for (let y = 0; y < PORTAL_H; y++) {
    for (let x = 0; x < PORTAL_W; x++) {
      const dx = (x + 0.5 - cx) / a, dy = (y + 0.5 - cy) / b;
      const r = Math.sqrt(dx * dx + dy * dy), ang = Math.atan2(dy, dx);
      if (r < 0.74) {
        const s = Math.sin(ang * 3 + r * 10 - t * 2 * Math.PI);
        dot(g, x, y, s > 0.45 ? col.mid : s > -0.3 ? col.deep : shade(col.deep, 0.65));
        if (s > 0.92 && r > 0.2) dot(g, x, y, col.glow);
        if (r < 0.12) dot(g, x, y, '#ffffff');
      } else if (r < 1.0) {
        const flick = Math.sin(ang * 5 - t * 2 * Math.PI) > 0.2;
        dot(g, x, y, r > 0.9 ? col.ring : flick ? col.glow : col.ring);
      } else if (r < 1.3) {
        const fade = (1.3 - r) / 0.3;
        if (rnd(x, y, 17 + Math.floor(t * 8)) < fade * 0.3) dot(g, x, y, col.mid);
      }
    }
  }
  return c;
}

function buildPortals() {
  const out = {};
  for (const [name, col] of Object.entries(PORTAL_COLOURS)) {
    out[name] = [];
    for (let f = 0; f < PORTAL_FRAMES; f++) out[name].push(portalFrame(col, f / PORTAL_FRAMES));
  }
  return out;
}
