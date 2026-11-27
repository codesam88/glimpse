# Changelog

All notable changes to Glimpse. Format based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning: semver.

## [Unreleased]

### Fixed

- **Transclusion ordering** — a `[!file.md]` / `[file.md]` include written
  mid-paragraph, inside a list item or inside a blockquote now renders its
  content as a block **at the anchor position**; previously the placeholder
  was hoisted out of the enclosing `<p>`/`<li>`, appending included content
  out of order and orphaning trailing text. Includes inside headings, table
  cells or inline emphasis (`**…**`) degrade to links instead of producing
  invalid DOM; `data-include-line` is always numeric (fixes anchoring inside
  includes).
- **Menu popovers** — File/View/Review dropdown menus were clipped by the
  toolbar (`overflow: hidden`) and painted under the preview. Popovers now
  use fixed positioning from the trigger rect, clamp/flip within the
  viewport, scroll internally when too tall, and close on scroll/resize.

## [0.1.0] — 2026-11-26

First release. Standalone offline markdown viewer for Linux — local files,
live refresh, diagram rendering with zero servers (no Java/Docker/network).

### Added

- **Viewer core** — Tauri v2 + Svelte; markdown-it pipeline (GFM tables,
  task lists, footnotes, definition lists, frontmatter stripping); bundled
  KaTeX (local fonts) + highlight.js; DOMPurify sanitization + strict CSP.
- **Diagrams, fully offline** — mermaid 12 (theme-variable palettes for all
  5 themes, SVG-text labels, sequence actor/note GitHub-flavored styling),
  PlantUML via @plantuml/core TeaVM-JS (no Java), Graphviz via @viz-js/viz,
  wavedrom, nomnoml; ditaa shown verbatim (deferred).
- **Per-diagram controls** — full-width toggle + fullscreen modal
  (viewBox-based scaling for all engines).
- **Review workflow** — CriticMarkup render + accept/reject; highlight /
  note / delete modes directly on rendered text (Ctrl+H / Ctrl+N / Ctrl+D);
  comments in a sidebar (Outline + Comments tabs) with author tags,
  edit/reply/delete per card, nested sub-comments, context menu.
- **Transclusion** — `[path.md](path.md)` inlines local files recursively
  (depth/cycle guards, per-file base dir + slug scoping, error blocks);
  included content is read-only in the parent view.
- **`{#id}` heading refs** — pandoc-style explicit heading anchors,
  GitHub-slug fallback, anchor links.
- **Link handling** — type-routed clicks (anchors, http/mailto → system
  opener, local docs open in-app, other files via system handler,
  `javascript:`/`data:` inert); tooltips with full URL; autolink display
  shortening.
- **Editing** — CodeMirror 6 split view (default off, Preview-first);
  click-point comment placement; autosave (2s/5s/10s) + auto-reload on
  external changes, both configurable via settings dialog; disk-conflict
  guard (Reload / Keep editing).
- **5 themes** — GitHub Light/Dark, VS Light/Dark (Dark+), Discord;
  chrome + code + diagram palettes; native `color-scheme` support.
- **Key bindings layer** — configurable (`window.setKeybinding`),
  persisted; Ctrl+wheel proportional zoom, Ctrl+P view, Ctrl+B sidebar,
  Alt+1/2 tabs, Ctrl+S save, Ctrl+O open.
- **Desktop integration** — single instance, `.md`/`.markdown` file
  association, CLI arg opening, `--debug` flag.

### Packaging / DevOps

- Debian Trixie `.deb` (floor) + Ubuntu 24.04 `.deb` (rolling/test) +
  Trixie AppImage (tags); GitHub Releases with per-distro filenames +
  `sha256sums.txt`; rolling releases `vX.Y.Z+head.<ref>` from main.
- CI: unit tests (property-based, fast-check: keymap/reviewTransforms/slug
  laws), ESLint + svelte-check, clippy + rustfmt, actionlint + shellcheck,
  cargo-deny + cargo audit + npm audit, license gate, CodeQL, Dependabot,
  offline-egress checks; all actions SHA-pinned.
- MIT license; SECURITY.md with threat model + accepted-risk ledger.
