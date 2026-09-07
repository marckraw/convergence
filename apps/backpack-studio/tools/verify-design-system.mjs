import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { chromium } from 'playwright'
import { resolveStudioWindowSize } from '../electron/main/window-options.config.ts'

const studioWindowSize = resolveStudioWindowSize({ width: 1440, height: 860 })

// Property canary against the production bundle; no server and no screenshot judgment.
const browser = await chromium.launch({
  ...(process.platform === 'darwin' ? { channel: 'chrome' } : {}),
  headless: true,
  args: ['--allow-file-access-from-files'],
})
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } })
const errors = []
page.on('pageerror', (error) => errors.push(error.message))
try {
  await page.addInitScript(() => {
    window.studioUpdateProbe = { restarts: 0, listener: undefined }
    window.backpackStudio = {
      platform: 'test',
      updates: {
        getState: async () => ({ status: 'downloaded', version: '0.2.0' }),
        check: async () => {},
        download: async () => {},
        install: async () => {
          window.studioUpdateProbe.restarts += 1
        },
        subscribe: (listener) => {
          window.studioUpdateProbe.listener = listener
          return () => {
            window.studioUpdateProbe.listener = undefined
          }
        },
      },
    }
  })
  await page.goto(pathToFileURL(resolve('out/renderer/index.html')).href)
  await page.getByRole('button', { name: 'Restart to update' }).click()
  assert.equal(
    await page.evaluate(() => window.studioUpdateProbe.restarts),
    1,
    'Downloaded update reaches the bridge through the mounted banner — mutation: detach install',
  )
  await page.evaluate(() =>
    window.studioUpdateProbe.listener({ status: 'idle' }),
  )
  await page
    .getByRole('button', { name: 'Restart to update' })
    .waitFor({ state: 'hidden' })
  await page.getByRole('heading', { name: 'Your work starts here.' }).waitFor()
  const fonts = await page.evaluate(async () => {
    const book = await document.fonts.load('400 16px "EF Circular"')
    const medium = await document.fonts.load('500 16px "EF Circular"')
    return {
      book: book.map((font) => font.status),
      medium: medium.map((font) => font.status),
      family: getComputedStyle(document.body).fontFamily,
    }
  })
  assert.deepEqual(
    fonts.book,
    ['loaded'],
    'Book font must load from the bundled package asset',
  )
  assert.deepEqual(
    fonts.medium,
    ['loaded'],
    'Medium font must load from the bundled package asset',
  )
  assert.match(
    fonts.family,
    /EF Circular/,
    'The rendered app must inherit Circular',
  )
  const button = page.getByRole('button', { name: 'Continue with Microsoft' })
  const style = await button.evaluate((el) => ({
    background: getComputedStyle(el.querySelector('.ef-button-bg'))
      .backgroundColor,
    color: getComputedStyle(el).color,
    width: el.getBoundingClientRect().width,
    height: el.getBoundingClientRect().height,
  }))
  assert.deepEqual(
    style,
    {
      background: 'rgb(0, 107, 214)',
      color: 'rgb(255, 255, 255)',
      width: 320,
      height: 44,
    },
    'Real Backpack Button geometry and colors must survive Tailwind 4',
  )
  for (const width of [1440, studioWindowSize.minWidth, 1000, 800, 390]) {
    await page.setViewportSize({ width, height: 960 })
    const geometry = await page.evaluate(() => {
      const story = document
        .querySelector('.studio-story')
        .getBoundingClientRect()
      const panel = document
        .querySelector('.studio-panel')
        .getBoundingClientRect()
      return {
        scroll: document.documentElement.scrollWidth,
        story: story.width,
        below: panel.y >= story.bottom,
      }
    })
    assert.ok(geometry.scroll <= width, `No horizontal overflow at ${width}px`)
    assert.equal(geometry.below, width <= 1000, `Story stacks at ${width}px`)
    if (width > 1000) assert.equal(geometry.story, 650)
  }
  async function verifyMinimum(onboarding) {
    // Reserve 28px for the native title bar at the minimum outer-window height.
    await page.setViewportSize({
      width: studioWindowSize.minWidth,
      height: studioWindowSize.minHeight - 28,
    })
    const geometry = await page.evaluate((onboarding) => {
      const left = document
        .querySelector(onboarding ? '.studio-story' : '.studio-nav')
        .getBoundingClientRect()
      const rightElement = document.querySelector(
        onboarding ? '.studio-panel' : '.studio-home-main',
      )
      const right = rightElement.getBoundingClientRect()
      const style = getComputedStyle(rightElement)
      return {
        overflow: document.documentElement.scrollWidth > innerWidth,
        sideBySide: right.x >= left.right && right.y === left.y,
        content:
          right.width -
          parseFloat(style.paddingLeft) -
          parseFloat(style.paddingRight),
        columns: onboarding
          ? 0
          : getComputedStyle(
              document.querySelector('.studio-home-cards'),
            ).gridTemplateColumns.split(' ').length,
      }
    }, onboarding)
    assert.equal(
      geometry.overflow,
      false,
      'Minimum window has no horizontal overflow — mutation: shrink the minimum below content width',
    )
    assert.equal(
      geometry.sideBySide,
      true,
      'Minimum keeps the two columns — mutation: restore the 1000px width',
    )
    if (onboarding)
      assert.ok(
        geometry.content >= 490,
        'The minimum retains 490px panel content',
      )
    else
      assert.equal(
        geometry.columns,
        3,
        'Home cards remain side by side at the minimum',
      )
  }
  await verifyMinimum(true)
  await button.click()
  await page.getByText('Welcome, Marcin.').waitFor()
  await verifyMinimum(true)
  assert.equal(
    await page.getByRole('status').evaluate((el) => getComputedStyle(el).color),
    'rgb(35, 130, 81)',
    'Connected evaluation is green',
  )
  await page.keyboard.press('Control+Shift+D')
  await page
    .getByRole('checkbox', { name: 'Simulate an unreachable daemon' })
    .check()
  await page.keyboard.press('Control+Shift+D')
  assert.equal(
    await page.getByRole('status').textContent(),
    '○ Not connected to backpack.automations',
  )
  assert.equal(
    await page.getByRole('status').evaluate((el) => getComputedStyle(el).color),
    'rgb(99, 109, 103)',
    'Unreachable evaluation is muted',
  )
  await page
    .getByRole('button', { name: 'Skip and start a conversation' })
    .click()
  assert.equal(await page.getByRole('status').textContent(), '○ Not connected')
  assert.equal(
    await page.getByRole('status').evaluate((el) => getComputedStyle(el).color),
    'rgb(99, 109, 103)',
    'Home follows the same unreachable evaluation',
  )
  await verifyMinimum(false)
  const icon = await page.locator('.studio-sidebar-toggle').evaluate((el) => ({
    box: [el.offsetWidth, el.offsetHeight],
    leaf: [el.querySelector('img').width, el.querySelector('img').height],
    loaded: el.querySelector('img').naturalWidth > 0,
  }))
  assert.deepEqual(
    icon,
    { box: [32, 32], leaf: [20, 20], loaded: true },
    'Exported sidebar asset must retain its box and leaf geometry',
  )
  for (const width of [1440, studioWindowSize.minWidth, 1000, 800, 390]) {
    await page.setViewportSize({ width, height: 960 })
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      `Home does not overflow at ${width}px`,
    )
  }
  assert.deepEqual(errors, [], 'Production renderer has no runtime errors')
  console.log(
    'PASS: bundled Book + Medium, inherited Circular, Backpack button, responsive onboarding/home including 1280px minimum, exported icon, runtime errors',
  )
} finally {
  await browser.close()
}
