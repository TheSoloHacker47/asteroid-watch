import {
  parseCloseApproaches, parseImpactRisk, summarize, comparisonFor,
  sizeComparison, formatSize, formatOdds, KM_PER_AU, LD_PER_AU,
} from './neo.js';
import { parseSbdbElements, parseHorizonsVectors, jdFromDate } from './orbit.js';
import { createScene, webglAvailable } from './scene.js';
import { createTimeline } from './timeline.js';

const $ = (sel) => document.querySelector(sel);
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------- state ----------
const params = new URLSearchParams(location.search);
const state = {
  days: ['7', '30', '60', '365'].includes(params.get('days')) ? params.get('days') : '30',
  ld: ['1', '5', '10'].includes(params.get('ld')) ? params.get('ld') : '5',
  wanted: params.get('sel'), // designation from a shared link
  list: [],
  selected: null,
  time: jdFromDate(new Date()),
  playing: false,
  speed: 1, // days per second
  mode: 'solar',
  sort: { key: 'date', dir: 1 },
  orbits: new Map(), // designation -> Promise<{ el, spkid }>
  flybys: new Map(), // designation -> Promise<{ asteroid, moon }>
  sizes: null,
};

const SOLAR_SPEEDS = [[0.25, '6 h/s'], [1, '1 day/s'], [3, '3 days/s'], [7, '1 week/s']];
const FLYBY_SPEEDS = [[1 / 24, '1 h/s'], [4 / 24, '4 h/s'], [12 / 24, '12 h/s']];

// ---------- formatting ----------
const dateFmt = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const shortDate = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' });
const int = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const ldNum = (v) => (v < 0.1 ? v.toFixed(3) : v < 10 ? v.toFixed(2) : int.format(v));
const km = (v) => `${int.format(Math.round(v / 1000) * 1000)} km`;
const jplLink = (des) => `https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html#/?sstr=${encodeURIComponent(des)}`;
const windowText = () => (state.days === '365' ? 'this year' : `in ${state.days} days`);

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (v != null && v !== false) node.setAttribute(k, v);
  }
  node.append(...children.filter((c) => c != null && c !== false));
  return node;
}

async function getJson(url) {
  const res = await fetch(url);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || body.message || `Request failed (${res.status})`);
  return body;
}

function setStatus(text, isError = false) {
  const s = $('#status');
  s.textContent = text ?? '';
  s.classList.toggle('error', isError);
}

// The "closer than the Moon" pulse is an EffectCraft animation, played with lottie-web.
function lottiePulse(container) {
  if (container.dataset.anim) return; // already playing (or claimed by an earlier call)
  container.dataset.anim = '1';
  if (!window.lottie || reducedMotion) {
    container.classList.add('static');
    return;
  }
  window.lottie.loadAnimation({ container, renderer: 'svg', loop: true, autoplay: true, path: 'assets/alert-pulse.json' });
}

// ---------- scene + timeline ----------
let scene = null;
if (webglAvailable()) {
  scene = createScene($('#stage'), {
    onSelect: (des) => select(des),
    onHover: (des) => showTip(des),
  });
} else {
  document.body.classList.add('no-webgl');
}

let pointer = { x: 0, y: 0 };
addEventListener('pointermove', (e) => {
  pointer = { x: e.clientX, y: e.clientY };
  const tip = $('#tip');
  if (!tip.hidden) Object.assign(tip.style, { left: `${pointer.x}px`, top: `${pointer.y}px` });
});
function showTip(des) {
  const tip = $('#tip');
  const a = state.list.find((x) => x.designation === des);
  if (!a) {
    tip.hidden = true;
    return;
  }
  tip.replaceChildren(a.name, el('span', { class: 'micro' }, `${ldNum(a.distLd)} LD · ${shortDate.format(a.date)}`));
  Object.assign(tip.style, { left: `${pointer.x}px`, top: `${pointer.y}px` });
  tip.hidden = false;
}

