import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

const summaries = [];
for (let stage = 0; stage < 3; stage++) {
  const raw = execFileSync(process.execPath, ['tests/sim.mjs', String(stage)], {
    cwd: new URL('..', import.meta.url),
    encoding: 'utf8',
  });
  const result = JSON.parse(raw);
  assert.equal(result.state, 'over', `${result.stage} did not reach results`);
  assert.equal(result.checkpoints, 6, `${result.stage} missed a checkpoint`);
  assert.ok(result.rawFinishTime, `${result.stage} did not record a finish`);
  assert.equal(result.place, 1, `${result.stage} was not catchable after pileups`);
  assert.ok(result.leapfrogs >= 1, `${result.stage} never taught the wheelie leapfrog`);
  assert.ok(result.pileups >= 1, `${result.stage} never exercised a costly pileup`);
  summaries.push(`${result.stage} ${result.rawFinishTime.toFixed(1)}s, ${result.pileups} pileups, ${result.leapfrogs} leapfrogs`);
}

console.log(`Full tour smoke: 3/3 finished first — ${summaries.join(' | ')}`);
