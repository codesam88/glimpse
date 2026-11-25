# Review Step 1 — Source/preview split view

## Dependencies (exact pins)
- @codemirror/state 6.7.6
- @codemirror/view 6.43.15
- @codemirror/commands 6.11.1
- @codemirror/lang-markdown 6.5.2
- svelte-codemirror-editor 2.1.0 (chosen over codemirror-svelte 2.0.0, which targets Svelte 3; svelte-codemirror-editor v2 targets Svelte 5)

## Design
- CSS grid two panes (editor left, preview right), draggable divider, persisted `paneLeft`.
- CM6 editor in markdown mode, plain text; CriticMarkup bytes preserved (no transform).
- `data-source-line` injected by markdown-it core rule from `token.map[0]`; DOMPurify `ALLOW_DATA_ATTR: true`.
- Diagram placeholders carry `data-source-line`; code-hash cache in diagrams.js skips re-render of unchanged fences.
- Scroll sync both directions, rAF-throttled, syncing guard, mouseenter active-pane.
- Preview re-render debounced 350ms reusing `hashText` cache.
- Save via plugin-fs; self-write echo suppressed by `lastSavedHash` hash compare in watcher.
- Persisted: dark, zoom, diagramsEnabled, paneLeft.
- CSP: dropped `ws:`/`wss:` from `connect-src` (now `'self'` only). Dev HMR may need ws; not separable in shared conf, recorded here.

## Build
- `npm --prefix web run build`: exit 0, built ~3.0-3.2s. Index chunk 2.27 MB (was 1.63 MB); total dist 13 MB.
- `cargo check --manifest-path src-tauri/Cargo.toml`: exit 101 — host lacks glib-2.0/webkit sysdeps (`Package glib-2.0 was not found in the pkg-config search path`). Not a code failure.

## Behavior evidence
- Source-line injection verified: headings/paragraphs/fences/blockquotes emit `data-source-line`.
- Diagram code-hash cache verified by unit inspection; unchanged fences reuse cached innerHTML.
- Scroll sync, echo suppression, external-edit refresh require Tauri runtime (not available in this host) — logic implemented per design.

## Leftovers for Step 2
- Accept/reject CriticMarkup controls.
- %% compat, MRSF, WYSIWYG, vim mode, collab, export, tabs, packaging/CI.