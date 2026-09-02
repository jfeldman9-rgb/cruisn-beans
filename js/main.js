// CRUIS'N BEANS — screen flow, renderer, HUD.
import * as THREE from '../vendor/three.module.js';
import { RACERS, RIVALS, STAGES } from './data.js?v=next-level-1';
import { Race } from './game.js?v=next-level-1';
import { Input } from './input.js?v=next-level-1';
import { audio } from './audio.js?v=next-level-1';
import { rivalRearTexture } from './tex.js?v=next-level-1';
import { Records, defaultInitials, formatTime as fmtTime } from './records.js?v=next-level-1';
import {
  createTour, currentStageId, isFinalStage, recordLeg, standings as tourStandings,
  playerStanding, advance as advanceTour,
} from './tour.js?v=next-level-1';

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
const renderPixelRatio = Math.min(window.devicePixelRatio || 1, desktopQuality ? 1.5 : 1.25);
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

const maxRenderScale = desktopQuality ? 1 : 0.95;
const minRenderScale = desktopQuality ? 0.78 : 0.82;
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
let tour = null;

// Local cabinet records. localStorage can throw in private/sandboxed
// contexts; the Records class falls back to memory for the session.
const records = new Records((() => {
  try {
    const probe = '__cb_probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch (error) {
    return null;
  }
})());

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
function bestLine(stageId) {
  const best = records.best(stageId);
  return best
    ? `BEST <b>${fmtTime(best.time)}</b> ${best.initials}`
    : 'NO RECORD YET \u2022 SET ONE';
}

function paintStageBests() {
  STAGES.forEach((t) => {
    const el = $(`#best-${t.id}`);
    if (el) el.innerHTML = bestLine(t.id);
  });
  const tb = records.tourBest();
  $('#tour-best').textContent = tb
    ? `CHAMPION ${tb.initials} \u2022 ${tb.points} PTS \u2022 ${fmtTime(tb.time)}`
    : 'NO CHAMPION YET';
}

function paintTitleRecords() {
  const el = $('#title-records');
  if (!el) return;
  const parts = STAGES.map((t) => {
    const best = records.best(t.id);
    return `${t.name.split(' ')[0]} ${best ? `${fmtTime(best.time)} ${best.initials}` : '\u2014'}`;
  });
  const tb = records.tourBest();
  parts.push(`TOUR ${tb ? `${tb.points} PTS ${tb.initials}` : '\u2014'}`);
  el.textContent = `RECORDS \u2022 ${parts.join(' \u2022 ')}`;
}

function buildStageCards() {
  const wrap = $('#track-cards');
  if (wrap.childElementCount) {
    paintStageBests();
    return;
  }
  STAGES.forEach((t, i) => {
    const card = document.createElement('button');
    card.className = `card track-card track-${t.id}`;
    card.innerHTML = `
      <div class="card-name">${t.name}</div>
      <div class="track-art track-art-${t.id}"></div>
      <div class="card-tag">${t.blurb}</div>
      <div class="card-tag small">POINT TO POINT \u2022 7-CAR FIELD</div>
      <div class="card-tag target">TARGET ${t.targetTime}</div>
      <div class="card-tag best" id="best-${t.id}"></div>`;
    card.addEventListener('click', () => {
      tour = null;
      chosenStage = i;
      audio.beep(880, 0.12, 'square', 0.25);
      startRace();
    });
    wrap.appendChild(card);
  });
  paintStageBests();
}
$('#btn-track-back').addEventListener('click', () => show('racer'));

$('#btn-tour').addEventListener('click', () => {
  tour = createTour(STAGES.map((t) => t.id));
  chosenStage = 0;
  audio.beep(1040, 0.14, 'square', 0.25);
  startRace();
});

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
  if (tour) chosenStage = Math.max(0, STAGES.findIndex((t) => t.id === currentStageId(tour)));
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

// Phone haptics for the beats a cabinet would sell with a force-feedback
// wheel. No-op where vibrate() is unavailable (iOS Safari, desktop).
const HAPTICS = {
  wheelie: 18,
  leapfrog: [20, 30, 45],
  checkpoint: [30, 40, 30],
  stunt: [15, 25, 15, 25, 40],
  bump: 45,
  crash: [90, 50, 120],
  go: 60,
  finish: [40, 40, 40, 40, 140],
  win: [40, 40, 40, 40, 60, 40, 220],
  timeup: [200, 80, 200],
};
function buzz(kind) {
  const pattern = HAPTICS[kind];
  if (!pattern || typeof navigator.vibrate !== 'function' || audio.muted) return;
  try { navigator.vibrate(pattern); } catch (error) { /* unsupported */ }
}