const timeline = createTimeline($('#timeline'), {
  onScrub: (jd) => {
    setPlaying(false);
    setTime(jd);
  },
  onPlayToggle: () => setPlaying(!state.playing),
  onSelect: (des) => select(des),
  onSpeed: (v) => {
    state.speed = v;
  },
});

const selectedApproach = () => state.list.find((a) => a.designation === state.selected);

function range() {
  if (state.mode === 'flyby') {
    const ca = selectedApproach()?.jd ?? state.time;
    return [ca - 3, ca + 3];
  }
  const now = jdFromDate(new Date());
  return [now - 1, now + Number(state.days)];
}

function setTime(jd) {
  const [a, b] = range();
  state.time = Math.min(b, Math.max(a, jd));
  scene?.setTime(state.time);
  timeline.setTime(state.time);
  if (state.mode === 'flyby') updateLiveDistance();
}

let last = 0;
function setPlaying(on) {
  state.playing = on;
  timeline.setPlaying(on);
  if (on) {
    const [a, b] = range();
    if (state.time >= b - 1e-6) setTime(a);
    last = 0;
    requestAnimationFrame(tick);
  }
}
function tick(now) {
  if (!state.playing) return;
  const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
  last = now;
  const next = state.time + dt * state.speed;
  setTime(next);
  if (next >= range()[1]) {
    setPlaying(false);
    return;
  }
  requestAnimationFrame(tick);
}

function timelineEvents() {
  const lo = Math.log(0.05);
  const hi = Math.log(Number(state.ld));
  return state.list.map((a) => ({
    designation: a.designation,
    name: a.name,
    jd: a.jd,
    inside: a.distLd < 1,
    height: Math.min(1, Math.max(0.1, 1 - (Math.log(a.distLd) - lo) / (hi - lo))),
    when: dateFmt.format(a.date),
    dist: `${ldNum(a.distLd)} LD`,
  }));
}

function refreshTimeline() {
  const solar = state.mode === 'solar';
  const events = timelineEvents();
  timeline.set({
    range: range(),
    events: solar ? events : events.filter((e) => e.designation === state.selected),
    selected: state.selected,
    speeds: solar ? SOLAR_SPEEDS : FLYBY_SPEEDS,
    speedValue: state.speed,
    step: solar ? 1 : 1 / 24,
  });
  timeline.setTime(state.time);
}

// ---------- data ----------
function loadOrbit(des) {
  if (!state.orbits.has(des)) {
    const p = getJson(`/api/orbit?des=${encodeURIComponent(des)}`).then((json) => ({
      el: parseSbdbElements(json),
      spkid: json.object?.spkid,
    }));
    p.catch(() => state.orbits.delete(des));
    state.orbits.set(des, p);
  }
  return state.orbits.get(des);
}

// Fetches orbits a few at a time; each asteroid appears in the scene as its orbit arrives.
async function loadAllOrbits(list) {
  const queue = [...list].sort((a, b) => (b.designation === state.selected) - (a.designation === state.selected));
  let failed = 0;
  async function worker() {
    while (queue.length) {
      const a = queue.shift();
      try {
        const { el: elements } = await loadOrbit(a.designation);
        if (!state.list.includes(a)) continue;
        scene?.setElements(a.designation, elements);
      } catch {
        failed += 1;
      }
    }
  }
  await Promise.all(Array.from({ length: 6 }, worker));
  if (failed && state.list === list) setStatus(`${failed} orbit${failed === 1 ? '' : 's'} could not be loaded`, true);
}

async function loadApproaches() {
  setStatus('Loading…');
  try {
    const q = new URLSearchParams({ 'date-min': 'now', 'date-max': `+${state.days}`, 'dist-max': `${state.ld}LD` });
    state.list = parseCloseApproaches(await getJson(`/api/close-approaches?${q}`))
      .map((a) => ({ ...a, jd: jdFromDate(a.date) }));
    setStatus(state.list.length ? '' : 'No asteroids in this window. Try a wider distance or time range.');
  } catch (err) {
    state.list = [];
    setStatus(err.message, true);
  }
  scene?.setAsteroids(state.list);
  if (state.mode === 'flyby' && !selectedApproach()) exitFlyby();
  const keep = state.list.find((a) => a.designation === (state.wanted ?? state.selected));
  state.wanted = null;
  const pick = keep ?? summarize(state.list)?.closest ?? null;
  renderStats();
  if (pick) select(pick.designation);
  else deselect();
  $('#loader').classList.add('done');
  loadAllOrbits(state.list);
}

