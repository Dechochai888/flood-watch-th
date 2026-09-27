# AGENTS.md

## Project purpose

This repository contains **น้ำท่วมไหน**, a Thai community flood-reporting web app. Users can view flood reports on a map, use their current location, pin a location, select severity and water depth, add a description, and upload an image.

## Working agreements

- Keep all user-facing copy in Thai unless a technical term is clearer in English.
- Preserve the map-first responsive layout and mobile usability.
- Never commit `.env*`, credentials, `.wrangler/`, `.sites-runtime/`, `dist/`, `.next/`, or `node_modules/`.
- Store structured report data in D1 and uploaded images in R2. Do not replace durable storage with browser storage.
- Validate coordinates, report fields, image type, and image size on the server.
- Preserve OpenStreetMap attribution and the exact Leaflet marker anchor when changing marker visuals.
- Add database changes through `db/schema.ts` and append a new Drizzle migration. Do not rewrite migrations already applied to production.
- Run `npm run build` before handing off a change.

## Key files

- `app/flood-app.tsx`: main interface and report form
- `app/flood-map.tsx`: Leaflet map and marker positioning
- `app/api/reports/route.ts`: report list/create API
- `app/api/images/[key]/route.ts`: image delivery API
- `db/reports.ts`: D1 and R2 access
- `db/schema.ts`: database schema
- `app/globals.css`: visual theme and marker styling

## Local development

```bash
npm ci
npm run dev
```

The local URL is `http://127.0.0.1:5173`.

For a production-style check:

```bash
npm run build
npm start -- --port 5173
```
