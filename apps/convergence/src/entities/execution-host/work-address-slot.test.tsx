import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { WorkAddressSlot } from './work-address-slot.presentational'

describe('WorkAddressSlot entity control', () => {
  it('renders the reported place and requested branch (mutation: omit requested branch)', () => {
    render(
      <WorkAddressSlot
        view={{
          mode: 'settled',
          label: 'repo @ agent/result',
          requestedBranch: 'agent/requested',
        }}
        disabled={false}
        onChange={vi.fn()}
        onBranchChange={vi.fn()}
      />,
    )
    expect(screen.getByTestId('work-address-fact')).toHaveTextContent(
      'repo @ agent/result',
    )
    expect(
      screen.getByTestId('work-address-requested-branch'),
    ).toHaveTextContent('requested agent/requested')
  })
})