async function loadRisk() {
  const tbody = $('#risk-table tbody');
  try {
    const rows = parseImpactRisk(await getJson('/api/impact-risk'));
    tbody.replaceChildren(...rows.map((r) => el('tr', {},
      el('td', {}, el('a', { href: jplLink(r.designation), target: '_blank', rel: 'noopener' }, r.name)),
      el('td', { class: 'num' }, formatSize({ min: r.diameterM, max: r.diameterM, measured: true })),
      el('td', {}, r.years),
      el('td', { class: 'num' }, formatOdds(r.probability)),
      el('td', { class: 'num' }, r.palermo.toFixed(2)),
    )));
    const watched = rows.filter((r) => r.palermo >= -2).length;
    $('#risk-verdict').textContent = watched === 0
      ? 'Every object here is below −2 right now.'
      : `${watched} ${watched === 1 ? 'is' : 'are'} at or above −2, which means astronomers keep a close eye on ${watched === 1 ? 'it' : 'them'}.`;
  } catch (err) {
    tbody.replaceChildren(el('tr', {}, el('td', { colspan: 5 }, err.message)));
  }
}

// ---------- stats (Clay-style big numbers, no cards) ----------
function renderStats() {
  const s = summarize(state.list);
  const root = $('#stats');
  if (!s) {
    root.replaceChildren(el('div', { class: 'stat' },
      el('span', { class: 'micro' }, 'Passing by'), el('span', { class: 'num-l' }, '0'),
      el('span', { class: 'sub' }, `within ${state.ld} LD ${windowText()}`)));
    return;
  }
  const hero = el('button', {
    class: 'stat stat-hero', type: 'button',
    'aria-label': `Closest pass: ${s.closest.name}, ${ldNum(s.closest.distLd)} lunar distances. Show it.`,
  },
  el('span', { class: 'micro' }, 'Closest pass'),
  el('span', { class: 'num-xl' }, ldNum(s.closest.distLd), el('small', {}, 'LD')),
  el('span', { class: 'sub' }, `${s.closest.name} · ${shortDate.format(s.closest.date)}`));
  hero.addEventListener('click', () => select(s.closest.designation));
  const pulse = s.insideMoon ? el('span', { class: 'pulse', 'aria-hidden': 'true' }) : null;
  root.replaceChildren(hero, el('div', { class: 'stat-row' },
    el('div', { class: 'stat' },
      el('span', { class: 'micro' }, 'Passing by'),
      el('span', { class: 'num-l' }, String(s.count)),
      el('span', { class: 'sub' }, `within ${state.ld} LD ${windowText()}`)),
    el('div', { class: 'stat' },
      el('span', { class: 'micro' }, 'Closer than the Moon'),
      el('span', { class: 'with-pulse' }, el('span', { class: 'num-l' }, String(s.insideMoon)), pulse),
      el('span', { class: 'sub' }, s.insideMoon === 1 ? 'asteroid inside 1 LD' : 'asteroids inside 1 LD'))));
  if (pulse) lottiePulse(pulse);
}

// ---------- selection + detail panel ----------
// Tells the scene how much of the canvas the detail panel covers.
function syncInsets() {
  const panel = $('#detail');
  if (!scene) return;
  if (panel.hidden) return scene.setInsets({ right: 0, bottom: 0 });
  const r = panel.getBoundingClientRect();
  const phone = innerWidth <= 760;
  scene.setInsets(phone ? { right: 0, bottom: innerHeight - r.top } : { right: innerWidth - r.left, bottom: 0 });
}
new ResizeObserver(syncInsets).observe($('#detail'));
addEventListener('resize', syncInsets);

