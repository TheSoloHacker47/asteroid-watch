// The 3D scene: a live solar system (heliocentric, two-body orbits) and an
// Earth-centred flyby view (JPL Horizons positions). Three.js does the drawing;
// orbit maths lives in orbit.js.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { positionAt, orbitPath, planetElements } from './orbit.js';
import { LD_PER_AU } from './neo.js';

const AU = 10; // world units per au (solar view)
const LDU = 3; // world units per lunar distance (flyby view)
const EARTH_R_LD = 6371 / 384400;
const MOON_R_LD = 1737 / 384400;
const PLANETS = ['Mercury', 'Venus', 'Earth', 'Mars'];

const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
// Ecliptic (x, y, z) -> world (x, z, -y): the ecliptic is the horizontal plane.
const world = ([x, y, z], k) => new THREE.Vector3(x * k, z * k, -y * k);
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

export function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return Boolean(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

export function createScene(container, { onSelect, onHover }) {
  // ---------- renderer, camera, controls ----------
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.append(renderer.domElement);

  const labels = new CSS2DRenderer();
  labels.domElement.className = 'scene-labels';
  container.append(labels.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, 0.001, 6000);
  camera.position.set(0, 16, 24);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 0.05;
  controls.maxDistance = 400;
  controls.zoomSpeed = 0.8;

  const loader = new THREE.TextureLoader();
  const tex = (url) => {
    const t = loader.load(url);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  const dotTex = tex('assets/sprite-dot.png');
  const glowTex = tex('assets/sprite-sun-glow.png');

  const lineMaterials = new Set();
  function lineMaterial(color, width, opacity = 1) {
    const m = new LineMaterial({ color, linewidth: width, transparent: opacity < 1, opacity, depthWrite: false });
    m.resolution.set(container.clientWidth, container.clientHeight);
    lineMaterials.add(m);
    return m;
  }
  function line(points, material) {
    const g = new LineGeometry();
    g.setPositions(points.flatMap((p) => [p.x, p.y, p.z]));
    const l = new Line2(g, material);
    l.computeLineDistances();
    return l;
  }
  function sprite(map, color, size, { additive = false, opacity = 1 } = {}) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({
      map, color, transparent: true, opacity, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    }));
    s.scale.setScalar(size);
    return s;
  }
  function label(text, cls = '', side = 'right') {
    const el = document.createElement('div');
    el.className = `scene-label ${cls}`;
    el.textContent = text;
    const obj = new CSS2DObject(el);
    // Earth's label sits to the left so it never collides with an asteroid passing it;
    // 'below' hangs a label under its point.
    const centers = { right: [-0.12, 1.1], left: [1.15, -0.2], below: [0.5, -0.6] };
    obj.center.set(...centers[side]);
    return obj;
  }

  // ---------- starfield (shared by both views) ----------
  {
    const n = 4000;
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3().randomDirection().multiplyScalar(2500);
      pos.set([v.x, v.y, v.z], i * 3);
      const b = 0.25 + Math.random() ** 3 * 0.75;
      const warm = Math.random() < 0.15;
      col.set([b, b * (warm ? 0.9 : 0.96), b * (warm ? 0.8 : 1)], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    scene.add(new THREE.Points(g, new THREE.PointsMaterial({
      size: 2.2, sizeAttenuation: false, map: dotTex, vertexColors: true, transparent: true, depthWrite: false,
    })));
  }

  // ---------- solar view ----------
  const solar = new THREE.Group();
  scene.add(solar);
  const sun = new THREE.Mesh(new THREE.SphereGeometry(0.28, 32, 16), new THREE.MeshBasicMaterial({ color: '#ffe2a3' }));
  sun.add(sprite(glowTex, '#ffb84d', 5, { additive: true, opacity: 0.8 }));
  sun.add(label('Sun', 'muted'));
  solar.add(sun);

  const planets = new Map();
  for (const name of PLANETS) {
    const isEarth = name === 'Earth';
    const color = isEarth ? css('--earth') : css('--planet-line');
    const orbit = line(orbitPath(planetElements(name, 2451545), 256).map((p) => world(p, AU)),
      lineMaterial(color, isEarth ? 1.4 : 1, isEarth ? 0.55 : 0.5));
    const body = sprite(dotTex, isEarth ? css('--earth') : css('--planet-dot'), isEarth ? 0.55 : 0.32);
    body.add(label(name, isEarth ? 'earth' : 'muted', isEarth ? 'left' : 'right'));
    solar.add(orbit, body);
    planets.set(name, { orbit, body });
  }

  // asteroids: designation -> { el, orbit, body, label }
  const asteroids = new Map();
  let selected = null;

  function styleAsteroid(a) {
    const isSel = a.designation === selected;
    a.orbit.material = isSel ? selOrbitMat : baseOrbitMat;
    a.orbit.renderOrder = isSel ? 2 : 1;
    a.body.material.color.set(isSel ? css('--accent') : css('--asteroid'));
    a.body.scale.setScalar(isSel ? 0.5 : 0.26);
    a.label.visible = isSel || a.designation === hovered;
    a.label.element.classList.toggle('accent', isSel);
  }
  const baseOrbitMat = lineMaterial(css('--asteroid'), 1, 0.2);
  const selOrbitMat = lineMaterial(css('--accent'), 2, 1);

  // ---------- flyby view ----------
  const flyby = new THREE.Group();
  flyby.visible = false;
  scene.add(flyby);
  const sunLight = new THREE.DirectionalLight('#fff4e0', 2.6);
  flyby.add(sunLight, new THREE.AmbientLight('#2a3a63', 0.35));

  const earth = new THREE.Mesh(new THREE.SphereGeometry(EARTH_R_LD * LDU, 64, 32),
    new THREE.MeshStandardMaterial({ color: '#2f6fd6', roughness: 0.8, metalness: 0 }));
  const atmosphere = new THREE.Mesh(new THREE.SphereGeometry(EARTH_R_LD * LDU * 1.06, 64, 32), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.BackSide,
    uniforms: { glow: { value: new THREE.Color(css('--earth')) } },
    vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'uniform vec3 glow; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(1.0 - abs(dot(vN, vV)), 3.0); gl_FragColor = vec4(glow, f * 0.9); }',
  }));
  const earthMarker = sprite(dotTex, css('--earth'), 0.22, { additive: true });
  earthMarker.material.sizeAttenuation = false;
  earthMarker.scale.setScalar(0.022);
  earth.add(atmosphere, earthMarker, label('Earth', 'earth', 'left'));
  flyby.add(earth);

  const moon = new THREE.Mesh(new THREE.SphereGeometry(MOON_R_LD * LDU, 48, 24),
    new THREE.MeshStandardMaterial({ color: '#b9b4aa', roughness: 1 }));
  const moonMarker = sprite(dotTex, '#d8d3c8', 0.016);
  moonMarker.material.sizeAttenuation = false;
  moon.add(moonMarker, label('Moon', 'muted'));
  flyby.add(moon);

  const moonRing = line(Array.from({ length: 257 }, (_, k) => {
    const t = (k / 256) * Math.PI * 2;
    return new THREE.Vector3(Math.cos(t) * LDU, 0, Math.sin(t) * LDU);
  }), lineMaterial(css('--planet-line'), 1, 0.6));
  const moonRingLabel = label('Moon’s average distance', 'muted small', 'below');
  moonRingLabel.position.set(0, 0, LDU); // the near edge of the ring
  flyby.add(moonRing, moonRingLabel);

  const flyAst = sprite(dotTex, css('--accent'), 0.02);
  flyAst.material.sizeAttenuation = false;
  const flyAstLabel = label('', 'accent');
  flyAst.add(flyAstLabel);
  flyby.add(flyAst);
  let flyTrack = null;
  let closestMark = null;
  // Marks the direction of the Sun (it is far outside this view).
  const sunMarker = sprite(glowTex, '#ffb84d', 0.05, { additive: true, opacity: 0.9 });
  sunMarker.material.sizeAttenuation = false;
  sunMarker.add(label('Sunward', 'muted small'));
  flyby.add(sunMarker);
  let flyData = null;

  // ---------- camera flights ----------
  let tween = null;
  function flyTo(position, target, ms = 900) {
    if (reducedMotion() || ms === 0) {
      camera.position.copy(position);
      controls.target.copy(target);
      tween = null;
      return;
    }
    tween = { p0: camera.position.clone(), t0: controls.target.clone(), p1: position, t1: target, start: performance.now(), ms };
  }

  // ---------- state updates ----------
  let mode = 'solar';
  let time = 2451545;
  const cams = { solar: null, flyby: null };

  function updateSolar() {
    for (const [name, p] of planets) p.body.position.copy(world(positionAt(planetElements(name, time), time), AU));
    for (const a of asteroids.values()) {
      if (a.el) a.body.position.copy(world(positionAt(a.el, time), AU));
    }
  }

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

  function updateFlyby() {
    if (!flyData) return;
    const toLd = (p) => p.map((v) => v * LD_PER_AU);
    flyAst.position.copy(world(toLd(trackAt(flyData.asteroid, time)), LDU));
    moon.position.copy(world(toLd(trackAt(flyData.moon, time)), LDU));
    // Sun direction from Earth: opposite Earth's heliocentric position.
    const e = positionAt(planetElements('Earth', time), time);
    const dir = world(e, 1).normalize().negate();
    sunLight.position.copy(dir.clone().multiplyScalar(10));
    sunMarker.position.copy(dir.multiplyScalar(flyData.radius * 0.7));
  }

  function update() {
    if (mode === 'solar') updateSolar();
    else updateFlyby();
  }

  // ---------- hover and click (screen-space nearest, so small dots are easy to hit) ----------
  let hovered = null;
  const ndc = new THREE.Vector3();
  function pick(clientX, clientY) {
    if (mode !== 'solar') return null;
    const rect = renderer.domElement.getBoundingClientRect();
    let best = null;
    let bestD = 18;
    for (const a of asteroids.values()) {
      if (!a.el) continue;
      ndc.copy(a.body.position).project(camera);
      if (ndc.z > 1) continue;
      const x = rect.left + ((ndc.x + 1) / 2) * rect.width;
      const y = rect.top + ((1 - ndc.y) / 2) * rect.height;
      const d = Math.hypot(x - clientX, y - clientY);
      if (d < bestD) {
        bestD = d;
        best = a.designation;
      }
    }
    return best;
  }
  let down = null;
  renderer.domElement.addEventListener('pointerdown', (e) => {
    down = { x: e.clientX, y: e.clientY };
  });
  renderer.domElement.addEventListener('pointerup', (e) => {
    if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 5) {
      const hit = pick(e.clientX, e.clientY);
      if (hit) onSelect(hit);
    }
    down = null;
  });
  renderer.domElement.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse' || down) return;
    const hit = pick(e.clientX, e.clientY);
    if (hit !== hovered) {
      const prev = hovered;
      hovered = hit;
      for (const d of [prev, hit]) if (d && asteroids.has(d)) styleAsteroid(asteroids.get(d));
      renderer.domElement.style.cursor = hit ? 'pointer' : '';
      onHover?.(hit);
    }
  });

  // ---------- loop and resize ----------
  // Panels cover part of the canvas; shift the projection so the camera's target
  // sits in the middle of what's still visible.
  let insets = { right: 0, bottom: 0 };
  function applyViewOffset() {
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (insets.right || insets.bottom) camera.setViewOffset(w, h, insets.right / 2, insets.bottom / 2, w, h);
    else camera.clearViewOffset();
    camera.updateProjectionMatrix();
  }

  function resize() {
    const w = container.clientWidth;
    const h = container.clientHeight;
    renderer.setSize(w, h);
    labels.setSize(w, h);
    camera.aspect = w / h;
    applyViewOffset();
    for (const m of lineMaterials) m.resolution.set(w, h);
  }
  new ResizeObserver(resize).observe(container);
  resize();

  renderer.setAnimationLoop(() => {
    if (tween) {
      const t = Math.min(1, (performance.now() - tween.start) / tween.ms);
      const k = easeInOut(t);
      camera.position.lerpVectors(tween.p0, tween.p1, k);
      controls.target.lerpVectors(tween.t0, tween.t1, k);
      if (t === 1) tween = null;
    }
    controls.update();
    renderer.render(scene, camera);
    labels.render(scene, camera);
  });

  // ---------- public API ----------
  return {
    // list: [{ designation, name }]; drops asteroids no longer in the list.
    setAsteroids(list) {
      const keep = new Set(list.map((a) => a.designation));
      for (const [des, a] of asteroids) {
        if (!keep.has(des)) {
          solar.remove(a.orbit, a.body);
          a.orbit.geometry.dispose();
          a.body.material.dispose();
          asteroids.delete(des);
        }
      }
      for (const item of list) {
        if (asteroids.has(item.designation)) continue;
        const body = sprite(dotTex, css('--asteroid'), 0.26);
        const lab = label(item.name);
        lab.visible = false;
        body.add(lab);
        body.visible = false;
        const orbit = new Line2(new LineGeometry(), baseOrbitMat);
        orbit.visible = false;
        solar.add(orbit, body);
        asteroids.set(item.designation, { designation: item.designation, el: null, orbit, body, label: lab });
      }
    },
    setElements(designation, el) {
      const a = asteroids.get(designation);
      if (!a) return;
      a.el = el;
      a.orbit.geometry.setPositions(orbitPath(el, 256).flatMap((p) => {
        const v = world(p, AU);
        return [v.x, v.y, v.z];
      }));
      a.orbit.computeLineDistances();
      a.orbit.visible = a.body.visible = true;
      styleAsteroid(a);
      update();
    },
    setSelected(designation) {
      const prev = selected;
      selected = designation;
      for (const d of [prev, designation]) if (d && asteroids.has(d)) styleAsteroid(asteroids.get(d));
    },
    setTime(jd) {
      time = jd;
      update();
    },
    // Frames the selected asteroid's orbit, looking side-on at the Sun-Earth line so the
    // Sun and Earth (at the approach date) sit either side of the centre.
    focusSolar(designation, approachJd) {
      const a = asteroids.get(designation);
      if (!a?.el || mode !== 'solar') return;
      const aphelion = a.el.a * (1 + a.el.e);
      const earthPos = world(positionAt(planetElements('Earth', approachJd), approachJd), AU);
      const target = earthPos.clone().multiplyScalar(0.5);
      // A portrait screen sees less sideways, so stand further back.
      const dist = Math.max(aphelion, 1.4) * AU * 1.7 * Math.max(1, 1.05 / camera.aspect);
      const side = new THREE.Vector3().crossVectors(earthPos, new THREE.Vector3(0, 1, 0)).normalize();
      const pos = target.clone().add(side.multiplyScalar(dist * 0.75)).add(new THREE.Vector3(0, dist * 0.55, 0));
      flyTo(pos, target);
    },
    setInsets(next) {
      insets = next;
      applyViewOffset();
    },
    overview() {
      const k = Math.max(1, 0.8 / camera.aspect);
      flyTo(new THREE.Vector3(0, 17 * k, 25 * k), new THREE.Vector3(0, 0, 0));
    },
    // data: { name, asteroid: [{jd, pos}], moon: [{jd, pos}] } in au, geocentric ecliptic.
    showFlyby(data) {
      cams[mode] = { p: camera.position.clone(), t: controls.target.clone() };
      mode = 'flyby';
      solar.visible = false;
      flyby.visible = true;
      const pts = data.asteroid.map((p) => world(p.pos.map((v) => v * LD_PER_AU), LDU));
      if (flyTrack) {
        flyby.remove(flyTrack, closestMark);
        flyTrack.geometry.dispose();
      }
      flyTrack = line(pts, lineMaterial(css('--accent'), 2, 0.9));
      let minI = 0;
      pts.forEach((p, i) => {
        if (p.length() < pts[minI].length()) minI = i;
      });
      const minLd = pts[minI].length() / LDU;
      closestMark = label(`Closest · ${minLd.toFixed(2)} LD`, 'small', 'below');
      closestMark.position.copy(pts[minI]);
      flyby.add(flyTrack, closestMark);
      flyAstLabel.element.textContent = data.name;
      flyData = { ...data, radius: Math.min(Math.max(1.8, minLd * 2.4), 30) * LDU };
      update();
      const r = flyData.radius;
      camera.position.set(r * 0.4, r * 1.8, r * 1.6);
      controls.target.set(0, 0, 0);
      flyTo(new THREE.Vector3(r * 0.2, r * 1.15, r * 1.35), new THREE.Vector3(0, 0, 0), 1200);
    },
    showSolar() {
      if (mode === 'solar') return;
      mode = 'solar';
      flyby.visible = false;
      solar.visible = true;
      update();
      const c = cams.solar;
      if (c) {
        camera.position.copy(c.p);
        controls.target.copy(c.t);
      }
    },
    get mode() {
      return mode;
    },
  };
}
