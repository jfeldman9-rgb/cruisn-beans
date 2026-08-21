#!/usr/bin/env node

// Deterministic software evidence renderer for CRUIS'N BEANS.
//
// This is intentionally not a WebGL/browser screenshot harness. It produces
// clearly watermarked 2D scenario composites from the game's real data,
// CanvasTexture art and high-chase camera math. The composites are useful when
// a browser runner is unavailable, but the watermark prevents them from being
// mistaken for live gameplay captures.

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';

const require = createRequire(import.meta.url);
const {
  createCanvas, loadImage, Image,
} = require('@napi-rs/canvas');

const WIDTH = 1280;
const HEIGHT = 720;
const WATERMARK = 'LOCAL EVIDENCE RENDER • SOFTWARE 2D';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const outputArg = process.argv[2];

if (!outputArg) {
  console.error('Usage: node tools/render_evidence.mjs <output-directory>');
  process.exit(2);
}

const OUTPUT = path.resolve(process.cwd(), outputArg);
await mkdir(OUTPUT, { recursive: true });

// Three.js and the game texture helpers expect a small browser surface. NAPI
// canvases provide everything the geometry/texture constructors use here.
globalThis.window = {};
globalThis.localStorage = { getItem: () => '1', setItem: () => {} };
globalThis.document = {
  createElement(tag) { return tag === 'canvas' ? createCanvas(1, 1) : new Image(); },
  createElementNS(_namespace, tag) { return tag === 'canvas' ? createCanvas(1, 1) : new Image(); },
};
globalThis.Image = Image;
globalThis.HTMLImageElement = Image;

// Race/Track generation uses Math.random for placements. Pin it so evidence
// generated on two machines has the same road props and fleet composition.
let randomState = 0x0c0ffee;
Math.random = () => {
  randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
  return randomState / 0x100000000;
};

const [{ RACERS, RIVALS, STAGES }, { Race }, tex, trackModule] = await Promise.all([
  import('../js/data.js'),
  import('../js/game.js'),
  import('../js/tex.js?v=world-pass-3'),
  import('../js/track.js?v=world-pass-3'),
]);

const {
  ROAD_HALF, SHOULDER, LANE_PLAYER, LANE_ONCOMING,
} = trackModule;
const hawaii = STAGES.find((stage) => stage.id === 'hawaii');
if (!hawaii) throw new Error('HAWAII COAST is missing from STAGES');

const pack = [...RACERS, ...RIVALS];
const race = new Race({
  trackDef: hawaii,
  racers: pack,
  playerIndex: 0,
  demo: false,
  onEvent: () => {},
});
race.camera.aspect = WIDTH / HEIGHT;
race.camera.updateProjectionMatrix();

const assetPath = (url) => path.join(ROOT, String(url).split('?')[0]);
const selectArt = new Map();
for (const racer of RACERS) {
  selectArt.set(racer.id, {
    portrait: await loadImage(assetPath(racer.portrait)),
    car: await loadImage(assetPath(racer.carSprite)),
  });
}

function sceneCanvas() {
  const canvas = createCanvas(WIDTH, HEIGHT);
  const g = canvas.getContext('2d');
  g.imageSmoothingEnabled = true;
  return { canvas, g };
}

function roundedRect(g, x, y, w, h, r, fill, stroke = null, lineWidth = 2) {
  const rr = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + rr, y);
  g.lineTo(x + w - rr, y);
  g.quadraticCurveTo(x + w, y, x + w, y + rr);
  g.lineTo(x + w, y + h - rr);
  g.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  g.lineTo(x + rr, y + h);
  g.quadraticCurveTo(x, y + h, x, y + h - rr);
  g.lineTo(x, y + rr);
  g.quadraticCurveTo(x, y, x + rr, y);
  g.closePath();
  if (fill) { g.fillStyle = fill; g.fill(); }
  if (stroke) { g.strokeStyle = stroke; g.lineWidth = lineWidth; g.stroke(); }
}

