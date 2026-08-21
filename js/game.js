// Race engine: point-to-point stage, 7-car pack, oncoming traffic,
// double-tap-gas wheelie turbo, two-wheel and flip stunts, hittable
// animals, one real shortcut, checkpoint clock with DNF.
import * as THREE from '../vendor/three.module.js';
import { Track, ROAD_HALF, SHOULDER, LANE_PLAYER, LANE_ONCOMING } from './track.js';
import * as tex from './tex.js';
import { audio } from './audio.js';

const MAX_X = ROAD_HALF + SHOULDER - 1.5;
const WHEELIE_TIME = 1.45;
const TWOWHEEL_TIME = 1.05;

const texLoader = new THREE.TextureLoader();
const spriteCache = new Map();
function loadSprite(url) {
  if (!spriteCache.has(url)) {
    const t = texLoader.load(url);
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.LinearFilter;
    t.colorSpace = THREE.SRGBColorSpace;
    spriteCache.set(url, t);
  }
  return spriteCache.get(url);
}

// Billboard quad with its pivot at the bottom center so wheelies/rolls
// rotate around the wheels, not the middle of the sprite.
function makeQuad(texture, w, h, mirrorable = true) {
  const geo = new THREE.PlaneGeometry(w, h);
  geo.translate(0, h / 2, 0);
  const mat = new THREE.MeshBasicMaterial({
    map: texture, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide,
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
    this.s = 6 - Math.floor(gridIndex / 2) * 8;
    this.x = LANE_PLAYER + (gridIndex % 2 === 0 ? 2.6 : -2.6);
    this.mode = 'road';           // road | shortcut
    this.ss = 0;                  // arc position inside the shortcut
    this.speed = 0;
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
    this.lean = 0;
    this.wanderPhase = Math.random() * Math.PI * 2;
    this.aiWheelieT = 0;

    const w = racer.spriteWidth;
    const rearT = racer.rearSprite ? loadSprite(racer.rearSprite) : tex.rivalRearTexture(racer.color);
    const frontT = racer.frontSprite ? loadSprite(racer.frontSprite) : rearT;
    const img = rearT.image;
    const ratio = (img && img.height) ? img.height / img.width : 0.55;
    this.h = w * (racer.rearSprite ? Math.max(0.45, Math.min(0.68, ratio)) : 0.72);
    this.rearT = rearT;
    this.frontT = frontT;
    this.mesh = makeQuad(rearT, w, this.h);
    this.visualScale = isPlayer ? 1.3 : 1;
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
    // Several semis deliberately run the cruising lane. A cold player
    // should encounter the wheelie/leapfrog lesson without hunting for it.
    this.wrongWay = oncoming && index % 4 === 0;
    const kindRoll = Math.random();
    if (oncoming) {
      if (this.wrongWay || kindRoll < 0.34) { this.kind = 'semi'; this.w = 7.4; this.h = 6.6; }
      else if (kindRoll < 0.55) { this.kind = 'bus'; this.w = 6.6; this.h = 6.6; }
      else { this.kind = 'sedan'; this.w = 5.2; this.h = 3.3; }
    } else {
      this.kind = 'sedan';
      this.w = 5.2; this.h = 3.3;
    }
    const colors = ['#4f8fe0', '#7fbf5a', '#c9c9d4', '#a065c9', '#e0b34f'];
    const color = colors[(Math.random() * colors.length) | 0];
    let t;
    if (this.kind === 'semi') t = tex.semiFrontTexture();
    else if (this.kind === 'bus') t = tex.busFrontTexture();
    else t = oncoming ? tex.sedanFrontTexture(color) : tex.sedanRearTexture(color);
    this.mesh = makeQuad(t, this.w, this.h);
    this.shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(this.w, this.w * 0.45),
      new THREE.MeshBasicMaterial({ map: tex.blobShadowTexture(), transparent: true, depthWrite: false }),
    );
    this.shadow.rotation.x = -Math.PI / 2;
    this.group = new THREE.Group();
    this.group.add(this.mesh, this.shadow);
    // Spread the fleet along the road.
    this.s = 220 + (index / total) * (track.length - 400);
    this.x = (this.wrongWay ? LANE_PLAYER : oncoming ? LANE_ONCOMING : LANE_PLAYER)
      + (Math.random() - 0.5) * (this.wrongWay ? 1.2 : 3);
    this.speed = oncoming ? 24 + Math.random() * 14 : 19 + Math.random() * 9;
    this.clearedBy = 0; // leapfrog cooldown flag
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
    this.scene.fog = new THREE.Fog(opts.trackDef.fogColor, 260, 1150);
    this.scene.background = new THREE.Color(opts.trackDef.sky[0]);
    this.camera = new THREE.PerspectiveCamera(71, 16 / 9, 0.5, 9000);

    this.cars = opts.racers.map((r, i) => {
      const car = new PackCar(r, this.track, !this.demo && i === opts.playerIndex, i);
      this.scene.add(car.group);
      return car;
    });
    this.player = this.demo ? this.cars[0] : this.cars[opts.playerIndex];

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
    this.timeLeft = opts.trackDef.startTime;
    this.countdownT = 0;
    this.time = 0;
    this.nextCheckpoint = 0;
    this.finishOrder = [];
    this.shake = 0;
    this.lastBumpSound = 0;
    this.lastHonk = 0;
    this.danger = false;

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
      const mat = new THREE.PointsMaterial({
        map: tex.fartPuffTexture(), size, transparent: true, depthWrite: false,
        blending: THREE.AdditiveBlending, sizeAttenuation: true, color,
      });
      const points = new THREE.Points(geo, mat);
      points.frustumCulled = false;
      this.scene.add(points);
      const sys = { N, pos, vel, life, geo, idx: 0 };
      this.systems.push(sys);
      return sys;
    };
    this.fartSys = mk('#bfff7a', 2.8);
    this.dustSys = mk('#d9c9a5', 2.2);
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
    if (racing && !this.demo && !this.player.finished) {
      this.raceTime += dt;
      this.timeLeft -= dt;
      if (this.timeLeft <= 0) {
        this.timeLeft = 0;
        this.endRace(true);
      }
    }

    this.cars.forEach((car) => {
      if (car.isPlayer && !this.demo) {
        this.updatePlayer(car, dt, racing && !car.finished ? input : null);
      } else {
        this.updateAI(car, dt, racing || this.demo);
      }
      this.airPhysics(car, dt);
    });

    this.updateTraffic(dt);
    this.updateAnimals(dt);
    this.resolvePackCollisions(dt);
    if (!this.demo) this.checkProgress();
    this.updateVisuals(dt);
    this.updateParticles(dt);
    this.updateCamera(dt);

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
        audio.startFart();       // the joke exhaust
        setTimeout(() => audio.stopFart(), 700);
        this.onEvent('toast', 'WHEELIE!');
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
    const dx = steerIn * authority * (15 + car.speed * 0.24) * dt;

    if (car.mode === 'road') {
      car.x += dx;
      const curv = this.track.curvatureAt(car.s);
      car.x -= curv * car.speed * car.speed * 0.010 * dt * (2 - r.stats.grip);
      car.lean = THREE.MathUtils.lerp(car.lean, steerIn * -0.13 + curv * 1.3, Math.min(1, 8 * dt));
      if (Math.abs(car.x) > MAX_X) {
        car.x = Math.sign(car.x) * MAX_X;
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
      car.sx = THREE.MathUtils.clamp((car.sx || 0) + dx, -3.6, 3.6);
      car.lean = THREE.MathUtils.lerp(car.lean, steerIn * -0.13, Math.min(1, 8 * dt));
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
      this.tmpV.y += 0.7 + car.yOff;
      const n = Math.random() < dt * 40 ? 2 : 1;
      for (let i = 0; i < n; i++) {
        this.emit(this.fartSys, this.tmpV, { x: -f.tan.x * 8, z: -f.tan.z * 8 }, 1.1);
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
      this.onEvent('toast', `SHORTCUT! CUT ${Math.round(sc.savedDistance)}m`);
    }
  }

  // ---------------- AI ----------------
  updateAI(car, dt, go) {
    const r = car.racer;
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
    const maxSpeed = Math.min(r.topSpeed * (r.aiSkill || 0.9) * rubber * (aiWheelie ? 1.18 : 1), cornerCap);
    car.speed += THREE.MathUtils.clamp(maxSpeed - car.speed, -42 * dt, r.accel * 0.92 * dt);
    if (car.speed < 0) car.speed = 0;

    // Stay in the cruising lane, weave around traffic and each other.
    car.wanderPhase += dt * 0.4;
    let targetX = LANE_PLAYER + Math.sin(car.wanderPhase) * 3.4;
    this.traffic.forEach((v) => {
      const ds = v.s - car.s;
      if (ds > 4 && ds < 34 && Math.abs(v.x - car.x) < 3.4) {
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

    if (!this.demo && !car.finished && car.s >= this.track.length - 8) {
      car.finished = true;
      car.finishTime = this.raceTime;
      this.finishOrder.push(car);
    }
    if (this.demo && car.s >= this.track.length - 60) {
      // Loop the attract drive.
      this.cars.forEach((c, i) => { c.s = 6 - i * 8; c.speed = 20; });
    }
  }

  // ---------------- traffic ----------------
  updateTraffic(dt) {
    const anchor = this.player.s;
    let danger = false;
    this.traffic.forEach((v) => {
      const moving = this.state === 'race' || this.demo;
      if (moving) v.s += (v.oncoming ? -v.speed : v.speed) * dt;
      // Gentle lane wobble.
      v.x += Math.sin(this.time * 0.7 + v.s * 0.01) * dt * 0.4;
      // Recycle around the player so the road always has life.
      if (v.oncoming && v.s < anchor - 80) {
        v.s = anchor + 500 + Math.random() * 700;
        v.x = (v.wrongWay ? LANE_PLAYER : LANE_ONCOMING)
          + (Math.random() - 0.5) * (v.wrongWay ? 1.2 : 3);
        v.clearedBy = 0;
      } else if (!v.oncoming && v.s < anchor - 160) {
        v.s = anchor + 400 + Math.random() * 500;
        v.x = LANE_PLAYER + (Math.random() - 0.5) * 3;
        v.clearedBy = 0;
      } else if (v.s > anchor + 1600) {
        v.s = anchor + 300 + Math.random() * 900;
        v.clearedBy = 0;
      }
      const visible = Math.abs(v.s - anchor) < 1300;
      v.group.visible = visible;
      if (visible) {
        this.track.worldPos(v.s, v.x, this.tmpV);
        v.group.position.copy(this.tmpV);
      }
      const ds = v.s - anchor;
      const closingSpeed = Math.max(1, this.player.speed + v.speed);
      const secondsToImpact = ds / closingSpeed;
      if (v.wrongWay && ds > 18 && secondsToImpact < 1.45
        && this.player.speed > 12 && Math.abs(v.x - this.player.x) < 5.2) {
        danger = true;
      }
    });
    this.danger = danger;
  }

  trafficInteract(car, dt, isPlayer) {
    if (car.mode === 'shortcut') return;
    this.traffic.forEach((v) => {
      const ds = v.s - car.s;
      const absDs = Math.abs(ds);
      if (absDs > 40) return;

      // Honk warning for the player when an oncoming vehicle is close.
      if (isPlayer && v.oncoming && ds > 8 && ds < 34 && Math.abs(v.x - car.x) < 3.4
        && this.time - this.lastHonk > 1.4) {
        this.lastHonk = this.time;
        audio.honk();
      }

      // LEAPFROG: an active wheelie near an oncoming vehicle launches you
      // over it — generous window so the move is landable at closing speed.
      if (isPlayer && car.wheelieT > 0 && car.grounded && v.oncoming
        && v.clearedBy !== car && ds > -2 && ds < 26 && Math.abs(v.x - car.x) < 3.4) {
        v.clearedBy = car;
        car.grounded = false;
        car.vy = 15;
        car.airTime = 0;
        car.stuntsLanded++;
        this.timeLeft += 1;
        audio.bigAir();
        this.onEvent('toast', 'LEAPFROG! +1s');
        return;
      }

      const hitW = car.twoWheelT > 0 ? 1.7 : 3.1;
      if (absDs < (v.w + 3) * 0.62 && Math.abs(v.x - car.x) < hitW && car.yOff < v.h * 0.75) {
        if (v.clearedBy === car) return;
        if (car.invuln > 0) return;
        v.clearedBy = car;
        if (isPlayer) {
          if (car.speed > 44) {
            // Full crash pile.
            car.spinT = 1.45;
            car.crashHold = 0.72;
            car.spinYaw = 0;
            car.speed = 0;
            car.wheelieT = 0;
            car.twoWheelT = 0;
            car.twoWheelClean = false;
            audio.crash();
            audio.honk();
            this.shake = 1;
            this.onEvent('toast', 'CRASH PILE! PACK GOING BY...');
          } else {
            car.speed *= 0.4;
            audio.crash();
            this.shake = Math.min(1, this.shake + 0.5);
            this.onEvent('toast', 'TRAFFIC!');
          }
          car.invuln = 0.8;
        } else {
          car.speed *= 0.55;
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
      const visible = Math.abs(a.s - anchor) < 1200;
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

  animalInteract(car) {
    if (car.mode === 'shortcut') return;
    this.animals.forEach((a) => {
      if (a.hitT > 0 || !a.group.visible) return;
      if (Math.abs(a.s - car.s) < 3 && Math.abs(a.x - car.x) < 2.6 && car.yOff < 2 && a.y < 2) {
        a.hitT = 1.4;
        a.launchDir = Math.random() > 0.5 ? 1 : -1;
        car.speed *= a.def.cost;
        this.shake = Math.min(1, this.shake + 0.45);
        audio.animal(a.def.cry);
        const cries = { moo: 'MOO!!', heehaw: 'HEE-HAW!!', squeal: 'WEE WEE WEE!!', thud: 'BONK!', cluck: 'BAGAWK!!', squawk: 'SQUAWK!!' };
        this.onEvent('toast', cries[a.def.cry] || 'OOF!');
      }
    });
  }

  // ---------------- ramps / air ----------------
  handleRamps(car) {
    if (!car.grounded || car.mode === 'shortcut') return;
    for (const ramp of this.track.ramps) {
      const ds = car.s - ramp.s;
      if (ds > ramp.len - 3 && ds < ramp.len + 3
        && Math.abs(car.x - ramp.cx) < ramp.halfW && car.speed > 20) {
        car.grounded = false;
        car.vy = car.speed * (ramp.hgt / ramp.len) * 1.5;
        car.airTime = 0;
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
          this.timeLeft += 3;
          this.onEvent('toast', car.flipAxis === 'x' ? 'FLIP! +3s' : 'SIDE FLIP! +3s');
          audio.bigAir();
          this.shake = Math.min(1, this.shake + 0.3);
        } else if (car.isPlayer) {
          car.speed *= 0.5;
          this.onEvent('toast', 'FLOPPED THE FLIP!');
          audio.crash();
          this.shake = 1;
        }
        car.flipProg = 0;
      } else if (car.isPlayer && car.airTime > 0.55) {
        this.timeLeft += 1.5;
        this.onEvent('toast', car.airTime > 1.0 ? 'HUGE AIR! +1.5s' : 'BIG AIR! +1.5s');
        this.shake = Math.min(1, this.shake + 0.3);
      }
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
    if (car.finished) return;
    const cps = this.track.checkpoints;
    if (this.nextCheckpoint < cps.length && car.s >= cps[this.nextCheckpoint]) {
      this.nextCheckpoint++;
      this.timeLeft += this.opts.trackDef.checkpointBonus;
      audio.checkpoint();
      this.onEvent('toast', `CHECKPOINT +${this.opts.trackDef.checkpointBonus}s`);
    }
    if (car.s >= this.track.length - 8) {
      car.finished = true;
      car.finishTime = this.raceTime;
      this.finishOrder.push(car);
      this.endRace(false);
    }
  }

  positionOf(car) {
    let pos = 1;
    this.cars.forEach((o) => { if (o !== car && o.s > car.s) pos++; });
    return pos;
  }

  endRace(timeUp) {
    if (this.state === 'over') return;
    this.state = 'over';
    audio.stopFart();
    const place = this.positionOf(this.player);
    const results = this.cars.map((c) => ({
      racer: c.racer,
      isPlayer: c.isPlayer,
      finished: c.finished,
      time: c.finished ? c.finishTime
        : this.raceTime + Math.max(0, this.track.length - c.s) / Math.max(24, c.racer.topSpeed * 0.85),
      dist: c.s,
    })).sort((x, y) => y.dist - x.dist);
    this.onEvent('finish', {
      place,
      timeUp,
      raceTime: this.raceTime,
      beans: this.player.beansGot,
      stunts: this.player.stuntsLanded,
      results,
    });
    audio.finish(place === 1 && !timeUp);
  }

  // ---------------- visuals ----------------
  updateVisuals(dt) {
    const camPos = this.camera.position;
    this.cars.forEach((car) => {
      car.worldPos(this.tmpV);
      car.group.position.copy(this.tmpV);

      // Multi-angle sprite: pick front/rear + mirror from the relative
      // bearing between the car's heading and the camera.
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
      // Mirror to fake the opposite 3/4 angle (sprites are drawn from the left).
      const mirror = (showFront ? rel < 0 : rel > 0) ? -1 : 1;
      car.mesh.scale.set(mirror * car.visualScale, car.visualScale, car.visualScale);

      // Billboard yaw + steering lean baked in.
      const yaw = toCam;
      const steerTwist = THREE.MathUtils.clamp(car.lean * -1.6, -0.35, 0.35);
      car.mesh.rotation.y = yaw + steerTwist + (car.spinT > 0 ? car.spinYaw : 0);

      // Pitch/roll from stunts.
      let pitch = 0;
      let roll = car.lean;
      if (car.wheelieT > 0 || car.aiWheelieT > 0) {
        const full = car.isPlayer ? (car.wheelieFullT || WHEELIE_TIME) : 1.2;
        const t = car.isPlayer ? car.wheelieT : car.aiWheelieT;
        const elapsed = full - t;
        // Nose snaps up fast, holds, and settles as the wheelie ends.
        const k = Math.min(1, elapsed / 0.22) * Math.min(1, t / 0.3);
        pitch = -0.58 * Math.max(0, k);
      }
      if (car.flipping) {
        if (car.flipAxis === 'x') pitch = -car.flipProg;
        else roll = car.flipProg * (car.flipDir || 1);
      }
      if (car.twoWheelT > 0) {
        const k = Math.min(1, (TWOWHEEL_TIME - car.twoWheelT) / 0.25) * Math.min(1, car.twoWheelT / 0.25);
        roll = 0.55 * car.twoWheelDir * k;
      }
      car.mesh.rotation.x = pitch;
      car.mesh.rotation.z = roll;

      car.mesh.position.y = car.yOff + Math.sin(this.time * 16 + car.x) * 0.03 * Math.min(1, car.speed / 20);
      car.shadow.position.y = 0.07;
      const sh = 1 - Math.min(0.55, car.yOff * 0.09);
      car.shadow.scale.set(sh, sh, 1);
    });

    // Billboard traffic + animals toward the camera (yaw only).
    this.traffic.forEach((v) => {
      if (!v.group.visible) return;
      const p = v.group.position;
      v.mesh.rotation.y = Math.atan2(camPos.x - p.x, camPos.z - p.z);
      v.shadow.position.y = 0.06;
    });
    this.animals.forEach((a) => {
      if (!a.group.visible) return;
      const p = a.group.position;
      a.mesh.rotation.y = Math.atan2(camPos.x - p.x, camPos.z - p.z);
    });

    this.shake = Math.max(0, this.shake - dt * 2.1);
  }

  updateCamera(dt) {
    const car = this.player;
    let anchorPos;
    let lookPos;
    if (car.mode === 'shortcut' && this.track.shortcut) {
      const sc = this.track.shortcut;
      const back = sc.frameAt(Math.max(0, car.ss - 8.4));
      anchorPos = back.pos.clone().addScaledVector(back.left, (car.sx || 0) * 0.5);
      const ahead = sc.frameAt(Math.min(sc.len, car.ss + 14));
      lookPos = ahead.pos.clone();
    } else {
      anchorPos = this.track.worldPos(Math.max(0, car.s - (this.demo ? 15 : 6.2)), car.x * 0.62);
      lookPos = this.track.worldPos(car.s + 16, car.x * 0.3);
    }
    const camY = anchorPos.y + (this.demo ? 6.4 : 3.15) + car.yOff * 0.45;
    if (!this.camInit) {
      this.camera.position.set(anchorPos.x, camY, anchorPos.z);
      this.camInit = true;
    } else {
      this.camera.position.lerp(this.tmpV2.set(anchorPos.x, camY, anchorPos.z), Math.min(1, 7.5 * dt));
    }
    if (this.shake > 0.01) {
      this.camera.position.x += (Math.random() - 0.5) * this.shake * 0.55;
      this.camera.position.y += (Math.random() - 0.5) * this.shake * 0.4;
    }
    lookPos.y += 2.2 + car.yOff * 0.3;
    this.camera.lookAt(lookPos);
    const speed01 = Math.min(1, car.speed / 66);
    const targetFov = (this.demo ? 62 : 70) + speed01 * 10 + (car.wheelieT > 0 ? 6 : 0);
    this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, 5 * dt);
    this.camera.updateProjectionMatrix();
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
