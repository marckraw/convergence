import { describe, expect, it } from 'vitest'
import type { SessionStatus } from '@/entities/session'
import {
  loomHorseRuntimeLabel,
  loomHorses,
  loomHorsesLine,
  LOOM_NO_HORSES_LINE,
  LOOM_RECIPE_LINE,
  type LoomHorseSession,
} from './loom-horses.pure'
import { loomNowRows, loomSheets } from './loom-sheets.pure'
import {
  boundCrewWith,
  crewMember,
  ledgerEntry,
  residentSeat,
} from './wave-rows.fixture'

const NOW = Date.parse('2026-09-19T08:00:00.000Z')
const hostLabelOf = (hostId: string | null) => hostId ?? 'This Mac'
const noSheets = loomSheets([], NOW)

const session = (
  status: SessionStatus,
  executionHost?: string | null,
): LoomHorseSession => ({ status, executionHost })

describe('MAR-3191 R1: the horses come from the crew’s record', () => {
  it('every horse seat, in crew-member order — residents and recipes', () => {
    const crew = boundCrewWith('crew-1', 'Loom', [
      crewMember({ batonName: 'fable', role: 'mastermind' }),
      residentSeat('opus-mac'),
      crewMember({ batonName: 'grok-mac', role: 'horse' }),
      residentSeat('astra-mac'),
      residentSeat('reviewer-1', { role: 'reviewer' }),
      residentSeat('designer-1', { role: 'designer' }),
    ])
    const horses = loomHorses({
      crews: [crew],
      sessionsById: new Map([
        ['session-opus-mac', session('running')],
        ['session-astra-mac', session('idle')],
      ]),
      sheets: noSheets,
      hostLabelOf,
    })

    // Mutation: keep only members with a `sessionId` -> grok-mac, the recipe
    // seat, vanishes — and a recipe is exactly the seat a person cannot see
    // anywhere else.
    expect(horses.map((horse) => horse.seat)).toEqual([
      'opus-mac',
      'grok-mac',
      'astra-mac',
    ])
    // Mutation: drop the `role !== 'horse'` filter -> the mastermind and the
    // reviewer appear, red.
    expect(horses.map((horse) => horse.kind)).toEqual([
      'resident',
      'dynamic',
      'resident',
    ])
    expect(loomHorseRuntimeLabel(horses[1]!)).toBe(LOOM_RECIPE_LINE)
  })

  it('an unbound crew has no horses on this sheet', () => {
    const crew = boundCrewWith('crew-1', 'Loom', [residentSeat('opus-mac')])
    expect(
      loomHorses({
        crews: [{ ...crew, trackerBinding: null }],
        sessionsById: new Map(),
        sheets: noSheets,
        hostLabelOf,
      }),
    ).toEqual([])
  })

  it('two crews may name a seat the same, and the keys stay apart', () => {
    const horses = loomHorses({
      crews: [
        boundCrewWith('crew-1', 'Loom', [residentSeat('opus-mac')]),
        boundCrewWith('crew-2', 'Night', [residentSeat('opus-mac')]),
      ],
      sessionsById: new Map(),
      sheets: noSheets,
      hostLabelOf,
    })
    expect(new Set(horses.map((horse) => horse.key)).size).toBe(2)
  })
})

describe('MAR-3191 R2: the runtime word never guesses', () => {
  const horseOf = (
    sessions: Map<string, LoomHorseSession>,
    rows = [] as ReturnType<typeof ledgerEntry>[],
  ) =>
    loomHorses({
      crews: [boundCrewWith('crew-1', 'Loom', [residentSeat('opus-mac')])],
      sessionsById: sessions,
      sheets: loomSheets(rows, NOW),
      hostLabelOf,
    })[0]!

  it.each([
    ['running', 'working', 'Working'],
    ['failed', 'failed', 'Failed'],
    ['idle', 'idle', 'Idle'],
    ['answered', 'idle', 'Idle'],
    ['completed', 'idle', 'Idle'],
  ] as const)('%s -> %s', (status, runtime, word) => {
    const horse = horseOf(new Map([['session-opus-mac', session(status)]]))
    expect(horse.runtime).toBe(runtime)
    expect(loomHorseRuntimeLabel(horse)).toBe(word)
  })

  it('a seat whose conversation is not loaded cannot be opened', () => {
    // Mutation: `openable: member.sessionId !== null` -> the card offers a
    // button that does nothing when pressed, red.
    expect(horseOf(new Map()).openable).toBe(false)
    expect(
      horseOf(new Map([['session-opus-mac', session('idle')]])).openable,
    ).toBe(true)
  })

  it('a session the store does not hold is Not seen, never Idle', () => {
    // Not loaded, archived, or its conversation deleted — three roads to one
    // ignorance. Mutation: absent -> `idle` -> red, and the panel invents a
    // calm it has not observed.
    const horse = horseOf(new Map())
    expect(horse.runtime).toBe('not-seen')
    expect(loomHorseRuntimeLabel(horse)).toBe('Not seen')
  })

  it('an unreachable host outranks the session’s own word', () => {
    const rows = [
      ledgerEntry({
        issueIdentifier: 'EX-1',
        state: 'working',
        seat: 'opus-mac',
        sessionId: 'session-opus-mac',
        hostLiveness: {
          executionHost: 'lm',
          lastEventAt: '2026-09-19T07:56:00.000Z',
          hostReachable: false,
        },
      }),
    ]
    // The store's last word is `idle`; nothing has been heard from the host
    // since. The run may be riding hard on the other side of a dead wire.
    // Mutation: unreachable -> `idle` -> red.
    const horse = horseOf(
      new Map([['session-opus-mac', session('idle')]]),
      rows,
    )
    expect(horse.runtime).toBe('not-seen')
    expect(horse.hostMarker).toBe('host unreachable since 4m')
  })
})

