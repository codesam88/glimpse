import MarkdownIt from 'markdown-it'
import taskLists from 'markdown-it-task-lists'
import footnote from 'markdown-it-footnote'
import deflist from 'markdown-it-deflist'
import texmath from 'markdown-it-texmath'
import markdownItCritic from 'markdown-it-critic'
import katex from 'katex'
import hljs from 'highlight.js'

import 'katex/dist/katex.min.css'

const DIAGRAM_LANGS = new Set([
  'mermaid', 'plantuml', 'puml', 'dot', 'graphviz', 'wavedrom', 'nomnoml', 'ditaa'
])

function sourceLinePlugin(md) {
  md.core.ruler.after('inline', 'source_line', (state) => {
    for (const token of state.tokens) {
      if (!token.map) continue
      const t = token.type
      if (t === 'paragraph_open' || t === 'heading_open' || t === 'fence' || t === 'code_block' ||
          t === 'blockquote_open' || t === 'list_item_open' || t === 'hr' || t === 'table_open' ||
          t === 'html_block' || t === 'dl_open' || t === 'dt_open' || t === 'dd_open') {
        try { token.attrSet('data-source-line', String(token.map[0])) } catch (e) {}
      }
    }
  })
}

function diagramPlugin(md) {
  const defaultFence = md.renderer.rules.fence
  md.renderer.rules.fence = (tokens, idx, options, env, self) => {
    const token = tokens[idx]
    const lang = (token.info || '').trim().split(/\s+/)[0].toLowerCase()
    if (DIAGRAM_LANGS.has(lang)) {
      const code = token.content
      const id = 'diag-' + Math.random().toString(36).slice(2)
      const b64 = btoa(unescape(encodeURIComponent(code)))
      const sl = token.attrGet('data-source-line')
      const slAttr = sl != null ? ' data-source-line="' + sl + '"' : ''
      return '<div class="diagram-placeholder" data-diagram="' + lang + '" data-code="' + b64 + '" data-id="' + id + '"' + slAttr + '></div>\n'
    }
    return defaultFence ? defaultFence(tokens, idx, options, env, self) : self.renderToken(tokens, idx, options)
  }
}

export function createMarkdown() {
  const md = new MarkdownIt({
    html: true,
    linkify: true,
    typographer: true,
    highlight(str, lang) {
      if (lang && hljs.getLanguage(lang)) {
        try {
          return hljs.highlight(str, { language: lang }).value
        } catch (e) {
          // fall through
        }
      }
      return md.utils.escapeHtml(str)
    }
  })

  md.use(taskLists, { enabled: true, label: true, labelAfter: true })
  md.use(footnote)
  md.use(deflist)
  md.use(texmath, { engine: katex, delimiters: 'dollars' })
  md.use(markdownItCritic)
  // markdown-it-critic's inline rules return true in `silent` mode without
  // advancing state.pos, which crashes markdown-it when validating inside
  // link labels/emphasis. Wrap the registered critic rules so silent mode
  // still consumes input. (See docs/review-step0.md / Step 0.)
  const criticMarkers = {
    critic_addition: { open: '{++', close: '++}' },
    critic_deletion: { open: '{--', close: '--}' },
    critic_highlight: { open: '{==', close: '==}' },
    critic_comment: { open: '{>>', close: '<<}' },
  }
  for (const rule of md.inline.ruler.__rules__) {
    const m = criticMarkers[rule.name]
    if (!m) continue
    const orig = rule.fn
    rule.fn = (state, silent) => {
      const start = state.pos
      if (!state.src.startsWith(m.open, start)) return orig(state, silent)
      if (rule.name === 'critic_substitution') return orig(state, silent)
      const closeIndex = state.src.indexOf(m.close, start + m.open.length)
      if (closeIndex === -1) return false
      if (silent) {
        state.pos = closeIndex + m.close.length
        return true
      }
      return orig(state, silent)
    }
  }
  // substitution: handle silent pos advancement separately
  const subRule = md.inline.ruler.__rules__.find((r) => r.name === 'critic_substitution')
  if (subRule) {
    const orig = subRule.fn
    subRule.fn = (state, silent) => {
      const start = state.pos
      if (!state.src.startsWith('{~~', start)) return orig(state, silent)
      const midIndex = state.src.indexOf('~>', start + 3)
      if (midIndex === -1) return false
      const closeIndex = state.src.indexOf('~~}', midIndex + 2)
      if (closeIndex === -1) return false
      if (silent) {
        state.pos = closeIndex + 3
        return true
      }
      return orig(state, silent)
    }
  }
  // Obsidian %% comments: render as muted spans (inline %%...%% and block %%%%...%%%%).
  const obsidianCommentMarkers = [
    { open: '%%%%', close: '%%%%', block: true },
    { open: '%%', close: '%%', block: false },
  ]
  md.inline.ruler.push('obsidian_comment', (state, silent) => {
    const start = state.pos
    let marker = null
    for (const m of obsidianCommentMarkers) {
      if (state.src.startsWith(m.open, start)) { marker = m; break }
    }
    if (!marker) return false
    const closeIndex = state.src.indexOf(marker.close, start + marker.open.length)
    if (closeIndex === -1) return false
    if (silent) { state.pos = closeIndex + marker.close.length; return true }
    const inner = state.src.slice(start + marker.open.length, closeIndex)
    const cls = marker.block
      ? 'obsidian-comment obsidian-comment-block'
      : 'obsidian-comment'
    const tag = 'span'
    const token = state.push('html_inline', '', 0)
    token.content = '<' + tag + ' class="' + cls + '">' + md.utils.escapeHtml(inner) + '</' + tag + '>'
    state.pos = closeIndex + marker.close.length
    return true
  })

  md.use(sourceLinePlugin)
  md.use(diagramPlugin)

  return md
}
