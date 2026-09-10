// One-off script (run via `npx tsx design/renderScreens.tsx && npx tsx design/pasteScreenshots.mts`):
// screenshots the Paste screen pre-fetch (paste-empty-screen.html) and post-fetch
// (paste-screen.html) at phone (390px) and desktop (1200px) widths, for the v2 2a
// mockup-parity pass -- verifying the two-column layout renders from first paint.
import { chromium } from 'playwright'
import { fileURLToPath } from 'node:url'

const WIDTHS = { phone: 390, desktop: 1200 }

async function shot(browser: import('playwright').Browser, source: string, outName: string, width: number) {
  const context = await browser.newContext({ viewport: { width, height: 900 } })
  const page = await context.newPage()
  await page.goto(`file://${fileURLToPath(new URL(`./${source}-screen.html`, import.meta.url))}`)
  await page.screenshot({ path: `design/${outName}.png`, fullPage: true })
  await context.close()
  console.log(`Wrote design/${outName}.png (${width}px)`)
}

async function main() {
  const browser = await chromium.launch()
  await shot(browser, 'paste-empty', 'paste-prefetch-phone', WIDTHS.phone)
  await shot(browser, 'paste-empty', 'paste-prefetch-desktop', WIDTHS.desktop)
  await shot(browser, 'paste', 'paste-postfetch-phone', WIDTHS.phone)
  await shot(browser, 'paste', 'paste-postfetch-desktop', WIDTHS.desktop)
  await browser.close()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
