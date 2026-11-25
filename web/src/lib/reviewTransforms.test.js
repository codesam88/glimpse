import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { transformCriticMarkup, wrapWithMarkers } from './reviewTransforms.js'

const KINDS = ['addition', 'deletion', 'highlight', 'comment']

describe('reviewTransforms laws', () => {
  it('roundtrip: wrap then accept/reject follows documented semantics', () => {
    const expected = {
      addition: { accept: (t) => t, reject: () => '' },
      deletion: { accept: () => '', reject: (t) => t },
      highlight: { accept: (t) => t, reject: (t) => t },
      comment: { accept: () => '', reject: () => '' },
    }
    fc.assert(fc.property(
      fc.string().filter(t => t.length > 0 && !/[{}]/.test(t) && !/[`]/.test(t)),
      fc.constantFrom(...KINDS),
      (t, k) => {
        for (const mode of ['accept', 'reject']) {
          const wrapped = wrapWithMarkers(t, k)
          const out = transformCriticMarkup(wrapped, mode)
          if (out !== expected[k][mode](t)) return false
        }
        return true
      }
    ), { numRuns: 500 })
  })

  it('marker-hygiene: arbitrary input never gains complete marker pairs', () => {
    fc.assert(fc.property(fc.string(), (x) => {
      const out = transformCriticMarkup(x, 'accept')
      const pairs = (s) => (s.match(/\{==[\s\S]*?==\}/g) || []).length + (s.match(/\{\+\+[\s\S]*?\+\+\}/g) || []).length
      // output must not have MORE complete pairs than input
      return pairs(out) <= pairs(x)
    }), { numRuns: 500 })
  })

  it('idempotence: accept(accept(x)) === accept(x)', () => {
    fc.assert(fc.property(fc.string(), (x) => {
      return transformCriticMarkup(transformCriticMarkup(x, 'accept'), 'accept') === transformCriticMarkup(x, 'accept')
    }), { numRuns: 500 })
  })

  it('idempotence: reject(reject(x)) === reject(x)', () => {
    fc.assert(fc.property(fc.string(), (x) => {
      return transformCriticMarkup(transformCriticMarkup(x, 'reject'), 'reject') === transformCriticMarkup(x, 'reject')
    }), { numRuns: 500 })
  })

  it('purity: input string is not mutated', () => {
    fc.assert(fc.property(fc.string(), (x) => {
      const before = x
      transformCriticMarkup(x, 'accept')
      transformCriticMarkup(x, 'reject')
      return x === before
    }), { numRuns: 500 })
  })

  // Semantics observed: accept removes comments/deletions, keeps additions/highlights content;
  // reject removes additions/comments, keeps deletions/highlights content.
  // Nesting resolves by repeated passes (up to 10 iterations) until stable.
  it('nesting determinism: {== {>>c<<} ==} under accept yields inner content (comment removed)', () => {
    const x = '{== {>>c<<} ==}'
    expect(transformCriticMarkup(x, 'accept')).toBe('  ')
  })

  it('nesting determinism: {>> {++a++} <<} under reject removes comment entirely', () => {
    const x = '{>> {++a++} <<}'
    expect(transformCriticMarkup(x, 'reject')).toBe('')
  })

  it('nesting determinism: wrap addition inside highlight under accept', () => {
    const inner = wrapWithMarkers('x', 'addition')
    const outer = wrapWithMarkers(inner, 'highlight')
    expect(transformCriticMarkup(outer, 'accept')).toBe('x')
  })
})