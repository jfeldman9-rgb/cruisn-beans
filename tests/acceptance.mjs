import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';

let seed = 0xc0ffee;
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

const racers = Array.from({ length: 7 }, (_, i) => ({
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

function makeRace(stageIndex = 0) {
  const events = [];
  const race = new Race({
    trackDef: { ...STAGES[stageIndex] },
    racers,
    playerIndex: 0,
    onEvent: (kind, data) => events.push({ kind, data }),
  });
  race.state = 'race';
  race.timeLeft = 300;
  return { race, events };
}

function close(actual, expected, epsilon = 0.05) {
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} != ${expected}`);
}

let cameraScreenShare = 0;

// 1. Three open, point-to-point stages with exact checkpoint topology.
const expectedLengths = [8899.90, 9399.93, 8199.92];
const expectedCheckpoints = [
  [1250, 2500, 3750, 5000, 6250, 7500],
  [1300, 2600, 3900, 5200, 6500, 7800],
  [1200, 2400, 3600, 4800, 6000, 7200],
];
const expectedBudgets = [145, 156, 137];
for (let i = 0; i < STAGES.length; i++) {
  const { race } = makeRace(i);
  close(race.track.length, expectedLengths[i], 0.15);
  assert.equal(race.track.curve.closed, false);
  assert.deepEqual(race.track.checkpoints, expectedCheckpoints[i]);
  assert.ok(race.track.frames[0].pos.distanceTo(race.track.frames.at(-1).pos) > 1000);
  assert.equal(STAGES[i].startTime + race.track.checkpoints.length * STAGES[i].checkpointBonus, expectedBudgets[i]);
  assert.equal(race.track.branchCheckpoints.length, 1);
  assert.ok(race.track.crests.length >= 1);
}

// 2. Same-way traffic plus a deliberate, moving wrong-lane semi.
{
  const { race } = makeRace(0);
  const oncoming = race.traffic.filter((v) => v.oncoming);
  const sameWay = race.traffic.filter((v) => !v.oncoming);
  assert.equal(oncoming.length, STAGES[0].traffic.oncoming);
  assert.equal(sameWay.length, STAGES[0].traffic.same);
  const threats = oncoming.filter((v) => v.wrongWay);
  assert.equal(threats.length, 1);
  assert.equal(threats[0].kind, 'semi');
  const truck = threats[0];
  truck.s = race.player.s + 300;
  const before = truck.s;
  race.updateTraffic(0.25);
  close(truck.s, before - truck.cruiseSpeed * 0.25, 0.01);
  const playerLaneTraffic = race.traffic
    .filter((v) => Math.abs(v.x - 6) < 4.8)
    .sort((a, b) => a.s - b.s);
  for (let i = 1; i < playerLaneTraffic.length; i++) {
    assert.ok(playerLaneTraffic[i].s - playerLaneTraffic[i - 1].s > 100,
      'initial same-lane traffic must not spawn as a stacked wall');
  }
}

// 3. Wheelie leapfrog fires once and does not double-award generic big air.
{
  const { race } = makeRace(0);
  const p = race.player;
  const truck = race.traffic.find((v) => v.wrongWay);
  race.traffic = [truck];
  p.s = 1000; p.x = 6; p.speed = 55; p.grounded = true;
  p.wheelieT = 1; p.wheelieFullT = 1.9; p.yOff = 0; p.spinT = 0;
  truck.s = 1015; truck.x = 6; truck.speed = 28; truck.clearedBy = 0;
  const clock = race.timeLeft;
  race.trafficInteract(p, 1 / 60, true);
  assert.equal(p.grounded, false);
  assert.equal(p.vy, 15);
  assert.equal(p.airSource, 'leapfrog');
  assert.equal(p.spinT, 0);
  assert.equal(truck.clearedBy, p);
  assert.equal(race.timeLeft, clock + 1);
  const credited = race.timeLeft;
  race.trafficInteract(p, 1 / 60, true);
  assert.equal(race.timeLeft, credited);
  p.yOff = 0.01; p.vy = -2; p.airTime = 0.8;
  race.airPhysics(p, 0.02);
  assert.equal(race.timeLeft, credited);
}

// 4. A high-speed hit becomes a real blocked pile, then arms comeback boost.
{
  const { race } = makeRace(0);
  const p = race.player;
  const truck = race.traffic.find((v) => v.wrongWay);
  race.traffic = [truck];
  race.animals = [];
  race.track.ramps = [];
  p.s = 1000; p.x = 6; p.speed = 55; p.grounded = true; p.invuln = 0;
  const packLanes = [-10, -6, -2, 1, 9, 11];
  race.cars.filter((car) => !car.isPlayer).forEach((car, i) => {
    car.s = 994 - i * 3;
    car.x = packLanes[i];
    car.speed = 50;
    car.spinT = 0;
  });
  truck.s = 1001; truck.x = 6; truck.clearedBy = 0; truck.crashT = 0;
  race.trafficInteract(p, 1 / 60, true);
  assert.equal(p.spinT, 2.05);
  assert.equal(p.crashHold, 1.08);
  assert.equal(p.speed, 0);
  assert.equal(truck.crashT, 1.75);
  assert.equal(truck.speed, 0);
  const startS = p.s;
  const idle = { steer: 0, brakeActive: false, consumeStunts: () => ({ wheelie: false, twoWheel: 0 }) };
  for (let i = 0; i < 60; i++) race.update(1 / 60, idle);
  close(p.s, startS, 0.1);
  for (let i = 0; i < 70; i++) race.update(1 / 60, idle);
  assert.ok(p.recoveryT > 9);
  const passed = race.cars.filter((car) => !car.isPlayer && car.s > p.s);
  assert.ok(passed.length >= 2, JSON.stringify(race.cars.map((car) => ({ s: car.s, x: car.x, spin: car.spinT }))));
  const aheadAfterPile = passed.length;
  race.traffic = [];
  for (let i = 0; i < 600; i++) {
    const curv = race.track.curvatureAt(p.s);
    const denom = p.racer.steer * (34 + p.speed * 0.55);
    const curveHold = denom > 0
      ? curv * p.speed * p.speed * 1.15 * (2 - p.racer.stats.grip) / denom
      : 0;
    idle.steer = Math.max(-1, Math.min(1, curveHold + (6 - p.x) * 0.12 - p.lateralVel * 0.08));
    race.update(1 / 60, idle);
  }
  const stillAhead = race.cars.filter((car) => !car.isPlayer && car.s > p.s).length;
  assert.ok(aheadAfterPile - stillAhead >= 2, `${aheadAfterPile} ahead after pile; ${stillAhead} after comeback`);
}

// 5. Animals are physical for the player and the AI pack.
{
  const { race } = makeRace(1);
  const animal = race.animals.find((a) => !a.def.flies);
  const p = race.player;
  animal.group.visible = true; animal.hitT = 0; animal.s = p.s; animal.x = p.x; animal.y = 0;
  p.speed = 50; p.yOff = 0;
  race.animalInteract(p, true);
  assert.equal(animal.hitT, 1.4);
  close(p.speed, 50 * animal.def.cost, 0.001);

  const ai = race.cars[1];
  animal.group.visible = true; animal.hitT = 0; animal.s = ai.s; animal.x = ai.x; animal.y = 0;
  ai.speed = 45; ai.yOff = 0;
  race.animalInteract(ai, false);
  assert.equal(animal.hitT, 1.4);
  assert.ok(ai.speed < 45);
}

// 6. Every dirty branch is genuinely shorter and carries its own CP banner.
// Hawaii's jungle cut now leaves inland (the sea owns the right-hand side).
const expectedSavings = [378.7, 347.9, 429.5];
for (let i = 0; i < STAGES.length; i++) {
  const { race } = makeRace(i);
  const sc = race.track.shortcut;
  close(sc.savedDistance, expectedSavings[i], 2);
  assert.ok(sc.savedDistance > 300);
  const p = race.player;
  p.mode = 'road'; p.grounded = true; p.s = sc.s1; p.x = sc.side * 10;
  race.tryEnterShortcut(p);
  assert.equal(p.mode, 'shortcut');
  p.ss = sc.len - 0.1; p.speed = 60;
  race.advance(p, 1 / 60);
  assert.equal(p.mode, 'road');
  close(p.s, sc.s2, 0.01);
  assert.equal(race.track.branchCheckpoints.length, 1);
}

// 7. Landed flips add clock and shave the recorded result.
{
  const { race, events } = makeRace(0);
  const p = race.player;
  race.raceTime = 100; race.timeLeft = 10;
  p.grounded = false; p.flipping = true; p.flipAxis = 'x'; p.flipProg = Math.PI * 2;
  p.yOff = 0.01; p.vy = -2;
  race.airPhysics(p, 0.02);
  assert.equal(race.timeLeft, 13);
  assert.equal(race.stuntCredit, 3);
  race.nextCheckpoint = race.track.checkpoints.length;
  p.s = race.track.length - 7;
  race.checkProgress();
  p.frameStartS = p.s;
  race.checkFinishes(1 / 60);
  const finish = events.find((event) => event.kind === 'finish').data;
  assert.equal(finish.raceTime, 100);
  assert.equal(finish.officialTime, 97);
  assert.equal(finish.stuntCredit, 3);
  assert.equal(finish.results.find((result) => result.isPlayer).time, 97);
}

// 8. Finished cars freeze; honest results use finish time, never fake estimates.
{
  const { race, events } = makeRace(0);
  const [p, a, b] = race.cars;
  a.finished = true; a.finishTime = 88; a.s = race.track.length + 5;
  b.finished = true; b.finishTime = 92; b.s = race.track.length + 500;
  race.finishOrder.push(a, b);
  const frozenS = a.s;
  race.updateAI(a, 1, true);
  assert.equal(a.s, frozenS);
  race.raceTime = 100; race.nextCheckpoint = race.track.checkpoints.length;
  p.s = race.track.length - 7;
  race.checkProgress();
  p.frameStartS = p.s;
  race.checkFinishes(1 / 60);
  const finish = events.find((event) => event.kind === 'finish').data;
  assert.equal(finish.place, 3);
  assert.deepEqual(finish.results.slice(0, 3).map((r) => r.time), [88, 92, 100]);
  assert.deepEqual(finish.results.slice(0, 3).map((r) => r.racer.id), [a.racer.id, b.racer.id, p.racer.id]);
  finish.results.filter((r) => !r.finished).forEach((r) => assert.equal(r.time, null));
}

// 9. Default camera is the cabinet chase: low, close, wide, nearly level, and
//    it frames every production car large without losing the road ahead.
{
  const { race } = makeRace(0);
  const p = race.player;
  p.s = 1000; p.x = 6; p.speed = 60; p.lean = 0.3;
  race.updateCamera(1);
  const carPos = p.worldPos();
  const camDist = race.camera.position.distanceTo(carPos);
  assert.ok(camDist > 10 && camDist < 15, `chase camera distance ${camDist.toFixed(1)}`);
  const camRise = race.camera.position.y - carPos.y;
  assert.ok(camRise > 3.5 && camRise < 6.5, `chase camera rise ${camRise.toFixed(1)}`);
  assert.ok(race.camera.fov > 80 && race.camera.fov < 92, `chase FOV at speed ${race.camera.fov.toFixed(1)}`);
  assert.equal(p.visualScale, 1.04);
  race.camera.updateMatrixWorld(true);
  const direction = new THREE.Vector3();
  race.camera.getWorldDirection(direction);
  assert.ok(Math.abs(Math.asin(direction.y)) < THREE.MathUtils.degToRad(12), 'camera pitch is too steep');
  const shares = RACERS.map((racer) => {
    const carBottom = carPos.clone().project(race.camera);
    const carTopWorld = carPos.clone();
    carTopWorld.y += racer.spriteWidth * racer.raceRearAspect * p.visualScale;
    const carTop = carTopWorld.project(race.camera);
    return Math.abs(carTop.y - carBottom.y) / 2;
  });
  cameraScreenShare = Math.max(...shares);
  shares.forEach((share) => assert.ok(share > 0.18 && share < 0.32,
    `production car height ${(share * 100).toFixed(1)}%`));
  // The car must sit in the lower half so the road ahead stays readable.
  const carBottomNdc = carPos.clone().project(race.camera).y;
  assert.ok(carBottomNdc < -0.3 && carBottomNdc > -0.7, `car base at NDC y=${carBottomNdc.toFixed(2)}`);
  race.updateVisuals(1 / 60);
  assert.ok(Math.abs(p.mesh.rotation.z) <= 0.0501);
  assert.ok(p.mesh.scale.x > 0, 'car art must not mirror on a bend');
  const stableYaw = p.mesh.rotation.y;
  p.spinT = 1; p.spinYaw = Math.PI / 2;
  race.updateVisuals(1 / 60);
  assert.ok(p.mesh.scale.x > 0, 'car art must not mirror during a crash');
  close(p.mesh.rotation.y, stableYaw, 0.001);
  assert.equal(race.cycleCamera(), 'HIGH CHASE');
  assert.equal(race.cycleCamera(), 'BUMPER');
}

// 10. A checkpoint crossed on the final clock tick saves the race.
{
  const { race, events } = makeRace(0);
  race.traffic = [];
  race.animals = [];
  race.track.ramps = [];
  race.player.s = race.track.checkpoints[0] - 0.5;
  race.player.speed = 64;
  race.timeLeft = 0.005;
  const idle = { steer: 0, brakeActive: false, consumeStunts: () => ({ wheelie: false, twoWheel: 0 }) };
  race.update(1 / 60, idle);
  assert.equal(race.state, 'race');
  assert.equal(race.nextCheckpoint, 1);
  assert.ok(race.timeLeft > 18.9);
  assert.equal(events.filter((event) => event.kind === 'checkpoint').length, 1);
}

// 11. Same-frame finish order uses crossing fraction, not update-loop order.
{
  const { race, events } = makeRace(0);
  const [p, ai] = race.cars;
  const finishS = race.track.length - 8;
  p.frameStartS = finishS - 0.5;
  p.s = finishS + 0.506;
  ai.frameStartS = finishS - 0.8;
  ai.s = finishS + 0.188;
  race.raceTime = 10;
  race.checkFinishes(1 / 60);
  assert.deepEqual(race.finishOrder.slice(-2), [p, ai]);
  const finish = events.find((event) => event.kind === 'finish').data;
  assert.equal(finish.place, 1);
  assert.deepEqual(finish.results.slice(0, 2).map((row) => row.racer.id), [p.racer.id, ai.racer.id]);
}

// 12. Authored truck spacing survives recycling and traffic retires before the finish stack.
{
  const { race } = makeRace(0);
  const p = race.player;
  const truck = race.traffic.find((v) => v.wrongWay);
  p.s = 1000;
  truck.s = p.s - 81;
  race.updateTraffic(0);
  const authoredGap = truck.s - p.s;
  assert.ok(authoredGap >= 2300 && authoredGap <= 3200);
  const closestPlayerLane = Math.min(...race.traffic
    .filter((v) => v !== truck && !v.retired && Math.abs(v.x - 6) < 4.8)
    .map((v) => Math.abs(v.s - truck.s)));
  assert.ok(closestPlayerLane >= 220, 'recycled wrong-lane semi needs a readable approach gap');
  race.updateTraffic(0);
  close(truck.s - p.s, authoredGap, 0.001);

  p.s = race.track.length - 300;
  truck.s = p.s - 81;
  truck.retired = false;
  race.updateTraffic(0);
  assert.equal(truck.retired, true);
  assert.equal(truck.group.visible, false);
  race.traffic.filter((v) => !v.retired).forEach((v) => assert.ok(v.s < race.track.length - 20));
}

// 13. A real elevation crest (not a ramp) launches a landable side flip.
{
  const { race } = makeRace(2);
  const p = race.player;
  const crest = race.track.crests[0];
  race.traffic = [];
  race.animals = [];
  race.track.ramps = [];
  p.s = crest.s;
  p.speed = 55;
  p.grounded = true;
  p.crestCooldown = 0;
  const clock = race.timeLeft;
  race.handleCrest(p);
  assert.equal(p.grounded, false);
  assert.equal(p.airSource, 'crest');
  assert.ok(p.vy >= 13);
  const sideFlip = { steer: 0, brakeActive: false, consumeStunts: () => ({ wheelie: false, twoWheel: 1 }) };
  race.updatePlayer(p, 0, sideFlip);
  assert.equal(p.flipping, true);
  assert.equal(p.flipAxis, 'z');
  for (let i = 0; i < 240 && !p.grounded; i++) race.airPhysics(p, 1 / 120);
  assert.equal(p.grounded, true);
  assert.equal(race.stuntCredit, 3);
  assert.equal(race.timeLeft, clock + 3);
}

console.log(`Cruis'n Beans acceptance: 13/13 systems passed; arcade-chase car height ${(cameraScreenShare * 100).toFixed(1)}% of frame.`);
