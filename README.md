# Glimpse

Standalone offline markdown viewer (Tauri v2, Variant B).

## Dev environment (self-contained)

Prereqs: Node >= 20, Rust stable (app builds). System deps for Tauri Linux builds: libwebkit2gtk-4.1-dev, libgtk-3-dev, librsvg2-dev, patchelf.

```
npm --prefix web install        # frontend deps (Vite+Svelte, all renderers bundled)
npm --prefix web run dev        # dev server http://127.0.0.1:5173
npm --prefix web run build      # production build -> web/dist
npm --prefix e2e install        # e2e deps (playwright 1.64.1, browsers in ~/.cache/ms-playwright)
npm --prefix e2e test           # canonical verification against http://127.0.0.1:4173
cd src-tauri && cargo build     # desktop shell (needs system webkit libs)
```

E2E scratch/one-off scripts live in e2e/scratch/ (gitignored). Nothing in this repo resolves dependencies from outside the repo.
