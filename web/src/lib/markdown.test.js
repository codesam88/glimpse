/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { createMarkdown } from './markdown.js'
import { sanitizeHtml } from './diagrams.js'

describe('markdown rendering laws', () => {
  const md = createMarkdown()
  const parse = (out) => {
    const host = document.createElement('article')
    host.innerHTML = out
    return host
  }

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

  it('include ordering: mid-paragraph include is a block sibling, order preserved', () => {
    const out = md.render('before\n\nmid [!inc.md] tail\n\nafter')
    const el = parse(out)
    const kids = [...el.children]
    const tags = kids.map((c) => c.tagName + (c.className ? '.' + c.className.split(' ')[0] : ''))
    // No block element may live inside a paragraph.
    expect(el.querySelector('p .include-placeholder')).toBeNull()
    expect(el.querySelector('h1 .include-placeholder, h2 .include-placeholder')).toBeNull()
    // Order: text before, include block, text after.
    const incIdx = tags.findIndex((t) => t.startsWith('DIV.include-placeholder'))
    expect(incIdx).toBeGreaterThan(0)
    expect(kids[incIdx - 1].textContent.trim()).toBe('mid')
    expect(kids[incIdx + 1].textContent.trim()).toBe('tail')
  })

  it('include containment: include inside a list item stays inside the list item', () => {
    const out = md.render('- alpha\n- item [!inc.md] tail\n- omega')
    const el = parse(out)
    const lis = [...el.querySelectorAll('li')]
    expect(lis.length).toBe(3)
    const holder = lis.find((li) => li.querySelector('.include-placeholder'))
    expect(holder).toBeTruthy()
    expect(holder.textContent).toContain('item')
    expect(holder.textContent).toContain('tail')
  })

  it('include in heading degrades to a link (block cannot live in a heading)', () => {
    const out = md.render('# Head [!inc.md] end')
    expect(out).not.toContain('include-placeholder')
    expect(out).toContain('<a ')
  })

  it('include line attr is numeric for own-line and mid-paragraph forms', () => {
    for (const src of ['[!inc.md]', 'before\n\nmid [!inc.md] tail']) {
      const out = md.render(src)
      const m = out.match(/data-include-line="([^"]*)"/)
      expect(m).toBeTruthy()
      expect(m[1]).toMatch(/^\d+$/)
    }
  })

  it('include depth>0 degrades to link (no split inside emphasis)', () => {
    const out = md.render('**a [!inc.md] b**')
    expect(out).not.toContain('include-placeholder')
    const el = parse(out)
    const strongs = [...el.querySelectorAll('strong')]
    expect(strongs.length).toBe(1)
    const txt = strongs[0].textContent
    expect(txt).toContain('a')
    expect(txt).toContain('b')
    expect(txt.indexOf('a')).toBeLessThan(txt.indexOf('b'))
    // balanced tags in raw
    const opens = (out.match(/<strong>/g) || []).length
    const closes = (out.match(/<\/strong>/g) || []).length
    expect(opens).toBe(closes)
  })

  it('include multi-line paragraph gets correct numeric line', () => {
    const src = 'a\nb\nc [!inc.md] d'
    const out = md.render(src)
    const m = out.match(/data-include-line="(\d+)"/)
    expect(m).toBeTruthy()
    expect(Number(m[1])).toBeGreaterThan(0)
    expect(Number(m[1])).toBe(2)
  })

  it('include multiple in one paragraph preserve order', () => {
    const out = md.render('x [!a.md] y [!b.md] z')
    const el = parse(out)
    const kids = [...el.children]
    const tags = kids.map((c) => c.tagName + (c.className ? '.' + c.className.split(' ')[0] : ''))
    // x paragraph, placeholder a, y paragraph, placeholder b, z paragraph
    expect(tags.filter((t) => t.startsWith('DIV.include-placeholder')).length).toBe(2)
    const firstPh = tags.findIndex((t) => t.startsWith('DIV.include-placeholder'))
    expect(kids[firstPh - 1].textContent.trim()).toBe('x')
    expect(kids[firstPh].getAttribute('data-include-path')).toBe('a.md')
    expect(kids[firstPh + 1].textContent.trim()).toBe('y')
    const secondPh = tags.findIndex((t, idx) => idx > firstPh && t.startsWith('DIV.include-placeholder'))
    expect(kids[secondPh].getAttribute('data-include-path')).toBe('b.md')
    expect(kids[secondPh + 1].textContent.trim()).toBe('z')
  })

  it('include split preserves data-source-line on new paragraphs', () => {
    const out = md.render('before\n\nmid [!inc.md] tail')
    expect(out).toMatch(/<p[^>]*data-source-line="2"[^>]*>mid\s*<\/p>/)
  })

  it('include in tight list does not leak p tags', () => {
    const out = md.render('- item [!inc.md] tail')
    expect(out).not.toContain('<p')
    expect(out).not.toContain('</p>')
    const el = parse(out)
    const li = el.querySelector('li')
    expect(li).toBeTruthy()
    const children = [...li.childNodes]
    // text "item", placeholder, text "tail"
    const texts = children.filter((c) => c.nodeType === 3).map((c) => c.textContent.trim()).filter(Boolean)
    expect(texts).toEqual(['item', 'tail'])
    expect(li.querySelector('.include-placeholder')).toBeTruthy()
  })

  it('include ordering property: placeholder never nested in p/h1 and order is prefix→include→suffix', () => {
    fc.assert(fc.property(
      fc.stringMatching(/^[a-z]{1,10}$/),
      fc.stringMatching(/^[a-z]{1,10}$/),
      (prefix, suffix) => {
        const src = prefix + ' [!i.md] ' + suffix
        const out = md.render(src)
        const el = parse(out)
        if (el.querySelector('p .include-placeholder, li > p > .include-placeholder, h1 .include-placeholder')) return false
        const inc = el.querySelector('.include-placeholder')
        if (!inc) return false
        const walk = []
        const visit = (n) => {
          for (const c of n.childNodes) {
            if (c.nodeType === 3) walk.push(c.textContent)
            else if (c.nodeType === 1) {
              if (c.classList.contains('include-placeholder')) walk.push('\u0000INC\u0000')
              visit(c)
            }
          }
        }
        visit(el)
        const flat = walk.join('')
        const iInc = flat.indexOf('\u0000INC\u0000')
        const before = flat.slice(0, iInc)
        const after = flat.slice(iInc + 5)
        return before.includes(prefix) && after.includes(suffix)
      },
    ), { numRuns: 150 })
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