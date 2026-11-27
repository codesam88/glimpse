<script>
  import Icon from './Icon.svelte'
  let {
    label = '',
    icon = '',
    items = [],
    open = $bindable(false),
    testId = '',
  } = $props()

  let el

  function toggle(e) {
    e?.stopPropagation?.()
    open = !open
  }

  function close() {
    open = false
  }

  function handleKey(e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      toggle(e)
    } else if (e.key === 'Escape') {
      close()
    }
  }

  function onWindowClick(e) {
    if (!open) return
    if (el && el.contains(e.target)) return
    close()
  }

  function onWindowKey(e) {
    if (e.key === 'Escape' && open) close()
  }

  function formatShortcut(s) {
    if (!s) return ''
    return Array.isArray(s) ? s.join(' / ') : String(s)
  }
</script>

<svelte:window on:click={onWindowClick} on:keydown={onWindowKey} />

<div class="menu" bind:this={el}>
  <button
    class="menu-trigger"
    type="button"
    aria-haspopup="menu"
    aria-expanded={open}
    data-testid={testId}
    on:click={toggle}
    on:keydown={handleKey}
  >
    {#if icon}<Icon name={icon} size={16} />{/if}
    <span class="menu-trigger-label">{label}</span>
    <Icon name="menu-down" size={14} />
  </button>

  {#if open}
    <div class="menu-popover" role="menu">
      {#each items as item, i (i)}
        {#if item.separator}
          <hr class="menu-sep" />
        {:else}
          <button
            class="menu-item"
            class:active={item.checked}
            type="button"
            role="menuitem"
            data-testid={item.testId || (item.id ? 'action-' + item.id : undefined)}
            disabled={item.disabled}
            on:click={(e) => { e.stopPropagation(); item.run?.(); close() }}
          >
            {#if item.icon}
              <span class="menu-item-icon"><Icon name={item.icon} size={16} /></span>
            {/if}
            <span class="menu-item-label">{item.label}</span>
            {#if item.checked}
              <span class="menu-item-check">✓</span>
            {/if}
            {#if item.shortcut && item.shortcut.length}
              <span class="menu-item-shortcut">{formatShortcut(item.shortcut)}</span>
            {/if}
          </button>
        {/if}
      {/each}
    </div>
  {/if}
</div>

<style>
  .menu { position: relative; display: inline-block; }
  .menu-trigger { display: inline-flex; align-items: center; gap: 0.35rem; height: 32px; padding: 0 0.6rem; border: 1px solid var(--app-border); border-radius: 4px; background: var(--app-bg); color: var(--app-fg); cursor: pointer; font-size: 0.85rem; }
  .menu-popover { position: absolute; top: calc(100% + 4px); left: 0; z-index: 60; display: flex; flex-direction: column; gap: 0.15rem; min-width: 200px; padding: 0.4rem; border: 1px solid var(--app-border); border-radius: 6px; background: var(--app-toolbar-bg); box-shadow: 0 4px 12px rgba(0,0,0,0.18); }
  .menu-item { display: flex; align-items: center; gap: 0.5rem; width: 100%; height: auto; padding: 0.35rem 0.5rem; border: none; border-radius: 4px; background: transparent; color: var(--app-fg); cursor: pointer; font-size: 0.85rem; text-align: left; }
  .menu-item:hover { background: var(--app-bg); }
  .menu-item:disabled { opacity: 0.45; cursor: not-allowed; }
  .menu-item-label { flex: 1 1 auto; }
  .menu-item-shortcut { font-size: 0.75rem; color: var(--app-fg); opacity: 0.7; white-space: nowrap; margin-left: 0.75rem; }
  .menu-item-check { margin-left: 0.5rem; }
  .menu-item-icon { display: inline-flex; align-items: center; }
  .menu-sep { border: none; border-top: 1px solid var(--app-border); margin: 0.25rem 0; }
</style>