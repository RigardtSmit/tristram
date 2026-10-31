'use strict';
// Characters drawn in code. Each sprite is 32x48 with the feet at (16, 45).

const CHAR_W = 32, CHAR_H = 64, FEET_X = 16, FEET_Y = 61;

// Vertically banded block: light from the left, shadow on the right and underneath.
function sh(g, x, y, w, h, col) {
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    let f = i === 0 ? 1.22 : i === 1 ? 1.08 : i >= w - 1 ? 0.6 : i >= w - 2 ? 0.8 : 1;
    if (j === h - 1) f *= 0.85;
    if (j === 0) f *= 1.1;
    f *= 0.95 + rnd(x + i, y + j, 3) * 0.1;
    dot(g, x + i, y + j, shade(col, f));
  }
}

function drawHead(g, x, y, sp, back) {
  sh(g, x, y, 8, 9, sp.skin);
  dot(g, x - 1, y + 4, shade(sp.skin, 0.85)); dot(g, x + 8, y + 4, shade(sp.skin, 0.7));      // ears
  if (!back) {
    dot(g, x + 2, y + 4, '#1b130d'); dot(g, x + 5, y + 4, '#1b130d');
    dot(g, x + 2, y + 3, shade(sp.hair || '#5a3a1e', 1)); dot(g, x + 5, y + 3, shade(sp.hair || '#5a3a1e', 0.9));
    dot(g, x + 4, y + 5, shade(sp.skin, 0.78)); rect(g, x + 3, y + 7, 2, 1, shade(sp.skin, 0.55));
    if (sp.ruddy) { dot(g, x + 1, y + 6, '#c4604a'); dot(g, x + 6, y + 6, '#b05040'); dot(g, x + 4, y + 5, '#c4604a'); }
  }
  const hc = sp.hair;
  if (!hc) return;
  if (back) { sh(g, x - 1, y - 2, 10, 12, hc); return; }
  if (sp.hairStyle === 'bald') { sh(g, x - 1, y + 2, 1, 4, hc); sh(g, x + 8, y + 2, 1, 4, hc); return; }
  sh(g, x - 1, y - 2, 10, 4, hc);
  sh(g, x - 1, y + 1, 2, sp.hairStyle === 'long' ? 11 : 5, hc);
  sh(g, x + 7, y + 1, 2, sp.hairStyle === 'long' ? 11 : 5, hc);
}

// ctx carries positions so accessories can attach to the hands and head.
function person(sp, st) {
  const { c, g } = mk(CHAR_W, CHAR_H);
  const cx = FEET_X, feet = FEET_Y;
  const legH = sp.legH ?? 12, torsoH = sp.torsoH ?? 15, w = sp.w ?? 12;
  const bob = st.bob | 0, sw = st.swing | 0, back = !!st.back;
  const wf = st.walk ?? -1;
  const lift = wf === 1 ? [3, 0] : wf === 3 ? [0, 3] : [0, 0];
  const armSwing = wf === 1 ? [-3, 3] : wf === 3 ? [3, -3] : [0, 0];
  const legTop = feet - legH;
  const torsoTop = legTop - torsoH - bob + (sp.stoop ? 1 : 0);
  const headTop = torsoTop - 10 + (sp.stoop ? 3 : 0);
  const x0 = cx - Math.floor(w / 2);
  const raised = sw && sp.raiseArm;
  const hand = { x: x0 + w + 1, y: raised ? torsoTop - 9 : torsoTop + 12 + armSwing[1] };
  const ctx = { g, cx, feet, legTop, torsoTop, headTop, x0, w, sw, bob, back, hand, sp, wf, armSwing };

  if (sp.under) sp.under(ctx);

  // legs and boots
  if (!sp.robe) {
    sh(g, cx - 5, legTop, 4, legH - 4 - lift[0], sp.legs);
    if (sp.peg) { rect(g, cx + 1, legTop, 3, legH - 3 - lift[1], '#7a5a34'); rect(g, cx + 1, legTop, 1, legH - 3, '#9a7444'); rect(g, cx, feet - 2, 5, 2, '#3a2a1a'); }
    else sh(g, cx + 1, legTop, 4, legH - 4 - lift[1], sp.legs);
    sh(g, cx - 6, feet - 4 - lift[0], 6, 4, sp.boots);
    if (!sp.peg) sh(g, cx, feet - 4 - lift[1], 6, 4, sp.boots);
  } else {
    sh(g, cx - 6, feet - 4 - lift[0], 6, 4, sp.boots);
    sh(g, cx, feet - 4 - lift[1], 6, 4, sp.boots);
  }

  // torso; robes flare toward the ground
  const bodyBottom = sp.robe ? feet - 3 : legTop + 1;
  for (let y = torsoTop; y < bodyBottom; y++) {
    const flare = sp.robe ? Math.floor((y - torsoTop) / 5) : 0;
    const hw = Math.floor(w / 2) + flare;
    for (let x = cx - hw; x < cx + hw; x++) {
      const t = (x - (cx - hw)) / (2 * hw);
      let f = t < 0.12 ? 1.2 : t < 0.3 ? 1.06 : t > 0.88 ? 0.6 : t > 0.7 ? 0.8 : 1;
      f *= 0.94 + rnd(x, y, 5) * 0.12;
      if (sp.robe && (y - torsoTop) % 6 === 5) f *= 0.82;           // folds
      dot(g, x, y, shade(sp.top, f));
    }
  }
  if (sp.hem && sp.robe) rect(g, cx - Math.floor(w / 2) - 3, bodyBottom - 2, w + 6, 2, sp.hem);
  if (sp.belt) { rect(g, x0, torsoTop + torsoH - 5, w, 2, sp.belt); rect(g, cx - 1, torsoTop + torsoH - 5, 3, 2, '#c8b45a'); }
  if (sp.trim && !back) { rect(g, cx - 1, torsoTop + 2, 2, bodyBottom - torsoTop - 3, sp.trim); }
  if (sp.collar) rect(g, cx - 4, torsoTop - 1, 8, 2, sp.collar);

  // arms
  const sleeve = sp.sleeve ?? sp.top;
  sh(g, x0 - 4, torsoTop + 1 + armSwing[0], 4, 11, sleeve);
  sh(g, x0 - 4, torsoTop + 12 + armSwing[0], 4, 3, sp.skin);
  if (raised) {
    sh(g, x0 + w, torsoTop - 8, 4, 11, sleeve);
    sh(g, x0 + w, torsoTop - 11, 4, 3, sp.skin);
  } else {
    sh(g, x0 + w, torsoTop + 1 + armSwing[1], 4, 11, sleeve);
    sh(g, x0 + w, torsoTop + 12 + armSwing[1], 4, 3, sp.skin);
  }

  // neck and head
  rect(g, cx - 2, torsoTop - 2, 4, 3, shade(sp.skin, 0.75));
  const hx = cx - 4 + (sp.stoop ? 1 : 0);
  drawHead(g, hx, headTop, sp, back);
  ctx.hx = hx;
  if (sp.extra) sp.extra(ctx);
  outline(c, '#0b0806');
  return c;
}

