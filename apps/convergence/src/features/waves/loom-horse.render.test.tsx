import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { LoomHorseCard } from './loom-horse.presentational'
import {
  loomDispatchClock,
  loomHorses,
  type LoomHorseSession,
} from './loom-horses.pure'
import { loomSheets } from './loom-sheets.pure'
import { boundCrewWith, ledgerEntry, residentSeat } from './wave-rows.fixture'

const NOW = Date.parse('2026-09-21T08:00:00.000Z')

/**
 * The card of one seat, built by the MODEL the app builds it with.
 *
 * Never a hand-written `LoomHorse` literal: the rule under test is a sentence
 * about what `loomHorses` derives from a session, and a literal would let the
 * test agree with itself while the app disagreed.
 */
const cardFor = (session: LoomHorseSession) =>
  render(
    <LoomHorseCard
      horse={
        loomHorses({
          crews: [boundCrewWith('crew-1', 'Loom', [residentSeat('opus-mac')])],
          sessionsById: new Map([['session-opus-mac', session]]),
          sheets: loomSheets([], NOW),
          hostLabelOf: () => 'This Mac',
        })[0]!
      }
      onOpenSeat={vi.fn()}
      onShowNext={vi.fn()}
    />,
  )

afterEach(cleanup)

describe('MAR-3289 R3: the card of a compacting seat', () => {
  it('says Compacting context…, spins, and is not offered next work', () => {
    const { container } = cardFor({
      status: 'completed',
      activity: 'compacting',
    })
    // Mutation: label a compacting horse from `RUNTIME_WORDS` alone -> the
    // card reads 'Working' -> red.
    expect(screen.getByText('Compacting context…')).toBeTruthy()
    // Busy is busy: the same spin every working seat wears.
    expect(container.querySelector('.animate-spin')).toBeTruthy()
    // The idle-only control. Mutation: keep the compacting seat on `idle` ->
    // the card offers a person its next work while it cannot take any -> red.
    expect(screen.queryByText('View next work →')).toBeNull()
  })

  it('an idle seat still reads Idle, sits still, and is offered next work', () => {
    const { container } = cardFor({ status: 'completed' })
    expect(screen.getByText('Idle')).toBeTruthy()
    expect(container.querySelector('.animate-spin')).toBeNull()
    expect(screen.getByText('View next work →')).toBeTruthy()
  })
})

describe('MAR-3204: the window on the card, and the ticket line as a door', () => {
  const SENT_AT = '2026-09-22T21:40:00.000Z'
  const crew = boundCrewWith('crew-1', 'Loom', [residentSeat('opus-mac')])
  const seatRow = (overrides: Parameters<typeof ledgerEntry>[0]) =>
    ledgerEntry({
      seat: 'opus-mac',
      sessionId: 'session-opus-mac',
      ...overrides,
    })
  const card = (
    rows: Parameters<typeof loomSheets>[0],
    status: LoomHorseSession['status'] = 'running',
  ) => {
    const onOpenSeat = vi.fn()
    const onShowDetail = vi.fn()
    const view = render(
      <LoomHorseCard
        horse={
          loomHorses({
            crews: [crew],
            sessionsById: new Map([['session-opus-mac', { status }]]),
            sheets: loomSheets(rows, NOW),
            hostLabelOf: () => 'This Mac',
          })[0]!
        }
        onOpenSeat={onOpenSeat}
        onShowDetail={onShowDetail}
      />,
    )
    return { ...view, onOpenSeat, onShowDetail }
  }
  const sent = {
    sentAt: SENT_AT,
    seat: 'opus-mac',
    sessionId: 'session-opus-mac',
    delivery: 'turn' as const,
    error: null,
  }

  it("R3: the three lines -- window, held, none -- and the runtime word stays the session's", () => {
    card([
      seatRow({ issueIdentifier: 'MAR-7', state: 'assigned', dispatch: sent }),
    ])
    expect(
      screen.getByText(
        `MAR-7 · dispatched ${loomDispatchClock(SENT_AT)}, not yet In Progress`,
      ),
    ).toBeTruthy()
    expect(screen.getByText('Working')).toBeTruthy()
    expect(screen.queryByText('No active ticket')).toBeNull()
    cleanup()

    card([seatRow({ issueIdentifier: 'MAR-5', state: 'working' })])
    expect(screen.getByText('MAR-5 · Work MAR-5')).toBeTruthy()
    cleanup()

    card([seatRow({ issueIdentifier: 'MAR-7', state: 'assigned' })])
    expect(screen.getByText('No active ticket')).toBeTruthy()
    // No issue, no door: the line is text, not a button.
    expect(screen.getAllByRole('button')).toHaveLength(1)
  })

  it('R4: the ticket line opens the detail and NOT the conversation; the card the reverse', () => {
    const { onOpenSeat, onShowDetail, container } = card([
      seatRow({ issueIdentifier: 'MAR-5', state: 'working' }),
    ])
    const line = container.querySelector(
      '[data-loom-horse-ticket]',
    ) as HTMLElement
    // Mutation: let the click reach the card (the open handler on the
    // card's box instead of its own button) -> both called -> red.
    fireEvent.click(line)
    expect(onShowDetail).toHaveBeenCalledTimes(1)
    expect(onOpenSeat).toHaveBeenCalledTimes(0)

    fireEvent.click(screen.getByRole('button', { name: /^opus-mac\b/ }))
    expect(onOpenSeat).toHaveBeenCalledTimes(1)
    expect(onOpenSeat).toHaveBeenCalledWith('session-opus-mac')
    expect(onShowDetail).toHaveBeenCalledTimes(1)
  })

  it("R4: the line is a real, focusable button -- Enter is the browser's own click", () => {
    // jsdom does not synthesize a native button's Enter activation, so the
    // claim is pinned on what makes it true in a browser: the line IS a
    // <button type="button"> that takes focus. Mutation: render the line as
    // a span with onClick -> not a button, never focused -> red.
    const { container } = card([
      seatRow({ issueIdentifier: 'MAR-7', state: 'assigned', dispatch: sent }),
    ])
    const line = container.querySelector(
      '[data-loom-horse-ticket]',
    ) as HTMLElement
    expect(line.tagName).toBe('BUTTON')
    expect(line.getAttribute('type')).toBe('button')
    line.focus()
    expect(document.activeElement).toBe(line)
    // The sent issue is the one this door is for (the Details button too).
    expect(screen.getByRole('button', { name: 'Details' })).toBeTruthy()
  })
})
