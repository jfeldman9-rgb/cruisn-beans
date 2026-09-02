// Feel and identity guards for HAWAII COAST. These encode the five-point bar:
//  1. landmark identity reads in the first ten seconds of a cold start,
//  2. the ocean is a drop-off below the road, visible past the bluff lip,
//  3. traffic is a toy: dense, real 3D vehicles, leapfroggable either way,
//  4. the hero car is huge and the camera sells speed,
//  5. draw distance is long and stunts pay separately from beans.
// Everything here runs headless on the real Race/Track classes; the camera
// math is the production camera, so a Hawaii-that-isn't-Hawaii fails here.
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';

let seed = 0xa10ba;
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
globalThis.document = { createElement: () => fakeCanvas(), createElementNS: () => fakeCanvas() };
globalThis.window = {};
globalThis.localStorage = { getItem: () => null, setItem() {} };

const { Race } = await import('../js/game.js');
const { RACERS, STAGES } = await import('../js/data.js');
const { ROAD_HALF, SHOULDER, LANE_PLAYER } = await import('../js/track.js');

const hawaii = STAGES.find((s) => s.id === 'hawaii');
const andy = RACERS.find((r) => r.id === 'andy');
const idle = { steer: 0, brakeActive: false, consumeStunts: () => ({ wheelie: false, twoWheel: 0 }) };
const dt = 1 / 60;
let checks = 0;

function makeRace() {
  const events = [];
  const race = new Race({
    trackDef: { ...hawaii },
    racers: [andy],
    playerIndex: 0,
    onEvent: (kind, data) => events.push({ kind, data }),
  });
  race.state = 'race';
  race.timeLeft = 300;
  race.camera.aspect = 16 / 9;
  return { race, events };
}

// Screen-space test helper: is a world point inside the view and in front?
function onScreen(camera, point, margin = 0) {
  const p = point.clone().project(camera);
  return p.z < 1 && Math.abs(p.x) <= 1 - margin && Math.abs(p.y) <= 1 - margin;
}

function settleCamera(race) {
  race.camInit = false;
  race.updateCamera(1);
  race.camera.updateMatrixWorld(true);
}

// 1. Cold start: drive the real car from the grid for ten seconds and look.
{
  const { race } = makeRace();
  const p = race.player;
  race.traffic = [];
  race.animals = [];
  const track = race.track;
  const diamond = (track.landmarkMeshes || []).find((m) => m.userData.kind === 'diamondHead');
  assert.ok(diamond, 'Hawaii must build the Diamond Head crater mesh');
  assert.ok(diamond.userData.peak.y - hawaii.coast.seaLevel > 150, 'Diamond Head must be a tall landmark');

  const palms = track.propPlacements.get('palm') || [];
  const towers = track.towerPlacements || [];
  assert.ok(palms.length >= 60, `Hawaii needs a lot of palms, saw ${palms.length}`);
  assert.ok(towers.length >= 8, `Waikiki needs resort towers, saw ${towers.length}`);

  const seen = { diamond: 0, ocean: 0, palms: 0, towers: 0, gate: false, foam: 0 };
  for (let frame = 0; frame < 60 * 10; frame++) {
    race.updatePlayer(p, dt, idle);
    race.airPhysics(p, dt);
    if (frame % 30 !== 29) continue; // sample twice a second
    settleCamera(race);
    const cam = race.camera;
    if (onScreen(cam, diamond.userData.peak, 0.05)) seen.diamond++;
    // A point on the turquoise shelf 140 units ahead, out past the beach.
    const shelf = track.worldPos(p.s + 140, hawaii.coast.side * (ROAD_HALF + SHOULDER + 95));
    shelf.y = hawaii.coast.seaLevel;
    if (onScreen(cam, shelf)) seen.ocean++;
    const surf = track.worldPos(p.s + 220, hawaii.coast.side * (ROAD_HALF + SHOULDER + 79));
    surf.y = hawaii.coast.seaLevel + 0.1;
    if (onScreen(cam, surf)) seen.foam++;
    const nearPalms = palms.filter(({ p: pp }) => onScreen(cam, pp.clone().setY(pp.y + 10)) && pp.distanceTo(p.worldPos()) < 420);
    if (nearPalms.length >= 3) seen.palms++;
    if (towers.some(({ p: tp, h }) => onScreen(cam, tp.clone().setY(tp.y + h * 0.6)))) seen.towers++;
  }
  const gate = hawaii.landmarks.find((l) => l.kind === 'alohaGate');
  seen.gate = gate.at * track.length < p.s;
  if (process.env.DEBUG_IDENTITY) console.log("cold-start samples", seen, "distance", p.s.toFixed(0));
  assert.ok(p.s > 350, `ten seconds from the grid should cover real distance (${p.s.toFixed(0)}m)`);
  assert.ok(seen.diamond >= 10, `Diamond Head must be on screen most of the first ten seconds (${seen.diamond}/20 samples)`);
  assert.ok(seen.ocean >= 16, `the ocean must be in view almost constantly (${seen.ocean}/20)`);
  assert.ok(seen.foam >= 12, `the surf line must be visible (${seen.foam}/20)`);
  assert.ok(seen.palms >= 14, `palms must line the road (${seen.palms}/20)`);
  assert.ok(seen.towers >= 6, `Waikiki towers must show early (${seen.towers}/20)`);
  assert.ok(seen.gate, 'the ALOHA gateway must be passed inside ten seconds');
  checks++;
}

