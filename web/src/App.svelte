<script>
  import { onMount, onDestroy, tick } from 'svelte'
  import { createMarkdown } from './lib/markdown.js'
  import { sanitizeHtml, renderDiagrams } from './lib/diagrams.js'
  import { THEMES, DEFAULT_THEME, applyTheme } from './lib/themes.js'

  let html = ''
  let theme = DEFAULT_THEME
  let loading = true
  let error = ''
  let md
  let zoom = 1
  let diagramsEnabled = true
  let currentPath = ''
  let unwatch = null
  let debounceTimer = null
  let lastHash = ''
  let storeHandle = null

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

  async function loadText(text) {
    if (!md) md = createMarkdown()
    const h = hashText(text)
    if (h === lastHash && html) return
    lastHash = h
    html = sanitizeHtml(md.render(text))
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

  async function watchParent(path) {
    if (!isTauri() || !path) return
    if (unwatch) { try { await unwatch() } catch {} ; unwatch = null }
    const parent = parentOf(path)
    const name = baseOf(path)
    try {
      const { watch } = await import('@tauri-apps/plugin-fs')
      unwatch = await watch(parent, (event) => {
        const paths = (event && (event.paths || event.path && [event.path])) || []
        if (paths.some((p) => String(p).endsWith(name))) {
          clearTimeout(debounceTimer)
          debounceTimer = setTimeout(() => {
            if (currentPath) openPath(currentPath, true)
          }, 300)
        }
      }, { recursive: false, delayMs: 500 })
    } catch (e) {
      console.warn('watch failed', e)
    }
  }

  async function openPath(path, preserveScroll = false) {
    if (!path) return
    loading = true
    error = ''
    const scrollY = preserveScroll ? window.scrollY : 0
    try {
      const text = await readPath(path)
      currentPath = path
      await loadText(text)
      if (preserveScroll) {
        await tick()
        requestAnimationFrame(() => window.scrollTo(0, scrollY))
      }
      await watchParent(path)
    } catch (e) {
      error = String(e)
      html = ''
      lastHash = ''
    } finally {
      loading = false
    }
  }

  async function loadFixture() {
    loading = true
    error = ''
    try {
      const r = await fetch('/fixture.md')
      if (!r.ok) throw new Error('fixture not found (' + r.status + ')')
      await loadText(await r.text())
    } catch (e) {
      error = String(e)
    } finally {
      loading = false
    }
  }

  async function onFile(e) {
    const f = e.target.files && e.target.files[0]
    if (!f) return
    loading = true
    error = ''
    try {
      await loadText(await f.text())
    } catch (err) {
      error = String(err)
    } finally {
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

  onMount(async () => {
    md = createMarkdown()
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
        applyZoom()
      } catch (e) { console.warn(e) }

      try {
        const { invoke } = await import('@tauri-apps/api/core')
        const p = await invoke('get_initial_path')
        if (p) {
          await openPath(p)
          loading = false
          // listen for second instance
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
      } catch (e) { console.warn(e) }
      applyTheme(theme)
      applyZoom()
    }

    await loadFixture()
    loading = false
  })

  onDestroy(() => {
    if (unwatch) { try { unwatch() } catch {} }
    clearTimeout(debounceTimer)
  })
</script>

<div class="toolbar">
  <button on:click={loadFixture}>Load fixture</button>
  <label class="file-label">
    Open .md <input type="file" accept=".md,.markdown,.txt" on:change={onFile} />
  </label>
  {#if isTauri()}
    <button on:click={() => openPath(currentPath || '', false)} disabled={!currentPath}>Reload</button>
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
  {#if currentPath}
    <span class="path">{currentPath}</span>
  {/if}
</div>

{#if loading}
  <p class="status">Loading…</p>
{/if}
{#if error}
  <p class="status error">{error}</p>
{/if}

<article id="rendered" class="rendered">
  {@html html}
</article>

<style>
  .toolbar { display: flex; gap: 0.5rem; margin-bottom: 1rem; flex-wrap: wrap; align-items: center; }
  .toolbar button, .file-label, .theme-picker { padding: 0.4rem 0.8rem; border: 1px solid var(--app-border); border-radius: 4px; background: var(--app-toolbar-bg); color: var(--app-fg); cursor: pointer; }
  .file-label input { display: none; }
  .status { color: var(--app-fg); opacity: 0.7; }
  .status.error { color: #b00020; opacity: 1; }
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
</style>
