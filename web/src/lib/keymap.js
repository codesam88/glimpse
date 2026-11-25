// Configurable key bindings registry (V1).
//
// Persistence shape (stored under localStorage / Tauri store key "keybindings"):
//   { "zoom.in": ["Ctrl+=", "Ctrl+numadd", "Ctrl+WheelUp"], ... }
// Each action id maps to an array of key spec strings. Overrides are merged
// over DEFAULT_BINDINGS (last-write-wins per action id).
//
// Key spec grammar: modifiers joined by "+" then a key token, e.g.
//   "Ctrl+S", "Alt+Shift+D", "Ctrl+WheelUp", "Ctrl+numadd".
// Modifiers: Ctrl, Alt, Shift, Meta (aliases: Control, Cmd, Super).
// Key tokens are matched case-insensitively against the normalized event key.

export const DEFAULT_BINDINGS = {
  'zoom.in': ['Ctrl+=', 'Ctrl+Shift+=', 'Ctrl+numadd', 'Ctrl+WheelUp'],
  'zoom.out': ['Ctrl+-', 'Ctrl+numsubtract', 'Ctrl+WheelDown'],
  'zoom.reset': ['Ctrl+0'],
  'view.toggleSplit': ['Ctrl+p'],
  'sidebar.toggle': ['Ctrl+b'],
  'sidebar.tabOutline': ['Alt+1'],
  'sidebar.tabComments': ['Alt+2'],
  'comments.toggleVisibility': ['Alt+c'],
  'review.highlightMode': ['Ctrl+h'],
  'review.noteMode': ['Ctrl+n'],
  'debug.toggle': ['Alt+Shift+d'],
  'debug.forceToggle': ['Ctrl+Alt+d'],
  'file.save': ['Ctrl+s'],
  'file.open': ['Ctrl+o'],
  // file.reload intentionally unbound: Ctrl+R/Ctrl+Shift+R collide with
  // browser reload and would be surprising; use the Reload button instead.
}

export function getDefaults() {
  // deep copy
  const out = {}
  for (const k of Object.keys(DEFAULT_BINDINGS)) out[k] = [...DEFAULT_BINDINGS[k]]
  return out
}

const MODIFIER_ALIASES = {
  ctrl: 'ctrl', control: 'ctrl',
  alt: 'alt', option: 'alt',
  shift: 'shift',
  meta: 'meta', cmd: 'meta', super: 'meta', win: 'meta',
}

function normalizeKeyToken(token) {
  const t = String(token).trim()
  const lower = t.toLowerCase()
  if (lower === 'numadd' || lower === 'numpadadd') return 'numadd'
  if (lower === 'numsubtract' || lower === 'numpadsubtract') return 'numsubtract'
  if (lower === 'wheelup') return 'WheelUp'
  if (lower === 'wheeldown') return 'WheelDown'
  if (lower === 'space') return ' '
  if (lower === 'escape') return 'Escape'
  if (lower === 'enter' || lower === 'return') return 'Enter'
  if (lower === '=' || lower === 'equal' || lower === 'plus') return '='
  if (lower === '-' || lower === 'minus') return '-'
  if (lower === '0') return '0'
  if (/^[a-z]$/.test(lower)) return lower
  return t
}

function parseSpec(spec) {
  const parts = String(spec).split('+').map((s) => s.trim()).filter(Boolean)
  const mods = { ctrl: false, alt: false, shift: false, meta: false }
  let key = null
  for (const p of parts) {
    const m = MODIFIER_ALIASES[p.toLowerCase()]
    if (m) mods[m] = true
    else key = normalizeKeyToken(p)
  }
  return { mods, key }
}

function eventModifiers(e) {
  return { ctrl: !!e.ctrlKey, alt: !!e.altKey, shift: !!e.shiftKey, meta: !!e.metaKey }
}

function eventKeyToken(e) {
  if (typeof WheelEvent !== 'undefined' && e instanceof WheelEvent) {
    return e.deltaY < 0 ? 'WheelUp' : 'WheelDown'
  }
  const code = e.code || ''
  if (code === 'NumpadAdd') return 'numadd'
  if (code === 'NumpadSubtract') return 'numsubtract'
  const key = e.key
  if (key === ' ') return ' '
  // '+' is '=' with Shift held on most layouts; unify so 'Ctrl+Shift+=' specs match
  if (key === '+') return '='
  if (/^[A-Z]$/.test(key) && !e.shiftKey) return key.toLowerCase()
  return key
}

function modsEqual(a, b) {
  return a.ctrl === b.ctrl && a.alt === b.alt && a.shift === b.shift && a.meta === b.meta
}

export function specMatchesEvent(spec, e) {
  const { mods, key } = parseSpec(spec)
  if (!key) return false
  const evMods = eventModifiers(e)
  if (!modsEqual(mods, evMods)) return false
  // wheel specs require ctrl by default; still compare modifiers above
  const isWheel = typeof WheelEvent !== 'undefined' && e instanceof WheelEvent
  if (key.startsWith('Wheel') && !isWheel) return false
  if (!key.startsWith('Wheel') && isWheel) return false
  const evKey = eventKeyToken(e)
  if (evKey == null) return false
  return evKey === key || String(evKey).toLowerCase() === String(key).toLowerCase()
}

export function findAction(bindings, e) {
  for (const actionId of Object.keys(bindings || {})) {
    const specs = bindings[actionId]
    if (!Array.isArray(specs)) continue
    for (const spec of specs) {
      if (specMatchesEvent(spec, e)) return actionId
    }
  }
  return null
}

export function mergeBindings(base, overrides) {
  const out = {}
  for (const k of Object.keys(base || {})) out[k] = [...(base[k] || [])]
  if (overrides && typeof overrides === 'object') {
    for (const k of Object.keys(overrides)) {
      out[k] = Array.isArray(overrides[k]) ? [...overrides[k]] : (overrides[k] ? [overrides[k]] : [])
    }
  }
  return out
}