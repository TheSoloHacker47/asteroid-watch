// A small dependency-free 3D renderer for orbits: perspective projection onto a
// 2D canvas, drag to rotate, wheel or pinch to zoom.

const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

export function createOrbitView(canvas) {
  const ctx = canvas.getContext('2d');
  const cam = { yaw: 0, elev: 0.55, zoom: 1 };
  let scene = null;
  let frame = 0;

  // ---------- projection ----------
  function project([x, y, z], size) {
    const k = 1 / scene.radius;
    const [x0, y0, z0] = [x * k, y * k, z * k];
    const [cy, sy] = [Math.cos(cam.yaw), Math.sin(cam.yaw)];
    const x1 = x0 * cy - y0 * sy;
    const y1 = x0 * sy + y0 * cy;
    const [ce, se] = [Math.cos(cam.elev), Math.sin(cam.elev)];
    const up = z0 * ce + y1 * se;
    const depth = y1 * ce - z0 * se;
    const camDist = 4;
    const s = (cam.zoom * size.min * 0.42 * camDist) / (camDist + depth);
    return { x: size.w / 2 + x1 * s, y: size.h / 2 - up * s, depth };
  }

  // ---------- drawing ----------
  function draw() {
    frame = 0;
    if (!scene) return;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const size = { w, h, min: Math.min(w, h) };
    const P = (p) => project(p, size);
    ctx.font = '11px ui-sans-serif, system-ui, sans-serif';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Reference rings on the ecliptic plane
    ctx.strokeStyle = css('--grid');
    ctx.lineWidth = 1;
    for (const r of scene.rings) {
      const pts = Array.from({ length: 121 }, (_, k) => {
        const t = (k / 120) * 2 * Math.PI;
        return P([r * Math.cos(t), r * Math.sin(t), 0]);
      });
      strokePath(pts);
    }

    // Paths: above the ecliptic solid, below it faded
    for (const path of scene.paths) {
      ctx.strokeStyle = css(path.color);
      ctx.lineWidth = path.width ?? 1.5;
      ctx.setLineDash(path.dash ?? []);
      for (let k = 1; k < path.points.length; k++) {
        const [a, b] = [path.points[k - 1], path.points[k]];
        ctx.globalAlpha = path.depthFade && (a[2] + b[2]) / 2 < 0 ? 0.35 : 1;
        const [pa, pb] = [P(a), P(b)];
        ctx.beginPath();
        ctx.moveTo(pa.x, pa.y);
        ctx.lineTo(pb.x, pb.y);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.setLineDash([]);
    }

    // Bodies, far ones first; each gets a drop line to the ecliptic for depth
    const bodies = scene.bodies
      .map((b) => ({ ...b, p: P(b.pos), base: P([b.pos[0], b.pos[1], 0]) }))
      .sort((a, b) => b.p.depth - a.p.depth);
    for (const b of bodies) {
      if (b.dropLine && Math.abs(b.p.y - b.base.y) > 2) {
        ctx.strokeStyle = css(b.color);
        ctx.globalAlpha = 0.5;
        ctx.setLineDash([2, 3]);
        ctx.beginPath();
        ctx.moveTo(b.p.x, b.p.y);
        ctx.lineTo(b.base.x, b.base.y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
      }
      ctx.fillStyle = css(b.color);
      ctx.strokeStyle = css('--surface-1');
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(b.p.x, b.p.y, b.r, 0, 2 * Math.PI);
      ctx.fill();
      ctx.stroke();
      if (b.label) {
        ctx.fillStyle = css(b.strongLabel ? '--text-primary' : '--text-secondary');
        ctx.font = `${b.strongLabel ? 600 : 400} ${b.strongLabel ? 12 : 11}px ui-sans-serif, system-ui, sans-serif`;
        const left = b.labelSide === 'left';
        ctx.textAlign = left ? 'right' : 'left';
        ctx.fillText(b.label, b.p.x + (left ? -1 : 1) * (b.r + 4), left ? b.p.y + b.r + 10 : b.p.y - b.r - 2);
        ctx.textAlign = 'left';
      }
    }

    // Direction arrows (e.g. towards the Sun in the flyby view)
    for (const arrow of scene.arrows ?? []) {
      const from = P(arrow.from);
      const to = P(arrow.to);
      const ang = Math.atan2(to.y - from.y, to.x - from.x);
      ctx.strokeStyle = ctx.fillStyle = css('--text-muted');
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(to.x, to.y);
      ctx.lineTo(to.x - 8 * Math.cos(ang - 0.4), to.y - 8 * Math.sin(ang - 0.4));
      ctx.lineTo(to.x - 8 * Math.cos(ang + 0.4), to.y - 8 * Math.sin(ang + 0.4));
      ctx.fill();
      ctx.font = '11px ui-sans-serif, system-ui, sans-serif';
      ctx.textAlign = Math.cos(ang) < 0 ? 'right' : 'left';
      ctx.fillText(arrow.label, to.x + 8 * Math.cos(ang), to.y + 8 * Math.sin(ang) + 4);
      ctx.textAlign = 'left';
    }
  }

  function strokePath(pts) {
    ctx.beginPath();
    pts.forEach((p, k) => (k ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.stroke();
  }

  const redraw = () => {
    if (!frame) frame = requestAnimationFrame(draw);
  };

  // ---------- interaction ----------
  const pointers = new Map();
  let pinchStart = null;
  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinchStart = { dist: Math.hypot(a.x - b.x, a.y - b.y), zoom: cam.zoom };
    }
  });
  canvas.addEventListener('pointermove', (e) => {
    const prev = pointers.get(e.pointerId);
    if (!prev) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2 && pinchStart) {
      const [a, b] = [...pointers.values()];
      setZoom(pinchStart.zoom * (Math.hypot(a.x - b.x, a.y - b.y) / pinchStart.dist));
    } else if (pointers.size === 1) {
      cam.yaw += (e.clientX - prev.x) * 0.008;
      cam.elev = Math.min(Math.PI / 2, Math.max(-Math.PI / 2, cam.elev + (e.clientY - prev.y) * 0.008));
      redraw();
    }
  });
  const release = (e) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinchStart = null;
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    setZoom(cam.zoom * Math.exp(-e.deltaY * 0.0015));
  }, { passive: false });
  canvas.addEventListener('keydown', (e) => {
    const step = { ArrowLeft: [-0.1, 0], ArrowRight: [0.1, 0], ArrowUp: [0, -0.1], ArrowDown: [0, 0.1] }[e.key];
    if (step) {
      e.preventDefault();
      cam.yaw += step[0];
      cam.elev = Math.min(Math.PI / 2, Math.max(-Math.PI / 2, cam.elev + step[1]));
      redraw();
    } else if (e.key === '+' || e.key === '=') setZoom(cam.zoom * 1.2);
    else if (e.key === '-') setZoom(cam.zoom / 1.2);
  });

  function setZoom(z) {
    cam.zoom = Math.min(40, Math.max(0.3, z));
    redraw();
  }

  new ResizeObserver(redraw).observe(canvas);
  new MutationObserver(redraw).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', redraw);

  return {
    // scene: { radius, rings, paths: [{points, color, width?, dash?, depthFade?}],
    //          bodies: [{pos, color, r, label?, labelSide?, strongLabel?, dropLine?}], arrows? }
    setScene(next, { resetCamera = false, yaw } = {}) {
      scene = next;
      if (resetCamera) {
        cam.zoom = 1;
        cam.elev = 0.55;
        if (yaw != null) cam.yaw = yaw;
      }
      redraw();
    },
    clear() {
      scene = null;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    },
  };
}