describe('MAR-3191: the host comes from where the seat actually works', () => {
  it('a resident’s conversation, a recipe’s policy, the id when unnamed', () => {
    const horses = loomHorses({
      crews: [
        boundCrewWith('crew-1', 'Loom', [
          residentSeat('opus-mac'),
          residentSeat('remote-mac', { hostPolicy: 'endpoint-2' }),
          crewMember({ batonName: 'grok-mac', hostPolicy: 'endpoint-9' }),
        ]),
      ],
      sessionsById: new Map([
        ['session-opus-mac', session('running', null)],
        ['session-remote-mac', session('running', 'endpoint-1')],
      ]),
      sheets: noSheets,
      hostLabelOf,
    })
    expect(horses.map((horse) => horse.hostLabel)).toEqual([
      'This Mac',
      // The conversation's host wins over the policy: that is where the work
      // IS, and the policy only says where the next one would start.
      'endpoint-1',
      'endpoint-9',
    ])
  })
})

describe('MAR-3191 R4: every row appears exactly once', () => {
  const rows = [
    // The ledger joins a row to the conversation that holds it, and that
    // join -- not the seat's name -- is what a card claims by (lap 2, B).
    ledgerEntry({
      issueIdentifier: 'EX-1',
      state: 'working',
      seat: 'opus-mac',
      sessionId: 'session-opus-mac',
    }),
    ledgerEntry({
      issueIdentifier: 'EX-2',
      state: 'working',
      seat: 'nobody-here',
      sessionId: 'session-nobody',
    }),
    ledgerEntry({
      issueIdentifier: 'EX-3',
      state: 'returned',
      seat: 'opus-mac',
      sessionId: 'session-opus-mac',
    }),
  ]
  const sheets = loomSheets(rows, NOW)
  const horses = loomHorses({
    crews: [boundCrewWith('crew-1', 'Loom', [residentSeat('opus-mac')])],
    sessionsById: new Map([['session-opus-mac', session('running')]]),
    sheets,
    hostLabelOf,
  })

  it('the card’s held row leaves the list; an unclaimed one stays', () => {
    expect(horses[0]?.held?.entry.issueIdentifier).toBe('EX-1')
    // Mutation: list the held rows too -> EX-1 twice on one sheet, red.
    expect(
      loomNowRows(sheets, horses).map((row) => row.entry.issueIdentifier),
    ).toEqual(['EX-2'])
  })

  it('the union is the whole of in-flight, and the two are disjoint', () => {
    const listed = loomNowRows(sheets, horses).map((row) => row.entry.issueId)
    const held = horses.flatMap((horse) =>
      horse.held ? [horse.held.entry.issueId] : [],
    )
    expect([...listed, ...held].sort()).toEqual(
      sheets.now.inFlight.map((row) => row.entry.issueId).sort(),
    )
    expect(listed.filter((id) => held.includes(id))).toEqual([])
  })

  it('a returned row is NAMED on the card and stays under Fable’s turn', () => {
    // One fact, shown where each reader needs it: the card answers "what is
    // this horse on?", the section answers "what do I owe a verdict on?".
    expect(horses[0]?.returned?.entry.issueIdentifier).toBe('EX-3')
    expect(
      sheets.now.fablesTurn.map((row) => row.entry.issueIdentifier),
    ).toEqual(['EX-3'])
  })

  it('a seat holding several working rows shows the newest', () => {
    const many = loomSheets(
      [
        ledgerEntry({
          issueIdentifier: 'EX-OLD',
          state: 'working',
          seat: 'opus-mac',
          sessionId: 'session-opus-mac',
          seenAt: '2026-09-19T07:00:00.000Z',
        }),
        ledgerEntry({
          issueIdentifier: 'EX-NEW',
          state: 'working',
          seat: 'opus-mac',
          sessionId: 'session-opus-mac',
          seenAt: '2026-09-19T07:59:00.000Z',
        }),
      ],
      NOW,
    )
    const holder = loomHorses({
      crews: [boundCrewWith('crew-1', 'Loom', [residentSeat('opus-mac')])],
      sessionsById: new Map([['session-opus-mac', session('running')]]),
      sheets: many,
      hostLabelOf,
    })[0]!
    expect(holder.held?.entry.issueIdentifier).toBe('EX-NEW')
    // The one it is not showing is still on the sheet, not swallowed.
    expect(
      loomNowRows(many, [holder]).map((row) => row.entry.issueIdentifier),
    ).toEqual(['EX-OLD'])
  })
})

