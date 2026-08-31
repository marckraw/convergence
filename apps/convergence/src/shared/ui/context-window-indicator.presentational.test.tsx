import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { TooltipProvider } from './tooltip'
import { ContextWindowIndicator } from './context-window-indicator.presentational'

describe('ContextWindowIndicator', () => {
  it('renders remaining context when available', () => {
    render(
      <TooltipProvider>
        <ContextWindowIndicator
          contextWindow={{
            availability: 'available',
            source: 'provider',
            usedTokens: 40000,
            windowTokens: 200000,
            usedPercentage: 20,
            remainingPercentage: 80,
          }}
        />
      </TooltipProvider>,
    )

    expect(screen.getByText('80% left')).toBeInTheDocument()
  })

  it('renders unavailable state when provider cannot report context', () => {
    render(
      <TooltipProvider>
        <ContextWindowIndicator
          contextWindow={{
            availability: 'unavailable',
            source: 'provider',
            reason: 'Unavailable in headless mode.',
          }}
        />
      </TooltipProvider>,
    )

    expect(screen.getByText('Ctx n/a')).toBeInTheDocument()
  })

  it('renders remaining context when the value is estimated', () => {
    render(
      <TooltipProvider>
        <ContextWindowIndicator
          contextWindow={{
            availability: 'available',
            source: 'estimated',
            usedTokens: 64000,
            windowTokens: 200000,
            usedPercentage: 32,
            remainingPercentage: 68,
          }}
        />
      </TooltipProvider>,
    )

    expect(screen.getByText('68% left')).toBeInTheDocument()
  })
})
