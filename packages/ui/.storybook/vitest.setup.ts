import { commands } from 'vitest/browser'
import { setPointerMover } from './pointer-testing'

declare module 'vitest/browser' {
  interface BrowserCommands {
    /** Moves Playwright's pointer off the page (vitest.config.ts). */
    movePointerAway: () => Promise<void>
  }
}

// The story tests' setup (MAR-3618): preview.tsx can't import Vitest, since
// Storybook's own UI loads it too, so the pointer command reaches its
// afterEach through pointer-testing.ts.
setPointerMover(() => commands.movePointerAway())
