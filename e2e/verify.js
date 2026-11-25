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
const pageErrs = pageErrors.length
check('zero page errors', pageErrs === 0, pageErrors.slice(0, 3).join(' | '))
check('zero external requests', external.length === 0, external.slice(0, 3).join(' | '))

await browser.close()
const failed = results.filter((r) => !r.ok).length
console.log(failed === 0 ? '\nALL GREEN' : `\n${failed} FAILED`)
process.exit(failed === 0 ? 0 : 1)
