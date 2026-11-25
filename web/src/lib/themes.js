// Theme system for md-viewer.
//
// Each theme is a single object so adding a 6th is just appending to THEMES.
// A theme carries:
//   - id, label
//   - dark: boolean (derived darkness; kept as `html.dark` class for consumers
//     like PlantUML that still key off it)
//   - vars: CSS custom properties applied to <html> (app chrome + markdown body)
//   - hljs: raw highlight.js stylesheet text injected into <style id="hljs-theme">
//   - mermaid: { theme, themeVariables } passed to mermaid.initialize()
//
// Mermaid uses an explicit per-theme mapping (NOT the dark class), so the
// `dark` class is retained only as a derived boolean for PlantUML/legacy CSS.

import githubLightCss from 'highlight.js/styles/github.css?raw'
import githubDarkCss from 'highlight.js/styles/github-dark.css?raw'
import vsLightCss from 'highlight.js/styles/vs.css?raw'
import vsDarkCss from 'highlight.js/styles/vs2015.css?raw'
import githubDarkDimmedCss from 'highlight.js/styles/github-dark-dimmed.css?raw'

export const DEFAULT_THEME = 'github-light'

const baseVars = (overrides) => ({
  '--app-bg': '#ffffff',
  '--app-fg': '#1f2328',
  '--app-toolbar-bg': '#f6f8fa',
  '--app-border': '#d0d7de',
  '--app-accent': '#0969da',
  '--md-bg': '#ffffff',
  '--md-fg': '#1f2328',
  '--link-color': '#0969da',
  '--code-bg': '#f6f8fa',
  '--code-fg': '#1f2328',
  '--table-border': '#d0d7de',
  '--table-header-bg': '#f6f8fa',
  '--table-zebra-bg': '#f6f8fa',
  ...overrides,
})

