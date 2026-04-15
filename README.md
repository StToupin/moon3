# WASM SPICE

This is a standalone Vite + React app that recreates the main ephemeris experience with CSPICE running fully in WebAssembly in the browser. It loads the same core kernels, computes ephemeris/orbit/camera data locally, and renders the React + Three.js scene without the Go backend or process pool.

## Prerequisites

- Node.js 22+
- `emcc`
- `tcsh`
- `tar`

The build downloads pinned upstream sources from [`arturania/cspice`](https://github.com/arturania/cspice) and rebuilds the browser CSPICE bundle locally.
That download/build is cached under `.cache`, so repeated `npm run dev` runs reuse the local cache instead of redownloading everything.

## Install

```bash
npm install
```

## Run In Development

```bash
npm run dev
```

This automatically runs `npm run prepare:spice` first.

Default local URL:

- App: [http://localhost:5174](http://localhost:5174)

## Build

```bash
npm run build
```

This also runs `npm run prepare:spice` first and writes the production bundle to `dist`.

## Preview The Production Build

```bash
npm run preview
```

Default preview URL:

- App: [http://localhost:4174](http://localhost:4174)

## Force A Fresh CSPICE Rebuild

```bash
npm run rebuild:spice
```

That regenerates the ignored runtime assets under:

- `src/spice/generated`
- `public/spice`

## End-To-End Test

```bash
npm run test:e2e
```

Playwright starts the standalone app, pins the preview to a fixed date, waits for the browser-side ephemeris to finish loading, and validates exact kernel-backed CSPICE outputs.

## Deterministic Preview

You can pin the app to a fixed base date for debugging or demos:

```bash
npm run dev -- --host 127.0.0.1 --port 4174
```

Then open:

- App: [http://127.0.0.1:4174/?date=2026-04-15T18:54:41.304Z](http://127.0.0.1:4174/?date=2026-04-15T18:54:41.304Z)

## GitHub Pages

This repo now includes a GitHub Pages workflow at `.github/workflows/deploy.yml`.

To enable automatic deploys:

1. Push the repo to GitHub.
2. In GitHub, open **Settings → Pages**.
3. Under **Build and deployment**, set **Source** to **GitHub Actions**.
4. Push to `main` to trigger a deploy.

The workflow builds with `npm run build` and publishes `dist` to Pages.
For this repository, the default deploy base path is `/${repo-name}/`, which matches project Pages URLs like `https://<user>.github.io/moon3/`.

If you later switch to a custom domain or a user site (`https://<user>.github.io/`), set a repository variable named `PAGES_BASE_PATH` to `/` so the app builds with root-relative asset URLs.
