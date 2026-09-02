// Canvas-authored arcade textures. The silhouettes keep their cabinet-era
// character, while smooth sampling prevents pixel crawl beside the new art.
import * as THREE from '../vendor/three.module.js';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

function tex(c, repeatX = 1, repeatY = 1) {
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 2;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeatX, repeatY);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function noise(ctx, w, h, colors, count) {
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = colors[(Math.random() * colors.length) | 0];
    ctx.fillRect((Math.random() * w) | 0, (Math.random() * h) | 0, 2, 2);
  }
}

export function roadTexture() {
  const c = canvas(128, 128);
  const g = c.getContext('2d');
  g.fillStyle = '#3a3a44';
  g.fillRect(0, 0, 128, 128);
  noise(g, 128, 128, ['#42424e', '#34343c', '#3e3e48'], 700);
  // Edge lines.
  g.fillStyle = '#f2f2e8';
  g.fillRect(4, 0, 5, 128);
  g.fillRect(119, 0, 5, 128);
  // Center dashes (yellow, fat).
  g.fillStyle = '#ffd23d';
  g.fillRect(60, 8, 8, 40);
  g.fillRect(60, 76, 8, 40);
  return tex(c, 1, 1);
}

export function groundTexture(base, detail) {
  const c = canvas(256, 256);
  const g = c.getContext('2d');
  g.fillStyle = base;
  g.fillRect(0, 0, 256, 256);
  const d = new THREE.Color(detail);
  const hex = (l) => '#' + d.clone().offsetHSL(0, 0, l).getHexString();
  // Broad blotches first so the surface has mid-frequency variation at speed,
  // then fine grain. A single-frequency speckle read as a flat demo plane.
  for (let i = 0; i < 26; i++) {
    g.fillStyle = hex(i % 2 ? 0.035 : -0.04);
    g.globalAlpha = 0.5;
    g.beginPath();
    g.ellipse(Math.random() * 256, Math.random() * 256, 26 + Math.random() * 42, 12 + Math.random() * 22, Math.random() * Math.PI, 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;
  noise(g, 256, 256, [detail, hex(0.06), hex(-0.06)], 2600);
  return tex(c, 40, 40);
}

// ---- Hawaii coast surfaces ----

export function sandTexture(kind = 'sand') {
  const c = canvas(128, 128);
  const g = c.getContext('2d');
  const base = kind === 'lava' ? '#2a2a30' : kind === 'rock' ? '#8d7a5c' : '#efdfae';
  g.fillStyle = base; g.fillRect(0, 0, 128, 128);
  const cols = kind === 'lava' ? ['#3a3a42', '#1e1e24', '#44444c']
    : kind === 'rock' ? ['#9a866a', '#7c6a4e', '#a89474'] : ['#f6e9c0', '#e2cf98', '#fff4d0'];
  noise(g, 128, 128, cols, 1400);
  return tex(c, 6, 6);
}

export function cliffTexture(kind = 'rock') {
  const c = canvas(128, 128);
  const g = c.getContext('2d');
  const base = kind === 'lava' ? '#1d1d22' : '#5d4632';
  g.fillStyle = base; g.fillRect(0, 0, 128, 128);
  // Basalt strata run along the coast: u (canvas x) is down the face, so the
  // layers are vertical bands here and horizontal on the cliff.
  for (let x = 0; x < 128; x += 9 + (x % 3)) {
    g.fillStyle = kind === 'lava'
      ? (x % 2 ? '#2b2b31' : '#151518')
      : (x % 2 ? '#6b533b' : '#4b3826');
    g.fillRect(x, 0, 4 + (x % 4), 128);
  }
  noise(g, 128, 128, kind === 'lava' ? ['#33333a', '#0f0f12'] : ['#7a6146', '#3e2c1c', '#8a7255'], 900);
  if (kind !== 'lava') {
    // Green scrub cap at the top of the bluff (u = 0).
    g.fillStyle = '#3e8a3c'; g.fillRect(0, 0, 20, 128);
    g.fillStyle = '#2f6e2f';
    for (let y = 0; y < 128; y += 7) g.fillRect(16 + (y % 3) * 2, y, 6, 4);
  }
  return tex(c, 1, 1);
}

export function foamTexture() {
  const c = canvas(256, 32);
  const g = c.getContext('2d');
  g.clearRect(0, 0, 256, 32);
  g.fillStyle = 'rgba(255,255,255,0.92)';
  for (let x = 0; x < 256; x += 3) {
    const h = 5 + Math.abs(Math.sin(x * 0.11) * 7 + Math.sin(x * 0.37) * 4);
    g.fillRect(x, 16 - h / 2, 3, h);
  }
  g.fillStyle = 'rgba(255,255,255,0.55)';
  for (let i = 0; i < 90; i++) g.fillRect((Math.random() * 256) | 0, (Math.random() * 32) | 0, 3, 2);
  const t = tex(c);
  t.magFilter = THREE.LinearFilter;
  return t;
}

export function towerTexture(wall = '#f1e9da') {
  // Waikiki resort tower wall: concrete, balcony rows, teal glass. One tile
  // is four floors; the box UVs repeat it to the tower's height.
  const c = canvas(128, 128);
  const g = c.getContext('2d');
  g.fillStyle = wall; g.fillRect(0, 0, 128, 128);
  const shade = new THREE.Color(wall).offsetHSL(0, 0, -0.12).getStyle();
  for (let y = 4; y < 128; y += 32) {
    for (let x = 6; x < 124; x += 30) {
      g.fillStyle = (x + y) % 3 ? '#3d9ab2' : '#2b7a90';
      g.fillRect(x, y, 20, 16);
      g.fillStyle = 'rgba(255,255,255,0.35)';
      g.fillRect(x + 2, y + 2, 6, 12);
      g.fillStyle = '#ffffff';
      g.fillRect(x - 2, y + 16, 24, 4);
    }
    g.fillStyle = shade;
    g.fillRect(0, y + 22, 128, 3);
  }
  const t = tex(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export function guardrailTexture() {
  const c = canvas(32, 64);
  const g = c.getContext('2d');
  g.fillStyle = '#f4f4f0'; g.fillRect(0, 0, 32, 64);
  g.fillStyle = '#d92c2c'; g.fillRect(0, 0, 32, 12);
  g.fillStyle = '#c9c9c9'; g.fillRect(0, 52, 32, 12);
  return tex(c);
}

export function skyTexture(colors) {
  const c = canvas(16, 256);
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, colors[0]);
  grad.addColorStop(0.62, colors[1]);
  grad.addColorStop(1, colors[2]);
  g.fillStyle = grad;
  g.fillRect(0, 0, 16, 256);
  const t = tex(c);
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearFilter;
  return t;
}

// ---- Sprite drawing helpers (billboard scenery) ----

export function palmTexture() {
  // Coconut palm at 192x288: a leaning ringed trunk and eleven drooping
  // fronds built from leaflet strokes. Replaces the 64x96 block palm that
  // read as Lego beside the painted backdrop.
  const c = canvas(192, 288);
  const g = c.getContext('2d');
  g.clearRect(0, 0, 192, 288);
  const baseX = 84;
  const topX = 118;
  const topY = 74;
  const trunkAt = (t) => ({
    x: baseX + (topX - baseX) * t * t,
    y: 288 - (288 - topY) * t,
    w: 14 - 6 * t,
  });
  for (let i = 0; i <= 40; i++) {
    const p = trunkAt(i / 40);
    g.fillStyle = i % 3 === 0 ? '#6a4726' : '#8d6237';
    g.fillRect(p.x - p.w / 2, p.y - 3, p.w, 6.5);
    g.fillStyle = 'rgba(255,220,160,0.22)';
    g.fillRect(p.x - p.w / 2 + 1, p.y - 3, 2.5, 6.5);
  }
  const frond = (ang, len, dark) => {
    const cx = topX; const cy = topY;
    g.strokeStyle = dark ? '#1f7a2c' : '#2f9c3a';
    g.lineWidth = 3;
    g.beginPath(); g.moveTo(cx, cy);
    const ex = cx + Math.cos(ang) * len;
    const ey = cy + Math.sin(ang) * len + len * 0.55;
    g.quadraticCurveTo(cx + Math.cos(ang) * len * 0.55, cy + Math.sin(ang) * len * 0.55 - 6, ex, ey);
    g.stroke();
    // Leaflets on both sides of the rib.
    for (let t = 0.12; t < 1; t += 0.07) {
      const tt = t;
      const px = cx + Math.cos(ang) * len * tt + (Math.cos(ang) * len * 0.55 - Math.cos(ang) * len) * 0;
      const py = cy + Math.sin(ang) * len * tt + len * 0.55 * tt * tt;
      const leaf = (1 - tt) * 22 + 6;
      const perp = ang + Math.PI / 2;
      g.strokeStyle = dark ? (t % 0.14 < 0.07 ? '#1b6e27' : '#25872f') : (t % 0.14 < 0.07 ? '#39b347' : '#2c9a39');
      g.lineWidth = 3.2;
      g.beginPath();
      g.moveTo(px, py);
      g.lineTo(px + Math.cos(perp) * leaf * 0.35, py + Math.sin(perp) * leaf * 0.35 + leaf * 0.7);
      g.moveTo(px, py);
      g.lineTo(px - Math.cos(perp) * leaf * 0.35, py - Math.sin(perp) * leaf * 0.35 + leaf * 0.7);
      g.stroke();
    }
  };
  // Back fronds darker, front fronds lighter for depth.
  [-2.9, -2.35, -1.2, -0.55].forEach((a) => frond(a, 62, true));
  [-3.35, -2.65, -2.0, -1.55, -0.95, -0.3, 0.15].forEach((a) => frond(a, 68, false));
  // Coconuts.
  ['#5b3b1a', '#6f4a22', '#4e3116'].forEach((col, i) => {
    g.fillStyle = col;
    g.beginPath(); g.arc(topX - 7 + i * 7, topY + 8 + (i % 2) * 4, 5, 0, Math.PI * 2); g.fill();
  });
  return tex(c);
}

export function cactusTexture() {
  const c = canvas(48, 80);
  const g = c.getContext('2d');
  g.fillStyle = '#2f8f43';
  g.fillRect(20, 12, 10, 68);
  g.fillRect(6, 26, 8, 22); g.fillRect(6, 26, 16, 8);
  g.fillRect(34, 36, 8, 18); g.fillRect(26, 36, 16, 8);
  g.fillStyle = '#247534';
  g.fillRect(22, 12, 2, 68); g.fillRect(27, 12, 2, 68);
  // Flowers.
  g.fillStyle = '#ff5aa2';
  g.fillRect(22, 8, 6, 5);
  return tex(c);
}

export function rockTexture() {
  // Rounded basalt boulder with a lit top and mossy foot.
  const c = canvas(128, 80);
  const g = c.getContext('2d');
  g.clearRect(0, 0, 128, 80);
  const shade = g.createRadialGradient(50, 26, 6, 64, 44, 60);
  shade.addColorStop(0, '#8d8375');
  shade.addColorStop(0.55, '#5f564c');
  shade.addColorStop(1, '#35302b');
  g.fillStyle = shade;
  g.beginPath();
  g.moveTo(6, 78); g.quadraticCurveTo(2, 40, 26, 22); g.quadraticCurveTo(48, 2, 82, 10);
  g.quadraticCurveTo(118, 18, 124, 50); g.quadraticCurveTo(126, 72, 118, 78);
  g.closePath(); g.fill();
  g.fillStyle = 'rgba(255,240,210,0.18)';
  g.beginPath(); g.ellipse(58, 26, 26, 10, -0.3, 0, Math.PI * 2); g.fill();
  g.fillStyle = 'rgba(40,90,40,0.55)';
  g.beginPath(); g.ellipse(64, 74, 58, 8, 0, 0, Math.PI * 2); g.fill();
  g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 2;
  g.beginPath(); g.moveTo(40, 30); g.quadraticCurveTo(60, 44, 66, 70); g.stroke();
  return tex(c);
}

export function skullTexture() {
  const c = canvas(40, 32);
  const g = c.getContext('2d');
  g.fillStyle = '#efe6d2';
  g.fillRect(8, 4, 24, 16);
  g.fillRect(12, 20, 16, 8);
  g.fillStyle = '#2b2b2b';
  g.fillRect(13, 10, 6, 6); g.fillRect(23, 10, 6, 6);
  g.fillRect(18, 22, 4, 4);
  // Horns.
  g.fillStyle = '#d9cbae';
  g.fillRect(0, 2, 10, 5); g.fillRect(30, 2, 10, 5);
  return tex(c);
}

export function hibiscusTexture() {
  // Flowering roadside hedge: leafy clumps with red and pink blooms.
  const c = canvas(96, 96);
  const g = c.getContext('2d');
  g.clearRect(0, 0, 96, 96);
  const leaf = ['#1f7c2e', '#2b9a3a', '#33ad45', '#186a26'];
  for (let i = 0; i < 26; i++) {
    g.fillStyle = leaf[i % leaf.length];
    const x = 14 + Math.random() * 68;
    const y = 30 + Math.random() * 58;
    g.beginPath(); g.ellipse(x, y, 12 + Math.random() * 8, 9 + Math.random() * 6, Math.random(), 0, Math.PI * 2); g.fill();
  }
  const petals = ['#ff3b6f', '#ff5aa2', '#ff7a3d', '#ffd23d'];
  for (let i = 0; i < 9; i++) {
    const x = 16 + Math.random() * 64;
    const y = 28 + Math.random() * 50;
    g.fillStyle = petals[i % petals.length];
    for (let p = 0; p < 5; p++) {
      const a = (p / 5) * Math.PI * 2;
      g.beginPath(); g.ellipse(x + Math.cos(a) * 4, y + Math.sin(a) * 4, 4, 2.6, a, 0, Math.PI * 2); g.fill();
    }
    g.fillStyle = '#ffe28a';
    g.beginPath(); g.arc(x, y, 1.8, 0, Math.PI * 2); g.fill();
  }
  return tex(c);
}

export function agaveTexture() {
  const c = canvas(56, 44);
  const g = c.getContext('2d');
  g.fillStyle = '#4f9e8a';
  for (let a = 0; a < 9; a++) {
    const ang = -Math.PI + a * (Math.PI / 8);
    for (let r = 4; r < 26; r += 3) {
      g.fillRect(28 + Math.cos(ang) * r - 2, 40 + Math.sin(ang) * r * 0.72 - 2, 5, 4);
    }
  }
  g.fillStyle = '#3d8071';
  g.fillRect(26, 18, 4, 22);
  return tex(c);
}

export function lanternTexture() {
  const c = canvas(32, 64);
  const g = c.getContext('2d');
  g.fillStyle = '#3a3a3a';
  g.fillRect(14, 0, 4, 30);
  g.fillStyle = '#ffb635';
  g.fillRect(8, 28, 16, 22);
  g.fillStyle = '#ffe28a';
  g.fillRect(12, 32, 8, 14);
  g.fillStyle = '#7c4a12';
  g.fillRect(6, 24, 20, 5); g.fillRect(6, 50, 20, 5);
  return tex(c);
}

export function buildingTexture() {
  const c = canvas(96, 80);
  const g = c.getContext('2d');
  const wall = ['#e8c88f', '#d8a86f', '#c9906a'][(Math.random() * 3) | 0];
  g.fillStyle = wall;
  g.fillRect(0, 16, 96, 64);
  // Tile roof.
  g.fillStyle = '#b5482a';
  g.fillRect(0, 8, 96, 12);
  g.fillStyle = '#9c3a20';
  for (let x = 0; x < 96; x += 8) g.fillRect(x, 8, 4, 12);
  // Door + windows with talavera trim.
  g.fillStyle = '#5f3517';
  g.fillRect(40, 44, 18, 36);
  g.fillStyle = '#2e7ec4';
  g.fillRect(10, 34, 16, 16); g.fillRect(70, 34, 16, 16);
  g.fillStyle = '#ffffff';
  g.fillRect(10, 40, 16, 3); g.fillRect(70, 40, 16, 3);
  g.fillStyle = '#ffd23d';
  g.fillRect(8, 32, 20, 2); g.fillRect(68, 32, 20, 2);
  g.fillRect(38, 42, 22, 2);
  return tex(c);
}

function signBase(g, w, h, bg) {
  // Posts.
  g.fillStyle = '#6b4a2a';
  g.fillRect(6, h - 26, 6, 26);
  g.fillRect(w - 12, h - 26, 6, 26);
  // Board.
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h - 22);
  g.strokeStyle = '#ffffff';
  g.lineWidth = 3;
  g.strokeRect(2, 2, w - 4, h - 26);
}

function signText(g, lines, colors, w, yStart, size) {
  g.textAlign = 'center';
  g.font = `bold ${size}px "Arial Black", sans-serif`;
  lines.forEach((line, i) => {
    g.fillStyle = colors[i % colors.length];
    g.fillText(line, w / 2, yStart + i * (size + 4));
  });
}

export function signTexture(kind) {
  const c = canvas(128, 88);
  const g = c.getContext('2d');
  switch (kind) {
    case 'sign_cruise':
      signBase(g, 128, 88, '#0b5aa5');
      signText(g, ['S.S. GASSY', 'ISLAND CRUISES'], ['#ffffff', '#ffd23d'], 128, 26, 16);
      g.fillStyle = '#ffffff'; g.fillRect(14, 44, 44, 10);
      g.fillStyle = '#e33'; g.fillRect(24, 36, 8, 8);
      break;
    case 'sign_lei':
      signBase(g, 128, 88, '#e94f9c');
      signText(g, ['LEI-ZY DAYS', 'RESORT'], ['#fff', '#ffe28a'], 128, 26, 17);
      break;
    case 'sign_beans':
      signBase(g, 128, 88, '#1f9e46');
      signText(g, ['HOT BEANS', '24 HOURS', 'NEXT EXIT'], ['#ffd23d', '#fff', '#fff'], 128, 22, 15);
      break;
    case 'sign_gas':
      signBase(g, 128, 88, '#d92c2c');
      signText(g, ['LAST GAS', '4 500 MILES'], ['#fff', '#ffd23d'], 128, 26, 17);
      break;
    case 'sign_van':
      signBase(g, 128, 88, '#7c3fa0');
      signText(g, ['VAN MURALS', 'WHILE-U-WAIT'], ['#ffd23d', '#fff'], 128, 26, 15);
      break;
    case 'sign_cantina':
      signBase(g, 128, 88, '#12203a');
      signText(g, ['TIO FRIJOLES', 'CANTINA'], ['#ff64d2', '#4fe0c0'], 128, 26, 16);
      g.fillStyle = '#4fe0c0'; g.fillRect(10, 48, 108, 3);
      break;
    case 'sign_mariachi':
      signBase(g, 128, 88, '#c8571b');
      signText(g, ['MARIACHI', 'TONIGHT!'], ['#fff', '#ffd23d'], 128, 26, 17);
      break;
    case 'sign_falling':
      signBase(g, 128, 88, '#ffd23d');
      signText(g, ['FALLING', 'COCONUTS'], ['#222', '#222'], 128, 26, 17);
      break;
    case 'sign_hot':
      signBase(g, 128, 88, '#c8262d');
      signText(g, ['CAUTION', 'HOT LAVA'], ['#fff', '#ffd23d'], 128, 26, 17);
      break;
    case 'sign_diner':
      signBase(g, 128, 88, '#2e7ec4');
      signText(g, ['MEL\u2019S BEANS', '2 MILES'], ['#fff', '#ffd23d'], 128, 26, 15);
      break;
    case 'sign_tequila':
      signBase(g, 128, 88, '#1f9e46');
      signText(g, ['TEQUILA TOWN', 'BIENVENIDOS'], ['#ffd23d', '#fff'], 128, 26, 13);
      break;
    default:
      signBase(g, 128, 88, '#333');
      signText(g, ['BEANS'], ['#fff'], 128, 34, 20);
  }
  return tex(c);
}

export function beanCanTexture() {
  const c = canvas(40, 48);
  const g = c.getContext('2d');
  // Can body.
  g.fillStyle = '#d8d8e0';
  g.fillRect(4, 4, 32, 40);
  g.fillStyle = '#b8b8c4';
  g.fillRect(4, 4, 32, 4); g.fillRect(4, 40, 32, 4);
  // Label.
  g.fillStyle = '#1f9e46';
  g.fillRect(4, 12, 32, 24);
  g.fillStyle = '#ffd23d';
  g.textAlign = 'center';
  g.font = 'bold 11px "Arial Black", sans-serif';
  g.fillText('BEANS', 20, 27);
  g.fillStyle = '#8a5a2b';
  g.fillRect(12, 30, 5, 4); g.fillRect(19, 31, 5, 4); g.fillRect(26, 30, 5, 4);
  return tex(c);
}

export function archTexture(label, bg, fg) {
  const c = canvas(256, 64);
  const g = c.getContext('2d');
  g.fillStyle = bg;
  g.fillRect(0, 0, 256, 64);
  // Checker strip top/bottom.
  for (let x = 0; x < 256; x += 16) {
    g.fillStyle = (x / 16) % 2 ? '#111' : '#fff';
    g.fillRect(x, 0, 16, 8);
    g.fillStyle = (x / 16) % 2 ? '#fff' : '#111';
    g.fillRect(x, 56, 16, 8);
  }
  g.fillStyle = fg;
  g.textAlign = 'center';
  g.font = 'bold 34px "Arial Black", sans-serif';
  g.fillText(label, 128, 44);
  return tex(c);
}

export function picadoTexture() {
  const c = canvas(256, 40);
  const g = c.getContext('2d');
  g.strokeStyle = '#222';
  g.lineWidth = 2;
  g.beginPath(); g.moveTo(0, 4); g.lineTo(256, 4); g.stroke();
  const cols = ['#ff5aa2', '#4fe0c0', '#ffd23d', '#7c3fa0', '#ff8a3d'];
  for (let i = 0; i < 8; i++) {
    g.fillStyle = cols[i % cols.length];
    const x = i * 32 + 2;
    g.fillRect(x, 6, 28, 22);
    // Zigzag bottom.
    g.beginPath();
    g.moveTo(x, 28);
    for (let z = 0; z <= 28; z += 7) g.lineTo(x + z + 3.5, z % 14 ? 28 : 36);
    g.lineTo(x + 28, 28);
    g.closePath(); g.fill();
    // Punched holes.
    g.clearRect(x + 8, 12, 5, 5); g.clearRect(x + 16, 12, 5, 5);
    g.clearRect(x + 12, 20, 5, 5);
  }
  return tex(c);
}

export function mesaTexture() {
  const c = canvas(512, 96);
  const g = c.getContext('2d');
  g.fillStyle = '#b0552f';
  [[20, 30, 90, 66], [180, 18, 130, 78], [390, 36, 100, 60]].forEach(([x, y, w, h]) => {
    g.fillRect(x + 14, y, w - 28, 10);
    g.fillRect(x + 6, y + 10, w - 12, 12);
    g.fillRect(x, y + 22, w, h - 22);
  });
  g.fillStyle = '#8f4224';
  [[20, 30, 90], [180, 18, 130], [390, 36, 100]].forEach(([x, y, w]) => {
    g.fillRect(x, y + 60, w, 8);
  });
  return tex(c);
}

export function oceanTexture() {
  const c = canvas(256, 64);
  const g = c.getContext('2d');
  g.fillStyle = '#1673c9';
  g.fillRect(0, 0, 256, 64);
  g.fillStyle = '#3a97e8';
  for (let i = 0; i < 60; i++) {
    g.fillRect((Math.random() * 256) | 0, (Math.random() * 60) | 0, 10, 2);
  }
  // Cruise ship silhouette.
  g.fillStyle = '#f4f4f4';
  g.fillRect(150, 16, 70, 14);
  g.fillRect(160, 8, 44, 10);
  g.fillStyle = '#e33';
  g.fillRect(168, 2, 8, 8); g.fillRect(184, 2, 8, 8);
  return tex(c);
}

export function townTexture() {
  const c = canvas(512, 96);
  const g = c.getContext('2d');
  for (let x = 0; x < 512;) {
    const w = 40 + ((Math.random() * 50) | 0);
    const h = 30 + ((Math.random() * 46) | 0);
    g.fillStyle = ['#43265e', '#552f74', '#392052'][(Math.random() * 3) | 0];
    g.fillRect(x, 96 - h, w, h);
    g.fillStyle = '#ffb635';
    for (let wx = x + 6; wx < x + w - 8; wx += 12) {
      for (let wy = 96 - h + 8; wy < 88; wy += 14) {
        if (Math.random() > 0.4) g.fillRect(wx, wy, 5, 7);
      }
    }
    x += w + 6;
  }
  return tex(c);
}

export function fartPuffTexture() {
  const c = canvas(32, 32);
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(16, 16, 2, 16, 16, 16);
  grad.addColorStop(0, 'rgba(190,255,120,0.95)');
  grad.addColorStop(0.55, 'rgba(110,205,60,0.7)');
  grad.addColorStop(1, 'rgba(80,160,40,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 32, 32);
  const t = tex(c);
  t.magFilter = THREE.LinearFilter;
  return t;
}

export function blobShadowTexture() {
  const c = canvas(64, 32);
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 16, 2, 32, 16, 16);
  grad.addColorStop(0, 'rgba(0,0,0,0.45)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.save(); g.scale(2, 1);
  g.fillRect(0, 0, 32, 32);
  g.restore();
  const t = tex(c);
  t.magFilter = THREE.LinearFilter;
  return t;
}

export function sunTexture(color = '#fff3b0') {
  const c = canvas(64, 64);
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 4, 32, 32, 32);
  grad.addColorStop(0, color);
  grad.addColorStop(0.35, color);
  grad.addColorStop(1, 'rgba(255,240,180,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = tex(c);
  t.magFilter = THREE.LinearFilter;
  return t;
}

export function dirtRoadTexture() {
  const c = canvas(128, 128);
  const g = c.getContext('2d');
  g.fillStyle = '#8a6a3e';
  g.fillRect(0, 0, 128, 128);
  noise(g, 128, 128, ['#96754a', '#7c5e35', '#8f6f42'], 800);
  // Tire ruts.
  g.fillStyle = '#75592f';
  g.fillRect(28, 0, 14, 128); g.fillRect(86, 0, 14, 128);
  return tex(c, 1, 1);
}

// ---- traffic vehicles (chunky canvas sprites) ----

export function semiFrontTexture() {
  const c = canvas(72, 64);
  const g = c.getContext('2d');
  // Trailer visible over the cab.
  g.fillStyle = '#d8d8e0'; g.fillRect(8, 0, 56, 22);
  // Cab.
  g.fillStyle = '#c8262d'; g.fillRect(10, 20, 52, 30);
  g.fillStyle = '#8ed4ff'; g.fillRect(16, 24, 40, 12);
  g.fillStyle = '#8f1116'; g.fillRect(10, 38, 52, 6);
  // Grille + bumper.
  g.fillStyle = '#c9c9d4'; g.fillRect(18, 44, 36, 8); g.fillRect(8, 52, 56, 6);
  g.fillStyle = '#ffe28a'; g.fillRect(12, 46, 8, 6); g.fillRect(52, 46, 8, 6);
  // Wheels.
  g.fillStyle = '#1c1c22'; g.fillRect(8, 56, 14, 8); g.fillRect(50, 56, 14, 8);
  // Smokestacks.
  g.fillStyle = '#9a9aa8'; g.fillRect(4, 8, 5, 40); g.fillRect(63, 8, 5, 40);
  return tex(c);
}

export function busFrontTexture() {
  const c = canvas(64, 64);
  const g = c.getContext('2d');
  g.fillStyle = '#ffb635'; g.fillRect(6, 4, 52, 52);
  g.fillStyle = '#8ed4ff'; g.fillRect(10, 10, 44, 14);
  g.fillStyle = '#333'; g.fillRect(10, 30, 44, 4);
  g.fillStyle = '#c9c9d4'; g.fillRect(6, 48, 52, 6);
  g.fillStyle = '#ffe28a'; g.fillRect(10, 40, 8, 6); g.fillRect(46, 40, 8, 6);
  g.fillStyle = '#1c1c22'; g.fillRect(8, 56, 12, 8); g.fillRect(44, 56, 12, 8);
  g.fillStyle = '#c8262d';
  g.font = 'bold 9px "Arial Black", sans-serif';
  g.textAlign = 'center'; g.fillText('TOURS', 32, 37);
  return tex(c);
}

export function sedanFrontTexture(color) {
  const c = canvas(64, 40);
  const g = c.getContext('2d');
  g.fillStyle = color; g.fillRect(6, 14, 52, 18);
  g.fillRect(12, 4, 40, 14);
  g.fillStyle = '#8ed4ff'; g.fillRect(16, 6, 32, 10);
  g.fillStyle = '#ffe28a'; g.fillRect(9, 18, 10, 7); g.fillRect(45, 18, 10, 7);
  g.fillStyle = '#c9c9d4'; g.fillRect(6, 28, 52, 5);
  g.fillStyle = '#1c1c22'; g.fillRect(8, 32, 12, 8); g.fillRect(44, 32, 12, 8);
  return tex(c);
}

export function sedanRearTexture(color) {
  const c = canvas(64, 40);
  const g = c.getContext('2d');
  g.fillStyle = color; g.fillRect(6, 14, 52, 18);
  g.fillRect(12, 4, 40, 14);
  g.fillStyle = '#26262e'; g.fillRect(16, 6, 32, 10);
  g.fillStyle = '#e83030'; g.fillRect(8, 18, 12, 6); g.fillRect(44, 18, 12, 6);
  g.fillStyle = '#c9c9d4'; g.fillRect(6, 28, 52, 5);
  g.fillStyle = '#1c1c22'; g.fillRect(8, 32, 12, 8); g.fillRect(44, 32, 12, 8);
  return tex(c);
}

export function rivalRearTexture(color) {
  // A generic 90s hot rod seen from behind, helmeted driver visible.
  const c = canvas(72, 52);
  const g = c.getContext('2d');
  // Body.
  g.fillStyle = color;
  g.fillRect(6, 22, 60, 20);
  g.fillRect(12, 14, 48, 12);
  // Spoiler.
  g.fillStyle = '#22222a'; g.fillRect(8, 8, 56, 5); g.fillRect(12, 12, 6, 6); g.fillRect(54, 12, 6, 6);
  // Driver helmet.
  g.fillStyle = '#f4f4f4'; g.fillRect(30, 6, 12, 11);
  g.fillStyle = '#c8262d'; g.fillRect(30, 6, 12, 4);
  // Tail lights + bumper.
  g.fillStyle = '#e83030'; g.fillRect(9, 26, 12, 6); g.fillRect(51, 26, 12, 6);
  g.fillStyle = '#c9c9d4'; g.fillRect(6, 36, 60, 5);
  // Fat rear tires.
  g.fillStyle = '#1c1c22'; g.fillRect(2, 32, 12, 18); g.fillRect(58, 32, 12, 18);
  g.fillStyle = '#3a3a44'; g.fillRect(5, 38, 6, 6); g.fillRect(61, 38, 6, 6);
  // Exhaust flames hint.
  g.fillStyle = '#ffb635'; g.fillRect(22, 42, 6, 4); g.fillRect(44, 42, 6, 4);
  return tex(c);
}

// ---- named racer cars (straight-on gameplay sprites) ----
//
// The photographed/select-screen art is intentionally a dramatic 3/4 view.
// It does not work as the neutral frame of a billboard racer: even when the
// quad is aligned perfectly with the camera, the car appears to crab across
// the road.  These small, centered canvas sprites are the straight front/rear
// frames used by gameplay.  The silhouettes stay symmetrical while the
// drivers, paint, lamps and trim keep each ride recognizable at cabinet scale.

const NAMED_CARS = new Set(['andy', 'adam', 'lance', 'elon']);

function carPoly(g, points, fill, stroke = '#16161c', lineWidth = 2) {
  g.beginPath();
  points.forEach(([x, y], i) => { if (i) g.lineTo(x, y); else g.moveTo(x, y); });
  g.closePath();
  g.fillStyle = fill;
  g.fill();
  if (stroke) {
    g.strokeStyle = stroke;
    g.lineWidth = lineWidth;
    g.stroke();
  }
}

function carLine(g, points, color, lineWidth = 2) {
  g.beginPath();
  points.forEach(([x, y], i) => { if (i) g.lineTo(x, y); else g.moveTo(x, y); });
  g.strokeStyle = color;
  g.lineWidth = lineWidth;
  g.stroke();
}

function carWheel(g, x, y, w = 18, h = 27) {
  g.fillStyle = '#111116';
  g.fillRect(x, y, w, h);
  g.fillStyle = '#2c2c34';
  g.fillRect(x + 3, y + 3, w - 6, h - 6);
  g.fillStyle = '#777784';
  g.fillRect(x + 5, y + 7, w - 10, h - 14);
  g.fillStyle = '#c9c9d0';
  g.fillRect(x + 7, y + 10, w - 14, h - 20);
}

function driverColors(id) {
  if (id === 'andy') return { skin: '#c98255', skinShade: '#8d4f35', hair: '#d8d8dc', hairShade: '#5c5c64', shirt: '#34343d' };
  if (id === 'adam') return { skin: '#cb895f', skinShade: '#8f553b', hair: '#17171c', hairShade: '#32323a', shirt: '#20252c' };
  if (id === 'lance') return { skin: '#d59a72', skinShade: '#925e45', hair: '#f1f1e8', hairShade: '#bdbdb8', shirt: '#b52d27' };
  return { skin: '#d99569', skinShade: '#965b42', hair: '#2b2024', hairShade: '#5a3943', shirt: '#11131a' };
}

function drawDriver(g, id, cx, baseY, front) {
  const d = driverColors(id);
  // Shoulders and neck.
  carPoly(g, [[cx - 13, baseY], [cx - 9, baseY - 10], [cx + 9, baseY - 10], [cx + 13, baseY]], d.shirt, '#17171c', 1);
  g.fillStyle = d.skinShade;
  g.fillRect(cx - 4, baseY - 16, 8, 8);
  // Pixel-cut face and ears.
  g.fillStyle = d.skinShade;
  g.fillRect(cx - 9, baseY - 29, 18, 16);
  g.fillStyle = d.skin;
  g.fillRect(cx - 7, baseY - 31, 14, 18);
  g.fillRect(cx - 9, baseY - 26, 2, 7);
  g.fillRect(cx + 7, baseY - 26, 2, 7);

  if (id === 'lance') {
    // Bald crown, white side hair and moustache.
    g.fillStyle = d.skin;
    g.fillRect(cx - 6, baseY - 33, 12, 5);
    g.fillStyle = d.hair;
    g.fillRect(cx - 9, baseY - 30, 3, 10);
    g.fillRect(cx + 6, baseY - 30, 3, 10);
    if (front) {
      g.fillRect(cx - 6, baseY - 19, 12, 3);
      g.fillStyle = d.hairShade;
      g.fillRect(cx - 2, baseY - 18, 4, 2);
    }
  } else if (id === 'elon') {
    // Exaggerated high/spiky hair remains readable above the roadster.
    g.fillStyle = d.hair;
    carPoly(g, [
      [cx - 10, baseY - 29], [cx - 13, baseY - 37], [cx - 8, baseY - 35],
      [cx - 7, baseY - 41], [cx - 2, baseY - 36], [cx + 2, baseY - 43],
      [cx + 5, baseY - 36], [cx + 11, baseY - 40], [cx + 9, baseY - 29],
    ], d.hair, null);
    g.fillStyle = d.hairShade;
    g.fillRect(cx - 7, baseY - 34, 13, 3);
  } else {
    g.fillStyle = d.hair;
    carPoly(g, [
      [cx - 8, baseY - 27], [cx - 8, baseY - 34], [cx - 3, baseY - 37],
      [cx + 6, baseY - 35], [cx + 8, baseY - 28],
    ], d.hair, null);
    g.fillStyle = d.hairShade;
    g.fillRect(cx - 7, baseY - 33, 5, 3);
    if (id === 'andy') g.fillRect(cx + 4, baseY - 34, 4, 7);
  }

  if (front) {
    // Eyes, nose and a one-pixel cabinet grin.
    g.fillStyle = '#202027';
    g.fillRect(cx - 5, baseY - 25, 2, 2);
    g.fillRect(cx + 3, baseY - 25, 2, 2);
    g.fillStyle = d.skinShade;
    g.fillRect(cx, baseY - 23, 2, 4);
    g.fillStyle = id === 'elon' ? '#f4f4ee' : '#542f2b';
    g.fillRect(cx - 4, baseY - 17, 8, id === 'elon' ? 2 : 1);
  }
}

function drawRearConvertible(g, id) {
  const andy = id === 'andy';
  const adam = id === 'adam';
  const silver = id === 'elon';
  const body = andy ? '#d51f2a' : adam ? '#efefee' : '#c9cdd2';
  const bodyLight = andy ? '#ff4a4a' : adam ? '#ffffff' : '#eef1f4';
  const bodyShade = andy ? '#8d1018' : adam ? '#aeb2b6' : '#777d86';
  const trim = silver ? '#363941' : '#24242b';

  // Wide rear tires sit behind a genuinely centered body silhouette.
  carWheel(g, 10, 72, silver ? 21 : 19, silver ? 30 : 28);
  carWheel(g, silver ? 129 : 131, 72, silver ? 21 : 19, silver ? 30 : 28);

  // Open cabin, seat backs and straight rear deck.
  carPoly(g, [[31, 49], [39, 32], [121, 32], [129, 49]], trim, '#111116', 2);
  g.fillStyle = '#16171d';
  g.fillRect(39, 40, 33, 18);
  g.fillRect(88, 40, 33, 18);
  g.fillStyle = '#565a63';
  g.fillRect(43, 43, 25, 5);
  g.fillRect(92, 43, 25, 5);
  drawDriver(g, id, silver ? 94 : 61, 51, false);

  // Trapezoidal body, fenders and layered deck shading.
  carPoly(g, [[21, 52], [139, 52], [151, 72], [147, 95], [13, 95], [9, 72]], body, '#17171c', 3);
  carPoly(g, [[28, 52], [132, 52], [139, 63], [21, 63]], bodyLight, null);
  g.fillStyle = bodyShade;
  g.fillRect(16, 83, 128, 12);
  g.fillStyle = trim;
  g.fillRect(30, 59, 100, 5);

  if (andy) {
    // Fox-body style three-segment rectangular lamps and dark center panel.
    g.fillStyle = '#2a1619';
    g.fillRect(19, 66, 122, 17);
    [23, 33, 43, 107, 117, 127].forEach((x) => {
      g.fillStyle = '#ed3034'; g.fillRect(x, 68, 8, 11);
      g.fillStyle = '#ff7770'; g.fillRect(x + 1, 69, 6, 3);
    });
    g.fillStyle = '#b8bcc2';
    g.fillRect(65, 69, 30, 10);
    g.fillStyle = '#24242b';
    g.fillRect(69, 72, 22, 5);
    g.fillStyle = '#d9d9dc';
    g.fillRect(15, 91, 130, 5);
    g.fillStyle = '#25252b';
    g.fillRect(30, 97, 13, 4); g.fillRect(117, 97, 13, 4);
  } else if (adam) {
    // Clean EV rear: full-width light blade, glass-black center, no exhaust.
    g.fillStyle = '#303139';
    g.fillRect(23, 66, 114, 15);
    g.fillStyle = '#e92734';
    g.fillRect(25, 67, 110, 5);
    g.fillStyle = '#ff6b72';
    g.fillRect(31, 67, 98, 2);
    g.fillStyle = '#d8d9dc';
    g.fillRect(65, 73, 30, 8);
    g.fillStyle = '#22242a';
    g.fillRect(69, 75, 22, 4);
    g.fillStyle = '#8f949b';
    g.fillRect(18, 91, 124, 4);
    g.fillStyle = '#353840';
    g.fillRect(50, 96, 60, 4);
  } else {
    // Low silver roadster: four round lamps and mesh diffuser.
    g.fillStyle = '#3d4149';
    g.fillRect(18, 68, 124, 18);
    [30, 48, 112, 130].forEach((x, i) => {
      g.fillStyle = '#74151b';
      g.beginPath(); g.arc(x, 76, i === 1 || i === 2 ? 7 : 6, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#ff4548';
      g.beginPath(); g.arc(x - 1, 74, 3, 0, Math.PI * 2); g.fill();
    });
    g.fillStyle = '#dfe2e7';
    g.fillRect(66, 69, 28, 10);
    g.fillStyle = '#1b1d22';
    g.fillRect(70, 72, 20, 5);
    g.fillStyle = '#202229';
    for (let x = 45; x <= 110; x += 8) g.fillRect(x, 89, 4, 7);
    g.fillStyle = '#e2e5e8';
    g.fillRect(20, 88, 120, 3);
    g.fillStyle = '#444851';
    g.fillRect(25, 94, 22, 4); g.fillRect(113, 94, 22, 4);
  }

  // Center highlight makes the symmetry obvious even during scaling.
  g.fillStyle = bodyLight;
  g.fillRect(79, 54, 2, 8);
}

function drawFrontConvertible(g, id) {
  const andy = id === 'andy';
  const adam = id === 'adam';
  const silver = id === 'elon';
  const body = andy ? '#d51f2a' : adam ? '#efefee' : '#c9cdd2';
  const bodyLight = andy ? '#ff4a4a' : adam ? '#ffffff' : '#eef1f4';
  const bodyShade = andy ? '#8d1018' : adam ? '#aeb2b6' : '#777d86';

  carWheel(g, 9, 71, silver ? 22 : 19, silver ? 31 : 28);
  carWheel(g, silver ? 129 : 132, 71, silver ? 22 : 19, silver ? 31 : 28);

  // Straight windshield and driver; both A-pillars have identical geometry.
  carPoly(g, [[31, 56], [41, 27], [119, 27], [129, 56]], '#252a34', '#15161b', 3);
  carPoly(g, [[39, 52], [47, 32], [113, 32], [121, 52]], '#78a5bd', null);
  g.fillStyle = 'rgba(210,240,255,0.55)';
  g.fillRect(50, 34, 4, 15);
  g.fillRect(105, 34, 3, 15);
  drawDriver(g, id, silver ? 94 : 61, 53, true);
  // Windshield center/seat separation stays vertical, never a fake 3/4 seam.
  g.fillStyle = '#252830';
  g.fillRect(79, 31, 2, 22);

  carPoly(g, [[20, 54], [140, 54], [152, 77], [145, 96], [15, 96], [8, 77]], body, '#17171c', 3);
  carPoly(g, [[30, 55], [130, 55], [139, 72], [21, 72]], bodyLight, null);
  carLine(g, [[80, 56], [80, 82]], bodyShade, 2);
  carLine(g, [[32, 59], [20, 72]], bodyShade, 2);
  carLine(g, [[128, 59], [140, 72]], bodyShade, 2);

  if (andy) {
    // Rectangular 90s lamps and a deep black grille.
    g.fillStyle = '#d8e7ec';
    g.fillRect(18, 69, 35, 13); g.fillRect(107, 69, 35, 13);
    g.fillStyle = '#fff5b4';
    g.fillRect(22, 72, 26, 6); g.fillRect(112, 72, 26, 6);
    g.fillStyle = '#202127';
    g.fillRect(57, 70, 46, 18);
    for (let x = 60; x < 101; x += 8) g.fillRect(x, 90, 5, 2);
    g.fillStyle = '#aeb2b8';
    g.fillRect(13, 91, 134, 5);
    g.fillStyle = '#f4f4f2';
    g.fillRect(78, 74, 4, 4);
  } else if (adam) {
    // Slim modern lamps and broad lower intake; deliberately badge-free.
    carPoly(g, [[18, 69], [55, 66], [52, 77], [21, 80]], '#d7eef4', '#555b63', 1);
    carPoly(g, [[105, 66], [142, 69], [139, 80], [108, 77]], '#d7eef4', '#555b63', 1);
    g.fillStyle = '#fff6ae';
    g.fillRect(24, 72, 24, 3); g.fillRect(112, 72, 24, 3);
    carPoly(g, [[45, 82], [115, 82], [106, 94], [54, 94]], '#23262c', null);
    g.fillStyle = '#8d9298';
    g.fillRect(17, 92, 126, 4);
  } else {
    // Low roadster snout with four round lamps and corner brake ducts.
    [31, 48, 112, 129].forEach((x, i) => {
      g.fillStyle = '#252932';
      g.beginPath(); g.arc(x, 73, i === 1 || i === 2 ? 8 : 7, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#e8f5ff';
      g.beginPath(); g.arc(x - 1, 71, 4, 0, Math.PI * 2); g.fill();
    });
    carPoly(g, [[52, 84], [108, 84], [101, 95], [59, 95]], '#20232a', null);
    g.fillStyle = '#30343c';
    g.fillRect(17, 84, 19, 9); g.fillRect(124, 84, 19, 9);
    g.fillStyle = '#eef1f3';
    g.fillRect(22, 81, 116, 3);
  }
}

function drawRearVan(g) {
  const body = '#8b4d28';
  const bodyLight = '#b56b35';
  const bodyShade = '#61341f';
  carWheel(g, 18, 75, 19, 29);
  carWheel(g, 123, 75, 19, 29);
  // A tall, square silhouette immediately distinguishes Lance from the cars.
  carPoly(g, [[25, 17], [135, 17], [143, 92], [137, 100], [23, 100], [17, 92]], body, '#17171c', 3);
  g.fillStyle = bodyLight;
  g.fillRect(28, 21, 104, 5);
  g.fillStyle = '#20242b';
  g.fillRect(31, 29, 45, 29); g.fillRect(84, 29, 45, 29);
  g.fillStyle = '#4b6470';
  g.fillRect(35, 33, 37, 20); g.fillRect(88, 33, 37, 20);
  g.fillStyle = '#94bdca';
  g.fillRect(38, 35, 4, 14); g.fillRect(91, 35, 4, 14);
  // Split doors, hinges and a small rear-window glimpse of the driver.
  g.fillStyle = bodyShade;
  g.fillRect(78, 25, 4, 67);
  g.fillStyle = '#d0d0cb';
  [32, 52, 76].forEach((y) => { g.fillRect(76, y, 3, 6); g.fillRect(82, y, 3, 6); });
  drawDriver(g, 'lance', 105, 57, false);

  // Hand-painted sunset and cactus mural across both rear doors.
  g.fillStyle = '#e77f32';
  g.fillRect(29, 62, 102, 23);
  g.fillStyle = '#f4bd3d';
  g.beginPath(); g.arc(80, 73, 10, Math.PI, 0); g.fill();
  g.fillStyle = '#713223';
  carPoly(g, [[29, 83], [45, 76], [61, 82], [78, 74], [96, 82], [113, 76], [131, 83], [131, 87], [29, 87]], '#713223', null);
  g.fillStyle = '#315d35';
  g.fillRect(43, 67, 4, 17); g.fillRect(39, 72, 4, 7); g.fillRect(47, 70, 4, 8);
  g.fillRect(115, 68, 4, 16); g.fillRect(111, 74, 4, 6);
  // Vertical lamps and chrome step bumper.
  g.fillStyle = '#70181a';
  g.fillRect(21, 62, 8, 24); g.fillRect(131, 62, 8, 24);
  g.fillStyle = '#f04a3f';
  g.fillRect(23, 64, 4, 8); g.fillRect(133, 64, 4, 8);
  g.fillStyle = '#ffbf58';
  g.fillRect(23, 75, 4, 5); g.fillRect(133, 75, 4, 5);
  g.fillStyle = '#c8cbd0';
  g.fillRect(17, 91, 126, 8);
  g.fillStyle = '#656972';
  g.fillRect(27, 95, 106, 3);
}

function drawFrontVan(g) {
  const body = '#8b4d28';
  const light = '#b56b35';
  carWheel(g, 17, 75, 20, 29);
  carWheel(g, 123, 75, 20, 29);
  carPoly(g, [[25, 17], [135, 17], [143, 91], [136, 100], [24, 100], [17, 91]], body, '#17171c', 3);
  g.fillStyle = light;
  g.fillRect(29, 21, 102, 5);
  // Two-piece upright windshield with Lance centered in the driver pane.
  carPoly(g, [[31, 29], [77, 27], [77, 59], [29, 59]], '#557583', '#1d2025', 2);
  carPoly(g, [[83, 27], [129, 29], [131, 59], [83, 59]], '#557583', '#1d2025', 2);
  g.fillStyle = '#a5d1dc';
  g.fillRect(35, 33, 4, 20); g.fillRect(87, 31, 4, 21);
  drawDriver(g, 'lance', 105, 58, true);
  // Wipers, grille bars, rectangular headlamps and chrome bumper.
  carLine(g, [[35, 55], [62, 45]], '#22242a', 2);
  carLine(g, [[125, 55], [98, 45]], '#22242a', 2);
  g.fillStyle = '#2a2b30';
  g.fillRect(45, 68, 70, 21);
  g.fillStyle = '#a9adb4';
  for (let x = 50; x <= 106; x += 9) g.fillRect(x, 70, 4, 16);
  g.fillStyle = '#e8f2e7';
  g.fillRect(21, 67, 23, 14); g.fillRect(116, 67, 23, 14);
  g.fillStyle = '#fff0a0';
  g.fillRect(25, 70, 15, 7); g.fillRect(120, 70, 15, 7);
  // Tiny sunset stripe ties the direct front to the mural van without text.
  g.fillStyle = '#e77f32';
  g.fillRect(44, 61, 72, 5);
  g.fillStyle = '#f4bd3d';
  g.fillRect(77, 61, 6, 5);
  g.fillStyle = '#c8cbd0';
  g.fillRect(16, 91, 128, 8);
  g.fillStyle = '#5a5e66';
  g.fillRect(28, 95, 104, 3);
}

/**
 * Return a centered, straight-on gameplay texture for a named racer.
 * Unknown racer IDs return null so callers can fall back to the generic car.
 * @param {string} racerId andy | adam | lance | elon
 * @param {'rear'|'front'} view
 * @returns {THREE.CanvasTexture|null}
 */
export function namedCarTexture(racerId, view = 'rear') {
  const id = String(racerId || '').toLowerCase();
  if (!NAMED_CARS.has(id)) return null;
  const c = canvas(160, 112);
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  const front = view === 'front';
  if (id === 'lance') {
    if (front) drawFrontVan(g); else drawRearVan(g);
  } else if (front) {
    drawFrontConvertible(g, id);
  } else {
    drawRearConvertible(g, id);
  }
  return tex(c);
}

export function namedCarRearTexture(racerId) {
  return namedCarTexture(racerId, 'rear');
}

export function namedCarFrontTexture(racerId) {
  return namedCarTexture(racerId, 'front');
}

// ---- animals ----

export function cowTexture() {
  const c = canvas(56, 40);
  const g = c.getContext('2d');
  g.fillStyle = '#f4f4f4';
  g.fillRect(10, 10, 34, 18);
  g.fillStyle = '#22222a';
  g.fillRect(14, 12, 8, 8); g.fillRect(30, 16, 9, 9);
  // Head.
  g.fillStyle = '#f4f4f4'; g.fillRect(40, 6, 12, 12);
  g.fillStyle = '#e8a3b8'; g.fillRect(44, 12, 8, 6);
  g.fillStyle = '#22222a'; g.fillRect(43, 8, 3, 3);
  // Horns + ears.
  g.fillStyle = '#d9cbae'; g.fillRect(40, 2, 4, 5); g.fillRect(48, 2, 4, 5);
  // Legs.
  g.fillStyle = '#f4f4f4';
  g.fillRect(12, 28, 5, 10); g.fillRect(22, 28, 5, 10); g.fillRect(32, 28, 5, 10); g.fillRect(40, 26, 5, 12);
  g.fillStyle = '#22222a';
  g.fillRect(12, 35, 5, 3); g.fillRect(40, 35, 5, 3);
  return tex(c);
}

export function donkeyTexture() {
  const c = canvas(52, 40);
  const g = c.getContext('2d');
  g.fillStyle = '#8a8a96';
  g.fillRect(8, 12, 30, 14);
  g.fillRect(34, 4, 10, 14);
  // Ears.
  g.fillRect(34, -2 + 4, 3, 8); g.fillRect(41, 2, 3, 8);
  // Mane + tail.
  g.fillStyle = '#5c5c66'; g.fillRect(32, 4, 4, 12); g.fillRect(6, 12, 4, 10);
  // Legs.
  g.fillStyle = '#8a8a96';
  g.fillRect(10, 26, 4, 12); g.fillRect(18, 26, 4, 12); g.fillRect(28, 26, 4, 12); g.fillRect(34, 24, 4, 14);
  g.fillStyle = '#22222a'; g.fillRect(37, 8, 2, 2);
  // Blanket.
  g.fillStyle = '#c8262d'; g.fillRect(16, 12, 12, 8);
  g.fillStyle = '#ffd23d'; g.fillRect(16, 18, 12, 2);
  return tex(c);
}

export function seagullTexture() {
  const c = canvas(40, 24);
  const g = c.getContext('2d');
  g.fillStyle = '#f4f4f4';
  g.fillRect(14, 10, 14, 8);
  // Wings up.
  g.fillRect(6, 4, 10, 6); g.fillRect(26, 4, 10, 6);
  g.fillStyle = '#9a9aa8'; g.fillRect(6, 4, 10, 3); g.fillRect(26, 4, 10, 3);
  g.fillStyle = '#ffb635'; g.fillRect(28, 12, 6, 3);
  g.fillStyle = '#22222a'; g.fillRect(25, 11, 2, 2);
  return tex(c);
}

export function pigTexture() {
  const c = canvas(44, 32);
  const g = c.getContext('2d');
  g.fillStyle = '#f0a8b8';
  g.fillRect(8, 10, 24, 12);
  g.fillRect(28, 6, 10, 10);
  g.fillStyle = '#e88ca4'; g.fillRect(34, 10, 5, 5);
  g.fillStyle = '#22222a'; g.fillRect(31, 8, 2, 2);
  g.fillStyle = '#f0a8b8';
  g.fillRect(10, 22, 4, 8); g.fillRect(18, 22, 4, 8); g.fillRect(26, 22, 4, 8);
  // Curly tail.
  g.fillStyle = '#e88ca4'; g.fillRect(5, 10, 3, 3); g.fillRect(3, 13, 3, 3);
  return tex(c);
}

export function armadilloTexture() {
  const c = canvas(36, 24);
  const g = c.getContext('2d');
  g.fillStyle = '#b5926a';
  g.fillRect(6, 8, 20, 10);
  g.fillStyle = '#8f7350';
  g.fillRect(8, 8, 3, 10); g.fillRect(14, 8, 3, 10); g.fillRect(20, 8, 3, 10);
  g.fillStyle = '#b5926a'; g.fillRect(24, 10, 8, 6);
  g.fillStyle = '#22222a'; g.fillRect(29, 11, 2, 2);
  g.fillStyle = '#8f7350'; g.fillRect(8, 18, 3, 4); g.fillRect(20, 18, 3, 4);
  return tex(c);
}

export function chickenTexture() {
  const c = canvas(28, 28);
  const g = c.getContext('2d');
  g.fillStyle = '#f4f4f4';
  g.fillRect(8, 10, 12, 10);
  g.fillRect(16, 4, 8, 9);
  g.fillStyle = '#c8262d'; g.fillRect(18, 2, 4, 3);
  g.fillStyle = '#ffb635'; g.fillRect(23, 8, 4, 2);
  g.fillStyle = '#22222a'; g.fillRect(19, 6, 2, 2);
  g.fillStyle = '#ffb635'; g.fillRect(11, 20, 2, 6); g.fillRect(16, 20, 2, 6);
  return tex(c);
}

// ---- landmarks ----

export function volcanoTexture() {
  const c = canvas(256, 128);
  const g = c.getContext('2d');
  // Mountain silhouette.
  g.fillStyle = '#3d5c46';
  g.beginPath();
  g.moveTo(0, 128); g.lineTo(70, 60); g.lineTo(105, 26); g.lineTo(150, 26);
  g.lineTo(190, 62); g.lineTo(256, 128);
  g.closePath(); g.fill();
  g.fillStyle = '#2f4938';
  g.beginPath();
  g.moveTo(40, 128); g.lineTo(105, 40); g.lineTo(120, 40); g.lineTo(70, 128);
  g.closePath(); g.fill();
  // Crater glow + smoke.
  g.fillStyle = '#ff6a2c'; g.fillRect(108, 22, 40, 8);
  g.fillStyle = '#ffd23d'; g.fillRect(116, 24, 24, 4);
  g.fillStyle = 'rgba(200,200,210,0.9)';
  g.fillRect(112, 8, 30, 10); g.fillRect(122, 0, 34, 10); g.fillRect(140, -2 + 4, 26, 8);
  // Lava streak.
  g.fillStyle = '#ff6a2c'; g.fillRect(126, 30, 6, 34); g.fillRect(120, 60, 6, 26);
  return tex(c);
}

export function cruiseShipTexture() {
  const c = canvas(192, 64);
  const g = c.getContext('2d');
  // Hull.
  g.fillStyle = '#1d3557'; g.fillRect(10, 44, 172, 14);
  g.fillStyle = '#f4f4f4';
  g.fillRect(20, 30, 152, 16); g.fillRect(36, 18, 120, 14); g.fillRect(52, 8, 88, 12);
  // Windows.
  g.fillStyle = '#8ed4ff';
  for (let x = 26; x < 168; x += 10) g.fillRect(x, 34, 5, 5);
  for (let x = 42; x < 150; x += 10) g.fillRect(x, 22, 5, 5);
  // Funnels.
  g.fillStyle = '#c8262d'; g.fillRect(66, 0, 12, 10); g.fillRect(96, 0, 12, 10);
  g.fillStyle = '#22222a'; g.fillRect(66, 0, 12, 3); g.fillRect(96, 0, 12, 3);
  return tex(c);
}

export function mesaBigTexture() {
  const c = canvas(256, 96);
  const g = c.getContext('2d');
  g.fillStyle = '#b0552f';
  g.fillRect(60, 0, 136, 12);
  g.fillRect(44, 12, 168, 14);
  g.fillRect(28, 26, 200, 70);
  g.fillStyle = '#8f4224';
  g.fillRect(28, 60, 200, 10);
  g.fillRect(50, 34, 20, 62); g.fillRect(180, 40, 24, 56);
  g.fillStyle = '#c96a3e';
  g.fillRect(60, 0, 136, 4); g.fillRect(44, 12, 168, 4);
  return tex(c);
}

export function dinerSignTexture() {
  const c = canvas(64, 96);
  const g = c.getContext('2d');
  g.fillStyle = '#9a9aa8'; g.fillRect(28, 40, 8, 56);
  g.fillStyle = '#c8262d';
  g.beginPath(); g.arc(32, 24, 22, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#ffd23d';
  g.beginPath(); g.arc(32, 24, 17, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#c8262d';
  g.font = 'bold 10px "Arial Black", sans-serif';
  g.textAlign = 'center';
  g.fillText('EAT', 32, 21);
  g.fillText('BEANS', 32, 32);
  return tex(c);
}

export function townGateTexture() {
  // Arch with a transparent middle you drive through.
  const c = canvas(176, 88);
  const g = c.getContext('2d');
  g.fillStyle = '#d8a86f';
  g.fillRect(0, 0, 40, 88); g.fillRect(136, 0, 40, 88);
  g.fillRect(0, 0, 176, 26);
  g.fillStyle = '#b5482a';
  g.fillRect(0, 0, 176, 8);
  for (let x = 0; x < 176; x += 12) g.fillRect(x, 0, 6, 12);
  g.fillStyle = '#ffffff';
  g.font = 'bold 15px "Arial Black", sans-serif';
  g.textAlign = 'center';
  g.fillText('TEQUILA TOWN', 88, 21);
  g.fillStyle = '#2e7ec4'; g.fillRect(8, 34, 24, 24); g.fillRect(144, 34, 24, 24);
  g.fillStyle = '#ffd23d'; g.fillRect(8, 44, 24, 4); g.fillRect(144, 44, 24, 4);
  return tex(c);
}

export function alohaGateTexture() {
  // Road-spanning postcard set piece with a transparent drive-through center.
  const c = canvas(192, 92);
  const g = c.getContext('2d');
  // Carved tiki pillars.
  g.fillStyle = '#7a4a24';
  g.fillRect(0, 10, 38, 82); g.fillRect(154, 10, 38, 82);
  g.fillStyle = '#9c6733';
  for (let y = 18; y < 84; y += 18) {
    g.fillRect(5, y, 28, 7); g.fillRect(159, y, 28, 7);
  }
  g.fillStyle = '#24150d';
  g.fillRect(9, 32, 7, 8); g.fillRect(23, 32, 7, 8);
  g.fillRect(162, 32, 7, 8); g.fillRect(176, 32, 7, 8);
  // Hibiscus banner.
  g.fillStyle = '#e94f9c'; g.fillRect(0, 0, 192, 27);
  g.fillStyle = '#ffca38';
  for (let x = 7; x < 192; x += 24) g.fillRect(x, 4, 10, 10);
  g.fillStyle = '#ffffff';
  g.textAlign = 'center'; g.font = 'bold 18px "Arial Black", sans-serif';
  g.fillText('ALOHA COAST', 96, 22);
  return tex(c);
}

export function route66GateTexture() {
  // A deliberately oversized roadside-tourist gateway. The opening remains
  // transparent so the player drives through the landmark, not past it.
  const c = canvas(192, 92);
  const g = c.getContext('2d');
  g.fillStyle = '#8f4224';
  g.fillRect(0, 18, 34, 74); g.fillRect(158, 18, 34, 74);
  g.fillStyle = '#c96a3e';
  g.fillRect(4, 26, 26, 8); g.fillRect(162, 26, 26, 8);
  g.fillRect(4, 50, 26, 8); g.fillRect(162, 50, 26, 8);
  // Sun-faded highway header.
  g.fillStyle = '#f4f0de'; g.fillRect(0, 0, 192, 27);
  g.fillStyle = '#1f1f26';
  g.textAlign = 'center'; g.font = 'bold 14px "Arial Black", sans-serif';
  g.fillText('DESERT HIGHWAY', 96, 19);
  // Shield signs on each pillar.
  g.fillStyle = '#f4f0de';
  g.fillRect(7, 60, 20, 21); g.fillRect(165, 60, 20, 21);
  g.fillStyle = '#1f1f26'; g.font = 'bold 9px "Arial Black", sans-serif';
  g.fillText('66', 17, 75); g.fillText('66', 175, 75);
  return tex(c);
}

export function churchTexture() {
  const c = canvas(128, 128);
  const g = c.getContext('2d');
  g.fillStyle = '#efe0c4';
  g.fillRect(14, 60, 100, 68);
  g.fillRect(44, 16, 40, 50);
  // Bell tower top.
  g.fillStyle = '#b5482a';
  g.beginPath(); g.moveTo(38, 18); g.lineTo(64, 0); g.lineTo(90, 18); g.closePath(); g.fill();
  g.fillStyle = '#5f3517'; g.fillRect(56, 26, 16, 20);
  g.fillStyle = '#ffd23d'; g.fillRect(60, 30, 8, 10);
  // Door + windows.
  g.fillStyle = '#5f3517'; g.fillRect(52, 88, 24, 40);
  g.fillStyle = '#2e7ec4'; g.fillRect(24, 76, 14, 20); g.fillRect(90, 76, 14, 20);
  // Cross.
  g.fillStyle = '#ffd23d'; g.fillRect(62, 2, 4, 12); g.fillRect(58, 6, 12, 3);
  return tex(c);
}

export function fountainTexture() {
  const c = canvas(64, 48);
  const g = c.getContext('2d');
  g.fillStyle = '#c9c9d4'; g.fillRect(6, 34, 52, 12);
  g.fillStyle = '#2e7ec4'; g.fillRect(10, 36, 44, 6);
  g.fillStyle = '#c9c9d4'; g.fillRect(26, 18, 12, 18);
  g.fillStyle = '#8ed4ff';
  g.fillRect(30, 4, 4, 16);
  g.fillRect(22, 10, 4, 10); g.fillRect(38, 10, 4, 10);
  return tex(c);
}

export function cantinaNeonTexture() {
  const c = canvas(128, 96);
  const g = c.getContext('2d');
  g.fillStyle = '#12203a'; g.fillRect(0, 0, 128, 70);
  g.strokeStyle = '#ff64d2'; g.lineWidth = 3;
  g.strokeRect(6, 6, 116, 58);
  g.fillStyle = '#4fe0c0';
  g.font = 'bold 18px "Arial Black", sans-serif';
  g.textAlign = 'center';
  g.fillText('TIO', 64, 28);
  g.fillStyle = '#ff64d2';
  g.fillText('FRIJOLES', 64, 50);
  // Neon cactus.
  g.strokeStyle = '#9dff7a'; g.lineWidth = 2;
  g.strokeRect(14, 20, 8, 34); g.strokeRect(8, 28, 8, 12);
  // Posts.
  g.fillStyle = '#3a3a3a'; g.fillRect(20, 70, 8, 26); g.fillRect(100, 70, 8, 26);
  return tex(c);
}

export function lavarockTexture() {
  const c = canvas(56, 36);
  const g = c.getContext('2d');
  g.fillStyle = '#2c2c34';
  g.beginPath();
  g.moveTo(2, 36); g.lineTo(10, 12); g.lineTo(26, 4); g.lineTo(42, 12); g.lineTo(54, 36);
  g.closePath(); g.fill();
  g.fillStyle = '#ff6a2c'; g.fillRect(16, 18, 8, 3); g.fillRect(32, 24, 10, 3);
  g.fillStyle = '#4a4a54'; g.fillRect(12, 12, 12, 4); g.fillRect(30, 8, 10, 4);
  return tex(c);
}

export function surfShopTexture() {
  const c = canvas(96, 80);
  const g = c.getContext('2d');
  g.fillStyle = '#4fc2b8'; g.fillRect(0, 20, 96, 60);
  // Thatch roof.
  g.fillStyle = '#b58a3e'; g.fillRect(0, 8, 96, 16);
  g.fillStyle = '#96702c';
  for (let x = 0; x < 96; x += 8) g.fillRect(x, 16, 4, 8);
  g.fillStyle = '#5f3517'; g.fillRect(38, 48, 20, 32);
  // Surfboards.
  g.fillStyle = '#ff5aa2'; g.fillRect(10, 30, 10, 44);
  g.fillStyle = '#ffd23d'; g.fillRect(74, 30, 10, 44);
  g.fillStyle = '#ffffff';
  g.font = 'bold 11px "Arial Black", sans-serif';
  g.textAlign = 'center';
  g.fillText('SURF', 48, 34);
  g.fillText("'N SUDS", 48, 46);
  return tex(c);
}

export function oceanPlaneTexture() {
  // Neutral-white water so vertex colors can grade turquoise shallows into
  // deep Pacific blue; only wave caps and swell shading live in the texture.
  const c = canvas(256, 256);
  const g = c.getContext('2d');
  g.fillStyle = '#e8f4fb';
  g.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 6) {
    g.fillStyle = `rgba(150,190,220,${0.18 + 0.14 * Math.sin(y * 0.19)})`;
    g.fillRect(0, y + Math.sin(y * 0.4) * 2, 256, 3);
  }
  g.fillStyle = 'rgba(255,255,255,0.9)';
  for (let i = 0; i < 70; i++) {
    const w = 6 + (Math.random() * 16) | 0;
    g.fillRect((Math.random() * 256) | 0, (Math.random() * 256) | 0, w, 2);
  }
  return tex(c, 20, 20);
}

// ---- 3D traffic detail faces ----

export function truckFaceTexture(color = '#2a4fd6') {
  const c = canvas(128, 128);
  const g = c.getContext('2d');
  g.fillStyle = color; g.fillRect(0, 0, 128, 128);
  // Windshield.
  g.fillStyle = '#7fc6ee'; g.fillRect(12, 8, 104, 34);
  g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(18, 12, 26, 26);
  // Chrome grille and bumper.
  g.fillStyle = '#d8dde6'; g.fillRect(30, 54, 68, 44);
  g.fillStyle = '#1b1b22';
  for (let y = 58; y < 96; y += 6) g.fillRect(34, y, 60, 3);
  g.fillStyle = '#e6e9ef'; g.fillRect(4, 104, 120, 16);
  // Headlights and marker lamps.
  g.fillStyle = '#fff5b8'; g.fillRect(8, 70, 18, 14); g.fillRect(102, 70, 18, 14);
  g.fillStyle = '#ffa826';
  for (let x = 14; x < 120; x += 20) g.fillRect(x, 2, 6, 4);
  return tex(c);
}

export function trailerSideTexture() {
  const c = canvas(256, 96);
  const g = c.getContext('2d');
  g.fillStyle = '#e9e9ee'; g.fillRect(0, 0, 256, 96);
  g.fillStyle = '#c8c8d2';
  for (let x = 0; x < 256; x += 16) g.fillRect(x, 0, 2, 96);
  g.fillStyle = '#1f9e46'; g.fillRect(40, 18, 176, 56);
  g.fillStyle = '#ffd23d';
  g.font = 'bold 30px "Arial Black", sans-serif';
  g.textAlign = 'center';
  g.fillText('BIG SAL BEANS', 128, 48);
  g.fillStyle = '#ffffff';
  g.font = 'bold 14px "Arial Black", sans-serif';
  g.fillText('WE DELIVER GAS', 128, 68);
  return tex(c);
}

export function busSideTexture() {
  const c = canvas(256, 96);
  const g = c.getContext('2d');
  g.fillStyle = '#ffb635'; g.fillRect(0, 0, 256, 96);
  g.fillStyle = '#7fc6ee';
  for (let x = 8; x < 256; x += 30) g.fillRect(x, 14, 24, 30);
  g.fillStyle = '#c8262d'; g.fillRect(0, 52, 256, 10);
  g.fillStyle = '#ffffff';
  g.font = 'bold 16px "Arial Black", sans-serif';
  g.textAlign = 'center';
  g.fillText('ALOHA TOURS', 128, 82);
  return tex(c);
}

export function carSideTexture(color) {
  const c = canvas(128, 64);
  const g = c.getContext('2d');
  g.fillStyle = color; g.fillRect(0, 0, 128, 64);
  g.fillStyle = '#7fc6ee'; g.fillRect(28, 6, 34, 22); g.fillRect(68, 6, 34, 22);
  g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, 44, 128, 20);
  g.fillStyle = '#d8dde6'; g.fillRect(0, 38, 128, 3);
  return tex(c);
}

export function shimmerTexture() {
  const c = canvas(64, 32);
  const g = c.getContext('2d');
  for (let x = 0; x < 64; x += 4) {
    g.fillStyle = `rgba(255,255,255,${0.05 + 0.08 * Math.abs(Math.sin(x * 0.4))})`;
    g.fillRect(x, 8 + Math.sin(x * 0.6) * 6, 3, 14);
  }
  const t = tex(c);
  t.magFilter = THREE.LinearFilter;
  return t;
}
