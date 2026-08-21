// CRUIS'N BEANS — screen flow, renderer, HUD.
import * as THREE from '../vendor/three.module.js';
import { RACERS, TRACKS } from './data.js';
import { Race } from './game.js';
import { Input } from './input.js';
import { audio } from './audio.js';

const $ = (sel) => document.querySelector(sel);

const canvas = $('#game');
const renderer = new THREE.WebGLRenderer({
  canvas, antialias: false, powerPreference: 'high-performance', stencil: false,
});
renderer.setPixelRatio(1);

const input = new Input();
input.bindSteerSurface($('#steer-surface'));
input.bindHoldButton($('#btn-fart'), 'fart');
input.bindHoldButton($('#btn-brake'), 'brake');

let renderScale = 0.72;
let race = null;          // current Race (demo or real)
let mode = 'title';       // title | racer | track | race | results
let chosenRacer = 0;
let chosenTrack = 0;
let fpsAcc = 0;
let fpsN = 0;
let fpsT = 0;
let hintShown = false;
let musicStarted = false;

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

function startDemo() {
  if (race) race.dispose();
  const def = TRACKS[(Math.random() * TRACKS.length) | 0];
  race = new Race({ trackDef: def, racers: RACERS, playerIndex: 0, demo: true, onEvent: () => {} });
  race.camera.aspect = window.innerWidth / window.innerHeight;
  race.camera.updateProjectionMatrix();
}

// ---------- title ----------
$('#btn-start').addEventListener('click', () => {
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
        <div><span>BNS</span><i style="width:${r.stats.beans * 100}%"></i></div>
      </div>
      <div class="card-tag">${r.tagline}</div>`;
    card.addEventListener('click', () => {
      chosenRacer = i;
      audio.beep(880, 0.12, 'square', 0.25);
      buildTrackCards();
      show('track');
    });
    wrap.appendChild(card);
  });
}
$('#btn-racer-back').addEventListener('click', () => show('title'));

// ---------- track select ----------
function buildTrackCards() {
  const wrap = $('#track-cards');
  if (wrap.childElementCount) return;
  TRACKS.forEach((t, i) => {
    const card = document.createElement('button');
    card.className = `card track-card track-${t.id}`;
    card.innerHTML = `
      <div class="card-name">${t.name}</div>
      <div class="track-art track-art-${t.id}"></div>
      <div class="card-tag">${t.blurb}</div>
      <div class="card-tag small">${t.laps} LAPS \u2022 ~3 MIN</div>`;
    card.addEventListener('click', () => {
      chosenTrack = i;
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
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 1600);
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
  const order = [chosenRacer, ...RACERS.map((_, i) => i).filter((i) => i !== chosenRacer)];
  const racers = order.map((i) => RACERS[i]);
  // ?laps=1 shortens races (handy for testing).
  const lapsOverride = parseInt(new URLSearchParams(location.search).get('laps'), 10);
  const trackDef = lapsOverride > 0
    ? { ...TRACKS[chosenTrack], laps: lapsOverride }
    : TRACKS[chosenTrack];
  race = new Race({
    trackDef,
    racers,
    playerIndex: 0,
    onEvent: onRaceEvent,
  });
  race.camera.aspect = window.innerWidth / window.innerHeight;
  race.camera.updateProjectionMatrix();
  show('race');
  audio.startEngine();

  // Fat first-race hint.
  if (!hintShown) {
    hintShown = true;
    $('#hint').classList.add('show');
    setTimeout(() => $('#hint').classList.remove('show'), 6000);
  }

  setTimeout(() => race && race.startCountdown(), 800);
}

function onRaceEvent(kind, data) {
  if (kind === 'count') {
    showCount(String(data));
    audio.countdownBeep(false);
  } else if (kind === 'go') {
    showCount('GO!!', 'go');
    audio.countdownBeep(true);
    audio.startMusic('race');
    $('#hint').classList.remove('show');
  } else if (kind === 'toast') {
    toast(data);
  } else if (kind === 'finish') {
    setTimeout(() => showResults(data), 900);
  }
}

// Dismiss hint on first input.
input.onFirstInput = () => $('#hint').classList.remove('show');

// ---------- results ----------
function fmtTime(t) {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, '0')}`;
}
const PLACE_NAMES = ['1st', '2nd', '3rd', '4th'];

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
    ? 'THE BEANS WEREN\u2019T ENOUGH...'
    : `TIME ${fmtTime(data.raceTime)}  \u2022  BEANS USED ${data.beansUsed}`;
  const list = $('#results-list');
  list.innerHTML = '';
  data.results.forEach((r, i) => {
    const row = document.createElement('div');
    row.className = `result-row ${r.isPlayer ? 'me' : ''}`;
    row.innerHTML = `
      <span class="rpos">${PLACE_NAMES[i]}</span>
      <img src="${r.racer.portrait}" alt="${r.racer.name}">
      <span class="rname">${r.racer.name}</span>
      <span class="rtime">${r.finished || !data.timeUp ? fmtTime(r.time) : 'DNF'}</span>`;
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

// Unlock audio + start title music on first gesture.
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
const hudLap = $('#hud-lap');
const hudPos = $('#hud-pos');
const hudMph = $('#hud-mph');
const beanCells = [];
(() => {
  const meter = $('#bean-meter');
  for (let i = 0; i < 8; i++) {
    const b = document.createElement('span');
    meter.appendChild(b);
    beanCells.push(b);
  }
})();

function paintHUD() {
  const h = race.hud();
  hudTime.textContent = Math.ceil(h.timeLeft);
  hudTime.classList.toggle('low', h.timeLeft < 10);
  hudLap.textContent = `LAP ${h.lap}/${h.laps}`;
  hudPos.textContent = PLACE_NAMES[h.place - 1];
  hudMph.textContent = `${h.mph} MPH`;
  beanCells.forEach((b, i) => b.classList.toggle('full', i < h.beans));
  $('#btn-fart').classList.toggle('active', h.turbo);
  $('#btn-fart').classList.toggle('empty', h.beans === 0);
}

// ---------- main loop ----------
let last = performance.now();
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  // Adaptive resolution for steady 60 fps on phones.
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
