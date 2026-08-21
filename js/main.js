// CRUIS'N BEANS — screen flow, renderer, HUD.
import * as THREE from '../vendor/three.module.js';
import { RACERS, RIVALS, STAGES } from './data.js?v=world-pass-2';
import { Race } from './game.js?v=world-pass-2';
import { Input } from './input.js?v=world-pass-2';
import { audio } from './audio.js?v=world-pass-2';
import { rivalRearTexture } from './tex.js?v=world-pass-2';

const $ = (sel) => document.querySelector(sel);

const canvas = $('#game');
const renderer = new THREE.WebGLRenderer({
  canvas, antialias: false, powerPreference: 'high-performance', stencil: false,
});
renderer.setPixelRatio(1);

const input = new Input();
input.bindSteerSurface($('#steer-surface'));
input.bindHoldButton($('#btn-brake'), 'brake');
input.bindGasPad($('#btn-gas'));

let renderScale = 0.72;
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
const artUrls = [...new Set(RACERS.flatMap((racer) => [
  racer.portrait, racer.carSprite, racer.rearSprite, racer.frontSprite,
]))];

function loadArt(url) {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = async () => {
      try { await image.decode(); } catch (error) { /* already loaded */ }
      resolve(true);
    };
    image.onerror = () => resolve(false);
    image.src = url;
  });
}

Promise.all(artUrls.map(loadArt)).then((loaded) => {
  startBtn.disabled = false;
  startBtn.textContent = loaded.every(Boolean) ? 'PRESS START' : 'PRESS START — ART RETRYING';
});

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
      <div class="card-tag small">POINT TO POINT \u2022 BEAT THE CLOCK</div>`;
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

function startRace() {
  if (race) race.dispose();
  audio.stopMusic();
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
    $('#hint').classList.remove('show');
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
  audio.stopMusic();
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
    : `TIME ${fmtTime(data.raceTime)} \u2022 STUNTS ${data.stunts} \u2022 BEANS ${data.beans}`;
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
      <span class="rtime">${r.finished ? fmtTime(r.time) : (data.timeUp && r.isPlayer ? 'DNF' : fmtTime(r.time))}</span>`;
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
  audio.resume();
  audio.toggleMuted();
  paintMute();
});
window.addEventListener('keydown', (e) => {
  if (e.key.toLowerCase() === 'm') { audio.toggleMuted(); paintMute(); }
});
paintMute();

function firstGesture() {
  audio.resume();
  if (!musicStarted && mode === 'title') {
    musicStarted = true;
    audio.startMusic('title');
  }
  window.removeEventListener('pointerdown', firstGesture);
  window.removeEventListener('keydown', firstGesture);
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
    if (avg < 45 && renderScale > 0.5) { renderScale -= 0.1; resize(); }
    else if (avg > 57 && renderScale < 0.72) { renderScale += 0.05; resize(); }
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

// Debug handle for automated tests.
window.__cb = { get race() { return race; }, input, startRace: (r, s) => { chosenRacer = r; chosenStage = s; startRace(); } };
