import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  diameterRangeFromH, parseJplDate, parseCloseApproaches, parseImpactRisk,
  sizeComparison, formatSize, formatOdds, summarize, LD_PER_AU,
} from '../public/neo.js';

// Trimmed real response from cad.api (2026-10-17).
const CAD = {
  fields: ['des', 'orbit_id', 'jd', 'cd', 'dist', 'dist_min', 'dist_max', 'v_rel', 'v_inf', 't_sigma_f', 'h', 'diameter', 'diameter_sigma', 'fullname'],
  data: [
    ['2026 TC94', '2', '2461331.62', '2026-Oct-18 02:58', '0.0168623227470099', '0', '0', '10.459083562786', '0', '00:01', '26.828', null, null, '       (2026 TC94)'],
    ['2026 TS', '12', '2461331.76', '2026-Oct-18 06:16', '0.00606226716608145', '0', '0', '10.331748552855', '0', '<00:01', '24.05', null, null, '       (2026 TS)'],
    ['99942', '1', '2462240.40', '2029-Apr-13 21:46', '0.000254', '0', '0', '7.42', '0', '<00:01', '19.09', '0.34', null, '  99942 Apophis (2004 MN4)'],
  ],
};

test('diameter range brackets the textbook size for H=22 (≈140 m)', () => {
  const r = diameterRangeFromH(22);
  assert.ok(r.min < 140 && r.max > 140, JSON.stringify(r));
  assert.equal(diameterRangeFromH(NaN), null);
});

test('parses JPL calendar dates as UTC', () => {
  assert.equal(parseJplDate('2026-Oct-18 02:58').toISOString(), '2026-10-18T02:58:00.000Z');
  assert.equal(parseJplDate('garbage'), null);
});

test('parses close approaches with derived units', () => {
  const list = parseCloseApproaches(CAD);
  assert.equal(list.length, 3);
  const [tc94, ts, apophis] = list;
  assert.equal(tc94.name, '(2026 TC94)');
  assert.ok(Math.abs(ts.distLd - 0.00606226716608145 * LD_PER_AU) < 1e-9);
  assert.ok(ts.distLd > 2.3 && ts.distLd < 2.4);
  assert.equal(apophis.size.measured, true);
  assert.equal(apophis.size.min, 340);
  assert.equal(tc94.size.measured, false);
  assert.ok(tc94.size.max > tc94.size.min);
});

test('summarize picks closest, largest, fastest', () => {
  const s = summarize(parseCloseApproaches(CAD));
  assert.equal(s.count, 3);
  assert.equal(s.insideMoon, 1);
  assert.equal(s.closest.designation, '99942');
  assert.equal(s.largest.designation, '99942');
  assert.equal(s.fastest.designation, '2026 TC94');
  assert.equal(summarize([]), null);
});

test('impact risk sorts by Palermo scale and drops bad rows', () => {
  const rows = parseImpactRisk({ data: [
    { des: 'a', fullname: '(a)', diameter: '0.01', ip: '1e-6', ps_cum: '-6', ts_max: '0', range: '2050-2060', n_imp: 1 },
    { des: 'b', fullname: '(b)', diameter: '0.3', ip: '1e-4', ps_cum: '-2.5', ts_max: '0', range: '2080', n_imp: 3 },
    { des: 'c', ps_cum: 'n/a' },
  ] });
  assert.deepEqual(rows.map((r) => r.designation), ['b', 'a']);
  assert.equal(rows[0].diameterM, 300);
});

test('human-friendly formatting', () => {
  assert.equal(sizeComparison(10), 'a bus');
  assert.equal(sizeComparison(5000), 'a small city');
  assert.equal(formatSize({ min: 340, max: 340, measured: true }), '340 m');
  assert.equal(formatSize({ min: 12.4, max: 27.9, measured: false }), '12–28 m');
  assert.equal(formatSize({ min: 1500, max: 1500, measured: true }), '1.5 km');
  assert.equal(formatOdds(1e-4), '1 in 10,000');
  assert.equal(formatOdds(0), '—');
});
