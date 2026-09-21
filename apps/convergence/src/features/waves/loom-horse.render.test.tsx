import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { LoomHorseCard } from './loom-horse.presentational'
import { loomHorses, type LoomHorseSession } from './loom-horses.pure'
import { loomSheets } from './loom-sheets.pure'
import { boundCrewWith, residentSeat } from './wave-rows.fixture'

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