function select(des) {
  const a = state.list.find((x) => x.designation === des);
  if (!a) return;
  if (state.selected !== des && state.mode === 'flyby') exitFlyby();
  state.selected = des;
  scene?.setSelected(des);
  $('#detail').hidden = false;
  syncInsets();
  setPlaying(false);
  setTime(a.jd);
  renderDetail();
  renderTable();
  refreshTimeline();
  syncUrl();
  loadOrbit(des).then(({ el: elements }) => {
    if (state.selected !== des || state.mode !== 'solar') return;
    scene?.setElements(des, elements); // may not have reached the scene yet on first load
    scene?.focusSolar(des, a.jd);
  }).catch(() => {});
}

function deselect() {
  state.selected = null;
  scene?.setSelected(null);
  $('#detail').hidden = true;
  syncInsets();
  renderTable();
  refreshTimeline();
  syncUrl();
}

// The asteroid drawn to scale next to the familiar object closest in size.
function sizeFigure(a) {
  const cmp = comparisonFor(a.sizeMid);
  const sil = cmp?.key ? state.sizes?.[cmp.key] : null;
  const W = 300;
  const H = 96;
  const gap = 28;
  const D = a.sizeMid;
  const k = sil ? Math.min(H / Math.max(D, sil.heightM), (W - gap) / (D + sil.widthM)) : H / D;
  const d = Math.max(3, D * k);
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H + 18}`);
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `The asteroid drawn to scale next to ${cmp?.label ?? 'a small city'}`);
  const add = (tag, attrs, text) => {
    const n = document.createElementNS(ns, tag);
    for (const [key, v] of Object.entries(attrs)) n.setAttribute(key, v);
    if (text) n.textContent = text;
    svg.append(n);
  };
  add('line', { class: 'ground', x1: 0, x2: W, y1: H + 0.5, y2: H + 0.5 });
  add('image', { href: 'assets/asteroid-rock.svg', x: 0, y: H - d, width: d, height: d });
  add('text', { x: d < 40 ? 0 : d / 2, y: H + 14, 'text-anchor': d < 40 ? 'start' : 'middle' }, `≈ ${formatSize({ min: D, max: D, measured: true })}`);
  if (sil) {
    const w = sil.widthM * k;
    const h = sil.heightM * k;
    const x = d + gap;
    add('image', { href: sil.file, x, y: H - h, width: w, height: h, preserveAspectRatio: 'none' });
    add('text', { x: x + w / 2, y: H + 14, 'text-anchor': 'middle' }, cmp.label.replace(/^(a|the) /, '').toUpperCase());
  }
  $('#d-size').replaceChildren(svg, el('figcaption', {},
    el('strong', {}, formatSize(a.size)), ` across, about the size of ${cmp?.label ?? 'a small city'}.`,
    a.size.measured ? null : ' Estimated from its brightness.'));
}

async function renderDetail() {
  const a = selectedApproach();
  if (!a) return;
  $('#d-name').textContent = a.name;
  $('#d-jpl').href = jplLink(a.designation);
  $('#d-alert').hidden = a.distLd >= 1;
  if (a.distLd < 1) lottiePulse($('#d-alert .pulse'));
  if (state.mode === 'solar') {
    $('#d-dist-label').textContent = 'Closest approach';
    $('#d-dist').replaceChildren(ldNum(a.distLd), el('small', {}, 'LD'));
    $('#d-km').textContent = `${km(a.distKm)} from Earth`;
    $('#d-flyby').textContent = 'Watch the flyby';
  } else {
    $('#d-dist-label').textContent = 'Distance from Earth now';
    $('#d-flyby').textContent = 'Back to solar system';
    updateLiveDistance();
  }
  if (state.sizes) sizeFigure(a);
  const facts = [
    ['When', dateFmt.format(a.date)],
    ['Speed', `${a.speedKms.toFixed(1)} km/s`],
  ];
  $('#d-facts').replaceChildren(...facts.flatMap(([k, v]) => [el('dt', {}, k), el('dd', {}, v)]));
  try {
    const { el: orbit } = await loadOrbit(a.designation);
    if (state.selected !== a.designation) return;
    const years = orbit.periodDays / 365.25;
    facts.push(['Orbit', `${years < 2 ? `${int.format(orbit.periodDays)} days` : `${years.toFixed(1)} years`} round the Sun`]);
    facts.push(['Tilt', `${orbit.i.toFixed(1)}° to Earth’s orbit`]);
    $('#d-class').textContent = [orbit.orbitClass && `${orbit.orbitClass}-class near-Earth asteroid`, orbit.pha && 'potentially hazardous'].filter(Boolean).join(' · ');
    $('#d-facts').replaceChildren(...facts.flatMap(([k, v]) => [el('dt', {}, k), el('dd', {}, v)]));
  } catch {
    if (state.selected === a.designation) $('#d-class').textContent = 'Orbit details unavailable right now';
  }
}

// ---------- flyby ----------
let flyData = null;
function updateLiveDistance() {
  if (!flyData) return;
  const tr = flyData.asteroid;
  let p = tr.at(-1).pos;
  for (let i = 1; i < tr.length; i++) {
    if (state.time <= tr[i].jd) {
      const f = Math.max(0, (state.time - tr[i - 1].jd) / (tr[i].jd - tr[i - 1].jd));
      p = tr[i - 1].pos.map((v, j) => v + (tr[i].pos[j] - v) * f);
      break;
    }
  }
  const au = Math.hypot(...p);
  $('#d-dist').replaceChildren(ldNum(au * LD_PER_AU), el('small', {}, 'LD'));
  $('#d-km').textContent = `${km(au * KM_PER_AU)} from Earth`;
}

async function enterFlyby() {
  const a = selectedApproach();
  if (!a || !scene) return;
  const btn = $('#d-flyby');
  btn.disabled = true;
  btn.textContent = 'Loading flyby…';
  try {
    const { spkid } = await loadOrbit(a.designation);
    if (!spkid) throw new Error('JPL has no ephemeris for this object');
    if (!state.flybys.has(a.designation)) {
      const q = (body) => getJson(`/api/flyby?body=${body}&jd=${a.jd.toFixed(5)}`).then(parseHorizonsVectors);
      const p = Promise.all([q(spkid), q('moon')]).then(([asteroid, moon]) => ({ asteroid, moon }));
      p.catch(() => state.flybys.delete(a.designation));
      state.flybys.set(a.designation, p);
    }
    const data = await state.flybys.get(a.designation);
    if (state.selected !== a.designation) return;
    flyData = data;
    state.mode = 'flyby';
    document.body.classList.add('mode-flyby');
    state.speed = 4 / 24;
    scene.showFlyby({ ...data, name: a.name });
    refreshTimeline();
    setTime(reducedMotion ? a.jd : a.jd - 1.25);
    renderDetail();
    if (!reducedMotion) setPlaying(true);
  } catch (err) {
    setStatus(err.message, true);
    btn.textContent = 'Watch the flyby';
  } finally {
    btn.disabled = false;
  }
}

function exitFlyby() {
  if (state.mode !== 'flyby') return;
  setPlaying(false);
  state.mode = 'solar';
  document.body.classList.remove('mode-flyby');
  state.speed = state.days === '365' ? 7 : 1;
  flyData = null;
  scene?.showSolar();
  refreshTimeline();
  setTime(selectedApproach()?.jd ?? state.time);
  renderDetail();
}

$('#d-flyby').addEventListener('click', () => (state.mode === 'solar' ? enterFlyby() : exitFlyby()));
$('#d-close').addEventListener('click', () => {
  exitFlyby();
  deselect();
  scene?.overview();
});

// ---------- list sheet ----------
function renderTable() {
  const { key, dir } = state.sort;
  const rows = [...state.list].sort((a, b) => {
    const av = key === 'date' ? a.jd : a[key];
    const bv = key === 'date' ? b.jd : b[key];
    return (typeof av === 'string' ? av.localeCompare(bv) : av - bv) * dir;
  });
  for (const th of document.querySelectorAll('#approach-table th[data-sort]')) {
    th.setAttribute('aria-sort', th.dataset.sort === key ? (dir > 0 ? 'ascending' : 'descending') : 'none');
  }
  const tbody = $('#approach-table tbody');
  if (!rows.length) {
    tbody.replaceChildren(el('tr', {}, el('td', { colspan: 6 }, 'Nothing in this window.')));
    return;
  }
  tbody.replaceChildren(...rows.map((a) => el('tr', {
    class: a.designation === state.selected ? 'selected' : '', 'data-des': a.designation, tabindex: '0',
  },
  el('td', {}, a.name, a.distLd < 1 ? el('span', { class: 'flag' }, 'Inside Moon') : null),
  el('td', {}, dateFmt.format(a.date)),
  el('td', { class: 'num' }, `${ldNum(a.distLd)} LD`, el('br'), el('span', { class: 'muted' }, km(a.distKm))),
  el('td', { class: 'num' }, formatSize(a.size), a.size.measured ? null : el('span', { class: 'muted' }, ' est.')),
  el('td', {}, sizeComparison(a.sizeMid)),
  el('td', { class: 'num' }, `${a.speedKms.toFixed(1)} km/s`),
  )));
}
function pickRow(e) {
  const row = e.target.closest('tr[data-des]');
  if (!row) return;
  $('#sheet-list').close();
  select(row.dataset.des);
}
$('#approach-table tbody').addEventListener('click', pickRow);
$('#approach-table tbody').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') pickRow(e);
});
for (const th of document.querySelectorAll('#approach-table th[data-sort]')) {
  th.addEventListener('click', () => {
    const key = th.dataset.sort;
    state.sort = { key, dir: state.sort.key === key ? -state.sort.dir : 1 };
    renderTable();
  });
}

// ---------- sheets ----------
for (const b of document.querySelectorAll('[data-sheet]')) {
  b.addEventListener('click', () => $(`#sheet-${b.dataset.sheet}`).showModal());
}
for (const d of document.querySelectorAll('dialog.sheet')) {
  d.querySelector('[data-close]').addEventListener('click', () => d.close());
  d.addEventListener('click', (e) => {
    if (e.target === d) d.close(); // a click on the backdrop
  });
}

