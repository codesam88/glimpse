// Canonical Glimpse e2e verification (the recurring checklist workers kept
// re-writing as one-off debug scripts). Run: npm test (from e2e/).
// Usage: node verify.js [url]  (default http://127.0.0.1:4173)
//
// Checks: page loads, diagrams render, sidebar/toolbar sane, zero page
// errors, zero cross-origin network requests. Exit code 0 = pass.
import { chromium } from 'playwright'

const url = process.argv[2] || 'http://127.0.0.1:4173/'
const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`)
}

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage()
const pageErrors = []
const external = []
page.on('pageerror', (e) => pageErrors.push(String(e)))
page.on('request', (r) => {
  if (!r.url().startsWith(url) && !r.url().startsWith('http://127.0.0.1')) external.push(r.url())
})
await page.goto(url, { waitUntil: 'networkidle' })
await page.waitForSelector('#rendered', { timeout: 15000 })
await page.waitForTimeout(2500)

check('page loads with #rendered', true)
const svgs = await page.locator('#rendered svg').count()
check('diagrams rendered (svg count > 0)', svgs > 0, `${svgs} svg`)
const foreignObjects = await page.locator('#rendered foreignObject').count()
check('no foreignObject in diagrams', foreignObjects === 0, `${foreignObjects}`)
const sidebar = await page.locator('[data-testid="sidebar"]').count()
check('sidebar present', sidebar === 1)
const menus = await page.locator('[data-testid^="menu-"]').count()
check('menus present', menus >= 3, `${menus}`)
const iconBtns = await page.locator('.icon-btn').count()
check('icon buttons present', iconBtns >= 4, `${iconBtns}`)
// Logical scroll anchoring: a geometry change (zoom) must keep the same
// source block at the top of the viewport, not the same pixel offset.
await page.evaluate(() => {
  const sc = document.querySelector('.preview-scroll')
  sc.scrollTop = Math.round(sc.scrollHeight * 0.45)
})
await page.waitForTimeout(400)
const topLine = () =>
  page.evaluate(() => {
    const sc = document.querySelector('.preview-scroll')
    const rect = sc.getBoundingClientRect()
    const els = [...sc.querySelectorAll('[data-source-line]')].filter((e) => !e.closest('.include-root'))
    const el = els.find((e) => e.getBoundingClientRect().bottom > rect.top + 1)
    return el ? +el.getAttribute('data-source-line') : null
  })
const anchorBefore = await topLine()
await page.locator('button[title="Zoom in"]').click()
await page.waitForTimeout(250)
await page.locator('button[title="Zoom in"]').click()
await page.waitForTimeout(900)
const anchorAfter = await topLine()
check(
  'scroll anchor held across zoom',
  anchorBefore !== null && anchorAfter !== null && Math.abs(anchorBefore - anchorAfter) <= 1,
  `${anchorBefore} -> ${anchorAfter}`,
)

// CriticMarkup around an image: the marker must be visible (background behind
// an opaque image is not), deletions dim the image.
const { writeFileSync } = await import('node:fs')
const { join } = await import('node:path')
const { tmpdir } = await import('node:os')
const criticPath = join(tmpdir(), 'glimpse-e2e-critic-image.md')
writeFileSync(criticPath, '# critic image\n\n{==![a](/favicon.svg)==}\n\n{--![b](/favicon.svg)--}\n')
await page.locator('input[type=file]').setInputFiles(criticPath)
await page.waitForTimeout(800)
const critic = await page.evaluate(() => {
  const m = document.querySelector('#rendered mark > img')
  const d = document.querySelector('#rendered del > img')
  if (!m || !d) return null
  return {
    markBg: getComputedStyle(m.parentElement).backgroundColor,
    markPad: getComputedStyle(m.parentElement).padding,
    delOpacity: getComputedStyle(d).opacity,
  }
})
check(
  'critic markup visible around images',
  !!critic && critic.markBg !== 'rgba(0, 0, 0, 0)' && critic.markPad === '4px' && critic.delOpacity === '0.55',
  JSON.stringify(critic),
)

const pageErrs = pageErrors.length
check('zero page errors', pageErrs === 0, pageErrors.slice(0, 3).join(' | '))
check('zero external requests', external.length === 0, external.slice(0, 3).join(' | '))

await browser.close()
const failed = results.filter((r) => !r.ok).length
console.log(failed === 0 ? '\nALL GREEN' : `\n${failed} FAILED`)
process.exit(failed === 0 ? 0 : 1)
