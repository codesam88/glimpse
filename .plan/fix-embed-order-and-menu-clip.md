---
status: implemented
priority: p1
area: web
---

# Fix: transclusion ordering + clipped menu popovers

## 1. Problem / purpose

Two user-visible regressions in Glimpse main:

1. **Embedded markdown appears in the wrong place.** A `[!file.md]` /
   `[file.md]` include inside a paragraph, list item, blockquote or heading
   renders its content **after** the surrounding block instead of at the
   anchor. Trailing text is orphaned and includes inside lists escape the
   list entirely ("appended to the document").
2. **Toolbar menus open but are invisible.** Clicking File/View/Review opens
   the popover, but it is clipped by the toolbar and/or painted under the
   preview.

## 2. Root causes (verified, not assumed)

**Embed.** `includePlaceholderPlugin` (web/src/lib/markdown.js) pushes an
`html_inline` token whose content is a **block** element:
`<div class="include-placeholder" …></div>`. markdown-it cannot place a block
inside an inline run, so a mid-paragraph include renders
`<p>mid <div …></div> tail</p>`. HTML parsers then hoist the div out of the
`<p>`/`<h1>`/`<li>`, splitting the block and, inside lists/blockquotes,
lifting the include out of its container. Repro (jsdom, real parser):
`text [!inc.md] more` parses to `<p>text </p><div …></div> more<p></p>`.
Secondary defect: `data-include-line="undefined"` (inline state has no
`line`), which also degrades scroll anchoring.

**Menu.** `.toolbar` (web/src/App.svelte style block) has
`overflow: hidden; position: sticky; z-index: 50`. The popover in
`web/src/lib/Menu.svelte` is `position: absolute; top: calc(100% + 4px)`
inside a 32px trigger in a 44px toolbar, so it is clipped by the toolbar's
`overflow: hidden`; and because it lives inside the toolbar's stacking
context it can paint below the preview.

## 3. Strategy

**Embed:** keep the inline rule that *recognises* an include (it already
handles code spans, `[text](url)`, reference links and non-`.md` targets),
but move *placement* to a core rule on the parsed inline token stream:
`include_split`, registered `md.core.ruler.after('inline', …)`.

- The inline rule tags its `html_inline` token with `meta = { includePath,
  offset }` so the core rule can re-derive the line number.
- Walk `paragraph_open`/`inline`/`paragraph_close` triples:
  - no include token → unchanged;
  - whole content is a single include → paragraph becomes one
    `html_block` placeholder (current own-line behaviour preserved);
  - otherwise split `inline.children` at each include into
    `paragraph(before)`, `html_block(placeholder)`, `paragraph(after)` …
    preserving order for multiple includes. New paragraph tokens copy the
    original `map`, `attrs` and **`hidden`** flag, so tight-list items keep
    their tight rendering (`<li>text<div…></div>text</li>`), while
    blockquote/top-level paragraphs get real `<p>` wrappers.
- **Refuse to split inside an open inline construct** (strong/em/link/etc.):
  track `_open`/`_close` depth across `children`; if an include sits at
  depth > 0, degrade that one to an inline link. Otherwise a split would
  emit an unclosed `<strong>` and corrupt the DOM. Same policy — degrade to
  a link — for contexts that cannot hold a block: `heading_open`, `th_open`,
  `td_open`, `dt_open`.
- `data-include-line` = enclosing block `token.map[0]` + newline count in
  `inline.content.slice(0, meta.offset)`; never `"undefined"`.
- Non-embed mode (`setIncludeEmbedMode(false)`) and labeled links keep
  today's semantics (links).
- Delete `includeBlockPlugin` (single implementation, no double path).

Rejected: keeping the inline `<div>` and fixing at DOM level (invalid DOM
remains, anchoring and layout stay fragile); splitting raw text before
inline parsing (needs hand-rolled emphasis balance checks, duplicates parser
knowledge); using `transclude.js` text-splicing at runtime (duplicates
parser logic and cannot re-anchor).

**Menu:** render the popover with `position: fixed`, positioned from the
trigger's `getBoundingClientRect()` after `tick()`; clamp to the viewport
(shift horizontally, flip above when there is no room below), cap height
(`max-height`, internal scroll), and close on window scroll (capture) /
resize. Fixed positioning escapes the toolbar's `overflow: hidden` and its
stacking context. Keep existing aria/roles, Escape, outside-click and
keyboard behaviour. The `.debug-popover`/`.debug-menu` CSS in App.svelte is
dead (debug actions were folded into the File menu) — delete it instead of
porting it.

## 4. Steps

### Step 0 — Pin the regressions (tests first, expected RED)

- `web/src/lib/markdown.test.js`: laws for include placement — DOM order of
  `paragraph → placeholder → paragraph`, no block element inside `<p>`/`<h1>`,
  list include stays inside `<li>`, heading include degrades to link,
  `data-include-line` is numeric. Update the two existing tests that codify
  the buggy mid-paragraph shape.
- `e2e/verify.js`: click each menu trigger, assert popover is visible, fully
  inside the viewport and hit-testable (`elementFromPoint` on a menu item),
  and that selecting an item closes the popover.
- `e2e/verify.js`: mid-paragraph include fixture renders in source order.
- Done: unit laws fail on current main; e2e menu checks fail on current main.

### Step 1 — Implement the include split

- Rewrite the include rules per §3; keep public API
  (`setIncludeEmbedMode`, `getIncludeEmbedMode`) unchanged.
- Done: Step 0 unit laws GREEN; existing include/link/non-embed laws still
  GREEN; `npm test` and `npm run types` clean.

### Step 2 — Implement menu positioning

- `Menu.svelte`: fixed positioning + viewport clamp/flip + close on
  scroll/resize.
- Done: e2e menu checks GREEN; keyboard/Escape/outside-click unchanged.

### Step 3 — Contract + docs + gates

- `docs/markdown-flavor.md`: state that includes render as blocks at the
  anchor, degrade to links inside headings/tables, and that unsupported
  contexts never reorder content.
- Run full gates: `npm test`, `npm run lint`, `npm run check`, `npm run
  types`, `npm --prefix e2e test` against preview.
- Done: all green; e2e canonical check passes.

## 5. Out of scope

- Sidecar review formats, WYSIWYG, packaging, theme work.
- Visual redesign of menus; only positioning/stacking.
- Transclusion of non-markdown assets (images/csv) — unchanged.

## 6. Risks

- Splitting paragraphs around includes can unbalance inline emphasis
  (`**a [!x] b**`). Mitigation: only split when the delimiter/bracket counts
  on both sides are balanced; otherwise degrade to a link and document it.
- e2e coverage depends on a preview server on 127.0.0.1:4173 — parent runs it.
