<script>
  import { icons } from './icons.js'
  let { name = '', size = 16, class: className = '' } = $props()
  const path = $derived(icons[name] || '')
</script>

<svg
  class={className}
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="currentColor"
  aria-hidden="true"
  focusable="false"
>
  {#if path}
    <path d={path} />
  {/if}
</svg>