// Point-to-point stage builder: a long two-way road generated from segment
// descriptions, with zoned scenery, landmarks visible from far away,
// checkpoint arches, ramps, bean cans, and one real shortcut spline.
import * as THREE from '../vendor/three.module.js';
import * as tex from './tex.js?v=world-feel-2';

export const ROAD_W = 24;          // full two-way road width
export const ROAD_HALF = ROAD_W / 2;
export const LANE_PLAYER = 6;      // center of the cruising lane (+x = screen right)
export const LANE_ONCOMING = -6;   // oncoming lane center
export const SHOULDER = 8;         // drivable dirt beyond the asphalt

const SAMPLE_STEP = 4;             // world units between precomputed frames
const CHUNK = 128;                 // samples per road chunk (~512 units)
// Straight road built past the FINISH so cars coast through the arch during
// the finish camera instead of freezing at the edge of the world. Stage
// fractions (checkpoints, ramps, landmarks) are measured against `length`,
// which excludes this run-off, so authored stage data is unaffected.
const RUNOFF = 260;

function smoothSurfaceTexture(texture, anisotropy = 4) {
  // Surface textures spend most of the race at a steep viewing angle. Linear
  // mipmaps keep them crisp in the foreground without the glittering/pixel
  // crawl that nearest filtering caused toward the horizon.
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = anisotropy;
  return texture;
}

function colorShift(hex, lightness, saturation = 0) {
  return new THREE.Color(hex).offsetHSL(0, saturation, lightness);
}

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

// Frames extrapolated behind the START line so the low chase camera never
// looks over the edge of the world during the countdown.
const PREROLL_SAMPLES = 10;

export class Track {
  constructor(def) {
    this.def = def;
    this.group = new THREE.Group();
    this.billboardLandmarks = [];
    this.animatedMaps = [];
    // Coast stages keep the sea at an absolute level below the road so the
    // shoulder reads as a drop-off, and the ocean owns one whole side.
    this.coast = def.coast
      ? { side: def.coast.side || 1, seaLevel: def.coast.seaLevel ?? -12.5 }
      : null;

    const lastSeg = def.segments[def.segments.length - 1];
    const runoff = { len: RUNOFF, bend: 0, dh: 0, zone: lastSeg.zone };
    const pts = buildCenterline([...def.segments, runoff]);
    this.curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.4);
    this.roadLength = this.curve.getLength();
    const authoredLen = def.segments.reduce((sum, s) => sum + s.len, 0);
    this.length = this.roadLength * (authoredLen / (authoredLen + RUNOFF));

    const n = Math.ceil(this.roadLength / SAMPLE_STEP);
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
    const zoneRanges = [...def.segments, runoff].map((s) => {
      const r = { from: acc, to: acc + s.len, zone: s.zone };
      acc += s.len;
      return r;
    });
    const totalDef = acc - RUNOFF;
    this.crests = [];
    let boundary = 0;
    for (let i = 0; i < def.segments.length - 1; i++) {
      const current = def.segments[i];
      const next = def.segments[i + 1];
      boundary += current.len;
      const incomingSlope = (current.dh || 0) / current.len;
      const outgoingSlope = (next.dh || 0) / next.len;
      const slopeDrop = incomingSlope - outgoingSlope;
      // Positive grade breaking sharply flatter/downhill forms a physical
      // road crest. These are separate from the visible wooden ramps.
      if (incomingSlope > 0.002 && slopeDrop > 0.003) {
        this.crests.push({
          s: (boundary / totalDef) * this.length,
          strength: THREE.MathUtils.clamp(slopeDrop * 70, 0.5, 1.4),
        });
      }
    }
    for (let i = 0; i <= n; i++) {
      const s = (i / n) * this.roadLength;
      const sDef = (s / this.length) * totalDef;
      const zr = zoneRanges.find((r) => sDef >= r.from && sDef <= r.to) || zoneRanges[zoneRanges.length - 1];
      this.zoneAt[i] = zr.zone;
    }

    if (this.coast) this.computeClearance();
    this.buildRoad();
    this.buildGroundAndSky();
    this.buildTerrainRelief();
    this.buildCoast();
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
    const c = THREE.MathUtils.clamp(s, 0, this.roadLength - 0.01);
    return (c / this.roadLength) * this.samples;
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

  // Frame lookup that extrapolates straight back before the first sample.
  frameAtIndex(i, frames = this.frames) {
    if (i >= 0) return frames[Math.min(i, frames.length - 1)];
    const f0 = frames[0];
    return {
      pos: f0.pos.clone().addScaledVector(f0.tan, i * SAMPLE_STEP),
      tan: f0.tan,
      left: f0.left,
    };
  }

  // Lateral clearance: for every frame and side, how far a perpendicular ray
  // travels before it meets another part of the road. Coast ribbons are as
  // wide as this allows, so the flat ocean/land never floods a later leg of a
  // hairpin while still reaching the fog on the outside of every bend.
  computeClearance() {
    const n = this.samples;
    const far = 3400;
    const skip = 60;
    const raw = { left: new Float32Array(n + 1), right: new Float32Array(n + 1) };
    const px = new Float64Array(n + 1);
    const pz = new Float64Array(n + 1);
    for (let i = 0; i <= n; i++) { px[i] = this.frames[i].pos.x; pz[i] = this.frames[i].pos.z; }
    for (let i = 0; i <= n; i++) {
      const f = this.frames[i];
      for (const side of [1, -1]) {
        const dx = f.left.x * side;
        const dz = f.left.z * side;
        let best = far;
        for (let j = 0; j < n; j++) {
          if (Math.abs(j - i) <= skip) continue;
          const ex = px[j + 1] - px[j];
          const ez = pz[j + 1] - pz[j];
          const denom = dx * ez - dz * ex;
          if (Math.abs(denom) < 1e-9) continue;
          const rx = px[j] - f.pos.x;
          const rz = pz[j] - f.pos.z;
          const t = (rx * ez - rz * ex) / denom;
          if (t <= 0 || t >= best) continue;
          const u = (rx * dz - rz * dx) / denom;
          if (u >= 0 && u <= 1) best = t;
        }
        (side === 1 ? raw.right : raw.left)[i] = best;
      }
    }
    // Running minimum keeps ribbon edges from zig-zagging sample to sample.
    const smooth = (src) => {
      const out = new Float32Array(n + 1);
      for (let i = 0; i <= n; i++) {
        let m = Infinity;
        for (let k = Math.max(0, i - 24); k <= Math.min(n, i + 24); k++) m = Math.min(m, src[k]);
        out[i] = Math.max(60, m - 70);
      }
      return out;
    };
    this.clearance = { left: smooth(raw.left), right: smooth(raw.right) };
  }

  clearanceAt(i, side) {
    if (!this.clearance) return 3400;
    const arr = side > 0 ? this.clearance.right : this.clearance.left;
    return arr[THREE.MathUtils.clamp(Math.round(i), 0, arr.length - 1)];
  }

