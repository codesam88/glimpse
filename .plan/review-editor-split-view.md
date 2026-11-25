---
status: open
priority: p1
area: review-editor
---

# Review + split-view editor (CriticMarkup + CodeMirror 6)

## 1. Problem / purpose

Glimpse is a viewer today: markdown-it preview with offline diagrams and
file-watch refresh, but no way to review or edit. Users want Google-Docs-
style review (inline comments, suggestions) plus a simple source editor in
split view with synced scrolling, without losing offline-only operation,
Trixie-first packaging, or round-trip compatibility with VSCode and
Obsidian.

## 2. Solution strategy

Chosen: CriticMarkup as canonical inline review format rendered with
`markdown-it-critic` (MIT, 12kB), plus CodeMirror 6 source-mode editor
(left) driving the existing markdown-it preview (right) with Joplin-style
scrollmap sync. Source-mode preserves CriticMarkup/`%%`/HTML comments
byte-for-byte; preview pipeline (DOMPurify + lazy diagrams + KaTeX + hljs)
is reused unchanged.

Rejected alternatives and decisive drawback:

- A. TipTap/Milkdown WYSIWYG. Drawback: normalizes markdown (not
  byte-stable), drops/HTML-comments crash round-trip, comments extension
  paid (TipTap Pro), heavier bundle + untested WebKitGTK behavior.
  Verified via editor survey Nov 2026.
- B. `obsidian-comments-manager` `%%` as canonical. Drawback: Obsidian-
  specific (`%%` renders literally elsewhere; `<!-- -->` variant is
  stripped by DOMPurify). Kept as secondary detect-and-hide compat only.
- C. MRSF/Sidemark sidecar review. Drawback: second-file model +
  re-anchoring engine; right post-V1 enhancement, too much scope now.
- D. Monaco/Plate-Lexical. Drawback: 15MB + workers (Monaco) or
  React-first WYSIWYG normalization; overkill for "simple text editor".

## 3. Implementation steps

### Step 0 — CriticMarkup render (no editing)

Scope: add `markdown-it-critic` to `web/`, render `{++ ++}`, `{-- --}`,
`{~~ ~> ~~}`, `{== ==}`, `{>> <<}` to `<del>/<ins>/<mark>/span.critic`,
style via CSS (screen + print show/hide), keep DOMPurify profile passing
(output tags verified). Fixture additions in `docs/fixture-review.md`.
Done: `npm --prefix web run build` GREEN, offline check 0 remote,
fixture renders all five marks, print CSS hides/shows changes.
Leaves out: editor, accept/reject buttons, `%%` compat.

### Step 1 — CodeMirror 6 split view + sync scroll + save

Scope: `svelte-codemirror-editor` (CM6 markdown mode), CSS grid panes,
`data-source-line` injection from `token.map[0]` (+ DOMPurify
`ALLOW_DATA_ATTR`), Joplin-style scrollmap both directions (rAF
throttle, `syncing` guard, active-pane tracking), 300-400ms debounced
re-render reusing `hashText` cache + lazy diagrams (+ IntersectionObserver
+ code-hash diagram cache for 500-fence files), save via plugin-fs with
self-write echo suppression (dirty-flag/mtime: ignore own watch event),
store prefs (dark/zoom/diagrams/pane sizes). CSP: drop `ws:/wss:` prod.
Done: type-to-preview <400ms, scroll sync both ways without echo,
external edit still refreshes <1s, own save causes exactly one refresh,
1MB stress file types without freeze. Leaves out: accept/reject,
`%%` compat, export, tabs, vim mode, collab.

### Step 2 — Accept/reject + `%%` compat + hardening

Scope: accept/reject UI (selection → wrap `{++ ++}`/`{-- --}`/`{>> <<}`,
buttons to apply/strip marks with byte-safe transforms), `%%`/`<!-- -->`
detect-and-render-or-hide toggle, error cards for broken marks, large-file
and atomic-save regression tests, CSP/mitm offline audit on Trixie
container. Done: round-trip test (VSCode xinbenlv file ↔ Glimpse ↔
Obsidian Commentator) preserves marks; audit clean.
Leaves out: MRSF sidecar, WYSIWYG, collab cursors, PNG/PDF export.

Test matrix (Step 2 gate):

- Marks: all five CriticMarkup forms, nested/edge braces, marks inside
  fences (must NOT parse), marks near KaTeX (must not break math).
- Compat: file authored in VSCode (xinbenlv) and Obsidian (Commentator)
  renders identically in Glimpse and vice versa.
- Editor: split scroll both directions, 1MB/500-fence typing, atomic-save
  external edit, own-save single refresh, rename-away + recreate.
- OS: clean Trixie container/VM, X11 + Wayland, `ldd` clean, no egress.

## 4. Open decisions

1. Accept/reject as inline buttons vs toolbar actions — default toolbar +
   selection context in Step 2.
2. `%%` handling: hidden vs muted-span — default muted-span with toggle,
   decided in Step 2 after compat test.

## 5. Risks

- CM6 + Svelte 5 runes binding churn. Mitigation: pin `svelte-codemirror-
  editor` v2, wrap in thin adapter.
- Scrollmap drift on heavy-diagram docs (async SVG heights shift targets).
  Mitigation: re-anchor after `renderDiagrams`, rAF settle pass.
- Watch echo on own save (double refresh / cursor jump). Mitigation:
  dirty-flag + mtime/hash suppression, regression test.
- SVG XSS via comment spans. Mitigation: DOMPurify after every render +
  `npm/cargo audit` in CI (existing).

## 6. Linked artifacts

- Base plan: `.plan/variant-b-offline-viewer.md` (Steps 0-1 done on main).
- Comment survey: CriticMarkup (`markdown-it-critic` MIT 12kB), xinbenlv
  VSCode ext, Fevol Commentator / Review Critic / Review Comments
  (Obsidian), MRSF/Sidemark deferred.
- Editor survey: CodeMirror 6 (`@codemirror/*` MIT ~482kB tarball,
  ~150-200kB gzip) + `svelte-codemirror-editor` v2; TipTap/Milkdown/
  Monaco rejected per §2.