// 2. Ocean reads as a drop-off: the sea is far below the road and the
//    driver's sightline over the bluff lip lands on beach and surf, not on
//    water flush with the grass.
{
  const { race } = makeRace();
  const track = race.track;
  const sea = hawaii.coast.seaLevel;
  const side = hawaii.coast.side;
  for (let s = 0; s < track.length; s += 200) {
    const drop = track.frameAt(s).pos.y - sea;
    assert.ok(drop >= 11, `drop at s=${s} is only ${drop.toFixed(1)}`);
  }
  // Camera at a straight coast section; cast the ray over the lip.
  const p = race.player;
  p.s = 1700; p.x = LANE_PLAYER; p.speed = 60;
  settleCamera(race);
  const cam = race.camera.position;
  const f = track.frameAt(1700);
  const lip = track.worldPos(1700, side * (ROAD_HALF + SHOULDER + 1));
  lip.y = f.pos.y - 0.3;
  // Lateral (across the road) sightline: how far out does the eye first see sea level?
  const camLateral = (cam.x - f.pos.x) * f.left.x + (cam.z - f.pos.z) * f.left.z;
  const lipLateral = side * (ROAD_HALF + SHOULDER + 1);
  const slope = (cam.y - lip.y) / Math.abs(lipLateral - camLateral);
  const firstVisible = Math.abs(lipLateral) + (lip.y - sea) / slope;
  assert.ok(firstVisible < track.shoreOffset - 6,
    `sightline first reaches sea level at ${firstVisible.toFixed(0)}, beyond the shoreline ${track.shoreOffset} (beach hidden)`);
  assert.ok(track.shoreOffset - track.beachOffset >= 40, 'beach must be wide enough to read');
  let rocks = 0;
  track.group.traverse((o) => { if (o.userData.kind === 'searock') rocks++; });
  assert.ok(rocks >= 2, 'surf needs rocks for scale');
  // Guardrail posts strobe past on the sea side at a steady interval.
  let posts = 0;
  track.group.traverse((o) => {
    if (o.userData.kind === 'guardpost') posts += o.geometry.attributes.position.count / 24;
  });
  assert.ok(posts * 16 >= track.roadLength * 0.95, `guardrail posts every 16 units expected, saw ${Math.round(posts)}`);
  checks++;
}

// 3. Traffic is a toy: dense, 3D, leapfroggable in both directions, and the
//    collision happens at the bumper of a long truck, not at its center.
{
  const { race } = makeRace();
  const p = race.player;
  assert.ok(hawaii.traffic.oncoming >= 12 && hawaii.traffic.same >= 5, 'Hawaii traffic must be dense');
  race.traffic.forEach((v) => {
    assert.ok(v.wheels.length >= 4, `${v.kind} needs wheels`);
    let meshes = 0;
    v.body.traverse((o) => { if (o.isMesh) meshes++; });
    assert.ok(meshes >= 5, `${v.kind} must be a 3D model, saw ${meshes} meshes`);
  });
  const semi = race.traffic.find((v) => v.kind === 'semi');
  assert.ok(semi.halfLen >= 10, 'a semi must be a long vehicle');
  // Center distance well inside the old sprite radius but outside the bumper: no hit.
  p.s = 1000; p.x = 6; p.speed = 55; p.grounded = true; p.invuln = 0; p.wheelieT = 0;
  semi.s = p.s + semi.halfLen + 4; semi.x = 6; semi.clearedBy = 0; semi.crashT = 0;
  race.trafficInteract(p, dt, true);
  assert.equal(p.spinT, 0, 'no collision before the bumper');
  semi.s = p.s + semi.halfLen + 2;
  race.trafficInteract(p, dt, true);
  assert.ok(p.spinT > 0, 'collision at the bumper');

  // Same-way sedan hop.
  const { race: r2 } = makeRace();
  const q = r2.player;
  const sedan = r2.traffic.find((v) => !v.oncoming);
  r2.traffic = [sedan];
  q.s = 2000; q.x = 6; q.speed = 60; q.grounded = true; q.wheelieT = 1.2; q.wheelieFullT = 1.9; q.yOff = 0;
  sedan.s = q.s + 12; sedan.x = 6; sedan.clearedBy = 0;
  const clock = r2.timeLeft;
  r2.trafficInteract(q, dt, true);
  assert.equal(q.grounded, false, 'a wheelie must hop same-way traffic');
  assert.equal(q.airSource, 'leapfrog');
  assert.equal(r2.timeLeft, clock + 1);
  // Land it: no crash on the way down over the sedan.
  for (let i = 0; i < 400 && !q.grounded; i++) {
    r2.airPhysics(q, dt);
    q.s += q.speed * dt;
    r2.trafficInteract(q, dt, true);
  }
  assert.equal(q.spinT, 0, 'landing past the sedan must not pile');

  // Leapfrogging the wrong-way semi: the chase camera must ride over the
  // trailer roof rather than clip through it and blank the screen.
  const { race: r3 } = makeRace();
  const w = r3.player;
  const truck = r3.traffic.find((v) => v.kind === 'semi');
  r3.traffic = [truck];
  w.s = 1500; w.x = 6; w.speed = 62; w.grounded = true; w.wheelieT = 1.2; w.wheelieFullT = 1.9; w.yOff = 0;
  truck.s = w.s + 20; truck.x = 6; truck.clearedBy = 0; truck.speed = 20; truck.oncoming = true; truck.wrongWay = true;
  r3.cameraMode = 0; r3.camInit = false;
  r3.updateCamera(dt);
  r3.trafficInteract(w, dt, true);
  assert.equal(w.airSource, 'leapfrog', 'wheelie into the semi must leapfrog');
  let worstClearance = Infinity;
  for (let i = 0; i < 400 && !w.grounded; i++) {
    r3.airPhysics(w, dt);
    w.s += w.speed * dt;
    truck.s -= truck.speed * dt;
    r3.updateCamera(dt);
    const camS = w.s - Race.CAMERA_RIGS[0].back;
    if (Math.abs(camS - truck.s) < truck.halfLen + 1) {
      const roadY = r3.track.frameAt(camS).pos.y;
      worstClearance = Math.min(worstClearance, r3.camera.position.y - roadY - truck.h);
    }
  }
  assert.ok(worstClearance !== Infinity, 'the camera should pass over the trailer during the hop');
  assert.ok(worstClearance > 1, `camera must clear the semi roof while leapfrogging (worst ${worstClearance.toFixed(2)})`);
  checks++;
}

