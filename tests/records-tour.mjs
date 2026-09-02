import assert from 'node:assert/strict';
import {
  Records, RECORDS_KEY, TOP_N, sanitizeInitials, defaultInitials, formatTime,
} from '../js/records.js';
import {
  createTour, recordLeg, standings, playerStanding, advance, isFinalStage,
  currentStageId, pointsForPlace, TOUR_POINTS,
} from '../js/tour.js';

let passed = 0;
const check = (name, fn) => { fn(); passed++; console.log(`  ok  ${name}`); };

function fakeStorage(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    writes: 0,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem(k, v) { this.writes++; map.set(k, String(v)); },
    dump: () => Object.fromEntries(map),
  };
}

const racers = ['andy', 'adam', 'lance', 'elon', 'rival1', 'rival2', 'rival3']
  .map((id) => ({ id, name: id.toUpperCase() }));

check('initials sanitize to three uppercase alphanumerics', () => {
  assert.equal(sanitizeInitials('ace'), 'ACE');
  assert.equal(sanitizeInitials('a!b?c d'), 'ABC');
  assert.equal(sanitizeInitials('x'), 'XAA');
  assert.equal(sanitizeInitials(''), 'AAA');
  assert.equal(sanitizeInitials('<script>'), 'SCR');
  assert.equal(defaultInitials('ANDY'), 'AND');
  assert.equal(defaultInitials('TINA T.'), 'TIN');
});

check('stage board keeps the fastest three and reports ranks', () => {
  const r = new Records(fakeStorage());
  assert.equal(r.rankFor('desert', 150), 1);
  assert.equal(r.submit('desert', { time: 150, initials: 'ace', racerId: 'andy' }), 1);
  assert.equal(r.submit('desert', { time: 160, initials: 'bob' }), 2);
  assert.equal(r.submit('desert', { time: 140, initials: 'cat' }), 1);
  assert.deepEqual(r.list('desert').map((x) => x.initials), ['CAT', 'ACE', 'BOB']);
  assert.equal(r.rankFor('desert', 170), 0, 'slower than the whole board misses');
  assert.equal(r.submit('desert', { time: 170, initials: 'dud' }), 0);
  assert.equal(r.rankFor('desert', 155), 3);
  r.submit('desert', { time: 155, initials: 'eel' });
  assert.deepEqual(r.list('desert').map((x) => x.initials), ['CAT', 'ACE', 'EEL']);
  assert.equal(r.list('desert').length, TOP_N);
  assert.equal(r.best('desert').time, 140);
  assert.equal(r.best('hawaii'), null);
  assert.equal(r.rankFor('hawaii', 0), 0, 'non-positive times never qualify');
});

check('records round-trip through storage and survive corrupt data', () => {
  const storage = fakeStorage();
  const a = new Records(storage);
  a.submit('tequila', { time: 130.4, initials: 'ELO', racerId: 'elon' });
  assert.ok(storage.writes >= 1);
  const b = new Records(storage);
  assert.equal(b.best('tequila').initials, 'ELO');
  assert.equal(b.best('tequila').racerId, 'elon');
  const c = new Records(fakeStorage({ [RECORDS_KEY]: '{not json' }));
  assert.equal(c.best('tequila'), null);
  const d = new Records(fakeStorage({ [RECORDS_KEY]: JSON.stringify({ stages: 'nope' }) }));
  assert.deepEqual(d.list('desert'), []);
  const throwing = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  const e = new Records(throwing);
  assert.equal(e.submit('desert', { time: 100, initials: 'MEM' }), 1, 'memory fallback still ranks');
  assert.equal(e.save(), false);
});

check('tour board prefers points, then total time', () => {
  const r = new Records(fakeStorage());
  assert.equal(r.tourQualifies(0, 400), false);
  assert.ok(r.submitTour({ points: 24, time: 420, initials: 'AND' }));
  assert.equal(r.tourQualifies(24, 430), false, 'same points, slower');
  assert.equal(r.tourQualifies(24, 410), true, 'same points, faster');
  assert.equal(r.tourQualifies(30, 999), true, 'more points always beats');
  assert.equal(r.submitTour({ points: 20, time: 300, initials: 'LOW' }), false);
  assert.equal(r.tourBest().initials, 'AND');
});

check('formatTime pads tenths', () => {
  assert.equal(formatTime(150.4), '2:30.4');
  assert.equal(formatTime(61), '1:01.0');
  assert.equal(formatTime(0), '0:00.0');
});

check('tour scoring awards 10/8/6/5/4/3/2 and ranks by points, wins, best place', () => {
  assert.deepEqual(TOUR_POINTS, [10, 8, 6, 5, 4, 3, 2]);
  assert.equal(pointsForPlace(1), 10);
  assert.equal(pointsForPlace(7), 2);
  assert.equal(pointsForPlace(9), 1);
  const tour = createTour(['hawaii', 'desert', 'tequila']);
  assert.equal(currentStageId(tour), 'hawaii');
  const leg = (order) => order.map((i) => ({ racer: racers[i], isPlayer: i === 0, finished: true, time: 100 }));
  recordLeg(tour, leg([1, 0, 2, 3, 4, 5, 6]), 140);    // player 2nd
  assert.equal(playerStanding(tour).points, 8);
  assert.equal(playerStanding(tour).place, 2);
  assert.ok(advance(tour));
  assert.equal(currentStageId(tour), 'desert');
  recordLeg(tour, leg([0, 2, 1, 3, 4, 5, 6]), 150);    // player 1st, adam 3rd
  assert.equal(playerStanding(tour).points, 18);
  assert.equal(playerStanding(tour).place, 1);
  assert.deepEqual(standings(tour).slice(0, 3).map((row) => [row.racer.id, row.points]),
    [['andy', 18], ['adam', 16], ['lance', 14]]);
  assert.ok(advance(tour));
  assert.ok(isFinalStage(tour));
  recordLeg(tour, leg([2, 0, 1, 3, 4, 5, 6]), 130);    // player 2nd behind lance
  const table = standings(tour);
  assert.deepEqual(table.slice(0, 3).map((row) => [row.racer.id, row.points]),
    [['andy', 26], ['lance', 24], ['adam', 22]]);
  assert.equal(table[0].wins, 1);
  assert.equal(playerStanding(tour).place, 1);
  assert.equal(tour.playerTime, 420);
  assert.equal(tour.legs.length, 3);
  assert.equal(advance(tour), false);
  assert.equal(tour.over, true);
});

console.log(`Records + World Tour: ${passed}/${passed} checks passed.`);