function fitImage(g, image, x, y, w, h, contain = true) {
  const scale = contain
    ? Math.min(w / image.width, h / image.height)
    : Math.max(w / image.width, h / image.height);
  const dw = image.width * scale;
  const dh = image.height * scale;
  g.drawImage(image, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

function label(g, text, x, y, size, color = '#ffffff', align = 'left', weight = 900) {
  g.save();
  g.font = `${weight} ${size}px Arial, sans-serif`;
  g.textAlign = align;
  g.textBaseline = 'alphabetic';
  g.fillStyle = color;
  g.fillText(text, x, y);
  g.restore();
}

function outlinedLabel(g, text, x, y, size, fill, stroke, lineWidth = 5, align = 'center') {
  g.save();
  g.font = `900 ${size}px Arial Black, Arial, sans-serif`;
  g.textAlign = align;
  g.lineJoin = 'round';
  g.lineWidth = lineWidth;
  g.strokeStyle = stroke;
  g.strokeText(text, x, y);
  g.fillStyle = fill;
  g.fillText(text, x, y);
  g.restore();
}

function watermark(g) {
  g.save();
  g.fillStyle = 'rgba(5, 5, 16, 0.92)';
  g.fillRect(0, HEIGHT - 38, WIDTH, 38);
  g.strokeStyle = '#ffd23d';
  g.lineWidth = 2;
  g.beginPath(); g.moveTo(0, HEIGHT - 38); g.lineTo(WIDTH, HEIGHT - 38); g.stroke();
  label(g, WATERMARK, WIDTH / 2, HEIGHT - 12, 18, '#ffd23d', 'center');
  g.restore();
}

function configureHighChase(s, speed = 60, yOff = 0, x = LANE_PLAYER) {
  race.player.s = s;
  race.player.x = x;
  race.player.speed = speed;
  race.player.yOff = yOff;
  race.player.wheelieT = 0;
  race.cameraMode = 0;
  race.camInit = false;
  race.camera.aspect = WIDTH / HEIGHT;
  race.updateCamera(1);
  race.camera.updateProjectionMatrix();
  race.camera.updateMatrixWorld(true);
}

function project(world) {
  const p = world.clone().project(race.camera);
  if (![p.x, p.y, p.z].every(Number.isFinite)) return null;
  return {
    x: (p.x + 1) * WIDTH / 2,
    y: (1 - p.y) * HEIGHT / 2,
    z: p.z,
  };
}

function projectedCrossSection(s) {
  const at = (offset) => project(race.track.worldPos(s, offset));
  return {
    outerA: at(ROAD_HALF + SHOULDER),
    roadA: at(ROAD_HALF),
    roadB: at(-ROAD_HALF),
    outerB: at(-ROAD_HALF - SHOULDER),
  };
}

function quad(g, a, b, c, d, fill) {
  if (![a, b, c, d].every(Boolean)) return;
  g.beginPath();
  g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.lineTo(c.x, c.y); g.lineTo(d.x, d.y);
  g.closePath();
  g.fillStyle = fill;
  g.fill();
}

function lineWorld(g, s0, s1, offset, color, width) {
  const a = project(race.track.worldPos(s0, offset));
  const b = project(race.track.worldPos(s1, offset));
  if (!a || !b) return;
  g.strokeStyle = color;
  g.lineWidth = width;
  g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
}

function drawSkyAndIsland(g, options = {}) {
  const sky = g.createLinearGradient(0, 0, 0, 390);
  sky.addColorStop(0, hawaii.sky[0]);
  sky.addColorStop(0.62, hawaii.sky[1]);
  sky.addColorStop(1, hawaii.sky[2]);
  g.fillStyle = sky;
  g.fillRect(0, 0, WIDTH, HEIGHT);

  // Sun and ocean are deliberately broad; the road geometry overlays them.
  const sun = g.createRadialGradient(1060, 120, 4, 1060, 120, 88);
  sun.addColorStop(0, '#fffde2'); sun.addColorStop(0.28, '#fff3a3'); sun.addColorStop(1, 'rgba(255,240,150,0)');
  g.fillStyle = sun; g.fillRect(940, 0, 240, 240);
  g.fillStyle = '#399b54'; g.fillRect(0, 270, WIDTH, HEIGHT - 270);
  const ocean = g.createLinearGradient(820, 290, 1280, 650);
  ocean.addColorStop(0, '#59bdec'); ocean.addColorStop(1, '#075fae');
  g.fillStyle = ocean;
  g.beginPath();
  g.moveTo(785, 284); g.lineTo(WIDTH, 260); g.lineTo(WIDTH, HEIGHT); g.lineTo(920, HEIGHT); g.closePath();
  g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.7)';
  for (let y = 330; y < 650; y += 42) {
    g.beginPath(); g.moveTo(910 + (y - 330) * 0.15, y); g.lineTo(1260, y - 13); g.stroke();
  }

  if (options.postcard) {
    const volcano = tex.volcanoTexture().image;
    g.globalAlpha = 0.9;
    g.drawImage(volcano, 18, 116, 460, 230);
    g.globalAlpha = 1;
    const ship = tex.cruiseShipTexture().image;
    g.drawImage(ship, 965, 225, 250, 84);
  }
}

function drawRoad(g, maxAhead = 900) {
  const start = Math.max(0, race.player.s - 4);
  const sections = [];
  for (let d = 0; d <= maxAhead; d += 20) sections.push(projectedCrossSection(start + d));

  for (let i = sections.length - 2; i >= 0; i--) {
    const near = sections[i];
    const far = sections[i + 1];
    const stripe = i % 2 ? '#34343d' : '#3b3b46';
    quad(g, near.outerA, far.outerA, far.roadA, near.roadA, i % 2 ? '#dcc479' : '#efd991');
    quad(g, near.roadA, far.roadA, far.roadB, near.roadB, stripe);
    quad(g, near.roadB, far.roadB, far.outerB, near.outerB, i % 2 ? '#dcc479' : '#efd991');
  }

  // Edge lines, double-yellow center, and dashed inner lane guides.
  for (let d = 0; d < maxAhead - 20; d += 20) {
    const s0 = start + d;
    const s1 = s0 + 20;
    const perspectiveWidth = Math.max(1, 7 * (1 - d / maxAhead));
    lineWorld(g, s0, s1, ROAD_HALF - 0.5, '#f5f5e9', perspectiveWidth * 0.55);
    lineWorld(g, s0, s1, -ROAD_HALF + 0.5, '#f5f5e9', perspectiveWidth * 0.55);
    lineWorld(g, s0, s1, -0.4, '#ffd23d', perspectiveWidth * 0.45);
    lineWorld(g, s0, s1, 0.4, '#ffd23d', perspectiveWidth * 0.45);
    if (Math.floor(d / 40) % 2 === 0) {
      lineWorld(g, s0, s1, LANE_PLAYER, '#d9d9cf', perspectiveWidth * 0.34);
      lineWorld(g, s0, s1, LANE_ONCOMING, '#d9d9cf', perspectiveWidth * 0.34);
    }
  }
}

function billboardBox(s, x, worldW, worldH, yOff = 0) {
  const frame = race.track.frameAt(s);
  const base = race.track.worldPos(s, x);
  base.y += yOff;
  const left = base.clone().addScaledVector(frame.left, worldW / 2);
  const right = base.clone().addScaledVector(frame.left, -worldW / 2);
  const top = base.clone(); top.y += worldH;
  const pBase = project(base);
  const pLeft = project(left);
  const pRight = project(right);
  const pTop = project(top);
  if (![pBase, pLeft, pRight, pTop].every(Boolean)) return null;
  return {
    x: (pLeft.x + pRight.x) / 2,
    y: pBase.y,
    w: Math.abs(pRight.x - pLeft.x),
    h: Math.abs(pBase.y - pTop.y),
  };
}

function drawBillboard(g, image, s, x, worldW, worldH, options = {}) {
  const box = billboardBox(s, x, worldW, worldH, options.yOff || 0);
  if (!box || box.w < 1 || box.h < 1) return null;
  const scale = options.scale || 1;
  const w = box.w * scale;
  const h = box.h * scale;
  g.save();
  g.translate(box.x + (options.shiftX || 0), box.y + (options.shiftY || 0));
  g.rotate(options.rotate || 0);
  g.globalAlpha = options.alpha ?? 1;
  g.imageSmoothingEnabled = false;
  g.drawImage(image, -w / 2, -h, w, h);
  g.restore();
  return { ...box, w, h };
}

function drawPalms(g, baseS) {
  const palm = tex.palmTexture().image;
  const placements = [
    [baseS + 80, 25, 14, 21], [baseS + 125, -28, 14, 22],
    [baseS + 185, 31, 16, 24], [baseS + 260, -30, 13, 20],
    [baseS + 345, 27, 14, 21], [baseS + 450, -34, 15, 23],
  ];
  placements.sort((a, b) => b[0] - a[0]).forEach(([s, x, w, h]) => drawBillboard(g, palm, s, x, w, h));
}

function drawGate(g, s, kind = 'aloha') {
  const image = kind === 'checkpoint'
    ? tex.archTexture('CHECKPOINT', '#0b5aa5', '#ffd23d').image
    : tex.alohaGateTexture().image;
  const lm = hawaii.landmarks.find((item) => item.kind === 'alohaGate');
  return drawBillboard(g, image, s, 0, kind === 'checkpoint' ? ROAD_HALF * 2 + 5 : lm.w, kind === 'checkpoint' ? 7 : lm.h);
}

function drawNamedCar(g, racer, s, x, options = {}) {
  const image = (options.front ? tex.namedCarFrontTexture(racer.id) : tex.namedCarRearTexture(racer.id)).image;
  const ratio = image.height / image.width;
  const worldW = racer.spriteWidth * (options.player ? race.player.visualScale : 1);
  const worldH = worldW * Math.min(0.68, Math.max(0.45, ratio));
  return drawBillboard(g, image, s, x, worldW, worldH, options);
}

function drawGenericCar(g, rival, s, x, options = {}) {
  return drawBillboard(g, tex.rivalRearTexture(rival.color).image, s, x, rival.spriteWidth, rival.spriteWidth * 0.72, options);
}

function drawTruck(g, s, x = LANE_PLAYER, options = {}) {
  return drawBillboard(g, tex.semiFrontTexture().image, s, x, 7.4, 6.6, options);
}

function drawHud(g, options = {}) {
  const cpTotal = race.track.checkpoints.length;
  const time = options.time ?? 18;
  const cp = options.cp ?? 1;
  const place = options.place ?? 4;
  const speed = options.speed ?? 132;
  roundedRect(g, 474, 14, 140, 58, 10, 'rgba(8,6,30,0.86)', '#ffd23d', 3);
  roundedRect(g, 624, 8, 136, 70, 10, 'rgba(8,6,30,0.9)', time < 8 ? '#e8262d' : '#ffd23d', 4);
  roundedRect(g, 770, 14, 150, 58, 10, 'rgba(8,6,30,0.86)', '#ffd23d', 3);
  label(g, `CP ${cp}/${cpTotal}`, 544, 51, 24, '#ffffff', 'center');
  label(g, 'TIME', 692, 28, 13, '#ffd23d', 'center');
  label(g, String(Math.ceil(time)), 692, 65, 36, time < 8 ? '#ff4b54' : '#ffffff', 'center');
  label(g, `${place}th/7`.replace('1th', '1st').replace('2th', '2nd').replace('3th', '3rd'), 845, 51, 24, '#ffd23d', 'center');
  roundedRect(g, 22, 18, 235, 22, 8, 'rgba(8,6,30,0.78)', '#ffd23d', 2);
  g.fillStyle = '#2fae3f';
  g.fillRect(26, 22, 225 * (options.progress ?? 0.32), 14);
  label(g, `HAWAII COAST  •  ${options.zone || 'COAST'}`, WIDTH / 2, 105, 17, '#ffffff', 'center');
  label(g, `${speed} MPH`, WIDTH / 2, HEIGHT - 55, 31, '#ffffff', 'center');
  roundedRect(g, WIDTH - 215, HEIGHT - 86, 190, 34, 8, 'rgba(8,6,30,0.78)', '#9db2ff', 2);
  label(g, 'HIGH CHASE', WIDTH - 120, HEIGHT - 62, 16, '#ffffff', 'center');
}

function toast(g, heading, sub = '', color = '#2fae3f') {
  roundedRect(g, 330, 130, 620, sub ? 100 : 72, 14, 'rgba(8,6,30,0.9)', '#ffd23d', 4);
  outlinedLabel(g, heading, WIDTH / 2, 172, 34, '#ffffff', color, 4);
  if (sub) label(g, sub, WIDTH / 2, 207, 18, '#ffd23d', 'center');
}

function cameraEvidenceBadge(g) {
  const car = race.player;
  const expectedFov = 66 + Math.min(1, car.speed / 66) * 7;
  roundedRect(g, 22, 50, 338, 88, 10, 'rgba(8,6,30,0.82)', '#9db2ff', 2);
  label(g, 'ACTUAL CAMERA CONFIG', 42, 76, 15, '#ffd23d');
  label(g, 'HIGH CHASE • 13.5 BACK • 8.25 UP', 42, 103, 15, '#ffffff');
  label(g, `FOV ${expectedFov.toFixed(1)}° • PLAYER SCALE ${car.visualScale.toFixed(2)}×`, 42, 126, 15, '#ffffff');
}

function drawGameplayFoundation(g, options = {}) {
  drawSkyAndIsland(g, options);
  drawRoad(g, options.maxAhead || 900);
  drawPalms(g, race.player.s);
}

const gateDef = hawaii.landmarks.find((item) => item.kind === 'alohaGate');
const gateS = gateDef.at * race.track.length;
const rendered = [];

async function save(canvas, filename, title) {
  const out = path.join(OUTPUT, filename);
  await writeFile(out, canvas.toBuffer('image/png'));
  rendered.push({ canvas, filename, title, out });
}

// 01 — Title / attract composite.
{
  const { canvas, g } = sceneCanvas();
  configureHighChase(gateS - 430, 54);
  drawGameplayFoundation(g, { postcard: true });
  drawGate(g, gateS);
  drawNamedCar(g, RACERS[1], race.player.s + 42, LANE_PLAYER - 4);
  drawNamedCar(g, RACERS[2], race.player.s + 70, LANE_PLAYER + 4);
  drawNamedCar(g, RACERS[0], race.player.s, LANE_PLAYER, { player: true });
  g.fillStyle = 'rgba(5,3,24,0.56)'; g.fillRect(0, 0, WIDTH, HEIGHT - 38);
  outlinedLabel(g, "CRUIS'N", WIDTH / 2, 215, 76, '#ffffff', '#0b5aa5', 8);
  outlinedLabel(g, 'BEANS', WIDTH / 2, 365, 142, '#ffd23d', '#8f0f14', 12);
  label(g, 'THE MUSICAL FRUIT GRAND PRIX', WIDTH / 2, 412, 25, '#ff5aa2', 'center');
  roundedRect(g, 465, 472, 350, 72, 14, '#e8262d', '#ffffff', 4);
  label(g, 'PRESS START', WIDTH / 2, 520, 32, '#ffffff', 'center');
  label(g, `${STAGES.length} POINT-TO-POINT STAGES  •  ${pack.length}-CAR FIELD`, WIDTH / 2, 590, 18, '#cbd2ff', 'center');
  watermark(g);
  await save(canvas, '01-title.png', 'TITLE');
}

// 02 — Select screen using the real Videomaker PNGs referenced by RACERS.
{
  const { canvas, g } = sceneCanvas();
  const bg = g.createLinearGradient(0, 0, WIDTH, HEIGHT);
  bg.addColorStop(0, '#08061e'); bg.addColorStop(0.55, '#22165a'); bg.addColorStop(1, '#52164e');
  g.fillStyle = bg; g.fillRect(0, 0, WIDTH, HEIGHT);
  outlinedLabel(g, 'CHOOSE YOUR CRUISER', WIDTH / 2, 70, 44, '#ffd23d', '#7a2c00', 5);
  const cardW = 286;
  const gap = 24;
  const startX = (WIDTH - (cardW * 4 + gap * 3)) / 2;
  RACERS.forEach((racer, i) => {
    const x = startX + i * (cardW + gap);
    roundedRect(g, x, 98, cardW, 540, 14, '#171040', '#ffd23d', 3);
    label(g, racer.name, x + cardW / 2, 135, 25, '#ffd23d', 'center');
    roundedRect(g, x + 16, 150, cardW - 32, 238, 8, '#302477', '#6a5ae0', 2);
    fitImage(g, selectArt.get(racer.id).portrait, x + 18, 152, cardW - 36, 234);
    fitImage(g, selectArt.get(racer.id).car, x + 12, 394, cardW - 24, 104);
    label(g, racer.car, x + cardW / 2, 520, 14, '#9db2ff', 'center');
    const statRows = [['SPD', racer.stats.speed], ['GRP', racer.stats.grip], ['WHL', racer.stats.wheelie]];
    statRows.forEach(([name, value], row) => {
      const y = 540 + row * 23;
      label(g, name, x + 20, y + 14, 11, '#cfd6ff');
      roundedRect(g, x + 58, y + 3, 195, 12, 5, '#0d0a2b');
      roundedRect(g, x + 58, y + 3, 195 * value, 12, 5, row === 2 ? '#ffd23d' : '#2fae3f');
    });
    label(g, racer.tagline, x + cardW / 2, 626, 10, '#ff5aa2', 'center');
  });
  label(g, 'REAL VIDEOMAKER SELECT ART • STRAIGHT GAMEPLAY SPRITES LOAD IN-RACE', WIDTH / 2, 670, 14, '#cbd2ff', 'center');
  watermark(g);
  await save(canvas, '02-all-four-faces.png', 'ALL FOUR FACES');
}

// 03 — High camera, Hawaii identity, wrong-way truck and readable pack.
{
  const { canvas, g } = sceneCanvas();
  const playerS = gateS - 255;
  configureHighChase(playerS, 62);
  drawGameplayFoundation(g, { postcard: true, maxAhead: 1050 });
  drawGate(g, gateS);
  drawNamedCar(g, RACERS[3], playerS + 58, LANE_PLAYER - 4);
  drawNamedCar(g, RACERS[1], playerS + 82, LANE_PLAYER + 4);
  drawTruck(g, playerS + 126, LANE_PLAYER);
  drawGenericCar(g, RIVALS[0], playerS + 35, LANE_PLAYER + 5);
  drawNamedCar(g, RACERS[0], playerS, LANE_PLAYER, { player: true });
  drawHud(g, { time: 19.4, cp: 1, place: 4, speed: 136, progress: playerS / race.track.length, zone: 'BEACH TOWN' });
  cameraEvidenceBadge(g);
  roundedRect(g, 905, 52, 350, 54, 10, 'rgba(8,6,30,0.82)', '#e8262d', 3);
  label(g, 'WRONG-WAY TRUCK • WHEELIE IT', 1080, 86, 17, '#ffffff', 'center');
  watermark(g);
  await save(canvas, '03-hawaii-landmark-truck-camera.png', 'HAWAII + TRUCK + HIGH CAMERA');
}

// 04 — Wheelie leapfrog scenario.
{
  const { canvas, g } = sceneCanvas();
  const playerS = gateS + 920;
  configureHighChase(playerS, 66, 4.2);
  race.player.wheelieT = 1.1;
  race.updateCamera(1);
  race.camera.updateMatrixWorld(true);
  drawGameplayFoundation(g, { maxAhead: 820 });
  drawTruck(g, playerS + 9, LANE_PLAYER, { scale: 1.08 });
  drawNamedCar(g, RACERS[2], playerS + 48, LANE_PLAYER - 4);
  drawNamedCar(g, RACERS[1], playerS + 72, LANE_PLAYER + 4);
  // Green turbo puffs make the wheelie/turbo state explicit without inventing
  // a nitro meter.
  const playerBox = drawNamedCar(g, RACERS[0], playerS, LANE_PLAYER, {
    player: true, yOff: 4.2, rotate: -0.13, scale: 1.08,
  });
  if (playerBox) {
    g.fillStyle = 'rgba(134,255,91,0.72)';
    for (let i = 0; i < 6; i++) {
      g.beginPath();
      g.arc(playerBox.x - playerBox.w * 0.3 + i * 13, playerBox.y + 8 + (i % 2) * 8, 10 + i * 2, 0, Math.PI * 2);
      g.fill();
    }
  }
  drawHud(g, { time: 8.7, cp: 2, place: 3, speed: 154, progress: playerS / race.track.length, zone: 'COAST' });
  toast(g, 'LEAPFROG! +1.0s', 'WHEELIE TURBO CLEARED THE ONCOMING SEMI');
  watermark(g);
  await save(canvas, '04-wheelie-leapfrog.png', 'WHEELIE LEAPFROG');
}

// 05 — Pileup with the pack eating the stopped player.
{
  const { canvas, g } = sceneCanvas();
  const playerS = gateS + 2250;
  configureHighChase(playerS, 0);
  drawGameplayFoundation(g, { maxAhead: 700 });
  drawTruck(g, playerS + 6, LANE_PLAYER);
  drawNamedCar(g, RACERS[3], playerS + 16, LANE_PLAYER + 4, { scale: 1.12 });
  drawNamedCar(g, RACERS[1], playerS + 8, LANE_PLAYER - 4, { scale: 1.1, rotate: -0.07 });
  drawNamedCar(g, RACERS[2], playerS + 29, LANE_PLAYER + 1, { scale: 1.08 });
  drawGenericCar(g, RIVALS[1], playerS - 2, LANE_PLAYER - 6, { scale: 1.12 });
  drawGenericCar(g, RIVALS[2], playerS + 36, LANE_PLAYER - 5);
  drawNamedCar(g, RACERS[0], playerS, LANE_PLAYER, { player: true, rotate: 0.42, scale: 1.08 });
  drawHud(g, { time: 11.6, cp: 3, place: 7, speed: 0, progress: playerS / race.track.length, zone: 'PALMS' });
  toast(g, 'CRASH PILE!', 'PACK GOING BY... COMEBACK BOOST ARMED', '#e8262d');
  watermark(g);
  await save(canvas, '05-pileup.png', 'PILEUP');
}

// 06 — Low-clock checkpoint save.
{
  const { canvas, g } = sceneCanvas();
  const checkpointIndex = 3;
  const checkpointS = race.track.checkpoints[checkpointIndex];
  const playerS = checkpointS - 70;
  configureHighChase(playerS, 63);
  drawGameplayFoundation(g, { maxAhead: 780 });
  drawGate(g, checkpointS, 'checkpoint');
  drawNamedCar(g, RACERS[3], playerS + 40, LANE_PLAYER - 4);
  drawNamedCar(g, RACERS[0], playerS, LANE_PLAYER, { player: true });
  drawHud(g, {
    time: 21.2,
    cp: checkpointIndex + 1,
    place: 2,
    speed: 139,
    progress: playerS / race.track.length,
    zone: 'CLIFF',
  });
  roundedRect(g, 365, 125, 550, 176, 18, 'rgba(10,8,42,0.94)', '#ffd23d', 6);
  outlinedLabel(g, `CHECKPOINT ${checkpointIndex + 1}/${race.track.checkpoints.length}`, WIDTH / 2, 175, 30, '#ffffff', '#0b5aa5', 5);
  outlinedLabel(g, `+${hawaii.checkpointBonus} SECONDS`, WIDTH / 2, 241, 48, '#ffd23d', '#7a2c00', 6);
  label(g, 'CLOCK: 1.2s  →  21.2s', WIDTH / 2, 282, 21, '#7dff8b', 'center');
  watermark(g);
  await save(canvas, '06-checkpoint-save.png', 'CHECKPOINT SAVE');
}

// 07 — Honest results using the supplied measured Hawaii run.
{
  const { canvas, g } = sceneCanvas();
  const bg = g.createLinearGradient(0, 0, WIDTH, HEIGHT);
  bg.addColorStop(0, '#07051c'); bg.addColorStop(0.5, '#211051'); bg.addColorStop(1, '#3d153f');
  g.fillStyle = bg; g.fillRect(0, 0, WIDTH, HEIGHT);
  outlinedLabel(g, '1st PLACE!', WIDTH / 2, 84, 68, '#2fae3f', '#0b3a12', 7);
  label(g, 'HAWAII COAST • MEASURED RUN', WIDTH / 2, 117, 17, '#ffffff', 'center');

  roundedRect(g, 42, 142, 370, 477, 14, 'rgba(8,6,30,0.86)', '#ffd23d', 3);
  label(g, 'OFFICIAL TIME', 227, 186, 18, '#ffd23d', 'center');
  outlinedLabel(g, '2:07.251', 227, 252, 52, '#ffffff', '#0b5aa5', 5);
  label(g, 'RAW FINISH', 92, 302, 14, '#9db2ff');
  label(g, '2:19.251', 360, 302, 21, '#ffffff', 'right');
  label(g, 'STUNT CUT', 92, 342, 14, '#9db2ff');
  label(g, '-12.000s', 360, 342, 21, '#7dff8b', 'right');
  label(g, 'PLACE', 92, 382, 14, '#9db2ff');
  label(g, '1st / 7', 360, 382, 21, '#ffd23d', 'right');
  label(g, 'RULE APPLIED', 92, 435, 14, '#9db2ff');
  label(g, 'OFFICIAL = RAW − STUNT CREDIT', 227, 468, 15, '#ffffff', 'center');
  roundedRect(g, 78, 505, 298, 70, 10, '#14273a', '#2fae3f', 2);
  label(g, 'THE BEAN COUNCIL APPROVES.', 227, 548, 14, '#ffd23d', 'center');

  const rows = [RACERS[0], RACERS[1], RACERS[2], RACERS[3], ...RIVALS];
  rows.forEach((racer, i) => {
    const y = 140 + i * 68;
    const selected = i === 0;
    roundedRect(g, 450, y, 785, 57, 10, selected ? '#3c2805' : 'rgba(8,6,30,0.86)', selected ? '#ffd23d' : '#3d3370', 2);
    label(g, `${i + 1}${i === 0 ? 'st' : i === 1 ? 'nd' : i === 2 ? 'rd' : 'th'}`, 480, y + 37, 20, '#ffd23d');
    if (racer.portrait) {
      const portrait = selectArt.get(racer.id).portrait;
      fitImage(g, portrait, 532, y + 3, 58, 50);
    } else {
      fitImage(g, tex.rivalRearTexture(racer.color).image, 532, y + 3, 58, 50);
    }
    label(g, racer.name, 615, y + 36, 20, '#ffffff');
    label(g, selected ? '2:07.251' : 'DNF', 1205, y + 36, 19, selected ? '#7dff8b' : '#9db2ff', 'right');
  });
  watermark(g);
  await save(canvas, '07-results.png', 'RESULTS');
}

// Compact review sheet. The individual images retain their own watermark;
// this sheet repeats it at full size as well.
{
  const { canvas, g } = sceneCanvas();
  g.fillStyle = '#08061e'; g.fillRect(0, 0, WIDTH, HEIGHT);
  label(g, 'CRUIS\'N BEANS • LOCAL EVIDENCE SET', WIDTH / 2, 35, 24, '#ffd23d', 'center');
  const cellW = 320;
  const cellH = 320;
  rendered.forEach((item, i) => {
    const col = i % 4;
    const row = Math.floor(i / 4);
    const x = col * cellW;
    const y = 52 + row * cellH;
    roundedRect(g, x + 8, y, cellW - 16, 250, 8, '#171040', '#4d3e8f', 2);
    g.drawImage(item.canvas, x + 14, y + 8, cellW - 28, 164);
    label(g, `${String(i + 1).padStart(2, '0')} • ${item.title}`, x + cellW / 2, y + 205, 14, '#ffffff', 'center');
    label(g, item.filename, x + cellW / 2, y + 230, 11, '#9db2ff', 'center');
  });
  roundedRect(g, 968, 372, 304, 250, 8, '#14273a', '#2fae3f', 2);
  label(g, 'MEASURED HAWAII', 1120, 414, 17, '#ffd23d', 'center');
  label(g, 'RAW 2:19.251', 1120, 458, 22, '#ffffff', 'center');
  label(g, 'STUNT CUT −12.000s', 1120, 500, 18, '#7dff8b', 'center');
  label(g, 'OFFICIAL 2:07.251', 1120, 544, 22, '#ffffff', 'center');
  label(g, '1st / 7', 1120, 586, 20, '#ffd23d', 'center');
  watermark(g);
  const out = path.join(OUTPUT, 'contact-sheet.png');
  await writeFile(out, canvas.toBuffer('image/png'));
  rendered.push({ canvas, filename: 'contact-sheet.png', title: 'CONTACT SHEET', out });
}

race.dispose();

for (const item of rendered) console.log(item.out);
