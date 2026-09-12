import { expect, it } from 'vitest'
import { cardSession } from './needs-you-card.fixture'
import { needsYouTiming } from './needs-you-timing.pure'

const start = '2026-09-12T12:00:00Z'
const now = Date.parse(start) + 72_000
const turn = {
  turnId: 'turn',
  startedAt: start,
  endedAt: null,
  status: 'running' as const,
}

it('times only the current active turn and freezes a recorded completion', () => {
  const session = cardSession({
    status: 'running',
    hasActiveHandle: true,
    turnTiming: turn,
  })
  expect(needsYouTiming(session, now)).toMatchObject({
    label: '· 1m 12s',
    live: true,
  })
  const completed = cardSession({
    status: 'completed',
    attention: 'finished',
    turnTiming: {
      ...turn,
      status: 'completed',
      endedAt: new Date(now).toISOString(),
    },
  })
  expect(needsYouTiming(completed, now + 90_000)).toMatchObject({
    label: 'in 1m 12s',
    live: false,
  })
  expect(
    needsYouTiming(
      { ...completed, status: 'running', hasActiveHandle: true },
      now,
    ).label,
  ).toBeNull()
})

it('never turns missing, future, recovery or disconnected timestamps into a duration', () => {
  for (const session of [
    cardSession({ status: 'running', updatedAt: start }),
    cardSession({
      status: 'running',
      turnTiming: turn,
      hasActiveHandle: false,
    }),
    cardSession({
      status: 'failed',
      attention: 'failed',
      turnTiming: { ...turn, status: 'errored' },
    }),
    cardSession({
      status: 'running',
      hasActiveHandle: true,
      turnTiming: { ...turn, startedAt: new Date(now + 1000).toISOString() },
    }),
    cardSession({
      status: 'running',
      hasActiveHandle: true,
      turnTiming: { ...turn, startedAt: 'bad date' },
    }),
  ])
    expect(needsYouTiming(session, now)).toMatchObject({
      label: null,
      live: false,
    })
})

it('uses the oldest background task start, never the ended parent turn; waiting does not borrow turn duration', () => {
  const session = cardSession({
    attention: 'finished',
    parallelWork: {
      running: 2,
      unknown: 0,
      stopped: 0,
      failed: 0,
      runningStartedAt: start,
    },
  })
  expect(needsYouTiming(session, now)).toMatchObject({
    label: '· 1m 12s',
    live: true,
  })
  expect(
    needsYouTiming(
      {
        ...session,
        parallelWork: { ...session.parallelWork!, runningStartedAt: undefined },
      },
      now,
    ).label,
  ).toBeNull()
  expect(
    needsYouTiming(
      {
        ...session,
        status: 'running',
        attention: 'needs-input',
        turnTiming: turn,
        hasActiveHandle: true,
      },
      now,
    ).label,
  ).toBeNull()
})

it('records failures as a fixed duration and formats long turns beside status', () => {
  const session = cardSession({
    status: 'failed',
    attention: 'failed',
    turnTiming: {
      ...turn,
      status: 'errored',
      endedAt: new Date(Date.parse(start) + 43_000).toISOString(),
    },
  })
  expect(needsYouTiming(session, now).label).toBe('after 43s')
  expect(
    needsYouTiming(
      cardSession({
        status: 'running',
        hasActiveHandle: true,
        turnTiming: turn,
      }),
      now + 3_600_000,
    ).label,
  ).toBe('· 1h 1m')
})

it('does not place a parent-turn duration beside an unknown background-task status', () => {
  const session = cardSession({
    attention: 'finished',
    status: 'completed',
    turnTiming: {
      ...turn,
      endedAt: new Date(now).toISOString(),
      status: 'completed',
    },
    parallelWork: { running: 0, unknown: 1, stopped: 0, failed: 0 },
  })
  expect(needsYouTiming(session, now).label).toBeNull()
})
