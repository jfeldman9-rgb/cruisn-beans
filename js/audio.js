// All-synth WebAudio: engine, comedy fart turbo, jingles, chip music.
// No audio files needed, everything is generated.

class AudioBox {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = localStorage.getItem('cb_muted') === '1';
    this.engineNodes = null;
    this.fartNodes = null;
    this.music = null;
  }

  ensure() {
    if (this.ctx) return true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 1;
    this.master.connect(this.ctx.destination);
    return true;
  }

  resume() {
    if (this.ensure() && this.ctx.state === 'suspended') this.ctx.resume();
  }

  setMuted(m) {
    this.muted = m;
    localStorage.setItem('cb_muted', m ? '1' : '0');
    if (this.master) {
      this.master.gain.setTargetAtTime(m ? 0 : 1, this.ctx.currentTime, 0.02);
    }
  }

  toggleMuted() {
    this.setMuted(!this.muted);
    return this.muted;
  }

  announce(line) {
    // Short, deliberately corny cabinet calls. Speech is optional; browsers
    // without speech synthesis still retain every visual cue and synth SFX.
    if (this.muted || !line || !window.speechSynthesis || !window.SpeechSynthesisUtterance) return;
    const now = performance.now();
    if (this.lastAnnounce && now - this.lastAnnounce < 650) return;
    this.lastAnnounce = now;
    const voice = new window.SpeechSynthesisUtterance(line);
    voice.rate = 1.06;
    voice.pitch = 0.72;
    voice.volume = 0.82;
    window.speechSynthesis.speak(voice);
  }

  // ---- one-shots ----
  beep(freq, dur = 0.14, type = 'square', vol = 0.25) {
    if (!this.ensure()) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  countdownBeep(final) {
    this.beep(final ? 880 : 440, final ? 0.5 : 0.18, 'square', 0.3);
  }

  checkpoint() {
    [660, 880, 1100].forEach((f, i) => setTimeout(() => this.beep(f, 0.1, 'square', 0.22), i * 70));
  }

  pickup() {
    this.beep(300, 0.06, 'sine', 0.3);
    setTimeout(() => this.beep(520, 0.09, 'sine', 0.25), 50);
  }

  bigAir() {
    [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.beep(f, 0.1, 'sawtooth', 0.18), i * 60));
  }

  honk() {
    // Two-tone truck horn.
    this.beep(310, 0.28, 'sawtooth', 0.22);
    this.beep(392, 0.28, 'sawtooth', 0.22);
  }

  wheelie() {
    // Rising rev.
    if (!this.ensure()) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(120, t);
    o.frequency.exponentialRampToValueAtTime(420, t + 0.5);
    g.gain.setValueAtTime(0.22, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
    o.connect(g).connect(this.master);
    o.start(t); o.stop(t + 0.6);
  }

  whoosh() {
    if (!this.ensure()) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer(0.4);
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.setValueAtTime(600, t);
    f.frequency.exponentialRampToValueAtTime(2400, t + 0.3);
    f.Q.value = 2;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.3, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    src.connect(f).connect(g).connect(this.master);
    src.start(t);
  }

  animal(kind) {
    if (!this.ensure()) return;
    const t = this.ctx.currentTime;
    if (kind === 'moo' || kind === 'heehaw') {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = 'sawtooth';
      if (kind === 'moo') {
        o.frequency.setValueAtTime(180, t);
        o.frequency.exponentialRampToValueAtTime(95, t + 0.55);
      } else {
        o.frequency.setValueAtTime(330, t);
        o.frequency.setValueAtTime(190, t + 0.18);
        o.frequency.setValueAtTime(330, t + 0.36);
        o.frequency.setValueAtTime(190, t + 0.5);
      }
      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = 900;
      g.gain.setValueAtTime(0.3, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
      o.connect(f).connect(g).connect(this.master);
      o.start(t); o.stop(t + 0.65);
    } else if (kind === 'squeal' || kind === 'cluck' || kind === 'squawk') {
      [900, 1300, 1100].forEach((fq, i) => {
        setTimeout(() => this.beep(fq + Math.random() * 200, 0.08, 'square', 0.2), i * 80);
      });
    } else {
      this.crash();
    }
  }

  crash() {
    if (!this.ensure()) return;
    const t = this.ctx.currentTime;
    const buf = this.noiseBuffer(0.25);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 900;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.4, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    src.connect(f).connect(g).connect(this.master);
    src.start(t);
  }

  finish(won) {
    const seq = won ? [523, 659, 784, 1046, 784, 1046] : [392, 330, 262];
    seq.forEach((f, i) => setTimeout(() => this.beep(f, 0.16, 'square', 0.25), i * 130));
  }

  noiseBuffer(sec) {
    const n = (this.ctx.sampleRate * sec) | 0;
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < n; i++) {
      // Brown-ish noise.
      last = (last + (Math.random() * 2 - 1) * 0.15);
      last = Math.max(-1, Math.min(1, last));
      d[i] = last * 2.4;
    }
    return buf;
  }

  // ---- engine loop ----
  startEngine() {
    if (!this.ensure() || this.engineNodes) return;
    const ctx = this.ctx;
    const o1 = ctx.createOscillator();
    const o2 = ctx.createOscillator();
    o1.type = 'sawtooth'; o2.type = 'square';
    o1.frequency.value = 55; o2.frequency.value = 55.7;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 420; f.Q.value = 2;
    const g = ctx.createGain();
    g.gain.value = 0.0;
    o1.connect(f); o2.connect(f);
    f.connect(g).connect(this.master);
    o1.start(); o2.start();
    this.engineNodes = { o1, o2, f, g };
  }

  setEngine(speed01, turbo) {
    if (!this.engineNodes) return;
    const t = this.ctx.currentTime;
    const base = 48 + speed01 * 150 + (turbo ? 30 : 0);
    this.engineNodes.o1.frequency.setTargetAtTime(base, t, 0.05);
    this.engineNodes.o2.frequency.setTargetAtTime(base * 1.01 + 1, t, 0.05);
    this.engineNodes.f.frequency.setTargetAtTime(320 + speed01 * 900, t, 0.1);
    this.engineNodes.g.gain.setTargetAtTime(0.05 + speed01 * 0.1, t, 0.1);
  }

  stopEngine() {
    if (!this.engineNodes) return;
    const { o1, o2, g } = this.engineNodes;
    g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
    setTimeout(() => { try { o1.stop(); o2.stop(); } catch (e) { /* done */ } }, 300);
    this.engineNodes = null;
  }

  // ---- the fart ----
  startFart() {
    if (!this.ensure() || this.fartNodes) return;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer(2);
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 130; bp.Q.value = 4;
    const lfo = ctx.createOscillator();
    lfo.type = 'sine'; lfo.frequency.value = 21;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 70;
    lfo.connect(lfoGain).connect(bp.frequency);
    const sub = ctx.createOscillator();
    sub.type = 'square';
    sub.frequency.setValueAtTime(95, ctx.currentTime);
    sub.frequency.exponentialRampToValueAtTime(52, ctx.currentTime + 0.5);
    const subGain = ctx.createGain();
    subGain.gain.value = 0.1;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.5, ctx.currentTime + 0.06);
    src.connect(bp).connect(g);
    sub.connect(subGain).connect(g);
    g.connect(this.master);
    src.start(); lfo.start(); sub.start();
    this.fartNodes = { src, lfo, sub, g };
  }

  stopFart() {
    if (!this.fartNodes) return;
    const { src, lfo, sub, g } = this.fartNodes;
    g.gain.setTargetAtTime(0.001, this.ctx.currentTime, 0.06);
    setTimeout(() => { try { src.stop(); lfo.stop(); sub.stop(); } catch (e) { /* done */ } }, 250);
    this.fartNodes = null;
  }

  // ---- chip music ----
  // Simple lookahead step sequencer. Patterns are arrays of midi notes (0 = rest).
  startMusic(kind) {
    if (!this.ensure()) return;
    this.stopMusic();
    const bass = kind === 'title'
      ? [38, 0, 38, 0, 41, 0, 43, 0, 38, 0, 38, 0, 46, 45, 43, 41]
      : [36, 36, 0, 36, 39, 0, 36, 0, 41, 41, 0, 41, 43, 0, 39, 0];
    const lead = kind === 'title'
      ? [62, 65, 69, 74, 72, 69, 65, 62, 60, 64, 67, 72, 71, 67, 64, 60]
      : [0, 0, 67, 0, 70, 72, 0, 70, 0, 67, 0, 63, 65, 0, 63, 0];
    const bpm = kind === 'title' ? 112 : 138;
    const stepDur = 60 / bpm / 2;
    const state = { step: 0, next: this.ctx.currentTime + 0.06, timer: 0, gain: this.ctx.createGain() };
    state.gain.gain.value = 0.16;
    state.gain.connect(this.master);
    const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);
    const tick = () => {
      while (state.next < this.ctx.currentTime + 0.14) {
        const i = state.step % 16;
        const bn = bass[i];
        if (bn) this.note(midi(bn), state.next, stepDur * 0.9, 'triangle', 0.85, state.gain);
        const ln = lead[i];
        if (ln) this.note(midi(ln), state.next, stepDur * 0.6, 'square', 0.3, state.gain);
        if (i % 4 === 0) this.noiseHit(state.next, 0.03, state.gain, 0.25);
        state.step++;
        state.next += stepDur;
      }
    };
    state.timer = setInterval(tick, 50);
    this.music = state;
  }

  note(freq, when, dur, type, vol, out) {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, when);
    g.gain.exponentialRampToValueAtTime(0.001, when + dur);
    o.connect(g).connect(out);
    o.start(when); o.stop(when + dur + 0.02);
  }

  noiseHit(when, dur, out, vol) {
    const src = this.ctx.createBufferSource();
    src.buffer = this._hatBuf || (this._hatBuf = (() => {
      const n = (this.ctx.sampleRate * 0.05) | 0;
      const b = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
      const d = b.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      return b;
    })());
    const f = this.ctx.createBiquadFilter();
    f.type = 'highpass'; f.frequency.value = 6000;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, when);
    g.gain.exponentialRampToValueAtTime(0.001, when + dur);
    src.connect(f).connect(g).connect(out);
    src.start(when); src.stop(when + dur + 0.02);
  }

  stopMusic() {
    if (!this.music) return;
    clearInterval(this.music.timer);
    try { this.music.gain.disconnect(); } catch (e) { /* fine */ }
    this.music = null;
  }
}

export const audio = new AudioBox();
