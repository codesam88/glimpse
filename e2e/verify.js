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

// Menu popover visibility / hit-testing / Escape close.
const menuTriggers = await page.locator('[data-testid^="menu-"]').all()
for (const trig of menuTriggers) {
  const tid = await trig.getAttribute('data-testid')
  await trig.click()
  await page.waitForSelector('.menu-popover', { state: 'visible', timeout: 5000 })
  const pop = page.locator('.menu-popover').first()
  const box = await pop.boundingBox()
  const vp = page.viewportSize()
  const inViewport = !!box && box.x >= 0 && box.y >= 0 &&
    box.x + box.width <= (vp?.width || 0) && box.y + box.height <= (vp?.height || 0)
  const item = pop.locator('[role="menuitem"]').first()
  const ibox = await item.boundingBox()
  const hitInside = (ibox && vp)
    ? await page.evaluate(({ x, y }) => {
        const el = document.elementFromPoint(x, y)
        return !!el && !!el.closest('.menu-popover')
      }, { x: ibox.x + ibox.width / 2, y: ibox.y + ibox.height / 2 })
    : false
  check(`menu popover visible & in viewport (${tid})`, inViewport && hitInside, `inViewport=${inViewport} hit=${hitInside}`)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(200)
  const stillOpen = await page.locator('.menu-popover').isVisible().catch(() => false)
  check(`menu closes on Escape (${tid})`, !stillOpen, stillOpen ? 'still open' : '')
}

// Only one popover visible at a time: opening a second closes the first.
const allTrigs = await page.locator('[data-testid^="menu-"]').all()
if (allTrigs.length >= 2) {
  await allTrigs[0].click()
  await page.waitForSelector('.menu-popover', { state: 'visible', timeout: 5000 })
  await allTrigs[1].click()
  await page.waitForTimeout(200)
  const visibleCount = await page.locator('.menu-popover').count()
  check('only one menu popover visible at a time', visibleCount <= 1, `${visibleCount} visible`)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(100)
}

// Header geometry: full-bleed, top of window, distinct background.
const headerBox = await page.locator('[data-testid="app-header"]').boundingBox()
const vp = page.viewportSize()
check('app-header at top-left (x≈0,y≈0)', !!headerBox && headerBox.x <= 0.5 && headerBox.y <= 0.5, JSON.stringify(headerBox))
check('app-header full width', !!headerBox && vp && Math.abs(headerBox.width - vp.width) <= 1, `${headerBox?.width} vs ${vp?.width}`)
const headerBg = await page.locator('[data-testid="app-header"]').evaluate((el) => getComputedStyle(el).backgroundColor)
const bodyBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
check('header bg differs from body bg', headerBg !== bodyBg, `${headerBg} vs ${bodyBg}`)
const menubarBox = await page.locator('[data-testid="menubar"]').boundingBox()
const quickbarBox = await page.locator('[data-testid="quickbar"]').boundingBox()
check('menubar above quickbar', !!menubarBox && !!quickbarBox && menubarBox.y + menubarBox.height <= quickbarBox.y + 1, `${menubarBox?.y}/${quickbarBox?.y}`)
check('menubar inside header', !!headerBox && !!menubarBox && menubarBox.x >= headerBox.x - 0.5 && menubarBox.y >= headerBox.y - 0.5 && menubarBox.x + menubarBox.width <= headerBox.x + headerBox.width + 0.5 && menubarBox.y + menubarBox.height <= headerBox.y + headerBox.height + 0.5, '')
check('quickbar inside header', !!headerBox && !!quickbarBox && quickbarBox.x >= headerBox.x - 0.5 && quickbarBox.y >= headerBox.y - 0.5 && quickbarBox.x + quickbarBox.width <= headerBox.x + headerBox.width + 0.5 && quickbarBox.y + quickbarBox.height <= headerBox.y + headerBox.height + 0.5, '')
const menusInMenubar = await page.locator('[data-testid="menubar"] [data-testid^="menu-"]').count()
check('3 menu triggers in menubar', menusInMenubar === 3, `${menusInMenubar}`)
check('zoom-in button in quickbar', await page.locator('[data-testid="quickbar"] button[title="Zoom in"]').count() === 1, '')
check('sidebar toggle in quickbar', await page.locator('[data-testid="quickbar"] [data-testid="sidebar-toggle"]').count() === 1, '')

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


// Include ordering: mid-paragraph include renders as a block sibling in source order.
const { fileURLToPath } = await import('node:url')
const { dirname: _dirname, resolve: _resolve } = await import('node:path')
const includeFixturePath = fileURLToPath(new URL('../web/public/include-order.md', import.meta.url))
await page.locator('input[type=file]').setInputFiles(includeFixturePath)
await page.waitForSelector('.include-root', { timeout: 15000 })
await page.waitForTimeout(1500)
const incRes = await page.evaluate(() => {
  const root = document.querySelector('#rendered')
  if (!root) return { ok: false, reason: 'no #rendered' }
  if (root.querySelector('p .include-root, p .include-placeholder, h1 .include-root, h1 .include-placeholder')) {
    return { ok: false, reason: 'include nested in p/h1' }
  }
  const text = root.textContent || ''
  const positions = ['mid', 'Target doc', 'tail', 'after'].map((s) => text.indexOf(s))
  if (positions.some((p) => p < 0)) return { ok: false, reason: 'missing text ' + positions.join(',') }
  for (let i = 1; i < positions.length; i++) {
    if (!(positions[i - 1] < positions[i])) return { ok: false, reason: 'order ' + positions.join(',') }
  }
  const ir = root.querySelector('.include-root')
  const prev = ir ? ir.previousElementSibling : null
  const next = ir ? ir.nextElementSibling : null
  const prevText = prev ? (prev.textContent || '').trim() : ''
  const nextText = next ? (next.textContent || '').trim() : ''
  if (!prevText.includes('mid')) return { ok: false, reason: 'prev not mid: ' + prevText }
  if (!nextText.includes('tail')) return { ok: false, reason: 'next not tail: ' + nextText }
  return { ok: true }
})
check('include ordering mid-paragraph renders in source order', incRes.ok, incRes.reason || '')

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