describe('MAR-3191: the horses line adds up', () => {
  it('names every seat it counts', () => {
    const horses = loomHorses({
      crews: [
        boundCrewWith('crew-1', 'Loom', [
          residentSeat('a'),
          residentSeat('b'),
          residentSeat('c'),
          residentSeat('d'),
          crewMember({ batonName: 'recipe-1' }),
        ]),
      ],
      sessionsById: new Map([
        ['session-a', session('running')],
        ['session-b', session('idle')],
        ['session-c', session('failed')],
      ]),
      sheets: noSheets,
      hostLabelOf,
    })
    // `d` has no session in the store -> not seen; the recipe is named as a
    // recipe. Mutation: leave recipes out of the line -> 5 horses and four
    // numbers summing to 4, red.
    expect(loomHorsesLine(horses)).toBe(
      '5 horses · 1 working · 1 idle · 1 failed · 1 not seen · 1 recipe',
    )
    // Mutation: five zeros instead of the sentence -> red (lap 2, E).
    expect(loomHorsesLine([])).toBe(LOOM_NO_HORSES_LINE)
  })
})

describe('MAR-3191 lap 2, A: the held row is wherever the sheet put it', () => {
  const blockedRow = ledgerEntry({
    issueIdentifier: 'MAR-1',
    state: 'working',
    seat: 'opus-mac',
    sessionId: 'session-opus-mac',
    blocked: true,
    hostLiveness: {
      executionHost: 'lm',
      lastEventAt: '2026-09-19T07:50:00.000Z',
      hostReachable: false,
    },
  })

  it('a blocked working row is on the card, says so, and stays under Decide', () => {
    const sheets = loomSheets([blockedRow], NOW)
    // `loomSheets` sends a blocked row to Decide, never to in-flight.
    expect(sheets.now.inFlight).toEqual([])
    expect(sheets.now.decide).toHaveLength(1)

    const horse = loomHorses({
      crews: [boundCrewWith('crew-1', 'Loom', [residentSeat('opus-mac')])],
      sessionsById: new Map([['session-opus-mac', session('idle')]]),
      sheets,
      hostLabelOf,
    })[0]!

    // Mutation: search `inFlight` only -> held is null, the card reads
    // "Idle · No active ticket" about a horse busy on a blocked issue on a
    // dead host. That is the exact sentence R2 exists to refuse.
    expect(horse.held?.entry.issueIdentifier).toBe('MAR-1')
    expect(horse.heldFrom).toBe('decide')
    expect(horse.runtime).toBe('not-seen')
    // And it is still listed where a person looks for decisions.
    expect(loomNowRows(sheets, [horse])).toEqual([])
    expect(sheets.now.decide).toHaveLength(1)
  })

  it('an in-flight row is preferred when the seat holds both', () => {
    const sheets = loomSheets(
      [
        blockedRow,
        ledgerEntry({
          issueIdentifier: 'MAR-2',
          state: 'working',
          seat: 'opus-mac',
          sessionId: 'session-opus-mac',
        }),
      ],
      NOW,
    )
    const horse = loomHorses({
      crews: [boundCrewWith('crew-1', 'Loom', [residentSeat('opus-mac')])],
      sessionsById: new Map([['session-opus-mac', session('running')]]),
      sheets,
      hostLabelOf,
    })[0]!
    expect(horse.held?.entry.issueIdentifier).toBe('MAR-2')
    expect(horse.heldFrom).toBe('in-flight')
    // Only the in-flight one leaves the list; the blocked one stays in Decide.
    expect(loomNowRows(sheets, [horse])).toEqual([])
    expect(sheets.now.decide.map((row) => row.entry.issueIdentifier)).toEqual([
      'MAR-1',
    ])
  })

  it('the session’s own host-unreachable is enough, with no rows at all', () => {
    // The third witness (lap 2, A). Mutation: ignore `attention` -> `idle`,
    // and a seat the app has lost the wire to reads as sitting still.
    const horse = loomHorses({
      crews: [boundCrewWith('crew-1', 'Loom', [residentSeat('opus-mac')])],
      sessionsById: new Map([
        [
          'session-opus-mac',
          { status: 'idle', attention: 'host-unreachable' } as LoomHorseSession,
        ],
      ]),
      sheets: noSheets,
      hostLabelOf,
    })[0]!
    expect(horse.runtime).toBe('not-seen')
  })

  it('a returned row on a dead host is the second witness', () => {
    const sheets = loomSheets(
      [
        ledgerEntry({
          issueIdentifier: 'MAR-3',
          state: 'returned',
          seat: 'opus-mac',
          sessionId: 'session-opus-mac',
          hostLiveness: {
            executionHost: 'lm',
            lastEventAt: '2026-09-19T07:50:00.000Z',
            hostReachable: false,
          },
        }),
      ],
      NOW,
    )
    const horse = loomHorses({
      crews: [boundCrewWith('crew-1', 'Loom', [residentSeat('opus-mac')])],
      sessionsById: new Map([['session-opus-mac', session('idle')]]),
      sheets,
      hostLabelOf,
    })[0]!
    // Mutation: read liveness from `held` only -> `idle`, red.
    expect(horse.runtime).toBe('not-seen')
  })
})

