#!/usr/bin/env python3
"""Draws the site's vector assets with VectorCraft's headless CLI.

Each asset is a list of VectorCraft commands. The script saves an editable
.vectorcraft source to design/vector/ and exports the web files to public/assets/.

    VECTORCRAFT_CLI=/path/to/vectorcraft-cli python3 tools/build_vector_assets.py

Silhouettes are drawn at a fixed scale in metres (see SILHOUETTES) so the page
can draw them next to an asteroid at true relative size.
"""
import json
import math
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CLI = os.environ.get('VECTORCRAFT_CLI', str(Path.home() / 'vectorcraft-cli'))
SRC = ROOT / 'design' / 'vector'
OUT = ROOT / 'public' / 'assets'

INK = '#c9d2e6'      # --asteroid / silhouette ink
ACCENT = '#ffb02e'   # --accent
EARTH = '#4ea1ff'    # --earth
SPACE = '#03060f'    # --space-0


def run(name, commands, exports):
    args = [CLI, 'run']
    for cid, params in commands:
        args += ['--cmd', cid, '--params', json.dumps(params)]
    for ext in exports:
        args += ['--export', str(OUT / f'{name}.{ext}')]
    args += ['--export', str(SRC / f'{name}.vectorcraft')]
    res = subprocess.run(args, capture_output=True, text=True)
    steps = [json.loads(line) for line in res.stdout.splitlines() if line.startswith('{')]
    errors = [s for s in steps if 'error' in s]
    if res.returncode or errors:
        sys.exit(f'{name}: failed\n{res.stdout}\n{res.stderr}')
    warnings = [w for s in steps if s.get('step') == 'export' for w in s['result'].get('warnings', [])]
    print(f'  {name}: ok' + (f' (warnings: {warnings})' if warnings else ''))


def new_doc(w, h):
    return ('file.new', {'width': w, 'height': h, 'units': 'Pixels', 'backgroundContents': 'transparent'})


def fill(color):
    return [('paint.setFill', {'color': color}), ('paint.setStroke', {'none': True})]


def stroke(color, weight, dash=None):
    s = {'weight': weight, 'cap': 'round', 'join': 'round'}
    if dash:
        s['dash'] = dash
    return [('paint.setFill', {'none': True}), ('paint.setStroke', {'color': color}), ('stroke.set', s)]


def poly(points):
    return 'M' + ' L'.join(f'{x:.2f},{y:.2f}' for x, y in points) + ' Z'


def mirror(right, cx):
    """Right half outline (top to bottom) -> closed symmetric outline."""
    left = [(2 * cx - x, y) for x, y in reversed(right)]
    return right + left


# ---------- silhouettes (1 unit = 1/SCALE metre, y down, ground at the bottom) ----------

SCALE = 4  # px per metre in the source art; the page rescales them


def car():
    s = SCALE
    body = ('M0,{a} L0,{b} Q{q1},{q2} {c},{d} L{e},{f} L{g},{h} Q{i},{j} {k},{j} L{l},{j} Q{m},{n} {o},{p} '
            'L{r},{t} L{u},{v} Q{w},{x} {w},{y} L{w},{a} Z').format(
        a=1.15 * s, b=0.7 * s, q1=0.1 * s, q2=0.55 * s, c=0.5 * s, d=0.5 * s, e=1.1 * s, f=0.46 * s,
        g=1.5 * s, h=0.08 * s, i=1.6 * s, j=0.02 * s, k=1.8 * s, l=2.9 * s, m=3.1 * s, n=0.03 * s,
        o=3.3 * s, p=0.15 * s, r=3.8 * s, t=0.48 * s, u=4.3 * s, v=0.56 * s, w=4.5 * s, x=0.62 * s, y=0.8 * s)
    r = 0.3 * s
    return 4.5, 1.45, [
        ('path.create', {'d': body}),
        ('shape.ellipse', {'x': 0.95 * s - r, 'y': 1.15 * s - r, 'width': 2 * r, 'height': 2 * r}),
        ('shape.ellipse', {'x': 3.55 * s - r, 'y': 1.15 * s - r, 'width': 2 * r, 'height': 2 * r}),
        ('select.all', {}), ('object.pathfinder.unite', {}),
    ]


