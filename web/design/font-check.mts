// One-off script (run via `npx tsx design/font-check.mts`): verifies the deployed
// site self-hosts IBM Plex Sans -- a woff2 request to the site's own origin succeeds,
// and the card headline's computed font-family resolves to IBM Plex Sans. Also asserts
// no request left gallagioloot.icehunter.net / gallagioloot-proxy.icehunter.net (no
// Google Fonts / third-party font request).
//
// Same DNS workaround as live-check.mts -- see that file's header comment.
import { chromium } from 'playwright'

const APP_URL = 'https://gallagioloot.icehunter.net'
const REPORT_URL = 'https://www.raidbots.com/reports/jk6WmLFEnBpEqWueDkyRqA'
const SITE_IP = '104.21.45.45'
const ALLOWED_HOSTS = ['gallagioloot.icehunter.net', 'gallagioloot-proxy.icehunter.net']

async function main() {
  const browser = await chromium.launch({
    args: [`--host-resolver-rules=MAP gallagioloot.icehunter.net ${SITE_IP}`],
  })
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } })

  const offOriginRequests: string[] = []
  const woff2Requests: string[] = []
  page.on('request', (req) => {
    const url = new URL(req.url())
    if (url.protocol === 'data:') return
    if (!ALLOWED_HOSTS.includes(url.hostname)) offOriginRequests.push(req.url())
    if (url.pathname.endsWith('.woff2')) woff2Requests.push(req.url())
  })
  const woff2Statuses = new Map<string, number>()
  page.on('response', (res) => {
    const url = new URL(res.url())
    if (url.pathname.endsWith('.woff2')) woff2Statuses.set(res.url(), res.status())
  })

  await page.goto(APP_URL)
  await page.waitForSelector('#report-url', { timeout: 10000 })
  await page.fill('#report-url', REPORT_URL)
  await page.waitForSelector('text=Detected:')
  await page.click('text=Fetch report')
  await page.waitForSelector('text=Price my roll', { timeout: 20000 })
  await page.click('text=Price my roll')
  await page.click('text=Roll this boss')
  await page.waitForSelector('.rec-card__headline')

  // Force the browser to actually resolve/paint the font before reading computed style.
  await page.evaluate(() => document.fonts.ready)

  const fontFamily = await page.locator('.rec-card__headline').evaluate((el) => getComputedStyle(el).fontFamily)
  console.log('rec-card__headline computed font-family:', fontFamily)
  if (!fontFamily.toLowerCase().includes('ibm plex sans')) {
    throw new Error(`expected computed font-family to include "IBM Plex Sans", got ${JSON.stringify(fontFamily)}`)
  }

  const loadedFaces = await page.evaluate(() => {
    const out: string[] = []
    ;(document.fonts as unknown as Iterable<FontFace>).forEach?.((f: FontFace) => out.push(`${f.family} ${f.weight} -- ${f.status}`))
    return out
  })
  console.log('Loaded FontFace entries:')
  for (const f of loadedFaces) console.log(' ', f)
  const plexLoaded = loadedFaces.some((f) => f.toLowerCase().includes('ibm plex sans') && f.includes('loaded'))
  if (!plexLoaded) {
    throw new Error('expected at least one IBM Plex Sans FontFace with status "loaded"')
  }

  console.log('\nwoff2 requests:', woff2Requests.length)
  for (const u of woff2Requests) console.log(' ', u, '->', woff2Statuses.get(u))
  if (woff2Requests.length === 0) throw new Error('expected at least one .woff2 request')
  for (const u of woff2Requests) {
    const host = new URL(u).hostname
    if (!ALLOWED_HOSTS.includes(host)) throw new Error(`woff2 request left the site's own origin: ${u}`)
    const status = woff2Statuses.get(u)
    if (status !== 200) throw new Error(`woff2 request ${u} did not return 200 (got ${status})`)
  }

  // Cloudflare injects its own Web Analytics/RUM beacon (static.cloudflareinsights.com)
  // at the edge for zones with it enabled -- it's not present in dist/index.html (verified:
  // `git diff -- index.html` is empty, the built file has no such <script>) and isn't
  // controllable from this repo (wrangler.toml/app code); it's a zone-level Cloudflare
  // setting, unrelated to font loading. Reported, not treated as a font-hosting failure.
  const nonBeaconOffOrigin = offOriginRequests.filter((u) => !u.includes('static.cloudflareinsights.com'))
  if (nonBeaconOffOrigin.length > 0) {
    throw new Error(`requests left gallagioloot.icehunter.net / gallagioloot-proxy.icehunter.net: ${nonBeaconOffOrigin.join(', ')}`)
  }
  if (offOriginRequests.length > 0) {
    console.log('\nNote: Cloudflare edge-injected beacon observed (not a font request, not in this repo\'s HTML source):')
    for (const u of offOriginRequests) console.log(' ', u)
  } else {
    console.log('\nNo requests left the site/proxy origins.')
  }

  await page.screenshot({ path: 'design/live-card.png' })
  await browser.close()
  console.log('\nFont self-hosting check passed: IBM Plex Sans loads via same-origin woff2, no external font request.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
