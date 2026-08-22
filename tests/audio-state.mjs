import assert from 'node:assert/strict';

const storage = new Map();
globalThis.localStorage = {
  getItem: (key) => storage.get(key) || null,
  setItem: (key, value) => storage.set(key, value),
};

const visibilityListeners = [];
globalThis.document = {
  hidden: false,
  addEventListener(type, listener) {
    if (type === 'visibilitychange') visibilityListeners.push(listener);
  },
};

class FakeParam {
  constructor(value = 0) { this.value = value; }
  setTargetAtTime(value) { this.value = value; }
}

class FakeGain {
  constructor() { this.gain = new FakeParam(1); }
  connect() { return this; }
  disconnect() {}
}

class FakeAudioContext {
  constructor() {
    this.state = 'running';
    this.currentTime = 0;
    this.destination = {};
  }
  createGain() { return new FakeGain(); }
  resume() { this.state = 'running'; return Promise.resolve(); }
}

class FakeAudio {
  static instances = [];
  constructor(src) {
    this.src = src;
    this.loop = false;
    this.preload = '';
    this.playsInline = false;
    this.volume = 1;
    this.muted = false;
    this.paused = true;
    this.currentTime = 0;
    this.playCalls = 0;
    this.pauseCalls = 0;
    this.rejectNext = null;
    this.listeners = new Map();
    FakeAudio.instances.push(this);
  }
  addEventListener(type, listener) { this.listeners.set(type, listener); }
  play() {
    this.playCalls++;
    if (this.rejectNext) {
      const error = this.rejectNext;
      this.rejectNext = null;
      this.paused = true;
      return Promise.reject(error);
    }
    this.paused = false;
    return Promise.resolve();
  }
  pause() { this.pauseCalls++; this.paused = true; }
}

class FakeVoice {
  constructor(text) { this.text = text; }
}

const speech = {
  cancelCalls: 0,
  voice: null,
  cancel() { this.cancelCalls++; },
  speak(voice) { this.voice = voice; voice.onstart?.(); },
};

globalThis.Audio = FakeAudio;
globalThis.window = {
  AudioContext: FakeAudioContext,
  speechSynthesis: speech,
  SpeechSynthesisUtterance: FakeVoice,
};

const { audio } = await import(`../js/audio.js?audio-state=${Date.now()}`);
assert.equal(FakeAudio.instances.length, 1);
const song = FakeAudio.instances[0];
assert.match(song.src, /assets\/audio\/cruisn-the-world\.mp3/);
assert.equal(song.loop, true);
assert.equal(song.preload, 'auto');
assert.equal(song.playsInline, true);

assert.equal(await audio.startMusic('title'), true);
assert.equal(song.volume, 0.22);
song.currentTime = 47.25;
assert.equal(await audio.startMusic('countdown'), true);
assert.equal(song.volume, 0.16);
assert.equal(await audio.startMusic('race'), true);
assert.equal(song.volume, 0.28);
assert.equal(song.currentTime, 47.25, 'mode change restarted the soundtrack');
assert.equal(await audio.startMusic('results'), true);
assert.equal(song.volume, 0.18);
assert.equal(FakeAudio.instances.length, 1, 'music mode created a duplicate media element');
assert.deepEqual(audio.status(), {
  mode: 'results',
  wanted: true,
  source: song.src,
  paused: false,
  currentTime: 47.25,
  volume: 0.18,
  muted: false,
  fallback: false,
});

audio.setMuted(true);
assert.equal(song.muted, true);
assert.ok(speech.cancelCalls > 0);
audio.setMuted(false);
audio.startMusic('race');
audio.announce('Checkpoint!');
assert.equal(song.volume, 0.09, 'announcer did not duck the soundtrack');
audio.setMuted(true);
assert.equal(song.volume, 0.28, 'muting did not clear the announcer duck');
audio.setMuted(false);
assert.equal(song.volume, 0.28, 'unmuting preserved the announcer duck');
speech.voice.onend();
assert.equal(song.volume, 0.28, 'soundtrack did not recover after announcer');

document.hidden = true;
visibilityListeners.forEach((listener) => listener());
assert.equal(song.paused, true);
assert.equal(song.currentTime, 47.25);
document.hidden = false;
visibilityListeners.forEach((listener) => listener());
await Promise.resolve();
assert.equal(song.paused, false);
assert.equal(song.currentTime, 47.25);

audio.stopMusic();
assert.equal(song.paused, true);
assert.equal(song.currentTime, 47.25);

const blocked = new Error('gesture required');
blocked.name = 'NotAllowedError';
song.rejectNext = blocked;
assert.equal(await audio.startMusic('title'), false, 'autoplay rejection was not surfaced');
assert.equal(await audio.startMusic('title'), true, 'song did not retry on the next gesture');
assert.equal(song.currentTime, 47.25, 'autoplay retry restarted the soundtrack');

const interrupted = new Error('play interrupted by pause');
interrupted.name = 'AbortError';
song.rejectNext = interrupted;
assert.equal(await audio.startMusic('title'), false, 'interrupted load was not retryable');
assert.equal(await audio.startMusic('title'), true, 'song did not recover after an interrupted load');

audio.stopMusic(true);
assert.equal(song.currentTime, 0);

console.log('Soundtrack state: continuous modes, mute, ducking, and visibility resume passed.');
