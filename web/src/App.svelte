<script>
  import { onMount, tick } from 'svelte'
  import { createMarkdown } from './lib/markdown.js'
  import { sanitizeHtml, renderDiagrams } from './lib/diagrams.js'

  let html = ''
  let dark = false
  let loading = true
  let error = ''
  let md

  async function loadText(text) {
    if (!md) md = createMarkdown()
    html = sanitizeHtml(md.render(text))
    await tick()
    const root = document.querySelector('#rendered')
    if (root) await renderDiagrams(root)
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

  async function toggleDark() {
    dark = !dark
    document.documentElement.classList.toggle('dark', dark)
    const root = document.querySelector('#rendered')
    if (root) {
      root.querySelectorAll('.diagram-placeholder').forEach((ph) => {
        ph.dataset.rendered = ''
        ph.innerHTML = ''
      })
      await renderDiagrams(root)
    }
  }

  onMount(async () => {
    md = createMarkdown()
    await loadFixture()
    loading = false
  })
</script>

<div class="toolbar">
  <button on:click={loadFixture}>Load fixture</button>
  <label class="file-label">
    Open .md <input type="file" accept=".md,.markdown,.txt" on:change={onFile} />
  </label>
  <button on:click={toggleDark}>{dark ? 'Light' : 'Dark'}</button>
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
  .toolbar { display: flex; gap: 0.5rem; margin-bottom: 1rem; flex-wrap: wrap; }
  .toolbar button, .file-label { padding: 0.4rem 0.8rem; border: 1px solid #ccc; border-radius: 4px; background: #f7f7f7; cursor: pointer; }
  .file-label input { display: none; }
  .status { color: #666; }
  .status.error { color: #b00020; }
  .rendered { line-height: 1.6; }
  .rendered :global(h1), .rendered :global(h2), .rendered :global(h3) { margin-top: 1.2em; }
  .rendered :global(pre) { background: #f6f8fa; padding: 1rem; overflow: auto; border-radius: 6px; }
  .rendered :global(code) { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
  .rendered :global(.diagram-placeholder) { margin: 1rem 0; min-height: 2rem; }
  .rendered :global(.diagram-error) { color: #b00020; border: 1px solid #b00020; padding: 0.5rem; border-radius: 4px; }
  .rendered :global(.ditaa-banner) { background: #fff3cd; color: #664d03; border: 1px solid #ffecb5; padding: 0.5rem; border-radius: 4px; margin-top: 0.5rem; }
  :global(html.dark) { background: #1e1e1e; color: #ddd; }
  :global(html.dark .rendered pre) { background: #2d2d2d; color: #ddd; }
</style>
