// Pure transclusion helpers for Glimpse.
//
// resolveInclude(baseDir, href) -> normalized path (no network).
// loadTransclusion(text, baseDir, { readFileFn, depth, visited, maxDepth, maxBytes })
//   -> { text, errors } with expanded includes.

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

const INCLUDE_RE = /\[([^\]]+)\]\(\1\)/g

export async function loadTransclusion(text, baseDir, opts = {}) {
  const readFileFn = opts.readFileFn || (async () => { throw new Error('no reader') })
  const depth = opts.depth || 0
  const maxDepth = opts.maxDepth == null ? 5 : opts.maxDepth
  const maxBytes = opts.maxBytes == null ? 512 * 1024 : opts.maxBytes
  const visited = opts.visited || new Set()
  const errors = []

  if (depth > maxDepth) {
    return { text: '> **Transclusion error:** max depth exceeded\n', errors: ['max depth exceeded'] }
  }

  const source = String(text || '')
  // process includes via regex replace (async not allowed in replace; collect first)
  const matches = [...source.matchAll(INCLUDE_RE)]
  if (matches.length === 0) return { text: source, errors }

  // We'll rebuild string manually to await reads
  let result = ''
  let lastIndex = 0
  for (const m of matches) {
    result += source.slice(lastIndex, m.index)
    const href = m[1]
    lastIndex = m.index + m[0].length
    if (!isIncludeLink(href)) {
      result += m[0]
      continue
    }
    const resolved = resolveInclude(baseDir, href)
    if (!resolved) {
      result += m[0]
      continue
    }
    if (visited.has(resolved)) {
      const msg = 'cycle: ' + resolved
      errors.push(msg)
      result += '\n\n> **Transclusion error:** ' + msg + '\n\n'
      continue
    }
    if (depth + 1 > maxDepth) {
      const msg = 'max depth exceeded: ' + resolved
      errors.push(msg)
      result += '\n\n> **Transclusion error:** ' + msg + '\n\n'
      continue
    }
    let content
    try {
      content = await readFileFn(resolved)
    } catch (e) {
      const msg = 'could not read: ' + resolved
      errors.push(msg)
      result += '\n\n> **Transclusion error:** ' + msg + '\n\n'
      continue
    }
    if (content.length > maxBytes) {
      const msg = 'file too large: ' + resolved
      errors.push(msg)
      result += '\n\n> **Transclusion error:** ' + msg + '\n\n'
      continue
    }
    const ext = (resolved.split('.').pop() || '').toLowerCase()
    if (ext === 'mmd') content = '```mermaid\n' + content + '\n```'
    const nestedVisited = new Set(visited)
    nestedVisited.add(resolved)
    const nested = await loadTransclusion(content, (resolved.replace(/[^/\\]*$/, '') || ''), {
      readFileFn,
      depth: depth + 1,
      visited: nestedVisited,
      maxDepth,
      maxBytes,
    })
    errors.push(...nested.errors)
    result += nested.text
  }
  result += source.slice(lastIndex)
  return { text: result, errors }
}