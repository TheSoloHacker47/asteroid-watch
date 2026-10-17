# Asteroid Watch

A live tracker of every asteroid passing close to Earth, built on NASA/JPL open data.

**Live:** https://asteroid-watch.thesolohacker47.workers.dev

- **Upcoming close approaches** for the next 7 days to 1 year, filtered by distance (1, 5 or 10 lunar distances).
- **Chart**: date against distance on a log scale. The dashed line marks the Moon's distance, and dot size shows the asteroid's size.
- **Size in plain words**: each asteroid is compared to something familiar (a bus, the Qutub Minar, the Eiffel Tower).
- **3D orbit view** for any asteroid (click a dot or a row), drag to rotate, scroll or pinch to zoom, with a time slider and play button:
  - *Solar system*: the asteroid's full orbit next to the planets. Parts of the orbit below the plane of Earth's orbit are faded.
  - *Flyby*: the Earth-centred path over the 6 days around the approach, with the Moon's real position and the direction of the Sun.
- **Long-term watch list**: the 10 objects highest on the Palermo impact-hazard scale, from NASA's Sentry system.

## Run it

Needs Node 18 or newer. `npm start` has no runtime dependencies, so there's nothing to install first.

```bash
npm start
```

Then open http://localhost:5173. Run the tests with `npm test`.

## Deploy

It runs on Cloudflare Workers: `src/worker.js` handles `/api/*`, and Workers Static Assets serves `public/`.

```bash
npm install
npm run deploy
```

Use `npm start` for local development, not `npm run dev`. JPL's servers use an Entrust TLS certificate, and the local Workers runtime (`wrangler dev`) doesn't trust it, so API calls fail there. Deployed Workers on Cloudflare's network reach JPL fine.

## How it works

```
browser ──> server.js (local) or src/worker.js (Cloudflare)
                      ──> ssd-api.jpl.nasa.gov/cad.api      (close approaches)
        cached 10 min ──> ssd-api.jpl.nasa.gov/sentry.api   (impact risk)
                      ──> ssd-api.jpl.nasa.gov/sbdb.api     (orbital elements)
                      ──> ssd.jpl.nasa.gov/api/horizons.api (flyby positions)
```

- JPL's APIs don't send CORS headers, so the browser can't call them directly. A small proxy forwards only allow-listed endpoints and validated parameters (`src/routes.js`, shared by the Node server and the Worker), and caches each response for 10 minutes so it doesn't hammer JPL.
- `public/neo.js` holds the pure logic (unit conversion, size estimates, summaries) and is unit-tested in `test/`.
- `public/app.js` draws the chart as hand-written SVG. There's no chart library.
- `public/orbit.js` solves Kepler's equation to turn orbital elements into positions. It's tested against Earth's known position and against JPL's distance for a real flyby.
- `public/orbit-view.js` is a small 3D renderer: perspective projection onto a 2D canvas. There's no 3D library either.

## The science, briefly

- **Lunar distance (LD)**: 384,400 km, the average Earth–Moon distance. 1 AU ≈ 389 LD.
- **Size from brightness**: most asteroids have never been measured. Their size comes from absolute magnitude *H* and an assumed reflectivity (albedo): `D(km) = 1329 / √albedo × 10^(−H/5)`. The tracker shows a range from bright (albedo 0.25) to dark (0.05), and uses JPL's measured diameter when there is one.
- **Two models, on purpose**: the solar-system view uses a two-body model (Sun plus asteroid). That's exact enough for the orbit's shape, but it ignores Earth's pull. For 2025 UK9 it puts the closest approach at 0.84 LD, about 4.5 hours early, against JPL's 0.82 LD. The flyby view instead uses JPL Horizons, which includes every planet's and the Moon's pull, so its numbers match JPL's.
- **Palermo scale**: compares an asteroid's impact risk to the normal background risk. Below −2 means no likely consequences. Between −2 and 0 means it deserves careful monitoring.

## Data

- [JPL SBDB Close-Approach Data API](https://ssd-api.jpl.nasa.gov/doc/cad.html)
- [JPL Sentry API](https://ssd-api.jpl.nasa.gov/doc/sentry.html)
- [JPL SBDB API](https://ssd-api.jpl.nasa.gov/doc/sbdb.html) and [JPL Horizons API](https://ssd-api.jpl.nasa.gov/doc/horizons.html)
- Planet positions: Standish, *Keplerian Elements for Approximate Positions of the Major Planets* (JPL)

This isn't an official NASA product.

## Ideas for next steps

- Send a daily alert when something comes closer than the Moon.
