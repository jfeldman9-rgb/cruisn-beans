// Canvas-generated chunky 90s textures. Everything is drawn at low
// resolution and sampled with NearestFilter for that digitized arcade look.
import * as THREE from '../vendor/three.module.js';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

function tex(c, repeatX = 1, repeatY = 1) {
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
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
  const c = canvas(128, 128);
  const g = c.getContext('2d');
  g.fillStyle = base;
  g.fillRect(0, 0, 128, 128);
  const d = new THREE.Color(detail);
  const cols = [detail, '#' + d.clone().offsetHSL(0, 0, 0.05).getHexString(),
    '#' + d.clone().offsetHSL(0, 0, -0.05).getHexString()];
  noise(g, 128, 128, cols, 900);
  return tex(c, 40, 40);
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
  const c = canvas(64, 96);
  const g = c.getContext('2d');
  g.fillStyle = '#8a5a2b';
  // Curved trunk out of fat rects.
  for (let i = 0; i < 12; i++) {
    g.fillRect(28 + Math.sin(i * 0.28) * 6, 96 - (i + 1) * 6, 8, 7);
  }
  g.fillStyle = '#6f4620';
  for (let i = 0; i < 12; i += 3) {
    g.fillRect(28 + Math.sin(i * 0.28) * 6, 96 - (i + 1) * 6, 8, 2);
  }
  // Fronds.
  g.fillStyle = '#2fae3f';
  const cx = 34, cy = 22;
  for (let a = 0; a < 7; a++) {
    const ang = -Math.PI * 0.9 + a * (Math.PI * 0.8 / 6) - 0.2;
    for (let r = 2; r < 26; r += 3) {
      const droop = (r / 26) * (r / 26) * 10;
      g.fillRect(cx + Math.cos(ang) * r - 3, cy + Math.sin(ang) * r * 0.5 + droop - 3, 7, 5);
    }
  }
  g.fillStyle = '#25902f';
  for (let a = 0; a < 7; a += 2) {
    const ang = -Math.PI * 0.9 + a * (Math.PI * 0.8 / 6);
    for (let r = 8; r < 24; r += 5) {
      const droop = (r / 26) * (r / 26) * 10;
      g.fillRect(cx + Math.cos(ang) * r - 2, cy + Math.sin(ang) * r * 0.5 + droop - 1, 4, 3);
    }
  }
  // Coconuts.
  g.fillStyle = '#5d3d1c';
  g.fillRect(30, 24, 5, 5); g.fillRect(37, 26, 5, 5);
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
  const c = canvas(64, 40);
  const g = c.getContext('2d');
  g.fillStyle = '#9c6b4a';
  g.beginPath();
  g.moveTo(2, 40); g.lineTo(10, 14); g.lineTo(24, 4); g.lineTo(44, 10);
  g.lineTo(60, 24); g.lineTo(62, 40);
  g.closePath(); g.fill();
  g.fillStyle = '#b57f58';
  g.fillRect(14, 14, 18, 6); g.fillRect(34, 18, 16, 5);
  g.fillStyle = '#7c5238';
  g.fillRect(8, 30, 46, 4);
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
  const c = canvas(48, 48);
  const g = c.getContext('2d');
  g.fillStyle = '#1f7c2e';
  g.fillRect(8, 20, 32, 28);
  g.fillStyle = '#2fae3f';
  g.fillRect(4, 24, 40, 16);
  g.fillStyle = '#ff4f8b';
  g.fillRect(14, 8, 10, 10); g.fillRect(28, 14, 9, 9); g.fillRect(20, 26, 9, 9);
  g.fillStyle = '#ffd23d';
  g.fillRect(17, 11, 3, 3); g.fillRect(31, 17, 3, 3); g.fillRect(23, 29, 3, 3);
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
  const c = canvas(128, 128);
  const g = c.getContext('2d');
  g.fillStyle = '#1673c9';
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#3a97e8';
  for (let i = 0; i < 120; i++) g.fillRect((Math.random() * 128) | 0, (Math.random() * 128) | 0, 8, 2);
  g.fillStyle = '#8ed4ff';
  for (let i = 0; i < 40; i++) g.fillRect((Math.random() * 128) | 0, (Math.random() * 128) | 0, 5, 1);
  return tex(c, 20, 20);
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
