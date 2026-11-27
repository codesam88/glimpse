// @ts-check
// Action registry (single source of truth for user-facing actions).
//
// Each action: { id, label, icon, shortcut, run }.
// `shortcut` is taken from keymap defaults (see keymap.js). `run` is supplied
// by the app via setRunners() so menus, toolbar buttons and keymap dispatch
// all resolve to one implementation per id.

import { getDefaults } from './keymap.js'

/** @type {Record<string, {label: string, icon: string}>} */
const META = {
  'zoom.in': { label: 'Zoom in', icon: 'plus' },
  'zoom.out': { label: 'Zoom out', icon: 'plus' },
  'zoom.reset': { label: 'Reset zoom', icon: 'refresh' },

  'view.toggleSplit': { label: 'Split view', icon: 'split' },
  'view.split': { label: 'Split view', icon: 'split' },
  'view.diagrams': { label: 'Diagrams', icon: 'chart-bar' },

  'sidebar.toggle': { label: 'Toggle sidebar', icon: 'chevron-right' },
  'sidebar.tabOutline': { label: 'Outline tab', icon: 'chevron-right' },
  'sidebar.tabComments': { label: 'Comments tab', icon: 'comment' },
  'comments.toggleVisibility': { label: 'Toggle comments', icon: 'comment' },

  'review.highlightMode': { label: 'Highlight mode', icon: 'format-highlight' },
  'review.noteMode': { label: 'Note mode', icon: 'comment' },
  'review.deleteMode': { label: 'Delete mode', icon: 'format-strike' },
  'review.insert': { label: 'Insert', icon: 'plus' },
  'review.strike': { label: 'Strike', icon: 'format-strike' },
  'review.highlight': { label: 'Highlight', icon: 'format-highlight' },
  'review.comment': { label: 'Comment', icon: 'comment' },
  'review.acceptAll': { label: 'Accept all', icon: 'plus' },
  'review.acceptSel': { label: 'Accept selection', icon: 'plus' },
  'review.rejectAll': { label: 'Reject all', icon: 'format-strike' },
  'review.rejectSel': { label: 'Reject selection', icon: 'format-strike' },
  'review.undo': { label: 'Undo', icon: 'undo' },
  'review.redo': { label: 'Redo', icon: 'redo' },

  'debug.toggle': { label: 'Toggle debug', icon: 'bug' },
  'debug.forceToggle': { label: 'Force debug', icon: 'bug' },

  'file.open': { label: 'Open', icon: 'folder-open' },
  'file.save': { label: 'Save', icon: 'content-save' },
  'file.reload': { label: 'Reload', icon: 'refresh' },
  'file.settings': { label: 'Settings', icon: 'cog' },
  'file.exit': { label: 'Exit', icon: 'exit-to-app' },
}

export const ACTION_IDS = Object.keys(META)

const runners = {}

/**
 * @param {Record<string, (...args:any[])=>any>} map
 */
export function setRunners(map) {
  if (!map || typeof map !== 'object') return
  for (const k of Object.keys(map)) runners[k] = map[k]
}

export function setRunner(id, fn) {
  runners[id] = fn
}

/**
 * @param {string} id
 */
export function getAction(id) {
  const meta = META[id]
  const defaults = getDefaults()
  return {
    id,
    label: meta ? meta.label : id,
    icon: meta ? meta.icon : '',
    shortcut: Array.isArray(defaults[id]) ? [...defaults[id]] : (defaults[id] ? [defaults[id]] : []),
    run: (...args) => {
      const fn = runners[id]
      if (typeof fn === 'function') return fn(...args)
      return undefined
    },
  }
}

export function getAllActions() {
  return ACTION_IDS.map(getAction)
}

export const actions = new Proxy({}, {
  get(_t, prop) {
    if (typeof prop !== 'string') return undefined
    return getAction(prop)
  },
})

/**
 * @param {string} id
 */
export function runAction(id, ...args) {
  const a = getAction(id)
  if (!a) return undefined
  return a.run(...args)
}

export default { ACTION_IDS, META, setRunners, setRunner, getAction, getAllActions, actions, runAction }