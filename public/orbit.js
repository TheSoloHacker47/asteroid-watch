// Orbit math: Keplerian elements -> heliocentric ecliptic J2000 positions (au).

const DEG = Math.PI / 180;
export const JD_J2000 = 2451545.0;
export const GAUSS_DEG_PER_DAY = 0.9856076686; // mean motion at a = 1 au

export const jdFromDate = (date) => date.getTime() / 86_400_000 + 2440587.5;
export const dateFromJd = (jd) => new Date((jd - 2440587.5) * 86_400_000);

// Solves Kepler's equation M = E - e sin E (elliptical orbits) by Newton's method.
export function solveKepler(M, e) {
  let E = e < 0.8 ? M : Math.PI;
  for (let k = 0; k < 50; k++) {
    const dE = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    E -= dE;
    if (Math.abs(dE) < 1e-12) break;
  }
  return E;
}

// Rotates a point in the orbital plane into the ecliptic frame.
function toEcliptic(xp, yp, { i, om, w }) {
  const [ci, si] = [Math.cos(i * DEG), Math.sin(i * DEG)];
  const [cO, sO] = [Math.cos(om * DEG), Math.sin(om * DEG)];
  const [cw, sw] = [Math.cos(w * DEG), Math.sin(w * DEG)];
  return [
    (cO * cw - sO * sw * ci) * xp + (-cO * sw - sO * cw * ci) * yp,
    (sO * cw + cO * sw * ci) * xp + (-sO * sw + cO * cw * ci) * yp,
    sw * si * xp + cw * si * yp,
  ];
}

// el: { a, e, i, om, w, ma, epoch, n? } with angles in degrees and epoch in JD.
export function positionAt(el, jd) {
  const n = el.n ?? GAUSS_DEG_PER_DAY / el.a ** 1.5;
  const M = (((el.ma + n * (jd - el.epoch)) % 360) + 360) % 360;
  const E = solveKepler(M * DEG, el.e);
  const xp = el.a * (Math.cos(E) - el.e);
  const yp = el.a * Math.sqrt(1 - el.e * el.e) * Math.sin(E);
  return toEcliptic(xp, yp, el);
}

// Evenly spaced points (by eccentric anomaly) around the whole ellipse.
export function orbitPath(el, steps = 360) {
  const b = el.a * Math.sqrt(1 - el.e * el.e);
  return Array.from({ length: steps + 1 }, (_, k) => {
    const E = (k / steps) * 2 * Math.PI;
    return toEcliptic(el.a * (Math.cos(E) - el.e), b * Math.sin(E), el);
  });
}

// Planet mean elements and rates per Julian century (Standish, JPL; valid 1800–2050).
// [a, e, I, L, long. perihelion, long. node]
const PLANETS = {
  Mercury: [[0.38709927, 0.20563593, 7.00497902, 252.2503235, 77.45779628, 48.33076593],
    [0.00000037, 0.00001906, -0.00594749, 149472.67411175, 0.16047689, -0.12534081]],
  Venus: [[0.72333566, 0.00677672, 3.39467605, 181.9790995, 131.60246718, 76.67984255],
    [0.0000039, -0.00004107, -0.0007889, 58517.81538729, 0.00268329, -0.27769418]],
  Earth: [[1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0],
    [0.00000562, -0.00004392, -0.01294668, 35999.37244981, 0.32327364, 0]],
  Mars: [[1.52371034, 0.0933941, 1.84969142, -4.55343205, -23.94362959, 49.55953891],
    [0.00001847, 0.00007882, -0.00813131, 19140.30268499, 0.44441088, -0.29257343]],
  Jupiter: [[5.202887, 0.04838624, 1.30439695, 34.39644051, 14.72847983, 100.47390909],
    [-0.00011607, -0.00013253, -0.00183714, 3034.74612775, 0.21252668, 0.20469106]],
};
export const PLANET_NAMES = Object.keys(PLANETS);

// Planet elements for a given date, in the same shape as an asteroid's.
export function planetElements(name, jd) {
  const [base, rate] = PLANETS[name];
  const T = (jd - JD_J2000) / 36525;
  const [a, e, i, L, peri, om] = base.map((v, k) => v + rate[k] * T);
  return { a, e, i, om, w: peri - om, ma: L - peri, epoch: jd };
}

// Reads an SBDB API response (requested with full-prec=true).
export function parseSbdbElements(json) {
  const orbit = json?.orbit;
  if (!orbit?.elements) throw new Error(json?.message || 'No orbit found for this object');
  const v = Object.fromEntries(orbit.elements.map((x) => [x.name, Number(x.value)]));
  const el = { a: v.a, e: v.e, i: v.i, om: v.om, w: v.w, ma: v.ma, n: v.n, epoch: Number(orbit.epoch) };
  if (!(el.e < 1) || Object.values(el).some((x) => !Number.isFinite(x))) {
    throw new Error('This orbit is not a closed ellipse, so it can’t be drawn');
  }
  return {
    ...el,
    orbitClass: json.object?.orbit_class?.name ?? null,
    pha: Boolean(json.object?.pha),
    moidAu: Number(orbit.moid),
    periodDays: Number(v.per),
  };
}

// Reads a Horizons VECTORS response (CSV_FORMAT=YES) into [{ jd, pos: [x, y, z] }].
export function parseHorizonsVectors(json) {
  const text = json?.result ?? '';
  const start = text.indexOf('$$SOE');
  const end = text.indexOf('$$EOE');
  if (start < 0 || end < 0) throw new Error(json?.error || 'Horizons returned no positions');
  return text.slice(start + 5, end).trim().split('\n').map((line) => {
    const cols = line.split(',').map((s) => s.trim());
    return { jd: Number(cols[0]), pos: [Number(cols[2]), Number(cols[3]), Number(cols[4])] };
  }).filter((p) => p.pos.every(Number.isFinite));
}

export const distance = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