def person():
    s = SCALE * 10  # small object: draw at 40 px/m for clean curves
    head = 0.12 * s
    body = poly([(0.16 * s, 0.3 * s), (0.34 * s, 0.3 * s), (0.4 * s, 0.95 * s), (0.33 * s, 0.97 * s),
                 (0.3 * s, 0.6 * s), (0.29 * s, 1.8 * s), (0.21 * s, 1.8 * s), (0.25 * s, 1.15 * s),
                 (0.21 * s, 1.15 * s), (0.2 * s, 1.8 * s), (0.12 * s, 1.8 * s), (0.11 * s, 0.6 * s),
                 (0.08 * s, 0.97 * s), (0.01 * s, 0.95 * s), (0.07 * s, 0.3 * s)])
    return 0.42, 1.8, [
        ('path.create', {'d': body}),
        ('shape.ellipse', {'x': 0.25 * s - head, 'y': 0.03 * s, 'width': 2 * head, 'height': 2 * head}),
        ('select.all', {}), ('object.pathfinder.unite', {}),
    ], 10


def bus():
    s = SCALE
    body = (f'M0.4,0 L{11.6*s},0 Q{12*s},0 {12*s},{0.4*s} L{12*s},{2.8*s} L0,{2.8*s} L0,{0.4*s} Q0,0 0.4,0 Z')
    r = 0.48 * s
    cmds = [('path.create', {'d': body})]
    for cx in (2.3, 10.2):
        cmds.append(('shape.ellipse', {'x': cx * s - r, 'y': 2.75 * s - r, 'width': 2 * r, 'height': 2 * r}))
    cmds += [('select.all', {}), ('object.pathfinder.unite', {})]
    # window band, cut out
    cmds += [('shape.rectangle', {'x': 0.5 * s, 'y': 0.45 * s, 'width': 11 * s, 'height': 0.95 * s, 'radius': 0.15 * s}),
             ('select.all', {}), ('object.pathfinder.minusFront', {})]
    return 12, 3.23, cmds


def whale():
    s = SCALE  # 25 m long
    k = 25 / 100
    def p(x, y):
        return f'{x*k*s:.2f},{y*k*s:.2f}'
    d = (f'M{p(0,9)} C{p(4,4)} {p(14,2)} {p(30,2)} C{p(55,2)} {p(75,5)} {p(88,9)} '
         f'L{p(93,6)} Q{p(97,2)} {p(100,1)} Q{p(98,7)} {p(96,10)} Q{p(99,14)} {p(100,18)} '
         f'Q{p(96,16)} {p(93,13)} L{p(88,12)} C{p(78,16)} {p(60,19)} {p(40,19)} C{p(22,19)} {p(8,16)} {p(3,13)} '
         f'Q{p(0,11)} {p(0,9)} Z')
    flipper = f'M{p(26,15)} Q{p(30,23)} {p(37,25)} Q{p(34,19)} {p(33,15)} Z'
    return 25, 25 * 0.25, [('path.create', {'d': d}), ('path.create', {'d': flipper}),
                           ('select.all', {}), ('object.pathfinder.unite', {})]


def qutub():
    s = SCALE
    H, base, top = 72.5, 14.3, 2.7
    cx = base / 2 + 1.2
    def hw(h):
        return (base - (base - top) * h / H) / 2
    right = [(cx + 0.9, 0), (cx + 0.9, 1.2), (cx + 1.5, 1.6), (cx + 1.5, 2.6)]  # small cupola
    balconies = [67, 60, 51, 29]
    h = 69.5
    right.append((cx + hw(h), H - h))
    for b in balconies:
        right += [(cx + hw(b), H - b - 0.4), (cx + hw(b) + 1.1, H - b - 0.4), (cx + hw(b) + 1.1, H - b + 0.6),
                  (cx + hw(b), H - b + 0.6)]
    right += [(cx + hw(0), H)]
    pts = [(x * s, y * s) for x, y in mirror(right, cx)]
    return base + 2.4, H, [('path.create', {'d': poly(pts)})]


def eiffel():
    s = SCALE / 4  # 330 m: draw at 1 px/m
    W, H = 125, 330
    cx = W / 2
    right = [(cx + 0.6, 0), (cx + 0.6, 6), (cx + 2, 8), (cx + 2.5, 55), (cx + 5, 57), (cx + 5, 60),
             (cx + 9, 175), (cx + 13, 190), (cx + 16, 196), (cx + 16, 200), (cx + 22, 245),
             (cx + 31, 270), (cx + 34, 273), (cx + 34, 277), (cx + 45, 305), (W, H), (cx + 33, H),
             (cx + 25, 312), (cx + 15, 296)]
    # the right leg's inner edge rises into the arch; its apex sits on the centre line
    outer = right + [(cx, 290)] + [(2 * cx - x, y) for x, y in reversed(right)]
    pts = [(x * s, y * s) for x, y in outer]
    return W, H, [('path.create', {'d': poly(pts)})]


