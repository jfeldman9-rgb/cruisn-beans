// Regression guards for the stage builder's rendering invariants:
//  - every lit (Lambert/Standard) mesh carries a normal attribute, so merged
//    roadside props cannot regress into black NaN silhouettes;
//  - the Hawaii ocean floats above the ground plane instead of under it;
//  - the road runs past FINISH for the finish camera without moving any
//    authored stage fraction (checkpoints, ramps, shortcut);
//  - the panorama window scrolls with camera yaw and never re-uploads.
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';

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

const { Track } = await import('../js/track.js');
const { Race } = await import('../js/game.js');
const { STAGES } = await import('../js/data.js');

let checks = 0;

for (const def of STAGES) {
  const track = new Track(def);

  // Lit meshes must have normals.
  let lit = 0;
  track.group.traverse((obj) => {
    if (!obj.isMesh) return;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    const needsNormals = mats.some((m) => m.isMeshLambertMaterial || m.isMeshStandardMaterial || m.isMeshPhongMaterial);
    if (!needsNormals) return;
    lit++;
    const normal = obj.geometry.getAttribute('normal');
    assert.ok(normal && normal.count > 0, `${def.id}: lit mesh without normals`);
    const arr = normal.array;
    for (let i = 0; i < Math.min(arr.length, 300); i++) {
      assert.ok(Number.isFinite(arr[i]), `${def.id}: non-finite normal component`);
    }
    // At least one non-zero normal per mesh (a zero vector would NaN in GLSL).
    let nonZero = false;
    for (let i = 0; i < arr.length && !nonZero; i += 3) {
      nonZero = Math.abs(arr[i]) + Math.abs(arr[i + 1]) + Math.abs(arr[i + 2]) > 1e-6;
    }
    assert.ok(nonZero, `${def.id}: lit mesh with all-zero normals`);
  });
  assert.ok(lit >= 20, `${def.id}: expected many lit prop/road meshes, saw ${lit}`);
  checks++;

  // Run-off past the finish, authored fractions untouched.
  assert.ok(track.roadLength > track.length + 200, `${def.id}: road should run past FINISH`);
  assert.ok(track.roadLength < track.length + 320, `${def.id}: run-off unexpectedly long`);
  const authored = def.segments.reduce((sum, s) => sum + s.len, 0);
  assert.ok(Math.abs(track.length - authored) < authored * 0.002, `${def.id}: length drifted from authored segments`);
  const cpStep = def.checkpointEvery;
  track.checkpoints.forEach((cp, i) => assert.equal(cp, cpStep * (i + 1)));
  assert.ok(track.checkpoints.at(-1) < track.length - 400);
  const endFrame = track.frameAt(track.roadLength - 1);
  const finishFrame = track.frameAt(track.length - 8);
  assert.ok(endFrame.pos.distanceTo(finishFrame.pos) > 200, `${def.id}: run-off road has no extent`);
  // Zone lookups stay valid across the run-off.
  assert.equal(track.zoneOf(track.roadLength - 2), def.segments.at(-1).zone);
  checks++;
}

// Ocean above ground on the coast.
{
  const hawaii = new Track(STAGES.find((s) => s.id === 'hawaii'));
  const oceanMeshes = [];
  hawaii.group.traverse((obj) => {
    if (obj.isMesh && obj.material && obj.material.map && obj.material.roughness === 0.28) oceanMeshes.push(obj);
  });
  assert.ok(oceanMeshes.length > 0, 'Hawaii should build ocean ribbons');
  const groundY = -0.6;
  oceanMeshes.forEach((m) => {
    const pos = m.geometry.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      assert.ok(pos.getY(i) > groundY, `ocean vertex at y=${pos.getY(i)} is under the ground plane`);
    }
  });
  checks++;
}

// Panorama scroll: the UV window offset must move with yaw and never flag a re-upload.
{
  const race = new Race({
    trackDef: { ...STAGES[0] },
    racers: Array.from({ length: 7 }, (_, i) => ({
      id: `t${i}`, name: `T${i}`, color: '#ccc', spriteWidth: 5.4,
      stats: { speed: 0.9, grip: 0.75, wheelie: 0.8 }, topSpeed: 64, accel: 23, steer: 1, aiSkill: 0.9,
    })),
    playerIndex: 0,
    onEvent: () => {},
  });
  // Node has no Image, so the race falls back to a color background; drive
  // the crop math with a stand-in texture object.
  race.panoramaTexture = { repeat: new THREE.Vector2(), offset: new THREE.Vector2(), needsUpdate: false };
  race.camera.aspect = 16 / 9;
  race.camera.fov = 64;
  race.camera.position.set(0, 10, 0);
  race.camera.lookAt(0, 10, 100);
  race.updatePanoramaCrop();
  const straight = race.panoramaTexture.offset.x;
  const repeatX = race.panoramaTexture.repeat.x;
  assert.ok(repeatX > 0.5 && repeatX < 0.8, `visible slice ${repeatX} should zoom the 16:9 art`);
  assert.ok(Math.abs(race.panoramaTexture.repeat.y - repeatX) < 1e-6, 'crop keeps the view aspect at 16:9');
  race.camera.lookAt(100, 10, 0); // yaw +90 degrees toward +x (screen-left)
  race.updatePanoramaCrop();
  const turned = race.panoramaTexture.offset.x;
  assert.ok(turned < straight - 0.2, `offset should slide with yaw (${straight} -> ${turned})`);
  assert.equal(race.panoramaTexture.needsUpdate, false, 'scrolling must not re-upload the texture');
  race.camera.aspect = 9 / 16;
  race.updatePanoramaCrop();
  assert.ok(race.panoramaTexture.repeat.y <= 1 && race.panoramaTexture.repeat.x <= 1, 'portrait crop stays inside the art');
  checks++;
}

console.log(`World geometry: ${checks} invariant groups passed across ${STAGES.length} stages.`);
