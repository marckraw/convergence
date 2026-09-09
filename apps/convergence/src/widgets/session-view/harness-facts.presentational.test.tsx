import { fireEvent, render, screen, within } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import type { SessionHarnessFacts } from '@/shared/types/harness-facts.types'
import { HarnessFactsView } from './harness-facts.presentational'
it('shows the same hook count and bounded output in the popover — mutation drop hook rows turns red', () => {
  const facts: SessionHarnessFacts = {
    turns: [],
    currentTurn: {
      turnId: 't',
      hooks: [
        {
          id: 'h',
          name: 'PreToolUse:Bash',
          event: 'PreToolUse',
          status: 'ok',
          startedAt: 'now',
          durationMs: 17,
          output: { truncated: true, bytes: 9000, preview: 'bounded preview' },
        },
      ],
      retries: null,
      denials: null,
    },
    compactions: [],
    init: null,
    rateLimit: null,
  }
  render(
    <HarnessFactsView
      facts={facts}
      error={null}
      loading={false}
      onRetry={vi.fn()}
    />,
  )
  fireEvent.pointerDown(screen.getByTestId('harness-pill'), {
    button: 0,
    ctrlKey: false,
    pointerType: 'mouse',
  })
  const hooks = screen.queryByRole('region', { name: 'Hooks' })
  expect({
    pill: screen.getByTestId('harness-pill').textContent,
    name:
      hooks &&
      within(hooks).queryByText('PreToolUse:Bash · PreToolUse')?.textContent,
    output: screen.queryByText('Output · truncated')?.textContent,
    preview: screen.queryByText('bounded preview')?.textContent,
    duration: screen.queryByText('ok · 17 ms')?.textContent,
  }).toEqual({
    pill: 'Harness · hooks 1',
    name: 'PreToolUse:Bash · PreToolUse',
    output: 'Output · truncated',
    preview: 'bounded preview',
    duration: 'ok · 17 ms',
  })
})
