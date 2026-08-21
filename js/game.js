// Race engine: sprite cars on a spline track, arcade physics, AI, beans.
import * as THREE from '../vendor/three.module.js';
import { Track, ROAD_W, SHOULDER } from './track.js';
import * as tex from './tex.js';
import { audio } from './audio.js';
import { CHECKPOINTS_PER_LAP } from './data.js';

const ROAD_HALF = ROAD_W / 2;
const MAX_X = ROAD_HALF + SHOULDER - 1.2;
const MAX_BEANS = 8;
const START_BEANS = 3;

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

class Car {
  constructor(racer, track, isPlayer, lane) {
    this.racer = racer;
    this.track = track;
    this.isPlayer = isPlayer;
    this.s = -14 - Math.floor(lane / 2) * 7;   // grid rows behind the line
    this.x = (lane % 2 === 0 ? 1 : -1) * 3.6;
    this.speed = 0;
    this.yOff = 0;
    this.vy = 0;
    this.grounded = true;
    this.lap = 1;
    this.nextCheckpoint = 0;
    this.finished = false;
    this.finishTime = 0;
    this.beans = START_BEANS;
    this.beansUsed = 0;
    this.airTime = 0;
    this.lean = 0;
    this.bump = 0;
    // AI state
    this.wanderPhase = Math.random() * Math.PI * 2;
    this.rubber = 1;

    const t = loadSprite(racer.rearSprite);
    const w = racer.spriteWidth;
    const h = w * 0.78;
    this.height = h;
    const geo = new THREE.PlaneGeometry(w, h);
    const mat = new THREE.MeshBasicMaterial({
      map: t, transparent: true, alphaTest: 0.28, side: THREE.DoubleSide,
      depthWrite: true,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(w * 0.94, w * 0.5),
      new THREE.MeshBasicMaterial({
        map: tex.blobShadowTexture(), transparent: true, depthWrite: false,
      }),
    );
    this.shadow.rotation.x = -Math.PI / 2;
    this.group = new THREE.Group();
    this.group.add(this.mesh, this.shadow);
  }

  totalDist() {
    return (this.lap - 1) * this.track.length + ((this.s % this.track.length) + this.track.length) % this.track.length
      + (this.s < 0 && this.lap === 1 ? this.s : 0) * 0;
  }

  progress() {
    // Monotonic progress metric used for ranking.
    return this.rawDist;
  }
}

export class Race {
  constructor(opts) {
    // opts: { canvas, trackDef, racers, playerIndex, demo, onEvent }
    this.opts = opts;
    this.demo = !!opts.demo;
    this.onEvent = opts.onEvent || (() => {});
    this.scene = new THREE.Scene();
    this.track = new Track(opts.trackDef);
    this.scene.add(this.track.group);
    this.scene.fog = new THREE.Fog(opts.trackDef.fogColor, 120, 420);

    this.camera = new THREE.PerspectiveCamera(68, 16 / 9, 0.5, 1300);

    this.cars = opts.racers.map((r, i) => {
      const car = new Car(r, this.track, !this.demo && i === opts.playerIndex, i);
      car.rawDist = car.s;
      this.scene.add(car.group);
      return car;
    });
    this.player = this.demo ? this.cars[0] : this.cars[opts.playerIndex];

    this.laps = opts.trackDef.laps;
    this.state = this.demo ? 'race' : 'pre';
    this.raceTime = 0;
    this.timeLeft = opts.trackDef.startTime;
    this.countdownT = 0;
    this.time = 0;
    this.finishOrder = [];
    this.toasts = [];
    this.shake = 0;
    this.lastBumpSound = 0;

    this.initParticles();
  }

