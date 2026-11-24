import MarkdownIt from 'markdown-it'
import taskLists from 'markdown-it-task-lists'
import footnote from 'markdown-it-footnote'
import deflist from 'markdown-it-deflist'
import texmath from 'markdown-it-texmath'
import katex from 'katex'
import hljs from 'highlight.js'

import 'highlight.js/styles/github.css'
import 'katex/dist/katex.min.css'

const DIAGRAM_LANGS = new Set([
  'mermaid', 'plantuml', 'puml', 'dot', 'graphviz', 'wavedrom', 'nomnoml', 'ditaa'
])

function diagramPlugin(md) {
  const defaultFence = md.renderer.rules.fence
  md.renderer.rules.fence = (tokens, idx, options, env, self) => {
    const token = tokens[idx]
    const lang = (token.info || '').trim().split(/\s+/)[0].toLowerCase()
    if (DIAGRAM_LANGS.has(lang)) {
      const code = token.content
      const id = 'diag-' + Math.random().toString(36).slice(2)
      const b64 = btoa(unescape(encodeURIComponent(code)))
      return '<div class="diagram-placeholder" data-diagram="' + lang + '" data-code="' + b64 + '" data-id="' + id + '"></div>\n'
    }
    return defaultFence ? defaultFence(tokens, idx, options, env, self) : self.renderToken(tokens, idx, options)
  }
}

export function createMarkdown() {
  const md = new MarkdownIt({
    html: false,
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
  md.use(diagramPlugin)

  return md
}
