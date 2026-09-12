import { render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import type { SessionSummary } from '@/entities/session'
import { TooltipProvider } from '@/shared/ui/tooltip'
import { NeedsYouSection } from './needs-you-section.presentational'

it('renders the session PR fact in Needs Review (mutation: remove the chip)', () => {
  const session = {
    id: 's',
    name: 'Horse',
    attention: 'finished',
    pullRequest: {
      number: 42,
      state: 'open',
      url: 'https://github.com/acme/app/pull/42',
      headBranch: 'agent/horse',
      checkedAt: '2026-09-12',
      source: 'gh',
    },
  } as SessionSummary
  render(
    <TooltipProvider>
      <NeedsYouSection
        title="Needs Review"
        sessions={[
          { session, projectName: 'Project', summary: 'Finished', priority: 0 },
        ]}
        activeSessionId={null}
        onSelect={vi.fn()}
        onDismiss={vi.fn()}
        onArchive={vi.fn()}
      />
    </TooltipProvider>,
  )
  expect(screen.getByText('#42 · open')).toBeInTheDocument()
})
