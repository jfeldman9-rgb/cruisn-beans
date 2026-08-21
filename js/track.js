// Track world builder: spline road, scenery billboards, arches, ramps, beans.
import * as THREE from '../vendor/three.module.js';
import * as tex from './tex.js';
import { CHECKPOINTS_PER_LAP } from './data.js';

export const ROAD_W = 16;          // full road width
export const SHOULDER = 7;         // drivable dirt beyond the road edge

const SAMPLES = 512;

export class Track {
  constructor(def) {
    this.def = def;
    this.group = new THREE.Group();

    const pts = def.points.map((p) => new THREE.Vector3(p[0], p[2], p[1]));
    this.curve = new THREE.CatmullRomCurve3(pts, true, 'catmullrom', 0.5);
    this.length = this.curve.getLength();

    // Precompute frames along the curve.
    this.frames = [];
    for (let i = 0; i < SAMPLES; i++) {
      const u = i / SAMPLES;
      const pos = this.curve.getPointAt(u);
      const tan = this.curve.getTangentAt(u);
      const left = new THREE.Vector3(-tan.z, 0, tan.x).normalize();
      this.frames.push({ pos, tan, left });
    }

    this.buildRoad();
    this.buildGroundAndSky();
    this.buildProps();
    this.buildArches();
    this.buildRamps();
    this.buildBeans();
    if (def.picado) this.buildPicado();
    if (def.horizon === 'mesa') this.buildShimmer();
  }

  // s in world units along the track (wraps).
  frameAt(s) {
    const u = ((s / this.length) % 1 + 1) % 1;
    const f = u * SAMPLES;
    const i0 = Math.floor(f) % SAMPLES;
    const i1 = (i0 + 1) % SAMPLES;
    const t = f - Math.floor(f);
    const a = this.frames[i0];
    const b = this.frames[i1];
    return {
      pos: a.pos.clone().lerp(b.pos, t),
      tan: a.tan.clone().lerp(b.tan, t).normalize(),
      left: a.left.clone().lerp(b.left, t).normalize(),
    };
  }

  // World position for arc distance s and lateral offset x (left positive).
  worldPos(s, x, out) {
    const f = this.frameAt(s);
    out = out || new THREE.Vector3();
    out.copy(f.pos).addScaledVector(f.left, x);
    return out;
  }

  // Signed curvature estimate at s: positive = curving left.
  curvatureAt(s) {
    const a = this.frameAt(s).tan;
    const b = this.frameAt(s + 6).tan;
    return (a.x * b.z - a.z * b.x) / 6;
  }

