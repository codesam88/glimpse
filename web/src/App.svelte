<script>
  import { onMount, onDestroy, tick } from 'svelte'
  import CodeMirror from 'svelte-codemirror-editor'
  import { markdown } from '@codemirror/lang-markdown'
  import { createMarkdown } from './lib/markdown.js'
  import { EditorView } from '@codemirror/view'
  import { sanitizeHtml, renderDiagrams } from './lib/diagrams.js'
  import { THEMES, DEFAULT_THEME, applyTheme } from './lib/themes.js'
  import { transformCriticMarkup, wrapWithMarkers } from './lib/reviewTransforms.js'

  let html = ''
  let theme = DEFAULT_THEME
  let loading = true
  let error = ''
  let md
  let zoom = 1
  let diagramsEnabled = true
  let hideComments = false
  // sidebar
  let sidebarOpen = true
  let sidebarTab = 'outline'
  let outlineItems = []
  let commentItems = []
  let activeHeadingLine = null
  let activeCommentId = null
  let currentPath = ''
  let unwatch = null
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
  let resizing = false

  // disk conflict guard
  let conflict = null
  let ignoredDiskHash = null
  // scroll sync
  let syncing = false
  let activePane = 'editor'
  let rafId = null
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

  async function loadText(source) {
    if (!md) md = createMarkdown()
    const h = hashText(source)
    if (h === lastHash && html) return
    lastHash = h
    html = sanitizeHtml(md.render(source))
    await tick()
    const root = document.querySelector('#rendered')
    if (root && diagramsEnabled) await renderDiagrams(root)
    refreshSidebar()
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
    schedulePreview(value)
  }

  // scroll sync helpers
  function getPreviewTopSourceLine() {
    if (!previewEl) return null
    const rect = previewEl.getBoundingClientRect()
    const els = previewEl.querySelectorAll('[data-source-line]')
    let best = null
    for (const el of els) {
      const r = el.getBoundingClientRect()
      if (r.top >= rect.top - 2) { best = el; break }
    }
    if (!best && els.length) best = els[els.length - 1]
    if (!best) return null
    return { el: best, line: parseInt(best.getAttribute('data-source-line'), 10) }
  }

  function syncEditorToPreview() {
    if (!editorView || !previewEl) return
    const lineNo = editorView.state.doc.lineAt(editorView.viewport.from).number // 1-based
    const srcLine = lineNo - 1 // 0-based
    const els = Array.from(previewEl.querySelectorAll('[data-source-line]'))
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
    syncing = true
    previewEl.scrollTop = Math.max(0, target - 8)
    setTimeout(() => { syncing = false }, 80)
  }

  function syncPreviewToEditor() {
    if (!editorView || !previewEl) return
    const info = getPreviewTopSourceLine()
    if (!info || isNaN(info.line)) return
    const targetLineNo = Math.min(editorView.state.doc.lines, Math.max(1, info.line + 1))
    const line = editorView.state.doc.line(targetLineNo)
    syncing = true
    editorView.dispatch({ effects: EditorView.scrollIntoView(line.from, { y: 'start' }) })
    setTimeout(() => { syncing = false }, 80)
  }

  // sidebar helpers
  function findAnchorForLine(line) {
    if (!previewEl) return null
    const els = Array.from(previewEl.querySelectorAll('[data-source-line]'))
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
        commentItems.push({
          id: 'c-' + (idx++),
          kind,
          text: (el.textContent || '').trim(),
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
      commentItems.push({
        id: 'c-' + (idx++),
        kind: 'html',
        text: excerpt,
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
    if (syncing) return
    if (activePane !== 'editor') return
    if (rafId) cancelAnimationFrame(rafId)
    rafId = requestAnimationFrame(() => syncEditorToPreview())
  }

  function handlePreviewScroll() {
    updateSidebarActive()
    if (syncing) return
    if (activePane !== 'preview') return
    if (rafId) cancelAnimationFrame(rafId)
    rafId = requestAnimationFrame(() => syncPreviewToEditor())
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

  async function openPath(path, preserveScroll = false) {
    if (!path) return
    conflict = null
    ignoredDiskHash = null
    loading = true
    error = ''
    const prevScroll = preserveScroll ? (previewEl ? previewEl.scrollTop : 0) : 0
    const prevEditorScroll = preserveScroll ? (editorView ? editorView.scrollDOM.scrollTop : 0) : 0
    try {
      const t = await readPath(path)
      loadingFile = true
      currentPath = path
      text = t
      lastHash = ''
      await loadText(t)
      loadingFile = false
      dirty = false
      lastSavedHash = null
      if (preserveScroll) {
        await tick()
        requestAnimationFrame(() => {
          if (previewEl) previewEl.scrollTop = prevScroll
          if (editorView) editorView.scrollDOM.scrollTop = prevEditorScroll
        })
      }
      await watchParent(path)
    } catch (e) {
      error = String(e)
      html = ''
      lastHash = ''
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
      if (!r.ok) throw new Error('fixture not found (' + r.status + ')')
      const t = await r.text()
      loadingFile = true
      text = t
      lastHash = ''
      await loadText(t)
      loadingFile = false
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
      if (!r.ok) throw new Error('review fixture not found (' + r.status + ')')
      const t = await r.text()
      loadingFile = true
      text = t
      lastHash = ''
      await loadText(t)
      loadingFile = false
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
      lastHash = ''
      await loadText(t)
      loadingFile = false
    } catch (err) {
      error = String(err)
    } finally {
      loadingFile = false
      loading = false
    }
  }

  async function setTheme(next) {
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
  }

  async function saveFile() {
    if (!isTauri() || !currentPath) return
    saving = true
    try {
      const { writeTextFile } = await import('@tauri-apps/plugin-fs')
      lastSavedHash = hashText(text)
      await writeTextFile(currentPath, text)
      dirty = false
    } catch (e) { error = String(e) }
    finally { saving = false }
  }

  async function applyTransformedText(newText) {
    if (newText === text) return
    loadingFile = true
    text = newText
    lastHash = ''
    await loadText(newText)
    loadingFile = false
    dirty = true
  }

  function wrapSelection(kind) {
    if (!editorView) return
    const sel = editorView.state.selection.main
    const selected = editorView.state.sliceDoc(sel.from, sel.to)
    const replacement = wrapWithMarkers(selected, kind)
    const placeholder = ({ addition: 'added', deletion: 'removed', highlight: 'highlighted', comment: 'comment' })[kind] || 'text'
    editorView.dispatch({
      changes: { from: sel.from, to: sel.to, insert: replacement },
      selection: selected.length
        ? { anchor: sel.from + replacement.length }
        : { anchor: sel.from + (replacement.indexOf(placeholder) >= 0 ? replacement.indexOf(placeholder) : 0), head: sel.from + (replacement.indexOf(placeholder) >= 0 ? replacement.indexOf(placeholder) + placeholder.length : replacement.length) },
    })
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

  function toggleSidebar() {
    sidebarOpen = !sidebarOpen
    persist('sidebarOpen', sidebarOpen)
  }

  function setSidebarTab(tab) {
    sidebarTab = tab
    persist('sidebarTab', tab)
  }

  async function toggleViewMode() {
    viewMode = viewMode === 'preview' ? 'split' : 'preview'
    persist('viewMode', viewMode)
    if (viewMode === 'split') {
      await tick()
      requestAnimationFrame(() => {
        if (editorView) {
          try { editorView.requestMeasure() } catch (e) { console.warn(e) }
        }
      })
    }
  }

  async function reloadFromDisk() {
    if (!conflict) return
    const newText = conflict.diskText
    ignoredDiskHash = null
    conflict = null
    loadingFile = true
    text = newText
    lastHash = ''
    await loadText(newText)
    loadingFile = false
    dirty = false
    lastSavedHash = null
  }

  function keepEditing() {
    if (!conflict) return
    ignoredDiskHash = conflict.diskHash
    conflict = null
  }

  function applyZoom() {
    document.documentElement.style.fontSize = (16 * zoom) + 'px'
  }
  function zoomIn() { zoom = Math.min(3, +(zoom + 0.1).toFixed(2)); applyZoom(); persist('zoom', zoom) }
  function zoomOut() { zoom = Math.max(0.5, +(zoom - 0.1).toFixed(2)); applyZoom(); persist('zoom', zoom) }
  function resetZoom() { zoom = 1; applyZoom(); persist('zoom', zoom) }

  async function toggleDiagrams() {
    diagramsEnabled = !diagramsEnabled
    const root = document.querySelector('#rendered')
    if (root && diagramsEnabled) {
      root.querySelectorAll('.diagram-placeholder').forEach((ph) => {
        ph.dataset.rendered = ''
        ph.innerHTML = ''
      })
      await renderDiagrams(root)
    }
    persist('diagramsEnabled', diagramsEnabled)
  }

  function startResize(e) {
    resizing = true
    const startX = e.clientX
    const startPct = leftPct
    const containerWidth = splitEl ? splitEl.getBoundingClientRect().width : window.innerWidth
    function onMove(ev) {
      const dx = ev.clientX - startX
      const newPct = startPct + (dx / containerWidth) * 100
      leftPct = Math.min(85, Math.max(15, newPct))
    }
    function onUp() {
      resizing = false
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      persist('paneLeft', leftPct)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  function handleReady(view) {
    editorView = view
    // attach scroll listener
    view.scrollDOM.addEventListener('scroll', handleEditorScroll, { passive: true })
  }

  onMount(async () => {
    md = createMarkdown()
    mdLang = markdown()

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
    }

    await loadFixture()
    loading = false
  })

  // keyboard save
  function onKeyDown(e) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault()
      saveFile()
    }
  }

  onDestroy(() => {
    if (unwatch) { try { unwatch() } catch {} }
    clearTimeout(debounceTimer)
    clearTimeout(previewDebounce)
    if (editorView) {
      try { editorView.scrollDOM.removeEventListener('scroll', handleEditorScroll) } catch {}
    }
    if (previewEl) {
      try { previewEl.removeEventListener('scroll', handlePreviewScroll) } catch {}
    }
  })
</script>

<svelte:window on:keydown={onKeyDown} />

<div class="toolbar">
  <button on:click={loadFixture}>Load fixture</button>
  <button on:click={loadReviewFixture}>Load review fixture</button>
  <label class="file-label">
    Open .md <input type="file" accept=".md,.markdown,.txt" on:change={onFile} />
  </label>
  {#if isTauri()}
    <button on:click={() => openPath(currentPath || '', false)} disabled={!currentPath}>Reload</button>
    <button on:click={saveFile} disabled={!currentPath || !dirty}>Save{dirty ? ' *' : ''}</button>
  {/if}
  <select class="theme-picker" value={theme} on:change={(e) => setTheme(e.currentTarget.value)} aria-label="Theme">
    {#each THEMES as t (t.id)}
      <option value={t.id}>{t.label}</option>
    {/each}
  </select>
  <button on:click={zoomOut}>Zoom -</button>
  <span class="zoom">{Math.round(zoom * 100)}%</span>
  <button on:click={zoomIn}>Zoom +</button>
  <button on:click={resetZoom}>Reset zoom</button>
  <button on:click={toggleDiagrams}>Diagrams: {diagramsEnabled ? 'on' : 'off'}</button>
  <button on:click={toggleViewMode} data-testid="view-mode-toggle" aria-label="Toggle view mode">
    View: <span class:active={viewMode === 'preview'}>Preview</span> / <span class:active={viewMode === 'split'}>Split</span>
  </button>
  <button on:click={toggleSidebar} data-testid="sidebar-toggle" aria-label="Toggle sidebar">
    Sidebar: {sidebarOpen ? 'on' : 'off'}
  </button>
  <span class="group">
    <button on:click={() => wrapSelection('addition')}>Wrap ++</button>
    <button on:click={() => wrapSelection('deletion')}>Wrap --</button>
    <button on:click={() => wrapSelection('highlight')}>Wrap ==</button>
    <button on:click={() => wrapSelection('comment')}>Wrap &gt;&gt;</button>
  </span>
  <span class="group">
    <button on:click={acceptAll}>Accept all</button>
    <button on:click={rejectAll}>Reject all</button>
    <button on:click={acceptSelection}>Accept sel</button>
    <button on:click={rejectSelection}>Reject sel</button>
  </span>
  <button on:click={toggleComments}>Comments: {hideComments ? 'hidden' : 'muted'}</button>
  {#if currentPath}
    <span class="path">{currentPath}</span>
  {/if}
  {#if dirty}
    <span class="dirty">unsaved</span>
  {/if}
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

<div class="split" class:preview-mode={viewMode === 'preview'} bind:this={splitEl} style="grid-template-columns: {viewMode === 'split' ? leftPct + '% 6px 1fr' : '1fr'};">
  <div class="pane editor-pane" bind:this={editorPaneEl} on:mouseenter={() => (activePane = 'editor')}>
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
  <div class="pane preview-pane" bind:this={previewPaneEl} on:mouseenter={() => (activePane = 'preview')}>
    <div class="preview-scroll" class:hide-comments={hideComments} bind:this={previewEl} on:scroll={handlePreviewScroll}>
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
                <button
                  class="comment-card"
                  class:active={c.id === activeCommentId}
                  data-testid="comment-card"
                  data-kind={c.kind}
                  data-line={c.line}
                  on:click={() => scrollToComment(c)}
                >
                  <div class="comment-excerpt">{c.text || '(empty)'}</div>
                  <div class="comment-meta">Line {c.line + 1} · {c.kind}</div>
                </button>
              {/each}
            </div>
          {/if}
        </div>
      </aside>
    {/if}
  </div>
</div>

<style>
  .toolbar { display: flex; gap: 0.5rem; margin-bottom: 1rem; flex-wrap: wrap; align-items: center; position: sticky; top: 0; z-index: 50; background: var(--app-toolbar-bg); padding: 0.5rem 0.75rem; border-radius: 4px; }
  .toolbar button, .file-label, .theme-picker { padding: 0.4rem 0.8rem; border: 1px solid var(--app-border); border-radius: 4px; background: var(--app-toolbar-bg); color: var(--app-fg); cursor: pointer; }
  .toolbar select option { background: var(--app-toolbar-bg); color: var(--app-fg); }
  .zoom { color: var(--app-fg); }

  .file-label input { display: none; }
  .status { color: var(--app-fg); opacity: 0.7; }
  .status.error { color: #b00020; opacity: 1; }
  .dirty { color: #b00020; font-size: 0.8rem; }
  .split { display: grid; height: calc(100vh - 80px); gap: 0; }
  .split.preview-mode .editor-pane,
  .split.preview-mode .divider { display: none; }
  .conflict-banner { display: flex; gap: 0.5rem; align-items: center; padding: 0.5rem 0.75rem; margin-bottom: 0.5rem; background: #fff3cd; color: #664d03; border: 1px solid #ffecb5; border-radius: 4px; }
  .toolbar button span.active { font-weight: 700; text-decoration: underline; }
  .pane { overflow: hidden; min-width: 0; }
  .editor-pane { height: 100%; }
  .preview-pane { height: 100%; }
  .preview-scroll { height: 100%; overflow: auto; padding: 0 1rem; position: relative; flex: 1 1 auto; min-width: 0; }
  .preview-pane { display: flex; flex-direction: row; }
  .sidebar { width: 280px; min-width: 280px; max-width: 280px; height: 100%; overflow: auto; border-left: 1px solid var(--app-border); background: var(--app-toolbar-bg); color: var(--app-fg); display: flex; flex-direction: column; }
  .sidebar-header { display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem; border-bottom: 1px solid var(--app-border); position: sticky; top: 0; background: var(--app-toolbar-bg); z-index: 5; }
  .sidebar-collapse { padding: 0.2rem 0.5rem; border: 1px solid var(--app-border); border-radius: 4px; background: var(--app-toolbar-bg); color: var(--app-fg); cursor: pointer; }
  .sidebar-tabs { display: flex; gap: 0.25rem; flex: 1; }
  .sidebar-tab { flex: 1; padding: 0.3rem 0.5rem; border: 1px solid var(--app-border); border-radius: 4px; background: var(--app-toolbar-bg); color: var(--app-fg); cursor: pointer; font-size: 0.8rem; }
  .sidebar-tab.active { font-weight: 700; background: var(--app-accent); color: #fff; border-color: var(--app-accent); }
  .sidebar-body { padding: 0.5rem; flex: 1; overflow: auto; }
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
  .comment-meta { font-size: 0.7rem; opacity: 0.7; }
  .divider { background: var(--app-border); cursor: col-resize; }
  .rendered { line-height: 1.6; color: var(--md-fg); background: var(--md-bg); }
  .rendered :global(h1), .rendered :global(h2), .rendered :global(h3) { margin-top: 1.2em; }
  .rendered :global(pre) { background: var(--code-bg); color: var(--code-fg); padding: 1rem; overflow: auto; border-radius: 6px; }
  .rendered :global(code) { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
  .rendered :global(.diagram-placeholder) { margin: 1rem 0; min-height: 2rem; }
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
  .editor-pane :global(.cm-editor) { height: 100%; }
  .editor-pane :global(.cm-scroller) { overflow: auto; }
  .toolbar .group { display: inline-flex; gap: 0.25rem; }
  .preview-scroll.hide-comments .rendered :global(.obsidian-comment) { display: none; }
  .rendered :global(.obsidian-comment) { color: #6b6b6b; font-style: italic; background: rgba(128,128,128,0.15); border-radius: 3px; padding: 0 0.2em; }
  .rendered :global(.obsidian-comment-block) { display: block; margin: 0.5em 0; padding: 0.5em; border-left: 3px solid #999; background: rgba(128,128,128,0.1); }
</style>