  // General chunked strip along a frame list. `rows` are functions
  // (frame, index) -> { x: lateral offset, y: absolute height }. Winding is
  // derived from the row direction so every strip is lit from above; strips
  // may carry per-vertex colors and world-space or normalized UVs.
  buildStrip(rows, mat, opts = {}) {
    const {
      uvScale = 10, colorAt = null, skipChunk = null, frames = this.frames,
      worldUV = 0, uvAlong = 'v', extendStart = true, tag = null,
    } = opts;
    const count = frames.length - 1;
    const R = rows.length;
    const meshes = [];
    for (let c0 = 0; c0 < count; c0 += CHUNK) {
      if (skipChunk && skipChunk(c0)) continue;
      const c1 = Math.min(c0 + CHUNK, count);
      const first = c0 === 0 && extendStart ? -PREROLL_SAMPLES : c0;
      const verts = []; const uvs = []; const cols = []; const idx = [];
      let flip = null;
      for (let i = first; i <= c1; i++) {
        const f = this.frameAtIndex(i, frames);
        const src = Math.max(0, i);
        const pts = rows.map((fn) => fn(f, src));
        pts.forEach((p, r) => {
          const w = f.pos.clone().addScaledVector(f.left, p.x);
          verts.push(w.x, p.y, w.z);
          const along = (i * SAMPLE_STEP) / (worldUV || uvScale);
          const across = worldUV ? p.x / worldUV : r / (R - 1);
          if (uvAlong === 'u') uvs.push(along, across); else uvs.push(across, along);
          if (colorAt) {
            const c = colorAt(r, src, p);
            cols.push(c.r, c.g, c.b);
          }
        });
        if (flip === null) flip = pts[1].x - pts[0].x > 0;
        if (i < c1) {
          const k = (i - first) * R;
          for (let r = 0; r < R - 1; r++) {
            const a = k + r; const b = k + r + 1; const c = k + R + r; const d = k + R + r + 1;
            if (flip) idx.push(a, b, c, b, d, c); else idx.push(a, c, b, b, c, d);
          }
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      if (colorAt) geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, mat);
      if (tag) mesh.userData.kind = tag;
      this.group.add(mesh);
      meshes.push(mesh);
    }
    return meshes;
  }

  buildRibbon(fromX, toX, yLift, mat, uvScale, dropOuter = 0, opts = {}) {
    // Two-row strip relative to the road surface (legacy signature).
    return this.buildStrip([
      (f) => ({ x: fromX, y: f.pos.y + yLift }),
      (f) => ({ x: toX, y: f.pos.y + yLift + dropOuter }),
    ], mat, { uvScale, ...opts });
  }

  buildRoad() {
    // Two-way asphalt: center double-yellow and edge lines. The old dashed
    // whites landed exactly under the two traffic streams, visually putting
    // every car on a lane divider instead of inside a lane.
    const roadTex = (() => {
      const c = document.createElement('canvas');
      c.width = 512; c.height = 512;
      const g = c.getContext('2d');
      const asphalt = g.createLinearGradient(0, 0, 512, 0);
      asphalt.addColorStop(0, '#303039');
      asphalt.addColorStop(0.5, '#3d3d47');
      asphalt.addColorStop(1, '#303039');
      g.fillStyle = asphalt; g.fillRect(0, 0, 512, 512);
      // Deterministic aggregate, tar seams, and tire wear give the road scale
      // while avoiding a different noisy texture on every stage load.
      for (let i = 0; i < 3600; i++) {
        const x = Math.abs(Math.sin(i * 37.17) * 41391) % 512;
        const y = Math.abs(Math.sin(i * 91.73 + 2.4) * 27431) % 512;
        const shade = ['#4a4a55', '#292931', '#3a3a43', '#55555e'][i % 4];
        const size = 0.7 + (i % 3) * 0.55;
        g.globalAlpha = 0.16 + (i % 5) * 0.025;
        g.fillStyle = shade;
        g.fillRect(x, y, size, size);
      }
      g.globalAlpha = 0.18;
      g.strokeStyle = '#17171c'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(174, 0); g.bezierCurveTo(181, 150, 165, 330, 176, 512); g.stroke();
      g.beginPath(); g.moveTo(338, 0); g.bezierCurveTo(329, 170, 346, 350, 335, 512); g.stroke();
      g.globalAlpha = 1;
      g.fillStyle = '#f2f2e8';
      g.fillRect(12, 0, 12, 512); g.fillRect(488, 0, 12, 512);
      // Double yellow center.
      g.fillStyle = '#ffd23d';
      g.fillRect(240, 0, 10, 512); g.fillRect(262, 0, 10, 512);
      // A faint dusty edge integrates the asphalt with each stage shoulder.
      const dust = new THREE.Color(this.def.shoulder).getStyle();
      const edge = g.createLinearGradient(0, 0, 512, 0);
      edge.addColorStop(0, dust); edge.addColorStop(0.055, 'rgba(0,0,0,0)');
      edge.addColorStop(0.945, 'rgba(0,0,0,0)'); edge.addColorStop(1, dust);
      g.globalAlpha = 0.2; g.fillStyle = edge; g.fillRect(0, 0, 512, 512); g.globalAlpha = 1;
      const t = new THREE.CanvasTexture(c);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.colorSpace = THREE.SRGBColorSpace;
      return smoothSurfaceTexture(t, 8);
    })();
    this.buildRibbon(ROAD_HALF, -ROAD_HALF, 0.05, new THREE.MeshStandardMaterial({
      map: roadTex, color: '#e4e4e8', roughness: 0.93, metalness: 0.015,
    }), 14);

    const shoulderTex = smoothSurfaceTexture(
      tex.groundTexture(this.def.shoulder, this.def.groundDetail),
      4,
    );
    shoulderTex.wrapS = shoulderTex.wrapT = THREE.RepeatWrapping;
    shoulderTex.repeat.set(1, 1);
    const shoulderMat = new THREE.MeshLambertMaterial({ map: shoulderTex, color: '#f4eadc' });
    this.buildRibbon(ROAD_HALF + SHOULDER, ROAD_HALF + 0.05, 0.0, shoulderMat, 10, -0.3);
    this.buildRibbon(-ROAD_HALF - 0.05, -ROAD_HALF - SHOULDER, 0.0, shoulderMat, 10, -0.3);
    // Embankment skirts down to the ground plane for elevated sections.
    const skirtMat = new THREE.MeshLambertMaterial({
      color: colorShift(this.def.groundDetail, -0.045, 0.04),
      flatShading: true,
    });
    // The coast side gets a real cliff instead of an embankment skirt.
    const coastSide = this.coast ? this.coast.side : 0;
    if (coastSide !== 1) {
      this.buildStrip([
        (f) => ({ x: ROAD_HALF + SHOULDER + 26, y: -0.6 }),
        (f) => ({ x: ROAD_HALF + SHOULDER, y: f.pos.y - 0.3 }),
      ], skirtMat, { uvScale: 10 });
    }
    if (coastSide !== -1) {
      this.buildStrip([
        (f) => ({ x: -ROAD_HALF - SHOULDER, y: f.pos.y - 0.3 }),
        (f) => ({ x: -ROAD_HALF - SHOULDER - 26, y: -0.6 }),
      ], skirtMat, { uvScale: 10 });
    }
  }

  buildGroundAndSky() {
    const groundT = tex.groundTexture(this.def.ground, this.def.groundDetail);
    smoothSurfaceTexture(groundT, 4);
    const mid = this.frameAt(this.length / 2).pos;
    if (this.coast) {
      // Island stage: no world plane. Land is a ribbon on the inland side out
      // to the clearance limit; the ocean covers the other side (buildCoast).
      const inland = -this.coast.side;
      groundT.repeat.set(1, 1);
      this.buildStrip([
        () => ({ x: inland * 40, y: -0.6 }),
        (f, i) => ({ x: inland * this.clearanceAt(i, inland), y: -0.6 }),
      ], new THREE.MeshLambertMaterial({ map: groundT, color: '#e6e0d2' }), {
        worldUV: 48, tag: 'land',
      });
    } else {
      groundT.repeat.set(160, 160);
      const g = new THREE.Mesh(
        new THREE.PlaneGeometry(7800, 7800),
        new THREE.MeshLambertMaterial({ map: groundT, color: '#eee7dc' }),
      );
      g.rotation.x = -Math.PI / 2;
      g.position.y = -0.6;
      // Center the ground on the middle of the stage.
      g.position.x = mid.x; g.position.z = mid.z;
      this.group.add(g);
    }

    // A generated panorama is installed as Scene.background by Race. In that
    // case these opaque meshes would cover it completely, so retain the
    // lightweight procedural sky only as an intentional fallback.
    if (!this.def.panorama) {
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
  }

  buildTerrainRelief() {
    // Broad, low-poly land bands replace the dead-flat horizon without adding
    // any colliders. They begin well outside the drivable shoulder, so this is
    // a visual-only layer and cannot alter steering, shortcuts, or OOB rules.
    const stageScale = this.def.id === 'desert' ? 1.45 : this.def.id === 'tequila' ? 1.05 : 0.78;
    const materials = [
      new THREE.MeshLambertMaterial({
        color: colorShift(this.def.groundDetail, -0.015, 0.05),
        flatShading: true,
        side: THREE.DoubleSide,
      }),
      new THREE.MeshLambertMaterial({
        color: colorShift(this.def.ground, -0.08, 0.02),
        flatShading: true,
        side: THREE.DoubleSide,
      }),
    ];
    const innerOffset = ROAD_HALF + SHOULDER + 24;
    const midOffset = innerOffset + 64;
    const outerOffset = innerOffset + 190;
    const coastSide = this.coast ? this.coast.side : 0;
    // Island stages measure relief from sea-level ground, so an elevated
    // headland road looks down over the treetops instead of dragging the
    // whole landscape uphill with it.
    const base = (f) => (this.coast ? -0.6 : f.pos.y);
    // Flatten the bands where the shortcut cuts inland so the dirt is never
    // buried under a hill.
    const sc = this.def.shortcut;
    const scS1 = sc ? sc.enter * this.length - 90 : Infinity;
    const scS2 = sc ? sc.exit * this.length + 90 : -Infinity;
    const scSide = sc ? sc.side : 0;

    [-1, 1].forEach((side, sideIndex) => {
      if (side === coastSide) return;
      const relief = (i) => {
        const s = (i / this.samples) * this.roadLength;
        const damp = side === scSide && s > scS1 && s < scS2 ? 0.08 : 1;
        const phase = i * 0.071 + sideIndex * 2.9;
        const broad = Math.sin(phase) * 0.55 + Math.sin(phase * 0.37 + 1.6) * 0.45;
        const ridge = Math.max(0, broad) * 10 * stageScale;
        return {
          mid: (1.2 + ridge * 0.35 + Math.sin(phase * 1.7) * 0.8) * damp,
          outer: (5 + ridge + Math.sin(phase * 0.53 + 0.8) * 3 * stageScale) * damp,
        };
      };
      const rows = [
        (f) => ({ x: side * innerOffset, y: Math.max(-0.5, base(f) - 0.55) }),
        (f, i) => ({ x: side * midOffset, y: base(f) - 0.45 + relief(i).mid }),
        (f, i) => ({ x: side * outerOffset, y: base(f) - 0.55 + relief(i).outer }),
      ];
      if (this.coast) {
        // Island interior: a jagged green ridge wall a few hundred units
        // inland (the pali), then back down to the plain so the ribbon never
        // ends in a ledge. Rows stay inside the tightest bend radius so the
        // strip does not fold over itself.
        const ridge = (i) => {
          const s = (i / this.samples) * this.roadLength;
          const damp = side === scSide && s > scS1 && s < scS2 ? 0.05 : 1;
          const ph = i * 0.043 + sideIndex;
          return damp * (48 + 34 * Math.sin(ph) + 22 * Math.sin(ph * 2.7 + 1.3) + 12 * Math.sin(ph * 6.1));
        };
        rows.push((f, i) => ({ x: side * (outerOffset + 190), y: -0.6 + Math.max(4, ridge(i)) }));
        rows.push(() => ({ x: side * (outerOffset + 330), y: -0.6 }));
      }
      for (let c0 = 0; c0 < this.samples; c0 += CHUNK) {
        this.buildStrip(rows, materials[(sideIndex + Math.floor(c0 / CHUNK)) % materials.length], {
          uvScale: 110,
          skipChunk: (chunkStart) => chunkStart !== c0,
        });
      }
    });
  }

  buildCoast() {
    // Hawaii shoreline: a basalt bluff drops from the shoulder to a beach,
    // a surf line, a turquoise shelf, then deep water out to the fog. All of
    // it sits at an absolute sea level well below the road.
    if (!this.coast) return;
    const side = this.coast.side;
    const sea = this.coast.seaLevel;
    const off = (d) => side * d;
    const zoneShore = (i) => (this.def.zones[this.zoneAt[Math.min(i, this.zoneAt.length - 1)]] || {}).shore || 'sand';
    const tint = {
      sand: { cliff: new THREE.Color('#ffffff'), beach: new THREE.Color('#ffffff') },
      rock: { cliff: new THREE.Color('#d8d2c8'), beach: new THREE.Color('#8f7d63') },
      lava: { cliff: new THREE.Color('#2a2a30'), beach: new THREE.Color('#2f2f36') },
    };
    const shoreTint = (kind, i) => tint[zoneShore(i)][kind];

    // The bluff face itself is hidden from a low chase camera by its own lip,
    // so the drop is sold by what lies beyond it: a wide beach far below,
    // a surf line, palms rooted at sea level, and rocks in the shallows.
    const edge = ROAD_HALF + SHOULDER;
    const cliffTex = smoothSurfaceTexture(tex.cliffTexture('rock'), 4);
    cliffTex.wrapS = cliffTex.wrapT = THREE.RepeatWrapping;
    this.buildStrip([
      (f) => ({ x: off(edge), y: f.pos.y - 0.3 }),
      (f) => ({ x: off(edge + 5), y: f.pos.y - 1.2 }),
      (f) => ({ x: off(edge + 12), y: sea + (f.pos.y - sea) * 0.45 }),
      () => ({ x: off(edge + 22), y: sea + 0.6 }),
    ], new THREE.MeshLambertMaterial({ map: cliffTex, vertexColors: true }), {
      uvScale: 12, tag: 'cliff',
      colorAt: (r, i) => shoreTint('cliff', i),
    });

    // Beach.
    const sandTex = smoothSurfaceTexture(tex.sandTexture('sand'), 4);
    this.buildStrip([
      () => ({ x: off(edge + 22), y: sea + 0.6 }),
      () => ({ x: off(edge + 50), y: sea + 0.3 }),
      () => ({ x: off(edge + 76), y: sea + 0.12 }),
    ], new THREE.MeshLambertMaterial({ map: sandTex, vertexColors: true }), {
      uvScale: 6, tag: 'beach',
      colorAt: (r, i) => shoreTint('beach', i),
    });
    this.beachOffset = edge + 22;
    this.shoreOffset = edge + 76;

    // Surf line, animated in update().
    const foamTex = tex.foamTexture();
    foamTex.wrapS = THREE.RepeatWrapping;
    const foamMat = new THREE.MeshBasicMaterial({
      map: foamTex, transparent: true, depthWrite: false, opacity: 0.9,
    });
    this.buildStrip([
      () => ({ x: off(edge + 72), y: sea + 0.1 }),
      () => ({ x: off(edge + 86), y: sea + 0.08 }),
    ], foamMat, { uvScale: 26, uvAlong: 'u', tag: 'foam' });
    this.animatedMaps.push({ map: foamTex, kind: 'foam', mat: foamMat });

    // Shallow shelf: vertex colors grade turquoise into open ocean.
    const waterTex = smoothSurfaceTexture(tex.oceanPlaneTexture(), 4);
    waterTex.repeat.set(1, 1);
    const shelfColors = ['#84f2ea', '#3ccbdc', '#2497cf', '#1a6fbf'].map((c) => new THREE.Color(c));
    const shelfMat = new THREE.MeshPhongMaterial({
      map: waterTex, vertexColors: true, shininess: 48, specular: '#8fd0ff',
    });
    this.buildStrip([
      () => ({ x: off(edge + 74), y: sea }),
      () => ({ x: off(edge + 120), y: sea - 0.02 }),
      () => ({ x: off(edge + 210), y: sea - 0.04 }),
      () => ({ x: off(370), y: sea - 0.06 }),
    ], shelfMat, {
      worldUV: 34, tag: 'shelf',
      colorAt: (r) => shelfColors[r],
    });

    // Open ocean to the clearance limit (never across another leg of road).
    const oceanMat = new THREE.MeshPhongMaterial({
      map: waterTex, color: '#1a6fbf', shininess: 48, specular: '#8fd0ff',
    });
    this.buildStrip([
      () => ({ x: off(368), y: sea - 0.08 }),
      (f, i) => ({ x: off(Math.max(420, this.clearanceAt(i, side))), y: sea - 0.1 }),
    ], oceanMat, { worldUV: 34, tag: 'ocean' });
    this.animatedMaps.push({ map: waterTex, kind: 'water' });

    // Black rocks in the shallows: flat-shaded lumps at sea level that give
    // the water a scale and make the drop from the road unmistakable.
    const rockMat = new THREE.MeshLambertMaterial({ color: '#2b2a30', flatShading: true });
    let rockSeed = 0x51ce;
    const rockRandom = () => {
      rockSeed = (Math.imul(rockSeed, 1664525) + 1013904223) >>> 0;
      return rockSeed / 0x100000000;
    };
    const rockGeos = [];
    for (let s = 90; s < this.roadLength - 60; s += 95 + rockRandom() * 110) {
      const f = this.frameAt(s);
      const count = 1 + (rockRandom() * 3) | 0;
      for (let k = 0; k < count; k++) {
        const d = edge + 78 + rockRandom() * 90;
        const p = f.pos.clone().addScaledVector(f.left, off(d)).addScaledVector(f.tan, (rockRandom() - 0.5) * 30);
        const r = 2.2 + rockRandom() * 4.5;
        const g = new THREE.DodecahedronGeometry(r, 0);
        g.applyMatrix4(new THREE.Matrix4().makeRotationY(rockRandom() * Math.PI)
          .scale(new THREE.Vector3(1.2, 0.55 + rockRandom() * 0.4, 0.9))
          .setPosition(p.x, sea - r * 0.15, p.z));
        rockGeos.push(g);
      }
      if (rockGeos.length >= 24) {
        const merged = mergeGeometries(rockGeos.splice(0));
        merged.computeBoundingSphere();
        const mesh = new THREE.Mesh(merged, rockMat);
        mesh.userData.kind = 'searock';
        this.group.add(mesh);
      }
    }
    if (rockGeos.length) {
      const merged = mergeGeometries(rockGeos);
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, rockMat);
      mesh.userData.kind = 'searock';
      this.group.add(mesh);
    }

    // Guardrail along the drop: white posts every 16 units and a rail band.
    // Regularly spaced roadside objects are what make 130 MPH feel like it.
    const railX = ROAD_HALF + SHOULDER + 0.9;
    const postGeos = [];
    for (let i = 0; i <= this.samples; i += 4) {
      const f = this.frames[i];
      const p = f.pos.clone().addScaledVector(f.left, off(railX));
      const g = new THREE.BoxGeometry(0.55, 1.5, 0.55);
      g.applyMatrix4(new THREE.Matrix4().makeRotationY(Math.atan2(f.tan.x, f.tan.z)).setPosition(p.x, p.y + 0.45, p.z));
      postGeos.push(g);
      if (postGeos.length === 40 || i + 4 > this.samples) {
        const merged = mergeGeometries(postGeos.splice(0));
        merged.computeBoundingSphere();
        const mesh = new THREE.Mesh(merged, new THREE.MeshLambertMaterial({ map: tex.guardrailTexture() }));
        mesh.userData.kind = 'guardpost';
        this.group.add(mesh);
      }
    }
    this.buildStrip([
      (f) => ({ x: off(railX), y: f.pos.y + 0.55 }),
      (f) => ({ x: off(railX + 0.01), y: f.pos.y + 1.0 }),
    ], new THREE.MeshLambertMaterial({ color: '#f2f2ee', side: THREE.DoubleSide }), {
      uvScale: 10, tag: 'guardrail',
    });
  }

  propTexture(kind) {
    this._propCache = this._propCache || {};
    if (!this._propCache[kind]) {
      let t;
      if (kind === 'palm') t = [tex.palmTexture(), 16, 24];
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
    // The authored stage keeps the shared (seedable) RNG stream so replays
    // and the deterministic sim stay bit-identical; the run-off past the
    // finish draws from a private generator so it cannot shift that stream.
    let runoffSeed = 0x9e3779b9;
    const runoffRandom = () => {
      runoffSeed = (Math.imul(runoffSeed, 1664525) + 1013904223) >>> 0;
      return runoffSeed / 0x100000000;
    };
    const coastSide = this.coast ? this.coast.side : 0;
    const towers = [];
    for (let s = 30; s < this.roadLength - 30; s += baseStep) {
      const rnd = s < this.length - 30 ? Math.random : runoffRandom;
      const zone = this.zoneDef(s);
      const props = zone.props || [];
      if (!props.length) continue;
      const count = Math.max(1, Math.round(zone.density || 1));
      for (let k = 0; k < count; k++) {
        const kind = props[(rnd() * props.length) | 0];
        const isBuilding = kind.startsWith('building');
        const isSign = kind.startsWith('sign_');
        const isTower = kind === 'tower';
        let side = rnd() > 0.5 ? 1 : -1;
        // The sea side of a coast road only takes palms (on the bluff lip or
        // rooted down on the beach) and the odd sign; everything else stays
        // inland so the drop reads.
        if (coastSide && side === coastSide && !(kind === 'palm' && rnd() < 0.7) && !isSign) side = -coastSide;
        const onCoast = coastSide && side === coastSide;
        const onBeach = onCoast && kind === 'palm' && rnd() < 0.6;
        let dist;
        if (onBeach) {
          dist = this.beachOffset + 4 + rnd() * (this.shoreOffset - this.beachOffset - 12);
        } else if (onCoast) {
          dist = ROAD_HALF + SHOULDER + 1.6 + rnd() * 2.6;
        } else if (zone.street && isBuilding) {
          dist = ROAD_HALF + SHOULDER + 2 + rnd() * 3;   // tight street canyon
        } else if (isTower) {
          dist = ROAD_HALF + SHOULDER + 16 + rnd() * 34;
        } else if (isBuilding) {
          dist = ROAD_HALF + SHOULDER + 8 + rnd() * 14;
        } else if (isSign) {
          dist = ROAD_HALF + SHOULDER + 2 + rnd() * 3;
        } else {
          // Biased toward the road edge: near objects strobe past at speed.
          const u = rnd();
          dist = ROAD_HALF + SHOULDER + 2 + u * u * 30;
        }
        const f = this.frameAt(s + rnd() * baseStep * 0.5);
        const p = f.pos.clone().addScaledVector(f.left, side * dist);
        if (onBeach) p.y = this.coast.seaLevel + 0.5;
        else if (this.coast && side !== coastSide && dist > ROAD_HALF + SHOULDER + 26) p.y = -0.6 + 0.3;
        // Text props face back toward approaching drivers (+PI), tilted
        // slightly toward the road.
        const facePlayer = isSign || kind === 'building_surf' ? Math.PI : 0;
        const angle = Math.atan2(f.tan.x, f.tan.z) + facePlayer
          + (rnd() - 0.5) * (facePlayer ? 0.2 : 0.5)
          + (isSign ? (side > 0 ? -0.35 : 0.35) : 0);
        if (isTower) {
          towers.push({ p, angle, w: 13 + rnd() * 9, h: 34 + rnd() * 38, d: 11 + rnd() * 6 });
          continue;
        }
        const scale = kind === 'palm' ? 0.85 + rnd() * 0.6 : kind === 'rock' || kind === 'lavarock' ? 0.5 + rnd() * 0.45 : 1;
        if (!placements.has(kind)) placements.set(kind, []);
        placements.get(kind).push({ p, angle, scale, side, left: f.left, s });
      }
    }
    this.buildTowers(towers);
    // Exposed for the feel/identity tests and evidence tooling.
    this.propPlacements = placements;
    this.towerPlacements = towers;

    // Merge per kind in spatial chunks of ~500 units for frustum culling.
    placements.forEach((list, kind) => {
      const [t, w, h] = this.propTexture(kind);
      if (kind === 'building') { this.buildBlockBuildings(list, t, w, h); return; }
      // Text-bearing props are single-sided so their text never mirrors.
      const hasText = kind.startsWith('sign_') || kind === 'building_surf';
      // Text stays unlit and one-sided so it reads correctly. Natural props
      // share the stage lighting, and broad foliage/rocks use crossed planes
      // so they retain volume when the road bends past them.
      const Material = hasText ? THREE.MeshBasicMaterial : THREE.MeshLambertMaterial;
      const mat = new Material({
        map: t, transparent: true, alphaTest: 0.4,
        side: hasText ? THREE.FrontSide : THREE.DoubleSide,
      });
      const crossed = new Set(['palm', 'cactus', 'rock', 'lavarock', 'hibiscus', 'agave']).has(kind);
      const chunks = new Map();
      list.forEach((item) => {
        const key = `${Math.round(item.p.x / 500)}_${Math.round(item.p.z / 500)}`;
        if (!chunks.has(key)) chunks.set(key, []);
        chunks.get(key).push(item);
      });
      chunks.forEach((items) => {
        const geos = items.flatMap(({ p, angle, scale = 1 }) => {
          const pw = w * scale;
          const ph = h * scale;
          const makePlane = (yaw) => {
            const geo = new THREE.PlaneGeometry(pw, ph);
            geo.applyMatrix4(new THREE.Matrix4().makeRotationY(yaw)
              .setPosition(p.x, p.y + ph / 2 - 0.4, p.z));
            return geo;
          };
          return crossed ? [makePlane(angle), makePlane(angle + Math.PI / 2)] : [makePlane(angle)];
        });
        const merged = mergeGeometries(geos);
        merged.computeBoundingSphere();
        const mesh = new THREE.Mesh(merged, mat);
        mesh.userData.kind = `prop_${kind}`;
        this.group.add(mesh);
      });
    });
  }

  buildTowers(towers) {
    // Resort towers are real boxes: they occlude, cast a silhouette against
    // the sky, and turn with the bend instead of flipping like a card.
    if (!towers.length) return;
    // Cream concrete plus the pink one every Waikiki skyline has.
    const walls = ['#f1e9da', '#f1e9da', '#efc7cf', '#e9e4dc'].map((wall) => (
      new THREE.MeshLambertMaterial({ map: tex.towerTexture(wall) })
    ));
    const roof = new THREE.MeshLambertMaterial({ color: '#d9d2c2' });
    towers.forEach(({ p, angle, w, h, d }, n) => {
      const geo = new THREE.BoxGeometry(w, h, d);
      const uv = geo.attributes.uv;
      // Face order: +x, -x, +y, -y, +z, -z; four verts each. One texture
      // tile is 16 units (four floors), so tall towers get more floors.
      for (let i = 0; i < uv.count; i++) {
        const face = Math.floor(i / 4);
        const faceW = face < 2 ? d : w;
        if (face === 2 || face === 3) continue;
        uv.setXY(i, uv.getX(i) * (faceW / 16), uv.getY(i) * (h / 16));
      }
      const wall = walls[n % walls.length];
      const mesh = new THREE.Mesh(geo, [wall, wall, roof, roof, wall, wall]);
      mesh.position.set(p.x, p.y + h / 2 - 0.5, p.z);
      mesh.rotation.y = angle;
      mesh.userData.kind = 'tower';
      this.group.add(mesh);
    });
  }

  buildBlockBuildings(list, wallTex, w, h) {
    // TEQUILA TOWN's adobe blocks are boxes with the facade parallel to the
    // street, so the town is a canyon with corners you drive between rather
    // than a row of cards that face the camera and vanish edge-on.
    if (!list.length) return;
    wallTex.wrapS = wallTex.wrapT = THREE.RepeatWrapping;
    const wall = new THREE.MeshLambertMaterial({ map: wallTex });
    const chunks = new Map();
    list.forEach(({ p, side, left, s }, n) => {
      // Deterministic per-placement variety without touching the seeded RNG.
      const hash = ((Math.imul(n + 1, 2654435761) >>> 0) % 1000) / 1000;
      const hash2 = ((Math.imul(n + 7, 1103515245) >>> 0) % 1000) / 1000;
      const along = w * (0.8 + hash * 0.5);
      const depth = 10 + hash2 * 8;
      const height = h * (0.75 + ((hash * 7) % 1) * 0.6);
      const geo = new THREE.BoxGeometry(along, height, depth);
      const uv = geo.attributes.uv;
      // Face order +x,-x,+y,-y,+z,-z. Walls repeat the facade tile in
      // proportion so doors and windows keep their size; the top samples a
      // sliver of the tile-roof band so the roof reads from the crest of a
      // hill without a second material.
      for (let i = 0; i < uv.count; i++) {
        const face = Math.floor(i / 4);
        if (face === 2 || face === 3) { uv.setXY(i, uv.getX(i), 0.86 + uv.getY(i) * 0.02); continue; }
        const faceW = face < 2 ? depth : along;
        uv.setXY(i, uv.getX(i) * (faceW / w), uv.getY(i) * (height / h));
      }
      // The card sat centred at p; the block's near facade stays there and
      // its depth extends away from the road. Rotating by the frame's left
      // heading puts the along x height faces parallel to the street.
      const center = p.clone().addScaledVector(left, side * depth / 2);
      const heading = Math.atan2(left.x, left.z);
      geo.applyMatrix4(new THREE.Matrix4().makeRotationY(heading)
        .setPosition(center.x, center.y + height / 2 - 0.4, center.z));
      const key = Math.floor(s / 500);
      if (!chunks.has(key)) chunks.set(key, []);
      chunks.get(key).push(geo);
    });
    chunks.forEach((items) => {
      const merged = mergeGeometries(items);
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, wall);
      mesh.userData.kind = 'prop_building';
      this.group.add(mesh);
    });
  }

  landmarkTexture(kind) {
    if (kind === 'volcano') return tex.volcanoTexture();
    if (kind === 'cruiseShip') return tex.cruiseShipTexture();
    if (kind === 'mesaBig') return tex.mesaBigTexture();
    if (kind === 'dinerSign') return tex.dinerSignTexture();
    if (kind === 'townGate') return tex.townGateTexture();
    if (kind === 'alohaGate') return tex.alohaGateTexture();
    if (kind === 'route66Gate') return tex.route66GateTexture();
    if (kind === 'church') return tex.churchTexture();
    if (kind === 'fountain') return tex.fountainTexture();
    if (kind === 'cantinaNeon') return tex.cantinaNeonTexture();
    return tex.rockTexture();
  }

  // Diamond Head: a tuff-cone crater with an irregular rim that peaks on the
  // seaward side, flat-shaded and vertex-colored khaki/olive like the real
  // thing. Built as geometry so it has parallax and occludes the horizon.
  buildCrater(center, radius, height, seaward, opts = {}) {
    const segs = 40;
    const rings = opts.rings || [
      { rr: 1.0, hh: 0.0 }, { rr: 0.84, hh: 0.16 }, { rr: 0.66, hh: 0.5 },
      { rr: 0.5, hh: 1.0 }, { rr: 0.32, hh: 0.66 }, { rr: 0.0, hh: 0.56 },
    ];
    const peak = Math.atan2(seaward.z, seaward.x);
    const verts = []; const cols = []; const idx = [];
    const palette = opts.palette || { low: '#8f9350', mid: '#bda06a', high: '#a0865a' };
    const low = new THREE.Color(palette.low);
    const mid = new THREE.Color(palette.mid);
    const high = new THREE.Color(palette.high);
    const c = new THREE.Color();
    rings.forEach((ring, ri) => {
      for (let k = 0; k <= segs; k++) {
        const th = (k / segs) * Math.PI * 2;
        // Radial gullies give the flanks the fluted look of a tuff cone.
        const wobble = 1 + 0.07 * Math.sin(th * 3 + 0.6) + 0.045 * Math.sin(th * 7 + 2.1)
          + (ri === 1 || ri === 2 ? 0.06 * Math.sin(th * 13 + ri) : 0);
        const profile = 0.52 + 0.48 * Math.pow(Math.max(0, Math.cos(th - peak)), 1.6)
          + 0.05 * Math.sin(th * 5 + 1) + 0.06 * Math.sin(th * 13);
        const r = radius * ring.rr * (ri === 0 ? 1 : wobble);
        const y = height * ring.hh * (ri === 0 ? 0 : profile);
        verts.push(center.x + Math.cos(th) * r, center.y + y, center.z + Math.sin(th) * r);
        const t = y / height;
        if (t < 0.4) c.copy(low).lerp(mid, t / 0.4); else c.copy(mid).lerp(high, (t - 0.4) / 0.6);
        // Gully shading across the slopes, greener in the folds.
        c.offsetHSL(0.02 * Math.max(0, Math.sin(th * 9 + ri)), 0, 0.07 * Math.sin(th * 9 + ri));
        cols.push(c.r, c.g, c.b);
      }
    });
    const stride = segs + 1;
    for (let ri = 0; ri < rings.length - 1; ri++) {
      for (let k = 0; k < segs; k++) {
        const a = ri * stride + k; const b = a + 1; const d = a + stride; const e = d + 1;
        idx.push(a, b, d, b, e, d);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({
      vertexColors: true, flatShading: true, fog: false, side: THREE.DoubleSide,
    }));
    mesh.userData.kind = opts.kind || 'diamondHead';
    mesh.userData.radius = radius;
    mesh.userData.center = center.clone();
    mesh.userData.peak = new THREE.Vector3(
      center.x + Math.cos(peak) * radius * 0.5, center.y + height, center.z + Math.sin(peak) * radius * 0.5,
    );
    this.group.add(mesh);
    this.landmarkMeshes = this.landmarkMeshes || [];
    this.landmarkMeshes.push(mesh);
    return mesh;
  }

  // Monument Valley butte: talus skirt, sheer banded walls, flat cap. Real
  // geometry so the last third of DESERT HIGHWAY has parallax instead of a
  // painted mesa that never gets closer.
  buildButte(center, radius, height, n = 0) {
    const segs = 28;
    const rings = [
      { rr: 1.0, hh: 0.0 }, { rr: 0.86, hh: 0.14 }, { rr: 0.74, hh: 0.34 },
      { rr: 0.72, hh: 0.72 }, { rr: 0.66, hh: 1.0 }, { rr: 0.0, hh: 1.0 },
    ];
    const verts = []; const cols = []; const idx = [];
    const talus = new THREE.Color('#c98a58');
    const wall = new THREE.Color('#b0552f');
    const band = new THREE.Color('#84391f');
    const cap = new THREE.Color('#cf7444');
    const c = new THREE.Color();
    rings.forEach((ring, ri) => {
      for (let k = 0; k <= segs; k++) {
        const th = (k / segs) * Math.PI * 2;
        // Buttresses and alcoves; the same wobble on every wall ring keeps
        // the cliff faces vertical.
        const wobble = 1 + 0.09 * Math.sin(th * 2 + n) + 0.06 * Math.sin(th * 5 + 1.3 * n) + 0.035 * Math.sin(th * 11);
        const r = radius * ring.rr * (ri === 0 ? 1 : wobble);
        const y = height * ring.hh;
        verts.push(center.x + Math.cos(th) * r, center.y + y, center.z + Math.sin(th) * r);
        if (ri <= 1) c.copy(talus).lerp(wall, ri);
        else if (ri === 2) c.copy(wall);
        else if (ri === 3) c.copy(band).lerp(wall, 0.35);
        else c.copy(cap);
        c.offsetHSL(0, 0, 0.05 * Math.sin(th * 7 + ri * 2));
        cols.push(c.r, c.g, c.b);
      }
    });
    const stride = segs + 1;
    for (let ri = 0; ri < rings.length - 1; ri++) {
      for (let k = 0; k < segs; k++) {
        const a = ri * stride + k; const b = a + 1; const d = a + stride; const e = d + 1;
        idx.push(a, b, d, b, e, d);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({
      vertexColors: true, flatShading: true, fog: false, side: THREE.DoubleSide,
    }));
    mesh.userData.kind = 'butte';
    mesh.userData.radius = radius;
    mesh.userData.center = center.clone();
    this.group.add(mesh);
    this.landmarkMeshes = this.landmarkMeshes || [];
    this.landmarkMeshes.push(mesh);
    return mesh;
  }

  buildLighthouse(p, w, h) {
    const group = new THREE.Group();
    const tower = new THREE.Mesh(
      new THREE.CylinderGeometry(w * 0.34, w * 0.5, h, 10),
      new THREE.MeshLambertMaterial({ color: '#f6f3ea' }),
    );
    tower.position.set(p.x, p.y + h / 2, p.z);
    const lamp = new THREE.Mesh(
      new THREE.CylinderGeometry(w * 0.4, w * 0.4, h * 0.14, 10),
      new THREE.MeshLambertMaterial({ color: '#c8262d' }),
    );
    lamp.position.set(p.x, p.y + h + h * 0.07, p.z);
    group.add(tower, lamp);
    group.userData.kind = 'lighthouse';
    this.group.add(group);
  }

  buildLandmarks() {
    // Landmarks render with fog disabled so they read from far away.
    (this.def.landmarks || []).forEach((lm) => {
      // The authored panoramas already carry the broad postcard silhouettes.
      // Keep gates and near hero props in 3D, but do not stamp a second giant
      // volcano, cruise ship, or mesa over the painted one.
      if (this.def.panorama && ['volcano', 'cruiseShip', 'mesaBig'].includes(lm.kind) && !lm.r) return;
      const s = lm.at * this.length;
      const f = this.frameAt(s);
      const p = f.pos.clone().addScaledVector(f.left, lm.x);
      if (lm.kind === 'mesaBig' && lm.r) {
        p.y = -0.6;
        this.buildButte(p, lm.r, lm.h || 200, Math.round(lm.at * 100));
        return;
      }
      if (lm.kind === 'diamondHead') {
        const seaward = f.left.clone().multiplyScalar(Math.sign(lm.x) || 1);
        p.y = this.coast ? this.coast.seaLevel - 0.3 : -0.6;
        this.buildCrater(p, lm.r || 400, lm.h || 200, seaward);
        return;
      }
      if (lm.kind === 'volcano' && lm.r) {
        // A shield volcano far inland: forested skirt, bare brown flanks,
        // dark summit. Its near rim faces the road so the cone reads as a
        // silhouette above the ridge for the back half of the stage.
        const toRoad = f.left.clone().multiplyScalar(-(Math.sign(lm.x) || 1));
        p.y = -0.8;
        this.buildCrater(p, lm.r, lm.h || 400, toRoad, {
          kind: 'volcano',
          palette: { low: '#6f7d46', mid: '#6b5748', high: '#3d3634' },
          rings: [
            { rr: 1.0, hh: 0.0 }, { rr: 0.8, hh: 0.2 }, { rr: 0.55, hh: 0.56 },
            { rr: 0.3, hh: 1.0 }, { rr: 0.18, hh: 0.86 }, { rr: 0.0, hh: 0.8 },
          ],
        });
        return;
      }
      if (lm.kind === 'lighthouse') {
        p.y = this.coast ? this.coast.seaLevel + 0.4 : p.y;
        this.buildLighthouse(p, lm.w || 6, lm.h || 20);
        return;
      }
      const isGate = ['townGate', 'alohaGate', 'route66Gate'].includes(lm.kind);
      const hasText = ['townGate', 'alohaGate', 'route66Gate', 'dinerSign', 'cantinaNeon'].includes(lm.kind);
      const mat = new THREE.MeshBasicMaterial({
        map: this.landmarkTexture(lm.kind),
        transparent: true, alphaTest: 0.35,
        side: hasText ? THREE.FrontSide : THREE.DoubleSide,
        fog: Math.abs(lm.x) < 120 ? true : false,
      });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(lm.w, lm.h), mat);
      m.position.set(p.x, p.y + lm.h / 2 - 0.4 + (lm.kind === 'cruiseShip' ? -2 : 0), p.z);
      // Face approaching drivers; angle far-off landmarks slightly.
      m.rotation.y = this.headingAt(s) + Math.PI
        + (isGate || Math.abs(lm.x) < 60 ? 0 : 0.55 * (lm.x > 0 ? -1 : 1));
      this.group.add(m);
      // Large image-only postcard landmarks face the chase camera. Fixed
      // planes went edge-on on winding approaches, making Hawaii read as
      // generic palms until the landmark was already behind the player.
      if (!hasText && !isGate) this.billboardLandmarks.push(m);
    });
  }

  orientLandmarks(cameraPos) {
    this.billboardLandmarks.forEach((m) => {
      m.rotation.y = Math.atan2(cameraPos.x - m.position.x, cameraPos.z - m.position.z);
    });
  }

  buildArchFrame(f, heading, label, bg, fg, half = ROAD_HALF + 2) {
    const group = new THREE.Group();
    const pillarGeo = new THREE.BoxGeometry(1.8, 10, 1.8);
    const pillarMat = new THREE.MeshLambertMaterial({ color: '#d7d2cb' });
    [half, -half].forEach((off) => {
      const p = new THREE.Mesh(pillarGeo, pillarMat);
      const pos = f.pos.clone().addScaledVector(f.left, off);
      p.position.set(pos.x, pos.y + 5, pos.z);
      group.add(p);
    });
    const banner = new THREE.Mesh(
      new THREE.PlaneGeometry(half * 2 + 2, 4.4),
      new THREE.MeshBasicMaterial({ map: tex.archTexture(label, bg, fg), side: THREE.FrontSide }),
    );
    banner.position.set(f.pos.x, f.pos.y + 11.6, f.pos.z);
    banner.rotation.y = heading + Math.PI;
    group.add(banner);
    this.group.add(group);
    return group;
  }

  buildArchAt(s, label, bg, fg) {
    return this.buildArchFrame(this.frameAt(s), this.headingAt(s), label, bg, fg);
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
    const mat = new THREE.MeshLambertMaterial({
      color: '#e7ad43', side: THREE.DoubleSide, emissive: '#2a1603', emissiveIntensity: 0.22,
    });
    const side = new THREE.MeshLambertMaterial({ color: '#9e611d', side: THREE.DoubleSide });
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
      geo.setIndex([0, 2, 1, 1, 2, 3]);
      geo.computeVertexNormals();
      this.group.add(new THREE.Mesh(geo, mat));
      const back = new THREE.BufferGeometry();
      back.setAttribute('position', new THREE.Float32BufferAttribute([
        tl.x, tl.y + hgt, tl.z, tr.x, tr.y + hgt, tr.z,
        tl.x, tl.y - 0.4, tl.z, tr.x, tr.y - 0.4, tr.z,
      ], 3));
      back.setIndex([0, 1, 2, 1, 3, 2]);
      back.computeVertexNormals();
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
    // Cut the chord across the bend. The previous version sampled the main
    // road for its middle points, accidentally making the "shortcut" longer
    // than the route it bypassed on Desert Highway.
    const start = this.worldPos(s1, side * (ROAD_HALF - 2));
    const end = this.worldPos(s2, side * (ROAD_HALF - 4));
    const mid1 = start.clone().lerp(end, 0.32).addScaledVector(f1.left, side * 24);
    const mid2 = start.clone().lerp(end, 0.68).addScaledVector(f2.left, side * 24);
    const pts = [
      start,
      start.clone().lerp(mid1, 0.38),
      mid1, mid2,
      mid2.clone().lerp(end, 0.62),
      end,
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
    // Dirt road mesh plus a grass apron that drops to the plain, so the cut
    // sits on an embankment instead of floating above the ground.
    const dirtTex = smoothSurfaceTexture(tex.dirtRoadTexture(), 4);
    const mat = new THREE.MeshLambertMaterial({ map: dirtTex, color: '#f0d2a5' });
    const w = 9;
    this.buildStrip([
      (f) => ({ x: w / 2, y: f.pos.y + 0.08 }),
      (f) => ({ x: -w / 2, y: f.pos.y + 0.08 }),
    ], mat, { frames, uvScale: 9, extendStart: false, tag: 'shortcut' });
    const apronMat = new THREE.MeshLambertMaterial({
      color: colorShift(this.def.ground, -0.03, 0.02), flatShading: true,
    });
    [1, -1].forEach((side) => {
      this.buildStrip([
        (f) => ({ x: side * (w / 2 - 0.2), y: f.pos.y + 0.04 }),
        (f) => ({ x: side * (w / 2 + 6), y: Math.max(-0.58, f.pos.y - 0.8) }),
        () => ({ x: side * (w / 2 + 40), y: -0.58 }),
      ], apronMat, { frames, uvScale: 20, extendStart: false, tag: 'shortcut_apron' });
    });

    // Oversized entrance sign plus three chevrons: shortcuts should be a
    // readable route choice at speed, not a secret pixel hunt.
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(19, 10),
      new THREE.MeshBasicMaterial({
        map: tex.archTexture(`${sc.label || 'SHORTCUT'} >`, '#7c3fa0', '#ffd23d'),
        transparent: true, side: THREE.FrontSide,
      }),
    );
    const sp = this.worldPos(s1 - 58, side * (ROAD_HALF + 7));
    sign.position.set(sp.x, sp.y + 7, sp.z);
    sign.rotation.y = this.headingAt(s1 - 58) + Math.PI;
    this.group.add(sign);

    const arrowMap = tex.archTexture('>>>', '#ffcf24', '#3a126b');
    for (let i = 0; i < 3; i++) {
      const markerS = s1 - 34 + i * 13;
      const marker = new THREE.Mesh(
        new THREE.PlaneGeometry(8, 4.5),
        new THREE.MeshBasicMaterial({
          map: arrowMap, transparent: true, side: THREE.FrontSide,
        }),
      );
      const mp = this.worldPos(markerS, side * (ROAD_HALF + 2.5));
      marker.position.set(mp.x, mp.y + 3.1, mp.z);
      marker.rotation.y = this.headingAt(markerS) + Math.PI;
      this.group.add(marker);
    }

    this.shortcut = {
      s1, s2, side, curve, len, frames,
      savedDistance: Math.max(0, (s2 - s1) - len),
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
    this.buildShortcutCheckpoints();
  }

  buildShortcutCheckpoints() {
    this.branchCheckpoints = [];
    if (!this.shortcut) return;
    const sc = this.shortcut;
    this.checkpoints.filter((cp) => cp > sc.s1 && cp < sc.s2).forEach((cp) => {
      // Player virtual progress is linear in shortcut arc length, so place the
      // branch banner at the exact physical point where the clock bonus fires.
      const ss = ((cp - sc.s1) / (sc.s2 - sc.s1)) * sc.len;
      const f = sc.frameAt(ss);
      const heading = Math.atan2(f.tan.x, f.tan.z);
      this.buildArchFrame(f, heading, 'CHECKPOINT', '#7c3fa0', '#ffd23d', 6.2);
      this.branchCheckpoints.push({ cp, ss });
    });
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
    this.animatedMaps.forEach((entry) => {
      if (entry.kind === 'water') {
        entry.map.offset.set(Math.sin(time * 0.21) * 0.02, time * 0.012);
      } else if (entry.kind === 'foam') {
        entry.map.offset.x = time * 0.03;
        entry.map.offset.y = Math.sin(time * 1.3) * 0.08;
        entry.mat.opacity = 0.7 + 0.25 * Math.sin(time * 1.3 + 1);
      }
    });
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
  // Lit materials need a normal attribute. Without one the shader normalizes
  // a zero vector (NaN) and every merged prop renders as a black silhouette.
  out.computeVertexNormals();
  return out;
}
