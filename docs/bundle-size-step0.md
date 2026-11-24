# Bundle size report — Step 0 (Vite+Svelte prototype)

Date: 2026-11-24
Build: `npm run build` (Vite 8.3.8, rolldown) — exit 0, "built in ~3s".
Output: `web/dist` = 13 MB total (uncompressed). Total JS ≈ 10.7 MB.

## Largest chunks

| Chunk | Size |
|---|---|
| plantuml (TeaVM JS) | 2.96 MB |
| index (app + markdown-it etc.) | 1.63 MB |
| elk (mermaid layout) | 1.50 MB |
| viz (Graphviz, shared by dot + plantuml) | 1.36 MB |
| chunk-NGNAAXSQ | 0.63 MB |
| cytoscape (mermaid) | 0.44 MB |
| katex | 0.26 MB |
| mermaid core | 0.08 MB |
| nomnoml | 0.07 MB |

## Notes

- Diagram code is lazy-loaded via dynamic `import()` inside the fence renderer dispatch, so mermaid/plantuml/viz/wavedrom/nomnoml are separate chunks fetched only when their fences appear.
- KaTeX fonts are bundled locally (woff2/ttf) — no remote fetch.
- highlight.js ships one theme (`github.css`).
- PlantUML is the single largest contributor (~2.96 MB); acceptable for offline V1 but candidate for worker/deferred loading in Step 1.

## Offline check (dev + preview)

- Dev server: `npm run dev -- --host 127.0.0.1` (http://127.0.0.1:5173). Loaded `docs/fixture.md` via symlink `web/public/fixture.md`.
- Playwright/Chromium 1248: 0 remote requests (only 127.0.0.1), 0 page errors, 18 diagram placeholders rendered (17 SVG + ditaa verbatim+banner).
- Preview build (`npm run preview`): 0 remote requests, 0 page errors, 17 SVGs.

## Mermaid version verdict

- Installed: mermaid 12.3.0.
- All fixture diagram types rendered (flow, sequence, class, ER, state, gantt, mindmap, 100-node stress) in Chromium 1248.
- Decision: **keep mermaid v12**. WebKitGTK (Trixie) verification deferred to Step 2; fallback to v11/tiny-only if a WebKit smoke fails.

## WebKit result

- Epiphany not installed on this host (Ubuntu 26.04 dev machine; no webkit2gtk).
- Tested in Chromium 1248 (Playwright) as the available fallback browser.
- No WebKit-specific verification performed here; recorded as deferred to Step 2 (Trixie container).

## Leftovers for Step 1

- Tauri shell, file watch, packaging, edit-back, tabs, export remain out of scope.
- Broken PlantUML syntax currently renders PlantUML's own error SVG; Step 1 should add explicit error cards.
- Dark toggle re-renders diagrams; scroll preservation and content-hash caching deferred to Step 1.
- CSP uses `connect-src 'self' ws: wss:` for dev HMR; production preview verified with no remote fetch.
