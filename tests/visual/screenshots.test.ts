import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, it } from 'vitest'
import { chromium, type Browser, type Page } from 'playwright-core'
import { createServer, type ViteDevServer } from 'vite'
import pixelmatch from 'pixelmatch'
import { PNG } from 'pngjs'

type VisualSpec = {
  mode: 'translate' | 'rotate' | 'scale' | 'combined'
  space: 'world' | 'local'
  pose?: 'idle' | 'sector' | 'extrude'
}

const dir = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(dir, '../..')
const goldensDir = join(dir, 'goldens')
const diffDir = join(dir, '__diff__')

const cases: { name: string; spec: VisualSpec }[] = [
  { name: 'translate-world', spec: { mode: 'translate', space: 'world' } },
  { name: 'translate-local', spec: { mode: 'translate', space: 'local' } },
  { name: 'rotate-world', spec: { mode: 'rotate', space: 'world' } },
  { name: 'rotate-local', spec: { mode: 'rotate', space: 'local' } },
  { name: 'scale-world', spec: { mode: 'scale', space: 'world' } },
  { name: 'scale-local', spec: { mode: 'scale', space: 'local' } },
  { name: 'combined-world', spec: { mode: 'combined', space: 'world' } },
  { name: 'combined-local', spec: { mode: 'combined', space: 'local' } },
  { name: 'rotate-sector', spec: { mode: 'rotate', space: 'world', pose: 'sector' } },
  { name: 'scale-extrude', spec: { mode: 'scale', space: 'world', pose: 'extrude' } },
]

let server: ViteDevServer
let browser: Browser
let page: Page
let origin: string

beforeAll(async () => {
  server = await createServer({
    configFile: join(repoRoot, 'demo/vite.config.ts'),
    root: join(repoRoot, 'demo'),
    server: { host: '127.0.0.1', port: 0, strictPort: false },
  })
  await server.listen()
  const addr = server.httpServer?.address()
  if (!addr || typeof addr === 'string') throw new Error('vite server has no address')
  origin = `http://127.0.0.1:${addr.port}`

  browser = await chromium.launch({
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist'],
  })
  const context = await browser.newContext({
    viewport: { width: 800, height: 600 },
    deviceScaleFactor: 1,
  })
  page = await context.newPage()
  await page.goto(`${origin}/visual.html`)
  await page.waitForFunction(() => (window as unknown as { __visualReady?: boolean }).__visualReady === true)
}, 60_000)

afterAll(async () => {
  await browser?.close()
  await server?.close()
})

function comparePng(actual: Buffer, name: string): void {
  const goldenPath = join(goldensDir, `${name}.png`)
  if (process.env.UPDATE_SNAPSHOTS === '1') {
    mkdirSync(goldensDir, { recursive: true })
    writeFileSync(goldenPath, actual)
    return
  }
  if (!existsSync(goldenPath)) {
    mkdirSync(diffDir, { recursive: true })
    writeFileSync(join(diffDir, `${name}.actual.png`), actual)
    throw new Error(`missing golden ${goldenPath} — run UPDATE_SNAPSHOTS=1 npm run test:visual`)
  }

  const golden = PNG.sync.read(readFileSync(goldenPath))
  const shot = PNG.sync.read(actual)
  if (shot.width !== golden.width || shot.height !== golden.height) {
    throw new Error(`${name}: size ${shot.width}x${shot.height} vs golden ${golden.width}x${golden.height}`)
  }

  const diff = new PNG({ width: shot.width, height: shot.height })
  const mismatched = pixelmatch(shot.data, golden.data, diff.data, shot.width, shot.height, {
    threshold: 0.12,
  })
  const budget = Math.floor(shot.width * shot.height * 0.02)
  if (mismatched > budget) {
    mkdirSync(diffDir, { recursive: true })
    writeFileSync(join(diffDir, `${name}.actual.png`), actual)
    writeFileSync(join(diffDir, `${name}.diff.png`), PNG.sync.write(diff))
    throw new Error(`${name}: ${mismatched} pixels differ (budget ${budget})`)
  }
}

describe('visual screenshots', () => {
  it.each(cases)('$name', async ({ name, spec }) => {
    await page.evaluate((s) => {
      const w = window as unknown as { __setVisual: (spec: VisualSpec) => void }
      w.__setVisual(s)
    }, spec)
    const png = await page.locator('canvas').screenshot({ type: 'png' })
    comparePng(png, name)
  })
})
