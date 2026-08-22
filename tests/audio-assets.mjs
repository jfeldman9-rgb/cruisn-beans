import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { access, stat } from 'node:fs/promises';

const audioPath = new URL('../assets/audio/cruisn-the-world.mp3', import.meta.url);
await access(audioPath);
const info = await stat(audioPath);
assert.ok(info.size > 4_000_000 && info.size < 6_000_000, `unexpected soundtrack size ${info.size}`);

const probe = JSON.parse(execFileSync('ffprobe', [
  '-v', 'error',
  '-show_entries', 'format=duration:stream=codec_name,codec_type,sample_rate,channels',
  '-of', 'json',
  audioPath.pathname,
], { encoding: 'utf8' }));
const stream = probe.streams.find((entry) => entry.codec_type === 'audio');
assert.equal(probe.streams.some((entry) => entry.codec_type === 'video'), false);
assert.equal(stream?.codec_name, 'mp3');
assert.equal(Number(stream?.sample_rate), 48_000);
assert.equal(stream?.channels, 2);
assert.ok(Math.abs(Number(probe.format.duration) - 207.768) < 0.1);

console.log('Soundtrack asset: 3:27.77 stereo MP3 decoded with the expected duration.');
