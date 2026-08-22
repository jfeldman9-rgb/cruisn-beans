// CRUIS'N BEANS — screen flow, renderer, HUD.
import * as THREE from '../vendor/three.module.js';
import { RACERS, RIVALS, STAGES } from './data.js?v=visual-pass-1';
import { Race } from './game.js?v=soundtrack-pass-1';
import { Input } from './input.js?v=visual-pass-1';
import { audio } from './audio.js?v=soundtrack-pass-1';
import { rivalRearTexture } from './tex.js?v=visual-pass-1';

const seedParam = Number(new URLSearchParams(location.search).get('seed'));
if (Number.isFinite(seedParam) && seedParam > 0) {
  let seededState = seedParam >>> 0;
  Math.random = () => {
    seededState = (Math.imul(seededState, 1664525) + 1013904223) >>> 0;
    return seededState / 0x100000000;
  };
}

const $ = (sel) => document.querySelector(sel);

const canvas = $('#game');
const desktopQuality = matchMedia('(hover: hover) and (pointer: fine)').matches;
const renderPixelRatio = Math.min(window.devicePixelRatio || 1, desktopQuality ? 1.5 : 1.1);
document.body.classList.toggle('desktop-input', desktopQuality);
let renderer;
let webglAvailable = true;
try {
  renderer = new THREE.WebGLRenderer({
    canvas, antialias: true, powerPreference: 'high-performance', stencil: false,
  });
  renderer.setPixelRatio(renderPixelRatio);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.04;
} catch (error) {
  // Keep menus usable and surface a clear failure instead of leaving a black
  // page when a locked-down browser disables WebGL.
  webglAvailable = false;
  document.body.classList.add('no-webgl');
  renderer = {
    setSize(w, h) { canvas.width = w; canvas.height = h; },
    setPixelRatio() {},
    render() {},
  };
  console.warn('CRUIS\'N BEANS: WebGL unavailable; menus remain active.', error);
}

const input = new Input();
input.bindSteerSurface($('#steer-surface'));
input.bindHoldButton($('#btn-brake'), 'brake');
input.bindGasPad($('#btn-gas'));

const maxRenderScale = desktopQuality ? 1 : 0.9;
const minRenderScale = 0.72;
let renderScale = maxRenderScale;
let race = null;
let mode = 'title';
let chosenRacer = 0;
let chosenStage = 0;
let fpsAcc = 0;
let fpsN = 0;
let fpsT = 0;
let hintShown = false;
let musicStarted = false;
let lastClockBeep = -1;
let passTimer = 0;

// Rival portraits are generated from their canvas car sprites.
const rivalPortraits = new Map();
function rivalPortrait(rival) {
  if (rival.raceRearSprite) return rival.raceRearSprite;
  if (!rivalPortraits.has(rival.id)) {
    rivalPortraits.set(rival.id, rivalRearTexture(rival.color).image.toDataURL());
  }
  return rivalPortraits.get(rival.id);
}

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(Math.round(w * renderScale), Math.round(h * renderScale), false);
  if (race) {
    race.camera.aspect = w / h;
    race.camera.updateProjectionMatrix();
  }
}
window.addEventListener('resize', resize);

// ---------- screens ----------
const screens = ['title', 'racer', 'track', 'hud', 'results'];
function show(name) {
  screens.forEach((s) => $(`#screen-${s}`).classList.toggle('visible', s === name || (name === 'race' && s === 'hud')));
  mode = name;
}

function packFor(playerIdx) {
  const order = [playerIdx, ...RACERS.map((_, i) => i).filter((i) => i !== playerIdx)];
  return [...order.map((i) => RACERS[i]), ...RIVALS];
}

function startDemo() {
  if (race) race.dispose();
  const def = STAGES[(Math.random() * STAGES.length) | 0];
  race = new Race({ trackDef: def, racers: packFor(0), playerIndex: 0, demo: true, onEvent: () => {} });
  race.camera.aspect = window.innerWidth / window.innerHeight;
  race.camera.updateProjectionMatrix();
}

