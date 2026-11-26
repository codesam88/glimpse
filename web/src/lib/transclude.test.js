import { describe, it, expect } from 'vitest'
import { createMarkdown } from './markdown.js'
import { resolveInclude, renderTransclusions } from './transclude.js'

describe('transclude', () => {
  it('resolveInclude normalizes paths', () => {
    expect(resolveInclude('/docs', './a.md')).toBe('/docs/a.md')
    expect(resolveInclude('/docs', '../b.md')).toBe('/b.md')
    expect(resolveInclude('', 'x.md')).toBe('x.md')
  })

  it('renderTransclusions injects provenance attrs', async () => {
    const md = createMarkdown()
    const reader = async (p) => (p === 'b.md' ? 'included' : 'root')
    const r = await renderTransclusions(md, 'root [b.md](b.md)', '', { readFileFn: reader })
    expect(r.text).toContain('data-include-path="b.md"')
    expect(r.text).toContain('data-include-line="0"')
    expect(r.includedPaths).toContain('b.md')
  })

  it('per-file slug scoping', async () => {
    const md = createMarkdown()
    const reader = async () => '# Title'
    const r = await renderTransclusions(md, '[b.md](b.md)', '', { readFileFn: reader })
    expect(r.text).toContain('id="title"')
  })

  it('cycle detection', async () => {
    const md = createMarkdown()
    const reader = async (p) => (p === 'a.md' ? '[b.md](b.md)' : '[a.md](a.md)')
    const r = await renderTransclusions(md, '[a.md](a.md)', '', { readFileFn: reader })
    expect(r.text).toContain('data-include-error="cycle:')
  })

  it('depth limit', async () => {
    const md = createMarkdown()
    const reader = async () => '[next.md](next.md)'
    const r = await renderTransclusions(md, '[next.md](next.md)', '', { readFileFn: reader, maxDepth: 0 })
    expect(r.text).toContain('data-include-error="max depth exceeded:')
  })

  it('.mmd wraps in mermaid fence', async () => {
    const md = createMarkdown()
    const reader = async () => 'graph TD\nA-->B'
    const r = await renderTransclusions(md, '[d.mmd](d.mmd)', '', { readFileFn: reader })
    expect(r.text).toContain('data-diagram="mermaid"')
  })

  it('missing file error block', async () => {
    const md = createMarkdown()
    const reader = async () => { throw new Error('nf') }
    const r = await renderTransclusions(md, '[missing.md](missing.md)', '', { readFileFn: reader })
    expect(r.text).toContain('data-include-error="could not read:')
  })
})