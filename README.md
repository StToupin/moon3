# Moon3

Interactive Sun-Earth-Moon visualization powered by NASA SPICE, running fully in the browser with WebAssembly.

[Live demo on GitHub Pages](https://sttoupin.github.io/moon3/)

## What This App Does

Moon3 is a standalone Vite + React app that computes solar system data locally in the browser using CSPICE compiled to WebAssembly.

It renders an interactive 3D view of the Sun, Earth, and Moon, including:

- body positions and orientations computed from SPICE kernels
- Earth and Moon orbit paths
- five guided camera steps: schematic, solar system, Earth and Moon, Moon, and Earth
- a Moon view from the user's current Earth location
- an Earth close-up targeted at a geolocated surface point
- a moon-distance chart with lunar phase markers and supermoon highlighting
- time scrubbing and playback for exploring motion over time
- desktop and mobile top and bottom control bars, with collapsible mobile sections

No backend is required once the app is built. Ephemeris calculations happen client-side.
To keep the browser payload smaller, Earth rotation uses the generic `IAU_EARTH`
frame from the text PCK instead of a high-precision binary Earth orientation kernel.
The bundled `spice/de432s.bsp` is also a reduced DE432s subset that keeps only
the Sun, Earth barycenter, Earth, and Moon segments used by the app.

## Demo

- GitHub Pages: [https://sttoupin.github.io/moon3/](https://sttoupin.github.io/moon3/)

## Tech Stack

- React 19
- Vite
- TypeScript
- TanStack Query
- Three.js with React Three Fiber
- NASA SPICE / CSPICE compiled to WebAssembly
- Playwright

## Local Development

### Prerequisites

You will need:

- Node.js 22+
- Python 3

The repository already includes the generated browser-facing SPICE assets and the
reduced kernel set used by the app, so ordinary development does not require a
local Emscripten toolchain.

You only need the full native rebuild toolchain if you want to force a fresh
CSPICE rebuild from the pinned upstream source archive:

- `emcc`
- `tcsh`
- `tar`

The prepare step keeps a local cache under `.cache`, so repeated runs are much
faster. If the local SPICE kernel sources are missing, it also downloads the
generic kernels and can regenerate the reduced `de432s.bsp` subset automatically.

### Install

```bash
npm install
```

### Cloud Setup For Offline Startup

For cloud environments where you want a one-time online setup and later offline startup,
run:

```bash
./scripts/setup-cloud-offline.sh
```

This script:

- checks for Node.js 22+ and npm
- installs missing build dependencies on Debian/Ubuntu (`apt-get`) when needed
  (`python3`, `tar`, `tcsh`, `emcc`, `curl`)
- installs JavaScript dependencies with `npm ci`
- prepares/validates the WASM SPICE runtime and bundled kernels
- builds the production bundle in `dist`

After it finishes, you can start the already-built app without internet access:

```bash
npm run preview -- --host 0.0.0.0 --port 4174
```

### Start The Dev Server

```bash
npm run dev
```

This automatically prepares the WASM SPICE assets before starting Vite.

Default local URL:

- [http://localhost:5174](http://localhost:5174)

## Production Build

Create a production build:

```bash
npm run build
```

Preview the built app locally:

```bash
npm run preview
```

Default preview URL:

- [http://localhost:4174](http://localhost:4174)

## Rebuild The CSPICE Bundle

If you want to force a fresh CSPICE rebuild:

```bash
npm run rebuild:spice
```

This regenerates the browser runtime assets under:

- `src/spice/generated`
- `public/spice`

If you want to regenerate the reduced planetary kernel from an official
`de432s.bsp` download:

```bash
python3 scripts/reduce-spk.py /path/to/de432s.bsp spice/de432s.bsp
```

This helper script requires `spiceypy` and `numpy`. The prepare script creates a
local virtual environment under `.cache/spk-reducer` when it needs to do this
automatically.

## Testing

Run the Playwright end-to-end suite:

```bash
npm run test:e2e
```

Run the lightweight helper-level tests:

```bash
node --test src/cameraViews.test.ts
```

The test coverage currently focuses on:

- browser-side ephemeris and rendering behavior through Playwright
- camera-step parsing and shared camera metadata helpers
- moon-distance chart geometry and hover behavior

## Deterministic Demos

You can pin the app to a fixed date with the `date` query parameter:

- [http://localhost:5174/?date=2026-04-15T18:54:41.304Z](http://localhost:5174/?date=2026-04-15T18:54:41.304Z)

You can also select the initial camera step with `step=1` through `step=5`:

- `1` = schematic
- `2` = solar system
- `3` = Earth and Moon
- `4` = Moon
- `5` = Earth

Example:

- [http://localhost:5174/?date=2026-04-15T18:54:41.304Z&step=4](http://localhost:5174/?date=2026-04-15T18:54:41.304Z&step=4)

This is useful for debugging, demos, visual comparisons, and deterministic screenshots.

## Geolocation Behavior

The app requests browser geolocation so it can derive an Earth surface point and
an above-surface viewing position for the Moon and Earth close-up steps.

If geolocation is unavailable or denied, the app falls back to a default location
of Paris (`48.8566, 2.3522`) so the visualization remains usable.

## GitHub Pages Deployment

This repository includes a GitHub Pages workflow at `.github/workflows/deploy.yml`.

To publish the site:

1. Push the repository to GitHub.
2. Open `Settings -> Pages`.
3. Under `Build and deployment`, choose `GitHub Actions`.
4. Push to `main`.

Each push to `main` builds the app and publishes `dist` to GitHub Pages automatically.

## Vercel PR Preview Deployments

This repository now also includes a pull-request preview workflow at
`.github/workflows/vercel-preview.yml`.

Use this if you want a unique Vercel preview URL on each PR while keeping GitHub
Pages as the production deploy for `main`.

### One-Time Setup

1. Create a Vercel account or team on the free plan.
2. Install the Vercel CLI locally:

   ```bash
   npm install --global vercel@latest
   ```

3. From the repository root, log in and link this directory to a Vercel project:

   ```bash
   vercel login
   vercel link
   ```

   If you want GitHub Actions to be the only deploy path, do not import this repo
   into Vercel through the GitHub integration. Linking with the CLI is enough.

4. After `vercel link`, open `.vercel/project.json` and copy:
   - `orgId`
   - `projectId`

5. In Vercel, create an access token:
   - `Settings -> Tokens -> Create`

6. In GitHub, add these repository secrets:
   - `VERCEL_TOKEN`
   - `VERCEL_ORG_ID`
   - `VERCEL_PROJECT_ID`

7. Push the workflow to GitHub. Each same-repository PR will build the app,
   upload the prebuilt output to Vercel, and post the preview URL back onto the
   PR as a comment.

### Notes

- The workflow builds inside GitHub Actions with `vercel build`, then deploys the
  generated `.vercel/output` directory with `vercel deploy --prebuilt`.
- Forked PRs are intentionally skipped because GitHub does not expose repository
  secrets to `pull_request` workflows from forks.
- The workflow forces `VITE_BASE_PATH=/` so previews are served from the domain
  root instead of the GitHub Pages subpath.

## Why WebAssembly SPICE?

This project keeps the ephemeris logic close to the UI:

- the browser computes positions directly from SPICE kernels
- there is no API server to maintain
- deploys are simple static-site deploys
- demos are easy to share through GitHub Pages
