import DOMPurify from 'dompurify'
import { getMermaidConfig, currentThemeId } from './themes.js'

const SVG_PROFILE = { USE_PROFILES: { svg: true, svgFilters: true }, ALLOW_DATA_ATTR: true }
const HTML_PROFILE = { USE_PROFILES: { html: true, svg: true, svgFilters: true }, ALLOW_DATA_ATTR: true }

const diagramCache = new Map()
const disabledDiagramTypes = new Set()

export function setDiagramTypeEnabled(type, enabled) {
  if (enabled) disabledDiagramTypes.delete(type)
  else disabledDiagramTypes.add(type)
}

export function isDiagramTypeEnabled(type) {
  return !disabledDiagramTypes.has(type)
}

function normalizeDiagramType(lang) {
  if (lang === 'plantuml' || lang === 'puml') return 'plantuml'
  if (lang === 'dot' || lang === 'graphviz') return 'dot'
  return lang
}

function renderDisabledDiagram(ph, code) {
  const pre = document.createElement('pre')
  const codeEl = document.createElement('code')
  codeEl.textContent = code
  pre.appendChild(codeEl)
  const banner = document.createElement('div')
  banner.className = 'ditaa-banner'
  banner.textContent = 'This diagram type is disabled in settings (verbatim source shown).'
  ph.appendChild(pre)
  ph.appendChild(banner)
}

export function sanitizeHtml(html) {
  return DOMPurify.sanitize(html, HTML_PROFILE)
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function decodeCode(b64) {
  return decodeURIComponent(escape(atob(b64)))
}

async function renderMermaid(ph, code) {
  const mermaid = (await import('mermaid')).default
  mermaid.initialize(getMermaidConfig())
  const id = 'mmd-' + Math.random().toString(36).slice(2)
  const { svg } = await mermaid.render(id, code)
  ph.innerHTML = DOMPurify.sanitize(svg, SVG_PROFILE)
}

async function renderPlantUml(ph, code) {
  const vizMod = await import('@viz-js/viz')
  if (!window.PLANTUML_VIZ) window.PLANTUML_VIZ = vizMod
  const plantuml = await import('@plantuml/core')
  const dark = document.documentElement.classList.contains('dark')
  const lines = code.split('\n')
  const svg = await new Promise((resolve, reject) => {
    let done = false
    try {
      plantuml.renderToString(lines, (s) => { done = true; resolve(s) }, (e) => { done = true; reject(new Error(e)) }, { dark })
    } catch (e) {
      if (!done) reject(e)
    }
    // fallback timeout
    setTimeout(() => { if (!done) reject(new Error('PlantUML render timeout')) }, 30000)
  })
  ph.innerHTML = DOMPurify.sanitize(svg, SVG_PROFILE)
}

async function renderDot(ph, code) {
  const vizMod = await import('@viz-js/viz')
  const viz = await vizMod.instance()
  const svg = viz.renderString(code, { format: 'svg' })
  ph.innerHTML = DOMPurify.sanitize(svg, SVG_PROFILE)
}

async function renderWavedrom(ph, code) {
  const mod = await import('wavedrom')
  let obj
  try { obj = JSON.parse(code) } catch (e) { obj = null }
  const container = document.createElement('div')
  ph.appendChild(container)
  try {
    mod.renderWaveElement(0, obj, container, mod.waveSkin)
  } catch (e) {
    container.textContent = 'WaveDrom render error: ' + e.message
  }
  ph.innerHTML = DOMPurify.sanitize(ph.innerHTML, HTML_PROFILE)
}

async function renderNomnoml(ph, code) {
  const mod = await import('nomnoml')
  const svg = mod.renderSvg(code)
  ph.innerHTML = DOMPurify.sanitize(svg, SVG_PROFILE)
}

function renderDitaa(ph, code) {
  const pre = document.createElement('pre')
  const codeEl = document.createElement('code')
  codeEl.className = 'language-ditaa'
  codeEl.textContent = code
  pre.appendChild(codeEl)
  const banner = document.createElement('div')
  banner.className = 'ditaa-banner'
  banner.textContent = 'ditaa diagrams are not supported offline in this build (verbatim source shown).'
  ph.appendChild(pre)
  ph.appendChild(banner)
}

function ensureDiagramViewBox(ph) {
  const svgs = ph.querySelectorAll('svg')
  for (const svg of svgs) {
    if (svg.getAttribute('viewBox')) continue
    try {
      const bb = svg.getBBox()
      if (bb && bb.width > 0 && bb.height > 0) {
        svg.setAttribute('viewBox', bb.x + ' ' + bb.y + ' ' + bb.width + ' ' + bb.height)
      }
    } catch (e) {}
  }
}

function addDiagramControls(ph) {
  if (ph.querySelector('.diagram-controls')) return
  const ctrl = document.createElement('div')
  ctrl.className = 'diagram-controls'
  const btnFull = document.createElement('button')
  btnFull.type = 'button'
  btnFull.setAttribute('data-diagram-action', 'fullwidth')
  btnFull.setAttribute('title', 'Toggle full width')
  btnFull.setAttribute('aria-label', 'Toggle full width')
  btnFull.textContent = '⤢'
  const btnFs = document.createElement('button')
  btnFs.type = 'button'
  btnFs.setAttribute('data-diagram-action', 'fullscreen')
  btnFs.setAttribute('title', 'Fullscreen')
  btnFs.setAttribute('aria-label', 'Fullscreen')
  btnFs.textContent = '⛶'
  ctrl.appendChild(btnFull)
  ctrl.appendChild(btnFs)
  ph.appendChild(ctrl)
  ph.classList.add('diagram-has-controls')
}

export async function renderDiagrams(root) {
  const placeholders = root.querySelectorAll('.diagram-placeholder')
  for (const ph of placeholders) {
    if (ph.dataset.rendered === '1') continue
    const lang = (ph.dataset.diagram || '').toLowerCase()
    let code = ''
    try { code = decodeCode(ph.dataset.code || '') } catch (e) { code = '' }
    const key = lang + '\\u0000' + currentThemeId() + '\\u0000' + code
    ph.dataset.rendered = '1'
    if (!isDiagramTypeEnabled(normalizeDiagramType(lang))) {
      renderDisabledDiagram(ph, code)
      return
    }
    if (diagramCache.has(key)) {
      ph.innerHTML = diagramCache.get(key)
    } else {
      try {
        if (lang === 'mermaid') await renderMermaid(ph, code)
        else if (lang === 'plantuml' || lang === 'puml') await renderPlantUml(ph, code)
        else if (lang === 'dot' || lang === 'graphviz') await renderDot(ph, code)
        else if (lang === 'wavedrom') await renderWavedrom(ph, code)
        else if (lang === 'nomnoml') await renderNomnoml(ph, code)
        else if (lang === 'ditaa') renderDitaa(ph, code)
        else ph.textContent = code
      } catch (e) {
        ph.innerHTML = '<div class="diagram-error">Render error: ' + escapeHtml(e && e.message ? e.message : e) + '</div>'
      }
      if (lang !== 'ditaa' && !ph.querySelector('.diagram-error')) diagramCache.set(key, ph.innerHTML)
    }
    ensureDiagramViewBox(ph)
    addDiagramControls(ph)
  }
}

export { escapeHtml }
