---
status: open
priority: p1
area: viewer
---

# Variant B — Standalone offline markdown viewer (Tauri v2, no servers)

## 1. Problem / purpose

Linux needs a viewer for local markdown files that refreshes on edit and
renders mermaid + plantuml + ditaa and similar without network, Java,
Docker, or editor lock-in. Existing lightweight viewers are mermaid-only;
full diagram coverage today requires a PlantUML server or Kroki (network)
or Markdown Preview Enhanced inside VS Code. A skeptic accepts this is
missing because `mdserve` (Rust) was archived Sep 2026, MarkText/Typora
are mermaid-only or server-dependent, and `crossnote serve` still needs
Node + servers for PlantUML/ditaa. This task builds a true standalone
offline viewer: `viewer file.md`, open <2s, refresh <1s with scroll kept,
zero egress.

## 2. Solution strategy

Chosen: Tauri v2 desktop app, Vite + Svelte frontend, all rendering in
the system WebView (WebKitGTK on Linux). Markdown via `markdown-it`,
math via bundled KaTeX + local fonts, code via highlight.js, diagrams
via vendored JS/WASM: `mermaid` (tiny default, full on demand),
`@plantuml/core` TeaVM JS path, `@viz-js/viz` for dot, `wavedrom`,
`nomnoml`, `svgbob-wasm` for ascii. Sanitization via DOMPurify + strict
CSP after every render. Rust shell stays minimal: CLI arg, single-instance,
parent-dir file watch, dialog/opener/store plugins, `.deb` + AppImage
built on Ubuntu 22.04.

Rejected alternatives and decisive drawback:

- A. `crossnote serve` sidecar in Tauri (keeps full MPE fidelity incl.
  Kroki/ditaa). Drawback: ~70-90 MB Node sidecar, localhost HTTP server
  with write-back, process-lifecycle burden; erases Tauri size advantage.
  Verified via crossnote 0.9.44 research Nov 2026.
- B. VSCodium + Markdown Preview Enhanced. Drawback: editor host, not a
  standalone viewer; PlantUML still needs Java/server.
- C. MkDocs + mkdocs-kroki-plugin / docsify-kroki / markdown-proxy.
  Drawback: project-based or server-based, needs network or PlantUML
  server; not single-file offline viewer.
- D. Reimplement with `marked` + CDN mermaid. Drawback: needs network,
  no offline guarantee, thinner fence-hook ecosystem than markdown-it.
- E. Ship Java PlantUML jar / local Kroki / Docker. Drawback: violates
  no-server, no-Java constraint that defines Variant B.

Verified blockers recorded so future readers need not re-prove:

- Native Java-ditaa pixel parity in JS is unavailable; no maintained
  canonical ditaa-JS port found Nov 2026. Hence `ditaa` fence is
  best-effort via svgbob + verbatim fallback, explicitly labeled.
- `@plantuml/core` MIT build excludes AWS/Material/tupadr3 sprites,
  Sudoku diagram, `!include` multi-file, multi-page export. Verified
  from package contents Nov 2026.
- mermaid v12 targets ES2024 / Safari 17.4+ / Chromium 121+. Ubuntu 22.04
  WebKitGTK (~2.38-2.42) may fail; fallback is pin mermaid v11 or
  tiny-only. Must be decided by Phase 0 spike on real 22.04 WebKit,
  not assumed.

## 3. Implementation steps

### Step 0 — Vite-web prototype (no Tauri)

Scope: plain Vite + Svelte page, `markdown-it` + GFM/task-lists/footnote/
deflist + `gray-matter` frontmatter strip + DOMPurify + KaTeX bundled +
highlight.js + lazy `mermaid-tiny`, `@plantuml/core` JS path,
`@viz-js/viz`, `wavedrom`, `nomnoml`, `svgbob-wasm`. Fixture `.md`
covering flow/sequence/class/ER/state/gantt/mindmap, plantuml
sequence/class/activity/component/state, dot, wavedrom, nomnoml, ascii,
KaTeX inline/block, hljs python/rust/bash, broken-syntax cases.
Done: fixture renders with Wi-Fi off in Chrome; bundle-size report
recorded; mermaid v12 vs v11 decision locked after 22.04 WebKit smoke
(Epiphany or `tauri dev`); no fetch leaves app (devtools offline check).
Leaves out: Tauri, watch, packaging.

