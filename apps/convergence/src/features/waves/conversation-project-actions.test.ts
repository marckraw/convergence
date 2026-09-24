import { describe, expect, it } from 'vitest'
import {
  buildConversationActions,
  buildConversationProjectActions,
} from '@/entities/conversation-actions'
import { loomCrewForConversation } from '@/entities/loom-navigation'
import {
  LOOM_NO_ACTIVE_TICKET,
  type WorkLedgerEntry,
} from '@/entities/work-ledger'
import { boundCrewWith, ledgerEntry, residentSeat } from './wave-rows.fixture'
import { loomHorses } from './loom-horses.pure'
import { loomSheets } from './loom-sheets.pure'

const crew = boundCrewWith('crew-1', 'Loom', [residentSeat('opus')])
const sent = (seat = 'opus', sentAt = '2026-09-24T10:00:00Z') => ({
  seat,
  sentAt,
  sessionId: 'session-opus',
  delivery: 'turn' as const,
  error: null,
})
const entry = (overrides: Partial<WorkLedgerEntry> = {}) =>
  ledgerEntry({ issueIdentifier: 'MAR-1', ...overrides })
const context = (entries: WorkLedgerEntry[]) => ({
  sessionId: 'session-opus',
  crews: [crew],
  currentCrewId: null,
  snapshots: {
    'crew-1': {
      crewId: 'crew-1',
      entries,
      trackerHealth: null,
      dispatchPlan: null,
    },
  },
})

describe('MAR-3394 R1: menu and Loom card share the seat ticket', () => {
  it.each([
    ['working', [entry()], 'MAR-1'],
    ['returned', [entry({ state: 'returned' })], null],
    [
      'dispatched to this seat',
      [entry({ state: 'assigned', dispatch: sent() })],
      'MAR-1',
    ],
    [
      'dispatched elsewhere',
      [entry({ state: 'assigned', dispatch: sent('other') })],
      null,
    ],
    ['none', [], null],
    [
      'equal timestamps preserve Now group order',
      [entry({ issueIdentifier: 'BLOCKED', blocked: true }), entry()],
      'MAR-1',
    ],
    ['blocked working', [entry({ blocked: true })], 'MAR-1'],
    [
      'blocked assigned stays off the card',
      [entry({ state: 'assigned', blocked: true, dispatch: sent() })],
      null,
    ],
    [
      'unseated assigned stays in Plan',
      [entry({ state: 'assigned', seat: null, dispatch: sent() })],
      null,
    ],
    ['same name different conversation', [entry({ sessionId: 'other' })], null],
    [
      'newest working wins over dispatch',
      [
        entry({ issueIdentifier: 'OLD', seenAt: '2026-09-16' }),
        entry(),
        entry({ issueIdentifier: 'SENT', state: 'assigned', dispatch: sent() }),
      ],
      'MAR-1',
    ],
    [
      'newest dispatch wins',
      [
        entry({
          issueIdentifier: 'OLD',
          state: 'assigned',
          dispatch: sent('opus', '2026-09-23'),
        }),
        entry({ state: 'assigned', dispatch: sent() }),
      ],
      'MAR-1',
    ],
  ] as const)('%s', (_name, entries, expected) => {
    const actions = buildConversationProjectActions(context([...entries]))
    const action = actions.find((action) => action.id === 'project:open-issue')!
    const horse = loomHorses({
      crews: [crew],
      sessionsById: new Map(),
      sheets: loomSheets(entries, 0),
      hostLabelOf: () => null,
    })[0]!
    const cardTicket = horse.held?.entry ?? horse.dispatched?.entry ?? null
    expect(cardTicket?.issueIdentifier ?? null).toBe(expected)
    expect(
      action.navigation?.target.kind === 'issue'
        ? action.navigation.target.entry
        : null,
    ).toBe(cardTicket)
    expect(action.offered).toBe(expected !== null)
    expect(action.reason).toBe(
      expected === null ? LOOM_NO_ACTIVE_TICKET : undefined,
    )
  })
})

describe('MAR-3394 R2: listed here, offered now', () => {
  it.each([
    ['non-seat', [], [], []],
    ['unbound', [{ ...crew, trackerBinding: null }], [], []],
    [
      'mastermind',
      [
        boundCrewWith('crew-1', 'Loom', [
          residentSeat('opus', { role: 'mastermind' }),
        ]),
      ],
      [],
      ['project:show-in-loom'],
    ],
    [
      'reviewer',
      [
        boundCrewWith('crew-1', 'Loom', [
          residentSeat('opus', { role: 'reviewer' }),
        ]),
      ],
      [],
      ['project:show-in-loom'],
    ],
    [
      'horse with ticket',
      [crew],
      [entry()],
      ['project:open-issue', 'project:show-in-loom'],
    ],
    [
      'horse without ticket',
      [crew],
      [],
      ['project:open-issue', 'project:show-in-loom'],
    ],
  ] as const)('%s', (_name, crews, entries, ids) => {
    const project = { ...context([...entries]), crews }
    const actions = buildConversationActions({
      routines: [],
      skillCatalog: null,
      providerId: 'codex',
      project,
    })
    expect(actions.map((action) => action.id)).toEqual(ids)
    expect(actions.every((action) => action.kind === 'project')).toBe(true)
    const reveal = actions.find(
      (action) => action.id === 'project:show-in-loom',
    )
    if (reveal) expect(reveal.offered).toBe(true)
  })

  it('uses Follow’s current-crew tie break for two bound crews', () => {
    const crews = [crew, { ...crew, id: 'crew-2' }]
    for (const currentCrewId of [null, 'crew-2']) {
      const actions = buildConversationProjectActions({
        ...context([]),
        crews,
        currentCrewId,
      })
      const chosen = loomCrewForConversation({
        session: { id: 'session-opus', projectId: null },
        crews: crews.map((crew) => ({ ...crew, bound: true })),
        sessions: [],
        current: currentCrewId,
      })
      expect(actions.at(-1)?.navigation?.crewId).toBe(chosen)
    }
  })
})
