import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { SessionStateBadge } from './session-state-badge.presentational'

describe('SessionStateBadge (MAR-3288 lap 2 B)', () => {
  it('draws the busy glyph, not the finished check, for a compacting session — mutation drop the compaction from the wrapper turns red', () => {
    const { container } = render(
      <SessionStateBadge
        session={{
          attention: 'finished',
          status: 'completed',
          activity: 'compacting',
        }}
      />,
    )
    expect(screen.getByLabelText('Compacting context…')).toBeInTheDocument()
    expect(container.querySelector('.text-emerald-500')).toBeNull()
  })

  it('draws the finished check once the compaction is over', () => {
    const { container } = render(
      <SessionStateBadge
        session={{ attention: 'finished', status: 'completed', activity: null }}
      />,
    )
    expect(screen.queryByLabelText('Compacting context…')).toBeNull()
    expect(container.querySelector('.text-emerald-500')).not.toBeNull()
  })

  it('draws a quiet glyph for a row with no record', () => {
    const { container } = render(<SessionStateBadge session={undefined} />)
    expect(screen.queryByLabelText('Compacting context…')).toBeNull()
    expect(container.querySelector('svg')).not.toBeNull()
  })
})