const SPECS = {
  cain: {
    skin: '#caa27c', hair: '#dedad0', hairStyle: 'long', top: '#6e4c2c', hem: '#c8a040', robe: true, w: 13, trim: '#c8a040', boots: '#2c1d12', raiseArm: true,
    extra({ g, hx, headTop, feet, hand, sw, back }) {
      if (!back) { sh(g, hx - 1, headTop + 5, 10, 8, '#e4e0d4'); sh(g, hx + 1, headTop + 13, 6, 4, '#e4e0d4'); dot(g, hx + 2, headTop + 4, '#1b130d'); dot(g, hx + 5, headTop + 4, '#1b130d'); }
      rect(g, hand.x + 1, headTop - 4, 3, feet - headTop + 4, '#6a4a2a'); rect(g, hand.x, headTop - 7, 5, 4, '#8a6a3a');
      if (sw) { rect(g, hand.x + 1, headTop - 12, 3, 4, '#7ee0ff'); dot(g, hand.x + 2, headTop - 14, '#e8fbff'); }
    },
  },
  wirt: {
    skin: '#d1a67e', hair: '#5a3a1e', top: '#7e3a2a', legs: '#4a3a2a', boots: '#3a2a1c', legH: 9, torsoH: 12, w: 11, peg: true, raiseArm: true,
    belt: '#2c1d12',
    extra({ g, hx, headTop, hand, sw }) {
      rect(g, hx - 2, headTop - 4, 12, 5, '#9a2a22'); rect(g, hx + 7, headTop - 2, 5, 3, '#6a1e18'); rect(g, hx - 2, headTop - 4, 12, 1, '#c04a3a');
      const by = sw ? hand.y - 2 : hand.y - 1;
      rect(g, hand.x, by, 7, 6, '#cdb98a'); rect(g, hand.x, by, 1, 6, '#fff3c8'); rect(g, hand.x + 5, by, 2, 6, '#a08c5c'); rect(g, hand.x + 1, by + 2, 4, 1, '#5a3f1a');
    },
  },
  griswold: {
    skin: '#cf9a72', hair: '#5a3a1e', hairStyle: 'bald', top: '#7c7468', sleeve: '#cf9a72', legs: '#3a2f27', boots: '#241a12',
    w: 17, torsoH: 17, legH: 12, belt: '#2c1d12', raiseArm: true, ruddy: true,
    extra({ g, hx, headTop, x0, w, torsoTop, hand, sw, back }) {
      if (!back) { sh(g, hx, headTop + 5, 8, 7, '#5a3a1e'); dot(g, hx + 2, headTop + 4, '#1b130d'); dot(g, hx + 5, headTop + 4, '#1b130d'); }
      sh(g, x0 + 2, torsoTop + 2, w - 4, 16, '#4a3320'); rect(g, x0 + 3, torsoTop + 2, 1, 16, '#6a4a2c'); rect(g, x0 + 4, torsoTop, 2, 3, '#2c1d12'); rect(g, x0 + w - 6, torsoTop, 2, 3, '#2c1d12');
      // hammer
      if (sw) { rect(g, hand.x + 1, hand.y - 17, 3, 18, '#5a3f2a'); sh(g, hand.x - 3, hand.y - 23, 11, 7, '#8e8a82'); rect(g, hand.x - 3, hand.y - 23, 11, 1, '#d8d4c8'); }
      else { rect(g, hand.x + 1, hand.y - 4, 3, 20, '#5a3f2a'); sh(g, hand.x - 3, hand.y + 14, 11, 7, '#8e8a82'); }
    },
  },
  adria: {
    skin: '#d8b08c', hair: '#9a2a1e', hairStyle: 'long', top: '#5e2f78', hem: '#8e64b0', robe: true, w: 11, trim: '#8e64b0', boots: '#241a2c', raiseArm: true,
    extra({ g, hx, headTop, feet, hand, sw }) {
      sh(g, hx - 3, headTop - 3, 14, 3, '#3f1f54');                                  // hat brim
      polyFn(g, [[hx + 4, headTop - 20], [hx + 9, headTop - 3], [hx - 1, headTop - 3]], (x, y) => shade('#3f1f54', (x < hx + 4 ? 1.2 : 0.75) * (0.9 + rnd(x, y, 8) * 0.2)));
      rect(g, hx - 1, headTop - 5, 10, 2, '#b068f0');
      rect(g, hand.x + 1, headTop - 8, 3, feet - headTop + 8, '#5a3f2a');            // staff
      disc(g, hand.x + 2, headTop - 11, 4, 4, () => (sw ? '#c8ffc0' : '#5fd070'));
      dot(g, hand.x + 1, headTop - 13, '#ffffff');
    },
  },
  farnham: {
    skin: '#d1a07a', hair: '#4a331f', top: '#4e5b34', legs: '#3a3228', boots: '#2a2018', stoop: true, raiseArm: true, torsoH: 14, w: 12, ruddy: true, belt: '#a08a5a',
    extra({ g, hx, headTop, hand, sw }) {
      sh(g, hx - 2, headTop - 3, 12, 4, '#4a331f'); rect(g, hx + 5, headTop - 4, 3, 2, '#4a331f');
      const by = sw ? headTop + 2 : hand.y - 2;
      rect(g, hand.x, by, 5, 9, '#3f7a4a'); rect(g, hand.x, by, 1, 9, '#7ad08a'); rect(g, hand.x + 1, by - 4, 3, 4, '#3f7a4a'); rect(g, hand.x + 1, by - 5, 3, 1, '#d8c070');
    },
  },
  lazarus: {
    skin: '#c9a27a', hair: '#2a2a2e', top: '#8c1e2c', hem: '#d8c068', robe: true, w: 13, torsoH: 17, trim: '#e8dca0', boots: '#241a12', raiseArm: true, collar: '#e8dca0',
    extra({ g, hx, headTop, feet, torsoTop, x0, hand, sw, back }) {
      sh(g, hx - 2, headTop - 5, 12, 5, '#ece4c8');                                 // mitre
      polyFn(g, [[hx + 4, headTop - 18], [hx + 10, headTop - 4], [hx - 2, headTop - 4]], (x, y) => shade('#ece4c8', (x < hx + 4 ? 1.1 : 0.78) * (0.92 + rnd(x, y, 6) * 0.16)));
      rect(g, hx + 3, headTop - 13, 2, 8, '#d8c068'); rect(g, hx + 1, headTop - 10, 6, 2, '#d8c068');
      if (!back) { sh(g, hx + 1, headTop + 6, 6, 5, '#2a2a2e'); dot(g, hx + 2, headTop + 4, '#1b130d'); dot(g, hx + 5, headTop + 4, '#1b130d'); }
      rect(g, x0 + 5, torsoTop + 4, 3, 9, '#e8dca0'); rect(g, x0 + 3, torsoTop + 6, 7, 2, '#e8dca0');   // cross on the chest
      rect(g, hand.x + 1, headTop - 8, 3, feet - headTop + 8, '#d8c068'); disc(g, hand.x + 2, headTop - 10, 5, 4, () => '#e8dca0');
      if (sw) { dot(g, hand.x - 2, headTop - 14, '#fff6c0'); dot(g, hand.x + 6, headTop - 16, '#fff6c0'); dot(g, hand.x + 2, headTop - 18, '#ffffff'); }
    },
  },
  ogden: {
    skin: '#d6a47e', hair: '#6a4a2a', hairStyle: 'bald', top: '#8e7a56', legs: '#3a2f27', boots: '#2a2018', w: 18, torsoH: 16, legH: 10, raiseArm: true, ruddy: true,
    extra({ g, hx, headTop, x0, w, torsoTop, hand, sw, back }) {
      if (!back) { rect(g, hx + 1, headTop + 6, 6, 2, '#5a3a1e'); dot(g, hx + 2, headTop + 4, '#1b130d'); dot(g, hx + 5, headTop + 4, '#1b130d'); }
      sh(g, x0 + 2, torsoTop + 3, w - 4, 14, '#ebe5d4'); rect(g, x0 + w - 6, torsoTop + 3, 3, 14, '#c9c2ae'); rect(g, x0 + 3, torsoTop + 3, 2, 14, '#fff8e8');
      const my = sw ? headTop + 2 : hand.y - 4;
      sh(g, hand.x - 1, my, 7, 8, '#c89a4a'); rect(g, hand.x + 6, my + 1, 2, 5, '#c89a4a'); rect(g, hand.x - 1, my - 2, 7, 2, '#f6efd8');
    },
  },
  barbarian: {
    skin: '#c28a62', hair: null, top: '#c28a62', legs: '#5a1e1a', boots: '#5a4630', w: 16, torsoH: 17, legH: 13, raiseArm: true,
    extra({ g, hx, headTop, x0, w, torsoTop, hand, sw, back, wf }) {
      sh(g, hx - 2, headTop - 5, 12, 8, '#8a867e');                                  // horned helm
      rect(g, hx - 2, headTop + 2, 12, 2, '#6a665e');
      polyFn(g, [[hx - 2, headTop - 2], [hx - 8, headTop - 12], [hx - 5, headTop - 1]], (x, y) => shade('#ece6d4', x < hx - 5 ? 1.1 : 0.8));
      polyFn(g, [[hx + 10, headTop - 2], [hx + 16, headTop - 12], [hx + 13, headTop - 1]], (x, y) => shade('#ece6d4', 0.85));
      if (!back) { rect(g, hx + 3, headTop + 3, 2, 5, '#8a867e'); dot(g, hx + 2, headTop + 5, '#1b130d'); dot(g, hx + 5, headTop + 5, '#1b130d'); }
      if (!back) { for (const y of [4, 8]) rect(g, x0 + 3, torsoTop + y, w - 6, 1, '#8a5a3c'); rect(g, x0 + 7, torsoTop + 2, 1, 12, '#8a5a3c'); }   // chest and abs
      rect(g, x0, torsoTop + 2, w, 2, '#6b4a2a'); rect(g, x0 + 2, torsoTop + 2, 3, 12, '#6b4a2a');                           // straps
      rect(g, x0 - 1, torsoTop + 14, w + 2, 6, '#6b4a2a');                                                                    // fur
      for (let k = 0; k < w; k += 2) rect(g, x0 - 1 + k, torsoTop + 20, 2, 1 + (k % 4 === 0 ? 1 : 0), '#4a3320');
      // axe
      const up = sw || wf >= 0;
      if (up) { rect(g, hand.x + 1, hand.y - 18, 3, 24, '#5a3f2a'); polyFn(g, [[hand.x + 3, hand.y - 20], [hand.x + 13, hand.y - 16], [hand.x + 13, hand.y - 8], [hand.x + 3, hand.y - 10]], (x, y) => shade('#b8b4aa', x < hand.x + 8 ? 1.1 : 0.8)); }
      else { rect(g, hand.x + 1, hand.y - 6, 3, 24, '#5a3f2a'); polyFn(g, [[hand.x + 3, hand.y - 8], [hand.x + 13, hand.y - 4], [hand.x + 13, hand.y + 4], [hand.x + 3, hand.y + 2]], (x, y) => shade('#b8b4aa', x < hand.x + 8 ? 1.1 : 0.8)); }
    },
  },
};

// Build the frames for every character once.
function buildCharacters() {
  const out = {};
  for (const [name, sp] of Object.entries(SPECS)) {
    out[name] = {
      idle: [person(sp, { bob: 0 }), person(sp, { bob: 1 })],
      work: [person(sp, { swing: 0 }), person(sp, { swing: 1 })],
    };
  }
  const b = SPECS.barbarian;
  out.barbarian.walk = { front: [0, 1, 2, 3].map((f) => person(b, { walk: f })), back: [0, 1, 2, 3].map((f) => person(b, { walk: f, back: true })) };
  return out;
}
