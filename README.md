# Roadtrip map (Europe)

A small React + [MapLibre GL JS](https://maplibre.org/) app for planning and following a European road trip: country tint (from Natural Earth data), optional terrain from MapTiler, waypoints with “done” vs upcoming, geolocation, and a side panel to search places or add coordinates.

## Quick start

```bash
npm install
cp .env.example .env
# Add VITE_MAPTILER_API_KEY for outdoor terrain + geocoding (recommended).
npm run dev
```

- Canonical stops live in [`public/trip.json`](public/trip.json). Change that file and redeploy so everyone gets the same route.
- On each device, **visited**, **custom stops**, and **removed defaults** are stored in `localStorage` (per browser). Use **Export trip JSON** to download the merged list and “done” flags; paste into `public/trip.json` and push to update everyone, or use **Import trip JSON** on another device (e.g. GitHub Pages) to copy your local trip without committing.

## Environment variables

| Variable | Purpose |
|----------|---------|
| `VITE_MAPTILER_API_KEY` | [MapTiler](https://www.maptiler.com/) key: loads **Outdoor** style (hillshade / terrain) and powers **place search** in the drawer. |
| `VITE_MAP_STYLE_URL` | Optional full MapLibre style URL (overrides the MapTiler outdoor URL when set). |

If neither is set, the app uses a free CARTO vector style (no DEM hillshade). You can still use **Nominatim** for search (see below).

## Deploy (static build)

```bash
npm run build
```

Upload the `dist/` folder to any static host (HTTPS is required for geolocation in production).

### GitHub Pages

The repo includes [`.github/workflows/deploy-github-pages.yml`](.github/workflows/deploy-github-pages.yml). On each push to `main`, it builds with the correct asset path for **project** sites (`https://<user>.github.io/<repo>/`). The app loads `trip.json` and `europe-countries.geojson` using Vite’s `import.meta.env.BASE_URL` so those requests hit `/<repo>/…` instead of the site root.

1. Create a **public** repository on GitHub (GitHub Free only allows Pages for **public** repos on personal accounts).
2. Push this project to the `main` branch.
3. **Settings → Pages → Build and deployment**: source **GitHub Actions** (not “Deploy from a branch”).
4. **Settings → Secrets and variables → Actions**: add repository secrets as needed:
   - `VITE_MAPTILER_API_KEY` — recommended (map + geocoding).
   - `VITE_MAP_STYLE_URL` — optional; overrides the MapTiler outdoor style when set.
5. Open **Actions**, run **Deploy to GitHub Pages** if it did not start automatically; after the first successful deploy, the site URL appears on the workflow run and under **Settings → Pages**.

If your default branch is not `main`, rename it or change the `branches:` list in the workflow.

**User/organization site** (`<user>.github.io` with repo named `<user>.github.io`): set `BASE_PATH` to `/` for that build (e.g. add a separate workflow input or hard-code once in the workflow env for that repo only).

### Azure Static Web Apps

1. Create a Static Web App; connect your repo or deploy from the `dist` artifact.
2. Set **Application settings** (build-time for Vite): `VITE_MAPTILER_API_KEY` in the build pipeline environment, or bake it into `.env` in CI before `npm run build`.
3. Output location: `dist`. Build command: `npm run build`.

### Home server + Traefik

Serve `dist/` as static files (e.g. `nginx` `root /var/www/roadtrip-map;`) or a tiny static container. Put a router on your Traefik entrypoint with TLS; no server-side code is required for Phase 1.

## Geocoding / Nominatim

- With **`VITE_MAPTILER_API_KEY`**, search uses MapTiler Geocoding (same key as the map).
- Without it, search uses [OpenStreetMap Nominatim](https://nominatim.openstreetmap.org/). Follow the [usage policy](https://operations.osmfoundation.org/policies/nominatim/): light use only, cache results where possible, and identify your app. For heavy or production traffic, prefer MapTiler or run your own Nominatim instance and point the app to it (would require a small code change or proxy).

## Data / attribution

- **Country polygons** in [`public/europe-countries.geojson`](public/europe-countries.geojson) are a Europe-bbox subset of [Natural Earth](https://www.naturalearthdata.com/) **1:50m** admin-0 countries (sharper coastlines than 1:110m; ~0.8 MB). Fills are computed in the app for readability. For even more detail you could regenerate from **1:10m** (larger file).
- **Basemap** tiles and fonts are subject to your chosen provider’s terms (MapTiler, CARTO, etc.).
- **Flags** in the list use [flagcdn.com](https://flagcdn.com) (ISO country codes).

## Phase 2 (optional shared state)

Today, **cross-device sync** of “done” flags is not included. Simple upgrade paths:

1. **Single JSON in the cloud**: Store one `trip-state.json` in **Azure Blob Storage** (or a file on your server) and add a tiny secured upload endpoint; clients poll `ETag` or use SAS read for public read-only trip data.
2. **Azure Functions + Table/Cosmos**: Keep the static front end on Static Web Apps; a function with a key or Easy Auth writes rows for waypoints and `visited`.
3. **Self-hosted API** behind Traefik (Node or .NET) with the same contract.

If you add an API later, keep `public/trip.json` as the default seed and merge server state on top, similar to the current `localStorage` merge.

## Print / A4

There is no dedicated print mode; use the browser’s print dialog if you want a paper copy. You can add `@media print` rules later to hide the drawer and enlarge the map.