### Step 1 — Tauri single-file viewer + watch

Scope: `src-tauri` minimal — CLI arg `.md`, single-instance plugin first,
`dialog`/`opener`/`store` plugins, `plugin-fs` read + `watch(parentDir,
delayMs 500)` + basename filter + 300 ms debounce, scroll-preserving
re-render, renderer cache by content hash, error cards (never blank),
`.desktop` association `text/markdown`, dark/light + zoom + diagram
toggles. Capabilities least-privilege in `capabilities/default.json`.
Done: `viewer a.md` opens <2s; edit+save in VS Code/vim (incl.
atomic-save) refreshes <1s scroll kept; kill-network renders all;
second `viewer b.md` reuses window; 1 MB / 500-fence stress file uses
placeholders + worker, no freeze. Leaves out: packaging, export,
edit-back, tabs, global search.

### Step 2 — Packaging + diagram parity hardening

Scope: Ubuntu 22.04 container/GH `ubuntu-22.04` builds, `.deb`
(depends `libwebkit2gtk-4.1-0`, `libgtk-3-0`) + AppImage, `ldd`/lintian
clean, PlantUML subset corpus + mermaid sample matrix, large-file +
error-path tests, CSP/mitm offline audit, README unsupported-languages
doc, `npm audit` + `cargo audit` in CI.
Done: test matrix below green on clean 22.04 + 24.04 VMs (X11 + Wayland);
no egress in tcpdump run; installs verified. Leaves out: PNG/PDF export,
print CSS, relative-link navigation (Phase 3).

Test matrix (Step 2 gate):

- OS: clean Ubuntu 22.04 (WebKit ~2.42) + 24.04 (WebKit ~2.46), X11 + Wayland.
- Mermaid: flow, sequence, class, ER, state, gantt, mindmap (full-only),
  100-node stress.
- PlantUML: sequence, class, activity (new syntax), component, state,
  dark-mode toggle, broken-syntax error card.
- Other: dot, wavedrom, nomnoml, svgbob-ascii, KaTeX inline/block,
  hljs python/rust/bash.
- File ops: open via arg, Open-With, second-instance switch, external
  edit (vim/VS Code atomic-save), rename-away + recreate, 5 MB log-like
  md, relative image path.

## 4. Open decisions (interview before Phase 1)

1. Svelte (recommended, smallest bundle/RAM) vs React — default Svelte
   unless team objects. Cost of React: larger bundle, same WebKit risk.
2. Ubuntu 22.04 as glibc/WebKit floor — default yes. Cost of 24.04-only:
   breaks 22.04 LTS users with `GLIBC_X.XX not found`.
3. `ditaa` fence handling — default best-effort svgbob substitution with
   explicit label + verbatim fallback. Alternative: verbatim-only, zero
   fidelity risk but less useful.
4. `.deb`-only vs `.deb` + AppImage in V1 — default both; AppImage adds
   ~70 MB but portable.

## 5. Risks

- mermaid v12 on old WebKitGTK (highest). Mitigation: Phase 0 spike,
  fallback v11/tiny-only.
- Double-Graphviz weight (`viz-global.js` + `@viz-js/viz`). Mitigation:
  isolate globals, lazy-load, measure.
- SVG XSS surface. Mitigation: DOMPurify after every render + CSP,
  audits in CI.
- EPL (Graphviz) + MIT mixing in redistributed binary. Mitigation:
  license check before publishing `.deb`.
- inotify `max_user_watches` on large trees. Mitigation: non-recursive
  parent-dir watch, document sysctl fix.

## 6. Linked artifacts

- Engine research: crossnote 0.9.44 (`https://github.com/shd101wyy/crossnote`),
  MPE diagrams (`https://github.com/shd101wyy/markdown-preview-enhanced/blob/master/docs/diagrams.md`),
  Tauri sidecar/file-watch/packaging docs (`https://tauri.app/learn/sidecar-nodejs`,
  `https://tauri.app/plugin/file-system`, `https://tauri.app/distribute/debian/`),
  precedents MDHero (`https://mdhero.app/blogs/building-native-viewer-8mb`),
  MarkView (`https://github.com/scos-lab/markview`).
- Briefs to accumulate under `docs/briefs/` as tools are digested:
  `tauri-v2-sidecar-watch-packaging.md`, `mermaid-webview-compat.md`,
  `plantuml-core-js.md`.
