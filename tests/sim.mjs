// Headless deterministic race simulation. This validates gameplay state without WebGL.
let seed = 0x5eed1234;
Math.random = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 0x100000000;
};

function fakeContext() {
  const gradient = { addColorStop() {} };
  return new Proxy({}, {
    get(target, prop) {
      if (prop in target) return target[prop];
      if (prop === 'createLinearGradient' || prop === 'createRadialGradient') return () => gradient;
      if (prop === 'measureText') return () => ({ width: 10 });
      return () => {};
    },
    set(target, prop, value) { target[prop] = value; return true; },
  });
}

function fakeCanvas() {
  const context = fakeContext();
  return { width: 1, height: 1, style: {}, getContext: () => context };
}

globalThis.document = {
  createElement: () => fakeCanvas(),
  createElementNS: () => fakeCanvas(),
};
globalThis.window = {};
globalThis.localStorage = { getItem: () => null, setItem() {} };

const { Race } = await import('../js/game.js');
const { STAGES } = await import('../js/data.js');

const testRacers = Array.from({ length: 7 }, (_, i) => ({
  id: `test-${i}`,
  name: `TEST ${i + 1}`,
  color: ['#d33', '#eee', '#964', '#bbb', '#d63', '#e5a', '#37c'][i],
  spriteWidth: i === 2 ? 6 : 5.4,
  stats: { speed: 0.9, grip: 0.75, wheelie: 0.8 },
  topSpeed: 64 - (i % 4) * 1.5,
  accel: 23,
  steer: 1,
  aiSkill: 0.9 + (i % 3) * 0.02,
}));

const events = [];
const stageIndex = Math.max(0, Math.min(STAGES.length - 1, Number(process.argv[2]) || 0));
const race = new Race({
  trackDef: { ...STAGES[stageIndex] },
  racers: testRacers,
  playerIndex: 0,
  onEvent: (kind, data) => events.push({
    kind, data, t: race.raceTime, s: race.player ? race.player.s : 0,
    clock: race.timeLeft,
  }),
});
race.state = 'race';

const input = {
  steer: 0,
  brakeActive: false,
  consumeStunts: () => {
    const car = race.player;
    if (!car.grounded && !car.flipping
      && (car.airSource === 'ramp' || car.airSource === 'crest') && car.airTime > 0.08) {
      return { wheelie: true, twoWheel: 0 };
    }
    const leapfrogThreat = race.traffic.some((v) => v.wrongWay
      && v.s - car.s > 18 && v.s - car.s < 135
      && Math.abs(v.x - car.x) < 5.2);
    if (leapfrogThreat && car.grounded && car.wheelieCooldown <= 0 && car.speed > 18) {
      return { wheelie: true, twoWheel: 0 };
    }
    return { wheelie: false, twoWheel: 0 };
  },
};

const dt = 1 / 60;
for (let frame = 0; frame < 60 * 360 && race.state !== 'over'; frame++) {
  const car = race.player;
  let targetX = 6;
  const shortcut = race.track.shortcut;
  if (car.mode === 'shortcut') {
    targetX = 0;
  } else if (car.s > shortcut.s1 - 150 && car.s < shortcut.s1 + 20) {
    targetX = shortcut.side * 10.5;
  } else {
    const blocker = race.traffic
      .filter((v) => !v.oncoming && v.s > car.s && v.s - car.s < 165)
      .sort((a, b) => a.s - b.s)[0];
    if (blocker && Math.abs(blocker.x - targetX) < 4) targetX = 10.5;
  }
  const curv = race.track.curvatureAt(car.s);
  const denom = car.racer.steer * (34 + car.speed * 0.55);
  const curveHold = denom > 0
    ? curv * car.speed * car.speed * 1.15 * (2 - car.racer.stats.grip) / denom
    : 0;
  input.steer = Math.max(-1, Math.min(1,
    curveHold + (targetX - (car.mode === 'shortcut' ? (car.sx || 0) : car.x)) * 0.12
      - car.lateralVel * 0.08));
  race.update(dt, input);
}

const finish = events.find((e) => e.kind === 'finish');
console.log(JSON.stringify({
  stage: STAGES[stageIndex].name,
  trackLength: race.track.length,
  state: race.state,
  frameRaceTime: race.raceTime,
  rawFinishTime: finish?.data?.raceTime ?? null,
  timeLeft: race.timeLeft,
  playerS: race.player.s,
  place: race.positionOf(race.player),
  checkpoints: race.nextCheckpoint,
  beans: race.player.beansGot,
  stunts: race.player.stuntsLanded,
  shortcutUsed: events.some((event) => event.kind === 'toast' && String(event.data).startsWith('SHORTCUT!')),
  leapfrogs: events.filter((event) => event.kind === 'toast' && String(event.data).startsWith('LEAPFROG!')).length,
  pileups: events.filter((event) => event.kind === 'toast' && String(event.data).startsWith('CRASH PILE!')).length,
  pileupMoments: events.filter((event) => event.kind === 'toast' && String(event.data).startsWith('CRASH PILE!'))
    .map((event) => ({ t: Number(event.t.toFixed(2)), s: Math.round(event.s) })),
  checkpointTimes: events.filter((event) => event.kind === 'checkpoint')
    .map((event) => Number(event.t.toFixed(3))),
  checkpointClockAfterBonus: events.filter((event) => event.kind === 'checkpoint')
    .map((event) => Number(event.clock.toFixed(3))),
  finish: finish?.data,
  eventCounts: events.reduce((out, event) => {
    out[event.kind] = (out[event.kind] || 0) + 1;
    return out;
  }, {}),
}, null, 2));
