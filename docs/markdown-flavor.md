# Glimpse Markdown Flavor

Glimpse is **not** a spec-complete implementation of either GitHub-Flavored Markdown (GFM) or Pandoc.
It is built on `markdown-it` with a set of plugins and custom rules. Treat this as an approximate
compatibility guide.

## Equivalent to
- GFM base: `markdown-it` defaults + GFM-ish plugins (tables, task lists, strikethrough, autolinks, footnotes-ish).
- Pandoc parity: partial (math delimiters, header attributes subset, definition lists).

## Feature table

| Feature | Syntax | GFM | Pandoc | Glimpse status | Notes |
|---|---|---|---|---|---|
| Headings | `# H1` … `###### H6` | yes | yes | yes | Slugger ids; `{#id}` overrides (pandoc subset) |
| Emphasis | `*italic*`, `**bold**` | yes | yes | yes | markdown-it |
| Strikethrough | `~~text~~` | yes | yes (extension) | yes | markdown-it |
| Links | `[text](url)`, autolinks | yes | yes | yes | title attrs; auto-shorten raw links; click router |
| Images | `![alt](url)` | yes | yes | yes | |
| Code inline | `` `code` `` | yes | yes | yes | |
| Code fences | ``` ```lang ``` | yes | yes | yes | highlight.js + diagram fences |
| Tables | GFM table syntax | yes | (extension) | yes | markdown-it |
| Task lists | `- [x] item` | yes | no | yes | markdown-it-task-lists |
| Autolinks | bare URLs | yes | no | yes | linkify; file: scheme enabled |
| Footnotes | `[^1]` / `[^1]: ...` | no | yes | yes | markdown-it-footnote |
| Definition lists | `term\n: def` | no | yes | yes | markdown-it-deflist |
| Math | `$...$`, `$$...$$` | no | `$...$`/`$$...$$` | yes | texmath/KaTeX; pandoc uses tex_math_dollars |
| Raw HTML | `<b>x</b>` | yes (sanitized subset) | yes | yes (sanitized subset) | `html:true` + DOMPurify strip-down ≈ GFM posture |
| Typographer | smart quotes | no | yes | partial | typographer:true (quotes/dashes) |
| Emoji shortcodes | `:smile:` | yes | no | **no (gap)** | not enabled |
| GitHub alerts | `> [!NOTE]` | yes | no | **no (gap)** | not implemented |
| CriticMarkup | `{++ ++}`, `{-- --}`, `{== ==}`, `{>> <<}`, `{~~ ~> ~~}` | no | no | yes (Glimpse) | review transforms |
| Transclusion | `[!path.md]` or `[path.md]` (single-bracket forms embed) | no | no | yes (Glimpse) | single bracket = embed (`!` optional, Obsidian-style); labeled `[text](path.md)` = link; renders as a block at the anchor, degrades to a link inside headings/tables/inline emphasis |
| Heading anchors | `{#id}` | no | yes | yes | pandoc subset |
| Diagrams | fenced mermaid/plantuml/etc. | no | no | yes (Glimpse) | rendered client-side |
| Frontmatter | `---` YAML | no | yes | stripped (not rendered) | gray-matter |
| Obsidian comments | `%% ... %%` | no | no | yes (Glimpse) | muted spans |

## Divergences summary
- Raw HTML: passes through but is DOMPurify-sanitized (≈ GFM's sanitized subset).
- Emoji shortcodes: GFM supports; Glimpse does not (gap).
- GitHub alerts: not supported.
- Math delimiters: Glimpse uses `$..$`/`$$..$$` (KaTeX); pandoc uses `tex_math_dollars` (similar).
- Typographer: smart quotes differ from pandoc's default.