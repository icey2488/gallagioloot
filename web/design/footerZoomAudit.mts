// One-off verification script (run via `npx tsx design/renderScreens.tsx && npx tsx design/footerZoomAudit.mts`)
// for the in-flow footer redesign (2026-09-09): confirms axe has 0 serious/critical
// violations on every screen at 390px and 1200px, and again with 130% zoom emulated via
// the CSS `zoom` property (Chromium-only, closest analog to a browser zoom level Playwright
// can drive headlessly). Also confirms the Paste screen's footer is fully visible without
// scrolling at a 1200x800 viewport, the concrete regression this redesign fixes, and writes
// paste-screen-100.png / paste-screen-130.png screenshots at both zoom levels.
import { chromium } from 'playwright'
import AxeBuilder from '@axe-core/playwright'
import { fileURLToPath } from 'node:url'

const SCREENS = ['paste-empty', 'paste', 'deployability', 'roll', 'reconcile', 'loot-table']
const WIDTHS = [390, 1200]

async function auditScreen(browser: import('playwright').Browser, name: string, width: number, zoom: boolean) {
  const context = await browser.newContext({ viewport: { width, height: 900 } })
  const page = await context.newPage()
  const filePath = fileURLToPath(new URL(`./${name}-screen.html`, import.meta.url))
  await page.goto(`file://${filePath}`)
  if (zoom) {
    await page.addStyleTag({ content: 'html { zoom: 1.3; }' })
  }
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
  await context.close()
  return { name, width, zoom, serious }
}

async function checkPasteFooterVisible(browser: import('playwright').Browser) {
  const context = await browser.newContext({ viewport: { width: 1200, height: 800 } })
  const page = await context.newPage()
  await page.goto(`file://${fileURLToPath(new URL('./paste-empty-screen.html', import.meta.url))}`)
  const footer = page.locator('.app-footer')
  const box = await footer.boundingBox()
  await context.close()
  if (!box) throw new Error('footer not found on paste screen')
  const fullyVisible = box.y >= 0 && box.y + box.height <= 800
  return { box, fullyVisible }
}

async function shotPasteZoom(browser: import('playwright').Browser, zoomPct: 100 | 130) {
  const context = await browser.newContext({ viewport: { width: 1200, height: 800 } })
  const page = await context.newPage()
  await page.goto(`file://${fileURLToPath(new URL('./paste-empty-screen.html', import.meta.url))}`)
  if (zoomPct !== 100) {
    await page.addStyleTag({ content: `html { zoom: ${zoomPct / 100}; }` })
  }
  await page.screenshot({ path: `design/paste-screen-${zoomPct}.png`, fullPage: true })
  await context.close()
  console.log(`Wrote design/paste-screen-${zoomPct}.png`)
}

async function main() {
  const browser = await chromium.launch()
  let totalSerious = 0
  const summary: string[] = []

  for (const name of SCREENS) {
    for (const width of WIDTHS) {
      for (const zoom of [false, true]) {
        const { serious } = await auditScreen(browser, name, width, zoom)
        totalSerious += serious.length
        const label = `${name} @ ${width}px${zoom ? ' @ 130% zoom' : ''}`
        summary.push(`${label}: ${serious.length} serious/critical`)
        for (const v of serious) {
          summary.push(`  [${v.impact}] ${v.id}: ${v.help} (${v.nodes.length} node${v.nodes.length === 1 ? '' : 's'})`)
        }
      }
    }
  }

  const { box, fullyVisible } = await checkPasteFooterVisible(browser)
  summary.push(`\nPaste screen footer @ 1200x800: y=${box.y.toFixed(1)} height=${box.height.toFixed(1)} bottom=${(box.y + box.height).toFixed(1)} fullyVisible=${fullyVisible}`)

  await shotPasteZoom(browser, 100)
  await shotPasteZoom(browser, 130)

  await browser.close()
  console.log(summary.join('\n'))
  console.log(`\nTOTAL serious/critical violations: ${totalSerious}`)
  if (totalSerious > 0 || !fullyVisible) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
