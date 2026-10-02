import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRef } from 'react'
import { popupMotion } from '../../motion/popup.styles'
import { Menu, MenuContent, MenuItem, MenuTrigger } from '../menu/menu'
import { Tooltip, TooltipProvider } from './tooltip'
import { TOOLTIP_DELAY_MS } from './tooltip-host.pure'

/** A pointer comes to rest on the element, and the delay passes. */
const hover = async (element: Element) => {
  await act(async () => {
    fireEvent.pointerOver(element, { pointerType: 'mouse' })
  })
  await act(async () => {
    vi.advanceTimersByTime(TOOLTIP_DELAY_MS)
  })
}

/** An event, and whatever it sets going (the bubble's leaving is a promise). */
const fire = (event: () => void) =>
  act(async () => {
    event()
  })

describe('the tooltip host (MAR-3616)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows a label after the delay, as one role="tooltip" bubble', async () => {
    render(
      <TooltipProvider>
        <Tooltip label="Open settings">
          <button type="button">Settings</button>
        </Tooltip>
      </TooltipProvider>,
    )
    const trigger = screen.getByRole('button', { name: 'Settings' })
    await fire(() => fireEvent.pointerOver(trigger, { pointerType: 'mouse' }))
    expect(screen.queryByRole('tooltip')).toBeNull()
    await fire(() => vi.advanceTimersByTime(TOOLTIP_DELAY_MS))
    expect(screen.getByRole('tooltip')).toHaveTextContent('Open settings')
    // Never a native title (R2).
    expect(trigger).not.toHaveAttribute('title')
  })

  it('floats over the title strip without eating it: the bubble is no-drag', async () => {
    render(
      <TooltipProvider>
        <Tooltip label="Open settings">
          <button type="button">Settings</button>
        </Tooltip>
      </TooltipProvider>,
    )
    await hover(screen.getByRole('button', { name: 'Settings' }))
    const bubble = screen.getByRole('tooltip')
    // Portalled to the body, outside every drag region (MAR-3284).
    expect(bubble.parentElement).toBe(document.body)
    expect(bubble).toHaveClass('app-no-drag', 'pointer-events-none')
  })

  it('moves on the motion tokens, which reduced motion zeroes (DS2)', () => {
    // Every scale and travel reads a token that tokens.css sets to 1 or 0 px
    // under reduced motion, so the fade stays and nothing grows or travels.
    for (const token of popupMotion.split(' ')) {
      if (/scale-|translate-/.test(token))
        expect(token).toMatch(/\(--motion-(scale-from|shift)\)$/)
    }
    expect(popupMotion).toContain('data-starting-style:opacity-0')
    expect(popupMotion).toContain('duration-fast')
    expect(popupMotion).toContain('data-ending-style:duration-exit')
  })

  it('puts the tooltip away on Escape and on a press', async () => {
    render(
      <TooltipProvider>
        <Tooltip label="Open settings">
          <button type="button">Settings</button>
        </Tooltip>
      </TooltipProvider>,
    )
    const trigger = screen.getByRole('button', { name: 'Settings' })
    await hover(trigger)
    expect(screen.getByRole('tooltip')).toBeInTheDocument()
    await fire(() => fireEvent.keyDown(document.body, { key: 'Escape' }))
    expect(screen.queryByRole('tooltip')).toBeNull()

    await fire(() => fireEvent.pointerOut(trigger, { pointerType: 'mouse' }))
    await hover(trigger)
    expect(screen.getByRole('tooltip')).toBeInTheDocument()
    await fire(() => fireEvent.pointerDown(trigger, { pointerType: 'mouse' }))
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('stays away from a trigger whose menu is open', async () => {
    render(
      <TooltipProvider>
        <Tooltip label="More actions">
          <button type="button" aria-haspopup="menu" aria-expanded="true">
            More
          </button>
        </Tooltip>
      </TooltipProvider>,
    )
    await hover(screen.getByRole('button', { name: 'More' }))
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('names a disclosure that is open, which opens no popup (NAV-13)', async () => {
    render(
      <TooltipProvider>
        <Tooltip label="feature/tooltips">
          <button type="button" aria-expanded="true">
            Branch
          </button>
        </Tooltip>
      </TooltipProvider>,
    )
    await hover(screen.getByRole('button', { name: 'Branch' }))
    expect(screen.getByRole('tooltip')).toHaveTextContent('feature/tooltips')
  })

  it('shows a second, muted line for a detail', async () => {
    render(
      <TooltipProvider>
        <Tooltip label="feature/tooltips" detail="Branches stay open">
          <button type="button">Branch</button>
        </Tooltip>
      </TooltipProvider>,
    )
    await hover(screen.getByRole('button', { name: 'Branch' }))
    const bubble = screen.getByRole('tooltip')
    expect(bubble).toHaveTextContent('feature/tooltipsBranches stay open')
  })

  it('gives an empty label no tooltip at all', async () => {
    render(
      <TooltipProvider>
        <Tooltip label={undefined}>
          <button type="button">Plain</button>
        </Tooltip>
      </TooltipProvider>,
    )
    const trigger = screen.getByRole('button', { name: 'Plain' })
    expect(trigger).not.toHaveAttribute('data-tooltip')
    await hover(trigger)
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('leaves the work to an outer provider: one bubble for the page', async () => {
    render(
      <TooltipProvider>
        <TooltipProvider>
          <Tooltip label="Inner">
            <button type="button">Inner</button>
          </Tooltip>
        </TooltipProvider>
      </TooltipProvider>,
    )
    await hover(screen.getByRole('button', { name: 'Inner' }))
    expect(
      document.querySelectorAll('[data-slot="tooltip-content"]'),
    ).toHaveLength(1)
    expect(screen.getByRole('tooltip')).toHaveTextContent('Inner')
  })

  it("passes a trigger's handlers and ref through to its element, keeping the element's own", async () => {
    vi.useRealTimers()
    const ref = createRef<HTMLButtonElement>()
    const ownClick = vi.fn()
    render(
      <Menu>
        <MenuTrigger
          render={
            <Tooltip label="Session details">
              <button ref={ref} type="button" onClick={ownClick}>
                Details
              </button>
            </Tooltip>
          }
        />
        <MenuContent>
          <MenuItem>Harness history</MenuItem>
        </MenuContent>
      </Menu>,
    )
    const trigger = screen.getByRole('button', { name: 'Details' })
    expect(ref.current).toBe(trigger)
    expect(trigger).toHaveAttribute('data-tooltip', 'Session details')
    fireEvent.click(trigger)
    expect(ownClick).toHaveBeenCalledOnce()
    expect(await screen.findByRole('menu')).toBeInTheDocument()
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
  })
})
