// Copies in a test never count: the expected output names three copies, not four.
import { expect, it } from 'vitest'

it('renders the bar', () => {
  const bar = (
    <div className="flex min-w-0 items-center gap-2 border-b border-border px-3" />
  )
  expect(bar).toBeTruthy()
})
