// Race engine: point-to-point stage, 7-car pack, oncoming traffic,
// double-tap-gas wheelie turbo, two-wheel and flip stunts, hittable
// animals, one real shortcut, checkpoint clock with DNF.
import * as THREE from '../vendor/three.module.js';
import { Track, ROAD_HALF, SHOULDER, LANE_PLAYER, LANE_ONCOMING } from './track.js?v=world-feel-2';
import * as tex from './tex.js?v=world-feel-2';
import { audio } from './audio.js?v=world-feel-2';
import { buildVehicle } from './vehicles.js?v=world-feel-2';

const MAX_X = ROAD_HALF + SHOULDER - 1.5;
const WHEELIE_TIME = 1.9;
const TWOWHEEL_TIME = 1.05;

const texLoader = new THREE.TextureLoader();
const spriteCache = new Map();
// The deterministic Node test harness provides canvases but deliberately has
// no browser Image element. Keep its procedural fallbacks while the real game
// uses the authored WebP art.
const externalImageLoading = typeof Image !== 'undefined'
  && typeof Image.prototype?.addEventListener === 'function';
function loadSprite(url) {
  if (!spriteCache.has(url)) {
    const t = texLoader.load(url);
    t.magFilter = THREE.LinearFilter;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.generateMipmaps = true;
    t.anisotropy = 8;
    t.colorSpace = THREE.SRGBColorSpace;
    spriteCache.set(url, t);
  }
  return spriteCache.get(url);
}

// How much world yaw (radians) one 16:9 panorama painting spans. The visible
// window slides across the art as the road bends, so the volcano, mesas, and
// church stay in a fixed compass direction like a cabinet's scrolling backdrop.
const PANORAMA_SPAN = 2.6;
const PANORAMA_ASPECT = 16 / 9;

const panoramaCache = new Map();
function loadPanorama(url) {
  if (!panoramaCache.has(url)) {
    const t = texLoader.load(url);
    t.magFilter = THREE.LinearFilter;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.generateMipmaps = true;
    t.colorSpace = THREE.SRGBColorSpace;
    // Mirrored wrap: long bends scroll past the painting's edge into a
    // reflected copy instead of a hard seam or a smeared clamp.
    t.wrapS = THREE.MirroredRepeatWrapping;
    t.wrapT = THREE.ClampToEdgeWrapping;
    panoramaCache.set(url, t);
  }
  return panoramaCache.get(url);
}

// Billboard quad with its pivot at the bottom center so wheelies/rolls
// rotate around the wheels, not the middle of the sprite.
function makeQuad(texture, w, h, mirrorable = true) {
  const geo = new THREE.PlaneGeometry(w, h);
  geo.translate(0, h / 2, 0);
  const mat = new THREE.MeshBasicMaterial({
    map: texture, transparent: true, alphaTest: 0.12, side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.order = 'YXZ';
  return mesh;
}

class PackCar {
  constructor(racer, track, isPlayer, gridIndex) {
    this.racer = racer;
    this.track = track;
    this.isPlayer = isPlayer;
    this.gridIndex = gridIndex;
    this.s = 6 - Math.floor(gridIndex / 2) * 8;
    this.x = LANE_PLAYER + (gridIndex % 2 === 0 ? 2.6 : -2.6);
    this.mode = 'road';           // road | shortcut
    this.ss = 0;                  // arc position inside the shortcut
    this.speed = 0;
    this.lateralVel = 0;
    this.yOff = 0;
    this.vy = 0;
    this.grounded = true;
    this.finished = false;
    this.finishTime = 0;
    this.beansGot = 0;
    this.stuntsLanded = 0;
    // Stunt state.
    this.wheelieT = 0;
    this.wheelieCooldown = 0;
    this.twoWheelT = 0;
    this.twoWheelDir = 0;
    this.twoWheelClean = false;
    this.flipping = false;
    this.flipProg = 0;
    this.flipAxis = 'x';
    this.spinT = 0;
    this.spinYaw = 0;
    this.crashHold = 0;
    this.recoveryT = 0;
    this.invuln = 0;
    this.airTime = 0;
    this.airSource = null;
    this.crestCooldown = 0;
    this.lean = 0;
    this.wanderPhase = Math.random() * Math.PI * 2;
    this.aiWheelieT = 0;

    const w = racer.spriteWidth;
    // Select cards retain the Videomaker originals. In-race named cars use
    // high-resolution, straight-rear illustrated sprites; the canvas cabinet
    // drawings remain only as a fallback and as a straight front angle.
    const hasPremiumRear = !!racer.raceRearSprite && externalImageLoading;
    const namedRearT = hasPremiumRear ? null : tex.namedCarRearTexture(racer.id);
    const namedFrontT = tex.namedCarFrontTexture(racer.id);
    const rearT = hasPremiumRear
      ? loadSprite(racer.raceRearSprite)
      : namedRearT || (racer.rearSprite ? loadSprite(racer.rearSprite) : tex.rivalRearTexture(racer.color));
    // Until matching premium fronts exist, keep the illustrated rear during a
    // spin instead of popping to a 160x112 drawing mid-crash.
    const frontT = hasPremiumRear
      ? rearT
      : namedFrontT || (racer.frontSprite ? loadSprite(racer.frontSprite) : rearT);
    const img = rearT.image;
    const ratio = hasPremiumRear
      ? racer.raceRearAspect || 0.68
      : (img && img.height) ? img.height / img.width : 0.55;
    this.h = w * ((racer.rearSprite || hasPremiumRear) ? Math.max(0.45, Math.min(0.85, ratio)) : 0.72);
    this.rearT = rearT;
    this.frontT = frontT;
    this.mesh = makeQuad(rearT, w, this.h);
    // The old cabinet crop inflated the player by 55%, then parked the camera
    // almost on the rear bumper. Keep the hero car substantial, but leave
    // enough road in frame to read rivals and traffic.
    // Keep the chase car prominent without letting it hide nearby traffic.
    // Correct per-sprite aspect ratios provide the height; only a subtle
    // player emphasis is needed now that the camera is higher and wider.
    this.visualScale = isPlayer ? 1.04 : 1;
    this.showingFront = false;
    this.mirror = 1;

    this.shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(w * 0.95, w * 0.5),
      new THREE.MeshBasicMaterial({ map: tex.blobShadowTexture(), transparent: true, depthWrite: false }),
    );
    this.shadow.rotation.x = -Math.PI / 2;
    this.group = new THREE.Group();
    this.group.add(this.mesh, this.shadow);
  }

  worldPos(out) {
    if (this.mode === 'shortcut' && this.track.shortcut) {
      const f = this.track.shortcut.frameAt(this.ss);
      out = out || new THREE.Vector3();
      return out.copy(f.pos).addScaledVector(f.left, this.sx || 0);
    }
    return this.track.worldPos(this.s, this.x, out);
  }
}

class Traffic {
  constructor(track, oncoming, index, total) {
    this.track = track;
    this.oncoming = oncoming;
    // A semi deliberately runs the cruising lane. A cold player should
    // encounter the wheelie/leapfrog lesson without hunting for it.
    // One authored wrong-lane semi teaches the wheelie. Earlier builds used
    // three short-loop semis, which turned Hawaii into either endless bonus
    // farming or an unavoidable crash spam wall.
    this.wrongWay = oncoming && index === 0;
    const kindRoll = Math.random();
    if (oncoming) {
      if (this.wrongWay || kindRoll < 0.34) this.kind = 'semi';
      else if (kindRoll < 0.55) this.kind = 'bus';
      else this.kind = 'sedan';
    } else {
      this.kind = 'sedan';
    }
    const colors = ['#4f8fe0', '#7fbf5a', '#c9c9d4', '#a065c9', '#e0b34f', '#d9612c', '#e8e8ec'];
    const semiColors = ['#2a4fd6', '#c8262d', '#1f9e46', '#e8e8ec'];
    const color = (this.kind === 'semi' ? semiColors : colors)[(Math.random() * (this.kind === 'semi' ? semiColors.length : colors.length)) | 0];
    // Real 3D vehicles: they show a flank on bends, their wheels turn, and
    // their length is what the collision and leapfrog windows measure.
    const built = buildVehicle(this.kind, color);
    this.body = built.group;
    this.body.rotation.order = 'YXZ';
    this.wheels = built.wheels;
    this.halfLen = built.halfLen;
    this.w = built.w;
    this.h = built.h;
    this.shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(this.w * 1.1, this.halfLen * 2.1),
      new THREE.MeshBasicMaterial({ map: tex.blobShadowTexture(), transparent: true, depthWrite: false }),
    );
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.y = 0.06;
    this.body.add(this.shadow);
    this.group = new THREE.Group();
    this.group.add(this.body);
    // Spread the fleet along the road.
    // Offset the same-way stream by half a slot. Previously its first car and
    // the authored wrong-lane semi spawned at the exact same distance, making
    // an invisible two-vehicle wall before the player had learned the wheelie.
    const slot = oncoming ? index : index + 0.5;
    this.s = 220 + (slot / total) * (track.length - 400);
    this.x = (this.wrongWay ? LANE_PLAYER : oncoming ? LANE_ONCOMING : LANE_PLAYER)
      + (Math.random() - 0.5) * (this.wrongWay ? 1.2 : 3);
    this.speed = oncoming ? 24 + Math.random() * 14 : 19 + Math.random() * 9;
    this.cruiseSpeed = this.speed;
    this.clearedBy = 0; // leapfrog cooldown flag
    this.crashT = 0;
    this.crashSpin = 0;
    this.retired = false;
  }
}