const confettiEl = $('#confetti');
function confetti(count = 48) {
  const colors = ['#ffd23d', '#e8262d', '#2fae3f', '#ff5aa2', '#4f8fe0', '#fff'];
  confettiEl.innerHTML = '';
  for (let i = 0; i < count; i++) {
    const piece = document.createElement('i');
    piece.style.left = `${Math.random() * 100}%`;
    piece.style.background = colors[i % colors.length];
    piece.style.animationDelay = `${Math.random() * 1.2}s`;
    piece.style.animationDuration = `${2.2 + Math.random() * 1.4}s`;
    piece.style.transform = `rotate(${Math.random() * 360}deg)`;
    confettiEl.appendChild(piece);
  }
  setTimeout(() => { confettiEl.innerHTML = ''; }, 4200);
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
    buzz('go');
    $('#hint').classList.remove('show');
  } else if (kind === 'checkpoint') {
    showCheckpoint(data);
  } else if (kind === 'toast') {
    toast(data);
  } else if (kind === 'haptic') {
    buzz(data);
  } else if (kind === 'rivalPass') {
    showRivalPass(data);
  } else if (kind === 'finish') {
    // Let the finish crane play before the standings on a real finish.
    setTimeout(() => showResults(data), data.timeUp ? 900 : 2300);
  }
}

input.onFirstInput = () => $('#hint').classList.remove('show');

// ---------- initials entry (arcade record board) ----------
const PLACE_NAMES = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th'];
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const resultsScreen = $('#screen-results');
const slotEls = [...document.querySelectorAll('#initials-entry .slot')];
let initials = ['A', 'A', 'A'];
let activeSlot = 0;
let initialsResolve = null;

function paintInitials() {
  slotEls.forEach((slot, i) => {
    slot.classList.toggle('active', i === activeSlot);
    slot.querySelector('.slot-letter').textContent = initials[i];
  });
}

function cycleLetter(slot, dir) {
  const idx = ALPHABET.indexOf(initials[slot]);
  initials[slot] = ALPHABET[(idx + dir + ALPHABET.length) % ALPHABET.length];
  activeSlot = slot;
  audio.beep(dir > 0 ? 760 : 640, 0.05, 'square', 0.18);
  paintInitials();
}

function enterInitials(rank, seed) {
  initials = seed.split('');
  activeSlot = 0;
  $('#initials-rank').textContent = `#${rank}`;
  resultsScreen.classList.add('entering');
  paintInitials();
  return new Promise((resolve) => { initialsResolve = resolve; });
}

function finishInitials() {
  if (!initialsResolve) return;
  resultsScreen.classList.remove('entering');
  const done = initialsResolve;
  initialsResolve = null;
  audio.beep(990, 0.14, 'square', 0.25);
  done(initials.join(''));
}

slotEls.forEach((slot, i) => {
  slot.querySelector('.slot-up').addEventListener('click', () => cycleLetter(i, 1));
  slot.querySelector('.slot-down').addEventListener('click', () => cycleLetter(i, -1));
  slot.querySelector('.slot-letter').addEventListener('click', () => { activeSlot = i; paintInitials(); });
});
$('#btn-initials-ok').addEventListener('click', finishInitials);
window.addEventListener('keydown', (e) => {
  if (!initialsResolve) return;
  const key = e.key;
  if (key.length === 1 && ALPHABET.includes(key.toUpperCase())) {
    initials[activeSlot] = key.toUpperCase();
    activeSlot = Math.min(2, activeSlot + 1);
    audio.beep(760, 0.05, 'square', 0.18);
  } else if (key === 'Backspace' || key === 'ArrowLeft') {
    activeSlot = Math.max(0, activeSlot - 1);
  } else if (key === 'ArrowRight') {
    activeSlot = Math.min(2, activeSlot + 1);
  } else if (key === 'ArrowUp') {
    cycleLetter(activeSlot, 1);
  } else if (key === 'ArrowDown') {
    cycleLetter(activeSlot, -1);
  } else if (key === 'Enter' || key === ' ') {
    finishInitials();
  } else {
    return;
  }
  e.preventDefault();
  e.stopImmediatePropagation();
  paintInitials();
}, true);

