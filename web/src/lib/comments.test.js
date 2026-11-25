import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { parseCommentTree, flattenComments, replaceOuterContent, removeOuter, insertReplyInside } from './comments.js'

describe('comments scanner laws', () => {
  it('totality: parseCommentTree never throws on adversarial input', () => {
    fc.assert(fc.property(fc.string(), (s) => {
      try { parseCommentTree(s) } catch (e) { return false }
      return true
    }), { numRuns: 500 })
  })

  it('roundtrip: flatten indices cover all outer markers', () => {
    const src = 'a {>> x <<} b {>> y {>> z <<} <<} c'
    const tree = parseCommentTree(src)
    const flat = flattenComments(tree)
    expect(flat.length).toBe(3)
  })

  it('roundtrip serialize: replaceOuterContent with same inner is identity', () => {
    fc.assert(fc.property(fc.string().filter(s => /^[a-zA-Z0-9]+$/.test(s)), (t) => {
      const src = 'pre {>>' + t + '<<} post'
      const out = replaceOuterContent(src, 0, t)
      return out === src
    }), { numRuns: 500 })
  })

  it('reply then delete: insertReplyInside then removeOuter of reply', () => {
    const src = 'x {>> a <<} y'
    const withReply = insertReplyInside(src, 0, '{>> <<}')
    // reply inserted before closing; outer still one top-level
    const tree = parseCommentTree(withReply)
    expect(flattenComments(tree).length).toBe(2)
    // remove outer removes sub-comments too
    const removed = removeOuter(withReply, 0)
    expect(removed).toBe('x  y')
  })

  it('delete top removes sub-comments', () => {
    const src = 'x {>> outer {>> inner <<} <<} y'
    const out = removeOuter(src, 0)
    expect(out).toBe('x  y')
    expect(parseCommentTree(out).length).toBe(0)
  })

  it('nested 3-deep parses without throw', () => {
    const src = '{>> a {>> b {>> c <<} <<} <<}'
    const tree = parseCommentTree(src)
    expect(tree.length).toBe(1)
    expect(tree[0].children.length).toBe(1)
    expect(tree[0].children[0].children.length).toBe(1)
  })

  it('unbalanced markers do not throw', () => {
    const src = '{>> unbalanced << and {>> another'
    expect(() => parseCommentTree(src)).not.toThrow()
  })
})