def burj():
    s = SCALE / 8  # 828 m: draw at 0.5 px/m
    H = 828
    cx = 45
    steps = [(0.6, 0), (0.6, 70), (2, 150), (4, 240), (6, 300), (9, 380), (13, 450), (17, 520),
             (21, 585), (25, 640), (29, 700), (33, 760), (37, 828)]
    right = []
    for i, (w, depth) in enumerate(steps):
        y = depth
        right.append((cx + w, y))
        if i + 1 < len(steps):
            right.append((cx + w, steps[i + 1][1]))
    pts = [(x * s, y * s) for x, y in mirror(right, cx)]
    return 2 * cx, H, [('path.create', {'d': poly(pts)})]


def field():
    s = SCALE
    L = 105
    return L, 2.44, [
        ('shape.rectangle', {'x': 0, 'y': 2.2 * s, 'width': L * s, 'height': 0.24 * s}),
        ('shape.rectangle', {'x': 0, 'y': 0, 'width': 0.15 * s, 'height': 2.44 * s}),
        ('shape.rectangle', {'x': (L - 0.15) * s, 'y': 0, 'width': 0.15 * s, 'height': 2.44 * s}),
        ('select.all', {}), ('object.pathfinder.unite', {}),
    ]


SILHOUETTES = {
    'person': person, 'car': car, 'bus': bus, 'blue-whale': whale, 'qutub-minar': qutub,
    'football-field': field, 'eiffel-tower': eiffel, 'burj-khalifa': burj,
}


def build_silhouettes():
    manifest = {}
    for name, fn in SILHOUETTES.items():
        res = fn()
        w, h, cmds = res[0], res[1], res[2]
        px_per_m = SCALE * (res[3] if len(res) > 3 else 1)
        if name == 'eiffel-tower':
            px_per_m = SCALE / 4
        if name == 'burj-khalifa':
            px_per_m = SCALE / 8
        W, H = math.ceil(w * px_per_m), math.ceil(h * px_per_m)
        run(f'size-{name}', [new_doc(W, H), *cmds, ('select.all', {}), *fill(INK)], ['svg'])
        manifest[name] = {'widthM': round(w, 2), 'heightM': round(h, 2), 'file': f'assets/size-{name}.svg'}
    (OUT / 'sizes.json').write_text(json.dumps(manifest, indent=2) + '\n')


# ---------- the asteroid rock: a lumpy outline with craters ----------

def rock_outline(n=18, seed=7, r=48, cx=50, cy=50):
    import random
    rnd = random.Random(seed)
    pts = []
    for i in range(n):
        a = i / n * 2 * math.pi
        rr = r * (0.84 + 0.16 * rnd.random())
        pts.append((cx + rr * math.cos(a), cy + rr * math.sin(a) * 0.9))
    # smooth closed curve through the points (Catmull-Rom to cubic Bezier)
    d = f'M{pts[0][0]:.2f},{pts[0][1]:.2f}'
    for i in range(n):
        p0, p1, p2, p3 = pts[i - 1], pts[i], pts[(i + 1) % n], pts[(i + 2) % n]
        c1 = (p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6)
        c2 = (p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6)
        d += f' C{c1[0]:.2f},{c1[1]:.2f} {c2[0]:.2f},{c2[1]:.2f} {p2[0]:.2f},{p2[1]:.2f}'
    return d + ' Z'


def build_rock():
    craters = [(36, 38, 9), (62, 58, 12), (58, 30, 5), (34, 64, 6)]
    cmds = [new_doc(100, 100), ('path.create', {'d': rock_outline()})]
    cmds += [('paint.setFill', {'gradient': {'kind': 'radial', 'stops': [
        {'offset': 0, 'color': '#f6ead2'}, {'offset': 1, 'color': '#8a7a62'}]}}), ('paint.setStroke', {'none': True})]
    for x, y, r in craters:
        cmds += [('shape.ellipse', {'x': x - r, 'y': y - r * 0.85, 'width': 2 * r, 'height': 1.7 * r}),
                 *fill('#5f5444'), ('transparency.set', {'opacity': 45})]
    run('asteroid-rock', cmds, ['svg', 'png'])


# ---------- logo mark ----------

def build_logo():
    s = 64
    cmds = [new_doc(s, s),
            ('shape.ellipse', {'x': 4, 'y': 20, 'width': 56, 'height': 24, 'rotation': -24}), *stroke(INK, 2.5),
            ('shape.ellipse', {'x': 24, 'y': 24, 'width': 16, 'height': 16}), *fill(EARTH),
            ('path.create', {'d': 'M51.5,12.2 C54.2,10.9 57.6,12.1 58,15.2 C58.6,18 56,20.3 53.3,19.7 C50.6,19.6 49.3,17 49.8,14.9 C50,13.7 50.6,12.7 51.5,12.2 Z'}),
            *fill(ACCENT)]
    run('logo-mark', cmds, ['svg', 'png'])


