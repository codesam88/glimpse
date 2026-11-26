import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { resolveInclude, loadTransclusion } from './transclude.js'

describe('transclude', () => {
  it('resolveInclude normalizes paths', () => {
    expect(resolveInclude('/docs', './a.md')).toBe('/docs/a.md')
    expect(resolveInclude('/docs', '../b.md')).toBe('/b.md')
    expect(resolveInclude('', 'x.md')).toBe('x.md')
  })

  it('loadTransclusion expands include', async () => {
    const reader = async (p) => (p === 'b.md' ? 'included' : 'root [b.md](b.md)')
    const r = await loadTransclusion('root [b.md](b.md)', '', { readFileFn: reader })
    expect(r.text).toContain('included')
  })

  it('cycle detection', async () => {
    const reader = async (p) => (p === 'a.md' ? '[b.md](b.md)' : '[a.md](a.md)')
    const r = await loadTransclusion('[a.md](a.md)', '', { readFileFn: reader })
    expect(r.text).toContain('cycle:')
  })

  it('depth limit', async () => {
    let i = 0
    const reader = async () => {
      i++
      return i < 10 ? '[next.md](next.md)' : 'end'
    }
    const r = await loadTransclusion('[next.md](next.md)', '', { readFileFn: reader, maxDepth: 0 })
    expect(r.text).toContain('max depth exceeded')
  })

  it('.mmd wraps in mermaid fence', async () => {
    const reader = async () => 'graph TD\nA-->B'
    const r = await loadTransclusion('[d.mmd](d.mmd)', '', { readFileFn: reader })
    expect(r.text).toContain('```mermaid')
  })

  it('missing file error block', async () => {
    const reader = async () => { throw new Error('nf') }
    const r = await loadTransclusion('[missing.md](missing.md)', '', { readFileFn: reader })
    expect(r.text).toContain('Transclusion error')
  })

  it('property: expansion terminates for arbitrary href graphs', async () => {
    await fc.assert(fc.asyncProperty(fc.string({ maxLength: 20 }), async (g) => {
      const reader = async () => '[x.md](x.md)'
      const r = await loadTransclusion(g, '', { readFileFn: reader, maxDepth: 3 })
      return typeof r.text === 'string'
    }), { numRuns: 200 })
  })
})