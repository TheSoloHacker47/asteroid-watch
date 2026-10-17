# Asteroid Watch v2 — "Mission Control" design lock

## Brief

Designing an interactive 3D asteroid tracker for curious non-experts (and recruiters opening a resume link), on web, desktop and phone.
Goal: in five seconds, see what's flying past Earth soon and how close it gets; then explore any one of them.
Tone: awe, held in check by precision. It should feel like an instrument, not a screensaver.
Main risk: 3D that looks pretty but hides the data, or a dashboard that looks like every dark SaaS page.
Must remember: **scrub time and watch every upcoming asteroid move on its real orbit**, and see one asteroid's size next to something familiar.
Constraints: no build step (ES modules), Cloudflare Worker + static assets, live JPL data, accessible without WebGL.

## Research (Refero)

Refero's style search returned no results for any query during this session (the service seemed down), so direction is grounded in screens plus the skill's craft references.

| Reference | Screen | What it contributes |
|---|---|---|
| Windy.com (weather globe) | 82a50550…, e219142f…, a59dba14… | **Primary.** The 3D scene *is* the app. Controls are pinned to the edges and the centre is left clear. A full-width bottom timeline with play and a labelled playhead. One warm accent marks the active state (playhead, selected layer). |
| Clay "Serendipity" | 8333b544… | **Borrowed (1).** Big high-contrast serif numerals for the headline metrics, with tiny tracked uppercase labels and hairline rules instead of cards. Coordinates typeset like an almanac. Deep navy space canvas. |
| Enode Developers | c0166bb9… | **Borrowed (2).** Accent discipline: one saturated accent used only for interactive/active things, on near-black. |
| Parallel, Linear, Fibery maps | e8d32363…, 58ac6637…, 181191e1… | Pattern evidence only: a floating detail panel over a map for the selected item, and a dense sortable list as the accessible fallback. |

## Reference lock

- **Primary direction:** Windy. Full-screen live 3D canvas, edge-pinned translucent controls, bottom time scrubber.
- **Preserve:** (1) canvas-first, so nothing permanently covers the middle third; (2) the bottom timeline with play/pause and a labelled playhead; (3) controls hug the edges; (4) one warm accent for "active/selected/now"; (5) the dark space canvas, which the subject justifies.
- **Borrow only:** Clay's serif numerals for the two or three headline numbers (never for headings or sentences), with tracked uppercase micro-labels and hairline dividers. Enode's single-accent discipline.
- **Role rules:** the amber accent is only for the selected asteroid, the playhead/"now" and the primary action. Earth blue is only for Earth. Red is only for "closer than the Moon" and always comes with an icon and a label. Serif is only for big numbers.
- **Media strategy:** code-native 3D (Three.js) for the sky, orbits and bodies. VectorCraft for the logo mark, size-comparison silhouettes, sprite textures and the social preview image. EffectCraft (exported as Lottie) for the loading animation and the "closer than the Moon" alert pulse.
- **Reject:** card grids, indigo/violet, glassmorphism blobs, emoji, a gradient hero headline, a one-word serif swap, a "hero + features" landing layout, and a rainbow of asteroid colours.

## Tokens

| Token | Value | Role |
|---|---|---|
| `--space-0` | `#03060f` | page/canvas base (radial towards `#0a1430` at the Sun) |
| `--panel` | `rgb(9 14 30 / 0.72)` + 12px blur | floating panels (interactive containers only) |
| `--hairline` | `rgb(160 180 220 / 0.14)` | dividers and orbit rings |
| `--ink-1/2/3` | `#eef2fb` / `#a9b4cc` / `#6d7894` | primary / secondary / muted text |
| `--accent` | `#ffb02e` | selected / now / primary action only |
| `--earth` | `#4ea1ff` | Earth and its orbit only |
| `--alert` | `#ff5a4f` | inside 1 LD, with icon and label |
| `--asteroid` | `#c9d2e6` | unselected asteroids and orbits (one neutral) |
| Display | Instrument Serif 400 | headline numbers only |
| UI | Geist 400/500/600 | everything else |
| Data | Geist Mono, uppercase labels tracked +0.08em | micro-labels, readouts, timestamps |
| Radius | 10px panels, 6px controls, 999px pills | |
| Motion | 120ms / 200ms / 320ms; ease-out to enter, ease-in to exit; camera flights 900ms ease-in-out (an expressive moment, used rarely) | reduced-motion: no camera flights, no autoplay |

