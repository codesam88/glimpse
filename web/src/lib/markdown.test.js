/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { createMarkdown } from './markdown.js'
import { sanitizeHtml } from './diagrams.js'

describe('markdown rendering laws', () => {
  const md = createMarkdown()

  it('include emission: [!p] embeds placeholder', () => {
    const out = md.render('[!inc.md]')
    expect(out).toContain('include-placeholder')
    expect(out).toContain('data-include-path="inc.md"')
  })

  it('include emission: bare [p.md] embeds (decided: single-bracket = embed, ! optional)', () => {
    const out = md.render('[target.md]')
    expect(out).toContain('include-placeholder')
    expect(out).toContain('data-include-path="target.md"')
    expect(out).not.toContain('<a ')
  })

  it('non-inclusion: labeled link stays link', () => {
    const out = md.render('[text](target.md)')
    expect(out).toContain('<a ')
    expect(out).toContain('>text</a>')
    expect(out).not.toContain('include-placeholder')
  })

  it('non-inclusion: raw link stays link', () => {
    const out = md.render('[target.md](target.md)')
    expect(out).toContain('<a ')
    expect(out).not.toContain('include-placeholder')
  })

  it('non-inclusion: images untouched', () => {
    const out = md.render('![alt](x.png)')
    expect(out).toContain('<img')
    expect(out).not.toContain('include-placeholder')
  })

  it('non-inclusion: non-include ext literal', () => {
    const out = md.render('[x.txt]')
    expect(out).not.toContain('include-placeholder')
  })

  it('bang+parens is link not embed', () => {
    const out = md.render('[!p.md](p.md)')
    expect(out).toContain('<a ')
    expect(out).not.toContain('include-placeholder')
  })

  it('heading {#id}: explicit id set and stripped', () => {
    const out = md.render('# H {#custom}')
    expect(out).toContain('id="custom"')
    expect(out).not.toContain('{#custom}')
    expect(out).toContain('>H</h1>')
  })

  it('heading {#id}: duplicate gets -1', () => {
    const out = md.render('# A {#x}\n\n# B {#x}')
    expect(out).toContain('id="x"')
    expect(out).toContain('id="x-1"')
  })

  it('heading no-attr keeps slug', () => {
    const out = md.render('# Hello World')
    expect(out).toContain('id="hello-world"')
  })

  it('heading adversarial {#}{#}{#garbage no crash', () => {
    expect(() => md.render('# H {#}{#}{#garbage')).not.toThrow()
  })

  it('sanitize: script removed', () => {
    const raw = md.render('<script>alert(1)</script>')
    const clean = sanitizeHtml(raw)
    expect(clean).not.toContain('<script')
  })

  it('sanitize: div passes', () => {
    const raw = md.render('<div>line</div>')
    const clean = sanitizeHtml(raw)
    expect(clean).toContain('<div>')
  })

  it('critic: highlight renders', () => {
    const out = md.render('{==y==}')
    expect(out).toContain('<mark>')
  })

  it('critic: comment renders', () => {
    const out = md.render('{>>x<<}')
    expect(out).toContain('critic comment')
  })

  it('critic: empty comment renders', () => {
    const out = md.render('{>> <<}')
    expect(out).toContain('critic comment')
  })

  it('adversarial paths property', () => {
    fc.assert(fc.property(fc.string({ minLength: 1, maxLength: 12 }).filter(s => /^[a-zA-Z0-9._-]+$/.test(s)), (name) => {
      const p = name + '.md'
      const out = md.render('[!' + p + ']')
      return out.includes('data-include-path="' + p + '"')
    }), { numRuns: 300 })
  })

  it('property: render never throws on arbitrary input', () => {
    fc.assert(fc.property(fc.string({ maxLength: 60 }), (s) => {
      try { md.render(s) } catch (e) { return false }
      return true
    }), { numRuns: 500 })
  })

  it('sanitizer invariant: no script/onload/javascript in output', () => {
    fc.assert(fc.property(fc.string({ maxLength: 80 }), (s) => {
      try {
        const raw = md.render(s)
        const clean = sanitizeHtml(raw)
        const lower = clean.toLowerCase()
        return !lower.includes('<script') && !lower.includes('onload=') && !lower.includes('javascript:')
      } catch (e) { return false }
    }), { numRuns: 500 })
  })

  it('placeholder position: own-line include is block-level (not in P)', () => {
    const out = md.render('[!inc.md]')
    expect(out.trim().startsWith('<div class="include-placeholder"')).toBe(true)
  })

  it('placeholder position: mid-paragraph include sits in P (raw)', () => {
    const out = md.render('text [!inc.md] more')
    expect(out).toContain('<p ')
    expect(out).toContain('text <div class="include-placeholder"')
  })

  it('placeholder position property: own-line vs mid-paragraph', () => {
    fc.assert(fc.property(fc.string({ minLength: 1, maxLength: 8 }).filter(s => /^[a-zA-Z0-9._-]+$/.test(s)), (name) => {
      const p = name + '.md'
      const ownLine = md.render('[!' + p + ']')
      const mid = md.render('x [!' + p + '] y')
      return ownLine.trim().startsWith('<div class="include-placeholder"') && mid.includes('x <div class="include-placeholder"')
    }), { numRuns: 200 })
  })

  it('non-embed law (property): labeled link never emits placeholder', () => {
    fc.assert(fc.property(
      fc.string({ minLength: 1, maxLength: 6 }).filter(s => /^[a-zA-Z0-9]+$/.test(s)),
      fc.string({ minLength: 1, maxLength: 6 }).filter(s => /^[a-zA-Z0-9]+$/.test(s)),
      (label, name) => {
        const p = name + '.md'
        const out = md.render('[' + label + '](' + p + ')')
        return !out.includes('include-placeholder')
      }
    ), { numRuns: 300 })
  })

  it('determinism: same input byte-identical output', () => {
    fc.assert(fc.property(fc.string({ maxLength: 60 }), (s) => {
      return md.render(s) === md.render(s)
    }), { numRuns: 500 })
  })
})