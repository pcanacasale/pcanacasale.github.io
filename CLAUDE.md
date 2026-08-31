# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

Static site for **Protezione Civile ANA Casale Monferrato**, served via GitHub Pages at `pcanacasale.com` (see `CNAME`). No build system, no package manager, no bundler — every page is a self-contained HTML file (inline `<style>` and mostly-inline `<script>`) or a plain `.js` file loaded via `<script src>`. Deploys happen by pushing/uploading files directly to `main`; there is nothing to compile.

There is no test suite, linter, or dev server configured. To check a change, open the relevant HTML file directly in a browser (or serve the folder with any static file server) and exercise the feature manually.

## Repository layout

- `index.html` — public marketing site (chi siamo, attività, galleria, contatti).
- `area-riservata.html` + `area-riservata.js` — the reserved-area web app for volunteers (see below). `area-riservata.js` is a large (~8.5k line) monolithic script; grep for the function or panel name you need rather than reading it top to bottom.
- `configuratore.html` — standalone tool ("Piano Acquisti Informatica"), self-contained, no backend calls.
- `generatore-convocazioni.html` — standalone tool for generating convocation documents, self-contained, no backend calls.
- `belfiore-comuni.js` — static lookup data (Italian comuni / Belfiore codes) used for codice fiscale validation.
- `manifest.json`, `sw.js` — PWA manifest and service worker, scoped to `area-riservata.html` (cache name `pcana-vN`; bump the version when changing cached assets so old caches are evicted).
- `_headers` — Cloudflare/host header rules (currently disables content-encoding on `area-riservata.html`).
- `icons/`, `images/` — static assets.
- `et/` — unrelated one-off HTML fragments/pages (different branding, e.g. "ET Store", "Wind Tre"); not part of the ANA site, treat as independent standalone files.

## `area-riservata.js` architecture

This is a single-page app manually driven by DOM manipulation (no framework). Key structure:

- **Auth**: `doLogin()` / `doLoginVolontario()` authenticate against the Supabase `utenti` table directly from the client (`SUPA_URL`, `SUPA_KEY` anon key are hardcoded near the top of the file). `currentUser.tipo_accesso` is `'master'`, `'standard'`, or `'volontario'`; `canModificaVolontari()` and similar checks gate write actions client-side based on `tipo_accesso` / `permessi`.
- **Navigation**: `showPanel(name, btn)` toggles `.panel` divs (each with id `panel<Name>`, defined in `area-riservata.html`) inside `.main-content`. Panels: Home, Volontari, Interventi, Postazioni, Documenti, Db, Visite, Accessi, Schedapers, Segnalazioni, Galleria, Dotazioni, PianiCarico, Mezzi, Tlc, Statistiche, Richieste, Impostazioni.
- **Backend**: all data access is direct REST calls to Supabase (`SUPA_URL + '/rest/v1/<table>'`) using the anon key in headers (`H` / `HJ` constants), no server-side code in this repo. Main tables: `utenti`, `volontari`, `interventi` / `interventi_con_stato` (view) / `intervento_volontari`, `mezzi`, `postazioni` / `postazione_volontari`, `mappe_intervento`, `documenti` / `documenti_mezzi` / `documenti_tlc`, `tlc`, `dotazioni` / `dotazioni_categorie` / `dotazioni_magazzini` / `dotazioni_manutenzioni`, `piani_carico` / `piani_carico_mezzi` / `piani_carico_voci`, `log_attivita`, `log_accessi`, `richieste_adesione`, `segnalazioni`, `schema_volontari` / `viste_volontari` (custom-field schema and saved filter views for the volontari list).
- **AI integration**: `apriChatAgenteIntervento()` and related `aic*` functions call a Supabase Edge Function (`AGENTE_INT_URL`, `.../functions/v1/Agente-Interventi`) that turns a free-text message into a draft "intervento" record for confirmation.
- **PDF/export features**: attestati (certificates) are generated client-side (`_generaPDFBlob`, `_buildAttestatiHTML`) via a lazily-loaded library (`_caricaLibreriaAttestati`); Excel export/import for postazioni uses `pstEsportaExcel` / `pstImportaExcel`.
- **Maps**: postazioni can be placed on a static image map (canvas-based, `pst*Canvas*` / `pst*Immagine*` functions) or on Google Maps (`pst*Google*` functions, loaded on demand via `pstCaricaGoogleMapsScript`).
- **PWA**: registers `sw.js` on load; the service worker network-passes through requests to `supabase.co`, `teable.ai`, Google Fonts, and cdnjs, and otherwise falls back to cache on fetch failure.
- Naming convention: many related functions share a lowercase prefix per feature area (`pst*` = postazioni, `dot*` = dotazioni, `db*` = generic "database" panel, `tlc*`/`aic*` = their respective panels) — searching by prefix is the fastest way to find a feature's code.

## Working in this repo

- Prefer `Edit` over rewriting whole files — `area-riservata.js` and the larger HTML files are big enough that full reads/rewrites are wasteful; grep for the specific function/id first.
- Since there's no build step, any syntax error in the edited file breaks the page directly in production once deployed — double-check JS edits (e.g. with `node --check file.js`) before considering a change done.
- The Supabase anon key embedded in `area-riservata.js` is intentionally public (client-side anon key); do not treat its presence as a leaked secret, but also don't add any *service-role* keys or other credentials to this repo.
