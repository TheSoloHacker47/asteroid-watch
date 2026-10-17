// The orbit card: loads data for the selected asteroid and builds the 3D scenes.
import { createOrbitView } from './orbit-view.js';
import {
  positionAt, orbitPath, planetElements, PLANET_NAMES, parseSbdbElements,
  parseHorizonsVectors, distance, jdFromDate, dateFromJd,
} from './orbit.js';
import { LD_PER_AU, KM_PER_AU } from './neo.js';

const $ = (sel) => document.querySelector(sel);
const DAY = 1;
const SOLAR_SPAN = 180 * DAY; // slider covers ±180 days around the approach
const FLYBY_SPAN = 3 * DAY; // matches the ±3 days the server asks Horizons for

const dateFmt = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
const timeFmt = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const int = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

async function getJson(url) {
  const res = await fetch(url);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || body.message || `Request failed (${res.status})`);
  return body;
}

// Linear interpolation inside a Horizons track (points 30 minutes apart).
function trackAt(track, jd) {
  if (jd <= track[0].jd) return track[0].pos;
  for (let k = 1; k < track.length; k++) {
    if (jd <= track[k].jd) {
      const [a, b] = [track[k - 1], track[k]];
      const t = (jd - a.jd) / (b.jd - a.jd);
      return a.pos.map((v, i) => v + (b.pos[i] - v) * t);
    }
  }
  return track.at(-1).pos;
}

const toLd = (p) => p.map((v) => v * LD_PER_AU);
const earthAt = (jd) => positionAt(planetElements('Earth', jd), jd);