describe('MAR-3191 lap 2, B: a row is claimed by the ledger’s join', () => {
  it('two residents may share a name; the row belongs to one of them', () => {
    const crew = boundCrewWith('crew-1', 'Loom', [
      residentSeat('opus-mac', { sessionId: 'session-a' }),
      residentSeat('opus-mac', { sessionId: 'session-b' }),
    ])
    const sheets = loomSheets(
      [
        ledgerEntry({
          issueIdentifier: 'EX-1',
          state: 'working',
          seat: 'opus-mac',
          sessionId: 'session-b',
        }),
      ],
      NOW,
    )
    const horses = loomHorses({
      crews: [crew],
      sessionsById: new Map([
        ['session-a', session('running')],
        ['session-b', session('running')],
      ]),
      sheets,
      hostLabelOf,
    })

    // Mutation: match by `entry.seat === batonName` -> BOTH cards claim EX-1,
    // the list removes it once, and the two cards' keys collide.
    expect(horses[0]?.held).toBeNull()
    expect(horses[1]?.held?.entry.issueIdentifier).toBe('EX-1')
    expect(horses[0]?.key).not.toBe(horses[1]?.key)
    expect(loomNowRows(sheets, horses)).toEqual([])
  })

  it('a recipe claims its crew’s seat rows that carry no session', () => {
    const sheets = loomSheets(
      [
        ledgerEntry({
          issueIdentifier: 'EX-9',
          state: 'working',
          seat: 'grok-mac',
          sessionId: null,
        }),
      ],
      NOW,
    )
    const horse = loomHorses({
      crews: [
        boundCrewWith('crew-1', 'Loom', [
          crewMember({ batonName: 'grok-mac' }),
        ]),
      ],
      sessionsById: new Map(),
      sheets,
      hostLabelOf,
    })[0]!
    // A recipe has no conversation, so a name is all it can be addressed by.
    expect(horse.held?.entry.issueIdentifier).toBe('EX-9')
    expect(horse.key).toBe('crew-1:recipe:grok-mac')
  })
})

describe('MAR-3191 lap 2, C: a deleted conversation is not an unfetched one', () => {
  it('the record’s own flag reaches the model', () => {
    const horses = loomHorses({
      crews: [
        boundCrewWith('crew-1', 'Loom', [
          residentSeat('gone', { conversationMissing: true }),
          residentSeat('here'),
        ]),
      ],
      sessionsById: new Map(),
      sheets: noSheets,
      hostLabelOf,
    })
    // Mutation: ignore the flag -> both read "conversation not loaded", and
    // one of them is a seat a person has to go and remove.
    expect(horses[0]?.conversationMissing).toBe(true)
    expect(horses[1]?.conversationMissing).toBe(false)
  })
})

