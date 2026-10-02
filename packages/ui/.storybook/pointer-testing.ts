/*
 * The real pointer, in story tests (MAR-3618). A play function's userEvent
 * is Testing Library's: its events are synthetic and never move the browser's
 * pointer, so they never set CSS :hover. The pointer itself is Playwright's,
 * and where it rests differs by platform: on Linux (CI) Chromium sometimes
 * applies :hover to whatever sits under it, while headless Chromium on macOS
 * never does. A story could then pass on a Mac and fail axe in CI on a hover
 * colour nobody asked to check (#933, the Needs-you card).
 *
 * So the shared afterEach (preview.tsx) moves the pointer off the page before
 * the accessibility check, and every platform checks the page at rest. A
 * story that means to check a hover does it in its own play function, with an
 * assertion. Moving the pointer is a Vitest browser command, which only
 * exists under Vitest: the test setup (vitest.setup.ts) hands it over here,
 * and in Storybook's own UI, where the pointer is a person's, nothing moves.
 */

type PointerMover = () => Promise<void>

let mover: PointerMover | undefined

/** Called once by the Vitest setup with the command that moves the pointer. */
export const setPointerMover = (next: PointerMover) => {
  mover = next
}

/** Moves the real pointer off the page; outside Vitest it does nothing. */
export const movePointerAway = async () => {
  await mover?.()
}
