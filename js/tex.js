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
