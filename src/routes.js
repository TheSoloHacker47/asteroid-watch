// The proxy's allow-list, shared by the Node server (local) and the Worker (deployed).

// Only these upstream endpoints can be reached through the proxy. Each builder
// validates its inputs and returns the upstream URL, or null to reject the request.
const SAFE = /^[\w.+:-]{1,20}$/;
const DESIGNATION = /^[\w ()/-]{1,40}$/;
const SPKID = /^\d{7,9}$/;
const JD = /^\d{7}(\.\d{1,8})?$/;

export const ROUTES = {
  '/api/close-approaches': (q) => {
    const url = new URL('https://ssd-api.jpl.nasa.gov/cad.api');
    for (const key of ['date-min', 'date-max', 'dist-max']) {
      if (SAFE.test(q.get(key) ?? '')) url.searchParams.set(key, q.get(key));
    }
    for (const [k, v] of Object.entries({ fullname: 'true', diameter: 'true', sort: 'date' })) url.searchParams.set(k, v);
    return url;
  },
  '/api/impact-risk': () => new URL('https://ssd-api.jpl.nasa.gov/sentry.api'),
  // Full-precision orbital elements for one object.
  '/api/orbit': (q) => {
    const des = q.get('des') ?? '';
    if (!DESIGNATION.test(des)) return null;
    const url = new URL('https://ssd-api.jpl.nasa.gov/sbdb.api');
    url.searchParams.set('sstr', des);
    url.searchParams.set('full-prec', 'true');
    return url;
  },
  // Earth-centred positions from Horizons, 3 days either side of a Julian date.
  // body is an SBDB spkid, or "moon".
  '/api/flyby': (q) => {
    const body = q.get('body') ?? '';
    const jd = q.get('jd') ?? '';
    if (!(body === 'moon' || SPKID.test(body)) || !JD.test(jd)) return null;
    const center = Math.round(Number(jd) * 24) / 24; // snap to the hour so the cache gets hits
    const url = new URL('https://ssd.jpl.nasa.gov/api/horizons.api');
    const params = {
      format: 'json',
      COMMAND: body === 'moon' ? "'301'" : `'DES=${body};'`,
      EPHEM_TYPE: 'VECTORS',
      CENTER: "'500@399'",
      START_TIME: `'JD${(center - 3).toFixed(5)}'`,
      STOP_TIME: `'JD${(center + 3).toFixed(5)}'`,
      STEP_SIZE: "'30 m'",
      VEC_TABLE: '1',
      REF_PLANE: 'ECLIPTIC',
      OUT_UNITS: 'AU-D',
      CSV_FORMAT: 'YES',
      OBJ_DATA: 'NO',
    };
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    return url;
  },
};
