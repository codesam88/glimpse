# Glimpse

Standalone offline markdown viewer (Tauri v2, Variant B).

## Credits

Glimpse is a thin shell around excellent open-source work. Major dependencies
this project is based on:

**Core**

- [Tauri](https://tauri.app) — desktop shell (system webview, Rust backend)
- [Svelte](https://svelte.dev) + [Vite](https://vite.dev) — frontend
- [markdown-it](https://github.com/markdown-it/markdown-it) — markdown parsing
  (plus [markdown-it-footnote](https://github.com/markdown-it/markdown-it-footnote),
  [markdown-it-deflist](https://github.com/rlidwka/markdown-it-deflist),
  [markdown-it-task-lists](https://github.com/leesei/markdown-it-task-lists),
  [markdown-it-texmath](https://github.com/goessner/markdown-it-texmath))

**Diagrams (all rendered locally, offline)**

- [mermaid](https://mermaid.js.org) — flowcharts, sequence, gantt, and friends
- [@plantuml/core](https://github.com/plantuml/plantuml) — PlantUML compiled
  to JavaScript via TeaVM; no Java, no server
- [@viz-js/viz](https://github.com/mdaines/viz-js) — Graphviz as WASM
- [wavedrom](https://wavedrom.com) — timing diagrams
- [nomnoml](https://nomnoml.com) — UML-ish sketches

**Text & math**

- [KaTeX](https://katex.org) — math rendering (fonts bundled)
- [highlight.js](https://highlightjs.org) — code highlighting
- [CodeMirror 6](https://codemirror.net) (+ [svelte-codemirror-editor](https://github.com/sj82549/svelte-codemirror-editor)) — split-view editor
- [DOMPurify](https://github.com/cure53/DOMPurify) — sanitization of everything
  the renderers emit
- [gray-matter](https://github.com/jonschlinkert/gray-matter) — frontmatter

**Tooling**

- [Playwright](https://playwright.dev) — e2e verification (`e2e/verify.js`)

Design inspiration: [Markdown Preview Enhanced](https://github.com/shd101wyy/markdown-preview-enhanced)
(the diagram-in-markdown UX Glimpse aims to replicate standalone) and
[Kroki](https://kroki.io) (the "many diagram languages behind one fence"
idea — Glimpse does the same, fully offline).

All bundled dependencies are permissive-licensed (see the CI license gate);
license notes ship with each package.


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