const ANIMAL_DEFS = {
  cow: { tex: () => tex.cowTexture(), w: 5.4, h: 3.9, cry: 'moo', cost: 0.42, cross: 3.2 },
  donkey: { tex: () => tex.donkeyTexture(), w: 4.8, h: 3.7, cry: 'heehaw', cost: 0.45, cross: 3.8 },
  pig: { tex: () => tex.pigTexture(), w: 3.6, h: 2.6, cry: 'squeal', cost: 0.55, cross: 5 },
  armadillo: { tex: () => tex.armadilloTexture(), w: 2.8, h: 1.9, cry: 'thud', cost: 0.65, cross: 4.2 },
  chicken: { tex: () => tex.chickenTexture(), w: 2.2, h: 2.2, cry: 'cluck', cost: 0.7, cross: 6 },
  seagull: { tex: () => tex.seagullTexture(), w: 3.0, h: 1.8, cry: 'squawk', cost: 0.82, cross: 0, flies: true },
};

class Animal {
  constructor(track, kind, index, count) {
    this.track = track;
    this.kind = kind;
    this.def = ANIMAL_DEFS[kind];
    this.mesh = makeQuad(this.def.tex(), this.def.w, this.def.h);
    this.group = new THREE.Group();
    this.group.add(this.mesh);
    this.reset(300 + ((index + Math.random() * 0.6) / count) * (track.length - 800));
    this.hitT = 0;
  }

  reset(s) {
    this.s = s;
    this.side = Math.random() > 0.5 ? 1 : -1;
    this.x = this.def.flies
      ? LANE_PLAYER + (Math.random() - 0.5) * 6
      : this.side * (ROAD_HALF + 3 + Math.random() * 3);
    this.crossing = false;
    this.flying = 0;
    this.alive = true;
    this.hitT = 0;
    this.y = 0;
  }
}

