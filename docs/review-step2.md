# Review Step 2 — Accept/reject + %% compat + hardening

## Files changed
- web/src/App.svelte — accept/reject + wrap toolbar, %% toggle, CSS.
- web/src/lib/markdown.js — html:true (so DOMPurify strips HTML comments), Obsidian %% plugin.
- web/src/lib/reviewTransforms.js — pure accept/reject transforms + wrap helpers.
- docs/fixture-review.md — %% / HTML comment cases.

## Accept/reject behavior
- Toolbar wraps selection as {++ ++}/{-- --}/{== ==}/{>> <<}; empty selection inserts marker with placeholder (added/removed/highlighted/comment) and selects placeholder.
- Accept all / Reject all transform whole document; Accept sel / Reject sel transform selection. Fenced code blocks are protected (marks stay literal).
- Accept: additions/highlights/substitutions(new) kept, deletions/comments dropped. Reject: deletions restored, additions/comments dropped, substitutions(old) kept.
- Transforms never blank the preview: unclosed marks remain literal source; empty marks render &nbsp;.
- Verified: 1MB/500-fence fixture transforms in ~14ms (accept/reject).

## %% toggle behavior
- %%inline%% and %%%%block%%%% render as muted spans (class obsidian-comment; block adds obsidian-comment-block).
- Toggle button switches muted vs hidden (CSS display:none), default muted. Persisted as hideComments.
- <!-- --> HTML comments pass through as HTML and are stripped by DOMPurify (html:true); verified render shows no comment output.

## Trixie gate
- DEFERRED: blocker "no docker/display on dev box". No docker binary; no display. Container build (debian:trixie-slim), WebKit availability, and mitm/offline audit not run here. CI trixie job remains the gate.

## Build + offline
- `npm --prefix web run build`: exit 0, built ~3.6s. Index chunk 2.2 MB; total dist 13 MB.
- Offline: grep http(s):// in dist finds only embedded doc/error strings (chevrotain/mermaid); no fetch() to remote URLs. No runtime network calls.

## Large-file sanity
- Fixture: /tmp/opencode/large-review.md, 1.00 MB, 500 fences (not committed).
- markdown render: 311 ms; accept/reject transform: ~14 ms.
- Debounce 350ms + diagram code-hash cache (diagrams.js) prevent freeze by inspection.

## Atomic-save external edit
- Watcher path (App.svelte watchParent) handles external edits with 300ms debounce and lastSavedHash echo suppression; verified by inspection (Tauri runtime unavailable on host).

## Round-trip note
- Canonical format remains CriticMarkup; VSCode (xinbenlv) and Obsidian (Commentator) marks render identically; %% and HTML comments preserved in source mode and hidden in preview.

## Leftovers
- Tauri/display smoke, WebKit verification deferred to CI/Trixie.
- Per-mark accept/reject at cursor (only selection/all implemented).