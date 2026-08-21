// Point-to-point stage builder: a long two-way road generated from segment
// descriptions, with zoned scenery, landmarks visible from far away,
// checkpoint arches, ramps, bean cans, and one real shortcut spline.
import * as THREE from '../vendor/three.module.js';
import * as tex from './tex.js';

export const ROAD_W = 24;          // full two-way road width
export const ROAD_HALF = ROAD_W / 2;
export const LANE_PLAYER = 6;      // center of the cruising lane (+x = screen right)
export const LANE_ONCOMING = -6;   // oncoming lane center
export const SHOULDER = 8;         // drivable dirt beyond the asphalt

const SAMPLE_STEP = 4;             // world units between precomputed frames
const CHUNK = 128;                 // samples per road chunk (~512 units)

function buildCenterline(segments) {
  // Integrate heading over segments; control point every ~40 units.
  const pts = [];
  let x = 0, z = 0, y = 0, heading = 0;
  pts.push(new THREE.Vector3(0, 0, 0));
  segments.forEach((seg) => {
    const steps = Math.max(2, Math.round(seg.len / 40));
    for (let i = 0; i < steps; i++) {
      const d = seg.len / steps;
      heading += (seg.bend || 0) / steps;
      y += (seg.dh || 0) / steps;
      x += Math.sin(heading) * d;
      z += Math.cos(heading) * d;
      pts.push(new THREE.Vector3(x, Math.max(0, y), z));
    }
  });
  return pts;
}

export class Track {
  constructor(def) {
    this.def = def;
    this.group = new THREE.Group();

    const pts = buildCenterline(def.segments);
    this.curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.4);
    this.length = this.curve.getLength();