// ---------- results ----------
function resultRow(place, racer, isPlayer, right, extraClass = '', pts = null) {
  const row = document.createElement('div');
  row.className = `result-row ${isPlayer ? 'me' : ''} ${extraClass}`;
  const img = racer.portrait || rivalPortrait(racer);
  row.innerHTML = `
    <span class="rpos">${PLACE_NAMES[place - 1]}</span>
    <img src="${img}" alt="${racer.name}">
    <span class="rname">${racer.name}</span>
    ${pts === null ? '' : `<span class="rpts">${pts}</span>`}
    <span class="rtime">${right}</span>`;
  return row;
}

function paintRecordsStrip(stageId, newRank) {
  const strip = $('#records-strip');
  const rows = records.list(stageId);
  if (!rows.length) {
    strip.innerHTML = 'STAGE RECORDS \u2022 NONE YET';
    return;
  }
  strip.innerHTML = `STAGE RECORDS \u2022 ${rows.map((r, i) => {
    const text = `${i + 1}. <b>${fmtTime(r.time)}</b> ${r.initials}`;
    return i + 1 === newRank ? `<span class="new">${text} NEW!</span>` : text;
  }).join(' \u2022 ')}`;
}

async function showResults(data) {
  audio.stopEngine();
  audio.startMusic('results');
  const stage = STAGES[chosenStage];
  const racer = RACERS[chosenRacer];
  const title = $('#results-title');
  const sub = $('#results-sub');
  const finaleGag = $('#finale-gag');
  const list = $('#results-list');
  const strip = $('#records-strip');
  const retryBtn = $('#btn-retry');
  list.innerHTML = '';
  strip.innerHTML = '';

  // World Tour bookkeeping.
  let finalLeg = false;
  let standing = null;
  if (tour) {
    if (data.timeUp) {
      tour.over = true;
    } else {
      recordLeg(tour, data.results, data.officialTime);
      finalLeg = isFinalStage(tour);
    }
    standing = playerStanding(tour);
  }

  const official = `OFFICIAL ${fmtTime(data.officialTime)}${data.stuntCredit > 0 ? ` \u2022 STUNT CUT -${data.stuntCredit.toFixed(1)}s` : ''} \u2022 STUNTS ${data.stunts} \u2022 BEANS ${data.beans}`;
  if (data.timeUp) {
    title.textContent = 'TIME UP!';
    title.className = 'lose';
    sub.textContent = tour ? 'TOUR OVER \u2022 THE ROAD WON' : 'THE ROAD WON THIS TIME...';
    finaleGag.textContent = 'THE BEAN COUNCIL DEMANDS A REMATCH.';
  } else if (tour && finalLeg) {
    const champion = standing && standing.place === 1;
    title.textContent = champion ? 'WORLD CHAMPION!' : `TOUR ${PLACE_NAMES[standing.place - 1]}!`;
    title.className = champion ? 'win' : '';
    sub.textContent = `TOUR TOTAL ${standing.points} PTS \u2022 ${fmtTime(tour.playerTime)} \u2022 FINAL STAGE ${PLACE_NAMES[data.place - 1]}`;
    finaleGag.textContent = champion
      ? 'THREE COUNTRIES. ONE CAN OF BEANS. LEGEND.'
      : 'THE WORLD HAS BEEN CRUISED. MOSTLY.';
  } else {
    title.textContent = `${PLACE_NAMES[data.place - 1]} PLACE!`;
    title.className = data.place === 1 ? 'win' : '';
    sub.textContent = tour && standing
      ? `${official} \u2022 TOUR ${PLACE_NAMES[standing.place - 1]} \u2022 ${standing.points} PTS`
      : official;
    if (racer.id === 'elon') finaleGag.textContent = 'ELON MISSED THE MOON EXIT. BEANS DELIVERED.';
    else if (racer.id === 'lance') finaleGag.textContent = 'LANCE BROUGHT THE VAN HOME IN STYLE.';
    else finaleGag.textContent = data.place === 1 ? 'THE BEAN COUNCIL APPROVES.' : 'POSTCARD ACQUIRED. DIGNITY OPTIONAL.';
  }
  retryBtn.textContent = tour
    ? (data.timeUp || finalLeg ? 'NEW TOUR' : 'NEXT STAGE \u25B6')
    : 'RETRY';
  show('results');
  if (!data.timeUp && (data.place === 1 || (tour && finalLeg && standing && standing.place === 1))) {
    confetti(tour && finalLeg ? 90 : 48);
  }

  // Record boards: single stages keep a top-3 per stage, the tour keeps one champion.
  let newRank = 0;
  if (!tour && !data.timeUp) {
    newRank = records.rankFor(stage.id, data.officialTime);
    if (newRank) {
      audio.checkpoint();
      audio.announce('New record! Enter your initials!');
      const ini = await enterInitials(newRank, defaultInitials(racer.name));
      records.submit(stage.id, { time: data.officialTime, initials: ini, racerId: racer.id });
    }
  } else if (tour && finalLeg && standing && records.tourQualifies(standing.points, tour.playerTime)) {
    audio.checkpoint();
    audio.announce('New world tour champion! Enter your initials!');
    const ini = await enterInitials(1, defaultInitials(racer.name));
    records.submitTour({ points: standing.points, time: tour.playerTime, initials: ini, racerId: racer.id });
  }

  if (tour && (finalLeg || data.timeUp)) {
    // Final tour standings by points.
    tourStandings(tour).forEach((row, i) => {
      list.appendChild(resultRow(i + 1, row.racer, row.isPlayer, `${row.points} PTS`, '', row.wins ? `${row.wins}W` : null));
    });
    const tb = records.tourBest();
    strip.innerHTML = tb
      ? `TOUR CHAMPION \u2022 <b>${tb.initials}</b> ${tb.points} PTS \u2022 ${fmtTime(tb.time)}`
      : 'TOUR CHAMPION \u2022 NONE YET';
  } else {
    data.results.forEach((r, i) => {
      const pts = tour ? `+${[10, 8, 6, 5, 4, 3, 2][i] || 1}` : null;
      const isRecord = r.isPlayer && newRank > 0;
      list.appendChild(resultRow(i + 1, r.racer, r.isPlayer, r.finished ? fmtTime(r.time) : 'DNF', isRecord ? 'record' : '', pts));
    });
    if (tour && standing) {
      strip.innerHTML = `TOUR STANDINGS \u2022 YOU ${PLACE_NAMES[standing.place - 1]} WITH <b>${standing.points} PTS</b> \u2022 STAGE ${tour.index + 1}/${tour.stageIds.length} DONE`;
    } else {
      paintRecordsStrip(stage.id, newRank);
    }
  }
  paintStageBests();
  paintTitleRecords();
}

