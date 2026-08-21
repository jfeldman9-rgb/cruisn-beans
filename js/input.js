// Steering: drag on the road (or arrows / A-D). Gas is automatic.
// DOUBLE-TAP the gas pad / road / up-arrow = WHEELIE (turbo).
// Double-tap gas in the air = FLIP. Double-tap a steer key (or flick) =
// TWO-WHEEL / side flip. BRAKE is a hold button (or S / down).

const DOUBLE_MS = 280;

export class Input {
  constructor() {
    this.steer = 0;
    this.brake = false;
    this.keys = new Set();
    this.touchId = null;
    this.touchStartX = 0;
    this.touchStartY = 0;
    this.touchStartT = 0;
    this.touchMoved = false;
    this.touchSteer = 0;
    this.keySteer = 0;
    this.anyInput = false;
    this.onFirstInput = null;

    // Pending stunt events, consumed once per frame by the game.
    this.pendingWheelie = false;
    this.pendingTwoWheel = 0;
    this.lastTapEnd = -9999;
    this.lastGasKey = -9999;
    this.lastSteerKey = { left: -9999, right: -9999 };
    this.flickAccum = 0;
    this.lastFlickSample = 0;

    window.addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase();
      if (['arrowleft', 'arrowright', 'arrowdown', 'arrowup', ' '].includes(k)) e.preventDefault();
      if (e.repeat) return;
      const now = performance.now();
      if (k === ' ') this.pendingWheelie = true; // space always wheelies
      if (k === 'arrowup' || k === 'w') {
        if (now - this.lastGasKey < DOUBLE_MS) this.pendingWheelie = true;
        this.lastGasKey = now;
      }
      if (k === 'arrowleft' || k === 'a') {
        if (now - this.lastSteerKey.left < DOUBLE_MS) this.pendingTwoWheel = -1;
        this.lastSteerKey.left = now;
      }
      if (k === 'arrowright' || k === 'd') {
        if (now - this.lastSteerKey.right < DOUBLE_MS) this.pendingTwoWheel = 1;
        this.lastSteerKey.right = now;
      }
      this.keys.add(k);
      this.markInput();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => this.keys.clear());
  }

  markInput() {
    if (!this.anyInput) {
      this.anyInput = true;
      if (this.onFirstInput) this.onFirstInput();
    }
  }

  bindSteerSurface(el) {
    const opts = { passive: false };
    el.addEventListener('touchstart', (e) => {
      if (this.touchId !== null) return;
      const t = e.changedTouches[0];
      this.touchId = t.identifier;
      this.touchStartX = t.clientX;
      this.touchStartY = t.clientY;
      this.touchStartT = performance.now();
      this.touchMoved = false;
      this.touchSteer = 0;
      this.markInput();
      e.preventDefault();
    }, opts);
    el.addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === this.touchId) {
          const dx = t.clientX - this.touchStartX;
          if (Math.abs(dx) > 12 || Math.abs(t.clientY - this.touchStartY) > 12) this.touchMoved = true;
          const range = Math.min(window.innerWidth * 0.16, 130);
          const next = Math.max(-1, Math.min(1, dx / range));
          // Fast flick detection → two-wheel.
          const now = performance.now();
          const vel = (next - this.touchSteer) / Math.max(1, now - (this.lastFlickSample || now)) * 1000;
          this.lastFlickSample = now;
          if (Math.abs(vel) > 14 && Math.abs(next) > 0.8) {
            this.pendingTwoWheel = vel > 0 ? 1 : -1;
          }
          this.touchSteer = next;
        }
      }
      e.preventDefault();
    }, opts);
    const end = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === this.touchId) {
          const now = performance.now();
          // A quick, non-drag tap: double-tap = wheelie.
          if (!this.touchMoved && now - this.touchStartT < 240) {
            if (now - this.lastTapEnd < DOUBLE_MS) this.pendingWheelie = true;
            this.lastTapEnd = now;
          }
          this.touchId = null;
          this.touchSteer = 0;
        }
      }
    };
    el.addEventListener('touchend', end);
    el.addEventListener('touchcancel', end);

    // Mouse fallback for desktop.
    let mouseDown = false;
    let mouseMoved = false;
    let mouseDownT = 0;
    el.addEventListener('mousedown', (e) => {
      mouseDown = true; mouseMoved = false; mouseDownT = performance.now();
      this.touchStartX = e.clientX;
      this.markInput();
    });
    window.addEventListener('mousemove', (e) => {
      if (!mouseDown) return;
      const dx = e.clientX - this.touchStartX;
      if (Math.abs(dx) > 12) mouseMoved = true;
      this.touchSteer = Math.max(-1, Math.min(1, dx / 130));
    });
    window.addEventListener('mouseup', () => {
      if (mouseDown && !mouseMoved && performance.now() - mouseDownT < 240) {
        const now = performance.now();
        if (now - this.lastTapEnd < DOUBLE_MS) this.pendingWheelie = true;
        this.lastTapEnd = now;
      }
      mouseDown = false;
      this.touchSteer = 0;
    });
  }

  bindHoldButton(el, prop) {
    const on = (e) => { this[prop] = true; this.markInput(); e.preventDefault(); };
    const off = (e) => { this[prop] = false; if (e) e.preventDefault(); };
    el.addEventListener('touchstart', on, { passive: false });
    el.addEventListener('touchend', off);
    el.addEventListener('touchcancel', off);
    el.addEventListener('mousedown', on);
    el.addEventListener('mouseup', off);
    el.addEventListener('mouseleave', () => { this[prop] = false; });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  bindGasPad(el) {
    // The fat GAS pad: double-tap it to wheelie (gas itself is automatic).
    let lastTap = -9999;
    const tap = (e) => {
      const now = performance.now();
      if (now - lastTap < DOUBLE_MS) this.pendingWheelie = true;
      lastTap = now;
      this.markInput();
      e.preventDefault();
    };
    el.addEventListener('touchstart', tap, { passive: false });
    el.addEventListener('mousedown', tap);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  consumeStunts() {
    const out = { wheelie: this.pendingWheelie, twoWheel: this.pendingTwoWheel };
    this.pendingWheelie = false;
    this.pendingTwoWheel = 0;
    return out;
  }

  update(dt) {
    let target = 0;
    if (this.keys.has('arrowleft') || this.keys.has('a')) target -= 1;
    if (this.keys.has('arrowright') || this.keys.has('d')) target += 1;
    const rate = target !== 0 ? 5 : 9;
    this.keySteer += (target - this.keySteer) * Math.min(1, rate * dt);
    if (Math.abs(this.keySteer) < 0.02 && target === 0) this.keySteer = 0;

    const kb = this.keySteer;
    this.steer = Math.abs(this.touchSteer) > Math.abs(kb) ? this.touchSteer : kb;
    this.brakeActive = this.brake || this.keys.has('arrowdown') || this.keys.has('s');
  }
}