## Layout

**Desktop**
- Top-left: logo mark + "Asteroid Watch"; filters (window, distance) as compact pills.
- Left column (no card): the Clay-style stat stack: CLOSEST PASS **0.82 LD**, PASSING BY **3**, CLOSER THAN THE MOON **1**, with hairlines between them.
- Right: the detail panel slides in when an asteroid is selected: name, big serif distance, date, a size silhouette next to the asteroid at the same scale, speed, class/hazard, and buttons for "Watch flyby" and "JPL page".
- Top-right: List (sortable table sheet), Risk (Sentry watch list sheet), About.
- Bottom: the timeline across the full width. Each approach is a tick (taller = closer, red with a dot if under 1 LD, amber when selected). Play/pause, speed, and a playhead label with date and time.

**Phone (<760px)**
- The canvas fills the screen with stats as a compact strip at the top. The detail panel becomes a bottom sheet above the timeline, and List and Risk become full-screen sheets.

## Interaction

- Time is the master control: the scrubber or play moves every asteroid and planet along its orbit (two-body model from SBDB elements).
- Click an asteroid (or a tick or a list row) to select it: the camera flies to frame its orbit and Earth at the closest-approach time, and the details open.
- "Watch flyby" switches to the Earth-centred scene (JPL Horizons): textured-look Earth sphere with atmosphere rim, Moon, the asteroid's track, and live distance.
- Hover an asteroid for a name tooltip. Drag to orbit, scroll or pinch to zoom, and the keyboard works as well.
- No WebGL: show the list and the stats with a note.

## Decision ledger

| Decision | Source | Role preserved | Why |
|---|---|---|---|
| Full-screen 3D canvas as the main UI | Windy | canvas-first, centre clear | The orbit motion is the product's memorable thing |
| Bottom time scrubber with ticks per approach | Windy timeline | playhead = accent | Replaces the old 2D chart. The timeline *is* the chart. |
| Serif big numbers + tracked micro-labels + hairlines | Clay | serif = metrics only | Gives the data a precise, almanac voice without cards |
| Single amber accent | Windy active state + Enode discipline | active/selected only | Keeps attention on the selected asteroid |
| Dark navy canvas | Windy + Clay, and the subject (space) | — | Justified by research, not a default |
| Detail panel over the scene | Fibery/PamPam map + selected-item panel | interactive container | Selection needs a home without leaving the scene |
| Size silhouette comparison | User brief ("make it meaningful") + existing comparisons | — | Turns "41–92 m" into something you feel |
| Lottie loader + alert pulse from EffectCraft | User's toolchain | decorative motion, small | Brand motion without heavy video |

## Visual QA (against this lock)

Checked in the browser on desktop (1024px) and phone (375×812) with live data, 2026-10-17.

| Lock item | Result |
|---|---|
| Canvas-first, centre clear | Pass. Stats on the left, the detail panel on the right, and the 3D camera's view offset keeps the selected asteroid centred in the visible area (also above the phone sheet). |
| Bottom timeline + labelled playhead | Pass. Ticks per approach (height = closeness), red tick + dot inside 1 LD, amber when selected. |
| Amber only for selected / now / primary | Pass after a fix: error text had been red, and is now ink (red stays reserved for inside 1 LD). Focus rings also use amber, which counts as the active state. |
| Serif only for big numbers | Pass (`.num-xl`, `.num-l` only). |
| Red only for inside 1 LD, with a label | Pass. The tick has an aria-label and title, the panel and list show "Passes closer than the Moon" / "Inside Moon". |
| No cards, indigo, emoji or blobs | Pass. |
| Media roles | Pass. VectorCraft logo, rock, silhouettes, sprites and OG image; EffectCraft loader and alert pulse (Lottie); Three.js for the scene. |
| Flyby accuracy | At closest approach the live readout shows 0.82 LD for 2025 UK9, matching JPL's close-approach data. |

Known gaps: Earth and the Moon are drawn at true scale in the flyby view, so they're tiny until you zoom in; markers keep them findable.
