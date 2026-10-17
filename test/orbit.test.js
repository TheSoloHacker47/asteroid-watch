import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  solveKepler, positionAt, orbitPath, planetElements, parseSbdbElements,
  parseHorizonsVectors, distance, jdFromDate, dateFromJd,
} from '../public/orbit.js';

const earthAt = (jd) => positionAt(planetElements('Earth', jd), jd);

// Real SBDB full-precision response for 2025 UK9 (trimmed), fetched 2026-10-17.
const UK9 = {
  object: { orbit_class: { name: 'Apollo' }, pha: false },
  orbit: {
    epoch: '2461200.5',
    moid: '.000544',
    elements: [
      ['e', '.2629346979374466'], ['a', '1.000086078263508'], ['i', '2.257373474303622'],
      ['om', '38.17306949559641'], ['w', '102.9519668770199'], ['ma', '144.6469702035694'],
      ['n', '.9854804231954823'], ['per', '365.3040603614198'],
    ].map(([name, value]) => ({ name, value })),
  },
};

test('Kepler solver satisfies M = E - e sin E', () => {
  for (const e of [0, 0.2, 0.7, 0.95]) {
    for (const M of [0.1, 1, 3, 5.5]) {
      const E = solveKepler(M, e);
      assert.ok(Math.abs(E - e * Math.sin(E) - M) < 1e-10, `e=${e} M=${M}`);
    }
  }
});

test('Earth position on 2000-01-01 12:00 TT matches the known value', () => {
  const [x, y, z] = earthAt(2451545);
  assert.ok(Math.abs(x - -0.1771) < 0.001 && Math.abs(y - 0.9672) < 0.001 && Math.abs(z) < 1e-4, `${x}, ${y}, ${z}`);
});

test('orbit path is a closed loop between perihelion and aphelion', () => {
  const el = parseSbdbElements(UK9);
  const path = orbitPath(el, 720);
  const radii = path.map((p) => Math.hypot(...p));
  assert.ok(distance(path[0], path.at(-1)) < 1e-12);
  assert.ok(Math.abs(Math.min(...radii) - el.a * (1 - el.e)) < 1e-4);
  assert.ok(Math.abs(Math.max(...radii) - el.a * (1 + el.e)) < 1e-4);
});

test('two-body model reproduces 2025 UK9 passing inside the Moon’s distance', () => {
  const el = parseSbdbElements(UK9);
  const ca = jdFromDate(new Date('2026-10-31T08:05:00Z')); // JPL close-approach time
  let closest = Infinity;
  for (let d = -2; d <= 2; d += 0.01) closest = Math.min(closest, distance(positionAt(el, ca + d), earthAt(ca + d)));
  assert.ok(closest < 0.00257, `closest ${closest} au should be < 1 LD`); // JPL says 0.82 LD
});

test('SBDB parsing keeps metadata and rejects open orbits', () => {
  const el = parseSbdbElements(UK9);
  assert.equal(el.orbitClass, 'Apollo');
  assert.equal(el.epoch, 2461200.5);
  const hyperbolic = structuredClone(UK9);
  hyperbolic.orbit.elements[0].value = '1.2';
  assert.throws(() => parseSbdbElements(hyperbolic), /closed ellipse/);
  assert.throws(() => parseSbdbElements({ message: 'specified object was not found' }), /not found/);
});

test('Horizons CSV vectors parse', () => {
  const result = `header\n$$SOE\n2461344.500000000, A.D. 2026-Oct-31 00:00:00.0000, -1.2124E-03,  1.7151E-03, -4.9531E-04,\n2461344.750000000, A.D. 2026-Oct-31 06:00:00.0000, -1.9781E-03,  9.0168E-04, -3.2006E-04,\n$$EOE\nfooter`;
  const pts = parseHorizonsVectors({ result });
  assert.equal(pts.length, 2);
  assert.equal(pts[1].jd, 2461344.75);
  assert.deepEqual(pts[0].pos, [-1.2124e-3, 1.7151e-3, -4.9531e-4]);
  assert.throws(() => parseHorizonsVectors({ result: 'no table' }));
});

test('Julian date conversions round-trip', () => {
  assert.equal(jdFromDate(new Date('2000-01-01T12:00:00Z')), 2451545);
  assert.equal(dateFromJd(2451545).toISOString(), '2000-01-01T12:00:00.000Z');
});
