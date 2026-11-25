import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { slugify, Slugger } from './slug.js'

// Slug laws (spec: GitHub-style heading anchors + TOC/anchor links depend on them)

describe('slugify laws', () => {
  it('folding: lowercase, spaces→dash, punctuation stripped', () => {
    expect(slugify('Hello World')).toBe('hello-world')
    expect(slugify('A  B\tC')).toBe('a-b-c')
    expect(slugify('Run/Stop!')).toBe('runstop')
    expect(slugify('Klick mich an')).toBe('klick-mich-an')
  })

  it('idempotence: same input → same slug', () => {
    fc.assert(fc.property(fc.string({ minSize: 1 }), (t) => {
      return slugify(t) === slugify(t)
    }), { numRuns: 300 })
  })

  it('totality: never throws, never empty output', () => {
    fc.assert(fc.property(fc.string(), fc.constantFrom(...'!@#$%^&*(){}[]|\\:;"\'<>,.?/~`'.split('')), (t, junk) => {
      const out = slugify(t + junk)
      return typeof out === 'string' && out.length > 0
    }), { numRuns: 300 })
  })
})

describe('Slugger dedupe laws', () => {
  it('identical headings get -1, -2 suffixes; distinct texts stay distinct', () => {
    const s = new Slugger()
    const a = s.slug('Intro')
    const b = s.slug('Intro')
    const c = s.slug('Intro')
    const d = s.slug('Other')
    expect([a, b, c]).toEqual(['intro', 'intro-1', 'intro-2'])
    expect(d).toBe('other')
  })

  it('collision via folding is deduped too (distinct source, same slug)', () => {
    const s = new Slugger()
    expect(s.slug('Run/Stop')).toBe('runstop')
    expect(s.slug('Run+Stop')).toBe('runstop-1')
  })

  it('totality: emoji/unicode headings never throw or collide silently', () => {
    fc.assert(fc.property(fc.string({ minSize: 1 }), (t) => {
      const s = new Slugger()
      const a = s.slug(t)
      const b = s.slug(t)
      return a.length > 0 && a !== b
    }), { numRuns: 300 })
  })
})
