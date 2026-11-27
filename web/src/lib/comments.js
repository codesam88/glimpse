// @ts-check
// Pure helpers for CriticMarkup comments ({>> ... <<}), depth-aware.
//
// parseCommentTree(source): array of top-level comment nodes:
//   { start, end, innerStart, innerEnd, inner, children: [...] }
// where start/end are offsets in source (inclusive of markers).
//
// Code blocks (fenced) are masked so markers inside them are ignored.

function maskCodeBlocks(src) {
  return src.replace(/```[\s\S]*?```|~~~[\s\S]*?~~~/g, (block) => block.replace(/[^\n]/g, ' '))
}

/**
 * @typedef {{ start: number, end: number, innerStart: number, innerEnd: number, inner: string, children: CommentNode[] }} CommentNode
 * @param {string} source
 * @returns {CommentNode[]}
 */
export function parseCommentTree(source) {
  const src = maskCodeBlocks(String(source || ''))
  const roots = []
  const stack = []
  let i = 0
  while (i < src.length) {
    if (src.startsWith('{>>', i)) {
      stack.push({ start: i, innerStart: i + 3, children: [] })
      i += 3
    } else if (src.startsWith('<<}', i)) {
      if (stack.length) {
        const top = stack.pop()
        const node = {
          start: top.start,
          end: i + 3,
          innerStart: top.innerStart,
          innerEnd: i,
          inner: src.slice(top.innerStart, i),
          children: top.children || [],
        }
        if (stack.length) stack[stack.length - 1].children.push(node)
        else roots.push(node)
      }
      i += 3
    } else {
      i++
    }
  }
  return roots
}

/**
 * @param {CommentNode[]} nodes
 * @param {CommentNode[]} [out]
 * @returns {CommentNode[]}
 */
export function flattenComments(nodes, out = []) {
  for (const n of nodes || []) {
    out.push(n)
    flattenComments(n.children, out)
  }
  return out
}

/**
 * @param {string} source
 * @param {number} pairIndex
 * @returns {CommentNode | null}
 */
export function findOuterAt(source, pairIndex) {
  const roots = parseCommentTree(source)
  const flat = flattenComments(roots)
  return flat[pairIndex] || null
}

/**
 * @param {string} source
 * @param {number} pairIndex
 * @param {string} newInner
 * @returns {string}
 */
export function replaceOuterContent(source, pairIndex, newInner) {
  const node = findOuterAt(source, pairIndex)
  if (!node) return source
  return source.slice(0, node.innerStart) + newInner + source.slice(node.innerEnd)
}

/**
 * @param {string} source
 * @param {number} pairIndex
 * @returns {string}
 */
export function removeOuter(source, pairIndex) {
  const node = findOuterAt(source, pairIndex)
  if (!node) return source
  return source.slice(0, node.start) + source.slice(node.end)
}

/**
 * @param {string} source
 * @param {number} pairIndex
 * @param {string} [inner]
 * @returns {string}
 */
export function insertReplyInside(source, pairIndex, inner = '{>> <<}') {
  const node = findOuterAt(source, pairIndex)
  if (!node) return source
  return source.slice(0, node.innerEnd) + ' ' + inner + source.slice(node.innerEnd)
}