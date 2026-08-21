// Steering: drag anywhere on the road view (or arrows / A-D).
// Gas is automatic; BRAKE and FART are hold buttons (or S/down, space).

export class Input {
  constructor() {
    this.steer = 0;        // -1 .. 1
    this.brake = false;
    this.fart = false;
    this.keys = new Set();
    this.touchId = null;
    this.touchStartX = 0;
    this.touchSteer = 0;
    this.keySteer = 0;
    this.anyInput = false; // used to dismiss the how-to hint
    this.onFirstInput = null;

    window.addEventListener('keydown', (e) => {
      if (['ArrowLeft', 'ArrowRight', 'ArrowDown', 'ArrowUp', ' '].includes(e.key)) e.preventDefault();
      this.keys.add(e.key.toLowerCase());
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

  // Attach touch-steer to the game canvas region.
  bindSteerSurface(el) {
    const opts = { passive: false };
    el.addEventListener('touchstart', (e) => {
      if (this.touchId !== null) return;
      const t = e.changedTouches[0];
      this.touchId = t.identifier;
      this.touchStartX = t.clientX;
      this.touchSteer = 0;
      this.markInput();
      e.preventDefault();
    }, opts);
    el.addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === this.touchId) {
          const dx = t.clientX - this.touchStartX;
          const range = Math.min(window.innerWidth * 0.16, 130);
          this.touchSteer = Math.max(-1, Math.min(1, dx / range));
        }
      }
      e.preventDefault();
    }, opts);
    const end = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === this.touchId) {
          this.touchId = null;
          this.touchSteer = 0;
        }
      }
    };
    el.addEventListener('touchend', end);
    el.addEventListener('touchcancel', end);

    // Mouse fallback for desktop testing.
    let mouseDown = false;
    el.addEventListener('mousedown', (e) => {
      mouseDown = true;
      this.touchStartX = e.clientX;
      this.markInput();
    });
    window.addEventListener('mousemove', (e) => {
      if (!mouseDown) return;
      const dx = e.clientX - this.touchStartX;
      this.touchSteer = Math.max(-1, Math.min(1, dx / 130));
    });
    window.addEventListener('mouseup', () => { mouseDown = false; this.touchSteer = 0; });
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

  update(dt) {
    // Keyboard steer eases in/out so taps give fine control.
    let target = 0;
    if (this.keys.has('arrowleft') || this.keys.has('a')) target -= 1;
    if (this.keys.has('arrowright') || this.keys.has('d')) target += 1;
    const rate = target !== 0 ? 5 : 9;
    this.keySteer += (target - this.keySteer) * Math.min(1, rate * dt);
    if (Math.abs(this.keySteer) < 0.02 && target === 0) this.keySteer = 0;

    const kb = this.keySteer;
    this.steer = Math.abs(this.touchSteer) > Math.abs(kb) ? this.touchSteer : kb;

    const kbBrake = this.keys.has('arrowdown') || this.keys.has('s');
    const kbFart = this.keys.has(' ');
    this.brakeActive = this.brake || kbBrake;
    this.fartActive = this.fart || kbFart;
  }
}
