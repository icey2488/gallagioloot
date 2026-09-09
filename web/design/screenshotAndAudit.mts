// One-off script (run via `npx tsx design/screenshotAndAudit.mts` after
// `npx tsx design/renderScreens.tsx`): loads each statically-rendered screen with
// Playwright, screenshots the three data-heavy views, and runs axe-core against all
// four screens. Fails (exit 1) if any serious/critical violation remains.
import { chromium } from 'playwright'
import AxeBuilder from '@axe-core/playwright'
import { fileURLToPath } from 'node:url'

const PAGES: Array<{ name: string; screenshot?: string; fullPage?: boolean }> = [
  { name: 'paste' },
  { name: 'deployability', screenshot: 'deployability.png', fullPage: true },
  { name: 'roll', screenshot: 'recommendation-card.png', fullPage: false },
  { name: 'reconcile', screenshot: 'reconcile.png', fullPage: true },
  { name: 'loot-table', screenshot: 'loot-table.png', fullPage: true },
]

async function main() {
  const browser = await chromium.launch()
  let totalSerious = 0
  const summary: string[] = []

  for (const p of PAGES) {
    const context = await browser.newContext({ viewport: { width: 420, height: 900 } })
    const page = await context.newPage()
    const filePath = fileURLToPath(new URL(`./${p.name}-screen.html`, import.meta.url))
    await page.goto(`file://${filePath}`)

    if (p.screenshot) {
      if (p.name === 'roll') {
        await page.locator('.rec-card').screenshot({ path: `design/${p.screenshot}` })
      } else {
        await page.screenshot({ path: `design/${p.screenshot}`, fullPage: p.fullPage })
      }
      console.log(`Wrote design/${p.screenshot}`)
    }

    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
    const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
    totalSerious += serious.length

    summary.push(`\n=== ${p.name} ===`)
    summary.push(`violations: ${results.violations.length} total, ${serious.length} serious/critical`)
    for (const v of results.violations) {
      summary.push(`  [${v.impact}] ${v.id}: ${v.help} (${v.nodes.length} node${v.nodes.length === 1 ? '' : 's'})`)
      for (const node of v.nodes.slice(0, 5)) {
        summary.push(`    - ${node.target.join(' ')}`)
      }
    }

    await context.close()
  }

  await browser.close()
  console.log(summary.join('\n'))
  console.log(`\nTOTAL serious/critical violations across all 4 screens: ${totalSerious}`)
  if (totalSerious > 0) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