export function createOrbitPanel() {
  const view = createOrbitView($('#orbit-canvas'));
  const slider = $('#orbit-time');
  const playBtn = $('#orbit-play');
  const msg = $('#orbit-msg');
  const orbits = new Map(); // designation -> Promise<{ el, spkid }>
  const flybys = new Map(); // designation -> Promise<{ asteroid, moon }>

  const st = { asteroid: null, mode: 'solar', caJd: 0, offset: 0, data: null, playing: false, token: 0 };

  function showMessage(text) {
    msg.hidden = !text;
    msg.textContent = text ?? '';
  }

  function loadOrbit(des) {
    if (!orbits.has(des)) {
      const p = getJson(`/api/orbit?des=${encodeURIComponent(des)}`).then((json) => ({
        el: parseSbdbElements(json),
        spkid: json.object?.spkid,
      }));
      p.catch(() => orbits.delete(des));
      orbits.set(des, p);
    }
    return orbits.get(des);
  }

  function loadFlyby(des, spkid, jd) {
    if (!flybys.has(des)) {
      const q = (body) => getJson(`/api/flyby?body=${body}&jd=${jd.toFixed(5)}`).then(parseHorizonsVectors);
      const p = Promise.all([q(spkid), q('moon')]).then(([asteroid, moon]) => ({ asteroid, moon }));
      p.catch(() => flybys.delete(des));
      flybys.set(des, p);
    }
    return flybys.get(des);
  }

  // ---------- scenes ----------
  function solarScene(jd, el, name) {
    const aphelion = el.a * (1 + el.e);
    const planets = PLANET_NAMES.filter((n) => n !== 'Earth' && (n !== 'Jupiter' || aphelion > 3));
    const earthEl = planetElements('Earth', jd);
    const earth = positionAt(earthEl, jd);
    const ast = positionAt(el, jd);
    return {
      scene: {
        radius: Math.max(1.7, aphelion * 1.1),
        rings: [],
        paths: [
          ...planets.map((n) => ({ points: orbitPath(planetElements(n, jd), 180), color: '--planet', width: 1 })),
          { points: orbitPath(earthEl, 180), color: '--series-1', width: 1.5 },
          { points: orbitPath(el, 360), color: '--series-2', width: 2, depthFade: true },
        ],
        bodies: [
          { pos: [0, 0, 0], color: '--sun', r: 7, label: 'Sun' },
          ...planets.map((n) => {
            const e = planetElements(n, jd);
            return { pos: positionAt(e, jd), color: '--planet', r: 3.5, label: n };
          }),
          { pos: earth, color: '--series-1', r: 5, label: 'Earth', labelSide: 'left' },
          { pos: ast, color: '--series-2', r: 5, label: name, strongLabel: true, dropLine: true },
        ],
      },
      distAu: distance(ast, earth),
    };
  }

  function flybyScene(jd, data, name) {
    const ast = toLd(trackAt(data.asteroid, jd));
    const moon = toLd(trackAt(data.moon, jd));
    const minDist = Math.min(...data.asteroid.map((p) => Math.hypot(...p.pos))) * LD_PER_AU;
    const radius = Math.min(Math.max(2.5, minDist * 2.2), 30);
    const earthHelio = earthAt(jd);
    const len = Math.hypot(earthHelio[0], earthHelio[1]);
    const sunDir = [-earthHelio[0] / len, -earthHelio[1] / len, 0];
    return {
      scene: {
        radius,
        rings: [1],
        paths: [
          { points: data.moon.map((p) => toLd(p.pos)), color: '--moon', width: 1.5, dash: [3, 4] },
          { points: data.asteroid.map((p) => toLd(p.pos)), color: '--series-2', width: 2, depthFade: true },
        ],
        bodies: [
          { pos: [0, 0, 0], color: '--series-1', r: 6, label: 'Earth', labelSide: 'left' },
          { pos: moon, color: '--moon', r: 4, label: 'Moon' },
          { pos: ast, color: '--series-2', r: 5, label: name, strongLabel: true, dropLine: true },
        ],
        arrows: [{ from: sunDir.map((v) => v * radius * 0.78), to: sunDir.map((v) => v * radius * 0.95), label: 'Sun' }],
      },
      distAu: Math.hypot(...trackAt(data.asteroid, jd)),
      sunAngle: Math.atan2(sunDir[1], sunDir[0]),
    };
  }

  // ---------- render ----------
  function render({ resetCamera = false } = {}) {
    const a = st.asteroid;
    if (!a || !st.data) return;
    const jd = st.caJd + st.offset;
    let built;
    let yaw;
    if (st.mode === 'solar') {
      built = solarScene(jd, st.data.el, a.name);
      const e = earthAt(st.caJd);
      yaw = -Math.PI / 2 - Math.atan2(e[1], e[0]); // Earth at approach sits front and centre
    } else {
      if (!st.data.flyby) return;
      built = flybyScene(jd, st.data.flyby, a.name);
      yaw = Math.PI - built.sunAngle; // Sun off to the left
    }
    view.setScene(built.scene, { resetCamera, yaw });

    const ld = built.distAu * LD_PER_AU;
    const kmStr = `${int.format(Math.round((built.distAu * KM_PER_AU) / 1000) * 1000)} km`;
    $('#orbit-readout').replaceChildren(
      'Distance from Earth',
      document.createElement('br'),
      Object.assign(document.createElement('strong'), { textContent: `${ld < 10 ? ld.toFixed(2) : int.format(ld)} LD` }),
      ` · ${kmStr}`,
    );
    const when = dateFromJd(jd);
    $('#orbit-date').textContent = st.mode === 'solar' ? dateFmt.format(when) : timeFmt.format(when);
  }

  function renderLegend() {
    const items = st.mode === 'solar'
      ? [['--series-1', 'Earth'], ['--series-2', st.asteroid.name], ['--planet', 'Other planets'], ['--sun', 'Sun']]
      : [['--series-1', 'Earth'], ['--series-2', st.asteroid.name], ['--moon', 'Moon']];
    $('#orbit-legend').replaceChildren(...items.map(([color, label]) => {
      const span = document.createElement('span');
      span.style.setProperty('--chip', `var(${color})`);
      span.textContent = label;
      return span;
    }));
    $('#orbit-note').textContent = st.mode === 'solar'
      ? 'Drag to rotate, scroll or pinch to zoom. Faded parts of the orbit dip below the plane of Earth’s orbit. Positions use a two-body model from JPL’s orbital elements, so the Earth distance here is approximate.'
      : 'Drag to rotate, scroll or pinch to zoom. The dashed ring is the Moon’s average distance. Positions come from JPL Horizons, which includes Earth’s and the Moon’s pull on the asteroid.';
  }

  function configureSlider() {
    const span = st.mode === 'solar' ? SOLAR_SPAN : FLYBY_SPAN;
    slider.min = String(-span);
    slider.max = String(span);
    slider.step = st.mode === 'solar' ? '0.25' : String(1 / 48);
    st.offset = 0;
    slider.value = '0';
  }

  function syncModeButtons() {
    for (const b of document.querySelectorAll('[data-orbit-mode] button')) {
      b.setAttribute('aria-checked', String(b.dataset.value === st.mode));
    }
  }

  async function loadForMode() {
    const token = ++st.token;
    const a = st.asteroid;
    showMessage(st.mode === 'solar' ? 'Loading orbit…' : 'Loading flyby from JPL Horizons…');
    try {
      const { el, spkid } = await loadOrbit(a.designation);
      if (token !== st.token) return;
      st.data = { el, flyby: null };
      $('#orbit-meta').textContent = describe(a, el);
      if (st.mode === 'flyby') {
        if (!spkid) throw new Error('JPL has no ephemeris ID for this object');
        st.data.flyby = await loadFlyby(a.designation, spkid, st.caJd);
        if (token !== st.token) return;
      }
      showMessage(null);
      configureSlider();
      renderLegend();
      render({ resetCamera: true });
    } catch (err) {
      if (token !== st.token) return;
      view.clear();
      $('#orbit-readout').replaceChildren();
      showMessage(err.message);
    }
  }

  function describe(a, el) {
    const parts = [];
    if (el.orbitClass) parts.push(`${el.orbitClass}-class asteroid`);
    if (Number.isFinite(el.periodDays)) parts.push(`goes round the Sun every ${el.periodDays < 700 ? `${int.format(el.periodDays)} days` : `${(el.periodDays / 365.25).toFixed(1)} years`}`);
    parts.push(`orbit tilted ${el.i.toFixed(1)}° to Earth’s`);
    if (el.pha) parts.push('listed as potentially hazardous');
    return `${parts.join(', ')}. Closest to Earth on ${dateFmt.format(a.date)}.`.replace(/^./, (c) => c.toUpperCase());
  }

  // ---------- controls ----------
  slider.addEventListener('input', () => {
    st.offset = Number(slider.value);
    render();
  });

  let last = 0;
  function tick(now) {
    if (!st.playing) return;
    const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
    last = now;
    const span = Number(slider.max);
    const speed = st.mode === 'solar' ? 30 : 1; // days per second
    st.offset += dt * speed;
    if (st.offset > span) st.offset = -span;
    slider.value = String(st.offset);
    render();
    requestAnimationFrame(tick);
  }
  function setPlaying(on) {
    st.playing = on;
    playBtn.textContent = on ? '❚❚' : '▶';
    playBtn.setAttribute('aria-label', on ? 'Pause' : 'Play');
    if (on) {
      last = 0;
      requestAnimationFrame(tick);
    }
  }
  playBtn.addEventListener('click', () => setPlaying(!st.playing));

  for (const b of document.querySelectorAll('[data-orbit-mode] button')) {
    b.addEventListener('click', () => {
      if (st.mode === b.dataset.value) return;
      st.mode = b.dataset.value;
      syncModeButtons();
      if (st.asteroid) loadForMode();
    });
  }
  syncModeButtons();

  return {
    get selected() {
      return st.asteroid?.designation ?? null;
    },
    select(a) {
      if (st.asteroid?.designation === a.designation) return;
      setPlaying(false);
      st.asteroid = a;
      st.caJd = jdFromDate(a.date);
      st.data = null;
      $('#orbit-title').textContent = `Orbit of ${a.name}`;
      loadForMode();
    },
  };
}
