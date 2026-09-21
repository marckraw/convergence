import { describe, expect, it } from 'vitest'
import {
  loomCrewForConversation,
  openConversationId,
  parseLoomFollow,
  serializeLoomFollow,
  type LoomFollowCrew,
  type LoomFollowSession,
} from './loom-follow.pure'

/** A bound crew seating the conversations named. */
const crew = (
  id: string,
  seats: readonly (string | null)[],
  bound = true,
): LoomFollowCrew => ({
  id,
  bound,
  members: seats.map((sessionId) => ({ sessionId })),
})

const session = (id: string, projectId: string | null): LoomFollowSession => ({
  id,
  projectId,
})

/**
 * Two crews in two projects, and a third conversation in neither: what the
 * app looks like on the day this rule matters.
 */
const SESSIONS = [
  session('s-opus', 'project-convergence'),
  session('s-other', 'project-convergence'),
  session('s-astra', 'project-segmemo'),
  session('s-loose', 'project-nobody'),
  session('s-chat', null),
]

describe('MAR-3291 R1: which crew is a conversation’s Loom', () => {
  it('a seat’s own conversation answers with its crew', () => {
    expect(
      loomCrewForConversation({
        session: session('s-astra', 'project-segmemo'),
        crews: [crew('crew-cvg', ['s-opus']), crew('crew-seg', ['s-astra'])],
        sessions: SESSIONS,
        current: 'crew-cvg',
      }),
    ).toBe('crew-seg')
  })

  it('being a SEAT beats sharing a project, even when the project points elsewhere', () => {
    // `s-astra` is seated in crew-seg while its project (segmemo) is also the
    // project of crew-cvg's second seat. Mutation: match on project before
    // seat -> `crew-cvg`, red.
    expect(
      loomCrewForConversation({
        session: session('s-astra', 'project-segmemo'),
        crews: [
          crew('crew-cvg', ['s-opus', 's-astra-twin']),
          crew('crew-seg', ['s-astra']),
        ],
        sessions: [...SESSIONS, session('s-astra-twin', 'project-segmemo')],
        current: null,
      }),
    ).toBe('crew-seg')
  })

  it('no seat: the crew working in the same project answers', () => {
    expect(
      loomCrewForConversation({
        session: session('s-other', 'project-convergence'),
        crews: [crew('crew-seg', ['s-astra']), crew('crew-cvg', ['s-opus'])],
        sessions: SESSIONS,
        current: 'crew-seg',
      }),
    ).toBe('crew-cvg')
  })

  it('two crews in one project: the crew on screen keeps the screen', () => {
    // Mutation: always answer the first of the set -> `crew-a`, red.
    expect(
      loomCrewForConversation({
        session: session('s-other', 'project-convergence'),
        crews: [crew('crew-a', ['s-opus']), crew('crew-b', ['s-opus'])],
        sessions: SESSIONS,
        current: 'crew-b',
      }),
    ).toBe('crew-b')
  })

  it('two crews in one project, neither on screen: the first in CREW order', () => {
    expect(
      loomCrewForConversation({
        session: session('s-other', 'project-convergence'),
        crews: [crew('crew-b', ['s-opus']), crew('crew-a', ['s-opus'])],
        sessions: SESSIONS,
        current: 'crew-seg',
      }),
    ).toBe('crew-b')
  })

  it('an unbound crew is never the answer, seat or project', () => {
    // Mutation: drop the `bound` filter -> `crew-seg` both times, red.
    expect(
      loomCrewForConversation({
        session: session('s-astra', 'project-segmemo'),
        crews: [crew('crew-seg', ['s-astra'], false)],
        sessions: SESSIONS,
        current: null,
      }),
    ).toBeNull()
    expect(
      loomCrewForConversation({
        session: session('s-astra-2', 'project-segmemo'),
        crews: [crew('crew-seg', ['s-astra'], false)],
        sessions: SESSIONS,
        current: null,
      }),
    ).toBeNull()
  })

  it('a conversation with no project and no seat has no Loom', () => {
    // A global chat: `projectId` is null on both sides, and two nothings are
    // not a project they share. Mutation: compare `projectId` without the
    // non-null guard -> `crew-chat`, red.
    expect(
      loomCrewForConversation({
        session: session('s-chat', null),
        crews: [crew('crew-cvg', ['s-opus']), crew('crew-chat', ['s-chat-2'])],
        sessions: [...SESSIONS, session('s-chat-2', null)],
        current: 'crew-cvg',
      }),
    ).toBeNull()
  })

  it('a conversation in a project no crew works in has no Loom', () => {
    expect(
      loomCrewForConversation({
        session: session('s-loose', 'project-nobody'),
        crews: [crew('crew-cvg', ['s-opus'])],
        sessions: SESSIONS,
        current: 'crew-cvg',
      }),
    ).toBeNull()
  })

  it('no conversation on screen has no Loom', () => {
    expect(
      loomCrewForConversation({
        session: null,
        crews: [crew('crew-cvg', ['s-opus'])],
        sessions: SESSIONS,
        current: null,
      }),
    ).toBeNull()
  })

  it('a dynamic seat, and a seat whose conversation the app cannot see, decide nothing', () => {
    expect(
      loomCrewForConversation({
        session: session('s-other', 'project-convergence'),
        crews: [crew('crew-recipes', [null, 's-unloaded'])],
        sessions: SESSIONS,
        current: null,
      }),
    ).toBeNull()
  })
})

describe('MAR-3291 R2: which conversation is on screen', () => {
  it('the surface decides which of the two ids is being read', () => {
    const ids = { activeSessionId: 's-opus', activeGlobalSessionId: 's-chat' }
    // Mutation: read one id whatever the surface -> one of these is red.
    expect(openConversationId({ surface: 'code', ...ids })).toBe('s-opus')
    expect(openConversationId({ surface: 'chat', ...ids })).toBe('s-chat')
    expect(
      openConversationId({
        surface: 'chat',
        activeSessionId: 's-opus',
        activeGlobalSessionId: null,
      }),
    ).toBeNull()
  })
})

describe('MAR-3291 R3: the preference round-trips, and defaults to off', () => {
  it('only the value it writes reads as on', () => {
    expect(parseLoomFollow(serializeLoomFollow())).toBe(true)
    // Mutation: treat any non-null string as on -> red.
    expect(parseLoomFollow(null)).toBe(false)
    expect(parseLoomFollow('')).toBe(false)
    expect(parseLoomFollow('true')).toBe(false)
    expect(parseLoomFollow('0')).toBe(false)
  })
})
