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

  function handleEditorScroll() {
    if (syncing) return
    if (activePane !== 'editor') return
    if (rafId) cancelAnimationFrame(rafId)
    rafId = requestAnimationFrame(() => syncEditorToPreview())
  }

  function handlePreviewScroll() {
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
  .preview-scroll { height: 100%; overflow: auto; padding: 0 1rem; position: relative; }
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