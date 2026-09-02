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

// The Hawaii sea is a real drop below the road, not a texture beside it.
{
  const def = STAGES.find((s) => s.id === 'hawaii');
  const hawaii = new Track(def);
  const byKind = new Map();
  hawaii.group.traverse((obj) => {
    const kind = obj.userData && obj.userData.kind;
    if (kind && obj.isMesh) byKind.set(kind, [...(byKind.get(kind) || []), obj]);
  });
  for (const kind of ['ocean', 'shelf', 'beach', 'cliff', 'foam']) {
    assert.ok((byKind.get(kind) || []).length > 0, `Hawaii should build ${kind} strips`);
  }
  const sea = def.coast.seaLevel;
  ['ocean', 'shelf'].forEach((kind) => byKind.get(kind).forEach((m) => {
    const pos = m.geometry.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      assert.ok(Math.abs(pos.getY(i) - sea) < 0.2, `${kind} vertex at y=${pos.getY(i)} is not at sea level ${sea}`);
    }
  }));
  // Every point of the road sits well above the water.
  for (let s = 0; s < hawaii.roadLength; s += 50) {
    assert.ok(hawaii.frameAt(s).pos.y - sea >= 8, `road at s=${s} is not high above the sea`);
  }
  // No ground plane: the island stage builds land as a ribbon so the sea can
  // sit lower than the grass without being buried by it.
  let bigPlane = false;
  hawaii.group.traverse((obj) => {
    if (obj.isMesh && obj.geometry.type === 'PlaneGeometry' && obj.geometry.parameters.width > 5000) bigPlane = true;
  });
  assert.equal(bigPlane, false, 'coast stage must not use a world ground plane');
  // Other stages keep their plane.
  const desert = new Track(STAGES.find((s) => s.id === 'desert'));
  let desertPlane = false;
  desert.group.traverse((obj) => {
    if (obj.isMesh && obj.geometry.type === 'PlaneGeometry' && obj.geometry.parameters.width > 5000) desertPlane = true;
  });
  assert.equal(desertPlane, true);
  checks++;
}

// Desert buttes and Tequila blocks are geometry, not cards, and stay off the road.
{
  const ROAD_CLEAR = 16;
  // Every cone landmark on every stage (buttes, Diamond Head, the inland
  // volcano) must leave the whole road, run-off included, outside its skirt.
  const coneKinds = new Set(['butte', 'diamondHead', 'volcano']);
  for (const def of STAGES) {
    const track = new Track(def);
    track.group.traverse((obj) => {
      if (!obj.isMesh || !coneKinds.has(obj.userData.kind)) return;
      const { center, radius } = obj.userData;
      for (let s = 0; s < track.roadLength; s += 25) {
        const f = track.frameAt(s);
        const d = Math.hypot(f.pos.x - center.x, f.pos.z - center.z);
        assert.ok(d > radius + ROAD_CLEAR, `${def.id}: ${obj.userData.kind} at s=${s} swallows the road (d=${d.toFixed(0)}, r=${radius})`);
      }
    });
  }
  const desert = new Track(STAGES.find((s) => s.id === 'desert'));
  const buttes = [];
  desert.group.traverse((obj) => { if (obj.isMesh && obj.userData.kind === 'butte') buttes.push(obj); });
  assert.ok(buttes.length >= 3, `desert should raise several 3D buttes, saw ${buttes.length}`);
  buttes.forEach((butte) => {
    const { radius } = butte.userData;
    assert.ok(radius >= 80, 'a butte is a landmark, not a boulder');
    const box = new THREE.Box3().setFromBufferAttribute(butte.geometry.getAttribute('position'));
    assert.ok(box.max.y - box.min.y >= 80, 'butte should tower over the road');
  });
  // At least one butte is close enough to the road to parallax past it.
  const near = buttes.some((b) => {
    let best = Infinity;
    for (let s = 0; s < desert.roadLength; s += 25) {
      const f = desert.frameAt(s);
      best = Math.min(best, Math.hypot(f.pos.x - b.userData.center.x, f.pos.z - b.userData.center.z) - b.userData.radius);
    }
    return best < 200;
  });
  assert.ok(near, 'no butte comes near enough to the road to read as scenery you pass');

  const tequila = new Track(STAGES.find((s) => s.id === 'tequila'));
  const blocks = [];
  tequila.group.traverse((obj) => { if (obj.isMesh && obj.userData.kind === 'prop_building') blocks.push(obj); });
  assert.ok(blocks.length >= 3, 'tequila should have chunked building blocks');
  blocks.forEach((mesh) => {
    const pos = mesh.geometry.getAttribute('position');
    // A box is 12 triangles; a merged run of cards is 2 per building.
    assert.equal(pos.count % 36, 0, 'buildings should be boxes, not planes');
    const box = new THREE.Box3().setFromBufferAttribute(pos);
    assert.ok(box.max.x - box.min.x > 8 && box.max.z - box.min.z > 8, 'building chunk has footprint depth');
    assert.ok(box.max.y - box.min.y > 12, 'buildings should be at least two storeys');
  });
  // No block sits on the asphalt.
  for (let s = 0; s < tequila.length; s += 20) {
    const f = tequila.frameAt(s);
    blocks.forEach((mesh) => {
      const pos = mesh.geometry.getAttribute('position');
      for (let i = 0; i < pos.count; i += 3) {
        const dx = pos.getX(i) - f.pos.x; const dz = pos.getZ(i) - f.pos.z;
        const lateral = Math.abs(dx * f.left.x + dz * f.left.z);
        const along = Math.abs(dx * f.tan.x + dz * f.tan.z);
        if (along < 6) assert.ok(lateral > 12, `building corner on the road at s=${s} (lateral ${lateral.toFixed(1)})`);
      }
    });
  }
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
  const artAspect = STAGES[0].panoramaAspect || 16 / 9;
  assert.ok(repeatX > 0.35 && repeatX < 0.8, `visible slice ${repeatX} should zoom into the art`);
  assert.ok(Math.abs(race.panoramaTexture.repeat.y / repeatX - artAspect / (16 / 9)) < 1e-6, 'crop keeps the view aspect');
  const horizon = STAGES[0].panoramaHorizon ?? 0.5;
  const vCenter = race.panoramaTexture.offset.y + race.panoramaTexture.repeat.y / 2;
  assert.ok(Math.abs(vCenter - horizon) < 0.12, `painting horizon ${horizon} should sit near the view center (${vCenter})`);
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