describe('MAR-3191 lap 3, F: a card holds the issue the horse is WORKING', () => {
  /** The seat's one row, blocked, in each of Now's four live states. */
  const cardFor = (state: 'assigned' | 'reviewed' | 'returned' | 'working') => {
    const sheets = loomSheets(
      [
        ledgerEntry({
          issueIdentifier: 'MAR-9',
          state,
          seat: 'opus-mac',
          sessionId: 'session-opus-mac',
          blocked: true,
          hostLiveness: {
            executionHost: 'lm',
            lastEventAt: '2026-09-19T07:50:00.000Z',
            hostReachable: false,
          },
        }),
      ],
      NOW,
    )
    const horse = loomHorses({
      crews: [boundCrewWith('crew-1', 'Loom', [residentSeat('opus-mac')])],
      sessionsById: new Map([['session-opus-mac', session('idle')]]),
      sheets,
      hostLabelOf,
    })[0]!
    return { sheets, horse }
  }

  it.each(['assigned', 'reviewed', 'returned'] as const)(
    'a blocked %s issue is NOT what the horse is working on',
    (state) => {
      // Every one of these is drawn under *Decide*, because `loomSheets`
      // buckets a blocked row by its label before its state. Lap 2 asked the
      // GROUP for the seat's work and so claimed all three.
      // Mutation: drop the state filter -> the card says the horse is
      // working MAR-9 when it is queued, awaiting QA, or returned. Red.
      const { horse } = cardFor(state)
      expect(horse.held).toBeNull()
      expect(horse.heldFrom).toBeNull()
    },
  )

  it('a blocked working issue IS, and says where it is drawn', () => {
    const { sheets, horse } = cardFor('working')
    expect(horse.held?.entry.issueIdentifier).toBe('MAR-9')
    expect(horse.heldFrom).toBe('decide')
    // Still listed where a person looks for decisions, and never twice.
    expect(loomNowRows(sheets, [horse])).toEqual([])
    expect(sheets.now.decide).toHaveLength(1)
  })

  it('a blocked returned row is found, with its host marker', () => {
    // `returned` used to be looked up in `fablesTurn` alone, and a blocked
    // returned row is not there -- so the card missed both the row and one
    // of the three witnesses that say "Not seen".
    // Mutation: read `returned` from `fablesTurn` only -> `returned` is null
    // and the runtime falls back to the session's `idle`. Red twice.
    const { horse } = cardFor('returned')
    expect(horse.returned?.entry.issueIdentifier).toBe('MAR-9')
    expect(horse.returned?.hostMarker).toBe('host unreachable since 10m')
    expect(horse.runtime).toBe('not-seen')
  })

  it('an unblocked returned row is still found under Fable’s turn', () => {
    const sheets = loomSheets(
      [
        ledgerEntry({
          issueIdentifier: 'MAR-8',
          state: 'returned',
          seat: 'opus-mac',
          sessionId: 'session-opus-mac',
        }),
      ],
      NOW,
    )
    const horse = loomHorses({
      crews: [boundCrewWith('crew-1', 'Loom', [residentSeat('opus-mac')])],
      sessionsById: new Map([['session-opus-mac', session('running')]]),
      sheets,
      hostLabelOf,
    })[0]!
    expect(horse.returned?.entry.issueIdentifier).toBe('MAR-8')
    expect(sheets.now.fablesTurn).toHaveLength(1)
  })

  it('a seat holding a working row and a blocked one holds the working one', () => {
    const sheets = loomSheets(
      [
        ledgerEntry({
          issueIdentifier: 'MAR-WORK',
          state: 'working',
          seat: 'opus-mac',
          sessionId: 'session-opus-mac',
          seenAt: '2026-09-19T07:00:00.000Z',
        }),
        ledgerEntry({
          issueIdentifier: 'MAR-QA',
          state: 'reviewed',
          seat: 'opus-mac',
          sessionId: 'session-opus-mac',
          blocked: true,
          seenAt: '2026-09-19T07:59:00.000Z',
        }),
      ],
      NOW,
    )
    const horse = loomHorses({
      crews: [boundCrewWith('crew-1', 'Loom', [residentSeat('opus-mac')])],
      sessionsById: new Map([['session-opus-mac', session('running')]]),
      sheets,
      hostLabelOf,
    })[0]!
    // The blocked row is NEWER, so a lookup that sorted before filtering
    // would take it. Mutation: sort then filter -> MAR-QA on the card, red.
    expect(horse.held?.entry.issueIdentifier).toBe('MAR-WORK')
    expect(horse.heldFrom).toBe('in-flight')
  })
})