// ---------- asset gate ----------
// Racer cards used to paint their purple backing before the large PNGs
// arrived. Do not let the first select screen open until every portrait and
// car angle has decoded at least once.
const startBtn = $('#btn-start');
const artUrls = [...new Set([
  ...RACERS.flatMap((racer) => [
    racer.portrait, racer.carSprite, racer.rearSprite, racer.frontSprite,
    racer.raceRearSprite,
  ]),
  ...RIVALS.map((racer) => racer.raceRearSprite),
  ...STAGES.map((stage) => stage.panorama),
  'assets/img/premium/traffic-semi-front.webp?v=visual-pass-1',
  'assets/img/premium/traffic-sedan-front.webp?v=visual-pass-1',
].filter(Boolean))];

function loadArt(url, attempt = 0) {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = async () => {
      try { await image.decode(); } catch (error) { /* already loaded */ }
      resolve(true);
    };
    image.onerror = () => resolve(false);
    image.src = attempt > 0 ? `${url}${url.includes('?') ? '&' : '?'}retry=${attempt}` : url;
  });
}

async function gateRacerArt(attempt = 0) {
  const loaded = await Promise.all(artUrls.map((url) => loadArt(url, attempt)));
  if (loaded.every(Boolean)) {
    startBtn.disabled = false;
    startBtn.textContent = 'PRESS START';
    return;
  }
  startBtn.disabled = true;
  startBtn.textContent = 'LOADING DRIVER ART...';
  setTimeout(() => gateRacerArt(attempt + 1), 1400);
}
gateRacerArt();

// ---------- title ----------
startBtn.addEventListener('click', () => {
  audio.resume();
  buildRacerCards();
  show('racer');
  audio.beep(700, 0.1, 'square', 0.25);
});

// ---------- racer select ----------
function buildRacerCards() {
  const wrap = $('#racer-cards');
  if (wrap.childElementCount) return;
  RACERS.forEach((r, i) => {
    const card = document.createElement('button');
    card.className = 'card racer-card';
    card.innerHTML = `
      <div class="card-name">${r.name}</div>
      <img class="card-face" src="${r.portrait}" alt="${r.name}">
      <img class="card-car" src="${r.carSprite}" alt="${r.car}">
      <div class="card-carname">${r.car}</div>
      <div class="card-stats">
        <div><span>SPD</span><i style="width:${r.stats.speed * 100}%"></i></div>
        <div><span>GRP</span><i style="width:${r.stats.grip * 100}%"></i></div>
        <div><span>WHL</span><i style="width:${r.stats.wheelie * 100}%"></i></div>
      </div>
      <div class="card-tag">${r.tagline}</div>`;
    card.addEventListener('click', () => {
      chosenRacer = i;
      audio.beep(880, 0.12, 'square', 0.25);
      buildStageCards();
      show('track');
    });
    wrap.appendChild(card);
  });
}
$('#btn-racer-back').addEventListener('click', () => show('title'));

// ---------- stage select ----------
function buildStageCards() {
  const wrap = $('#track-cards');
  if (wrap.childElementCount) return;
  STAGES.forEach((t, i) => {
    const card = document.createElement('button');
    card.className = `card track-card track-${t.id}`;
    card.innerHTML = `
      <div class="card-name">${t.name}</div>
      <div class="track-art track-art-${t.id}"></div>
      <div class="card-tag">${t.blurb}</div>
      <div class="card-tag small">POINT TO POINT \u2022 7-CAR FIELD</div>
      <div class="card-tag target">TARGET ${t.targetTime}</div>`;
    card.addEventListener('click', () => {
      chosenStage = i;
      audio.beep(880, 0.12, 'square', 0.25);
      startRace();
    });
    wrap.appendChild(card);
  });
}
$('#btn-track-back').addEventListener('click', () => show('racer'));

// ---------- race ----------
const toastEl = $('#toast');
let toastTimer = 0;
function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 1500);
}

