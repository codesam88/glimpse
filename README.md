# Glimpse

Glimpse is a desktop markdown viewer for Linux. Open any local `.md` file and
read it fully rendered — typography, math, code highlighting, and diagrams —
with **no network, no servers, no Java, no Docker**. Every diagram engine runs
inside the app. When you (or your editor) change the file on disk, the view
refreshes in under a second.

Glimpse is also a lightweight **review surface**: highlight, strike through,
insert, and comment directly on the rendered text (CriticMarkup), manage
comments in a sidebar, and navigate documents through links, includes, and an
outline.

## Features

- **Fully offline rendering** — [mermaid](https://mermaid.js.org) (flowcharts,
  sequence, gantt, mindmaps…), PlantUML via a JavaScript build (no Java),
  Graphviz (WASM), wavedrom, nomnoml. Math via bundled KaTeX; code via
  highlight.js. See [docs/markdown-flavor.md](docs/markdown-flavor.md) for the
  exact markdown flavor and supported syntax.
- **Live view** — file watching with debounced refresh; scroll position
  preserved; included files are watched too.
- **Review on the rendered view** — highlight (`Ctrl+H`), note (`Ctrl+N`),
  strike (`Ctrl+D`); comments live in a sidebar (with outline tab) supporting
  author tags, replies, edit/delete, and accept/reject with undo/redo.
- **Transclusion** — embed other local documents with `[!path/to/file.md]`
  (or `[path/to/file.md]`); recursive up to 5 levels with cycle detection;
  included content is read-only in the parent view.
- **Navigation** — link routing (anchors, local docs, system handlers for
  everything else), back/forward history, heading anchors via `{#id}`.
- **Split view** — optional CodeMirror editor beside the preview; autosave,
  auto-reload, and conflict protection, all configurable in Settings.
- **5 themes** — GitHub Light/Dark, VS Light/Dark+, Discord; diagram palettes
  matched per theme.
- **Configurable keybindings** — `window.setKeybinding()`; sensible defaults
  everywhere (shortcuts shown in the menus).

## Install

Grab a bundle from [Releases](https://github.com/codesam88/glimpse/releases):

| File | For |
|---|---|
| `glimpse-vX.Y.Z-trixie_amd64.deb` | Debian 13 / Trixie (supported floor) |
| `glimpse-vX.Y.Z-ubuntu24.04_amd64.deb` | Ubuntu 24.04+ |
| `glimpse-vX.Y.Z-trixie_amd64.AppImage` | any recent amd64 Linux (FUSE or `--appimage-extract-and-run`) |

`sha256sums.txt` covers every artifact. A rolling (pre-release) build from
the current main branch is published as the `rolling` release.

## Development

Self-contained: nothing resolves dependencies outside this repo.

```
npm --prefix web install     # frontend deps
npm --prefix web run dev     # dev server http://127.0.0.1:5173
npm --prefix web run build   # production build -> web/dist
npm --prefix web test        # unit + property tests (vitest + fast-check)
npm --prefix web run lint    # eslint
npm --prefix web run check   # svelte-check (0 errors required)
npm --prefix web run types   # tsc on the pure modules (JSDoc-typed)
npm --prefix e2e install     # playwright
npm --prefix e2e test        # canonical e2e (needs preview server on :4173)
cd src-tauri && cargo build  # desktop shell (system webkit libs needed)
```

See [AGENTS.md](AGENTS.md) for the development workflows, quality gates, and
conventions.

## Credits

Built on: [Tauri](https://tauri.app), [Svelte](https://svelte.dev) +
[Vite](https://vite.dev), [markdown-it](https://github.com/markdown-it/markdown-it),
[KaTeX](https://katex.org), [highlight.js](https://highlightjs.org),
[CodeMirror 6](https://codemirror.net), [DOMPurify](https://github.com/cure53/DOMPurify).

Icons: [Material Design Icons](https://github.com/Templarian/MaterialDesign) (Apache-2.0).

Diagrams, all rendered locally: [mermaid](https://mermaid.js.org),
[@plantuml/core](https://github.com/plantuml/plantuml) (PlantUML → JS, no
Java/server), [@viz-js/viz](https://github.com/mdaines/viz-js) (Graphviz),
[wavedrom](https://wavedrom.com), [nomnoml](https://nomnoml.com).

Design inspiration: [Markdown Preview Enhanced](https://github.com/shd101wyy/markdown-preview-enhanced),
[Kroki](https://kroki.io). Glimpse is [MIT](LICENSE); all bundled
dependencies are permissive or dual-licensed.
