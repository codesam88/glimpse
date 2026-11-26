// Render-time transclusion helpers for Glimpse.
//
// resolveInclude(baseDir, href) -> normalized path.
// renderTransclusions(md, sourceText, baseDir, opts) -> { text, includedPaths }
//   where text is source with include links replaced by rendered HTML blocks
//   carrying provenance attrs (data-include-path, data-include-line).

function normalizePath(p) {
  const leading = String(p || '').startsWith('/') ? '/' : ''
  const out = []
  for (const part of String(p || '').split('/')) {
    if (part === '' || part === '.') continue
    if (part === '..') { out.pop(); continue }
    out.push(part)
  }
  return leading + out.join('/')
}

export function resolveInclude(baseDir, href) {
  const clean = String(href || '').split('#')[0].split('?')[0].trim()
  if (!clean) return null
  const ext = (clean.split('.').pop() || '').toLowerCase()
  if (!['md', 'markdown', 'mmd'].includes(ext)) return null
  if (clean.startsWith('/')) return normalizePath(clean)
  const base = baseDir || ''
  return normalizePath((base ? base + '/' : '') + clean)
}

function isIncludeLink(href) {
  const clean = String(href || '').trim()
  const ext = (clean.split('.').pop() || '').toLowerCase()
  return ['md', 'markdown', 'mmd'].includes(ext)
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

const INCLUDE_RE = /\[!?([^\]]+)\]/g

export async function renderTransclusions(md, sourceText, baseDir, opts = {}) {
  const readFileFn = opts.readFileFn || (async () => { throw new Error('no reader') })
  const depth = opts.depth || 0
  const maxDepth = opts.maxDepth == null ? 5 : opts.maxDepth
  const maxBytes = opts.maxBytes == null ? 512 * 1024 : opts.maxBytes
  const visited = opts.visited || new Set()
  const includedPaths = []

  const source = String(sourceText || '')
  const matches = [...source.matchAll(INCLUDE_RE)]
  if (matches.length === 0) return { text: source, includedPaths }

  let result = ''
  let lastIndex = 0
  for (const m of matches) {
    result += source.slice(lastIndex, m.index)
    lastIndex = m.index + m[0].length
    const href = m[1]
    if (!isIncludeLink(href)) {
      result += m[0]
      continue
    }
    const resolved = resolveInclude(baseDir, href)
    if (!resolved) {
      result += m[0]
      continue
    }
    const lineNo = source.slice(0, m.index).split('\n').length - 1
    if (visited.has(resolved)) {
      result += '\n\n<div class="include-root" data-include-path="' + escapeHtml(resolved) + '" data-include-line="' + lineNo + '" data-include-error="cycle: ' + escapeHtml(resolved) + '"><div class="include-header"><span class="include-path">📄 ' + escapeHtml(resolved) + '</span><button type="button" class="include-open" data-include-open="' + escapeHtml(resolved) + '">Open ↗</button></div>cycle: ' + escapeHtml(resolved) + '</div>\n\n'
      continue
    }
    if (depth + 1 > maxDepth) {
      result += '\n\n<div class="include-root" data-include-path="' + escapeHtml(resolved) + '" data-include-line="' + lineNo + '" data-include-error="max depth exceeded: ' + escapeHtml(resolved) + '"><div class="include-header"><span class="include-path">📄 ' + escapeHtml(resolved) + '</span><button type="button" class="include-open" data-include-open="' + escapeHtml(resolved) + '">Open ↗</button></div>max depth exceeded: ' + escapeHtml(resolved) + '</div>\n\n'
      continue
    }
    let content
    try {
      content = await readFileFn(resolved)
    } catch (e) {
      result += '\n\n<div class="include-root" data-include-path="' + escapeHtml(resolved) + '" data-include-line="' + lineNo + '" data-include-error="could not read: ' + escapeHtml(resolved) + '"><div class="include-header"><span class="include-path">📄 ' + escapeHtml(resolved) + '</span><button type="button" class="include-open" data-include-open="' + escapeHtml(resolved) + '">Open ↗</button></div>could not read: ' + escapeHtml(resolved) + '</div>\n\n'
      continue
    }
    if (content.length > maxBytes) {
      result += '\n\n<div class="include-root" data-include-path="' + escapeHtml(resolved) + '" data-include-line="' + lineNo + '" data-include-error="file too large: ' + escapeHtml(resolved) + '"><div class="include-header"><span class="include-path">📄 ' + escapeHtml(resolved) + '</span><button type="button" class="include-open" data-include-open="' + escapeHtml(resolved) + '">Open ↗</button></div>file too large: ' + escapeHtml(resolved) + '</div>\n\n'
      continue
    }
    const ext = (resolved.split('.').pop() || '').toLowerCase()
    const innerMd = ext === 'mmd' ? '```mermaid\n' + content + '\n```' : content
    const nestedBaseDir = resolved.replace(/[^/\\]*$/, '') || ''
    const nestedVisited = new Set(visited)
    nestedVisited.add(resolved)
    const nested = await renderTransclusions(md, innerMd, nestedBaseDir, {
      readFileFn,
      depth: depth + 1,
      visited: nestedVisited,
      maxDepth,
      maxBytes,
    })
    includedPaths.push(resolved, ...nested.includedPaths)
    const includedHtml = md.render(nested.text)
    const header = '<div class="include-header"><span class="include-path">📄 ' + escapeHtml(resolved) + '</span><button type="button" class="include-open" data-include-open="' + escapeHtml(resolved) + '">Open ↗</button></div>'
    result += '\n\n<div class="include-root" data-include-path="' + escapeHtml(resolved) + '" data-include-line="' + lineNo + '">' + header + includedHtml + '</div>\n\n'
  }
  result += source.slice(lastIndex)
  return { text: result, includedPaths }
}

// Back-compat text API
export async function loadTransclusion(text, baseDir, opts = {}) {
  const r = await renderTransclusions(null, text, baseDir, opts)
  // if md not provided, just return text (no render) — keep for tests
  return { text: r.text, errors: [] }
}