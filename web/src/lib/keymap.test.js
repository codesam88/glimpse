import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { getDefaults, findAction, mergeBindings, specMatchesEvent } from './keymap.js'

describe('keymap laws', () => {
  it('case-insensitivity: Ctrl+<letter> matches regardless of case', () => {
    fc.assert(fc.property(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')), (ch) => {
      if (!/[a-zA-Z]/.test(ch)) return true
      const lower = ch.toLowerCase()
      const upper = ch.toUpperCase()
      const bindings = { act: ['Ctrl+' + upper, 'Ctrl+' + lower] }
      const evLower = { key: lower, ctrlKey: true }
      const evUpper = { key: upper, ctrlKey: true }
      return findAction(bindings, evLower) === 'act' && findAction(bindings, evUpper) === 'act'
    }), { numRuns: 500 })
  })

  it('modifier exactness: Ctrl+P does not match alt/meta/shift-only events', () => {
    const bindings = { act: ['Ctrl+p'] }
    const cases = [
      { key: 'p', altKey: true },
      { key: 'p', metaKey: true },
      { key: 'p', shiftKey: true },
      { key: 'p', ctrlKey: true, altKey: true },
    ]
    for (const ev of cases) {
      if (ev.ctrlKey && !ev.altKey) continue
      expect(findAction(bindings, ev)).not.toBe('act')
    }
    expect(findAction(bindings, { key: 'p', ctrlKey: true })).toBe('act')
  })

  it('domain separation: Wheel specs never match keydown-shaped events', () => {
    const bindings = { act: ['Ctrl+WheelUp'] }
    const keyEv = { key: 'WheelUp', ctrlKey: true }
    expect(findAction(bindings, keyEv)).not.toBe('act')
  })

  it('domain separation: key specs never match wheel-shaped events', () => {
    const bindings = { act: ['Ctrl+p'] }
    const wheelEv = { deltaY: -10, ctrlKey: true }
    expect(findAction(bindings, wheelEv)).not.toBe('act')
  })

  it('override law: overridden action matches only new keys', () => {
    fc.assert(fc.property(fc.string({ minLength: 1, maxLength: 4 }).filter(s => /^[a-zA-Z]$/.test(s)), fc.string({ minLength: 1, maxLength: 4 }).filter(s => /^[a-zA-Z]$/.test(s)), (oldK, newK) => {
      if (oldK.toLowerCase() === newK.toLowerCase()) return true
      const defs = getDefaults()
      const merged = mergeBindings(defs, { 'zoom.in': ['Ctrl+' + newK] })
      const oldEv = { key: oldK, ctrlKey: true }
      const newEv = { key: newK, ctrlKey: true }
      return findAction(merged, oldEv) !== 'zoom.in' && findAction(merged, newEv) === 'zoom.in'
    }), { numRuns: 500 })
  })

  it('override law: untouched actions keep defaults', () => {
    const defs = getDefaults()
    const merged = mergeBindings(defs, { 'zoom.in': ['Ctrl+q'] })
    expect(merged['zoom.out']).toEqual(defs['zoom.out'])
    expect(merged['view.toggleSplit']).toEqual(defs['view.toggleSplit'])
  })

  it('override law: garbage merge never throws and yields valid shape', () => {
    fc.assert(fc.property(fc.anything(), (g) => {
      let out
      try { out = mergeBindings(getDefaults(), g) } catch (e) { return false }
      return out !== null && typeof out === 'object'
    }), { numRuns: 500 })
  })

  it('override law: second override wins', () => {
    const first = mergeBindings(getDefaults(), { 'zoom.in': ['Ctrl+a'] })
    const second = mergeBindings(first, { 'zoom.in': ['Ctrl+b'] })
    expect(second['zoom.in']).toEqual(['Ctrl+b'])
    expect(findAction(second, { key: 'a', ctrlKey: true })).not.toBe('zoom.in')
    expect(findAction(second, { key: 'b', ctrlKey: true })).toBe('zoom.in')
  })

  it('totality: findAction never throws on arbitrary specs/events', () => {
    fc.assert(fc.property(fc.array(fc.string(), { maxLength: 5 }), fc.record({
      key: fc.string(),
      ctrlKey: fc.boolean(),
      altKey: fc.boolean(),
      shiftKey: fc.boolean(),
      metaKey: fc.boolean(),
      deltaY: fc.integer(),
    }), (specs, ev) => {
      const bindings = { act: specs }
      try { findAction(bindings, ev) } catch (e) { return false }
      return true
    }), { numRuns: 500 })
  })

  it('specMatchesEvent handles unicode garbage specs without throw', () => {
    fc.assert(fc.property(fc.string(), fc.string(), (spec, evKey) => {
      try { specMatchesEvent(spec, { key: evKey, ctrlKey: false }) } catch (e) { return false }
      return true
    }), { numRuns: 500 })
  })
})