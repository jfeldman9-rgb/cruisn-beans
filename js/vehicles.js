// Low-poly 3D traffic in the spirit of 1996 cabinet models: boxes, cylinders,
// and a few painted faces. Vehicles are real geometry, so they occlude the
// road, show their flanks on bends, and their wheels turn. Local +z is the
// direction of travel; the group is anchored at the vehicle's center.
import * as THREE from '../vendor/three.module.js';
import * as tex from './tex.js?v=world-feel-2';

const shared = {};
function mat(key, make) {
  if (!shared[key]) shared[key] = make();
  return shared[key];
}

function carFaceTexture(color, rear) {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 32;
  const g = c.getContext('2d');
  g.fillStyle = color; g.fillRect(0, 0, 64, 32);
  g.fillStyle = rear ? '#e83030' : '#fff5b8';
  g.fillRect(5, 10, 14, 8); g.fillRect(45, 10, 14, 8);
  g.fillStyle = rear ? '#ffb635' : '#ffffff';
  g.fillRect(8, 12, 6, 4); g.fillRect(50, 12, 6, 4);
  g.fillStyle = '#d8dde6'; g.fillRect(0, 24, 64, 6);
  g.fillStyle = '#1b1b22'; g.fillRect(20, 12, 24, 8);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function windshieldTexture() {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 48;
  const g = c.getContext('2d');
  g.fillStyle = '#2b3440'; g.fillRect(0, 0, 64, 48);
  const glass = g.createLinearGradient(0, 4, 0, 44);
  glass.addColorStop(0, '#9ad7f4'); glass.addColorStop(0.5, '#4f8fb8'); glass.addColorStop(1, '#2c5f83');
  g.fillStyle = glass; g.fillRect(4, 6, 56, 36);
  g.fillStyle = 'rgba(255,255,255,0.45)'; g.fillRect(8, 9, 12, 30);
  g.fillStyle = '#d8dde6'; g.fillRect(0, 0, 64, 4);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function box(w, h, d, materials, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), materials);
  m.position.set(x, y, z);
  return m;
}

