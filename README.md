# Glimpse

Standalone offline markdown viewer (Tauri v2, Variant B).

## Credits

Built on: [Tauri](https://tauri.app), [Svelte](https://svelte.dev) +
[Vite](https://vite.dev), [markdown-it](https://github.com/markdown-it/markdown-it),
[KaTeX](https://katex.org), [highlight.js](https://highlightjs.org),
[CodeMirror 6](https://codemirror.net), [DOMPurify](https://github.com/cure53/DOMPurify).

Diagrams, all rendered locally: [mermaid](https://mermaid.js.org),
[@plantuml/core](https://github.com/plantuml/plantuml) (PlantUML → JS, no
Java/server), [@viz-js/viz](https://github.com/mdaines/viz-js) (Graphviz),
[wavedrom](https://wavedrom.com), [nomnoml](https://nomnoml.com).

Design inspiration: [Markdown Preview Enhanced](https://github.com/shd101wyy/markdown-preview-enhanced),
[Kroki](https://kroki.io). All deps permissive-licensed (enforced by CI).



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