  initParticles() {
    const N = 90;
    this.pN = N;
    this.pPos = new Float32Array(N * 3);
    this.pLife = new Float32Array(N);
    this.pVel = new Float32Array(N * 3);
    this.pIdx = 0;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pPos, 3));
    this.pGeo = geo;
    const mat = new THREE.PointsMaterial({
      map: tex.fartPuffTexture(), size: 2.6, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, sizeAttenuation: true, color: '#bfff7a',
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.scene.add(this.points);
    for (let i = 0; i < N; i++) this.pPos[i * 3 + 1] = -999;
  }

  emitPuff(pos, vel, spread = 0.5) {
    const i = this.pIdx;
    this.pIdx = (this.pIdx + 1) % this.pN;
    this.pPos[i * 3] = pos.x + (Math.random() - 0.5) * spread;
    this.pPos[i * 3 + 1] = pos.y + (Math.random() - 0.5) * spread;
    this.pPos[i * 3 + 2] = pos.z + (Math.random() - 0.5) * spread;
    this.pVel[i * 3] = vel.x + (Math.random() - 0.5) * 2;
    this.pVel[i * 3 + 1] = 1.2 + Math.random() * 1.5;
    this.pVel[i * 3 + 2] = vel.z + (Math.random() - 0.5) * 2;
    this.pLife[i] = 0.9;
  }

  updateParticles(dt) {
    for (let i = 0; i < this.pN; i++) {
      if (this.pLife[i] > 0) {
        this.pLife[i] -= dt;
        this.pPos[i * 3] += this.pVel[i * 3] * dt;
        this.pPos[i * 3 + 1] += this.pVel[i * 3 + 1] * dt;
        this.pPos[i * 3 + 2] += this.pVel[i * 3 + 2] * dt;
        if (this.pLife[i] <= 0) this.pPos[i * 3 + 1] = -999;
      }
    }
    this.pGeo.attributes.position.needsUpdate = true;
  }

  startCountdown() {
    this.state = 'count';
    this.countdownT = 0;
    this.countShown = 0;
  }

  // ---- per-frame ----
  update(dt, input) {
    this.time += dt;
    this.track.update(this.time);

    if (this.state === 'count') {
      this.countdownT += dt;
      const n = Math.floor(this.countdownT) + 1;
      if (n !== this.countShown && n <= 3) {
        this.countShown = n;
        this.onEvent('count', 4 - n); // 3, 2, 1
      }
      if (this.countdownT >= 3) {
        this.state = 'race';
        this.onEvent('go');
      }
    }

    const racing = this.state === 'race';
    if (racing && !this.demo) {
      this.raceTime += dt;
      if (!this.player.finished) {
        this.timeLeft -= dt;
        if (this.timeLeft <= 0) {
          this.timeLeft = 0;
          this.endRace(true);
        }
      }
    }

    this.cars.forEach((car) => {
      if (car.isPlayer && !car.finished && !this.demo) {
        this.updatePlayer(car, dt, racing ? input : null);
      } else {
        this.updateAI(car, dt, racing || this.demo);
      }
      this.postPhysics(car, dt);
    });

    this.resolveCollisions(dt);
    if (!this.demo) this.checkProgress();
    this.updateVisuals(dt);
    this.updateParticles(dt);
    this.updateCamera(dt);

    if (!this.demo) {
      const p01 = Math.min(1, this.player.speed / this.player.racer.topSpeed);
      audio.setEngine(p01, this.playerTurbo);
    }
  }

  updatePlayer(car, dt, input) {
    const r = car.racer;
    const steer = input ? input.steer : 0;
    const braking = input ? input.brakeActive : false;
    const wantFart = input ? input.fartActive : false;

    // Turbo fart: hold + beans available. Consumes 1 bean per 0.9 s.
    this.playerTurbo = false;
    if (wantFart && car.beans > 0 && this.state === 'race') {
      this.playerTurbo = true;
      car.fartAcc = (car.fartAcc || 0) + dt;
      if (car.fartAcc >= 0.9) {
        car.fartAcc -= 0.9;
        car.beans -= 1;
        car.beansUsed += 1;
      }
      if (!car.farting) { car.farting = true; audio.startFart(); this.onEvent('fart', true); }
    } else if (car.farting) {
      car.farting = false;
      car.fartAcc = 0;
      audio.stopFart();
      this.onEvent('fart', false);
    }

    const offroad = Math.abs(car.x) > ROAD_HALF + 0.4;
    const turboMul = this.playerTurbo ? 1.33 : 1;
    const offMul = offroad ? 0.55 : 1;
    const maxSpeed = r.topSpeed * turboMul * offMul;
    const accel = r.accel * (this.playerTurbo ? 1.7 : 1);

    if (this.state !== 'race') {
      car.speed = Math.max(0, car.speed - 30 * dt);
    } else if (braking) {
      car.speed = Math.max(0, car.speed - 55 * dt);
    } else if (car.speed < maxSpeed) {
      car.speed = Math.min(maxSpeed, car.speed + accel * dt);
    } else {
      car.speed = Math.max(maxSpeed, car.speed - 26 * dt);
    }

    // Steering (less authority in the air, a bit floaty on turbo).
    const grip = car.grounded ? 1 : 0.35;
    const authority = r.steer * grip * (this.playerTurbo ? 0.9 : 1);
    car.x += steer * authority * (14 + car.speed * 0.22) * dt * -1;

    // Centrifugal push on curves: positive curvature (left turn) pushes right.
    const curv = this.track.curvatureAt(car.s);
    car.x += curv * car.speed * car.speed * 0.011 * dt * (2 - r.stats.grip);
    car.lean = THREE.MathUtils.lerp(car.lean, steer * -0.14 + curv * 1.4, Math.min(1, 8 * dt));

    if (Math.abs(car.x) > MAX_X) {
      car.x = Math.sign(car.x) * MAX_X;
      car.speed *= (1 - 1.6 * dt);
      this.shake = Math.min(1, this.shake + dt * 4);
    }
    if (offroad) this.shake = Math.min(0.4, this.shake + dt * 1.2);

    car.s += car.speed * dt;
    car.rawDist += car.speed * dt;

    if (this.playerTurbo) {
      const f = this.track.frameAt(car.s);
      const behind = this.track.worldPos(car.s - 2.4, car.x);
      behind.y += 0.9 + car.yOff;
      this.emitPuff(behind, { x: -f.tan.x * 6, z: -f.tan.z * 6 });
    }

    // Bean pickups.
    this.track.beans.forEach((b) => {
      if (!b.active) return;
      let ds = (car.s - b.s) % this.track.length;
      if (ds > this.track.length / 2) ds -= this.track.length;
      if (ds < -this.track.length / 2) ds += this.track.length;
      if (Math.abs(ds) < 2.4 && Math.abs(car.x - b.x) < 2.2 && car.yOff < 2) {
        b.active = false;
        b.respawn = this.time + 11;
        b.sprite.visible = false;
        if (car.beans < MAX_BEANS) car.beans += 1;
        audio.pickup();
        this.onEvent('bean', car.beans);
      }
    });
    // Respawns.
    this.track.beans.forEach((b) => {
      if (!b.active && this.time > b.respawn) {
        b.active = true;
        b.sprite.visible = true;
      }
    });

    this.handleRamps(car, dt, true);
  }

  updateAI(car, dt, go) {
    const r = car.racer;
    if (!go) { car.speed = Math.max(0, car.speed - 30 * dt); car.s += car.speed * dt; return; }

    // Rubber-band toward the player so the pack stays close.
    if (!this.demo && !car.finished) {
      const gap = this.player.rawDist - car.rawDist;
      car.rubber = THREE.MathUtils.clamp(1 + gap * 0.0022, 0.86, 1.16);
    }
    const curvAhead = Math.abs(this.track.curvatureAt(car.s + 26)) + Math.abs(this.track.curvatureAt(car.s + 12));
    const cornerCap = r.topSpeed * (1.06 - Math.min(0.4, curvAhead * 9));
    const maxSpeed = Math.min(r.topSpeed * r.aiSkill * car.rubber, cornerCap);
    car.speed += THREE.MathUtils.clamp(maxSpeed - car.speed, -40 * dt, r.accel * 0.9 * dt);
    if (car.speed < 0) car.speed = 0;

    // Lane: gentle wander plus avoidance.
    car.wanderPhase += dt * 0.5;
    let targetX = Math.sin(car.wanderPhase) * (ROAD_HALF - 3.4);
    this.cars.forEach((other) => {
      if (other === car) return;
      let ds = other.rawDist - car.rawDist;
      if (ds > 2 && ds < 14 && Math.abs(other.x - car.x) < 3) {
        targetX = other.x > 0 ? other.x - 5 : other.x + 5;
      }
    });
    targetX = THREE.MathUtils.clamp(targetX, -(ROAD_HALF - 1.6), ROAD_HALF - 1.6);
    const dx = targetX - car.x;
    car.x += THREE.MathUtils.clamp(dx, -10 * dt, 10 * dt);
    car.lean = THREE.MathUtils.lerp(car.lean, THREE.MathUtils.clamp(-dx * 0.03, -0.12, 0.12), Math.min(1, 6 * dt));

    car.s += car.speed * dt;
    car.rawDist += car.speed * dt;

    this.handleRamps(car, dt, false);

    if (!this.demo && !car.finished && car.rawDist >= this.laps * this.track.length) {
      car.finished = true;
      car.finishTime = this.raceTime;
      this.finishOrder.push(car);
    }
  }

  handleRamps(car, dt, isPlayer) {
    if (car.grounded) {
      for (const ramp of this.track.ramps) {
        let ds = (((car.s - ramp.s) % this.track.length) + this.track.length) % this.track.length;
        if (ds > ramp.len - 2 && ds < ramp.len + 2 && Math.abs(car.x) < ramp.halfW && car.speed > 18) {
          car.grounded = false;
          car.vy = car.speed * (ramp.hgt / ramp.len) * 1.35;
          car.airTime = 0;
          if (isPlayer) audio.bigAir();
          break;
        }
      }
    }
  }

  postPhysics(car, dt) {
    if (!car.grounded) {
      car.airTime += dt;
      car.yOff += car.vy * dt;
      car.vy -= 26 * dt;
      if (car.yOff <= 0) {
        car.yOff = 0;
        car.grounded = true;
        if (car.isPlayer && car.airTime > 0.55) {
          this.timeLeft += 1.5;
          this.onEvent('toast', car.airTime > 1.0 ? 'HUGE AIR! +1.5s' : 'BIG AIR! +1.5s');
          this.shake = Math.min(1, this.shake + 0.35);
        }
      }
    }
  }

  resolveCollisions(dt) {
    for (let i = 0; i < this.cars.length; i++) {
      for (let j = i + 1; j < this.cars.length; j++) {
        const a = this.cars[i];
        const b = this.cars[j];
        const ds = b.rawDist - a.rawDist;
        if (Math.abs(ds) < 4.4 && Math.abs(a.x - b.x) < 2.8 && Math.abs(a.yOff - b.yOff) < 1.6) {
          const push = (2.8 - Math.abs(a.x - b.x)) * 0.5 + 0.15;
          const dir = a.x > b.x ? 1 : -1;
          a.x = THREE.MathUtils.clamp(a.x + dir * push, -MAX_X, MAX_X);
          b.x = THREE.MathUtils.clamp(b.x - dir * push, -MAX_X, MAX_X);
          const rear = ds > 0 ? a : b;
          rear.speed *= (1 - 1.2 * dt);
          if ((a.isPlayer || b.isPlayer) && this.time - this.lastBumpSound > 0.35) {
            this.lastBumpSound = this.time;
            audio.crash();
            this.shake = Math.min(1, this.shake + 0.3);
          }
        }
      }
    }
  }

  checkProgress() {
    const car = this.player;
    if (car.finished) return;
    const L = this.track.length;
    const lapS = ((car.rawDist % L) + L) % L;
    // Checkpoint arches.
    const cps = this.track.checkpoints;
    const idx = car.nextCheckpoint % (cps.length + 1);
    if (idx < cps.length) {
      if (lapS >= cps[idx] && lapS < cps[idx] + 30 && car.rawDist > 0) {
        car.nextCheckpoint++;
        this.timeLeft += this.opts.trackDef.checkpointTime;
        audio.checkpoint();
        this.onEvent('toast', `CHECKPOINT +${this.opts.trackDef.checkpointTime}s`);
      }
    } else if (car.rawDist >= car.lap * L) {
      car.nextCheckpoint = 0;
      car.lap++;
      if (car.lap > this.laps) {
        car.finished = true;
        car.finishTime = this.raceTime;
        this.finishOrder.push(car);
        this.endRace(false);
      } else {
        this.timeLeft += this.opts.trackDef.checkpointTime;
        audio.checkpoint();
        this.onEvent('toast', car.lap === this.laps ? 'FINAL LAP!' : `LAP ${car.lap}`);
      }
    }
  }

  positionOf(car) {
    let pos = 1;
    this.cars.forEach((o) => {
      if (o !== car && o.rawDist > car.rawDist) pos++;
    });
    return pos;
  }

  endRace(timeUp) {
    if (this.state === 'over') return;
    this.state = 'over';
    audio.stopFart();
    const place = this.positionOf(this.player);
    // Build results: actual times where known, estimates otherwise.
    const results = this.cars.map((c) => ({
      racer: c.racer,
      isPlayer: c.isPlayer,
      finished: c.finished,
      time: c.finished ? c.finishTime
        : this.raceTime + Math.max(0, (this.laps * this.track.length - c.rawDist)) / Math.max(20, c.racer.topSpeed * 0.86),
      dist: c.rawDist,
    })).sort((x, y) => (y.dist - x.dist));
    this.onEvent('finish', {
      place,
      timeUp,
      raceTime: this.raceTime,
      beansUsed: this.player.beansUsed,
      results,
    });
    audio.finish(place === 1 && !timeUp);
  }

  updateVisuals(dt) {
    const camPos = this.camera.position;
    this.cars.forEach((car) => {
      const p = this.track.worldPos(car.s, car.x);
      car.group.position.set(p.x, p.y, p.z);
      car.mesh.position.y = car.height / 2 - 0.3 + car.yOff;
      // Billboard around Y toward the camera.
      const yaw = Math.atan2(camPos.x - p.x, camPos.z - p.z);
      car.mesh.rotation.set(0, yaw, car.lean, 'YXZ');
      // Little idle bounce + landing squash.
      car.mesh.position.y += Math.sin(this.time * 17 + car.x) * 0.03 * Math.min(1, car.speed / 20);
      car.shadow.position.y = 0.06;
      const sh = 1 - Math.min(0.55, car.yOff * 0.1);
      car.shadow.scale.set(sh, sh, 1);
    });
    this.shake = Math.max(0, this.shake - dt * 2.2);
  }

  updateCamera(dt) {
    const car = this.player;
    const back = this.demo ? 16 : 9.5;
    const p = this.track.worldPos(car.s - back, car.x * 0.55);
    const look = this.track.worldPos(car.s + 12, car.x * 0.25);
    const camY = p.y + (this.demo ? 7 : 4.6) + car.yOff * 0.45;
    if (!this.camInit) {
      this.camera.position.set(p.x, camY, p.z);
      this.camInit = true;
    } else {
      const k = Math.min(1, 7 * dt);
      this.camera.position.lerp(new THREE.Vector3(p.x, camY, p.z), k);
    }
    if (this.shake > 0.01) {
      this.camera.position.x += (Math.random() - 0.5) * this.shake * 0.5;
      this.camera.position.y += (Math.random() - 0.5) * this.shake * 0.35;
    }
    look.y += 2.1 + car.yOff * 0.3;
    this.camera.lookAt(look);
    const speed01 = Math.min(1, car.speed / 64);
    const targetFov = (this.demo ? 60 : 66) + speed01 * 9 + (this.playerTurbo ? 7 : 0);
    this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, 5 * dt);
    this.camera.updateProjectionMatrix();
  }

  hud() {
    const car = this.player;
    return {
      mph: Math.round(car.speed * 2.1),
      timeLeft: this.timeLeft,
      raceTime: this.raceTime,
      lap: Math.min(car.lap, this.laps),
      laps: this.laps,
      place: this.positionOf(car),
      beans: car.beans,
      maxBeans: MAX_BEANS,
      turbo: !!this.playerTurbo,
    };
  }

  dispose() {
    audio.stopFart();
    this.scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach((m) => {
          if (m.map && !spriteCache.has(m.map.image?.src || '')) m.map.dispose();
          m.dispose();
        });
      }
    });
  }
}
