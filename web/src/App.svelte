<script>
  import { onMount, onDestroy, tick } from 'svelte'
  import CodeMirror from 'svelte-codemirror-editor'
  import { markdown } from '@codemirror/lang-markdown'
  import { createMarkdown } from './lib/markdown.js'
  import { EditorView } from '@codemirror/view'
  import { sanitizeHtml, renderDiagrams, setDiagramTypeEnabled } from './lib/diagrams.js'
  import { setIncludeEmbedMode } from './lib/markdown.js'
  import { THEMES, DEFAULT_THEME, applyTheme } from './lib/themes.js'
  import { transformCriticMarkup, wrapWithMarkers } from './lib/reviewTransforms.js'
  // transclude runtime uses fillIncludes (no text expansion)
  import { replaceOuterContent, removeOuter, insertReplyInside } from './lib/comments.js'
  import { getDefaults, findAction, mergeBindings } from './lib/keymap.js'
  import Icon from './lib/Icon.svelte'
  import Menu from './lib/Menu.svelte'
  import { setRunners, setRunner, runAction as registryRunAction, getAction } from './lib/actions.js'

  let html = ''
  let theme = DEFAULT_THEME
  let loading = true
  let error = ''
  let md
  let zoom = 1
  let diagramsEnabled = true
  let hideComments = false
  // review modes
  let reviewMode = null // null | 'highlight' | 'note'
  let statusMessage = ''
  let linkError = null
  let fullscreenDiagramHtml = null
  let includeOpenPath = null
  let currentIncludedPaths = []
  let includedUnwatch = []
  let settingsOpen = false
  let settings = { autosave: true, autoReload: true, autosaveInterval: 2000, diagramTypes: { mermaid: true, plantuml: true, dot: true, wavedrom: true, nomnoml: true }, embedLinkedMarkdown: true }  // sidebar
  let sidebarOpen = true
  let sidebarTab = 'outline'
  // Debug-only toolbar controls. Enable by visiting any URL with ?debug=1
  // (persisted to localStorage 'debug') or by setting localStorage.debug = 'true'.
  let debugEnabled = false
  let debugOpen = false
  let debugMenuEl = null
  // keybindings
  let bindings = mergeBindings(getDefaults(), {})
  let outlineItems = []
  let commentItems = []
  let activeHeadingLine = null
  // sidebar comment editing
  let editingCommentId = null
  let editingCommentText = ''
  let editingCommentAuthor = ''
  let contextMenu = null
  let activeCommentId = null
  let currentPath = ''
  let unwatch = null
  // navigation history
  let navHistory = []
  let navIndex = -1
  // review undo/redo
  let undoStack = []
  let redoStack = []
  let undoing = false
  let debounceTimer = null
  let lastHash = ''
  let storeHandle = null

  // editor state
  let text = ''
  let dirty = false
  let loadingFile = true
  let editorView = null
  let mdLang = null
  let extensions = []

  // panes / view mode
  let viewMode = 'preview'
  let leftPct = 50
  let splitEl = null
  let previewEl = null
  let editorPaneEl = null
  let previewPaneEl = null

  // disk conflict guard
  let conflict = null
  let ignoredDiskHash = null
  let externalChange = null
  // scroll sync
  let syncUntil = 0
  let programmaticScroll = false
  let userScrolledDuringFill = false
  let resizeObserver = null
  let resizeTimer = null
  let resizeAnchor = null
  let resizeObserverEnabled = false
  // Anchor at the last settled scroll position. Geometry changes (resize,
  // zoom, sidebar, reflow) must restore THIS, never an anchor captured after
  // the layout already moved.
  let restAnchor = null
  let restAnchorTimer = null
  let editorRafId = null
  let previewRafId = null
  let editorScrollListenerAttached = false
  let previewDebounce = null

  // save echo suppression
  let saving = false
  let lastSavedHash = null

  const isTauri = () => typeof window !== 'undefined' && !!window.__TAURI_INTERNALS__

  async function getStore() {
    if (storeHandle) return storeHandle
    const { load } = await import('@tauri-apps/plugin-store')
    storeHandle = await load('settings.json', { autoSave: false, defaults: {} })
    return storeHandle
  }

  async function persist(key, value) {
    if (isTauri()) {
      try {
        const store = await getStore()
        await store.set(key, value)
        await store.save()
      } catch (e) { console.warn('persist failed', e) }
      return
    }
    try { localStorage.setItem(key, JSON.stringify(value)) } catch (e) { console.warn('persist failed', e) }
  }

  function hashText(s) {
    let h = 0
    for (let i = 0; i < s.length; i++) {
      h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
    }
    return h + ':' + s.length
  }

  // scrollMode: 'anchor' keeps the logical position across reflows (same doc),
  // 'top' starts a freshly opened document at the top, 'none' leaves scrolling
  // to the caller (openPath with preserveScroll restores explicitly).
  async function loadText(source, scrollMode = 'anchor') {
    if (!md) md = createMarkdown()
    const baseDir = currentPath ? dirname(currentPath) : ''
    const h = hashText(source)
    if (h === lastHash && html) return
    const anchor = scrollMode === 'anchor' ? captureAnchor() : null
    userScrolledDuringFill = false
    lastHash = h
    html = sanitizeHtml(md.render(source))
    await tick()
    const root = document.querySelector('#rendered')
    if (root) {
      if (diagramsEnabled) await renderDiagrams(root)
      const included = await fillIncludes(root, 0, new Set(), baseDir)
      currentIncludedPaths = included
      await watchIncluded()
    }
    refreshSidebar()
    if (anchor && !userScrolledDuringFill) {
      requestAnimationFrame(() => restoreAnchor(anchor))
    } else if (scrollMode === 'top' && previewEl && !userScrolledDuringFill) {
      restAnchor = null
      programmaticScroll = true
      previewEl.scrollTop = 0
      requestAnimationFrame(() => { programmaticScroll = false })
    }
  }

  async function readPath(path) {
    if (isTauri()) {
      const { readTextFile } = await import('@tauri-apps/plugin-fs')
      return await readTextFile(path)
    }
    throw new Error('No file reader in browser mode')
  }

  function parentOf(p) { return p.replace(/[\\/][^\\/]*$/, '') }
  function baseOf(p) { const parts = p.split(/[\\/]/); return parts[parts.length - 1] }

  function schedulePreview(source) {
    clearTimeout(previewDebounce)
    previewDebounce = setTimeout(() => {
      loadText(source)
    }, 350)
  }

  function onEditorChange(value) {
    if (loadingFile) return
    text = value
    dirty = true
    scheduleAutosave()
    schedulePreview(value)
  }

  // scroll sync helpers
  function getPreviewTopSourceLine() {
    if (!previewEl) return null
    const rect = previewEl.getBoundingClientRect()
    const els = Array.from(previewEl.querySelectorAll('[data-source-line]')).filter((el) => !el.closest('.include-root'))
    let best = null
    for (const el of els) {
      const r = el.getBoundingClientRect()
      if (r.top >= rect.top - 2) { best = el; break }
    }
    if (!best && els.length) best = els[els.length - 1]
    if (!best) return null
    return { el: best, line: parseInt(best.getAttribute('data-source-line'), 10) }
  }

  function captureAnchor() {
    if (!previewEl) return null
    const rect = previewEl.getBoundingClientRect()
    const els = Array.from(previewEl.querySelectorAll('[data-source-line]')).filter((el) => !el.closest('.include-root'))
    let best = null
    for (const el of els) {
      const r = el.getBoundingClientRect()
      if (r.bottom > rect.top + 1) { best = el; break }
    }
    if (!best && els.length) best = els[0]
    if (!best) return null
    const line = parseInt(best.getAttribute('data-source-line'), 10)
    if (isNaN(line)) return null
    const frac = (best.getBoundingClientRect().top - rect.top) / Math.max(1, rect.height)
    return { line, frac }
  }

  function restoreAnchor(a) {
    if (!a || !previewEl) return
    const els = Array.from(previewEl.querySelectorAll('[data-source-line]')).filter((el) => !el.closest('.include-root'))
    const el = els.find((e) => parseInt(e.getAttribute('data-source-line'), 10) === a.line)
    if (!el) return
    const previewRect = previewEl.getBoundingClientRect()
    const r = el.getBoundingClientRect()
    const target = previewEl.scrollTop + (r.top - previewRect.top) - a.frac * previewRect.height
    programmaticScroll = true
    previewEl.scrollTop = Math.max(0, target)
    restAnchor = a
    requestAnimationFrame(() => { programmaticScroll = false })
  }

  // Recomputed lazily after the user stops scrolling (reading hundreds of
  // element rects on every scroll event would be wasteful).
  function noteRestAnchor() {
    clearTimeout(restAnchorTimer)
    restAnchorTimer = setTimeout(() => {
      if (!programmaticScroll) restAnchor = captureAnchor()
    }, 150)
  }

  function syncEditorToPreview() {
    if (!editorView || !previewEl) return
    const lineNo = editorView.state.doc.lineAt(editorView.viewport.from).number // 1-based
    const srcLine = lineNo - 1 // 0-based
    const els = Array.from(previewEl.querySelectorAll('[data-source-line]')).filter((el) => !el.closest('.include-root'))
    if (!els.length) return
    // find bracketing
    let lower = null, upper = null
    for (const el of els) {
      const sl = parseInt(el.getAttribute('data-source-line'), 10)
      if (isNaN(sl)) continue
      if (sl <= srcLine) lower = el
      if (sl >= srcLine && (upper === null || sl < parseInt(upper.getAttribute('data-source-line'), 10))) {
        if (sl >= srcLine) { upper = el; break }
      }
    }
    if (!lower && els.length) lower = els[0]
    if (!upper) upper = lower
    if (!lower) return
    const lowerSl = parseInt(lower.getAttribute('data-source-line'), 10) || 0
    const upperSl = parseInt(upper.getAttribute('data-source-line'), 10) || lowerSl
    const lowerTop = lower.offsetTop
    const upperTop = upper.offsetTop
    let target = lowerTop
    if (upperSl > lowerSl) {
      const ratio = (srcLine - lowerSl) / (upperSl - lowerSl)
      target = lowerTop + ratio * (upperTop - lowerTop)
    }
    syncUntil = performance.now() + 80
    previewEl.scrollTop = Math.max(0, target - 8)
  }

  function syncPreviewToEditor() {
    if (!editorView || !previewEl) return
    const info = getPreviewTopSourceLine()
    if (!info || isNaN(info.line)) return
    const targetLineNo = Math.min(editorView.state.doc.lines, Math.max(1, info.line + 1))
    const line = editorView.state.doc.line(targetLineNo)
    syncUntil = performance.now() + 80
    editorView.dispatch({ effects: EditorView.scrollIntoView(line.from, { y: 'start' }) })
  }

  // sidebar helpers
  function findAnchorForLine(line) {
    if (!previewEl) return null
    const els = Array.from(previewEl.querySelectorAll('[data-source-line]')).filter((el) => !el.closest('.include-root'))
    let best = null
    for (const el of els) {
      const sl = parseInt(el.getAttribute('data-source-line'), 10)
      if (isNaN(sl)) continue
      if (sl <= line) best = el
    }
    if (!best && els.length) best = els[0]
    return best
  }

  function updateSidebarActive() {
    if (!previewEl) return
    const info = getPreviewTopSourceLine()
    const topLine = info && !isNaN(info.line) ? info.line : 0
    let activeH = null
    for (const h of outlineItems) {
      if (h.line <= topLine + 1) activeH = h
      else break
    }
    activeHeadingLine = activeH ? activeH.line : (outlineItems.length ? outlineItems[0].line : null)
    let activeC = null
    for (const c of commentItems) {
      if (c.line <= topLine + 1) activeC = c
      else break
    }
    if (!activeC && commentItems.length) activeC = commentItems[0]
    activeCommentId = activeC ? activeC.id : null
  }

  function refreshSidebar() {
    const root = document.querySelector('#rendered')
    outlineItems = []
    commentItems = []
    if (!root) {
      activeHeadingLine = null
      activeCommentId = null
      return
    }
    outlineItems = Array.from(root.querySelectorAll('h1,h2,h3,h4,h5,h6')).map((h, i) => ({
      id: 'h-' + i,
      level: parseInt(h.tagName.slice(1), 10),
      text: (h.textContent || '').trim(),
      line: parseInt(h.getAttribute('data-source-line'), 10),
      el: h,
    }))
    let idx = 0
    const addRendered = (els, kind) => {
      els.forEach((el) => {
        const block = el.closest('[data-source-line]')
        const line = block ? parseInt(block.getAttribute('data-source-line'), 10) : NaN
        const safeLine = isNaN(line) ? 0 : line
        const anchor = el.getClientRects && el.getClientRects().length ? el : (block || findAnchorForLine(safeLine))
        const _parsed = parseCommentAuthor((el.textContent || '').trim())
        commentItems.push({
          id: 'c-' + (idx++),
          kind,
          text: _parsed.text,
          author: _parsed.author,
          line: safeLine,
          el,
          anchorEl: anchor,
        })
      })
    }
    addRendered(Array.from(root.querySelectorAll('.critic.comment')), 'critic')
    addRendered(Array.from(root.querySelectorAll('.obsidian-comment')), 'obsidian')

    // HTML comments from source (outside fenced code blocks)
    const masked = String(text).replace(/```[\s\S]*?```|~~~[\s\S]*?~~~/g, (block) => block.replace(/[^\n]/g, ' '))
    const htmlRegex = /<!--([\s\S]*?)-->/g
    let m
    while ((m = htmlRegex.exec(masked)) !== null) {
      const line = masked.slice(0, m.index).split('\n').length - 1
      const excerpt = m[1].trim().replace(/\s+/g, ' ')
      const anchor = findAnchorForLine(line)
      const _parsed2 = parseCommentAuthor(excerpt)
      commentItems.push({
        id: 'c-' + (idx++),
        kind: 'html',
        text: _parsed2.text,
        author: _parsed2.author,
        line,
        el: null,
        anchorEl: anchor,
      })
    }

    commentItems.sort((a, b) => a.line - b.line)
    commentItems = commentItems.slice()
    activeHeadingLine = outlineItems.length ? outlineItems[0].line : null
    activeCommentId = commentItems.length ? commentItems[0].id : null
    updateSidebarActive()
  }

  function scrollToHeading(item) {
    if (!item || !item.el || !previewEl) return
    const previewRect = previewEl.getBoundingClientRect()
    const r = item.el.getBoundingClientRect()
    previewEl.scrollTop += r.top - previewRect.top - 8
    activeHeadingLine = item.line
  }

  function scrollToComment(item) {
    if (!item || !previewEl) return
    let target = item.el
    if (!target || (target.getClientRects && target.getClientRects().length === 0)) {
      target = item.anchorEl || findAnchorForLine(item.line)
    }
    if (!target) return
    const previewRect = previewEl.getBoundingClientRect()
    const r = target.getBoundingClientRect()
    previewEl.scrollTop += r.top - previewRect.top - 8
    activeCommentId = item.id
  }

  function handleEditorScroll() {
    if (performance.now() < syncUntil) return
    if (editorRafId) cancelAnimationFrame(editorRafId)
    editorRafId = requestAnimationFrame(() => {
      editorRafId = null
      syncEditorToPreview()
    })
  }

  function handlePreviewScroll() {
    if (!programmaticScroll) { userScrolledDuringFill = true; noteRestAnchor() }
    updateSidebarActive()
    if (performance.now() < syncUntil) return
    if (previewRafId) cancelAnimationFrame(previewRafId)
    previewRafId = requestAnimationFrame(() => {
      previewRafId = null
      syncPreviewToEditor()
    })
  }

  async function watchIncluded() {
    for (const u of includedUnwatch) { try { await u() } catch {} }
    includedUnwatch = []
    if (!isTauri()) return
    const dirs = new Set(currentIncludedPaths.map((p) => parentOf(p)))
    for (const dir of dirs) {
      try {
        const { watch } = await import('@tauri-apps/plugin-fs')
        const uw = await watch(dir, (event) => {
          const paths = (event && (event.paths || (event.path && [event.path]))) || []
          if (!paths.some((p) => currentIncludedPaths.some((ip) => String(p).endsWith(baseOf(ip))))) return
          clearTimeout(debounceTimer)
          debounceTimer = setTimeout(async () => {
            if (!currentPath || saving || dirty) return
            try {
              lastHash = ''
              await loadText(text)
            } catch (e) { console.warn(e) }
          }, 300)
        }, { recursive: false, delayMs: 500 })
        includedUnwatch.push(uw)
      } catch (e) { console.warn(e) }
    }
  }

  async function watchParent(path) {
    if (!isTauri() || !path) return
    if (unwatch) { try { await unwatch() } catch {} ; unwatch = null }
    const parent = parentOf(path)
    const name = baseOf(path)
    try {
      const { watch } = await import('@tauri-apps/plugin-fs')
      unwatch = await watch(parent, (event) => {
        const paths = (event && (event.paths || (event.path && [event.path]))) || []
        if (!paths.some((p) => String(p).endsWith(name))) return
        clearTimeout(debounceTimer)
        debounceTimer = setTimeout(async () => {
          if (!currentPath || saving) return
          try {
            const newText = await readPath(currentPath)
            const newHash = hashText(newText)
            if (lastSavedHash && newHash === lastSavedHash) { lastSavedHash = null; return }
            if (newHash === hashText(text)) return
            if (dirty) {
              if (ignoredDiskHash && newHash === ignoredDiskHash) return
              conflict = { diskText: newText, diskHash: newHash }
              return
            }
            if (!settings.autoReload) {
              externalChange = { diskText: newText, diskHash: newHash }
              return
            }
            const prevScroll = previewEl ? previewEl.scrollTop : 0
            const prevEditorScroll = editorView ? editorView.scrollDOM.scrollTop : 0
            loadingFile = true
            text = newText
            await loadText(newText)
            loadingFile = false
            dirty = false
            await tick()
            requestAnimationFrame(() => {
              if (previewEl) previewEl.scrollTop = prevScroll
              if (editorView) editorView.scrollDOM.scrollTop = prevEditorScroll
            })
          } catch (e) { console.warn(e) }
        }, 300)
      }, { recursive: false, delayMs: 500 })
    } catch (e) {
      console.warn('watch failed', e)
    }
  }

  async function openPath(path, preserveScroll = false, fromNav = false) {
    if (!path) return false
    const prevPath = currentPath
    // dirty guard for switching to a different document
    if (dirty && path !== currentPath && path !== '') {
      try {
        const t = await readPath(path)
        conflict = { diskText: t, diskHash: hashText(t), path, navigation: true }
      } catch (e) {
        error = String(e)
      }
      return false
    }
    conflict = null
    ignoredDiskHash = null
    loading = true
    error = ''
    const anchor = preserveScroll ? captureAnchor() : null
    const prevEditorScroll = preserveScroll ? (editorView ? editorView.scrollDOM.scrollTop : 0) : 0
    try {
      let t
      try { t = await readPath(path) }
      catch (e) {
        if (!isTauri()) {
          const r = await fetch(path)
          if (!r.ok) throw e
          t = await r.text()
        } else throw e
      }
      loadingFile = true
      currentPath = path
      text = t
      lastHash = ''
      await loadText(t, preserveScroll ? 'none' : 'top')
      loadingFile = false
      dirty = false
      lastSavedHash = null
      if (preserveScroll) {
        await tick()
        requestAnimationFrame(() => {
          if (anchor) restoreAnchor(anchor)
          if (editorView) editorView.scrollDOM.scrollTop = prevEditorScroll
        })
      }
      await watchParent(path)
      // history push
      if (!fromNav && path && path !== prevPath) {
        if (navIndex < navHistory.length - 1) navHistory = navHistory.slice(0, navIndex + 1)
        if (navHistory.length === 0 || navHistory[navHistory.length - 1] !== path) {
          navHistory.push(path)
          if (navHistory.length > 50) { navHistory.shift() }
          navHistory = [...navHistory]
        }
        navIndex = navHistory.length - 1
      }
      // clear undo/redo on doc switch
      if (path !== prevPath) {
        undoStack = []
        redoStack = []
      }
      return true
    } catch (e) {
      error = String(e)
      html = ''
      lastHash = ''
      return false
    } finally {
      loadingFile = false
      loading = false
    }
  }

  async function loadFixture() {
    loading = true
    error = ''
    try {
      const r = await fetch('/fixture.md')
      currentPath = 'fixture.md'
      if (!r.ok) throw new Error('fixture not found (' + r.status + ')')
      const t = await r.text()
      loadingFile = true
      text = t
      lastHash = ''
      await loadText(t, 'top')
      loadingFile = false
      navHistory = ['fixture.md']
      navIndex = 0
    } catch (e) {
      error = String(e)
    } finally {
      loadingFile = false
      loading = false
    }
  }

  async function loadReviewFixture() {
    loading = true
    error = ''
    try {
      const r = await fetch('/fixture-review.md')
      currentPath = 'fixture-review.md'
      if (!r.ok) throw new Error('review fixture not found (' + r.status + ')')
      const t = await r.text()
      loadingFile = true
      text = t
      lastHash = ''
      await loadText(t, 'top')
      loadingFile = false
      navHistory = ['fixture-review.md']
      navIndex = 0
    } catch (e) {
      error = String(e)
    } finally {
      loadingFile = false
      loading = false
    }
  }

  async function onFile(e) {
    const f = e.target.files && e.target.files[0]
    if (!f) return
    loading = true
    error = ''
    try {
      const t = await f.text()
      loadingFile = true
      text = t
      currentPath = f.name
      lastHash = ''
      await loadText(t, 'top')
      loadingFile = false
      dirty = false
      const p = f.name
      if (navHistory.length === 0 || navHistory[navHistory.length - 1] !== p) {
        if (navIndex < navHistory.length - 1) navHistory = navHistory.slice(0, navIndex + 1)
        navHistory.push(p)
        if (navHistory.length > 50) navHistory.shift()
        navHistory = [...navHistory]
        navIndex = navHistory.length - 1
      }
      undoStack = []
      redoStack = []
    } catch (err) {
      error = String(err)
    } finally {
      loadingFile = false
      loading = false
    }
  }

  async function setTheme(next) {
    const a = captureAnchor()
    theme = next
    applyTheme(theme)
    persist('theme', theme)
    const root = document.querySelector('#rendered')
    if (root) {
      root.querySelectorAll('.diagram-placeholder').forEach((ph) => {
        ph.dataset.rendered = ''
        ph.innerHTML = ''
      })
      if (diagramsEnabled) await renderDiagrams(root)
    }
    requestAnimationFrame(() => restoreAnchor(a))
  }

  async function saveFile() {
    if (isTauri()) {
      if (!currentPath) return
      saving = true
      try {
        const { writeTextFile } = await import('@tauri-apps/plugin-fs')
        lastSavedHash = hashText(text)
        await writeTextFile(currentPath, text)
        dirty = false
      } catch (e) { error = String(e) }
      finally { saving = false }
      return
    }
    // browser mode: keep the dirty flow functional (no disk) by clearing dirty
    lastSavedHash = hashText(text)
    dirty = false
    showStatus('saved')
  }

  async function reloadFile() {
    if (isTauri() && currentPath) {
      await openPath(currentPath, false)
      return
    }
    await loadFixture()
  }

  async function exitApp() {
    if (!isTauri()) return
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window')
      await getCurrentWindow().close()
    } catch (e) { error = String(e) }
  }
  function pushUndo(prevText, nextText) {
    if (undoing) return
    if (prevText === nextText) return
    undoStack.push({ prevText, nextText })
    if (undoStack.length > 100) undoStack.shift()
    redoStack = []
  }

  async function applyTransformedText(newText) {
    if (newText === text) return
    const prev = text
    loadingFile = true
    text = newText
    lastHash = ''
    await loadText(newText)
    loadingFile = false
    dirty = true
    scheduleAutosave()
    pushUndo(prev, newText)
  }

  async function setReviewText(newText) {
    if (newText === text) return
    loadingFile = true
    text = newText
    lastHash = ''
    await loadText(newText)
    loadingFile = false
    dirty = true
    scheduleAutosave()
  }

  async function undoReview() {
    if (undoStack.length === 0) return
    const entry = undoStack.pop()
    redoStack.push(entry)
    undoing = true
    await setReviewText(entry.prevText)
    undoing = false
  }

  async function redoReview() {
    if (redoStack.length === 0) return
    const entry = redoStack.pop()
    undoStack.push(entry)
    undoing = true
    await setReviewText(entry.nextText)
    undoing = false
  }

  async function wrapSelection(kind) {
    if (!editorView) { showStatus('select text in the editor first'); return }
    const sel = editorView.state.selection.main
    const selected = editorView.state.sliceDoc(sel.from, sel.to)
    if (!selected.length && sel.from === 0 && sel.to === 0) {
      showStatus('select text in the editor first')
      return
    }
    const prevText = text
    const replacement = wrapWithMarkers(selected, kind)
    const placeholder = ({ addition: 'added', deletion: 'removed', highlight: 'highlighted', comment: 'comment' })[kind] || 'text'
    editorView.dispatch({
      changes: { from: sel.from, to: sel.to, insert: replacement },
      selection: selected.length
        ? { anchor: sel.from + replacement.length }
        : { anchor: sel.from + (replacement.indexOf(placeholder) >= 0 ? replacement.indexOf(placeholder) : 0), head: sel.from + (replacement.indexOf(placeholder) >= 0 ? replacement.indexOf(placeholder) + placeholder.length : replacement.length) },
    })
    await tick()
    const newText = editorView ? editorView.state.doc.toString() : text
    if (newText !== text) {
      text = newText
      dirty = true
      scheduleAutosave()
    }
    pushUndo(prevText, newText)
  }

  function acceptAll() { applyTransformedText(transformCriticMarkup(text, 'accept')) }
  function rejectAll() { applyTransformedText(transformCriticMarkup(text, 'reject')) }
  function acceptSelection() {
    if (!editorView) return
    const sel = editorView.state.selection.main
    const selected = editorView.state.sliceDoc(sel.from, sel.to)
    if (!selected) return
    const transformed = transformCriticMarkup(selected, 'accept')
    editorView.dispatch({ changes: { from: sel.from, to: sel.to, insert: transformed } })
  }
  function rejectSelection() {
    if (!editorView) return
    const sel = editorView.state.selection.main
    const selected = editorView.state.sliceDoc(sel.from, sel.to)
    if (!selected) return
    const transformed = transformCriticMarkup(selected, 'reject')
    editorView.dispatch({ changes: { from: sel.from, to: sel.to, insert: transformed } })
  }

  function toggleComments() {
    hideComments = !hideComments
    persist('hideComments', hideComments)
  }
  function parseCommentAuthor(raw) {
    const m = String(raw || '').trim().match(/^@([A-Za-z0-9_-]+)[:\s]\s*([\s\S]*)$/)
    if (m) return { author: m[1], text: m[2].trim() }
    return { author: null, text: String(raw || '').trim() }
  }
  function startEditComment(item) {
    editingCommentId = item.id
    editingCommentAuthor = item.author || ''
    editingCommentText = item.text || ''
  }
  function openContextMenu(e, item) {
    e.preventDefault()
    contextMenu = { x: e.clientX, y: e.clientY, item }
  }
  function closeContextMenu() {
    contextMenu = null
  }
  function cancelEditComment() {
    editingCommentId = null
    editingCommentText = ''
    editingCommentAuthor = ''
  }
  async function focusNewComment(item) {
    if (!item) {
      sidebarOpen = true
      setSidebarTab('comments')
      persist('sidebarOpen', true)
      return
    }
    sidebarOpen = true
    setSidebarTab('comments')
    persist('sidebarOpen', true)
    await tick()
    startEditComment(item)
    await tick()
    const ta = document.querySelector('.comment-text-input')
    if (ta) { ta.focus(); try { ta.selectionStart = ta.selectionEnd = ta.value.length } catch {} }
  }
  function isIncludedComment(item) {
    const el = item && (item.el || item.anchorEl)
    return !!(el && typeof el.closest === 'function' && el.closest('.include-root'))
  }
  function criticIndexFor(item) {
    const idx = commentItems.findIndex((c) => c.id === item.id)
    let ci = 0
    for (let i = 0; i <= idx && i < commentItems.length; i++) {
      if (commentItems[i].kind === 'critic' || commentItems[i].kind === 'obsidian') ci++
    }
    return Math.max(0, ci - 1)
  }
  async function saveEditComment(item) {
    if (isIncludedComment(item)) {
      const el = item.el || item.anchorEl
      const ir = el && typeof el.closest === 'function' ? el.closest('.include-root') : null
      includeOpenPath = ir ? (ir.getAttribute('data-include-path') || null) : includeOpenPath
      showStatus('included from ' + (includeOpenPath || '') + ' — open that file to edit')
      return
    }
    const newInner = editingCommentAuthor ? ('@' + editingCommentAuthor + ': ' + editingCommentText).trim() : editingCommentText.trim()
    const ci = criticIndexFor(item)
    const newText = replaceOuterContent(text, ci, newInner)
    if (newText !== text) {
      await applyTransformedText(newText)
    }
    cancelEditComment()
  }
  async function deleteComment(item) {
    if (isIncludedComment(item)) {
      const el = item.el || item.anchorEl
      const ir = el && typeof el.closest === 'function' ? el.closest('.include-root') : null
      includeOpenPath = ir ? (ir.getAttribute('data-include-path') || null) : includeOpenPath
      showStatus('included from ' + (includeOpenPath || '') + ' — open that file to edit')
      return
    }
    const ci = criticIndexFor(item)
    const newText = removeOuter(text, ci)
    if (newText !== text) {
      await applyTransformedText(newText)
      showStatus('comment deleted')
    }
  }
  async function replyComment(item) {
    if (isIncludedComment(item)) {
      const el = item.el || item.anchorEl
      const ir = el && typeof el.closest === 'function' ? el.closest('.include-root') : null
      includeOpenPath = ir ? (ir.getAttribute('data-include-path') || null) : includeOpenPath
      showStatus('included from ' + (includeOpenPath || '') + ' — open that file to edit')
      return
    }
    const ci = criticIndexFor(item)
    const beforeIds = new Set(commentItems.map((c) => c.id))
    const newText = insertReplyInside(text, ci, '{>> <<}')
    if (newText !== text) {
      await applyTransformedText(newText)
      await tick()
      const newItem = commentItems.find((c) => !beforeIds.has(c.id)) ||
        commentItems.filter((c) => c.line >= item.line).pop()
      await focusNewComment(newItem)
    }
  }
  function cancelReviewMode() {
    reviewMode = null
  }

  function dirname(p) {
    const s = String(p || '')
    const i = Math.max(s.lastIndexOf('/'), s.lastIndexOf('\\\\'))
    if (i < 0) return ''
    return s.slice(0, i)
  }
  function normalizePath(p) {
    const leading = String(p || '').startsWith('/') ? '/' : ''
    const out = []
    for (const part of String(p || '').split('/')) {
      if (part === '' || part === '.') continue
      if (part === '..') { out.pop(); continue }
      out.push(part)
    }
    return leading + out.join('/')
  }
  function resolveLocalPath(href) {
    return resolvePathAgainst(dirname(currentPath), href)
  }
  function resolvePathAgainst(baseDir, href) {
    const clean = String(href || '').split('#')[0].split('?')[0]
    if (clean.startsWith('/')) return normalizePath(clean)
    const base = baseDir || ''
    return normalizePath((base ? base + '/' : '') + clean)
  }
  function validateMarkdownSource(src) {
    if (!src || !String(src).trim()) return false
    const body = String(src).replace(/^---\\s*\\n[\\s\\S]*?\\n---\\s*\\n/, '')
    if (!body.trim()) return false
    try { md.parse(String(src), {}) } catch (e) { return false }
    return true
  }
  async function openExternal(url) {
    if (isTauri()) {
      try {
        const { openUrl } = await import('@tauri-apps/plugin-opener')
        await openUrl(url)
      } catch (e) { showStatus('Could not open link') }
    } else {
      window.open(url, '_blank', 'noopener,noreferrer')
    }
  }
  async function readFileForInclude(p) {
    try { return await readPath(p) } catch (e) {
      if (!isTauri()) {
        const resp = await fetch(p)
        if (!resp.ok) throw new Error('not found')
        const txt = await resp.text()
        if (txt.includes('<div id="app"') && !/# /.test(txt) && !txt.includes('```')) throw new Error('not found')
        return txt
      }
      throw e
    }
  }

  async function fillIncludes(root, depth, visited, baseDir) {
    const collected = []
    const placeholders = Array.from(root.querySelectorAll('.include-placeholder'))
    for (const ph of placeholders) {
      if (ph.dataset.filled === '1') continue
      ph.dataset.filled = '1'
      const rawPath = ph.getAttribute('data-include-path') || ''
      let lineNo = ph.getAttribute('data-include-line') || '0'
      if (!lineNo || lineNo === 'undefined' || lineNo === 'null') lineNo = '0'
      const resolved = resolvePathAgainst(baseDir, rawPath)
      const container = document.createElement('div')
      container.className = 'include-root'
      container.setAttribute('data-include-path', resolved)
      container.setAttribute('data-include-line', lineNo)
      const header = document.createElement('div')
      header.className = 'include-header'
      const pathSpan = document.createElement('span')
      pathSpan.className = 'include-path'
      pathSpan.textContent = '📄 ' + resolved
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'include-open'
      btn.setAttribute('data-include-open', resolved)
      btn.textContent = 'Open ↗'
      header.appendChild(pathSpan)
      header.appendChild(btn)
      container.appendChild(header)

      if (visited.has(resolved)) {
        container.setAttribute('data-include-error', 'cycle: ' + resolved)
        const msg = document.createElement('div')
        msg.textContent = 'cycle: ' + resolved
        container.appendChild(msg)
      } else if (depth >= 5) {
        container.setAttribute('data-include-error', 'max depth exceeded: ' + resolved)
        const msg = document.createElement('div')
        msg.textContent = 'max depth exceeded: ' + resolved
        container.appendChild(msg)
      } else {
        let content = null
        let err = null
        try { content = await readFileForInclude(resolved) } catch (e) { err = e }
        if (err) {
          container.setAttribute('data-include-error', 'could not read: ' + resolved)
          const msg = document.createElement('div')
          msg.textContent = 'could not read: ' + resolved
          container.appendChild(msg)
        } else if (content.length > 512 * 1024) {
          container.setAttribute('data-include-error', 'file too large: ' + resolved)
          const msg = document.createElement('div')
          msg.textContent = 'file too large: ' + resolved
          container.appendChild(msg)
        } else {
          const ext = (resolved.split('.').pop() || '').toLowerCase()
          const innerMd = ext === 'mmd' ? '```mermaid\n' + content + '\n```' : content
          const nestedBaseDir = resolved.replace(/[^/\\\\]*$/, '') || ''
          const nestedVisited = new Set(visited)
          nestedVisited.add(resolved)
          const innerHtml = md.render(innerMd)
          const innerDiv = document.createElement('div')
          innerDiv.innerHTML = sanitizeHtml(innerHtml)
          const nestedIncluded = await fillIncludes(innerDiv, depth + 1, nestedVisited, nestedBaseDir)
          collected.push(resolved, ...nestedIncluded)
          while (innerDiv.firstChild) container.appendChild(innerDiv.firstChild)
        }
      }
      if (!container.getAttribute('data-include-error')) collected.push(resolved)
      ph.replaceWith(container)
    }
    // nested placeholders inside replaced containers already filled; but placeholders in root only
    return collected
  }

  async function handleLinkedDocument(resolved, src, renderOnly) {
    const prevPath = currentPath
    let finalSrc = src
    if (renderOnly) finalSrc = '```mermaid\n' + src + '\n```'
    // dirty guard
    if (dirty && resolved !== currentPath) {
      conflict = { diskText: finalSrc, diskHash: hashText(finalSrc), path: resolved, navigation: true }
      return
    }
    // mimic openPath but with provided text
    conflict = null
    ignoredDiskHash = null
    loading = true
    error = ''
    try {
      loadingFile = true
      currentPath = resolved
      text = finalSrc
      lastHash = ''
      await loadText(finalSrc, 'top')
      loadingFile = false
      dirty = false
      lastSavedHash = null
      await watchParent(resolved)
      if (resolved && resolved !== prevPath) {
        if (navIndex < navHistory.length - 1) navHistory = navHistory.slice(0, navIndex + 1)
        if (navHistory.length === 0 || navHistory[navHistory.length - 1] !== resolved) {
          navHistory.push(resolved)
          if (navHistory.length > 50) navHistory.shift()
          navHistory = [...navHistory]
        }
        navIndex = navHistory.length - 1
      }
      if (resolved !== prevPath) {
        undoStack = []
        redoStack = []
      }
    } catch (e) {
      error = String(e)
      html = ''
      lastHash = ''
    } finally {
      loadingFile = false
      loading = false
    }
  }
  function toggleDiagramFullwidth(ph) {
    if (!ph) return
    ph.classList.toggle('diagram-fullwidth')
  }
  function openDiagramFullscreen(ph) {
    if (!ph) return
    fullscreenDiagramHtml = ph.innerHTML
    try { document.body.style.overflow = 'hidden' } catch {}
  }
  function closeDiagramFullscreen() {
    fullscreenDiagramHtml = null
    try { document.body.style.overflow = '' } catch {}
  }

  async function openIncludedPath(rawPath) {
    const resolved = resolveLocalPath(rawPath)
    includeOpenPath = null
    if (!isTauri()) {
      showStatus('open locally')
      return
    }
    await openPath(resolved, false)
  }

  async function handlePreviewClick(e) {
    const includeBtn = e.target && typeof e.target.closest === 'function' ? e.target.closest('[data-include-open]') : null
    if (includeBtn) {
      e.stopPropagation()
      const raw = includeBtn.getAttribute('data-include-open') || ''
      await openIncludedPath(raw)
      return
    }
    const ctrl = e.target && typeof e.target.closest === 'function' ? e.target.closest('[data-diagram-action]') : null
    if (ctrl) {
      e.preventDefault()
      e.stopPropagation()
      const ph = ctrl.closest('.diagram-placeholder')
      const action = ctrl.getAttribute('data-diagram-action')
      if (action === 'fullwidth') toggleDiagramFullwidth(ph)
      else if (action === 'fullscreen') openDiagramFullscreen(ph)
      return
    }
    const a = e.target && typeof e.target.closest === 'function' ? e.target.closest('a') : null
    if (!a) return
    const href = (a.getAttribute('href') || a.getAttribute('data-href') || '').trim()
    if (!href) return
    e.preventDefault()
    e.stopPropagation()

    if (href.startsWith('#')) {
      const id = decodeURIComponent(href.slice(1))
      const el = document.getElementById(id)
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' })
        el.classList.add('heading-flash')
        setTimeout(() => { try { el.classList.remove('heading-flash') } catch {} }, 1200)
      } else {
        showStatus('Heading not found: ' + href)
      }
      return
    }

    const schemeMatch = href.match(/^([a-z][a-z0-9+.-]*):/i)
    const scheme = schemeMatch ? schemeMatch[1].toLowerCase() : ''
    const allowedSchemes = ['http', 'https', 'mailto', 'tel', 'file']
    if (scheme && !allowedSchemes.includes(scheme)) {
      showStatus('Unsupported link: ' + scheme + ':')
      return
    }
    if (scheme === 'http' || scheme === 'https' || scheme === 'mailto' || scheme === 'tel') {
      await openExternal(href)
      return
    }

    let localPath = href
    if (scheme === 'file') localPath = decodeURIComponent(href.replace(/^file:\/\//i, ''))
    localPath = localPath.split('#')[0].split('?')[0]
    if (!localPath) return
    const ext = (localPath.split('.').pop() || '').toLowerCase()
    const docExts = ['md', 'markdown', 'mmd']
    if (!docExts.includes(ext)) {
      if (isTauri()) {
        try {
          const { openPath: openSysPath } = await import('@tauri-apps/plugin-opener')
          await openSysPath(resolveLocalPath(localPath))
        } catch (err) { showStatus('Could not open file') }
      } else {
        showStatus('external file — open locally')
      }
      return
    }

    const resolved = resolveLocalPath(localPath)
    let src = ''
    let readOk = false
    try {
      src = await readPath(resolved)
      readOk = true
    } catch (err) {
      if (!isTauri()) {
        try {
          const r = await fetch(resolved)
          if (!r.ok) throw new Error('not found')
          src = await r.text()
          readOk = true
        } catch (e) { readOk = false }
      }
    }
    if (!readOk) {
      linkError = { path: resolved, message: 'Could not read file: ' + resolved }
      return
    }
    if (!validateMarkdownSource(src)) {
      linkError = { path: resolved, message: 'Could not parse document: ' + resolved }
      return
    }
    await handleLinkedDocument(resolved, src, ext === 'mmd')
  }

  function lineOffset(lines, lineIndex) {
    let off = 0
    for (let i = 0; i < lineIndex; i++) off += (lines[i] ? lines[i].length : 0) + 1
    return off
  }

  function blockSourceRange(blockEl) {
    const startLine = parseInt(blockEl.getAttribute('data-source-line'), 10)
    const all = Array.from(previewEl.querySelectorAll('[data-source-line]'))
    const idx = all.indexOf(blockEl)
    let endLine = text.split('\n').length
    if (idx >= 0 && idx < all.length - 1) {
      endLine = parseInt(all[idx + 1].getAttribute('data-source-line'), 10)
    }
    if (isNaN(endLine) || endLine <= startLine) {
      // ensure at least one source line
      endLine = startLine + 1
    }
    // instrumentation removed
    if (isNaN(startLine)) return null
    if (isNaN(endLine)) endLine = text.split('\n').length
    return { startLine, endLine }
  }

  async function applyBlockEdit(blockEl, transform) {
    const range = blockSourceRange(blockEl)
    // instrumentation removed
    if (!range) return { ok: false, line: null }
    const lines = text.split('\n')
    const startOff = lineOffset(lines, range.startLine)
    const endOff = lineOffset(lines, range.endLine)
    const chunk = text.slice(startOff, endOff)
    const newChunk = transform(chunk)
    // instrumentation removed
    if (newChunk === null || newChunk === chunk) return { ok: false, line: range.startLine }
    const newText = text.slice(0, startOff) + newChunk + text.slice(endOff)
    await applyTransformedText(newText)
    return { ok: true, line: range.startLine }
  }

  async function onPreviewMouseUp() {
    if (!reviewMode || !previewEl) return
    statusMessage = ''
    clearTimeout(statusTimer)
    const _sel = window.getSelection()
    // instrumentation removed
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0) return
    const range = sel.getRangeAt(0)
    if (!previewEl.contains(range.commonAncestorContainer)) return

    const startNode = range.startContainer.nodeType === 3 ? range.startContainer.parentElement : range.startContainer
    const endNode = range.endContainer.nodeType === 3 ? range.endContainer.parentElement : range.endContainer
    const startBlock = startNode ? startNode.closest('[data-source-line]') : null
    const endBlock = endNode ? endNode.closest('[data-source-line]') : null
    // instrumentation removed

    if (!startBlock || !endBlock) {
      showStatus('cannot place comment here')
      sel.removeAllRanges()
      return
    }
    if (startBlock !== endBlock) {
      showStatus('select within one paragraph')
      return
    }
    const includeRoot = startBlock ? startBlock.closest('.include-root') : null
    if (includeRoot) {
      includeOpenPath = includeRoot.getAttribute('data-include-path') || null
      showStatus('included from ' + (includeRoot.getAttribute('data-include-path') || '') + ' — open that file to edit')
      sel.removeAllRanges()
      return
    }

    const selected = sel.toString()
    const beforeIds = new Set(commentItems.map((c) => c.id))

    if (reviewMode === 'highlight') {
      if (!selected.trim()) { sel.removeAllRanges(); return }
      const res = await applyBlockEdit(startBlock, (chunk) => {
        const pos = chunk.indexOf(selected)
        if (pos === -1) { showStatus('selection not found in source'); return null }
        return chunk.slice(0, pos) + '{==' + selected + '==}' + chunk.slice(pos + selected.length)
      })
      if (res.ok) reviewMode = null
    } else if (reviewMode === 'delete') {
      if (!selected.trim()) { sel.removeAllRanges(); return }
      const res = await applyBlockEdit(startBlock, (chunk) => {
        const pos = chunk.indexOf(selected)
        if (pos === -1) { showStatus('selection not found in source'); return null }
        return chunk.slice(0, pos) + '{--' + selected + '--}' + chunk.slice(pos + selected.length)
      })
      if (res.ok) reviewMode = null
    } else if (reviewMode === 'note') {
      let res = null
      let blockLine = null
      if (selected.trim()) {
        res = await applyBlockEdit(startBlock, (chunk) => {
          const pos = chunk.indexOf(selected)
          if (pos === -1) { showStatus('selection not found in source'); return null }
          const wrapped = '{==' + selected + ' {>> <<}==}'
          return chunk.slice(0, pos) + wrapped + chunk.slice(pos + selected.length)
        })
        blockLine = res.line
      } else {
        // instrumentation removed
        const clickNode = range.startContainer.nodeType === 3 ? range.startContainer : range.startContainer.firstChild
        const clickOffset = range.startOffset
        const renderedPrefix = (clickNode && clickNode.textContent) ? clickNode.textContent.slice(0, clickOffset) : ''
        const r = blockSourceRange(startBlock)
        const linesArr = text.split('\n')
        const startOff = r ? lineOffset(linesArr, r.startLine) : -1
        const endOff = r ? lineOffset(linesArr, r.endLine) : -1
        if (startOff < 0) {
          showStatus('cannot place comment here')
          sel.removeAllRanges()
          return
        }
        const chunk = text.slice(startOff, endOff)
        let pos = -1
        if (renderedPrefix.trim()) {
          pos = chunk.indexOf(renderedPrefix)
          if (pos === -1) pos = chunk.lastIndexOf(renderedPrefix.trim())
        }
        if (renderedPrefix.trim() && pos === -1) {
          showStatus('cannot place comment here')
          sel.removeAllRanges()
          return
        }
        const insertAt = pos === -1 ? chunk.length : pos + renderedPrefix.length
        res = await applyBlockEdit(startBlock, (c) => {
          return c.slice(0, insertAt) + ' {>> <<}' + c.slice(insertAt)
        })
        blockLine = res.line
      }
      if (res.ok) {
        reviewMode = null
        const newItem = commentItems.find((c) => !beforeIds.has(c.id)) ||
          commentItems.filter((c) => blockLine == null || c.line >= blockLine).pop()
        await focusNewComment(newItem)
      }
    }
    try { sel.removeAllRanges() } catch (e) {}
  }
  function showStatus(msg) {
    statusMessage = msg
    clearTimeout(statusTimer)
    statusTimer = setTimeout(() => { statusMessage = '' }, 2500)
  }
  let statusTimer = null
  let autosaveTimer = null
  function scheduleAutosave() {
    if (autosaveTimer) return
    autosaveTimer = setTimeout(async () => {
      autosaveTimer = null
      if (!settings.autosave || !dirty || !currentPath || conflict || externalChange) return
      await saveFile()
    }, settings.autosaveInterval || 2000)
  }

  $: if (!dirty && autosaveTimer) { clearTimeout(autosaveTimer); autosaveTimer = null }

  function toggleSidebar() {
    sidebarOpen = !sidebarOpen
    persist('sidebarOpen', sidebarOpen)
  }
  function closeDebugMenu() {
    if (debugMenuEl) debugMenuEl.open = false
    debugOpen = false
  }
  function persistSettings() {
    try { localStorage.setItem('settings', JSON.stringify(settings)) } catch {}
    persist('settings', settings)
    applySettingsSideEffects()
  }  function applySettingsSideEffects() {
    try { setIncludeEmbedMode(settings.embedLinkedMarkdown !== false) } catch (e) {}
    const dt = settings.diagramTypes || {}
    for (const k of ['mermaid','plantuml','dot','wavedrom','nomnoml']) {
      setDiagramTypeEnabled(k, dt[k] !== false)
    }
  }
  function setSidebarTab(tab) {
    sidebarTab = tab
    persist('sidebarTab', tab)
  }

  async function toggleViewMode() {
    const a = captureAnchor()
    viewMode = viewMode === 'preview' ? 'split' : 'preview'
    persist('viewMode', viewMode)
    await tick()
    attachEditorScrollListener()
    requestAnimationFrame(() => {
      if (editorView) {
        try { editorView.requestMeasure() } catch (e) { console.warn(e) }
      }
      restoreAnchor(a)
    })
  }

  async function reloadFromDisk() {
    if (!conflict) return
    const a = captureAnchor()
    const newText = conflict.diskText
    const targetPath = conflict.path
    const wasNav = !!conflict.navigation
    ignoredDiskHash = null
    conflict = null
    loadingFile = true
    if (targetPath && targetPath !== currentPath) {
      currentPath = targetPath
      await watchParent(targetPath)
    }
    text = newText
    lastHash = ''
    await loadText(newText)
    loadingFile = false
    dirty = false
    lastSavedHash = null
    requestAnimationFrame(() => restoreAnchor(a))
    // if this was a navigation, advance history index now
    if (wasNav && targetPath) {
      const idx = navHistory.indexOf(targetPath)
      if (idx >= 0) navIndex = idx
      else {
        navHistory.push(targetPath)
        if (navHistory.length > 50) navHistory.shift()
        navHistory = [...navHistory]
        navIndex = navHistory.length - 1
      }
      undoStack = []
      redoStack = []
    }
  }

  function keepEditing() {
    if (!conflict) return
    ignoredDiskHash = conflict.diskHash
    conflict = null
  }

  async function navBack() {
    if (navIndex <= 0) return
    const target = navHistory[navIndex - 1]
    const ok = await openPath(target, false, true)
    if (ok) navIndex--
    navHistory = [...navHistory]
  }

  async function navForward() {
    if (navIndex >= navHistory.length - 1) return
    const target = navHistory[navIndex + 1]
    const ok = await openPath(target, false, true)
    if (ok) navIndex++
    navHistory = [...navHistory]
  }

  function applyZoom() {
    const a = captureAnchor()
    document.documentElement.style.fontSize = (16 * zoom) + 'px'
    requestAnimationFrame(() => requestAnimationFrame(() => restoreAnchor(a)))
  }
  function zoomIn() { zoom = Math.min(3, +(zoom + 0.1).toFixed(2)); applyZoom(); persist('zoom', zoom) }
  function zoomOut() { zoom = Math.max(0.5, +(zoom - 0.1).toFixed(2)); applyZoom(); persist('zoom', zoom) }
  // Ctrl+wheel: proportional, accumulated — a small flick must be a small step.
  // ~1% zoom per 30px of deltaY (normalized across deltaMode); buttons keep 10% steps.
  let zoomWheelAccum = 0
  let zoomWheelPersistTimer = null
  function wheelDeltaPx(e) {
    const d = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * 100 : e.deltaY
    return Math.max(-240, Math.min(240, d)) // clamp per-event spike (fast trackpads)
  }
  function handleCtrlWheelZoom(e) {
    zoomWheelAccum += wheelDeltaPx(e)
    let applied = false
    while (Math.abs(zoomWheelAccum) >= 30) {
      const step = (zoomWheelAccum > 0 ? -0.01 : 0.01) // wheel down = zoom out
      zoom = Math.max(0.5, Math.min(3, +(zoom + step).toFixed(3)))
      zoomWheelAccum -= zoomWheelAccum > 0 ? 30 : -30
      applied = true
    }
    if (applied) {
      applyZoom()
      clearTimeout(zoomWheelPersistTimer)
      zoomWheelPersistTimer = setTimeout(() => persist('zoom', zoom), 400)
    }
  }
  function resetZoom() { zoom = 1; applyZoom(); persist('zoom', zoom) }

  async function toggleDiagrams() {
    const a = captureAnchor()
    diagramsEnabled = !diagramsEnabled
    const root = document.querySelector('#rendered')
    if (root) {
      root.querySelectorAll('.diagram-placeholder').forEach((ph) => {
        ph.dataset.rendered = ''
        ph.innerHTML = ''
      })
      if (diagramsEnabled) await renderDiagrams(root)
    }
    persist('diagramsEnabled', diagramsEnabled)
    requestAnimationFrame(() => restoreAnchor(a))
  }

  async function rerenderDiagrams() {
    const a = captureAnchor()
    const root = document.querySelector('#rendered')
    if (!root) return
    root.querySelectorAll('.diagram-placeholder').forEach((ph) => {
      ph.dataset.rendered = ''
      ph.innerHTML = ''
    })
    if (diagramsEnabled) await renderDiagrams(root)
    requestAnimationFrame(() => restoreAnchor(a))
  }

  function startResize(e) {
    const startX = e.clientX
    const startPct = leftPct
    const containerWidth = splitEl ? splitEl.getBoundingClientRect().width : window.innerWidth
    function onMove(ev) {
      const dx = ev.clientX - startX
      const newPct = startPct + (dx / containerWidth) * 100
      leftPct = Math.min(85, Math.max(15, newPct))
    }
    function onUp() {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      persist('paneLeft', leftPct)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  function handleReady(view) {
    editorView = view
    attachEditorScrollListener()
  }

  function attachEditorScrollListener() {
    if (!editorView || editorScrollListenerAttached) return
    try { editorView.scrollDOM.addEventListener('scroll', handleEditorScroll, { passive: true }) } catch (e) { console.warn(e) }
    editorScrollListenerAttached = true
  }

  onMount(async () => {
    md = createMarkdown()
    mdLang = markdown()
    try {
      const params = new URLSearchParams(window.location.search)
      if (params.get('debug') === '1') {
        debugEnabled = true
        try { localStorage.setItem('debug', 'true') } catch {}
      } else {
        const stored = localStorage.getItem('debug')
        debugEnabled = stored === 'true' || stored === '1'
      }
      if (isTauri()) {
        try {
          const { invoke } = await import('@tauri-apps/api/core')
          const dbg = await invoke('get_debug_flag')
          if (dbg) { debugEnabled = true; try { localStorage.setItem('debug', 'true') } catch {} }
        } catch (e) { /* ignore */ }
      }
      // load settings
      try {
        const raw = localStorage.getItem('settings')
        if (raw) {
          const p = JSON.parse(raw)
          settings = {
            autosave: p.autosave !== false,
            autoReload: p.autoReload !== false,
            autosaveInterval: Number(p.autosaveInterval) || 2000,
            diagramTypes: { mermaid: true, plantuml: true, dot: true, wavedrom: true, nomnoml: true, ...(p.diagramTypes || {}) },
            embedLinkedMarkdown: p.embedLinkedMarkdown !== false,
          }
          applySettingsSideEffects()        }
      } catch (e) {}
    } catch (e) { debugEnabled = false }

    // load keybinding overrides
    try {
      const stored = localStorage.getItem('keybindings')
      if (stored) bindings = mergeBindings(getDefaults(), JSON.parse(stored))
    } catch (e) { console.warn('keybindings load failed', e) }

    // config surface (V1)
    window.setKeybinding = (actionId, keys) => {
      const next = { ...bindings }
      next[actionId] = Array.isArray(keys) ? keys : (keys ? [keys] : [])
      bindings = mergeBindings(getDefaults(), next)
      try { localStorage.setItem('keybindings', JSON.stringify(bindings)) } catch {}
      persist('keybindings', bindings)
      return bindings
    }
    window.getKeybindings = () => bindings

    const isEditable = (target) => {
      if (!target) return false
      const tag = (target.tagName || '').toUpperCase()
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
      if (target.isContentEditable) return true
      if (target.closest && target.closest('.cm-editor')) return true
      return false
    }

    setRunners({
      'zoom.in': zoomIn,
      'zoom.out': zoomOut,
      'zoom.reset': resetZoom,
      'view.toggleSplit': toggleViewMode,
      'view.split': toggleViewMode,
      'view.diagrams': toggleDiagrams,
      'sidebar.toggle': toggleSidebar,
      'sidebar.tabOutline': () => setSidebarTab('outline'),
      'sidebar.tabComments': () => setSidebarTab('comments'),
      'comments.toggleVisibility': toggleComments,
      'review.highlightMode': () => { reviewMode = 'highlight' },
      'review.noteMode': () => {
        reviewMode = 'note'
        sidebarOpen = true
        setSidebarTab('comments')
        persist('sidebarOpen', true)
      },
      'review.deleteMode': () => { reviewMode = 'delete' },
      'debug.toggle': () => { if (debugEnabled) { debugEnabled = !debugEnabled; persist('debug', debugEnabled) } },
      'debug.forceToggle': () => { debugEnabled = true; persist('debug', true); try { localStorage.setItem('debug', 'true') } catch {} },
      'file.save': saveFile,
      'file.open': () => { const inp = document.querySelector('.file-label input'); if (inp) inp.click() },
      'file.reload': reloadFile,
      'file.settings': () => { settingsOpen = true },
      'file.exit': exitApp,
      'nav.back': navBack,
      'nav.forward': navForward,      'review.insert': () => wrapSelection('addition'),
      'review.strike': () => wrapSelection('deletion'),
      'review.highlight': () => wrapSelection('highlight'),
      'review.comment': () => wrapSelection('comment'),
      'review.acceptAll': acceptAll,
      'review.acceptSel': acceptSelection,
      'review.rejectAll': rejectAll,
      'review.rejectSel': rejectSelection,
      'review.undo': undoReview,
      'review.redo': redoReview,    })
    for (const t of THEMES) setRunner('theme.' + t.id, () => setTheme(t.id))
    const runAction = (actionId) => registryRunAction(actionId)

    const handleGlobalKeyDown = (e) => {
      const actionId = findAction(bindings, e)
      if (!actionId) return
      const hasMod = e.ctrlKey || e.altKey || e.metaKey || e.shiftKey
      if (!hasMod && isEditable(e.target)) return
      // app-level undo/redo only when not editing in CodeMirror (CM handles its own)
      if ((actionId === 'review.undo' || actionId === 'review.redo') && isEditable(e.target)) return
      // always prevent default for bound combos to stop browser actions (print etc.)
      e.preventDefault()
      runAction(actionId)
    }
    const handleGlobalWheel = (e) => {
      if (!e.ctrlKey) return
      const actionId = findAction(bindings, e)
      if (!actionId) return
      e.preventDefault()
      // zoom via wheel is proportional/accumulated; other wheel bindings step
      if (actionId === 'zoom.in' || actionId === 'zoom.out') { handleCtrlWheelZoom(e); return }
      runAction(actionId)
    }

    window.addEventListener('keydown', handleGlobalKeyDown)
    window.addEventListener('wheel', handleGlobalWheel, { passive: false })

    // store cleanup refs
    window.__mdv_cleanup_keybindings = () => {
      window.removeEventListener('keydown', handleGlobalKeyDown)
      window.removeEventListener('wheel', handleGlobalWheel)
    }

    if (isTauri()) {
      try {
        const store = await getStore()
        const t = await store.get('theme')
        if (t !== null && t !== undefined) theme = String(t)
        else {
          const d = await store.get('dark')
          if (d !== null && d !== undefined) theme = d ? 'github-dark' : 'github-light'
        }
        const z = await store.get('zoom')
        if (z !== null && z !== undefined) zoom = Number(z) || 1
        const dg = await store.get('diagramsEnabled')
        if (dg !== null && dg !== undefined) diagramsEnabled = !!dg
        applyTheme(theme)
        const hc = await store.get('hideComments')
        if (hc !== null && hc !== undefined) hideComments = !!hc
        const st = await store.get('sidebarTab')
        if (st === 'outline' || st === 'comments') sidebarTab = st
        const so = await store.get('sidebarOpen')
        if (so !== null && so !== undefined) sidebarOpen = !!so
        const pl = await store.get('paneLeft')
        if (pl !== null && pl !== undefined) leftPct = Number(pl) || 50
        const vm = await store.get('viewMode')
        if (vm === 'preview' || vm === 'split') viewMode = vm
        applyZoom()
      } catch (e) { console.warn(e) }

      try {
        const { invoke } = await import('@tauri-apps/api/core')
        const p = await invoke('get_initial_path')
        if (p) {
          await openPath(p)
          loading = false
          const { listen } = await import('@tauri-apps/api/event')
          await listen('file-opened', (e) => {
            if (e && e.payload) openPath(e.payload, false)
          })
          return
        }
      } catch (e) { console.warn(e) }

      const { listen } = await import('@tauri-apps/api/event')
      await listen('file-opened', (e) => {
        if (e && e.payload) openPath(e.payload, false)
      })
    }

    if (!isTauri()) {
      try {
        const t = localStorage.getItem('theme')
        if (t) { try { theme = JSON.parse(t) } catch { theme = t.replace(/^"|"$/g, '') } }
        const z = localStorage.getItem('zoom')
        if (z) zoom = Number(JSON.parse(z)) || zoom
        const dg = localStorage.getItem('diagramsEnabled')
        if (dg) diagramsEnabled = !!JSON.parse(dg)
        const stb = localStorage.getItem('sidebarTab')
        if (stb) {
          try {
            const v = JSON.parse(stb)
            if (v === 'outline' || v === 'comments') sidebarTab = v
          } catch {
            if (stb === 'outline' || stb === 'comments') sidebarTab = stb
          }
        }
        const sob = localStorage.getItem('sidebarOpen')
        if (sob) {
          try { sidebarOpen = !!JSON.parse(sob) } catch {}
        }
        const vmb = localStorage.getItem('viewMode')
        if (vmb) {
          try {
            const v = JSON.parse(vmb)
            if (v === 'preview' || v === 'split') viewMode = v
          } catch {
            if (vmb === 'preview' || vmb === 'split') viewMode = vmb
          }
        }
      } catch (e) { console.warn(e) }
      applyTheme(theme)
      applyZoom()
      applySettingsSideEffects()
    }

    // ResizeObserver for logical scroll preservation on geometry changes
    try {
      resizeObserver = new ResizeObserver(() => {
        if (!resizeObserverEnabled) return
        if (!resizeAnchor) resizeAnchor = restAnchor
        clearTimeout(resizeTimer)
        resizeTimer = setTimeout(() => {
          restoreAnchor(resizeAnchor)
          resizeAnchor = null
        }, 100)
      })
      if (previewEl) resizeObserver.observe(previewEl)
    } catch (e) {}
    setTimeout(() => { resizeObserverEnabled = true }, 1000)

    await loadFixture()
    loading = false
  })

  // keyboard save
  function onKeyDown(e) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault()
      saveFile()
    }
    if (e.key === 'Escape' && debugOpen) {
      closeDebugMenu()
    }
    if (e.key === 'Escape' && reviewMode) {
      cancelReviewMode()
    }
    if (e.key === 'Escape' && fullscreenDiagramHtml) {
      closeDiagramFullscreen()
    }
    if (e.key === 'Escape' && contextMenu) {
      closeContextMenu()
    }
    if (e.key === 'Escape' && settingsOpen) {
      settingsOpen = false
    }
  }
  function onGlobalClick(e) {
    if (!debugOpen || !debugMenuEl) return
    if (!debugMenuEl.contains(e.target)) closeDebugMenu()
  }

  onDestroy(() => {
    if (resizeObserver) { try { resizeObserver.disconnect() } catch {} }
    clearTimeout(restAnchorTimer)
    if (window.__mdv_cleanup_keybindings) { try { window.__mdv_cleanup_keybindings() } catch {} }
    if (unwatch) { try { unwatch() } catch {} }
    clearTimeout(debounceTimer)
    clearTimeout(previewDebounce)
    if (editorView) {
      try { editorView.scrollDOM.removeEventListener('scroll', handleEditorScroll) } catch {}
    }
    editorScrollListenerAttached = false
    if (previewEl) {
      try { previewEl.removeEventListener('scroll', handlePreviewScroll) } catch {}
    }
  })
</script>

<svelte:window on:keydown={onKeyDown} on:click={onGlobalClick} />

<label class="file-label" style="display:none">
  Open .md <input type="file" accept=".md,.markdown,.txt" on:change={onFile} />
</label>
<div class="toolbar" role="toolbar" aria-label="Main toolbar">
  <Menu
    label="File"
    testId="menu-file"
    items={[
      { id: 'file.open', label: 'Open', icon: 'folder-open', shortcut: getAction('file.open').shortcut, run: () => registryRunAction('file.open') },
      { id: 'file.save', label: 'Save', icon: 'content-save', shortcut: getAction('file.save').shortcut, disabled: isTauri() ? (!currentPath || !dirty) : !dirty, run: () => registryRunAction('file.save') },
      { id: 'file.reload', label: 'Reload', icon: 'refresh', shortcut: getAction('file.reload').shortcut, run: () => registryRunAction('file.reload') },
      { id: 'file.settings', label: 'Settings', icon: 'cog', shortcut: getAction('file.settings').shortcut, run: () => registryRunAction('file.settings') },
      ...(isTauri() ? [{ id: 'file.exit', label: 'Exit', icon: 'exit-to-app', shortcut: getAction('file.exit').shortcut, run: () => registryRunAction('file.exit') }] : []),
      ...(debugEnabled ? [
        { separator: true },
        { label: 'Load fixture', icon: 'refresh', run: () => { loadFixture() } },
        { label: 'Load review fixture', icon: 'refresh', run: () => { loadReviewFixture() } },
        { label: `Diagrams: ${diagramsEnabled ? 'on' : 'off'}`, icon: 'chart-bar', run: () => { toggleDiagrams() } },
        { label: `Comments: ${hideComments ? 'hidden' : 'muted'}`, icon: 'comment', run: () => { toggleComments() } },
      ] : []),
    ]}
  />

  <button
    class="icon-btn"
    data-testid="action-file.open"
    title="Open"
    on:click={() => registryRunAction('file.open')}
  ><Icon name="folder-open" size={16} /></button>

  <button
    class="icon-btn"
    data-testid="action-file.save"
    title={`Save${getAction('file.save').shortcut?.length ? ' (' + getAction('file.save').shortcut.join(' / ') + ')' : ''}`}
    disabled={isTauri() ? (!currentPath || !dirty) : !dirty}
    on:click={() => registryRunAction('file.save')}
  ><Icon name="content-save" size={16} />{dirty ? ' *' : ''}</button>

  <Menu
    label="View"
    testId="menu-view"
    items={[
      { id: 'nav.back', label: 'Back', icon: 'arrow-left', shortcut: getAction('nav.back').shortcut, disabled: navIndex <= 0, run: () => registryRunAction('nav.back') },
      { id: 'nav.forward', label: 'Forward', icon: 'arrow-right', shortcut: getAction('nav.forward').shortcut, disabled: navIndex >= navHistory.length - 1, run: () => registryRunAction('nav.forward') },
      { separator: true },
      { id: 'view.toggleSplit', label: `Split view${viewMode === 'split' ? ' (on)' : ''}`, icon: 'split', shortcut: getAction('view.toggleSplit').shortcut, run: () => registryRunAction('view.toggleSplit') },
      { id: 'view.diagrams', label: `Diagrams: ${diagramsEnabled ? 'on' : 'off'}`, icon: 'chart-bar', shortcut: getAction('view.diagrams').shortcut, run: () => registryRunAction('view.diagrams') },
      { separator: true },
      { label: 'Mermaid', icon: 'chart-bar', checked: settings.diagramTypes.mermaid !== false, run: () => { settings.diagramTypes.mermaid = !(settings.diagramTypes.mermaid !== false); persistSettings(); rerenderDiagrams() } },
      { label: 'PlantUML', icon: 'chart-bar', checked: settings.diagramTypes.plantuml !== false, run: () => { settings.diagramTypes.plantuml = !(settings.diagramTypes.plantuml !== false); persistSettings(); rerenderDiagrams() } },
      { label: 'Graphviz/DOT', icon: 'chart-bar', checked: settings.diagramTypes.dot !== false, run: () => { settings.diagramTypes.dot = !(settings.diagramTypes.dot !== false); persistSettings(); rerenderDiagrams() } },
      { label: 'WaveDrom', icon: 'chart-bar', checked: settings.diagramTypes.wavedrom !== false, run: () => { settings.diagramTypes.wavedrom = !(settings.diagramTypes.wavedrom !== false); persistSettings(); rerenderDiagrams() } },
      { label: 'Nomnoml', icon: 'chart-bar', checked: settings.diagramTypes.nomnoml !== false, run: () => { settings.diagramTypes.nomnoml = !(settings.diagramTypes.nomnoml !== false); persistSettings(); rerenderDiagrams() } },
      { separator: true },
      { label: `Embed linked markdown: ${settings.embedLinkedMarkdown ? 'on' : 'off'}`, icon: 'split', checked: settings.embedLinkedMarkdown, run: () => { settings.embedLinkedMarkdown = !settings.embedLinkedMarkdown; persistSettings(); applySettingsSideEffects(); loadingFile = true; lastHash = ''; loadText(text).then(() => { loadingFile = false }) } },
      { separator: true },
      ...THEMES.map((t) => ({
        id: 'theme.' + t.id,
        label: t.label,
        icon: '',
        checked: theme === t.id,
        shortcut: [],
        run: () => registryRunAction('theme.' + t.id),
      })),
    ]}
  />

  <Menu
    label="Review"
    testId="menu-review"
    items={[
      { id: 'review.undo', label: 'Undo', icon: 'undo', shortcut: getAction('review.undo').shortcut, run: () => registryRunAction('review.undo') },
      { id: 'review.redo', label: 'Redo', icon: 'redo', shortcut: getAction('review.redo').shortcut, run: () => registryRunAction('review.redo') },
      { separator: true },
      { id: 'review.insert', label: 'Insert', icon: 'plus', shortcut: getAction('review.insert').shortcut, run: () => registryRunAction('review.insert') },
      { id: 'review.strike', label: 'Strike', icon: 'format-strike', shortcut: getAction('review.strike').shortcut, run: () => registryRunAction('review.strike') },
      { id: 'review.highlight', label: 'Highlight', icon: 'format-highlight', shortcut: getAction('review.highlight').shortcut, run: () => registryRunAction('review.highlight') },
      { id: 'review.comment', label: 'Comment', icon: 'comment', shortcut: getAction('review.comment').shortcut, run: () => registryRunAction('review.comment') },
      { separator: true },
      { id: 'review.acceptSel', label: 'Accept sel', icon: 'plus', shortcut: getAction('review.acceptSel').shortcut, run: () => registryRunAction('review.acceptSel') },
      { id: 'review.rejectSel', label: 'Reject sel', icon: 'format-strike', shortcut: getAction('review.rejectSel').shortcut, run: () => registryRunAction('review.rejectSel') },
      { id: 'review.acceptAll', label: 'Accept all', icon: 'plus', shortcut: getAction('review.acceptAll').shortcut, run: () => registryRunAction('review.acceptAll') },
      { id: 'review.rejectAll', label: 'Reject all', icon: 'format-strike', shortcut: getAction('review.rejectAll').shortcut, run: () => registryRunAction('review.rejectAll') },
    ]}
  />

  <button
    class="icon-btn"
    data-testid="action-review.highlight"
    title={`Highlight${getAction('review.highlight').shortcut?.length ? ' (' + getAction('review.highlight').shortcut.join(' / ') + ')' : ''}`}
    on:click={() => registryRunAction('review.highlight')}
  ><Icon name="format-highlight" size={16} /></button>

  <button
    class="icon-btn"
    data-testid="action-review.strike"
    title={`Strike${getAction('review.strike').shortcut?.length ? ' (' + getAction('review.strike').shortcut.join(' / ') + ')' : ''}`}
    on:click={() => registryRunAction('review.strike')}
  ><Icon name="format-strike" size={16} /></button>

  <button
    class="icon-btn"
    data-testid="action-review.insert"
    title={`Insert${getAction('review.insert').shortcut?.length ? ' (' + getAction('review.insert').shortcut.join(' / ') + ')' : ''}`}
    on:click={() => registryRunAction('review.insert')}
  ><Icon name="plus" size={16} /></button>

  <button
    class="icon-btn"
    data-testid="action-review.comment"
    title={`Comment${getAction('review.comment').shortcut?.length ? ' (' + getAction('review.comment').shortcut.join(' / ') + ')' : ''}`}
    on:click={() => registryRunAction('review.comment')}
  ><Icon name="comment" size={16} /></button>

  <div class="toolbar-spacer"></div>

  {#if reviewMode}
    <span class="mode-badge" role="status">
      {reviewMode === 'highlight' ? 'Highlight mode — select text in preview' : reviewMode === 'delete' ? 'Delete mode — select text in preview' : 'Note mode — click or select text'}
      <button on:click={cancelReviewMode} title="Cancel (Esc)">✕</button>
    </span>
  {/if}

  <div class="toolbar-end">
    <button
      class="icon-btn"
      data-testid="action-nav.back"
      title={`Back${getAction('nav.back').shortcut?.length ? ' (' + getAction('nav.back').shortcut.join(' / ') + ')' : ''}`}
      disabled={navIndex <= 0}
      on:click={() => registryRunAction('nav.back')}
    ><Icon name="arrow-left" size={16} /></button>
    <button
      class="icon-btn"
      data-testid="action-nav.forward"
      title={`Forward${getAction('nav.forward').shortcut?.length ? ' (' + getAction('nav.forward').shortcut.join(' / ') + ')' : ''}`}
      disabled={navIndex >= navHistory.length - 1}
      on:click={() => registryRunAction('nav.forward')}
    ><Icon name="arrow-right" size={16} /></button>
    {#if currentPath}
      <span class="path" title={currentPath}>{currentPath}</span>
    {/if}
    {#if dirty}
      <span class="dirty">unsaved</span>
    {/if}
    {#if statusMessage}
      <span class="status">{statusMessage}</span>
    {/if}
    <div class="zoom-stepper" role="group" aria-label="Zoom">
      <button on:click={zoomOut} disabled={zoom <= 0.5} title="Zoom out">−</button>
      <button class="zoom-pct" on:click={resetZoom} title="Reset zoom to 100%">{Math.round(zoom * 100)}%</button>
      <button on:click={zoomIn} disabled={zoom >= 3} title="Zoom in">+</button>
    </div>
    <button
      class="sidebar-icon-btn"
      on:click={toggleSidebar}
      title={sidebarOpen ? 'Collapse Sidebar' : 'Expand Sidebar'}
      aria-label={sidebarOpen ? 'Collapse Sidebar' : 'Expand Sidebar'}
      data-testid="sidebar-toggle"
    >{sidebarOpen ? '›' : '‹'}</button>
  </div>
</div>

{#if loading}
  <p class="status">Loading…</p>
{/if}
{#if error}
  <p class="status error">{error}</p>
{/if}

{#if conflict}
  <div class="conflict-banner" role="alert">
    <span>File changed on disk.</span>
    <button on:click={reloadFromDisk}>Reload from disk</button>
    <button on:click={keepEditing}>Keep editing</button>
  </div>
{/if}
{#if linkError}
  <div class="link-error-card" role="alert">
    <span>{linkError.message}</span>
    <button on:click={() => (linkError = null)}>Dismiss</button>
  </div>
{/if}
{#if includeOpenPath}
  <div class="conflict-banner" role="status">
    <span>included from {includeOpenPath} — read-only in parent</span>
    <button on:click={() => openIncludedPath(includeOpenPath)}>Open ↗</button>
    <button on:click={() => (includeOpenPath = null)}>Dismiss</button>
  </div>
{/if}
{#if externalChange}
  <div class="conflict-banner" role="status">
    <span>File changed on disk.</span>
    <button on:click={() => { const t = externalChange.diskText; externalChange = null; loadingFile = true; text = t; lastHash = ''; loadText(t).then(() => { loadingFile = false; dirty = false }) }}>Reload</button>
  </div>
{/if}

<div class="split" class:preview-mode={viewMode === 'preview'} bind:this={splitEl} style="grid-template-columns: {viewMode === 'split' ? leftPct + '% 6px 1fr' : '1fr'};">
  <div class="pane editor-pane" bind:this={editorPaneEl}>
    <CodeMirror
      bind:value={text}
      lang={mdLang}
      onready={handleReady}
      onchange={onEditorChange}
      lineNumbers={true}
      lineWrapping={true}
      extensions={extensions}
    />
  </div>
  <div class="divider" on:mousedown={startResize}></div>
  <div class="pane preview-pane" bind:this={previewPaneEl}>
    <div class="preview-scroll" class:hide-comments={hideComments} bind:this={previewEl} on:scroll={handlePreviewScroll} on:mouseup={onPreviewMouseUp} on:click={handlePreviewClick} class:review-mode={!!reviewMode}>
      <article id="rendered" class="rendered">
        {@html html}
      </article>
    </div>
    {#if sidebarOpen}
      <aside class="sidebar" data-testid="sidebar">
        <div class="sidebar-header">
          <button class="sidebar-collapse" on:click={() => (sidebarOpen = false, persist('sidebarOpen', false))} aria-label="Collapse sidebar" data-testid="sidebar-collapse">›</button>
          <div class="sidebar-tabs" role="tablist">
            <button class="sidebar-tab" class:active={sidebarTab === 'outline'} on:click={() => setSidebarTab('outline')} data-testid="tab-outline">
              Outline ({outlineItems.length})
            </button>
            <button class="sidebar-tab" class:active={sidebarTab === 'comments'} on:click={() => setSidebarTab('comments')} data-testid="tab-comments">
              Comments ({commentItems.length})
            </button>
          </div>
        </div>
        <div class="sidebar-body">
          {#if sidebarTab === 'outline'}
            {#if outlineItems.length === 0}
              <p class="empty-state" data-testid="outline-empty">No headings</p>
            {/if}
            <ul class="outline-list">
              {#each outlineItems as item (item.id)}
                <li class="outline-item" style="padding-left: {(item.level - 1) * 0.75}rem">
                  <button
                    class="outline-link"
                    class:active={item.line === activeHeadingLine}
                    data-testid="outline-item"
                    data-line={item.line}
                    on:click={() => scrollToHeading(item)}
                  >
                    {item.text}
                  </button>
                </li>
              {/each}
            </ul>
          {:else}
            {#if commentItems.length === 0}
              <p class="empty-state" data-testid="comments-empty">No comments</p>
            {/if}
            <div class="comment-cards">
              {#each commentItems as c (c.id)}
                {#if editingCommentId === c.id}
                  <div class="comment-card editing" data-testid="comment-card" data-kind={c.kind} data-line={c.line}>
                    <input class="comment-author-input" placeholder="author" bind:value={editingCommentAuthor} />
                    <textarea class="comment-text-input" bind:value={editingCommentText}></textarea>
                    <div class="comment-edit-actions">
                      <button on:click={() => saveEditComment(c)} data-testid="comment-save">Save</button>
                      <button on:click={cancelEditComment}>Cancel</button>
                    </div>
                  </div>
                {:else}
                  <div
                    class="comment-card"
                    class:active={c.id === activeCommentId}
                    data-testid="comment-card"
                    data-kind={c.kind}
                    data-line={c.line}
                    role="button"
                    tabindex="0"
                    on:click={() => scrollToComment(c)}
                    on:keydown={(e) => { if (e.key === 'Enter' || e.key === ' ') scrollToComment(c) }}
                    on:contextmenu|preventDefault={(e) => openContextMenu(e, c)}
                  >
                    {#if c.author}<div class="comment-author">@{c.author}</div>{/if}
                    <div class="comment-excerpt">{c.text || '(empty)'}</div>
                    <div class="comment-meta">Line {c.line + 1} · {c.kind}</div>
                    {#if c.kind === 'critic'}
                      <button class="comment-edit-btn" data-testid="comment-edit" on:click|stopPropagation={() => startEditComment(c)}>Edit</button>
                      <button class="comment-edit-btn" data-testid="comment-reply" on:click|stopPropagation={() => replyComment(c)}>↩</button>
                      <button class="comment-edit-btn" data-testid="comment-delete" on:click|stopPropagation={() => deleteComment(c)}>🗑</button>
                    {/if}
                  </div>
                {/if}
              {/each}
            </div>
          {/if}
        </div>
      </aside>
    {/if}
  </div>
</div>

{#if settingsOpen}
  <div class="diagram-modal-backdrop" on:click={() => (settingsOpen = false)}>
    <div class="diagram-modal settings-modal" on:click|stopPropagation>
      <button class="diagram-modal-close" on:click={() => (settingsOpen = false)} aria-label="Close settings">✕</button>
      <h3>Settings</h3>
      <label><input type="checkbox" bind:checked={settings.autosave} on:change={persistSettings} /> Autosave</label>
      <label><input type="checkbox" bind:checked={settings.autoReload} on:change={persistSettings} /> Auto-reload on external changes</label>
      <label>Autosave interval:
        <select bind:value={settings.autosaveInterval} on:change={persistSettings}>
          <option value={2000}>2s</option>
          <option value={5000}>5s</option>
          <option value={10000}>10s</option>
        </select>
      </label>
    </div>
  </div>
{/if}

{#if contextMenu}
  <div class="context-menu-backdrop" on:click={closeContextMenu}></div>
  <div class="context-menu" style="left:{contextMenu.x}px; top:{contextMenu.y}px;">
    <button on:click={() => { startEditComment(contextMenu.item); closeContextMenu() }}>Edit</button>
    <button on:click={() => { replyComment(contextMenu.item); closeContextMenu() }}>↩ Reply</button>
    <button on:click={() => { deleteComment(contextMenu.item); closeContextMenu() }}>🗑 Delete</button>
  </div>
{/if}

{#if fullscreenDiagramHtml}
  <div class="diagram-modal-backdrop" on:click={closeDiagramFullscreen}>
    <div class="diagram-modal" on:click|stopPropagation>
      <button class="diagram-modal-close" on:click={closeDiagramFullscreen} aria-label="Close fullscreen">✕</button>
      <div class="diagram-modal-body">{@html fullscreenDiagramHtml}</div>
    </div>
  </div>
{/if}

<style>
  .toolbar { display: flex; gap: 0.35rem; margin-bottom: 0.75rem; flex-wrap: nowrap; align-items: center; height: 44px; overflow: hidden; position: sticky; top: 0; z-index: 50; background: var(--app-toolbar-bg); padding: 0.35rem 0.5rem; border-radius: 6px; border: 1px solid var(--app-border); box-shadow: 0 2px 8px rgba(0,0,0,0.12); }
  .toolbar button, .toolbar .file-label, .toolbar .theme-picker { height: 32px; padding: 0 0.5rem; border: 1px solid var(--app-border); border-radius: 4px; background: var(--app-bg); color: var(--app-fg); cursor: pointer; display: inline-flex; align-items: center; justify-content: center; font-size: 0.85rem; line-height: 1; box-sizing: border-box; }
  .toolbar button:hover { filter: brightness(0.97); }
  .toolbar button:disabled { opacity: 0.45; cursor: not-allowed; }
  .toolbar select option { background: var(--app-toolbar-bg); color: var(--app-fg); }
  .toolbar-group { display: inline-flex; gap: 0.25rem; align-items: center; flex-shrink: 0; }
  .toolbar-spacer { flex: 1 1 auto; min-width: 0.5rem; }
  .toolbar-end { display: inline-flex; gap: 0.4rem; align-items: center; flex-shrink: 0; }
  .icon-btn { width: 32px; padding: 0; }
  .mode-badge { display: inline-flex; align-items: center; gap: 0.4rem; padding: 0.2rem 0.6rem; border: 1px solid var(--app-accent); border-radius: 999px; background: var(--app-accent); color: #fff; font-size: 0.8rem; }
  .mode-badge button { border: none; background: transparent; color: #fff; cursor: pointer; padding: 0 0.2rem; height: auto; }
  .preview-scroll.review-mode { cursor: crosshair; }
  :global(.diagram-placeholder) { position: relative; }
  :global(.diagram-controls) { position: absolute; top: 0.4rem; right: 0.4rem; display: flex; gap: 0.25rem; opacity: 0; transition: opacity 0.15s; z-index: 5; }
  :global(.diagram-placeholder:hover .diagram-controls),
  :global(.diagram-placeholder:focus-within .diagram-controls) { opacity: 1; }
  :global(.diagram-controls button) { width: 28px; height: 28px; padding: 0; border: 1px solid var(--app-border); border-radius: 4px; background: var(--app-toolbar-bg); color: var(--app-fg); cursor: pointer; font-size: 0.9rem; }
  :global(.diagram-placeholder.diagram-fullwidth) { width: 100%; max-width: none; }
  :global(.diagram-placeholder.diagram-fullwidth svg) { width: 100% !important; height: auto !important; max-width: none !important; }
  .diagram-modal-backdrop { position: fixed; inset: 0; z-index: 1000; background: rgba(0,0,0,0.85); display: flex; align-items: center; justify-content: center; padding: 1rem; }
  .diagram-modal { position: relative; max-width: 95vw; max-height: 95vh; }
  .diagram-modal-close { position: absolute; top: -2.2rem; right: 0; width: 32px; height: 32px; border: 1px solid var(--app-border); border-radius: 4px; background: var(--app-toolbar-bg); color: var(--app-fg); cursor: pointer; }
  .diagram-modal-body { display: flex; align-items: center; justify-content: center; }
  .diagram-modal-body svg { max-width: 95vw; max-height: 90vh; width: auto; height: auto; }
  .sidebar-icon-btn { width: 32px; padding: 0; font-size: 1.1rem; font-weight: 700; }
  .zoom-stepper { display: inline-flex; align-items: stretch; border: 1px solid var(--app-border); border-radius: 4px; overflow: hidden; background: var(--app-bg); height: 32px; }
  .zoom-stepper button { border: none; border-radius: 0; height: 32px; padding: 0 0.6rem; background: var(--app-bg); color: var(--app-fg); }
  .zoom-stepper button + button { border-left: 1px solid var(--app-border); }
  .zoom-stepper .zoom-pct { min-width: 3.2rem; font-size: 0.85rem; cursor: pointer; }
  .zoom { color: var(--app-fg); font-size: 0.85rem; height: 32px; display: inline-flex; align-items: center; }

  .file-label input { display: none; }
  .status { color: var(--app-fg); opacity: 0.7; }
  .status.error { color: #b00020; opacity: 1; }
  .dirty { color: #b00020; font-size: 0.8rem; }
  .split { display: grid; height: calc(100vh - 100px); gap: 0; min-height: 0; }
  .split.preview-mode .editor-pane,
  .split.preview-mode .divider { display: none; }
  .conflict-banner { display: flex; gap: 0.5rem; align-items: center; padding: 0.5rem 0.75rem; margin-bottom: 0.5rem; background: #fff3cd; color: #664d03; border: 1px solid #ffecb5; border-radius: 4px; }
  .link-error-card { display: flex; gap: 0.5rem; align-items: center; padding: 0.5rem 0.75rem; margin-bottom: 0.5rem; background: #f8d7da; color: #721c24; border: 1px solid #f5c2c7; border-radius: 4px; }
  .link-error-card button { padding: 0.2rem 0.5rem; border: 1px solid #f5c2c7; border-radius: 4px; background: #fff; color: #721c24; cursor: pointer; }
  :global(.include-header) { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; padding: 0.25rem 0.5rem; margin-bottom: 0.25rem; background: var(--app-toolbar-bg); border-bottom: 1px solid var(--app-border); font-size: 0.75rem; color: var(--app-fg); }
  :global(.include-path) { opacity: 0.8; }
  :global(.include-open) { border: 1px solid var(--app-border); border-radius: 4px; background: var(--app-bg); color: var(--app-fg); cursor: pointer; padding: 0.1rem 0.4rem; font-size: 0.7rem; }
  :global(.heading-flash) { background: rgba(255, 235, 59, 0.45); transition: background 1.2s ease; }
  .toolbar button span.active { font-weight: 700; text-decoration: underline; }
  .pane { overflow: hidden; min-width: 0; min-height: 0; }
  .editor-pane { height: 100%; min-height: 0; display: flex; flex-direction: column; }
  .preview-pane { height: 100%; min-height: 0; display: flex; flex-direction: row; }
  .preview-scroll { height: 100%; overflow: auto; padding: 0 1rem; position: relative; flex: 1 1 auto; min-width: 0; min-height: 0; }
  .sidebar { width: 280px; min-width: 280px; max-width: 280px; height: 100%; overflow: hidden; border-left: 1px solid var(--app-border); background: var(--app-toolbar-bg); color: var(--app-fg); display: flex; flex-direction: column; }
  .sidebar-header { display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem; border-bottom: 1px solid var(--app-border); position: sticky; top: 0; background: var(--app-toolbar-bg); z-index: 5; }
  .sidebar-collapse { padding: 0.2rem 0.5rem; border: 1px solid var(--app-border); border-radius: 4px; background: var(--app-toolbar-bg); color: var(--app-fg); cursor: pointer; }
  .sidebar-tabs { display: flex; gap: 0.25rem; flex: 1; }
  .sidebar-tab { flex: 1; padding: 0.3rem 0.5rem; border: 1px solid var(--app-border); border-radius: 4px; background: var(--app-toolbar-bg); color: var(--app-fg); cursor: pointer; font-size: 0.8rem; }
  .sidebar-tab.active { font-weight: 700; background: var(--app-accent); color: #fff; border-color: var(--app-accent); }
  .sidebar-body { padding: 0.5rem; flex: 1; overflow: auto; min-height: 0; }
  .empty-state { color: var(--app-fg); opacity: 0.6; font-size: 0.85rem; }
  .outline-list { list-style: none; margin: 0; padding: 0; }
  .outline-item { margin: 0.15rem 0; }
  .outline-link { display: block; width: 100%; text-align: left; background: transparent; border: none; color: var(--app-fg); cursor: pointer; font-size: 0.85rem; padding: 0.2rem 0.3rem; border-radius: 3px; }
  .outline-link:hover { background: rgba(128,128,128,0.15); }
  .outline-link.active { font-weight: 700; color: var(--app-accent); }
  .comment-cards { display: flex; flex-direction: column; gap: 0.5rem; }
  .comment-card { text-align: left; width: 100%; padding: 0.5rem; border: 1px solid var(--app-border); border-radius: 6px; background: var(--md-bg); color: var(--md-fg); cursor: pointer; }
  .comment-card.active { border-color: var(--app-accent); box-shadow: 0 0 0 1px var(--app-accent); }
  .comment-excerpt { font-size: 0.85rem; margin-bottom: 0.25rem; word-break: break-word; }
  .comment-author { font-size: 0.75rem; font-weight: 700; color: var(--app-accent); margin-bottom: 0.15rem; }
  .comment-edit-btn { margin-top: 0.25rem; padding: 0.15rem 0.4rem; font-size: 0.7rem; border: 1px solid var(--app-border); border-radius: 4px; background: var(--app-bg); color: var(--app-fg); cursor: pointer; }
  .comment-card.editing { display: flex; flex-direction: column; gap: 0.35rem; }
  .comment-author-input, .comment-text-input { width: 100%; border: 1px solid var(--app-border); border-radius: 4px; background: var(--app-bg); color: var(--app-fg); padding: 0.3rem; font-size: 0.8rem; }
  .comment-text-input { min-height: 3rem; resize: vertical; }
  .comment-edit-actions { display: flex; gap: 0.25rem; }
  .context-menu-backdrop { position: fixed; inset: 0; z-index: 900; }
  .context-menu { position: fixed; z-index: 901; display: flex; flex-direction: column; gap: 0.25rem; min-width: 120px; padding: 0.4rem; border: 1px solid var(--app-border); border-radius: 6px; background: var(--app-toolbar-bg); box-shadow: 0 4px 12px rgba(0,0,0,0.18); }
  .context-menu button { justify-content: flex-start; }
  .settings-btn { width: 32px; padding: 0; font-size: 1rem; }
  .comment-meta { font-size: 0.7rem; opacity: 0.7; }
  .divider { background: var(--app-border); cursor: col-resize; }
  .rendered { line-height: 1.6; color: var(--md-fg); background: var(--md-bg); }
  .rendered :global(h1), .rendered :global(h2), .rendered :global(h3) { margin-top: 1.2em; }
  .rendered :global(pre) { background: var(--code-bg); color: var(--code-fg); padding: 1rem; overflow: auto; border-radius: 6px; }
  .rendered :global(code) { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
  .rendered :global(.diagram-placeholder) { margin: 1rem 0; min-height: 2rem; }
  .rendered :global(svg) { overflow: visible; }
  .rendered :global(svg .note) { filter: drop-shadow(1px 2px 2px rgba(0,0,0,0.25)); }
  html.dark .rendered :global(svg .note) { filter: drop-shadow(1px 2px 2px rgba(0,0,0,0.5)); }
  .rendered :global(svg .noteText) { text-anchor: middle; }
  .rendered :global(table) { border-collapse: collapse; margin: 1rem 0; width: auto; }
  .rendered :global(th), .rendered :global(td) { border: 1px solid var(--table-border); padding: 6px 13px; }
  .rendered :global(th) { background: var(--table-header-bg); font-weight: 600; }
  .rendered :global(tbody tr:nth-child(even)) { background: var(--table-zebra-bg); }
  .rendered :global(th), .rendered :global(td) { text-align: inherit; }
  .rendered :global(.diagram-error) { color: #b00020; border: 1px solid #b00020; padding: 0.5rem; border-radius: 4px; }
  .rendered :global(.ditaa-banner) { background: #fff3cd; color: #664d03; border: 1px solid #ffecb5; padding: 0.5rem; border-radius: 4px; margin-top: 0.5rem; }
  .path { font-size: 0.8rem; color: var(--app-fg); opacity: 0.7; max-width: 40ch; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .zoom { font-size: 0.85rem; }
  /* CodeMirror fill */
  .editor-pane :global(.codemirror-wrapper) { height: 100%; min-height: 0; display: flex; flex-direction: column; }
  .editor-pane :global(.cm-editor) { height: 100%; min-height: 0; flex: 1 1 auto; }
  .editor-pane :global(.cm-scroller) { overflow: auto; height: 100%; min-height: 0; flex: 1 1 auto; }
  .toolbar .group { display: inline-flex; gap: 0.25rem; }
  .preview-scroll.hide-comments .rendered :global(.obsidian-comment) { display: none; }
  .rendered :global(.obsidian-comment) { color: #6b6b6b; font-style: italic; background: rgba(128,128,128,0.15); border-radius: 3px; padding: 0 0.2em; }
  .rendered :global(.obsidian-comment-block) { display: block; margin: 0.5em 0; padding: 0.5em; border-left: 3px solid #999; background: rgba(128,128,128,0.1); }
</style>