export class Race {
  constructor(opts) {
    // opts: { trackDef, racers, playerIndex, demo, onEvent }
    this.opts = opts;
    this.demo = !!opts.demo;
    this.onEvent = opts.onEvent || (() => {});
    this.scene = new THREE.Scene();
    this.track = new Track(opts.trackDef);
    this.scene.add(this.track.group);
    // Long draw distance: haze starts far out, landmarks ignore fog entirely.
    const fogRange = opts.trackDef.fog || [620, 2300];
    this.scene.fog = new THREE.Fog(opts.trackDef.fogColor, fogRange[0], fogRange[1]);
    this.panoramaTexture = opts.trackDef.panorama && externalImageLoading
      ? loadPanorama(opts.trackDef.panorama)
      : null;
    this.scene.background = this.panoramaTexture || new THREE.Color(opts.trackDef.sky[0]);
    this.camera = new THREE.PerspectiveCamera(71, 16 / 9, 0.5, 9000);
    this.tmpV2 = new THREE.Vector3();
    this.updatePanoramaCrop();

    // Legend-style lighting discipline without mobile-expensive dynamic
    // shadows: baked sprite lighting plus one warm key and a stage-tinted sky.
    const lightProfiles = {
      hawaii: { sky: 0xbfeaff, ground: 0x31593c, sun: 0xffdf9d, hemi: 1.65, key: 2.2 },
      desert: { sky: 0xffd39a, ground: 0x563a2e, sun: 0xffb35c, hemi: 1.55, key: 2.35 },
      tequila: { sky: 0x9b78d0, ground: 0x3a263d, sun: 0xffa55f, hemi: 1.45, key: 2.15 },
    };
    const lp = lightProfiles[opts.trackDef.id] || lightProfiles.hawaii;
    this.scene.add(new THREE.HemisphereLight(lp.sky, lp.ground, lp.hemi));
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.28));
    const stageMid = this.track.frameAt(this.track.length * 0.5).pos;
    const sun = new THREE.DirectionalLight(lp.sun, lp.key);
    sun.position.copy(stageMid).add(new THREE.Vector3(-900, 1300, -700));
    sun.target.position.copy(stageMid);
    this.scene.add(sun, sun.target);

    this.cars = opts.racers.map((r, i) => {
      const car = new PackCar(r, this.track, !this.demo && i === opts.playerIndex, i);
      this.scene.add(car.group);
      return car;
    });
    this.player = this.demo ? this.cars[0] : this.cars[opts.playerIndex];
    this.cars.forEach((car) => { car.wasAhead = car.s > this.player.s; });

    // Traffic fleet.
    this.traffic = [];
    const tDef = opts.trackDef.traffic || { oncoming: 8, same: 4 };
    for (let i = 0; i < tDef.oncoming; i++) {
      const v = new Traffic(this.track, true, i, tDef.oncoming);
      this.scene.add(v.group);
      this.traffic.push(v);
    }
    for (let i = 0; i < tDef.same; i++) {
      const v = new Traffic(this.track, false, i, tDef.same);
      this.scene.add(v.group);
      this.traffic.push(v);
    }

    // Animals.
    this.animals = [];
    (opts.trackDef.animals || []).forEach((a) => {
      for (let i = 0; i < a.count; i++) {
        const an = new Animal(this.track, a.kind, i, a.count);
        this.scene.add(an.group);
        this.animals.push(an);
      }
    });

    this.state = this.demo ? 'race' : 'pre';
    this.raceTime = 0;
    this.stuntCredit = 0;
    this.timeLeft = opts.trackDef.startTime;
    this.countdownT = 0;
    this.time = 0;
    this.nextCheckpoint = 0;
    this.finishOrder = [];
    this.shake = 0;
    this.lastBumpSound = 0;
    this.lastHonk = 0;
    this.danger = false;
    // Default is the low, close, wide cabinet chase. The helicopter view is
    // still available for players who want to read the whole pack.
    this.cameraModes = ['ARCADE CHASE', 'HIGH CHASE', 'BUMPER'];
    this.cameraMode = 0;
    this.speedRumble = 0;

    this.initParticles();
    this.tmpV = new THREE.Vector3();
    this.tmpV2 = new THREE.Vector3();
  }

  initParticles() {
    this.systems = [];
    const mk = (color, size) => {
      const N = 70;
      const pos = new Float32Array(N * 3);
      const vel = new Float32Array(N * 3);
      const life = new Float32Array(N);
      for (let i = 0; i < N; i++) pos[i * 3 + 1] = -999;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      // Normal blending with modest alpha: the close chase camera sits right
      // in the exhaust cloud, and additive puffs whited out the whole frame.
      const mat = new THREE.PointsMaterial({
        map: tex.fartPuffTexture(), size, transparent: true, depthWrite: false,
        blending: THREE.NormalBlending, opacity: 0.5, sizeAttenuation: true, color,
      });
      const points = new THREE.Points(geo, mat);
      points.frustumCulled = false;
      this.scene.add(points);
      const sys = { N, pos, vel, life, geo, idx: 0 };
      this.systems.push(sys);
      return sys;
    };
    this.fartSys = mk('#9fe56a', 1.9);
    this.dustSys = mk('#d9c9a5', 2.0);
  }

  emit(sys, p, v, spread = 0.6) {
    const i = sys.idx;
    sys.idx = (sys.idx + 1) % sys.N;
    sys.pos[i * 3] = p.x + (Math.random() - 0.5) * spread;
    sys.pos[i * 3 + 1] = p.y + (Math.random() - 0.5) * spread;
    sys.pos[i * 3 + 2] = p.z + (Math.random() - 0.5) * spread;
    sys.vel[i * 3] = v.x + (Math.random() - 0.5) * 2;
    sys.vel[i * 3 + 1] = 1.4 + Math.random() * 1.6;
    sys.vel[i * 3 + 2] = v.z + (Math.random() - 0.5) * 2;
    sys.life[i] = 0.9;
  }

  updateParticles(dt) {
    this.systems.forEach((sys) => {
      for (let i = 0; i < sys.N; i++) {
        if (sys.life[i] > 0) {
          sys.life[i] -= dt;
          sys.pos[i * 3] += sys.vel[i * 3] * dt;
          sys.pos[i * 3 + 1] += sys.vel[i * 3 + 1] * dt;
          sys.pos[i * 3 + 2] += sys.vel[i * 3 + 2] * dt;
          if (sys.life[i] <= 0) sys.pos[i * 3 + 1] = -999;
        }
      }
      sys.geo.attributes.position.needsUpdate = true;
    });
  }

  startCountdown() {
    this.state = 'count';
    this.countdownT = 0;
    this.countShown = 0;
  }

  // ---------------- per frame ----------------
  update(dt, input) {
    this.time += dt;
    this.track.update(this.time);

    if (this.state === 'count') {
      this.countdownT += dt;
      const n = Math.floor(this.countdownT) + 1;
      if (n !== this.countShown && n <= 3) {
        this.countShown = n;
        this.onEvent('count', 4 - n);
      }
      if (this.countdownT >= 3) {
        this.state = 'race';
        this.onEvent('go');
      }
    }

    const racing = this.state === 'race';
    let clockExpired = false;
    if (racing && !this.demo && !this.player.finished) {
      this.raceTime += dt;
      this.timeLeft -= dt;
      if (this.timeLeft <= 0) {
        this.timeLeft = 0;
        // Resolve this frame's movement before calling the race. Crossing a
        // checkpoint on the final tick must be a genuine clock save.
        clockExpired = true;
      }
    }

    this.cars.forEach((car) => { car.frameStartS = car.s; });
    this.cars.forEach((car) => {
      if (car.isPlayer && !this.demo) {
        this.updatePlayer(car, dt, racing && !car.finished ? input : null);
      } else {
        this.updateAI(car, dt, racing || this.demo);
      }
      this.airPhysics(car, dt);
    });

    if (!this.demo) this.updatePassEvents();
    this.updateTraffic(dt);
    this.updateAnimals(dt);
    this.resolvePackCollisions(dt);
    if (!this.demo) this.checkProgress();
    if (!this.demo) this.checkFinishes(dt);
    if (clockExpired && this.state === 'race' && !this.player.finished && this.timeLeft <= 0) {
      this.endRace(true);
    }
    this.updateCamera(dt);
    this.updateVisuals(dt);
    this.updateParticles(dt);

    if (!this.demo) {
      const p01 = Math.min(1, this.player.speed / this.player.racer.topSpeed);
      audio.setEngine(p01, this.player.wheelieT > 0);
    }
  }

  // ---------------- player ----------------
  updatePlayer(car, dt, input) {
    const r = car.racer;
    const steerIn = input ? input.steer : 0;
    const braking = input ? input.brakeActive : false;
    const events = input ? input.consumeStunts() : { wheelie: false, twoWheel: 0 };

    car.wheelieCooldown = Math.max(0, car.wheelieCooldown - dt);
    car.crestCooldown = Math.max(0, car.crestCooldown - dt);
    car.invuln = Math.max(0, car.invuln - dt);
    car.recoveryT = Math.max(0, car.recoveryT - dt);

    // ---- stunt triggers ----
    if (events.wheelie) {
      if (!car.grounded && !car.flipping) {
        // FLIP in the air.
        car.flipping = true;
        car.flipProg = 0;
        car.flipAxis = 'x';
        audio.whoosh();
      } else if (car.grounded && car.wheelieT <= 0 && car.wheelieCooldown <= 0
        && car.spinT <= 0 && car.speed > 12 && this.state === 'race') {
        // WHEELIE: the World-style double-tap turbo.
        car.wheelieFullT = WHEELIE_TIME * (0.8 + r.stats.wheelie * 0.4);
        car.wheelieT = car.wheelieFullT;
        car.wheelieCooldown = 2.0;
        audio.wheelie();
        audio.announce('Wheelie turbo!');
        audio.startFart();       // the joke exhaust
        setTimeout(() => audio.stopFart(), 700);
        this.onEvent('toast', 'WHEELIE!');
        this.onEvent('haptic', 'wheelie');
      }
    }
    if (events.twoWheel !== 0) {
      if (!car.grounded && !car.flipping) {
        car.flipping = true;
        car.flipProg = 0;
        car.flipAxis = 'z';
        car.flipDir = events.twoWheel;
        audio.whoosh();
      } else if (car.grounded && car.twoWheelT <= 0 && car.spinT <= 0 && car.speed > 24) {
        car.twoWheelT = TWOWHEEL_TIME;
        car.twoWheelDir = events.twoWheel;
        car.twoWheelClean = true;
        audio.whoosh();
      }
    }
    if (car.wheelieT > 0) car.wheelieT -= dt;
    if (car.twoWheelT > 0) {
      car.twoWheelT -= dt;
      if (car.twoWheelT <= 0 && car.twoWheelClean) {
        car.stuntsLanded++;
        this.timeLeft += 0.5;
        this.onEvent('toast', 'TWO WHEELS! +0.5s');
        audio.bigAir();
      }
    }

    // ---- spinout: sit in the pile ----
    if (car.spinT > 0) {
      car.spinT -= dt;
      car.crashHold = Math.max(0, car.crashHold - dt);
      if (car.crashHold > 0) {
        car.speed = 0;
      } else {
        car.spinYaw += 11 * dt;
        car.speed = Math.max(2, car.speed - 60 * dt);
        this.advance(car, dt);
      }
      if (car.spinT <= 0) {
        car.invuln = 1.2;
        car.recoveryT = 10;
        this.onEvent('toast', 'COMEBACK BOOST!');
      }
      return;
    }

    const wheelie = car.wheelieT > 0;
    const onDirt = car.mode === 'shortcut';
    const offroad = car.mode === 'road' && Math.abs(car.x) > ROAD_HALF + 0.4;

    const comeback = car.recoveryT > 0;
    const speedMul = (wheelie ? 1.24 : 1) * (comeback ? 1.12 : 1)
      * (offroad ? 0.55 : 1) * (onDirt ? 0.92 : 1);
    const maxSpeed = r.topSpeed * speedMul;
    const accel = r.accel * (wheelie ? 2.0 : 1) * (comeback ? 1.55 : 1);

    if (this.state !== 'race') {
      car.speed = Math.max(0, car.speed - 30 * dt);
    } else if (braking && !wheelie) {
      car.speed = Math.max(0, car.speed - 58 * dt);
    } else if (car.speed < maxSpeed) {
      car.speed = Math.min(maxSpeed, car.speed + accel * dt);
    } else {
      car.speed = Math.max(maxSpeed, car.speed - 24 * dt);
    }

    // ---- steering ----
    const grip = car.grounded ? 1 : 0.35;
    const wheelieSteer = wheelie ? 0.5 : 1;
    const authority = r.steer * grip * wheelieSteer;
    // Build lateral momentum instead of directly nudging the car sideways.
    // Quick corrections still work, but a long turn now loads the chassis,
    // scrubs speed, and needs an opposite input to settle.
    const steerForce = steerIn * authority * (34 + car.speed * 0.55);
    car.lateralVel += steerForce * dt;
    car.lateralVel *= Math.exp(-(car.grounded ? 3.4 : 1.25) * dt);
    car.lateralVel = THREE.MathUtils.clamp(car.lateralVel, -20, 20);

    if (car.mode === 'road') {
      const curv = this.track.curvatureAt(car.s);
      car.lateralVel -= curv * car.speed * car.speed * 1.15 * dt * (2 - r.stats.grip);
      car.x += car.lateralVel * dt;
      car.lean = THREE.MathUtils.lerp(
        car.lean,
        steerIn * -0.17 - car.lateralVel * 0.012 + curv * 1.3,
        Math.min(1, 7 * dt),
      );
      const cornerLoad = Math.min(0.24, Math.abs(curv) * car.speed * 2.4);
      car.speed = Math.max(0, car.speed * (1 - cornerLoad * dt)
        - Math.abs(steerIn) * car.speed * 0.018 * dt);
      if (Math.abs(car.x) > MAX_X) {
        car.x = Math.sign(car.x) * MAX_X;
        car.lateralVel *= -0.28;
        car.speed *= (1 - 1.7 * dt);
        this.shake = Math.min(1, this.shake + dt * 4);
      }
      if (offroad) {
        this.shake = Math.min(0.4, this.shake + dt * 1.1);
        if (Math.random() < dt * 20) {
          car.worldPos(this.tmpV);
          this.emit(this.dustSys, this.tmpV, { x: 0, z: 0 });
        }
      }
      this.tryEnterShortcut(car);
    } else {
      // On the shortcut dirt.
      car.sx = THREE.MathUtils.clamp((car.sx || 0) + car.lateralVel * dt, -3.6, 3.6);
      car.lean = THREE.MathUtils.lerp(
        car.lean,
        steerIn * -0.17 - car.lateralVel * 0.012,
        Math.min(1, 7 * dt),
      );
      if (Math.random() < dt * 26) {
        car.worldPos(this.tmpV);
        this.emit(this.dustSys, this.tmpV, { x: 0, z: 0 });
      }
    }

    this.advance(car, dt);

    // Wheelie exhaust gag puffs, spawned behind the car so the camera sees them.
    if (wheelie) {
      const f = this.track.frameAt(car.s);
      car.worldPos(this.tmpV);
      this.tmpV.x -= f.tan.x * 3.2;
      this.tmpV.z -= f.tan.z * 3.2;
      this.tmpV.y += 0.5 + car.yOff;
      if (Math.random() < dt * 34) {
        this.emit(this.fartSys, this.tmpV, { x: -f.tan.x * 9, z: -f.tan.z * 9 }, 1.0);
      }
    }

    // ---- bean cans: joke flavor, tiny time treats ----
    this.track.beans.forEach((b) => {
      if (!b.active || car.mode !== 'road') return;
      if (Math.abs(car.s - b.s) < 2.6 && Math.abs(car.x - b.x) < 2.3 && car.yOff < 2.2) {
        b.active = false;
        b.sprite.visible = false;
        car.beansGot++;
        const bonus = wheelie ? 1.5 : 0.5;
        this.timeLeft += bonus;
        audio.pickup();
        this.onEvent('toast', wheelie ? 'BEAN WHEELIE! +1.5s' : 'BEANS! +0.5s');
        car.worldPos(this.tmpV);
        this.tmpV.y += 1.2;
        for (let i = 0; i < 4; i++) this.emit(this.fartSys, this.tmpV, { x: 0, z: 0 }, 1.4);
      }
    });

    this.handleCrest(car);
    this.handleRamps(car);
    this.trafficInteract(car, dt, true);
    this.animalInteract(car);
  }

  advance(car, dt) {
    if (car.mode === 'shortcut' && this.track.shortcut) {
      const sc = this.track.shortcut;
      car.ss += car.speed * dt;
      // Virtual road progress so ranking/checkpoints stay consistent —
      // the dirt is physically shorter, so this advances faster than
      // driving the long way around.
      car.s = sc.s1 + (car.ss / sc.len) * (sc.s2 - sc.s1);
      if (car.ss >= sc.len) {
        car.mode = 'road';
        car.s = sc.s2;
        car.x = sc.side * (ROAD_HALF - 5);
        car.sx = 0;
        this.onEvent('toast', 'SHORTCUT PAYS OFF!');
        audio.announce('Dirty shortcut pays!');
      }
    } else {
      car.s += car.speed * dt;
    }
  }

  tryEnterShortcut(car) {
    const sc = this.track.shortcut;
    if (!sc || car.mode !== 'road' || !car.grounded) return;
    if (car.s > sc.s1 - 8 && car.s < sc.s1 + 14 && car.x * sc.side > ROAD_HALF - 4) {
      car.mode = 'shortcut';
      car.ss = 0;
      car.sx = 0;
      audio.checkpoint();
      audio.announce('Take the shortcut!');
      this.onEvent('toast', `SHORTCUT! CUT ${Math.round(sc.savedDistance)}m`);
    }
  }

  // ---------------- AI ----------------
  updateAI(car, dt, go) {
    const r = car.racer;
    if (car.finished) {
      car.speed = 0;
      return;
    }
    if (!go) {
      car.speed = Math.max(0, car.speed - 30 * dt);
      car.s += car.speed * dt;
      return;
    }
    if (car.spinT > 0) {
      car.spinT -= dt;
      car.spinYaw += 9 * dt;
      car.speed = Math.max(3, car.speed - 60 * dt);
      car.s += car.speed * dt;
      return;
    }

    // Rubber band: tighter when the player is struggling so the pack
    // "eats" a crashed player, then lets them claw back.
    let rubber = 1;
    if (!this.demo && !car.finished) {
      const gap = this.player.s - car.s;
      rubber = THREE.MathUtils.clamp(1 + gap * 0.004, 0.7, 1.25);
    }
    const curvAhead = Math.abs(this.track.curvatureAt(car.s + 30)) + Math.abs(this.track.curvatureAt(car.s + 14));
    const cornerCap = r.topSpeed * (1.08 - Math.min(0.42, curvAhead * 8.5));
    const aiWheelie = car.aiWheelieT > 0;
    if (aiWheelie) car.aiWheelieT -= dt;
    else if (Math.random() < dt * 0.06 && curvAhead < 0.01 && car.grounded) {
      car.aiWheelieT = 1.2;
    }
    let maxSpeed = Math.min(r.topSpeed * (r.aiSkill || 0.9) * rubber * (aiWheelie ? 1.18 : 1), cornerCap);
    const relativeToPlayer = car.s - this.player.s;
    if (!this.demo && relativeToPlayer > 135) {
      maxSpeed = Math.min(maxSpeed, r.topSpeed * 0.56);
    } else if (!this.demo && relativeToPlayer < -100) {
      maxSpeed = Math.max(maxSpeed, r.topSpeed * 1.2);
    }
    car.speed += THREE.MathUtils.clamp(maxSpeed - car.speed, -42 * dt, r.accel * 0.92 * dt);
    if (car.speed < 0) car.speed = 0;

    // Stay in the cruising lane, weave around traffic and each other.
    car.wanderPhase += dt * 0.4;
    let targetX = LANE_PLAYER + Math.sin(car.wanderPhase) * 3.4;
    if (!this.demo && Math.abs(car.s - this.player.s) < 30) {
      const passSide = car.gridIndex % 2 ? -1 : 1;
      targetX = this.player.x + passSide * 5.2;
    }
    this.traffic.forEach((v) => {
      if (v.retired || v.s >= this.track.length - 20) return;
      const ds = v.s - car.s;
      if (ds > 4 - v.halfLen && ds < 34 + v.halfLen && Math.abs(v.x - car.x) < 3.4) {
        targetX = v.x > car.x ? v.x - 5.4 : v.x + 5.4;
      }
    });
    this.cars.forEach((other) => {
      if (other === car) return;
      const ds = other.s - car.s;
      if (ds > 2 && ds < 13 && Math.abs(other.x - car.x) < 3) {
        targetX = other.x > 0 ? other.x - 5 : other.x + 5;
      }
    });
    targetX = THREE.MathUtils.clamp(targetX, -(ROAD_HALF - 2), ROAD_HALF - 2);
    const ddx = targetX - car.x;
    car.x += THREE.MathUtils.clamp(ddx, -11 * dt, 11 * dt);
    car.lean = THREE.MathUtils.lerp(car.lean, THREE.MathUtils.clamp(-ddx * 0.03, -0.12, 0.12), Math.min(1, 6 * dt));

    car.s += car.speed * dt;
    this.handleRamps(car);
    this.trafficInteract(car, dt, false);
    this.animalInteract(car, false);

    if (this.demo && car.s >= this.track.length - 60) {
      // Loop the attract drive.
      this.cars.forEach((c, i) => { c.s = 6 - i * 8; c.speed = 20; });
    }
  }

  updatePassEvents() {
    if (this.state !== 'race') return;
    this.cars.forEach((car) => {
      if (car.isPlayer) return;
      const ahead = car.s > this.player.s;
      if (ahead !== car.wasAhead && Math.abs(car.s - this.player.s) < 20
        && car.racer.rearSprite) {
        this.onEvent('rivalPass', { racer: car.racer, ahead });
      }
      car.wasAhead = ahead;
    });
  }

  // ---------------- traffic ----------------
  updateTraffic(dt) {
    const anchor = this.player.s;
    let danger = false;
    this.traffic.forEach((v) => {
      const retire = () => {
        v.retired = true;
        v.group.visible = false;
      };
      const respawn = (minimum, span, lane, jitter, minGap) => {
        const first = anchor + minimum;
        const last = this.track.length - 35;
        if (first >= last) {
          retire();
          return false;
        }
        const width = Math.min(span, last - first);
        let bestS = first;
        let bestClearance = -1;
        // Try several authored-looking positions and keep the clearest. This
        // prevents recycled traffic from stacking into unavoidable walls while
        // preserving a busy road and real pileups when the player makes contact.
        for (let attempt = 0; attempt < 14; attempt++) {
          const candidate = first + Math.random() * width;
          let clearance = Infinity;
          this.traffic.forEach((other) => {
            if (other === v || other.retired || Math.abs(other.x - lane) >= 4.8) return;
            clearance = Math.min(clearance, Math.abs(other.s - candidate));
          });
          if (clearance > bestClearance) {
            bestClearance = clearance;
            bestS = candidate;
          }
          if (clearance >= minGap) break;
        }
        v.s = bestS;
        v.x = lane + (Math.random() - 0.5) * jitter;
        v.clearedBy = 0;
        v.crashT = 0;
        v.crashSpin = 0;
        v.speed = v.cruiseSpeed;
        v.retired = false;
        return true;
      };
      if (v.retired) {
        v.group.visible = false;
        return;
      }
      const moving = this.state === 'race' || this.demo;
      if (v.crashT > 0) {
        v.crashT = Math.max(0, v.crashT - dt);
        v.crashSpin += dt * 5.2;
        // A struck vehicle becomes a real temporary obstruction instead of a
        // ghost the pack silently passes through.
        v.speed = Math.max(0, v.speed - 48 * dt);
        if (v.crashT === 0) v.speed = v.cruiseSpeed;
      } else if (moving) {
        v.s += (v.oncoming ? -v.speed : v.speed) * dt;
      }
      // Gentle lane wobble.
      v.x += Math.sin(this.time * 0.7 + v.s * 0.01) * dt * 0.4;
      if (!v.oncoming && v.s >= this.track.length - 20) {
        retire();
        return;
      }
      // Recycle around the player so the road always has life.
      if (v.oncoming && v.s < anchor - 80) {
        if (!respawn(v.wrongWay ? 2300 : 500, v.wrongWay ? 900 : 760,
          v.wrongWay ? LANE_PLAYER : LANE_ONCOMING, v.wrongWay ? 1.2 : 3,
          v.wrongWay ? 220 : 68)) return;
      } else if (!v.oncoming && v.s < anchor - 160) {
        if (!respawn(420, 900, LANE_PLAYER, 3, 115)) return;
      } else if (!v.oncoming && v.s > anchor + 1600) {
        if (!respawn(340, 1000, LANE_PLAYER, 3, 115)) return;
      }
      const visible = Math.abs(v.s - anchor) < 2000;
      v.group.visible = visible;
      if (visible) {
        this.track.worldPos(v.s, v.x, this.tmpV);
        v.group.position.copy(this.tmpV);
      }
      const ds = v.s - anchor;
      const closingSpeed = Math.max(1, this.player.speed + v.speed);
      const secondsToImpact = ds / closingSpeed;
      if (v.wrongWay && ds > 18 && secondsToImpact < 1.8
        && this.player.speed > 12) {
        danger = true;
      }
    });
    this.danger = danger;
  }

  trafficInteract(car, dt, isPlayer) {
    if (car.mode === 'shortcut') return;
    this.traffic.forEach((v) => {
      if (v.retired || v.s >= this.track.length - 20) return;
      const ds = v.s - car.s;
      const absDs = Math.abs(ds);
      if (absDs > 40) return;

      // Honk warning for the player when an oncoming vehicle is close.
      if (isPlayer && v.oncoming && ds > 8 && ds < 34 && Math.abs(v.x - car.x) < 3.4
        && this.time - this.lastHonk > 1.4) {
        this.lastHonk = this.time;
        audio.honk();
      }

      // LEAPFROG: an active wheelie near any vehicle in your path launches you
      // over it, oncoming or same-way, like the cabinet's double-tap turbo.
      // Generous window so the move is landable at closing speed.
      const leapWindow = v.oncoming ? 26 : 16 + v.halfLen;
      if (isPlayer && car.wheelieT > 0 && car.grounded
        && v.clearedBy !== car && ds > -2 && ds < leapWindow
        && Math.abs(v.x - car.x) < (v.wrongWay ? 5.4 : 3.6)) {
        v.clearedBy = car;
        car.grounded = false;
        car.vy = v.oncoming ? 15 : 13.5;
        car.airTime = 0;
        car.airSource = 'leapfrog';
        car.stuntsLanded++;
        this.timeLeft += 1;
        audio.bigAir();
        audio.announce(v.oncoming ? 'Leapfrog!' : 'Hop!');
        this.onEvent('toast', v.oncoming ? 'LEAPFROG! +1s' : 'TRAFFIC HOP! +1s');
        this.onEvent('haptic', 'leapfrog');
        return;
      }

      const hitW = car.twoWheelT > 0 ? 1.7 : 3.1;
      // The player's nose is ~2.6 ahead of its anchor; the vehicle spans
      // +-halfLen around its anchor.
      if (absDs < v.halfLen + 2.6 && Math.abs(v.x - car.x) < hitW && car.yOff < v.h * 0.75) {
        if (v.clearedBy === car) return;
        if (car.invuln > 0) return;
        v.clearedBy = car;
        if (isPlayer) {
          // No back-to-back piles: while the comeback boost is active a
          // second contact only scrubs speed, so "sit in a pile, then catch
          // the pack" never degrades into a chain of spinouts.
          if (car.speed > 44 && car.recoveryT <= 0) {
            // Full crash pile.
            car.spinT = 2.05;
            car.crashHold = 1.08;
            car.spinYaw = 0;
            car.speed = 0;
            car.lateralVel = 0;
            car.wheelieT = 0;
            car.twoWheelT = 0;
            car.twoWheelClean = false;
            v.crashT = 1.75;
            v.crashSpin = 0;
            v.speed = 0;
            audio.crash();
            audio.honk();
            audio.announce('Pileup! The pack is coming!');
            this.shake = 1;
            this.onEvent('toast', 'CRASH PILE! PACK GOING BY...');
            this.onEvent('haptic', 'crash');
          } else {
            car.speed *= 0.4;
            audio.crash();
            this.shake = Math.min(1, this.shake + 0.5);
            this.onEvent('toast', 'TRAFFIC!');
            this.onEvent('haptic', 'bump');
          }
          car.invuln = 0.8;
        } else {
          if (v.crashT > 0) {
            car.spinT = Math.max(car.spinT, 0.7);
            car.speed *= 0.2;
          } else {
            car.speed *= 0.55;
          }
          car.x += car.x > v.x ? 2.4 : -2.4;
        }
      }
    });
  }

  // ---------------- animals ----------------
  updateAnimals(dt) {
    const anchor = this.player.s;
    this.animals.forEach((a) => {
      if (a.s < anchor - 120 || a.s > anchor + 2400) {
        a.reset(anchor + 700 + Math.random() * 1400);
      }
      const visible = Math.abs(a.s - anchor) < 1800;
      a.group.visible = visible;
      if (!visible) return;

      if (a.hitT > 0) {
        // Comedic launch: spin off into the sky, then respawn far ahead.
        a.hitT -= dt;
        a.y += 14 * dt;
        a.x += a.launchDir * 10 * dt;
        a.mesh.rotation.z += 12 * dt;
        if (a.hitT <= 0) a.reset(anchor + 900 + Math.random() * 1500);
      } else if (a.def.flies) {
        // Seagulls flap up and away when you get close.
        const near = anchor > a.s - 55 && anchor < a.s;
        if (near && !a.flying) a.flying = 0.01;
        if (a.flying > 0) {
          a.flying += dt;
          a.y += 9 * dt;
          a.x += this.time % 2 > 1 ? 3 * dt : -3 * dt;
        }
      } else {
        const near = anchor > a.s - 300 && anchor < a.s;
        if (near && !a.crossing) a.crossing = true;
        if (a.crossing) {
          a.x -= a.side * a.def.cross * dt;
          if (a.x * a.side < -(ROAD_HALF + 5)) a.crossing = false;
        }
        a.mesh.rotation.z = Math.sin(this.time * 8 + a.s) * 0.06; // walk waddle
      }
      this.track.worldPos(a.s, a.x, this.tmpV);
      this.tmpV.y += a.y;
      a.group.position.copy(this.tmpV);
    });
  }

  animalInteract(car, isPlayer = true) {
    if (car.mode === 'shortcut') return;
    this.animals.forEach((a) => {
      if (a.hitT > 0 || !a.group.visible) return;
      if (Math.abs(a.s - car.s) < 3 && Math.abs(a.x - car.x) < 2.6 && car.yOff < 2 && a.y < 2) {
        a.hitT = 1.4;
        a.launchDir = Math.random() > 0.5 ? 1 : -1;
        car.speed *= a.def.cost;
        if (isPlayer) {
          this.shake = Math.min(1, this.shake + 0.45);
          audio.animal(a.def.cry);
          const cries = { moo: 'MOO!!', heehaw: 'HEE-HAW!!', squeal: 'WEE WEE WEE!!', thud: 'BONK!', cluck: 'BAGAWK!!', squawk: 'SQUAWK!!' };
          this.onEvent('toast', cries[a.def.cry] || 'OOF!');
          this.onEvent('haptic', 'bump');
        }
      }
    });
  }

  // ---------------- ramps / air ----------------
  handleCrest(car) {
    if (!car.grounded || car.mode === 'shortcut' || car.crestCooldown > 0 || car.speed < 42) return;
    const crest = this.track.crests.find((item) => car.s >= item.s - 2 && car.s <= item.s + 4);
    if (!crest) return;
    car.grounded = false;
    car.vy = 11 + crest.strength * 4;
    car.airTime = 0;
    car.airSource = 'crest';
    car.crestCooldown = 2.5;
    if (car.isPlayer) {
      audio.bigAir();
      audio.announce('Crest! Flip it!');
      this.onEvent('toast', 'CREST AIR! FLIP IT!');
    }
  }

  handleRamps(car) {
    if (!car.grounded || car.mode === 'shortcut') return;
    for (const ramp of this.track.ramps) {
      const ds = car.s - ramp.s;
      if (ds > ramp.len - 3 && ds < ramp.len + 3
        && Math.abs(car.x - ramp.cx) < ramp.halfW && car.speed > 20) {
        car.grounded = false;
        car.vy = car.speed * (ramp.hgt / ramp.len) * 1.5;
        car.airTime = 0;
        car.airSource = 'ramp';
        if (car.isPlayer) audio.bigAir();
        break;
      }
    }
  }

  airPhysics(car, dt) {
    if (car.grounded) return;
    car.airTime += dt;
    car.yOff += car.vy * dt;
    car.vy -= 27 * dt;
    if (car.flipping) car.flipProg += dt * 7.4;
    if (car.yOff <= 0) {
      car.yOff = 0;
      car.grounded = true;
      if (car.flipping) {
        car.flipping = false;
        const complete = car.flipProg > Math.PI * 2 * 0.82;
        if (complete && car.isPlayer) {
          car.stuntsLanded++;
          this.stuntCredit += 3;
          this.timeLeft += 3;
          this.onEvent('toast', car.flipAxis === 'x'
            ? 'FLIP! CLOCK +3s • RECORD -3s'
            : 'SIDE FLIP! CLOCK +3s • RECORD -3s');
          audio.bigAir();
          audio.announce('Record time cut!');
          this.onEvent('haptic', 'stunt');
          this.shake = Math.min(1, this.shake + 0.3);
        } else if (car.isPlayer) {
          car.speed *= 0.5;
          this.onEvent('toast', 'FLOPPED THE FLIP!');
          audio.crash();
          this.shake = 1;
        }
        car.flipProg = 0;
      } else if (car.isPlayer && car.airTime > 0.55 && car.airSource !== 'leapfrog') {
        this.timeLeft += 1.5;
        this.onEvent('toast', car.airTime > 1.0 ? 'HUGE AIR! +1.5s' : 'BIG AIR! +1.5s');
        this.shake = Math.min(1, this.shake + 0.3);
      }
      car.airSource = null;
    }
  }

  // ---------------- pack collisions ----------------
  resolvePackCollisions(dt) {
    for (let i = 0; i < this.cars.length; i++) {
      for (let j = i + 1; j < this.cars.length; j++) {
        const a = this.cars[i];
        const b = this.cars[j];
        if (a.mode !== 'road' || b.mode !== 'road') continue;
        const ds = b.s - a.s;
        if (Math.abs(ds) < 4.6 && Math.abs(a.x - b.x) < 3 && Math.abs(a.yOff - b.yOff) < 1.8) {
          const push = (3 - Math.abs(a.x - b.x)) * 0.5 + 0.15;
          const dir = a.x > b.x ? 1 : -1;
          a.x = THREE.MathUtils.clamp(a.x + dir * push, -MAX_X, MAX_X);
          b.x = THREE.MathUtils.clamp(b.x - dir * push, -MAX_X, MAX_X);
          const rear = ds > 0 ? a : b;
          rear.speed *= (1 - 1.3 * dt);
          if ((a.isPlayer || b.isPlayer) && this.time - this.lastBumpSound > 0.4) {
            this.lastBumpSound = this.time;
            audio.crash();
            this.shake = Math.min(1, this.shake + 0.25);
          }
        }
      }
    }
  }

  // ---------------- progress / results ----------------
  checkProgress() {
    const car = this.player;
    if (car.finished || this.state !== 'race') return;
    const cps = this.track.checkpoints;
    while (this.nextCheckpoint < cps.length && car.s >= cps[this.nextCheckpoint]) {
      this.nextCheckpoint++;
      this.timeLeft += this.opts.trackDef.checkpointBonus;
      audio.checkpoint();
      this.onEvent('haptic', 'checkpoint');
      this.onEvent('checkpoint', {
        bonus: this.opts.trackDef.checkpointBonus,
        index: this.nextCheckpoint,
        total: cps.length,
      });
    }
  }

  checkFinishes(dt) {
    if (this.state !== 'race') return;
    const finishS = this.track.length - 8;
    const frameStartTime = Math.max(0, this.raceTime - dt);
    const crossings = [];
    this.cars.forEach((car) => {
      if (car.finished || car.s < finishS) return;
      const from = Number.isFinite(car.frameStartS) ? car.frameStartS : car.s;
      const travel = car.s - from;
      const fraction = travel > 0
        ? THREE.MathUtils.clamp((finishS - from) / travel, 0, 1)
        : 1;
      crossings.push({ car, fraction });
    });
    crossings.sort((a, b) => a.fraction - b.fraction || a.car.gridIndex - b.car.gridIndex);
    crossings.forEach(({ car, fraction }) => {
      car.finished = true;
      car.rawFinishTime = frameStartTime + fraction * dt;
      car.finishTime = car.isPlayer
        ? Math.max(0, car.rawFinishTime - this.stuntCredit)
        : car.rawFinishTime;
      // AI park at the line; the player coasts through the arch under the
      // finish camera and decelerates naturally in updatePlayer.
      if (!car.isPlayer) car.speed = 0;
      this.finishOrder.push(car);
    });
    if (this.player.finished) this.endRace(false);
  }

  positionOf(car) {
    if (car.finished) {
      const finishIndex = this.finishOrder.indexOf(car);
      if (finishIndex >= 0) return finishIndex + 1;
    }
    let pos = 1;
    this.cars.forEach((o) => { if (o !== car && o.s > car.s) pos++; });
    return pos;
  }

  endRace(timeUp) {
    if (this.state === 'over') return;
    this.state = 'over';
    this.finishT = 0;
    audio.stopFart();
    const place = this.positionOf(this.player);
    if (!timeUp) {
      this.onEvent('toast', place === 1 ? 'FINISH! YOU WIN!' : 'FINISH!');
      this.onEvent('haptic', place === 1 ? 'win' : 'finish');
    } else {
      this.onEvent('haptic', 'timeup');
    }
    const results = this.cars.map((c) => ({
      racer: c.racer,
      isPlayer: c.isPlayer,
      finished: c.finished,
      time: c.finished ? c.finishTime : null,
      dist: c.s,
      finishRank: c.finished ? this.finishOrder.indexOf(c) : -1,
    })).sort((x, y) => {
      if (x.finished !== y.finished) return x.finished ? -1 : 1;
      if (x.finished) {
        const xr = x.finishRank < 0 ? Number.MAX_SAFE_INTEGER : x.finishRank;
        const yr = y.finishRank < 0 ? Number.MAX_SAFE_INTEGER : y.finishRank;
        return xr - yr || x.time - y.time;
      }
      return y.dist - x.dist;
    });
    results.forEach((row) => { delete row.finishRank; });
    this.onEvent('finish', {
      place,
      timeUp,
      raceTime: this.player.finished ? this.player.rawFinishTime : this.raceTime,
      officialTime: this.player.finished
        ? this.player.finishTime
        : Math.max(0, this.raceTime - this.stuntCredit),
      stuntCredit: this.stuntCredit,
      beans: this.player.beansGot,
      stunts: this.player.stuntsLanded,
      results,
    });
    audio.finish(place === 1 && !timeUp);
    audio.announce(timeUp ? 'Time is up!' : place === 1 ? 'First place!' : `${place} place!`);
  }

  // ---------------- visuals ----------------
  updateVisuals(dt) {
    const camPos = this.camera.position;
    this.cars.forEach((car) => {
      car.worldPos(this.tmpV);
      car.group.position.copy(this.tmpV);
      const bumperHidden = car.isPlayer && !this.demo && this.cameraMode === 2;
      car.mesh.visible = !bumperHidden;
      car.shadow.visible = !bumperHidden;

      // Pick the straight front/rear frame from the relative bearing between
      // the car's heading and the camera.
      const heading = (car.mode === 'shortcut' && this.track.shortcut)
        ? Math.atan2(this.track.shortcut.frameAt(car.ss).tan.x, this.track.shortcut.frameAt(car.ss).tan.z)
        : this.track.headingAt(car.s);
      const spinHeading = heading + (car.spinT > 0 ? car.spinYaw : 0);
      const toCam = Math.atan2(camPos.x - this.tmpV.x, camPos.z - this.tmpV.z);
      let rel = spinHeading - toCam;
      while (rel > Math.PI) rel -= Math.PI * 2;
      while (rel < -Math.PI) rel += Math.PI * 2;
      const showFront = Math.abs(rel) < Math.PI / 2; // heading toward camera
      if (showFront !== car.showingFront) {
        car.showingFront = showFront;
        car.mesh.material.map = showFront ? car.frontT : car.rearT;
        car.mesh.material.needsUpdate = true;
      }
      // Keep the authored driver, lights, and body details on a stable side.
      // Whole-sprite mirroring made cars visibly flip handedness on each bend.
      car.mesh.scale.set(car.visualScale, car.visualScale, car.visualScale);

      // Billboard yaw only. The old code added up to 20 degrees of steering
      // yaw on top of already-angled raster art, which made every car look as
      // if it were permanently crab-walking across the road.
      const yaw = toCam;
      // A flat quad rotated through its crash yaw becomes edge-on and briefly
      // disappears. Keep it camera-facing and sell the spin with roll below.
      car.mesh.rotation.y = yaw;

      // Pitch/roll from stunts.
      let pitch = 0;
      let roll = THREE.MathUtils.clamp(car.lean * 0.28, -0.05, 0.05);
      if (car.wheelieT > 0 || car.aiWheelieT > 0) {
        const full = car.isPlayer ? (car.wheelieFullT || WHEELIE_TIME) : 1.2;
        const t = car.isPlayer ? car.wheelieT : car.aiWheelieT;
        const elapsed = full - t;
        // Nose snaps up fast, holds, and settles as the wheelie ends. The
        // quad's roof rotates toward the camera (positive local X), which is
        // what a rear-axle wheelie looks like from the chase seat; the
        // opposite sign read as the car diving nose-first.
        const k = Math.min(1, elapsed / 0.22) * Math.min(1, t / 0.3);
        pitch = 0.62 * Math.max(0, k);
      }
      if (car.flipping) {
        if (car.flipAxis === 'x') pitch = car.flipProg;
        else roll = car.flipProg * (car.flipDir || 1);
      }
      if (car.twoWheelT > 0) {
        const k = Math.min(1, (TWOWHEEL_TIME - car.twoWheelT) / 0.25) * Math.min(1, car.twoWheelT / 0.25);
        roll = 0.55 * car.twoWheelDir * k;
      }
      if (car.spinT > 0) roll += Math.sin(car.spinYaw) * 0.18;
      car.mesh.rotation.x = pitch;
      car.mesh.rotation.z = roll;

      car.mesh.position.y = car.yOff + Math.sin(this.time * 16 + car.x) * 0.03 * Math.min(1, car.speed / 20);
      car.shadow.position.y = 0.07;
      const sh = 1 - Math.min(0.55, car.yOff * 0.09);
      car.shadow.scale.set(sh, sh, 1);
    });

    // Traffic is real geometry: face the direction of travel, spin the
    // wheels, and let a struck vehicle slew and rock instead of wobbling a card.
    this.traffic.forEach((v) => {
      if (!v.group.visible) return;
      const heading = this.track.headingAt(v.s) + (v.oncoming ? Math.PI : 0);
      const slew = v.crashT > 0 ? Math.sin(v.crashSpin * 0.6) * 0.9 : 0;
      v.body.rotation.y = heading + slew;
      v.body.rotation.z = v.crashT > 0 ? Math.sin(v.crashSpin) * 0.12 : 0;
      const spin = (v.speed * dt) / 1.0;
      v.wheels.forEach((w) => { w.rotation.x += spin; });
    });
    this.animals.forEach((a) => {
      if (!a.group.visible) return;
      const p = a.group.position;
      a.mesh.rotation.y = Math.atan2(camPos.x - p.x, camPos.z - p.z);
    });
    this.track.orientLandmarks(camPos);

    this.shake = Math.max(0, this.shake - dt * 2.1);
  }

  // Camera rigs per mode: how far behind and above the car, how far ahead
  // the aim point sits, how much the aim is lifted toward the horizon, and
  // the FOV that widens with speed. The arcade chase is deliberately low and
  // close so the car is huge and the road rushes; speed pulls it back a touch
  // so the car visibly surges away when the turbo hits.
  static CAMERA_RIGS = [
    { back: 10, ahead: 34, lift: 4.6, aim: 2.7, fov: 70, kick: 17, pull: 1.4 },
    { back: 21, ahead: 60, lift: 12.25, aim: 5.6, fov: 64, kick: 8, pull: 0 },
    { back: -1.2, ahead: 46, lift: 1.65, aim: 1.45, fov: 74, kick: 12, pull: 0 },
  ];

  updateCamera(dt) {
    const car = this.player;
    const mode = this.cameraMode;
    const rig = Race.CAMERA_RIGS[mode];
    const speed01 = Math.min(1, car.speed / 66);
    let anchorPos;
    let lookPos;
    if (car.mode === 'shortcut' && this.track.shortcut) {
      const sc = this.track.shortcut;
      const backDist = rig.back + rig.pull * speed01;
      const aheadDist = rig.ahead;
      const backS = car.ss - backDist;
      const back = sc.frameAt(Math.max(0, backS));
      anchorPos = back.pos.clone().addScaledVector(back.left, car.sx || 0);
      if (backS < 0) anchorPos.addScaledVector(back.tan, backS);
      const ahead = sc.frameAt(Math.min(sc.len, car.ss + aheadDist));
      lookPos = ahead.pos.clone();
    } else {
      const backDist = this.demo ? 15 : rig.back + rig.pull * speed01;
      const aheadDist = this.demo ? 29 : rig.ahead;
      const laneX = this.demo ? car.x * 0.75 : car.x;
      const backS = car.s - backDist;
      anchorPos = this.track.worldPos(Math.max(0, backS), laneX);
      if (backS < 0) anchorPos.addScaledVector(this.track.frameAt(0).tan, backS);
      lookPos = this.track.worldPos(car.s + aheadDist, laneX);
    }
    let camLift = this.demo ? 6.4 : rig.lift;
    // Finish crane: once the player crosses the line the camera rises, pulls
    // back, and drifts to the outside while the car coasts through the arch.
    let crane = 0;
    if (this.state === 'over' && car.finished && !this.demo) {
      this.finishT = (this.finishT || 0) + dt;
      const t = Math.min(1, this.finishT / 2.2);
      crane = t * t * (3 - 2 * t);
      camLift += 16 * crane;
      const f = this.track.frameAt(car.s);
      anchorPos.addScaledVector(f.left, -9 * crane).addScaledVector(f.tan, -14 * crane);
      lookPos = car.worldPos(new THREE.Vector3());
      lookPos.y += 1.2;
    }
    const camY = anchorPos.y + camLift + car.yOff * (mode === 2 ? 0.9 : 0.35);
    if (!this.camInit) {
      this.camera.position.set(anchorPos.x, camY, anchorPos.z);
      this.camInit = true;
    } else {
      // Stiff follow. The old 5.8/s lerp trailed a 60 u/s car by ten units,
      // which quietly undid the close rig and shrank the hero car in motion.
      this.camera.position.lerp(this.tmpV2.set(anchorPos.x, camY, anchorPos.z), Math.min(1, 16 * dt));
    }
    if (this.shake > 0.01) {
      this.camera.position.x += (Math.random() - 0.5) * this.shake * 0.55;
      this.camera.position.y += (Math.random() - 0.5) * this.shake * 0.4;
    }
    // High-frequency rumble above ~100 MPH: tiny, but it is what makes the
    // top end feel strained rather than floaty.
    const rumble = this.demo || crane ? 0 : Math.max(0, speed01 - 0.68) * 0.28 + (car.wheelieT > 0 ? 0.05 : 0);
    this.speedRumble = rumble;
    if (rumble > 0) {
      this.camera.position.x += (Math.random() - 0.5) * rumble;
      this.camera.position.y += (Math.random() - 0.5) * rumble * 0.7;
    }
    // Aim toward the horizon so the view stays level; the low rig still shows
    // plenty of road because the camera sits just above the roofline.
    if (!crane) lookPos.y += rig.aim + car.yOff * 0.25;
    this.camera.lookAt(lookPos);
    // A whisper of roll with lateral load sells the chassis leaning into bends.
    if (!crane && !this.demo) {
      this.camera.rotateZ(THREE.MathUtils.clamp(-car.lateralVel * 0.0032 - car.lean * 0.12, -0.05, 0.05));
    }
    const baseFov = this.demo ? 62 : rig.fov;
    const kick = Math.pow(speed01, 1.35) * rig.kick;
    const targetFov = baseFov + kick + (car.wheelieT > 0 ? 5 : 0) - crane * 10;
    this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, 5 * dt);
    this.camera.updateProjectionMatrix();
    this.updatePanoramaCrop();
  }

  cycleCamera() {
    this.cameraMode = (this.cameraMode + 1) % this.cameraModes.length;
    this.camInit = false;
    return this.cameraModes[this.cameraMode];
  }

  // Slide the background painting with the camera's heading. Called every
  // frame after the camera is aimed; only cheap uniform math, no re-upload.
  updatePanoramaCrop() {
    if (!this.panoramaTexture || !this.camera) return;
    const def = this.opts.trackDef;
    const span = def.panoramaSpan || PANORAMA_SPAN;
    const artAspect = def.panoramaAspect || PANORAMA_ASPECT;
    const horizon = def.panoramaHorizon ?? 0.5;
    const viewAspect = Math.max(0.1, this.camera.aspect || PANORAMA_ASPECT);
    const vfov = THREE.MathUtils.degToRad(this.camera.fov);
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * viewAspect);
    // Visible slice of the art = the camera's horizontal FOV as a fraction of
    // the yaw span the painting represents, cropped to the view's aspect.
    let fx = Math.min(1, hfov / span);
    let fy = fx * artAspect / viewAspect;
    if (fy > 1) {
      fy = 1;
      fx = viewAspect / artAspect;
    }
    this.camera.getWorldDirection(this.tmpV2);
    const yaw = Math.atan2(this.tmpV2.x, this.tmpV2.z);
    // World +x is screen-left in this right-handed frame: turning toward
    // increasing yaw makes the horizon slide right, i.e. the UV window moves
    // toward smaller u. Vertically the painting's horizon line is pinned to
    // the middle of the view.
    this.panoramaTexture.repeat.set(fx, fy);
    this.panoramaTexture.offset.set(
      (1 - fx) * 0.5 - yaw * (fx / hfov),
      THREE.MathUtils.clamp(horizon - fy * 0.5, 0, 1 - fy),
    );
  }

  hud() {
    const car = this.player;
    return {
      mph: Math.round(car.speed * 2.2),
      timeLeft: this.timeLeft,
      raceTime: this.raceTime,
      cp: this.nextCheckpoint,
      cps: this.track.checkpoints.length,
      progress: Math.min(1, car.s / this.track.length),
      place: this.positionOf(car),
      total: this.cars.length,
      beans: car.beansGot,
      wheelie: car.wheelieT > 0,
      danger: this.danger,
      stage: this.opts.trackDef.name,
      zone: this.track.zoneOf(car.s).replaceAll('_', ' ').toUpperCase(),
      comeback: car.recoveryT > 0,
      speed01: Math.min(1, car.speed / 66),
      camera: this.cameraModes[this.cameraMode],
      officialTime: Math.max(0, this.raceTime - this.stuntCredit),
      stuntCredit: this.stuntCredit,
    };
  }

  dispose() {
    audio.stopFart();
    this.scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach((m) => {
          if (m.map && ![...spriteCache.values()].includes(m.map)) m.map.dispose();
          m.dispose();
        });
      }
    });
  }
}
