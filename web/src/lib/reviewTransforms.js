// @ts-check
// Pure-text helpers for CriticMarkup accept/reject and editor wrapping.
// Kept DOM-free so they can be unit-checked with plain Node.

const PATTERNS = {
  addition: /\{\+\+([\s\S]*?)\+\+\}/g,
  deletion: /\{--([\s\S]*?)--\}/g,
  substitution: /\{~~([\s\S]*?)~>([\s\S]*?)~~\}/g,
  highlight: /\{==([\s\S]*?)==\}/g,
  comment: /\{>>([\s\S]*?)<<\}/g,
}

const PLACEHOLDERS = {
  addition: 'added',
  deletion: 'removed',
  highlight: 'highlighted',
  comment: 'comment',
}

const MARKERS = {
  addition: ['{++', '++}'],
  deletion: ['{--', '--}'],
  highlight: ['{==', '==}'],
  comment: ['{>>', '<<}'],
}

/**
 * @param {string} selected
 * @param {string} kind
 * @returns {string}
 */
export function wrapWithMarkers(selected, kind) {
  const m = MARKERS[kind]
  if (!m) return selected || ''
  const placeholder = PLACEHOLDERS[kind] || 'text'
  const inner = selected && selected.length ? selected : placeholder
  return m[0] + inner + m[1]
}

function transformChunk(chunk, mode) {
  let cur = chunk
  let prev = null
  let iter = 0
  while (cur !== prev && iter < 10) {
    prev = cur
    if (mode === 'accept') {
      cur = cur
        .replace(PATTERNS.substitution, (_m, _old, nw) => nw)
        .replace(PATTERNS.addition, (_m, c) => c)
        .replace(PATTERNS.deletion, () => '')
        .replace(PATTERNS.highlight, (_m, c) => c)
        .replace(PATTERNS.comment, () => '')
    } else {
      cur = cur
        .replace(PATTERNS.substitution, (_m, o, _nw) => o)
        .replace(PATTERNS.addition, () => '')
        .replace(PATTERNS.deletion, (_m, c) => c)
        .replace(PATTERNS.highlight, (_m, c) => c)
        .replace(PATTERNS.comment, () => '')
    }
    iter++
  }
  return cur
}

/**
 * @param {string} text
 * @param {'accept'|'reject'} mode
 * @returns {string}
 */
export function transformCriticMarkup(text, mode) {
  // Protect fenced code blocks AND inline code spans (marks there are
  // literal per the renderer: code spans tokenize before critic rules).
  const parts = String(text).split(
    /(```[\s\S]*?```|~~~[\s\S]*?~~~|``[^`\n]*``|`[^`\n]*`)/g,
  )
  return parts
    .map((part, i) => (i % 2 === 1 ? part : transformChunk(part, mode)))
    .join('')
}

export { PLACEHOLDERS, MARKERS }
