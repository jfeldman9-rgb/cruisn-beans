import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createCanvas } = require('@napi-rs/canvas');

function browserCanvas() {
  const canvas = createCanvas(1, 1);
  canvas.style = {};
  return canvas;
}

globalThis.document = {
  createElement: () => browserCanvas(),
  createElementNS: () => browserCanvas(),
};
globalThis.window = {};
globalThis.localStorage = { getItem: () => '1', setItem() {} };

const tex = await import('../js/tex.js');
const { Race } = await import('../js/game.js');
const { RACERS, RIVALS, STAGES } = await import('../js/data.js');

for (const racer of RACERS) {
  for (const view of ['rear', 'front']) {
    const texture = tex.namedCarTexture(racer.id, view);
    assert.ok(texture);
    assert.equal(texture.image.width, 160);
    assert.equal(texture.image.height, 112);
    assert.ok(texture.image.toBuffer('image/png').length > 1000);
  }
}

assert.equal(tex.alohaGateTexture().image.width, 192);
assert.equal(tex.route66GateTexture().image.height, 92);

for (const stage of STAGES) {
  const race = new Race({
    trackDef: { ...stage },
    racers: [...RACERS, ...RIVALS],
    playerIndex: 0,
    onEvent: () => {},
  });
  assert.equal(race.cars.length, 7);
  assert.ok(race.track.group.children.length > 30);
  race.dispose();
}

console.log('Canvas smoke: straight-on cars, landmark art, and all three stages rendered without errors.');
