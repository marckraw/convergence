import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react'
import { useAgentMeterStore } from '@/entities/agent-meter'
import { useSessionStore, type SessionSummary } from '@/entities/session'
import {
  loomHorses,
  loomMasterminds,
  type LoomHorseSession,
} from './loom-horses.pure'
import { LoomSheetView } from './loom-sheet.presentational'
import { loomSheets } from './loom-sheets.pure'
import { boundCrewWith, ledgerEntry, residentSeat } from './wave-rows.fixture'

const crew = boundCrewWith('crew-1', 'Convergence', [
  residentSeat('fable', { role: 'mastermind' }),
  residentSeat('astra'),
  residentSeat('opus'),
])
const other = boundCrewWith('crew-2', 'Segmemo', [
  residentSeat('fable', { role: 'mastermind', sessionId: 'other-fable' }),
])
function show({
  crews = [crew],
  session = { status: 'running' } as LoomHorseSession | null,
  rows = [] as ReturnType<typeof ledgerEntry>[],
  wide = false,
} = {}) {
  const sheets = loomSheets(rows, 0)
  const input = {
    crews,
    sessionsById: new Map(session ? [['session-fable', session]] : []),
    sheets,
    hostLabelOf: (host: string | null) => host ?? 'This Mac',
  }
  const onOpenSeat = vi.fn()
  render(
    <LoomSheetView
      sheet="now"
      sheets={sheets}
      now={0}
      wide={wide}
      horses={loomHorses(input)}
      masterminds={loomMasterminds(input)}
      qaExpanded={false}
      onToggleQa={vi.fn()}
      onOpenSeat={onOpenSeat}
      onShowNext={vi.fn()}
      onShowDetail={vi.fn()}
      inertReason={() => null}
      onOpen={vi.fn()}
    />,
  )
  return onOpenSeat
}
afterEach(() => {
  cleanup()
  useAgentMeterStore.setState({
    snapshot: { agents: null, convergence: null, rows: [] },
  })
  useSessionStore.setState({ globalSessions: [] })
})

describe('MAR-3457 mastermind in Now', () => {
  it.each([false, true])(
    'A: a mastermind with no Now rows keeps the empty-Now note (wide=%s)',
    (wide) => {
      show({ wide })
      const note = screen.getByText('Nothing in Now right now.')
      for (const name of ['Mastermind', 'Horses']) {
        expect(
          screen.getByRole('region', { name }).compareDocumentPosition(note) &
            Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy()
      }
    },
  )

  it('B: the Open button accessible name includes the host', () => {
    show()
    const card = within(screen.getByRole('region', { name: 'Mastermind' }))
    expect(
      card.getByRole('button', { name: /fable.*Open →/ }),
    ).toHaveAccessibleName(/This Mac/)
  })

  it.each([false, true])(
    'R1/R4: mastermind precedes Horses; two horses stay two (wide=%s)',
    (wide) => {
      show({ wide })
      const mastermind = screen.getByRole('region', { name: 'Mastermind' })
      const horses = screen.getByRole('region', { name: 'Horses' })
      expect(
        mastermind.compareDocumentPosition(horses) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy()
      expect(within(mastermind).getByText('fable')).toBeTruthy()
      expect(within(horses).queryByText('fable')).toBeNull()
      expect(within(horses).getByRole('heading')).toHaveTextContent(
        /^2 horses ·/,
      )
      expect(document.querySelectorAll('[data-loom-horse]')).toHaveLength(2)
    },
  )

  it('R2: Working, host, own CPU/memory and Open to the mastermind conversation', () => {
    useSessionStore.setState({
      globalSessions: [
        { id: 'session-fable', executionHost: 'local' } as SessionSummary,
      ],
    })
    useAgentMeterStore.setState({
      snapshot: {
        agents: null,
        convergence: null,
        rows: [
          {
            sessionId: 'session-opus',
            account: null,
            usage: { cpu: 99, memoryMb: 990 },
          },
          {
            sessionId: 'session-fable',
            account: null,
            usage: { cpu: 12, memoryMb: 450 },
          },
        ],
      },
    })
    const open = show()
    const card = within(screen.getByRole('region', { name: 'Mastermind' }))
    expect(card.getByText('Working')).toBeTruthy()
    expect(card.getByText('This Mac')).toBeTruthy()
    expect(card.getByTestId('session-agent-meter')).toHaveTextContent(
      '12% · 450 MB',
    )
    fireEvent.click(card.getByRole('button', { name: /fable.*Open →/ }))
    expect(open).toHaveBeenCalledExactlyOnceWith('session-fable')
  })

  it('R2: missing conversation reads Not seen and has no Open', () => {
    show({ session: null })
    const card = within(screen.getByRole('region', { name: 'Mastermind' }))
    expect(card.getByText('Not seen')).toBeTruthy()
    expect(card.queryByText('Open →')).toBeNull()
    expect(card.queryByRole('button')).toBeNull()
  })

  it.each([
    [{ status: 'idle' }, 'Idle'],
    [{ status: 'failed' }, 'Failed'],
    [{ status: 'completed', activity: 'compacting' }, 'Compacting context…'],
    [{ status: 'running', attention: 'host-unreachable' }, 'Not seen'],
  ] as const)('R2: shared runtime renders %s as %s', (session, word) => {
    show({ session })
    expect(
      within(screen.getByRole('region', { name: 'Mastermind' })).getByText(
        word,
      ),
    ).toBeTruthy()
  })

  it.each([
    [0, 'Nothing waits for its verdict'],
    [1, '1 return waits for its verdict'],
    [2, '2 returns wait for its verdict'],
  ])('R3: %s returned rows use the verdict line', (count, line) => {
    show({
      session: { status: 'idle' },
      rows: Array.from({ length: count as number }, (_, i) =>
        ledgerEntry({ issueIdentifier: `MAR-${i}`, state: 'returned' }),
      ),
    })
    const card = within(screen.getByRole('region', { name: 'Mastermind' }))
    expect(card.getByText(line)).toBeTruthy()
    expect(card.queryByText('No active ticket')).toBeNull()
    expect(card.queryByText('View next work →')).toBeNull()
    expect(card.queryByText('Details')).toBeNull()
  })

  it('R3/R5: two crews name themselves and count only their own returns', () => {
    show({
      crews: [crew, other],
      rows: [
        ledgerEntry({ issueIdentifier: 'MAR-1', state: 'returned' }),
        ledgerEntry({ issueIdentifier: 'MAR-2', state: 'returned' }),
        ledgerEntry({
          issueIdentifier: 'MAR-3',
          state: 'returned',
          crewId: 'crew-2',
        }),
        ledgerEntry({ issueIdentifier: 'MAR-4', state: 'reviewed' }),
      ],
    })
    const cards = [
      ...document.querySelectorAll<HTMLElement>('[data-loom-mastermind]'),
    ]
    expect(cards).toHaveLength(2)
    expect(within(cards[0]).getByText('fable · Convergence')).toBeTruthy()
    expect(
      within(cards[0]).getByText('2 returns wait for its verdict'),
    ).toBeTruthy()
    expect(within(cards[1]).getByText('fable · Segmemo')).toBeTruthy()
    expect(
      within(cards[1]).getByText('1 return waits for its verdict'),
    ).toBeTruthy()
  })

  it('R5: no mastermind seat means no section', () => {
    show({ crews: [boundCrewWith('crew-1', 'Loom', [residentSeat('astra')])] })
    expect(screen.queryByRole('region', { name: 'Mastermind' })).toBeNull()
  })
})
