import assert from 'node:assert/strict';

let seed = 0x51a17;
Math.random = () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
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
globalThis.localStorage = { getItem: () => '1', setItem() {} };

const { Race } = await import('../js/game.js');
const { RACERS, STAGES } = await import('../js/data.js');

const dt = 1 / 60;
const rows = [];

for (const stage of STAGES) {
  for (const racer of RACERS) {
    let race;
    const checkpointMargins = [];
    let finish = null;
    race = new Race({
      trackDef: { ...stage },
      racers: [racer],
      playerIndex: 0,
      onEvent: (kind, data) => {
        if (kind === 'checkpoint') checkpointMargins.push(race.timeLeft - data.bonus);
        if (kind === 'finish') finish = data;
      },
    });
    race.state = 'race';
    race.traffic = [];
    race.animals = [];
    const input = {
      steer: 0,
      brakeActive: false,
      consumeStunts: () => ({ wheelie: false, twoWheel: 0 }),
    };

    for (let frame = 0; frame < 60 * 240 && race.state !== 'over'; frame++) {
      const car = race.player;
      car.frameStartS = car.s;
      race.raceTime += dt;
      race.timeLeft -= dt;
      const expired = race.timeLeft <= 0;
      if (expired) race.timeLeft = 0;

      const curv = race.track.curvatureAt(car.s);
      const denom = car.racer.steer * (34 + car.speed * 0.55);
      const curveHold = denom > 0
        ? curv * car.speed * car.speed * 1.15 * (2 - car.racer.stats.grip) / denom
        : 0;
      input.steer = Math.max(-1, Math.min(1,
        curveHold + (6 - car.x) * 0.12 - car.lateralVel * 0.08));

      race.updatePlayer(car, dt, input);
      race.airPhysics(car, dt);
      race.checkProgress();
      race.checkFinishes(dt);
      if (expired && race.state === 'race' && race.timeLeft <= 0) race.endRace(true);
    }

    assert.ok(finish, `${stage.id}/${racer.id} emitted no result`);
    assert.equal(finish.timeUp, false,
      `${stage.id}/${racer.id} DNF at ${race.raceTime.toFixed(2)}s, CP ${race.nextCheckpoint}`);
    assert.equal(race.nextCheckpoint, race.track.checkpoints.length);
    assert.ok(race.timeLeft > 1,
      `${stage.id}/${racer.id} has only ${race.timeLeft.toFixed(2)}s at finish`);
    assert.ok(Math.min(...checkpointMargins) > 0,
      `${stage.id}/${racer.id} missed an early checkpoint split`);
    rows.push({
      stage: stage.id,
      racer: racer.id,
      raw: Number(finish.raceTime.toFixed(2)),
      remaining: Number(race.timeLeft.toFixed(2)),
      tightestCheckpoint: Number(Math.min(...checkpointMargins).toFixed(2)),
    });
    race.dispose();
  }
}

console.table(rows);
console.log('Named-racer splits: 12/12 clean main-road runs finish with positive checkpoint margins.');