# ---------- glow sprites for the 3D scene (white, tinted in the shader) ----------

def glow(name, size, stops):
    cmds = [new_doc(size, size), ('shape.ellipse', {'x': 0, 'y': 0, 'width': size, 'height': size}),
            ('paint.setFill', {'gradient': {'kind': 'radial', 'stops': stops}}), ('paint.setStroke', {'none': True})]
    run(name, cmds, ['png'])


def build_sprites():
    glow('sprite-sun-glow', 256, [{'offset': 0, 'color': '#ffffff', 'opacity': 1},
                                  {'offset': 0.12, 'color': '#ffffff', 'opacity': 0.85},
                                  {'offset': 0.35, 'color': '#ffffff', 'opacity': 0.25},
                                  {'offset': 1, 'color': '#ffffff', 'opacity': 0}])
    glow('sprite-dot', 64, [{'offset': 0, 'color': '#ffffff', 'opacity': 1},
                            {'offset': 0.35, 'color': '#ffffff', 'opacity': 0.9},
                            {'offset': 0.55, 'color': '#ffffff', 'opacity': 0.25},
                            {'offset': 1, 'color': '#ffffff', 'opacity': 0}])


# ---------- social preview (1200x630) ----------

def build_og():
    W, H = 1200, 630
    cmds = [new_doc(W, H), ('shape.rectangle', {'x': 0, 'y': 0, 'width': W, 'height': H}),
            ('paint.setFill', {'gradient': {'kind': 'radial', 'stops': [
                {'offset': 0, 'color': '#0f1d44'}, {'offset': 1, 'color': SPACE}],
                'start': [880, 315], 'end': [880, 900]}}), ('paint.setStroke', {'none': True})]
    # orbits around a sun on the right
    for i, (rx, ry, rot, col, w) in enumerate([(150, 60, -12, '#2a3a63', 1.5), (250, 100, -12, EARTH, 2),
                                                (380, 150, -12, '#2a3a63', 1.5), (330, 120, 8, ACCENT, 2)]):
        cmds += [('shape.ellipse', {'x': 880 - rx, 'y': 315 - ry, 'width': 2 * rx, 'height': 2 * ry, 'rotation': rot}),
                 *stroke(col, w, [2, 6] if col == '#2a3a63' else None)]
    cmds += [('shape.ellipse', {'x': 862, 'y': 297, 'width': 36, 'height': 36}), *fill('#ffd27a'),
             # Earth and the asteroid sit on their orbits (points worked out from each ellipse)
             ('shape.ellipse', {'x': 1117 - 9, 'y': 300 - 9, 'width': 18, 'height': 18}), *fill(EARTH),
             ('shape.ellipse', {'x': 1029 - 7, 'y': 441 - 7, 'width': 14, 'height': 14}), *fill(ACCENT)]
    cmds += [('text.create', {'x': 80, 'y': 250, 'text': 'Asteroid Watch', 'size': 84, 'font': 'Avenir Next',
                              'style': 'Demi Bold', 'color': '#eef2fb'}),
             ('text.create', {'x': 82, 'y': 320, 'text': 'Every asteroid passing close to Earth,',
                              'size': 30, 'font': 'Avenir Next', 'color': '#a9b4cc'}),
             ('text.create', {'x': 82, 'y': 362, 'text': 'live from NASA/JPL, in 3D.',
                              'size': 30, 'font': 'Avenir Next', 'color': '#a9b4cc'}),
             ('text.create', {'x': 82, 'y': 540, 'text': 'ASTEROID-WATCH.THESOLOHACKER47.WORKERS.DEV',
                              'size': 18, 'font': 'Menlo', 'color': '#6d7894'})]
    run('og-image', cmds, ['png'])


if __name__ == '__main__':
    if not Path(CLI).exists():
        sys.exit(f'vectorcraft-cli not found at {CLI}; set VECTORCRAFT_CLI')
    SRC.mkdir(parents=True, exist_ok=True)
    OUT.mkdir(parents=True, exist_ok=True)
    only = set(sys.argv[1:])
    for label, fn in [('logo', build_logo), ('rock', build_rock), ('sprites', build_sprites),
                      ('silhouettes', build_silhouettes), ('og', build_og)]:
        if not only or label in only:
            print(label)
            fn()