function showRivalPass(data) {
  if (!data || !data.racer || !data.racer.rearSprite) return;
  const card = $('#rival-pass');
  $('#rival-pass-car').src = data.racer.rearSprite;
  $('#rival-pass-car').alt = data.racer.name;
  $('#rival-pass-name').textContent = data.racer.name;
  $('#rival-pass-copy').textContent = data.ahead ? ' BLOWS BY!' : ' IN YOUR MIRROR!';
  card.classList.add('show');
  clearTimeout(passTimer);
  passTimer = setTimeout(() => card.classList.remove('show'), 1300);
}

const countEl = $('#countdown');
function showCount(txt, cls) {
  countEl.textContent = txt;
  countEl.className = `show ${cls || ''}`;
  setTimeout(() => countEl.classList.remove('show'), 850);
}

const checkpointFlash = $('#checkpoint-flash');
let checkpointTimer = 0;
function showCheckpoint(data) {
  $('#checkpoint-count').textContent = `CHECKPOINT ${data.index}/${data.total}`;
  $('#checkpoint-bonus').textContent = `+${data.bonus} SECONDS`;
  checkpointFlash.classList.remove('show');
  void checkpointFlash.offsetWidth;
  checkpointFlash.classList.add('show');
  clearTimeout(checkpointTimer);
  checkpointTimer = setTimeout(() => checkpointFlash.classList.remove('show'), 1400);
  audio.announce(`Checkpoint ${data.index}! ${data.bonus} seconds!`);
}

function startRace() {
  if (!webglAvailable) {
    const warning = $('#webgl-warning');
    warning.classList.remove('attention');
    void warning.offsetWidth;
    warning.classList.add('attention');
    return false;
  }
  if (race) race.dispose();
  audio.startMusic('countdown');
  // ?time=N overrides the starting clock (testing). ?short=1 starts near the end.
  const params = new URLSearchParams(location.search);
  const trackDef = { ...STAGES[chosenStage] };
  const timeOverride = parseFloat(params.get('time'));
  if (timeOverride > 0) trackDef.startTime = timeOverride;
  race = new Race({
    trackDef,
    racers: packFor(chosenRacer),
    playerIndex: 0,
    onEvent: onRaceEvent,
  });
  if (params.get('short') === '1') {
    race.cars.forEach((c, i) => { c.s = race.track.length - 900 - i * 10; });
    race.nextCheckpoint = race.track.checkpoints.filter((s) => s < race.player.s).length;
  }
  race.camera.aspect = window.innerWidth / window.innerHeight;
  race.camera.updateProjectionMatrix();
  $('#btn-camera small').textContent = 'HIGH';
  show('race');
  audio.startEngine();

  if (!hintShown) {
    hintShown = true;
    $('#hint').classList.add('show');
    setTimeout(() => $('#hint').classList.remove('show'), 7000);
  }

  setTimeout(() => race && race.startCountdown(), 800);
}

function onRaceEvent(kind, data) {
  if (kind === 'count') {
    showCount(String(data));
    audio.countdownBeep(false);
    if (data <= 2) $('#hint').classList.remove('show'); // clear stage for the countdown
  } else if (kind === 'go') {
    showCount('GO!!', 'go');
    audio.countdownBeep(true);
    audio.startMusic('race');
    audio.announce('Go, go, go!');
    $('#hint').classList.remove('show');
  } else if (kind === 'checkpoint') {
    showCheckpoint(data);
  } else if (kind === 'toast') {
    toast(data);
  } else if (kind === 'rivalPass') {
    showRivalPass(data);
  } else if (kind === 'finish') {
    setTimeout(() => showResults(data), 900);
  }
}

input.onFirstInput = () => $('#hint').classList.remove('show');