export const THEMES = [
  {
    id: 'github-light',
    label: 'GitHub Light',
    dark: false,
    vars: baseVars({}),
    hljs: githubLightCss,
    mermaid: {
      theme: 'default',
      themeVariables: {
        primaryColor: '#0969da',
        primaryTextColor: '#1f2328',
        primaryBorderColor: '#d0d7de',
        lineColor: '#57606a',
        secondaryColor: '#f6f8fa',
        tertiaryColor: '#ffffff',
      },
    },
  },
  {
    id: 'github-dark',
    label: 'GitHub Dark',
    dark: true,
    vars: baseVars({
      '--app-bg': '#0d1117',
      '--app-fg': '#c9d1d9',
      '--app-toolbar-bg': '#161b22',
      '--app-border': '#30363d',
      '--app-accent': '#58a6ff',
      '--md-bg': '#0d1117',
      '--md-fg': '#c9d1d9',
      '--link-color': '#58a6ff',
      '--code-bg': '#161b22',
      '--code-fg': '#c9d1d9',
      '--table-border': '#30363d',
      '--table-header-bg': '#161b22',
      '--table-zebra-bg': '#161b22',
    }),
    hljs: githubDarkCss,
    mermaid: {
      theme: 'dark',
      themeVariables: {
        primaryColor: '#58a6ff',
        primaryTextColor: '#c9d1d9',
        primaryBorderColor: '#30363d',
        lineColor: '#8b949e',
        secondaryColor: '#161b22',
        tertiaryColor: '#0d1117',
      },
    },
  },
  {
    id: 'vs-light',
    label: 'VS Light',
    dark: false,
    vars: baseVars({
      '--app-bg': '#ffffff',
      '--app-fg': '#000000',
      '--app-toolbar-bg': '#f3f3f3',
      '--app-border': '#e4e4e4',
      '--app-accent': '#005fb8',
      '--md-bg': '#ffffff',
      '--md-fg': '#000000',
      '--link-color': '#005fb8',
      '--code-bg': '#f3f3f3',
      '--code-fg': '#000000',
      '--table-border': '#e4e4e4',
      '--table-header-bg': '#f3f3f3',
      '--table-zebra-bg': '#f3f3f3',
    }),
    hljs: vsLightCss,
    mermaid: {
      theme: 'neutral',
      themeVariables: {
        primaryColor: '#005fb8',
        primaryTextColor: '#000000',
        primaryBorderColor: '#e4e4e4',
        lineColor: '#333333',
        secondaryColor: '#f3f3f3',
        tertiaryColor: '#ffffff',
      },
    },
  },
  {
    id: 'vs-dark',
    label: 'VS Dark',
    dark: true,
    vars: baseVars({
      '--app-bg': '#1e1e1e',
      '--app-fg': '#d4d4d4',
      '--app-toolbar-bg': '#333333',
      '--app-border': '#3c3c3c',
      '--app-accent': '#569cd6',
      '--md-bg': '#1e1e1e',
      '--md-fg': '#d4d4d4',
      '--link-color': '#569cd6',
      '--code-bg': '#252526',
      '--code-fg': '#d4d4d4',
      '--table-border': '#3c3c3c',
      '--table-header-bg': '#252526',
      '--table-zebra-bg': '#252526',
    }),
    hljs: vsDarkCss,
    mermaid: {
      theme: 'dark',
      themeVariables: {
        primaryColor: '#569cd6',
        primaryTextColor: '#d4d4d4',
        primaryBorderColor: '#3c3c3c',
        lineColor: '#808080',
        secondaryColor: '#252526',
        tertiaryColor: '#1e1e1e',
      },
    },
  },
  {
    id: 'discord',
    label: 'Discord',
    dark: true,
    vars: baseVars({
      '--app-bg': '#313338',
      '--app-fg': '#dbdee1',
      '--app-toolbar-bg': '#2b2d31',
      '--app-border': '#1e1f22',
      '--app-accent': '#5865F2',
      '--md-bg': '#313338',
      '--md-fg': '#dbdee1',
      '--link-color': '#00a8fc',
      '--code-bg': '#2b2d31',
      '--code-fg': '#f2f3f5',
      '--table-border': '#1e1f22',
      '--table-header-bg': '#2b2d31',
      '--table-zebra-bg': '#2b2d31',
    }),
    hljs: githubDarkDimmedCss,
    mermaid: {
      theme: 'dark',
      themeVariables: {
        primaryColor: '#5865F2',
        primaryTextColor: '#dbdee1',
        primaryBorderColor: '#1e1f22',
        lineColor: '#949ba4',
        secondaryColor: '#2b2d31',
        tertiaryColor: '#313338',
      },
    },
  },
]

export function getTheme(id) {
  return THEMES.find((t) => t.id === id) || THEMES.find((t) => t.id === DEFAULT_THEME)
}

export function currentThemeId() {
  if (typeof document === 'undefined') return DEFAULT_THEME
  return document.documentElement.getAttribute('data-theme') || DEFAULT_THEME
}

export function applyTheme(id) {
  const theme = getTheme(id)
  if (typeof document === 'undefined') return theme
  const root = document.documentElement
  root.setAttribute('data-theme', theme.id)
  root.classList.toggle('dark', !!theme.dark)
  for (const [k, v] of Object.entries(theme.vars)) {
    root.style.setProperty(k, v)
  }
  let style = document.getElementById('hljs-theme')
  if (!style) {
    style = document.createElement('style')
    style.id = 'hljs-theme'
    document.head.appendChild(style)
  }
  style.textContent = theme.hljs
  return theme
}

export function getMermaidConfig(id = currentThemeId()) {
  const theme = getTheme(id)
  return {
    startOnLoad: false,
    theme: theme.mermaid.theme,
    themeVariables: theme.mermaid.themeVariables,
    securityLevel: 'strict',
    htmlLabels: false,
    flowchart: { htmlLabels: false },
  }
}