// ---------- filters + shareable URL ----------
function syncControls() {
  for (const seg of document.querySelectorAll('.pills[data-filter]')) {
    for (const b of seg.querySelectorAll('button')) {
      b.setAttribute('aria-checked', String(b.dataset.value === state[seg.dataset.filter]));
    }
  }
}
function syncUrl() {
  const q = new URLSearchParams({ days: state.days, ld: state.ld });
  if (state.selected) q.set('sel', state.selected);
  history.replaceState(null, '', `?${q}`);
}
for (const seg of document.querySelectorAll('.pills[data-filter]')) {
  seg.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || state[seg.dataset.filter] === b.dataset.value) return;
    state[seg.dataset.filter] = b.dataset.value;
    if (state.mode === 'solar') state.speed = state.days === '365' ? 7 : 1;
    syncControls();
    loadApproaches();
  });
}
addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !document.querySelector('dialog[open]') && state.mode === 'flyby') exitFlyby();
});

// ---------- start ----------
if (window.lottie && !reducedMotion) {
  window.lottie.loadAnimation({ container: $('#loader-anim'), renderer: 'svg', loop: true, autoplay: true, path: 'assets/loader.json' });
}
state.speed = state.days === '365' ? 7 : 1;
syncControls();
refreshTimeline();
setTime(state.time);
fetch('assets/sizes.json').then((r) => r.json()).then((s) => {
  state.sizes = s;
  if (state.selected) renderDetail();
}).catch(() => {});
loadApproaches();
loadRisk();