  buildRoad() {
    const verts = [];
    const uvs = [];
    const idx = [];
    const half = ROAD_W / 2;
    for (let i = 0; i <= SAMPLES; i++) {
      const f = this.frames[i % SAMPLES];
      const l = f.pos.clone().addScaledVector(f.left, half);
      const r = f.pos.clone().addScaledVector(f.left, -half);
      verts.push(l.x, l.y + 0.02, l.z, r.x, r.y + 0.02, r.z);
      const v = (i / SAMPLES) * (this.length / 10);
      uvs.push(0, v, 1, v);
      if (i < SAMPLES) {
        const a = i * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const mat = new THREE.MeshBasicMaterial({ map: tex.roadTexture() });
    this.group.add(new THREE.Mesh(geo, mat));

    // Dirt shoulders.
    const sVerts = [];
    const sIdx = [];
    for (let i = 0; i <= SAMPLES; i++) {
      const f = this.frames[i % SAMPLES];
      const l1 = f.pos.clone().addScaledVector(f.left, half + 0.1);
      const l2 = f.pos.clone().addScaledVector(f.left, half + SHOULDER);
      const r1 = f.pos.clone().addScaledVector(f.left, -half - 0.1);
      const r2 = f.pos.clone().addScaledVector(f.left, -half - SHOULDER);
      sVerts.push(
        l1.x, l1.y, l1.z, l2.x, l2.y - 0.25, l2.z,
        r1.x, r1.y, r1.z, r2.x, r2.y - 0.25, r2.z,
      );
      if (i < SAMPLES) {
        const a = i * 4;
        sIdx.push(a, a + 1, a + 4, a + 1, a + 5, a + 4);
        sIdx.push(a + 2, a + 6, a + 3, a + 3, a + 6, a + 7);
      }
    }
    const sGeo = new THREE.BufferGeometry();
    sGeo.setAttribute('position', new THREE.Float32BufferAttribute(sVerts, 3));
    sGeo.setIndex(sIdx);
    const sMat = new THREE.MeshBasicMaterial({ color: this.def.shoulder });
    this.group.add(new THREE.Mesh(sGeo, sMat));
  }

  buildGroundAndSky() {
    const g = new THREE.Mesh(
      new THREE.PlaneGeometry(2400, 2400),
      new THREE.MeshBasicMaterial({ map: tex.groundTexture(this.def.ground, this.def.groundDetail) }),
    );
    g.rotation.x = -Math.PI / 2;
    g.position.y = -0.5;
    this.group.add(g);

    // Sky: big inverted cylinder with a vertical gradient + horizon strip.
    const sky = new THREE.Mesh(
      new THREE.CylinderGeometry(1100, 1100, 700, 24, 1, true),
      new THREE.MeshBasicMaterial({ map: tex.skyTexture(this.def.sky), side: THREE.BackSide, fog: false }),
    );
    sky.position.y = 180;
    this.group.add(sky);
    this.sky = sky;

    // Sun sprite.
    const sun = new THREE.Sprite(new THREE.SpriteMaterial({
      map: tex.sunTexture(this.def.id === 'desert' ? '#ffd06b' : '#fff3b0'),
      fog: false, depthWrite: false,
    }));
    sun.scale.set(160, 160, 1);
    sun.position.set(300, 190, -700);
    this.group.add(sun);

    // Horizon band (ocean / mesas / town silhouette), a big ring of quads.
    let hTex = null;
    let hHeight = 60;
    if (this.def.horizon === 'ocean') { hTex = tex.oceanTexture(); hHeight = 46; }
    if (this.def.horizon === 'mesa') { hTex = tex.mesaTexture(); hHeight = 80; }
    if (this.def.horizon === 'town') { hTex = tex.townTexture(); hHeight = 70; }
    if (hTex) {
      hTex.repeat.set(10, 1);
      const ring = new THREE.Mesh(
        new THREE.CylinderGeometry(950, 950, hHeight, 24, 1, true),
        new THREE.MeshBasicMaterial({ map: hTex, side: THREE.BackSide, transparent: true, fog: false }),
      );
      ring.position.y = hHeight / 2 - 4;
      this.group.add(ring);
    }
  }

  propTexture(kind) {
    this._propCache = this._propCache || {};
    if (!this._propCache[kind]) {
      let t;
      if (kind === 'palm') t = [tex.palmTexture(), 13, 20];
      else if (kind === 'cactus') t = [tex.cactusTexture(), 7, 12];
      else if (kind === 'rock') t = [tex.rockTexture(), 12, 7.5];
      else if (kind === 'skull') t = [tex.skullTexture(), 4, 3.2];
      else if (kind === 'hibiscus') t = [tex.hibiscusTexture(), 5, 5];
      else if (kind === 'agave') t = [tex.agaveTexture(), 6, 4.7];
      else if (kind === 'lantern') t = [tex.lanternTexture(), 3, 6];
      else if (kind === 'building') t = [tex.buildingTexture(), 22, 18];
      else t = [tex.signTexture(kind), 13, 9];
      this._propCache[kind] = t;
    }
    return this._propCache[kind];
  }

  buildProps() {
    // Billboarded scenery: two crossed quads per prop would be nicer but a
    // single camera-facing quad is cheaper; we group by texture and use
    // instanced-ish merged geometry with per-prop transform baked in, facing
    // roughly toward the road.
    const kinds = this.def.props;
    const groups = new Map();
    const step = this.length / 90;
    for (let i = 0; i < 90; i++) {
      const s = i * step + Math.random() * step * 0.5;
      const f = this.frameAt(s);
      const side = Math.random() > 0.5 ? 1 : -1;
      const kind = kinds[(Math.random() * kinds.length) | 0];
      const isBuilding = kind === 'building';
      const isSign = kind.startsWith('sign_');
      const dist = ROAD_W / 2 + SHOULDER + (isSign ? 2 + Math.random() * 3
        : isBuilding ? 6 + Math.random() * 8 : 3 + Math.random() * 22);
      const p = f.pos.clone().addScaledVector(f.left, side * dist);
      if (!groups.has(kind)) groups.set(kind, []);
      groups.get(kind).push({ p, side, f });
    }

    groups.forEach((list, kind) => {
      const [t, w, h] = this.propTexture(kind);
      const geos = [];
      list.forEach(({ p, f, side }) => {
        const geo = new THREE.PlaneGeometry(w, h);
        // Face the road (perpendicular-ish to travel direction, with jitter).
        const angle = Math.atan2(f.tan.x, f.tan.z) + (Math.random() - 0.5) * 0.6
          + (kind.startsWith('sign_') ? (side > 0 ? -0.5 : 0.5) : 0);
        const m = new THREE.Matrix4()
          .makeRotationY(angle)
          .setPosition(p.x, p.y + h / 2 - 0.4, p.z);
        geo.applyMatrix4(m);
        geos.push(geo);
      });
      const merged = mergeGeometries(geos);
      const mat = new THREE.MeshBasicMaterial({
        map: t, transparent: true, alphaTest: 0.4, side: THREE.DoubleSide,
      });
      this.group.add(new THREE.Mesh(merged, mat));
    });
  }

  buildArchAt(s, label, bg, fg) {
    const f = this.frameAt(s);
    const group = new THREE.Group();
    const half = ROAD_W / 2 + 1.5;
    const pillarGeo = new THREE.BoxGeometry(1.6, 9, 1.6);
    const pillarMat = new THREE.MeshBasicMaterial({ color: '#c9c9d4' });
    [half, -half].forEach((off) => {
      const p = new THREE.Mesh(pillarGeo, pillarMat);
      const pos = f.pos.clone().addScaledVector(f.left, off);
      p.position.set(pos.x, pos.y + 4.5, pos.z);
      group.add(p);
    });
    const banner = new THREE.Mesh(
      new THREE.PlaneGeometry(half * 2 + 1.6, 4),
      new THREE.MeshBasicMaterial({ map: tex.archTexture(label, bg, fg), side: THREE.DoubleSide }),
    );
    banner.position.set(f.pos.x, f.pos.y + 10.5, f.pos.z);
    banner.rotation.y = Math.atan2(f.left.x, f.left.z) + Math.PI / 2;
    group.add(banner);
    this.group.add(group);
    return group;
  }

  buildArches() {
    this.checkpoints = [];
    this.buildArchAt(0, 'START \u2022 FINISH', '#c81f1f', '#ffffff');
    for (let i = 1; i <= CHECKPOINTS_PER_LAP; i++) {
      const s = (this.length * i) / (CHECKPOINTS_PER_LAP + 1);
      this.buildArchAt(s, 'CHECKPOINT', '#0b5aa5', '#ffd23d');
      this.checkpoints.push(s);
    }
  }

  buildRamps() {
    this.ramps = [];
    const mat = new THREE.MeshBasicMaterial({ color: '#e0a53d' });
    const side = new THREE.MeshBasicMaterial({ color: '#b5761f' });
    (this.def.ramps || []).forEach((u) => {
      const s = u * this.length;
      const f = this.frameAt(s);
      const w = ROAD_W * 0.46;
      const len = 10;
      const hgt = 2.2;
      const geo = new THREE.BufferGeometry();
      // A simple wedge: flat approach up to a lip.
      const bl = f.pos.clone().addScaledVector(f.left, w / 2);
      const br = f.pos.clone().addScaledVector(f.left, -w / 2);
      const tl = this.frameAt(s + len).pos.clone().addScaledVector(this.frameAt(s + len).left, w / 2);
      const tr = this.frameAt(s + len).pos.clone().addScaledVector(this.frameAt(s + len).left, -w / 2);
      const v = [
        bl.x, bl.y + 0.05, bl.z, br.x, br.y + 0.05, br.z,
        tl.x, tl.y + hgt, tl.z, tr.x, tr.y + hgt, tr.z,
      ];
      geo.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
      geo.setIndex([0, 1, 2, 1, 3, 2]);
      geo.computeVertexNormals();
      this.group.add(new THREE.Mesh(geo, mat));
      // Back face so it doesn't look hollow from behind.
      const back = new THREE.BufferGeometry();
      back.setAttribute('position', new THREE.Float32BufferAttribute([
        tl.x, tl.y + hgt, tl.z, tr.x, tr.y + hgt, tr.z,
        tl.x, tl.y - 0.4, tl.z, tr.x, tr.y - 0.4, tr.z,
      ], 3));
      back.setIndex([0, 1, 2, 1, 3, 2]);
      this.group.add(new THREE.Mesh(back, side));
      // Stripes on the face.
      this.ramps.push({ s, len, hgt, halfW: w / 2 });
    });
  }

  buildBeans() {
    this.beans = [];
    const t = tex.beanCanTexture();
    (this.def.beans || []).forEach((u, row) => {
      const s = u * this.length;
      // A row of 3 cans across the road.
      for (let i = -1; i <= 1; i++) {
        const x = i * 4.2;
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthWrite: false }));
        sprite.scale.set(2.2, 2.6, 1);
        const p = this.worldPos(s, x);
        sprite.position.set(p.x, p.y + 1.5, p.z);
        this.group.add(sprite);
        this.beans.push({ s, x, sprite, active: true, respawn: 0, baseY: p.y + 1.5 });
      }
    });
  }

  buildPicado() {
    const t = tex.picadoTexture();
    const n = 10;
    for (let i = 0; i < n; i++) {
      const s = (this.length * i) / n + 20;
      const f = this.frameAt(s);
      const w = ROAD_W + SHOULDER * 2;
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(w, 2.6),
        new THREE.MeshBasicMaterial({ map: t, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide }),
      );
      m.position.set(f.pos.x, f.pos.y + 8, f.pos.z);
      m.rotation.y = Math.atan2(f.left.x, f.left.z) + Math.PI / 2;
      this.group.add(m);
    }
  }

  buildShimmer() {
    // Cheap heat shimmer: translucent wavy strips floating above the road,
    // scrolled in update().
    this.shimmers = [];
    const t = tex.shimmerTexture();
    for (let i = 0; i < 8; i++) {
      const s = (this.length * i) / 8 + 40;
      const f = this.frameAt(s);
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(ROAD_W * 1.4, 3.4),
        new THREE.MeshBasicMaterial({
          map: t, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide,
        }),
      );
      m.position.set(f.pos.x, f.pos.y + 2.2, f.pos.z);
      m.rotation.y = Math.atan2(f.left.x, f.left.z) + Math.PI / 2;
      this.group.add(m);
      this.shimmers.push(m);
    }
  }

  update(time) {
    // Bean bobbing + respawns handled by game; shimmer wobble here.
    if (this.shimmers) {
      this.shimmers.forEach((m, i) => {
        m.material.map.offset.x = Math.sin(time * 2 + i) * 0.2;
        m.material.opacity = 0.22 + 0.14 * Math.sin(time * 3 + i * 1.7);
      });
    }
    this.beans.forEach((b) => {
      if (b.active) {
        b.sprite.position.y = b.baseY + Math.sin(time * 3 + b.s) * 0.25;
        b.sprite.material.rotation = Math.sin(time * 2 + b.x) * 0.2;
      }
    });
  }
}

// Minimal geometry merge (positions + uvs, non-indexed) so we don't need
// the three.js examples folder.
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
    const n = idx ? idx.count : p.count;
    for (let i = 0; i < n; i++) {
      const vi = idx ? idx.getX(i) : i;
      pos[(o + i) * 3] = p.getX(vi);
      pos[(o + i) * 3 + 1] = p.getY(vi);
      pos[(o + i) * 3 + 2] = p.getZ(vi);
      uv[(o + i) * 2] = u.getX(vi);
      uv[(o + i) * 2 + 1] = u.getY(vi);
    }
    o += n;
  });
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return out;
}