// ---------- results ----------
function fmtTime(t) {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, '0')}`;
}
const PLACE_NAMES = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th'];

function showResults(data) {
  audio.stopEngine();
  audio.startMusic('results');
  const title = $('#results-title');
  if (data.timeUp) {
    title.textContent = 'TIME UP!';
    title.className = 'lose';
  } else {
    title.textContent = `${PLACE_NAMES[data.place - 1]} PLACE!`;
    title.className = data.place === 1 ? 'win' : '';
  }
  $('#results-sub').textContent = data.timeUp
    ? 'THE ROAD WON THIS TIME...'
    : `OFFICIAL ${fmtTime(data.officialTime)}${data.stuntCredit > 0 ? ` \u2022 STUNT CUT -${data.stuntCredit.toFixed(1)}s` : ''} \u2022 STUNTS ${data.stunts} \u2022 BEANS ${data.beans}`;
  const finaleGag = $('#finale-gag');
  if (data.timeUp) finaleGag.textContent = 'THE BEAN COUNCIL DEMANDS A REMATCH.';
  else if (RACERS[chosenRacer].id === 'elon') finaleGag.textContent = 'ELON MISSED THE MOON EXIT. BEANS DELIVERED.';
  else if (RACERS[chosenRacer].id === 'lance') finaleGag.textContent = 'LANCE BROUGHT THE VAN HOME IN STYLE.';
  else finaleGag.textContent = data.place === 1 ? 'THE BEAN COUNCIL APPROVES.' : 'POSTCARD ACQUIRED. DIGNITY OPTIONAL.';
  const list = $('#results-list');
  list.innerHTML = '';
  data.results.forEach((r, i) => {
    const row = document.createElement('div');
    row.className = `result-row ${r.isPlayer ? 'me' : ''}`;
    const img = r.racer.portrait || rivalPortrait(r.racer);
    row.innerHTML = `
      <span class="rpos">${PLACE_NAMES[i]}</span>
      <img src="${img}" alt="${r.racer.name}">
      <span class="rname">${r.racer.name}</span>
      <span class="rtime">${r.finished ? fmtTime(r.time) : 'DNF'}</span>`;
    list.appendChild(row);
  });
  show('results');
}

$('#btn-retry').addEventListener('click', () => {
  audio.beep(700, 0.1, 'square', 0.25);
  startRace();
});
$('#btn-title').addEventListener('click', () => {
  audio.beep(500, 0.1, 'square', 0.25);
  startDemo();
  show('title');
  audio.startMusic('title');
});

// ---------- mute ----------
const muteBtn = $('#btn-mute');
function paintMute() {
  muteBtn.classList.toggle('muted', audio.muted);
}
muteBtn.addEventListener('click', () => {
  audio.toggleMuted();
  audio.resume();
  paintMute();
});
window.addEventListener('keydown', (e) => {
  const key = e.key.toLowerCase();
  if (key === 'm') { audio.toggleMuted(); paintMute(); }
  if (key === 'c' && race && mode === 'race') {
    const cameraName = race.cycleCamera();
    toast(cameraName);
    $('#btn-camera small').textContent = cameraName.replace(' CHASE', '');
  }
});

$('#btn-camera').addEventListener('click', () => {
  if (!race || mode !== 'race') return;
  const cameraName = race.cycleCamera();
  toast(cameraName);
  $('#btn-camera small').textContent = cameraName.replace(' CHASE', '');
});
paintMute();

function detachFirstGesture() {
  window.removeEventListener('pointerdown', firstGesture);
  window.removeEventListener('keydown', firstGesture);
}

function firstGesture(event) {
  // Tapping mute must not create a one-frame music blip before the click
  // handler silences it. Keep listening for the next actual start gesture.
  if ((event.type === 'pointerdown' && event.target?.closest?.('#btn-mute'))
    || (event.type === 'keydown' && event.key?.toLowerCase() === 'm')) return;
  audio.resume();
  if (musicStarted || mode !== 'title') return;
  const started = audio.startMusic('title');
  if (started && typeof started.then === 'function') {
    started.then((playing) => {
      if (!playing) return;
      musicStarted = true;
      detachFirstGesture();
    });
  } else if (started) {
    musicStarted = true;
    detachFirstGesture();
  }
}
window.addEventListener('pointerdown', firstGesture);
window.addEventListener('keydown', firstGesture);

// ---------- HUD ----------
const hudTime = $('#hud-time');
const hudCp = $('#hud-cp');
const hudPos = $('#hud-pos');
const hudMph = $('#hud-mph');
const hudBeans = $('#hud-beans');
const hudProgress = $('#hud-progress-fill');
const hudLocation = $('#hud-location');
const dangerAlert = $('#danger-alert');

function paintHUD() {
  const h = race.hud();
  const clockSecond = Math.ceil(h.timeLeft);
  hudTime.textContent = clockSecond;
  hudTime.classList.toggle('low', h.timeLeft < 8);
  hudCp.textContent = `CP ${h.cp}/${h.cps}`;
  hudPos.textContent = `${PLACE_NAMES[h.place - 1]}/${h.total}`;
  hudMph.textContent = `${h.mph} MPH`;
  hudBeans.textContent = `\u00d7${h.beans}`;
  hudProgress.style.width = `${(h.progress * 100).toFixed(1)}%`;
  $('#btn-gas').classList.toggle('active', h.wheelie);
  hudLocation.innerHTML = `${h.stage} <small>${h.zone}</small>`;
  dangerAlert.classList.toggle('show', h.danger);
  document.body.classList.toggle('comeback', h.comeback);

  if (clockSecond <= 8 && clockSecond !== lastClockBeep) {
    lastClockBeep = clockSecond;
    audio.beep(clockSecond <= 3 ? 880 : 660, 0.12, 'square', 0.24);
  } else if (clockSecond > 8) {
    lastClockBeep = -1;
  }
}

// ---------- main loop ----------
let last = performance.now();
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  fpsAcc += dt; fpsN++; fpsT += dt;
  if (fpsT > 2 && fpsN > 10) {
    const avg = fpsN / fpsAcc;
    if (document.visibilityState === 'visible' && avg < 45 && renderScale > minRenderScale) {
      renderScale = Math.max(minRenderScale, renderScale - 0.08);
      resize();
    } else if (document.visibilityState === 'visible' && avg > 57 && renderScale < maxRenderScale) {
      renderScale = Math.min(maxRenderScale, renderScale + 0.05);
      resize();
    }
    fpsAcc = 0; fpsN = 0; fpsT = 0;
  }

  input.update(dt);
  if (race) {
    race.update(dt, input);
    if (mode === 'race') paintHUD();
    renderer.render(race.scene, race.camera);
  }
}

// ---------- boot ----------
startDemo();
resize();
show('title');
requestAnimationFrame(loop);

// Debug handle for deterministic acceptance tests and evidence capture.
window.__cb = {
  get race() { return race; },
  get webglAvailable() { return webglAvailable; },
  get audio() { return audio.status(); },
  input,
  startRace: (r, s) => { chosenRacer = r; chosenStage = s; startRace(); },
  scenario(name) {
    if (!race || mode !== 'race') return false;
    const p = race.player;
    race.state = 'race';
    if (name === 'wheelie') {
      const truck = race.traffic.find((v) => v.wrongWay);
      p.speed = 54; p.x = 6; p.wheelieT = 1.4; p.wheelieFullT = 1.9;
      truck.s = p.s + 20; truck.x = 6; truck.clearedBy = 0; truck.crashT = 0;
      return true;
    }
    if (name === 'pileup') {
      const truck = race.traffic.find((v) => v.wrongWay);
      p.speed = 55; p.x = 6; p.wheelieT = 0; p.invuln = 0;
      truck.s = p.s + 1; truck.x = 6; truck.clearedBy = 0; truck.crashT = 0;
      return true;
    }
    if (name === 'checkpoint') {
      const cp = race.track.checkpoints[race.nextCheckpoint];
      if (cp === undefined) return false;
      p.s = cp - 12; p.speed = 58; race.timeLeft = 3.2;
      return true;
    }
    return false;
  },
};
