import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ContextWindowDot } from './context-window-dot.container'

describe('ContextWindowDot', () => {
  it('renders a textless context control and shows details on click', async () => {
    render(
      <ContextWindowDot
        contextWindow={{
          availability: 'available',
          source: 'provider',
          usedTokens: 40000,
          windowTokens: 200000,
          usedPercentage: 20,
          remainingPercentage: 80,
        }}
      />,
    )

    expect(screen.queryByText('80% left')).not.toBeInTheDocument()

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Context window 80% remaining',
      }),
    )

    expect(await screen.findByText('Remaining')).toBeInTheDocument()
    expect(screen.getByText('80%')).toBeInTheDocument()
    expect(screen.getByText('Provider-reported')).toBeInTheDocument()
  })

  it('shows unavailable details when context usage is missing', async () => {
    render(<ContextWindowDot contextWindow={null} />)

    fireEvent.click(
      screen.getByRole('button', { name: 'Context window unavailable' }),
    )

    expect(
      await screen.findByText(
        'Context usage has not been reported for this session yet.',
      ),
    ).toBeInTheDocument()
  })
})