$('#btn-retry').addEventListener('click', () => {
  audio.beep(700, 0.1, 'square', 0.25);
  if (tour) {
    if (tour.over || isFinalStage(tour)) {
      tour = createTour(STAGES.map((t) => t.id));
    } else {
      advanceTour(tour);
    }
  }
  startRace();
});
$('#btn-title').addEventListener('click', () => {
  audio.beep(500, 0.1, 'square', 0.25);
  tour = null;
  startDemo();
  show('title');
  paintTitleRecords();
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
const speedo = $('#speedo');
const speedoNeedle = $('#speedo-needle');
const SPEEDO_MAX_MPH = 170;
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
  speedoNeedle.style.transform = `rotate(${-90 + 180 * Math.min(1, h.mph / SPEEDO_MAX_MPH)}deg)`;
  speedo.classList.toggle('wheelie', h.wheelie);
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
paintTitleRecords();
requestAnimationFrame(loop);

// Debug handle for deterministic acceptance tests and evidence capture.
window.__cb = {
  get race() { return race; },
  get webglAvailable() { return webglAvailable; },
  get audio() { return audio.status(); },
  get tour() { return tour; },
  get mode() { return mode; },
  records,
  input,
  startRace: (r, s) => { tour = null; chosenRacer = r; chosenStage = s; startRace(); },
  startTour: (r) => { chosenRacer = r; $('#btn-tour').click(); },
  finishInitials,
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
