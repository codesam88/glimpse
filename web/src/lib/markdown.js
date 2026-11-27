import MarkdownIt from 'markdown-it'
import taskLists from 'markdown-it-task-lists'
import footnote from 'markdown-it-footnote'
import deflist from 'markdown-it-deflist'
import texmath from 'markdown-it-texmath'
import markdownItCritic from 'markdown-it-critic'
import katex from 'katex'
import hljs from 'highlight.js'
import { slugify, Slugger } from './slug.js'

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

function shortenLinkLabel(href, text) {
  const h = String(href || '').trim()
  const t = String(text || '').trim()
  // only auto-shorten when display text equals the href (autolink case)
  const normalized = h.replace(/^[a-z][a-z0-9+.-]*:/i, '')
  if (t !== h && t !== normalized) return t
  if (/^https?:\/\//i.test(h)) {
    try {
      const u = new URL(h)
      let host = u.hostname
      if (u.port && u.port !== '80' && u.port !== '443') host += ':' + u.port
      return host || t
    } catch (e) { return t }
  }
  if (/^mailto:/i.test(h)) return h.replace(/^mailto:/i, '')
  // file:// or local path -> basename
  const pathPart = h.replace(/^file:\/\//i, '')
  const parts = pathPart.split(/[\\/]/)
  const base = parts[parts.length - 1]
  return base || t
}

function linkEnhancePlugin(md) {
  md.core.ruler.after('linkify', 'link_enhance', (state) => {
    const processChildren = (children) => {
      if (!children) return
      for (let i = 0; i < children.length; i++) {
        const t = children[i]
        if (t.type !== 'link_open') continue
        const href = t.attrGet('href') || ''
        try { t.attrSet('title', href) } catch (e) {}
        try { t.attrSet('data-href', href) } catch (e) {}
        if (t.info !== 'auto') continue
        let j = i + 1
        const textTokens = []
        let textContent = ''
        while (j < children.length && children[j].type !== 'link_close') {
          if (children[j].type === 'text') {
            textTokens.push(children[j])
            textContent += children[j].content
          }
          j++
        }
        const label = shortenLinkLabel(href, textContent)
        if (textTokens.length && label && label !== textContent) {
          textTokens[0].content = label
          for (let k = 1; k < textTokens.length; k++) textTokens[k].content = ''
        }
      }
    }
    for (const tok of state.tokens) {
      if (tok.type === 'inline' && tok.children) processChildren(tok.children)
    }
  })
}


let includeEmbedMode = true
export function setIncludeEmbedMode(v) {
  includeEmbedMode = !!v
}
export function getIncludeEmbedMode() {
  return includeEmbedMode
}

function includePlaceholderPlugin(md) {
  // Single-bracket include forms: [!foo.md] (bang) and [foo.md] (bare) both
  // embed; labeled [text](foo.md) and reference-style [foo][bar] stay links.
  md.inline.ruler.before('link', 'include_placeholder', (state, silent) => {
    const pos = state.pos
    if (state.src.charCodeAt(pos) !== 0x5B) return false
    let contentStart = pos + 1
    if (state.src.charCodeAt(contentStart) === 0x21) contentStart++ // optional !
    const end = state.src.indexOf(']', contentStart)
    if (end < 0) return false
    // full links [text](url) belong to the link rule
    if (state.src.charCodeAt(end + 1) === 0x28) return false
    // reference-style [foo][bar] stays a reference link
    if (state.src.charCodeAt(end + 1) === 0x5B) return false
    const content = state.src.slice(contentStart, end).trim()
    if (!content) return false
    const ext = (content.split('.').pop() || '').toLowerCase()
    if (!['md', 'markdown', 'mmd'].includes(ext)) return false
    if (silent) return true
    if (!includeEmbedMode) {
      const esc = content.replace(/"/g, '&quot;')
      const token = state.push('html_inline', '', 0)
      token.content = '<a href="' + esc + '" data-href="' + esc + '">' + content + '</a>'
      state.pos = end + 1
      return true
    }
    const token = state.push('html_inline', '', 0)
    token.content = '<div class="include-placeholder" data-include-path="' + content.replace(/"/g, '&quot;') + '" data-include-line="' + state.line + '"></div>'
    state.pos = end + 1
    return true
  })
}

function includeBlockPlugin(md) {
  md.core.ruler.after('inline', 'include_block', (state) => {
    const tokens = state.tokens
    let i = 0
    while (i < tokens.length) {
      const tok = tokens[i]
      if (tok.type !== 'paragraph_open') { i++; continue }
      const inline = tokens[i + 1]
      const close = tokens[i + 2]
      if (!inline || inline.type !== 'inline' || !close || close.type !== 'paragraph_close') { i++; continue }
      const children = inline.children || []
      if (children.length !== 1 || children[0].type !== 'html_inline' || !String(children[0].content).includes('include-placeholder')) { i++; continue }
      const line = (tok.map && tok.map[0] != null) ? tok.map[0] : (inline.content ? 0 : 0)
      const html = children[0].content.replace(/data-include-line="[^"]*"/, 'data-include-line="' + line + '"')
      // convert paragraph to html_block
      tok.type = 'html_block'
      tok.tag = ''
      tok.content = html + '\n'
      tok.children = []
      // remove inline + close
      tokens.splice(i + 1, 2)
      i++
    }
  })
}

function headingIdPlugin(md) {
  md.core.ruler.after('source_line', 'heading_ids', (state) => {
    const slugger = new Slugger()
    for (let i = 0; i < state.tokens.length; i++) {
      const token = state.tokens[i]
      if (token.type !== 'heading_open') continue
      const inline = state.tokens[i + 1]
      let text = (inline && inline.type === 'inline') ? inline.content : ''
      const m = text.match(/\s*\{#([^}]+)\}\s*$/)
      let base = text
      if (m) {
        base = m[1].trim()
        const stripped = text.replace(/\s*\{#[^}]+\}\s*$/, '')
        if (inline) {
          inline.content = stripped
          if (inline.children && inline.children.length) {
            const last = inline.children[inline.children.length - 1]
            if (last && last.type === 'text') last.content = last.content.replace(/\s*\{#[^}]+\}\s*$/, '')
          }
        }
      } else {
        base = slugify(text)
      }
      try { token.attrSet('id', slugger.slug(base)) } catch (e) {}
    }
  })
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
  try {
    md.linkify.add('file:', {
      validate: (text, pos, _self) => {
        if (!text.slice(pos).startsWith('///')) return 0
        const m = text.slice(pos).match(/^\/\/\/\S+/)
        return m ? m[0].length : 0
      },
      normalize: (match, self) => self.normalize(match)
    })
    // file schema added
  } catch (e) { console.log('file schema add failed', e) }
  // allow file: links to render (default markdown-it blocks file: protocol)
  const _origValidate = md.validateLink.bind(md)
  md.validateLink = (url) => {
    const str = String(url || '').trim().toLowerCase()
    if (str.startsWith('file:')) return true
    return _origValidate(url)
  }
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
  md.use(headingIdPlugin)
  includePlaceholderPlugin(md)
  includeBlockPlugin(md)
  linkEnhancePlugin(md)
  md.use(diagramPlugin)

  return md
}
