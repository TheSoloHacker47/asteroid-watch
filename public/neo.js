// Pure helpers for turning NASA/JPL API rows into display-ready objects.

export const KM_PER_AU = 149_597_870.7;
export const KM_PER_LD = 384_400; // mean Earth–Moon distance ("lunar distance")
export const LD_PER_AU = KM_PER_AU / KM_PER_LD;

// Diameter estimate from absolute magnitude H. Asteroid brightness depends on
// albedo, which is usually unknown, so return a range: dark (0.05) to bright (0.25).
export function diameterRangeFromH(h) {
  if (!Number.isFinite(h)) return null;
  const d = (albedo) => (1329 / Math.sqrt(albedo)) * 10 ** (-h / 5) * 1000; // metres
  return { min: d(0.25), max: d(0.05) };
}

// JPL dates look like "2026-Oct-18 02:58" (TDB, treated as UTC here).
const MONTHS = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
export function parseJplDate(s) {
  const m = /^(\d{4})-(\w{3})-(\d{2}) (\d{2}):(\d{2})$/.exec(s ?? '');
  if (!m || !(m[2] in MONTHS)) return null;
  return new Date(Date.UTC(+m[1], MONTHS[m[2]], +m[3], +m[4], +m[5]));
}

// Turns a cad.api response ({fields, data}) into objects with derived units.
export function parseCloseApproaches(json) {
  const { fields = [], data = [] } = json ?? {};
  const idx = Object.fromEntries(fields.map((f, i) => [f, i]));
  return data.map((row) => {
    const get = (k) => row[idx[k]];
    const distAu = Number(get('dist'));
    const h = Number(get('h'));
    const measuredKm = get('diameter') == null ? NaN : Number(get('diameter'));
    const size = Number.isFinite(measuredKm)
      ? { min: measuredKm * 1000, max: measuredKm * 1000, measured: true }
      : { ...diameterRangeFromH(h), measured: false };
    return {
      designation: get('des'),
      name: (get('fullname') ?? get('des')).trim(),
      date: parseJplDate(get('cd')),
      distLd: distAu * LD_PER_AU,
      distKm: distAu * KM_PER_AU,
      speedKms: Number(get('v_rel')),
      h,
      size,
      sizeMid: Math.sqrt(size.min * size.max), // geometric mean, metres
    };
  }).filter((a) => a.date && Number.isFinite(a.distLd));
}

// Keeps the Sentry objects worth showing: real impact solutions, sorted by
// cumulative Palermo scale (higher = more concerning; below -2 is "no concern").
export function parseImpactRisk(json, limit = 10) {
  return (json?.data ?? [])
    .map((r) => ({
      designation: r.des,
      name: (r.fullname ?? r.des).trim(),
      diameterM: Number(r.diameter) * 1000,
      probability: Number(r.ip),
      palermo: Number(r.ps_cum),
      torino: Number(r.ts_max),
      years: r.range,
      impacts: Number(r.n_imp),
    }))
    .filter((r) => Number.isFinite(r.palermo))
    .sort((a, b) => b.palermo - a.palermo)
    .slice(0, limit);
}

// Something everyone has a feel for, to anchor an asteroid's size.
const COMPARISONS = [
  [3, 'a car'],
  [12, 'a bus'],
  [30, 'a blue whale'],
  [73, 'the Qutub Minar'],
  [110, 'a football field'],
  [330, 'the Eiffel Tower'],
  [830, 'the Burj Khalifa'],
  [Infinity, 'a small city'],
];
export function sizeComparison(metres) {
  if (!Number.isFinite(metres)) return 'unknown size';
  return COMPARISONS.find(([limit]) => metres <= limit)[1];
}

export function formatSize({ min, max, measured }) {
  const unit = (m) => (m >= 1000 ? 'km' : 'm');
  const num = (m) => (m >= 1000 ? (m / 1000).toFixed(1) : String(Math.round(m)));
  if (measured || Math.abs(max - min) < 1) return `${num(min)} ${unit(min)}`;
  if (unit(min) === unit(max)) return `${num(min)}–${num(max)} ${unit(max)}`;
  return `${num(min)} ${unit(min)}–${num(max)} ${unit(max)}`;
}

// 1 in N phrasing for tiny probabilities.
export function formatOdds(p) {
  if (!(p > 0)) return '—';
  const n = 1 / p;
  if (n < 10) return `${(p * 100).toFixed(0)}%`;
  return `1 in ${Math.round(n).toLocaleString('en-US')}`;
}

export function summarize(list) {
  if (!list.length) return null;
  const by = (key, dir = 1) => list.reduce((a, b) => (dir * (b[key] - a[key]) > 0 ? b : a));
  return {
    count: list.length,
    insideMoon: list.filter((a) => a.distLd < 1).length,
    closest: by('distLd', -1),
    largest: by('sizeMid'),
    fastest: by('speedKms'),
  };
}