    const n = Math.ceil(this.length / SAMPLE_STEP);
    this.samples = n;
    this.frames = [];
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      const pos = this.curve.getPointAt(u);
      const tan = this.curve.getTangentAt(u);
      tan.y = 0; tan.normalize();
      const left = new THREE.Vector3(-tan.z, 0, tan.x); // NOTE: +x offset = screen right
      this.frames.push({ pos, tan, left });
    }

    // Zone lookup per sample.
    this.zoneAt = new Array(n + 1);
    let acc = 0;
    const zoneRanges = def.segments.map((s) => {
      const r = { from: acc, to: acc + s.len, zone: s.zone };
      acc += s.len;
      return r;
    });
    const totalDef = acc;
    for (let i = 0; i <= n; i++) {
      const s = (i / n) * this.length;
      const sDef = (s / this.length) * totalDef;
      const zr = zoneRanges.find((r) => sDef >= r.from && sDef <= r.to) || zoneRanges[zoneRanges.length - 1];
      this.zoneAt[i] = zr.zone;
    }

    this.buildRoad();
    this.buildGroundAndSky();
    this.buildOcean();
    this.buildProps();
    this.buildLandmarks();
    this.buildArches();
    this.buildRamps();
    this.buildBeans();
    this.buildPicado();
    this.buildShortcut();
    if (def.shimmer) this.buildShimmer();
  }

  frameIndexAt(s) {
    const c = THREE.MathUtils.clamp(s, 0, this.length - 0.01);
    return (c / this.length) * this.samples;
  }

  frameAt(s) {
    const f = this.frameIndexAt(s);
    const i0 = Math.floor(f);
    const i1 = Math.min(i0 + 1, this.samples);
    const t = f - i0;
    const a = this.frames[i0];
    const b = this.frames[i1];
    return {
      pos: a.pos.clone().lerp(b.pos, t),
      tan: a.tan.clone().lerp(b.tan, t).normalize(),
      left: a.left.clone().lerp(b.left, t).normalize(),
    };
  }

  zoneOf(s) {
    return this.zoneAt[Math.round(this.frameIndexAt(s))];
  }

  zoneDef(s) {
    return this.def.zones[this.zoneOf(s)] || {};
  }

  worldPos(s, x, out) {
    const f = this.frameAt(s);
    out = out || new THREE.Vector3();
    out.copy(f.pos).addScaledVector(f.left, x);
    return out;
  }

  curvatureAt(s) {
    const a = this.frameAt(s).tan;
    const b = this.frameAt(Math.min(s + 8, this.length)).tan;
    return (a.x * b.z - a.z * b.x) / 8;
  }

  headingAt(s) {
    const t = this.frameAt(s).tan;
    return Math.atan2(t.x, t.z);
  }

  // ---- geometry ----

  buildRibbon(fromX, toX, yLift, mat, uvScale, dropOuter = 0) {
    // Builds chunked ribbons along the road for culling-friendly rendering.
    for (let c0 = 0; c0 < this.samples; c0 += CHUNK) {
      const c1 = Math.min(c0 + CHUNK, this.samples);
      const verts = [];
      const uvs = [];
      const idx = [];
      for (let i = c0; i <= c1; i++) {
        const f = this.frames[i];
        const a = f.pos.clone().addScaledVector(f.left, fromX);
        const b = f.pos.clone().addScaledVector(f.left, toX);
        b.y += dropOuter;
        verts.push(a.x, a.y + yLift, a.z, b.x, b.y + yLift, b.z);
        const v = (i * SAMPLE_STEP) / (uvScale || 10);
        uvs.push(0, v, 1, v);
        if (i < c1) {
          const k = (i - c0) * 2;
          idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      geo.setIndex(idx);
      geo.computeBoundingSphere();
      this.group.add(new THREE.Mesh(geo, mat));
    }
  }

  buildRoad() {
    // Two-way asphalt: center double-yellow, dashed lane lines, edge lines.
    const roadTex = (() => {
      const c = document.createElement('canvas');
      c.width = 128; c.height = 128;
      const g = c.getContext('2d');
      g.fillStyle = '#3a3a44'; g.fillRect(0, 0, 128, 128);
      for (let i = 0; i < 700; i++) {
        g.fillStyle = ['#42424e', '#34343c', '#3e3e48'][(Math.random() * 3) | 0];
        g.fillRect((Math.random() * 128) | 0, (Math.random() * 128) | 0, 2, 2);
      }
      g.fillStyle = '#f2f2e8';
      g.fillRect(3, 0, 4, 128); g.fillRect(121, 0, 4, 128);
      // Double yellow center.
      g.fillStyle = '#ffd23d';
      g.fillRect(60, 0, 3, 128); g.fillRect(66, 0, 3, 128);
      // Dashed white lane centers.
      g.fillStyle = '#d9d9cf';
      g.fillRect(30, 10, 4, 38); g.fillRect(30, 74, 4, 38);
      g.fillRect(94, 10, 4, 38); g.fillRect(94, 74, 4, 38);
      const t = new THREE.CanvasTexture(c);
      t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter;
      t.generateMipmaps = false;
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.colorSpace = THREE.SRGBColorSpace;
      return t;
    })();
    this.buildRibbon(ROAD_HALF, -ROAD_HALF, 0.05, new THREE.MeshBasicMaterial({ map: roadTex }), 14);
    const shoulderMat = new THREE.MeshBasicMaterial({ color: this.def.shoulder });
    this.buildRibbon(ROAD_HALF + SHOULDER, ROAD_HALF + 0.05, 0.0, shoulderMat, 10, -0.3);
    this.buildRibbon(-ROAD_HALF - 0.05, -ROAD_HALF - SHOULDER, 0.0, shoulderMat, 10, -0.3);
    // Embankment skirts down to the ground plane for elevated sections.
    const skirtMat = new THREE.MeshBasicMaterial({ color: this.def.groundDetail });
    this.buildRibbon(ROAD_HALF + SHOULDER + 26, ROAD_HALF + SHOULDER, 0, skirtMat, 10, 0);
    // (outer edge dropped to ground below)
    this.group.children.slice(-Math.ceil(this.samples / CHUNK)).forEach((m) => {
      const pos = m.geometry.attributes.position;
      for (let i = 0; i < pos.count; i += 2) pos.setY(i, -0.6);
    });
    this.buildRibbon(-ROAD_HALF - SHOULDER, -ROAD_HALF - SHOULDER - 26, 0, skirtMat, 10, 0);
    this.group.children.slice(-Math.ceil(this.samples / CHUNK)).forEach((m) => {
      const pos = m.geometry.attributes.position;
      for (let i = 1; i < pos.count; i += 2) pos.setY(i, -0.6);
    });
  }

  buildGroundAndSky() {
    const groundT = tex.groundTexture(this.def.ground, this.def.groundDetail);
    groundT.repeat.set(160, 160);
    const g = new THREE.Mesh(
      new THREE.PlaneGeometry(7800, 7800),
      new THREE.MeshBasicMaterial({ map: groundT }),
    );
    g.rotation.x = -Math.PI / 2;
    g.position.y = -0.6;
    // Center the ground on the middle of the stage.
    const mid = this.frameAt(this.length / 2).pos;
    g.position.x = mid.x; g.position.z = mid.z;
    this.group.add(g);

    // Sky: gradient cylinder blending into the fog color at the horizon,
    // plus a top cap disc so looking up never shows the void.
    const skyColors = [this.def.sky[0], this.def.sky[1], this.def.fogColor];
    const sky = new THREE.Mesh(
      new THREE.CylinderGeometry(5600, 5600, 4200, 24, 1, true),
      new THREE.MeshBasicMaterial({ map: tex.skyTexture(skyColors), side: THREE.BackSide, fog: false }),
    );
    sky.position.set(mid.x, 1300, mid.z);
    this.group.add(sky);
    const cap = new THREE.Mesh(
      new THREE.CircleGeometry(5700, 24),
      new THREE.MeshBasicMaterial({ color: this.def.sky[0], side: THREE.DoubleSide, fog: false }),
    );
    cap.rotation.x = Math.PI / 2;
    cap.position.set(mid.x, 3350, mid.z);
    this.group.add(cap);

    const sun = new THREE.Sprite(new THREE.SpriteMaterial({
      map: tex.sunTexture(this.def.id === 'desert' ? '#ffd06b' : '#fff3b0'),
      fog: false, depthWrite: false,
    }));
    sun.scale.set(700, 700, 1);
    sun.position.set(mid.x + 1500, 800, mid.z - 3200);
    this.group.add(sun);
  }

  buildOcean() {
    // Ocean ribbon along zones flagged with ocean side (Hawaii coast).
    const zones = this.def.zones;
    const hasOcean = Object.values(zones).some((z) => z.ocean);
    if (!hasOcean) return;
    const mat = new THREE.MeshBasicMaterial({ map: tex.oceanPlaneTexture() });
    for (let c0 = 0; c0 < this.samples; c0 += CHUNK) {
      const zone = zones[this.zoneAt[c0]];
      if (!zone || !zone.ocean) continue;
      const side = zone.ocean === 'right' ? 1 : -1;
      const c1 = Math.min(c0 + CHUNK, this.samples);
      const verts = []; const uvs = []; const idx = [];
      for (let i = c0; i <= c1; i++) {
        const f = this.frames[i];
        const a = f.pos.clone().addScaledVector(f.left, side * (ROAD_HALF + SHOULDER + 24));
        const b = f.pos.clone().addScaledVector(f.left, side * (ROAD_HALF + SHOULDER + 700));
        verts.push(a.x, -1.4, a.z, b.x, -2.0, b.z);
        const v = (i * SAMPLE_STEP) / 40;
        uvs.push(0, v, 8, v);
        if (i < c1) {
          const k = (i - c0) * 2;
          idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      geo.setIndex(idx);
      geo.computeBoundingSphere();
      this.group.add(new THREE.Mesh(geo, mat));
    }
  }

  propTexture(kind) {
    this._propCache = this._propCache || {};
    if (!this._propCache[kind]) {
      let t;
      if (kind === 'palm') t = [tex.palmTexture(), 14, 21];
      else if (kind === 'cactus') t = [tex.cactusTexture(), 7, 12];
      else if (kind === 'rock') t = [tex.rockTexture(), 13, 8];
      else if (kind === 'lavarock') t = [tex.lavarockTexture(), 12, 8];
      else if (kind === 'skull') t = [tex.skullTexture(), 4.5, 3.6];
      else if (kind === 'hibiscus') t = [tex.hibiscusTexture(), 5, 5];
      else if (kind === 'agave') t = [tex.agaveTexture(), 6.5, 5];
      else if (kind === 'lantern') t = [tex.lanternTexture(), 3, 6];
      else if (kind === 'building') t = [tex.buildingTexture(), 24, 20];
      else if (kind === 'building_surf') t = [tex.surfShopTexture(), 20, 17];
      else t = [tex.signTexture(kind), 13, 9];
      this._propCache[kind] = t;
    }
    return this._propCache[kind];
  }

  buildProps() {
    // Scenery per zone, denser than before, chunked for culling.
    const placements = new Map(); // kind -> array of {p, angle}
    const baseStep = 34;
    for (let s = 30; s < this.length - 30; s += baseStep) {
      const zone = this.zoneDef(s);
      const props = zone.props || [];
      if (!props.length) continue;
      const count = Math.max(1, Math.round(zone.density || 1));
      for (let k = 0; k < count; k++) {
        const kind = props[(Math.random() * props.length) | 0];
        const isBuilding = kind.startsWith('building');
        const isSign = kind.startsWith('sign_');
        let side = Math.random() > 0.5 ? 1 : -1;
        if (zone.ocean === 'right' && side === 1 && !isSign) side = -1; // keep ocean view clear
        let dist;
        if (zone.street && isBuilding) {
          dist = ROAD_HALF + SHOULDER + 2 + Math.random() * 3;   // tight street canyon
        } else if (isBuilding) {
          dist = ROAD_HALF + SHOULDER + 8 + Math.random() * 14;
        } else if (isSign) {
          dist = ROAD_HALF + SHOULDER + 2 + Math.random() * 3;
        } else {
          dist = ROAD_HALF + SHOULDER + 3 + Math.random() * 30;
        }
        const f = this.frameAt(s + Math.random() * baseStep * 0.5);
        const p = f.pos.clone().addScaledVector(f.left, side * dist);
        // Text props face back toward approaching drivers (+PI), tilted
        // slightly toward the road.
        const facePlayer = isSign || kind === 'building_surf' ? Math.PI : 0;
        const angle = Math.atan2(f.tan.x, f.tan.z) + facePlayer
          + (Math.random() - 0.5) * (facePlayer ? 0.2 : 0.5)
          + (isSign ? (side > 0 ? 0.45 : -0.45) : 0);
        if (!placements.has(kind)) placements.set(kind, []);
        placements.get(kind).push({ p, angle });
      }
    }

    // Merge per kind in spatial chunks of ~500 units for frustum culling.
    placements.forEach((list, kind) => {
      const [t, w, h] = this.propTexture(kind);
      // Text-bearing props are single-sided so their text never mirrors.
      const hasText = kind.startsWith('sign_') || kind === 'building_surf';
      const mat = new THREE.MeshBasicMaterial({
        map: t, transparent: true, alphaTest: 0.4,
        side: hasText ? THREE.FrontSide : THREE.DoubleSide,
      });
      const chunks = new Map();
      list.forEach((item) => {
        const key = `${Math.round(item.p.x / 500)}_${Math.round(item.p.z / 500)}`;
        if (!chunks.has(key)) chunks.set(key, []);
        chunks.get(key).push(item);
      });
      chunks.forEach((items) => {
        const geos = items.map(({ p, angle }) => {
          const geo = new THREE.PlaneGeometry(w, h);
          geo.applyMatrix4(new THREE.Matrix4().makeRotationY(angle).setPosition(p.x, p.y + h / 2 - 0.4, p.z));
          return geo;
        });
        const merged = mergeGeometries(geos);
        merged.computeBoundingSphere();
        this.group.add(new THREE.Mesh(merged, mat));
      });
    });
  }

  landmarkTexture(kind) {
    if (kind === 'volcano') return tex.volcanoTexture();
    if (kind === 'cruiseShip') return tex.cruiseShipTexture();
    if (kind === 'mesaBig') return tex.mesaBigTexture();
    if (kind === 'dinerSign') return tex.dinerSignTexture();
    if (kind === 'townGate') return tex.townGateTexture();
    if (kind === 'church') return tex.churchTexture();
    if (kind === 'fountain') return tex.fountainTexture();
    if (kind === 'cantinaNeon') return tex.cantinaNeonTexture();
    return tex.rockTexture();
  }

  buildLandmarks() {
    // Landmarks render with fog disabled so they read from far away.
    (this.def.landmarks || []).forEach((lm) => {
      const s = lm.at * this.length;
      const f = this.frameAt(s);
      const p = f.pos.clone().addScaledVector(f.left, lm.x);
      const isGate = lm.kind === 'townGate';
      const mat = new THREE.MeshBasicMaterial({
        map: this.landmarkTexture(lm.kind),
        transparent: true, alphaTest: 0.35, side: THREE.DoubleSide,
        fog: Math.abs(lm.x) < 120 ? true : false,
      });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(lm.w, lm.h), mat);
      m.position.set(p.x, p.y + lm.h / 2 - 0.4 + (lm.kind === 'cruiseShip' ? -2 : 0), p.z);
      // Face approaching drivers; angle far-off landmarks slightly.
      m.rotation.y = this.headingAt(s) + Math.PI
        + (isGate || Math.abs(lm.x) < 60 ? 0 : 0.55 * (lm.x > 0 ? 1 : -1));
      this.group.add(m);
    });
  }

  buildArchAt(s, label, bg, fg) {
    const f = this.frameAt(s);
    const group = new THREE.Group();
    const half = ROAD_HALF + 2;
    const pillarGeo = new THREE.BoxGeometry(1.8, 10, 1.8);
    const pillarMat = new THREE.MeshBasicMaterial({ color: '#c9c9d4' });
    [half, -half].forEach((off) => {
      const p = new THREE.Mesh(pillarGeo, pillarMat);
      const pos = f.pos.clone().addScaledVector(f.left, off);
      p.position.set(pos.x, pos.y + 5, pos.z);
      group.add(p);
    });
    const banner = new THREE.Mesh(
      new THREE.PlaneGeometry(half * 2 + 2, 4.4),
      new THREE.MeshBasicMaterial({ map: tex.archTexture(label, bg, fg), side: THREE.DoubleSide }),
    );
    banner.position.set(f.pos.x, f.pos.y + 11.6, f.pos.z);
    banner.rotation.y = this.headingAt(s) + Math.PI;
    group.add(banner);
    this.group.add(group);
    return group;
  }

  buildArches() {
    this.checkpoints = [];
    this.buildArchAt(2, 'START', '#1f9e46', '#ffffff');
    for (let s = this.def.checkpointEvery; s < this.length - 400; s += this.def.checkpointEvery) {
      this.buildArchAt(s, 'CHECKPOINT', '#0b5aa5', '#ffd23d');
      this.checkpoints.push(s);
    }
    this.buildArchAt(this.length - 8, 'FINISH', '#c81f1f', '#ffffff');
  }

  buildRamps() {
    this.ramps = [];
    const mat = new THREE.MeshBasicMaterial({ color: '#e0a53d' });
    const side = new THREE.MeshBasicMaterial({ color: '#b5761f' });
    (this.def.ramps || []).forEach((u) => {
      const s = u * this.length;
      const f0 = this.frameAt(s);
      const f1 = this.frameAt(s + 11);
      const w = 10;
      const hgt = 2.4;
      // Ramps sit in the cruising lane so oncoming traffic stays clear.
      const cx = LANE_PLAYER;
      const bl = f0.pos.clone().addScaledVector(f0.left, cx + w / 2);
      const br = f0.pos.clone().addScaledVector(f0.left, cx - w / 2);
      const tl = f1.pos.clone().addScaledVector(f1.left, cx + w / 2);
      const tr = f1.pos.clone().addScaledVector(f1.left, cx - w / 2);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute([
        bl.x, bl.y + 0.05, bl.z, br.x, br.y + 0.05, br.z,
        tl.x, tl.y + hgt, tl.z, tr.x, tr.y + hgt, tr.z,
      ], 3));
      geo.setIndex([0, 1, 2, 1, 3, 2]);
      this.group.add(new THREE.Mesh(geo, mat));
      const back = new THREE.BufferGeometry();
      back.setAttribute('position', new THREE.Float32BufferAttribute([
        tl.x, tl.y + hgt, tl.z, tr.x, tr.y + hgt, tr.z,
        tl.x, tl.y - 0.4, tl.z, tr.x, tr.y - 0.4, tr.z,
      ], 3));
      back.setIndex([0, 1, 2, 1, 3, 2]);
      this.group.add(new THREE.Mesh(back, side));
      this.ramps.push({ s, len: 11, hgt, cx, halfW: w / 2 });
    });
  }

  buildBeans() {
    this.beans = [];
    const t = tex.beanCanTexture();
    (this.def.beans || []).forEach((u) => {
      const s = u * this.length;
      for (let i = 0; i < 3; i++) {
        const x = LANE_PLAYER + (i - 1) * 4.4;
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthWrite: false }));
        sprite.scale.set(2.3, 2.7, 1);
        const p = this.worldPos(s + i * 3, x);
        sprite.position.set(p.x, p.y + 1.5, p.z);
        this.group.add(sprite);
        this.beans.push({ s: s + i * 3, x, sprite, active: true, baseY: p.y + 1.5 });
      }
    });
  }

  buildPicado() {
    const t = tex.picadoTexture();
    for (let s = 60; s < this.length; s += 90) {
      const zone = this.zoneDef(s);
      if (!zone.picado) continue;
      const f = this.frameAt(s);
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(ROAD_W + SHOULDER * 2, 2.8),
        new THREE.MeshBasicMaterial({ map: t, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide }),
      );
      m.position.set(f.pos.x, f.pos.y + 8.5, f.pos.z);
      m.rotation.y = this.headingAt(s);
      this.group.add(m);
    }
  }

  buildShortcut() {
    this.shortcut = null;
    const sc = this.def.shortcut;
    if (!sc) return;
    const s1 = sc.enter * this.length;
    const s2 = sc.exit * this.length;
    const side = sc.side; // +1 = right of the road
    const f1 = this.frameAt(s1);
    const f2 = this.frameAt(s2);
    // Cut across the inside of the bend with a couple of waypoints.
    const mid1 = this.worldPos(s1 + (s2 - s1) * 0.3, side * 90);
    const mid2 = this.worldPos(s1 + (s2 - s1) * 0.7, side * 90);
    const pts = [
      this.worldPos(s1, side * (ROAD_HALF - 2)),
      this.worldPos(s1 + 30, side * (ROAD_HALF + SHOULDER + 14)),
      mid1, mid2,
      this.worldPos(s2 - 30, side * (ROAD_HALF + SHOULDER + 14)),
      this.worldPos(s2, side * (ROAD_HALF - 4)),
    ];
    const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.4);
    const len = curve.getLength();
    const n = Math.ceil(len / SAMPLE_STEP);
    const frames = [];
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      const pos = curve.getPointAt(u);
      const tan = curve.getTangentAt(u);
      tan.y = 0; tan.normalize();
      frames.push({ pos, tan, left: new THREE.Vector3(-tan.z, 0, tan.x) });
    }
    // Dirt road mesh.
    const mat = new THREE.MeshBasicMaterial({ map: tex.dirtRoadTexture() });
    const verts = []; const uvs = []; const idx = [];
    const w = 9;
    for (let i = 0; i <= n; i++) {
      const f = frames[i];
      const a = f.pos.clone().addScaledVector(f.left, w / 2);
      const b = f.pos.clone().addScaledVector(f.left, -w / 2);
      verts.push(a.x, a.y + 0.08, a.z, b.x, b.y + 0.08, b.z);
      const v = (i * SAMPLE_STEP) / 9;
      uvs.push(0, v, 1, v);
      if (i < n) {
        const k = i * 2;
        idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(idx);
    geo.computeBoundingSphere();
    this.group.add(new THREE.Mesh(geo, mat));

    // Entrance sign.
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(11, 7),
      new THREE.MeshBasicMaterial({
        map: tex.archTexture(sc.label || 'SHORTCUT?', '#7c3fa0', '#ffd23d'),
        transparent: true, side: THREE.DoubleSide,
      }),
    );
    const sp = this.worldPos(s1 - 26, side * (ROAD_HALF + 6));
    sign.position.set(sp.x, sp.y + 5, sp.z);
    sign.rotation.y = this.headingAt(s1 - 26) + Math.PI;
    this.group.add(sign);

    this.shortcut = {
      s1, s2, side, curve, len, frames,
      frameAt: (ss) => {
        const c = THREE.MathUtils.clamp(ss, 0, len - 0.01);
        const fi = (c / len) * n;
        const i0 = Math.floor(fi);
        const i1 = Math.min(i0 + 1, n);
        const t = fi - i0;
        const a = frames[i0]; const b = frames[i1];
        return {
          pos: a.pos.clone().lerp(b.pos, t),
          tan: a.tan.clone().lerp(b.tan, t).normalize(),
          left: a.left.clone().lerp(b.left, t).normalize(),
        };
      },
    };
  }

  buildShimmer() {
    this.shimmers = [];
    const t = tex.shimmerTexture();
    for (let s = 300; s < this.length; s += 700) {
      const f = this.frameAt(s);
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(ROAD_W * 1.3, 3.6),
        new THREE.MeshBasicMaterial({
          map: t, transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide,
        }),
      );
      m.position.set(f.pos.x, f.pos.y + 2.3, f.pos.z);
      m.rotation.y = this.headingAt(s);
      this.group.add(m);
      this.shimmers.push(m);
    }
  }

  update(time) {
    if (this.shimmers) {
      this.shimmers.forEach((m, i) => {
        m.material.map.offset.x = Math.sin(time * 2 + i) * 0.2;
        m.material.opacity = 0.2 + 0.13 * Math.sin(time * 3 + i * 1.7);
      });
    }
    this.beans.forEach((b) => {
      if (b.active) {
        b.sprite.position.y = b.baseY + Math.sin(time * 3 + b.s) * 0.25;
      }
    });
  }
}

function mergeGeometries(geos) {
  let vCount = 0;
  geos.forEach((g) => { vCount += g.index ? g.index.count : g.attributes.position.count; });
  const pos = new Float32Array(vCount * 3);
  const uv = new Float32Array(vCount * 2);
  let o = 0;
  geos.forEach((g) => {
    const p = g.attributes.position;
    const u = g.attributes.uv;
    const idx = g.index;
    const nn = idx ? idx.count : p.count;
    for (let i = 0; i < nn; i++) {
      const vi = idx ? idx.getX(i) : i;
      pos[(o + i) * 3] = p.getX(vi);
      pos[(o + i) * 3 + 1] = p.getY(vi);
      pos[(o + i) * 3 + 2] = p.getZ(vi);
      uv[(o + i) * 2] = u.getX(vi);
      uv[(o + i) * 2 + 1] = u.getY(vi);
    }
    o += nn;
  });
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return out;
}
