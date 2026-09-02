import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { access } from 'node:fs/promises';

import { RACERS, RIVALS, STAGES } from '../js/data.js';

const require = createRequire(import.meta.url);
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const localPath = (url) => new URL(`../${String(url).split('?')[0]}`, import.meta.url);

for (const stage of STAGES) {
  assert.ok(stage.panorama, `${stage.id} panorama missing`);
  const path = localPath(stage.panorama);
  await access(path);
  const image = await loadImage(path);
  assert.ok(image.width >= 1600 && image.height >= 800, `${stage.id} panorama is undersized`);
  if (stage.panoramaAspect) {
    assert.ok(Math.abs(image.width / image.height - stage.panoramaAspect) < 0.01,
      `${stage.id} panoramaAspect ${stage.panoramaAspect} does not match the art (${image.width}x${image.height})`);
  }
}

for (const racer of [...RACERS, ...RIVALS]) {
  assert.ok(racer.raceRearSprite, `${racer.id} premium race rear missing`);
  assert.ok(racer.raceRearAspect >= 0.6 && racer.raceRearAspect <= 0.85, `${racer.id} race aspect is implausible`);
  const path = localPath(racer.raceRearSprite);
  await access(path);
  const image = await loadImage(path);
  assert.ok(image.width >= 640 && image.height >= 400, `${racer.id} race art is undersized`);
  const canvas = createCanvas(image.width, image.height);
  const context = canvas.getContext('2d');
  context.drawImage(image, 0, 0);
  const corners = [
    context.getImageData(0, 0, 1, 1).data[3],
    context.getImageData(image.width - 1, 0, 1, 1).data[3],
    context.getImageData(0, image.height - 1, 1, 1).data[3],
    context.getImageData(image.width - 1, image.height - 1, 1, 1).data[3],
  ];
  assert.ok(corners.some((alpha) => alpha === 0), `${racer.id} race art has no transparent corner`);
}

for (const name of ['traffic-semi-front.webp', 'traffic-sedan-front.webp']) {
  const path = new URL(`../assets/img/premium/${name}`, import.meta.url);
  await access(path);
  const image = await loadImage(path);
  assert.equal(image.width, 640);
  assert.equal(image.height, 640);
}

console.log(`Visual assets: ${STAGES.length} panoramas, ${RACERS.length + RIVALS.length} premium racers, and 2 traffic sprites decoded.`);