function hubTexture() {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#17171c'; g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#c9c9d4';
  g.beginPath(); g.arc(32, 32, 18, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#5a5a66';
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    g.beginPath(); g.arc(32 + Math.cos(a) * 10, 32 + Math.sin(a) * 10, 3.5, 0, Math.PI * 2); g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// One mesh per wheel: tire on the barrel, painted hub on both caps. Keeping
// traffic at a handful of draw calls per vehicle matters on phones.
const wheelGeoCache = new Map();
function wheelMesh(r, w) {
  const tire = mat('tire', () => new THREE.MeshLambertMaterial({ color: '#17171c' }));
  const hub = mat('hub', () => new THREE.MeshLambertMaterial({ map: hubTexture() }));
  const key = `${r}_${w}`;
  if (!wheelGeoCache.has(key)) {
    const geo = new THREE.CylinderGeometry(r, r, w, 10);
    geo.rotateZ(Math.PI / 2);
    wheelGeoCache.set(key, geo);
  }
  return new THREE.Mesh(wheelGeoCache.get(key), [tire, hub, hub]);
}

function addWheels(group, wheels, positions, r, w) {
  positions.forEach(([x, z]) => {
    const wh = wheelMesh(r, w);
    wh.position.set(x, r, z);
    group.add(wh);
    wheels.push(wh);
  });
}

export function buildSedan(color) {
  const group = new THREE.Group();
  const wheels = [];
  const paint = new THREE.MeshLambertMaterial({ color });
  const roofPaint = new THREE.MeshLambertMaterial({ color: new THREE.Color(color).offsetHSL(0, 0, -0.06) });
  const trim = mat('trim', () => new THREE.MeshLambertMaterial({ color: '#2a2a33' }));
  const glass = mat('windshield', () => new THREE.MeshLambertMaterial({ map: windshieldTexture() }));
  const chrome = mat('chrome', () => new THREE.MeshLambertMaterial({ color: '#d8dde6' }));
  const front = new THREE.MeshLambertMaterial({ map: carFaceTexture(color, false) });
  const rear = new THREE.MeshLambertMaterial({ map: carFaceTexture(color, true) });
  // Body: sides, top, bottom, front (+z), back (-z).
  group.add(box(5.2, 1.5, 10, [paint, paint, paint, trim, front, rear], 0, 1.6, 0));
  const side = new THREE.MeshLambertMaterial({ map: tex.carSideTexture(color) });
  group.add(box(4.4, 1.25, 4.8, [side, side, roofPaint, trim, glass, glass], 0, 2.95, -0.4));
  group.add(box(5.4, 0.35, 0.5, chrome, 0, 1.0, 5.1));
  group.add(box(5.4, 0.35, 0.5, chrome, 0, 1.0, -5.1));
  addWheels(group, wheels, [[-2.55, 3.1], [2.55, 3.1], [-2.55, -3.1], [2.55, -3.1]], 0.85, 0.75);
  return { group, wheels, halfLen: 5, w: 5.2, h: 3.6 };
}

export function buildBus() {
  const group = new THREE.Group();
  const wheels = [];
  const paint = mat('busPaint', () => new THREE.MeshLambertMaterial({ color: '#ffb635' }));
  const side = mat('busSide', () => new THREE.MeshLambertMaterial({ map: tex.busSideTexture() }));
  const face = mat('busFace', () => new THREE.MeshLambertMaterial({ map: tex.truckFaceTexture('#ffb635') }));
  const trim = mat('trim', () => new THREE.MeshLambertMaterial({ color: '#2a2a33' }));
  group.add(box(6.4, 5.4, 14, [side, side, paint, trim, face, face], 0, 3.9, 0));
  addWheels(group, wheels, [[-3.05, 4.6], [3.05, 4.6], [-3.05, -4.4], [3.05, -4.4]], 1.1, 0.9);
  return { group, wheels, halfLen: 7, w: 6.6, h: 6.6 };
}

export function buildSemi(color = '#2a4fd6') {
  const group = new THREE.Group();
  const wheels = [];
  const paint = new THREE.MeshLambertMaterial({ color });
  const face = new THREE.MeshLambertMaterial({ map: tex.truckFaceTexture(color) });
  const glass = mat('windshield', () => new THREE.MeshLambertMaterial({ map: windshieldTexture() }));
  const trim = mat('trim', () => new THREE.MeshLambertMaterial({ color: '#2a2a33' }));
  const chrome = mat('chrome', () => new THREE.MeshLambertMaterial({ color: '#d8dde6' }));
  const trailerSide = mat('trailerSide', () => new THREE.MeshLambertMaterial({ map: tex.trailerSideTexture() }));
  const trailerEnd = mat('trailerEnd', () => new THREE.MeshLambertMaterial({ color: '#dcdce4' }));
  // Front bumper sits at z = +12.5, trailer tail at z = -12.5.
  group.add(box(6.4, 2.6, 3.2, [paint, paint, paint, trim, face, paint], 0, 2.9, 10.9));   // hood
  group.add(box(6.4, 5.6, 5.2, [paint, paint, paint, trim, glass, paint], 0, 4.4, 6.7));   // cab
  group.add(box(6.8, 0.5, 0.6, chrome, 0, 1.5, 12.4));                                      // bumper
  group.add(box(6.6, 6.4, 15.4, [trailerSide, trailerSide, trailerEnd, trim, trailerEnd, trailerEnd], 0, 4.5, -4.8));
  [-2.4, 2.4].forEach((x) => {
    const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 4.6, 8), chrome);
    stack.position.set(x * 1.35, 5.2, 4.1);
    group.add(stack);
  });
  addWheels(group, wheels, [
    [-3.0, 10.4], [3.0, 10.4], [-3.0, 4.2], [3.0, 4.2],
    [-3.0, -8.6], [3.0, -8.6], [-3.0, -11.0], [3.0, -11.0],
  ], 1.1, 1.0);
  return { group, wheels, halfLen: 12.5, w: 7.4, h: 7.2 };
}

export function buildVehicle(kind, color) {
  if (kind === 'semi') return buildSemi(color);
  if (kind === 'bus') return buildBus();
  return buildSedan(color);
}
