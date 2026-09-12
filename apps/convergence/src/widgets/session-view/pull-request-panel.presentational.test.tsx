import { render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { PullRequestPanel } from './pull-request-panel.presentational'

it('says no branch recorded, including project-root sessions (mutation: workspace-only sentence)', () => {
  render(
    <PullRequestPanel
      pullRequest={null}
      branchName={null}
      loading={false}
      error={null}
      onRefresh={vi.fn()}
      onClose={vi.fn()}
    />,
  )
  expect(
    screen.getByText('no branch recorded for this session'),
  ).toBeInTheDocument()
})