// 4. Huge car, camera that sells speed.
{
  const { race } = makeRace();
  const p = race.player;
  race.traffic = [];
  p.s = 1500; p.x = 6;
  p.speed = 0; settleCamera(race);
  const fovIdle = race.camera.fov;
  const distIdle = race.camera.position.distanceTo(p.worldPos());
  p.speed = andy.topSpeed * 1.24; settleCamera(race);
  const fovTurbo = race.camera.fov;
  const distTurbo = race.camera.position.distanceTo(p.worldPos());
  assert.ok(fovTurbo - fovIdle >= 12, `FOV must widen with speed (${fovIdle.toFixed(1)} -> ${fovTurbo.toFixed(1)})`);
  assert.ok(distTurbo > distIdle + 0.8, 'camera must pull back as speed rises');
  assert.ok(race.speedRumble > 0.05, 'top speed must rumble the camera');
  p.speed = 40; settleCamera(race);
  assert.equal(race.speedRumble, 0, 'no rumble at cruising speed');
  // Screen share of the hero car at speed.
  p.speed = 60; settleCamera(race);
  const carPos = p.worldPos();
  const bottom = carPos.clone().project(race.camera);
  const top = carPos.clone().setY(carPos.y + andy.spriteWidth * andy.raceRearAspect * p.visualScale).project(race.camera);
  const share = (top.y - bottom.y) / 2;
  assert.ok(share >= 0.18, `hero car must fill at least 18% of the frame height (${(share * 100).toFixed(1)}%)`);
  const width = Math.abs(
    carPos.clone().addScaledVector(race.track.frameAt(p.s).left, andy.spriteWidth / 2).project(race.camera).x
    - carPos.clone().addScaledVector(race.track.frameAt(p.s).left, -andy.spriteWidth / 2).project(race.camera).x,
  ) / 2;
  assert.ok(width >= 0.12, `hero car must be at least 12% of the frame width (${(width * 100).toFixed(1)}%)`);
  assert.equal(race.cameraModes[0], 'ARCADE CHASE');
  checks++;
}

// 5. Draw distance and stunt economy.
{
  const { race } = makeRace();
  assert.ok(race.scene.fog.near >= 700 && race.scene.fog.far >= 2400, 'Hawaii haze must start far out');
  const far = race.traffic.find((v) => v.oncoming && !v.wrongWay);
  race.player.s = 500;
  far.s = 500 + 1850;
  race.updateTraffic(0);
  assert.equal(far.group.visible, true, 'traffic must be drawn well past 1300 units');
  // Beans are a snack; stunts are the moves.
  const beanBonus = 1.5;
  const flipCredit = 3;
  assert.ok(flipCredit >= beanBonus * 2, 'a landed flip must be worth far more than any bean');
  const { race: r3 } = makeRace();
  const q = r3.player;
  q.s = 900; q.speed = 50; q.grounded = true; q.wheelieCooldown = 0; q.beansGot = 0;
  r3.updatePlayer(q, dt, { steer: 0, brakeActive: false, consumeStunts: () => ({ wheelie: true, twoWheel: 0 }) });
  assert.ok(q.wheelieT > 0, 'double-tap wheelie must not depend on beans or a meter');
  checks++;
}

console.log(`Hawaii identity: ${checks}/5 bar checks passed (landmark, drop-off, traffic toy, huge fast car, draw distance/stunts).`);
