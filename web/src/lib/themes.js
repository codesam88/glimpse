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
      theme: 'base',
      themeVariables: {
        primaryColor: '#ffffff',
        primaryTextColor: '#1f2328',
        primaryBorderColor: '#d0d7de',
        secondaryColor: '#f6f8fa',
        secondaryTextColor: '#1f2328',
        secondaryBorderColor: '#d0d7de',
        tertiaryColor: '#f6f8fa',
        tertiaryTextColor: '#1f2328',
        tertiaryBorderColor: '#d0d7de',
        lineColor: '#57606a',
        textColor: '#1f2328',
        mainBkg: '#ffffff',
        nodeBorder: '#d0d7de',
        clusterBkg: '#f6f8fa',
        clusterBorder: '#d0d7de',
        noteBkg: '#fff8c5',
        noteTextColor: '#1f2328',
        noteBorder: '#d4a72c',
        titleColor: '#1f2328',
        edgeLabelBackground: '#ffffff',
        fontSize: '16px',
        actorBkg: '#eaf2fb',
        actorTextColor: '#1f2328',
        actorBorder: '#c9d8ea',
        actorLineColor: '#c9d8ea',
        activationBkgColor: '#eaf2fb',
        activationBorderColor: '#c9d8ea',
        sequenceNumberColor: '#1f2328',
        noteBkgColor: '#fff8c5',
        noteBorderColor: '#d4a72c',
        noteTextColor: '#1f2328',
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
      theme: 'base',
      themeVariables: {
        primaryColor: '#161b22',
        primaryTextColor: '#c9d1d9',
        primaryBorderColor: '#30363d',
        secondaryColor: '#0d1117',
        secondaryTextColor: '#c9d1d9',
        secondaryBorderColor: '#30363d',
        tertiaryColor: '#0d1117',
        tertiaryTextColor: '#c9d1d9',
        tertiaryBorderColor: '#30363d',
        lineColor: '#8b949e',
        textColor: '#c9d1d9',
        mainBkg: '#161b22',
        nodeBorder: '#30363d',
        clusterBkg: '#0d1117',
        clusterBorder: '#30363d',
        noteBkg: '#1f2a3b',
        noteTextColor: '#c9d1d9',
        noteBorder: '#3b5a8a',
        titleColor: '#c9d1d9',
        edgeLabelBackground: '#0d1117',
        fontSize: '16px',
        actorBkg: '#27324a',
        actorTextColor: '#c9d1d9',
        actorBorder: '#3d4b63',
        actorLineColor: '#3d4b63',
        activationBkgColor: '#27324a',
        activationBorderColor: '#3d4b63',
        sequenceNumberColor: '#c9d1d9',
        noteBkgColor: '#1f2a3b',
        noteBorderColor: '#3b5a8a',
        noteTextColor: '#c9d1d9',
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
      theme: 'base',
      themeVariables: {
        primaryColor: '#ffffff',
        primaryTextColor: '#000000',
        primaryBorderColor: '#e4e4e4',
        secondaryColor: '#f3f3f3',
        secondaryTextColor: '#000000',
        secondaryBorderColor: '#e4e4e4',
        tertiaryColor: '#f3f3f3',
        tertiaryTextColor: '#000000',
        tertiaryBorderColor: '#e4e4e4',
        lineColor: '#333333',
        textColor: '#000000',
        mainBkg: '#ffffff',
        nodeBorder: '#e4e4e4',
        clusterBkg: '#f3f3f3',
        clusterBorder: '#e4e4e4',
        noteBkg: '#fff8c5',
        noteTextColor: '#000000',
        noteBorder: '#d4a72c',
        titleColor: '#000000',
        edgeLabelBackground: '#ffffff',
        fontSize: '16px',
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
      theme: 'base',
      themeVariables: {
        primaryColor: '#252526',
        primaryTextColor: '#d4d4d4',
        primaryBorderColor: '#3c3c3c',
        secondaryColor: '#1e1e1e',
        secondaryTextColor: '#d4d4d4',
        secondaryBorderColor: '#3c3c3c',
        tertiaryColor: '#1e1e1e',
        tertiaryTextColor: '#d4d4d4',
        tertiaryBorderColor: '#3c3c3c',
        lineColor: '#808080',
        textColor: '#d4d4d4',
        mainBkg: '#252526',
        nodeBorder: '#3c3c3c',
        clusterBkg: '#1e1e1e',
        clusterBorder: '#3c3c3c',
        noteBkg: '#2d2a1f',
        noteTextColor: '#d4d4d4',
        noteBorder: '#9a6700',
        titleColor: '#d4d4d4',
        edgeLabelBackground: '#1e1e1e',
        fontSize: '16px',
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
      theme: 'base',
      themeVariables: {
        primaryColor: '#2b2d31',
        primaryTextColor: '#dbdee1',
        primaryBorderColor: '#4e5058',
        secondaryColor: '#313338',
        secondaryTextColor: '#dbdee1',
        secondaryBorderColor: '#4e5058',
        tertiaryColor: '#313338',
        tertiaryTextColor: '#dbdee1',
        tertiaryBorderColor: '#4e5058',
        lineColor: '#949ba4',
        textColor: '#dbdee1',
        mainBkg: '#2b2d31',
        nodeBorder: '#4e5058',
        clusterBkg: '#313338',
        clusterBorder: '#4e5058',
        noteBkg: '#2b2d31',
        noteTextColor: '#dbdee1',
        noteBorder: '#5865F2',
        titleColor: '#dbdee1',
        edgeLabelBackground: '#313338',
        fontSize: '16px',
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
  root.style.colorScheme = theme.dark ? 'dark' : 'light'
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
