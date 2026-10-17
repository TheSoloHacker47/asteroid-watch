// The bottom time scrubber. Time is the master control: dragging the playhead
// moves every body in the scene. Each close approach is a tick; taller is closer.
import { dateFromJd } from './orbit.js';

const el = (tag, attrs = {}, ...children) => {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else node.setAttribute(k, v);
  }
  node.append(...children);
  return node;
};

const dayFmt = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' });
const headFmt = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export function createTimeline(root, { onScrub, onPlayToggle, onSelect, onSpeed }) {
  const play = el('button', { class: 'tl-play', type: 'button', 'aria-label': 'Play' });
  const track = el('div', { class: 'tl-track', role: 'slider', tabindex: '0', 'aria-label': 'Time' });
  const days = el('div', { class: 'tl-days', 'aria-hidden': 'true' });
  const ticks = el('div', { class: 'tl-ticks' });
  const head = el('div', { class: 'tl-head', 'aria-hidden': 'true' }, el('span', { class: 'tl-head-label' }));
  track.append(days, ticks, head);
  const speed = el('select', { class: 'tl-speed', 'aria-label': 'Playback speed' });
  root.replaceChildren(play, track, speed);

  let st = { range: [0, 1], time: 0, events: [], selected: null, playing: false, step: 1 };

  const frac = (jd) => (jd - st.range[0]) / (st.range[1] - st.range[0]);
  const jdAt = (clientX) => {
    const r = track.getBoundingClientRect();
    const f = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    return st.range[0] + f * (st.range[1] - st.range[0]);
  };

  function drawHead() {
    const f = Math.min(1, Math.max(0, frac(st.time)));
    head.style.left = `${f * 100}%`;
    head.classList.toggle('flip', f > 0.82);
    head.classList.toggle('start', f < 0.12);
    head.firstChild.textContent = headFmt.format(dateFromJd(st.time));
    track.setAttribute('aria-valuetext', headFmt.format(dateFromJd(st.time)));
  }

  function drawDays() {
    const span = st.range[1] - st.range[0];
    const width = track.clientWidth || 600;
    const minGap = 80;
    const stepDays = span <= 8 ? 1 : [1, 2, 5, 7, 14, 30, 61].find((d) => (width * d) / span >= minGap) ?? 61;
    const nodes = [];
    if (span <= 8) {
      // flyby: one label per day at midnight UTC
      for (let jd = Math.ceil(st.range[0] - 0.5) + 0.5; jd <= st.range[1]; jd += stepDays) {
        nodes.push(el('span', { style: `left:${frac(jd) * 100}%` }, dayFmt.format(dateFromJd(jd))));
      }
    } else {
      for (let jd = st.range[0] + stepDays; jd < st.range[1] - stepDays * 0.4; jd += stepDays) {
        nodes.push(el('span', { style: `left:${frac(jd) * 100}%` }, dayFmt.format(dateFromJd(jd))));
      }
    }
    days.replaceChildren(...nodes);
  }

  function drawTicks() {
    ticks.replaceChildren(...st.events.map((e) => {
      const f = frac(e.jd);
      if (f < 0 || f > 1) return '';
      const b = el('button', {
        class: ['tl-tick', e.inside && 'inside', e.designation === st.selected && 'selected'].filter(Boolean).join(' '),
        type: 'button',
        style: `left:${f * 100}%; --h:${e.height}`,
        'aria-label': `${e.name}, ${e.when}, ${e.dist}${e.inside ? ', closer than the Moon' : ''}`,
        title: `${e.name} · ${e.dist}`,
      });
      b.addEventListener('click', (ev) => {
        ev.stopPropagation();
        onSelect(e.designation);
      });
      return b;
    }));
  }

  // ---------- scrubbing ----------
  let dragging = false;
  track.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.tl-tick')) return;
    dragging = true;
    track.setPointerCapture(e.pointerId);
    onScrub(jdAt(e.clientX));
  });
  track.addEventListener('pointermove', (e) => {
    if (dragging) onScrub(jdAt(e.clientX));
  });
  const stop = () => {
    dragging = false;
  };
  track.addEventListener('pointerup', stop);
  track.addEventListener('pointercancel', stop);
  track.addEventListener('keydown', (e) => {
    const big = e.shiftKey ? 7 : 1;
    const moves = {
      ArrowRight: st.step * big, ArrowLeft: -st.step * big,
      Home: st.range[0] - st.time, End: st.range[1] - st.time,
    };
    if (e.key in moves) {
      e.preventDefault();
      onScrub(Math.min(st.range[1], Math.max(st.range[0], st.time + moves[e.key])));
    } else if (e.key === ' ') {
      e.preventDefault();
      onPlayToggle();
    }
  });
  play.addEventListener('click', onPlayToggle);
  speed.addEventListener('change', () => onSpeed(Number(speed.value)));
  new ResizeObserver(drawDays).observe(track);

  return {
    // events: [{ designation, name, jd, height 0..1, inside, when, dist }]
    set({ range, events, selected, speeds, speedValue, step }) {
      if (range) st.range = range;
      if (events) st.events = events;
      if (selected !== undefined) st.selected = selected;
      if (step) st.step = step;
      if (speeds) {
        speed.replaceChildren(...speeds.map(([v, text]) => el('option', { value: String(v) }, text)));
      }
      if (speedValue != null) speed.value = String(speedValue);
      drawDays();
      drawTicks();
      drawHead();
    },
    setTime(jd) {
      st.time = jd;
      drawHead();
    },
    setPlaying(on) {
      st.playing = on;
      play.classList.toggle('playing', on);
      play.setAttribute('aria-label', on ? 'Pause' : 'Play');
    },
  };
}
