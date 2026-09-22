import { expect, it, vi } from 'vitest'
import { AutoDrillService } from './auto-drill.service'
import type {
  DrillChange,
  DrillOutcome,
  DrillSettleEvent,
} from './context-drill.types'
import type { SessionContextWindow } from '../provider/provider.types'

const context = (percent: number): SessionContextWindow => ({
  availability: 'available',
  source: 'provider',
  usedPercentage: percent,
  remainingPercentage: 100 - percent,
  usedTokens: percent * 1000,
  windowTokens: 100000,
})
function fixture() {
  let guard!: (id: string) => boolean
  let settle!: (event: DrillSettleEvent) => void
  let change!: (event: DrillChange) => void
  let finish!: (outcome: DrillOutcome) => void
  let held = false
  const rows = ['queued', 'queued', 'queued']
  const session = { contextWindow: context(90), attention: 'finished' }
  const gateway = {
    onBeforeQueueDrain: (cb: typeof guard) => {
      guard = cb
      return vi.fn()
    },
    onSessionSettled: (cb: typeof settle) => {
      settle = cb
      return vi.fn()
    },
    read: vi.fn(() => session),
    enabled: vi.fn(() => true),
    parallelWork: vi.fn(() => ({ running: 0, unknown: 0 })),
    alert: () => ({ enabled: true, percent: 75, tokens: null }),
    holdQueue: vi.fn(() => {
      held = true
    }),
    releaseQueue: vi.fn(() => {
      if (held) {
        held = false
        rows[0] = 'sent'
      }
    }),
    note: vi.fn(),
    changed: vi.fn(),
  }
  const witnesses: Array<{ held: boolean; rows: string[] }> = []
  const run = vi.fn(() => {
    witnesses.push({ held, rows: [...rows] })
    return new Promise<DrillOutcome>((resolve) => {
      finish = resolve
    }).finally(() => gateway.releaseQueue())
  })
  const drill = {
    run,
    describe: vi.fn(() => ({
      seat: 'mastermind' as const,
      eligible: true,
      offered: true,
      beat: null,
      reason: null,
    })),
    onDrillChanged: (cb: typeof change) => {
      change = cb
      return vi.fn()
    },
  }
  const service = new AutoDrillService(gateway, drill)
  return {
    gateway,
    session,
    rows,
    run,
    witnesses,
    service,
    guard: () => guard('s'),
    settle: () =>
      settle({ sessionId: 's', status: 'completed', dispatchIds: [] }),
    button: () => change({ sessionId: 's', beat: 'sealing' }),
    finish: (outcome: DrillOutcome) => finish(outcome),
  }
}
const tick = () => new Promise<void>((resolve) => setImmediate(resolve))

it.each([
  'off or horse',
  'under',
  'unavailable',
  'needs-input',
  'needs-approval',
  'parallel',
  'unknown',
])('silently declines %s', async (reason) => {
  const bed = fixture()
  if (reason === 'off or horse') bed.gateway.enabled.mockReturnValue(false)
  if (reason === 'under') bed.session.contextWindow = context(10)
  if (reason === 'unavailable')
    bed.session.contextWindow = {
      availability: 'unavailable',
      source: 'provider',
      reason: 'none',
    }
  if (reason.startsWith('needs-')) bed.session.attention = reason
  if (reason === 'parallel')
    bed.gateway.parallelWork.mockReturnValue({ running: 1, unknown: 0 })
  if (reason === 'unknown')
    bed.gateway.parallelWork.mockReturnValue({ running: 0, unknown: 1 })
  expect(bed.guard()).toBe(false)
  await tick()
  expect(bed.run).not.toHaveBeenCalled()
  expect(bed.gateway.holdQueue).not.toHaveBeenCalled()
})
it('holds three queued rows before the next tick and releases them after the drill', async () => {
  const bed = fixture()
  expect(bed.guard()).toBe(true)
  expect(bed.run).not.toHaveBeenCalled()
  expect(bed.rows).toEqual(['queued', 'queued', 'queued'])
  await tick()
  expect(bed.run).toHaveBeenCalledTimes(1)
  expect(bed.witnesses).toEqual([
    { held: true, rows: ['queued', 'queued', 'queued'] },
  ])
  expect(bed.guard()).toBe(false)
  bed.finish({ ok: true })
  await tick()
  expect(bed.rows).toEqual(['sent', 'queued', 'queued'])
})
it('blocks still-over after the next settle until a button run', async () => {
  const bed = fixture()
  bed.guard()
  await tick()
  bed.finish({ ok: true })
  await tick()
  expect(bed.gateway.note).not.toHaveBeenCalled()
  expect(bed.guard()).toBe(false)
  bed.settle()
  expect(bed.guard()).toBe(false)
  bed.button()
  bed.rows[0] = 'queued'
  expect(bed.guard()).toBe(true)
  await tick()
  bed.finish({ ok: true })
  await tick()
})
it('reads the after-figure on settle and runs again with no wait after going under', async () => {
  const bed = fixture()
  bed.guard()
  await tick()
  bed.finish({ ok: true })
  await tick()
  expect(bed.gateway.note).not.toHaveBeenCalled()
  bed.session.contextWindow = context(10)
  bed.settle()
  expect(bed.gateway.note).toHaveBeenCalledExactlyOnceWith(
    's',
    'Context compacted automatically at 90% → 10%',
  )
  bed.session.contextWindow = context(90)
  bed.rows[0] = 'queued'
  expect(bed.guard()).toBe(true)
  await tick()
  bed.finish({ ok: true })
  await tick()
})
it('never notes a button run', () => {
  const bed = fixture()
  bed.button()
  bed.settle()
  expect(bed.gateway.note).not.toHaveBeenCalled()
})
it('waits for a known after-figure without writing a placeholder', async () => {
  const bed = fixture()
  bed.guard()
  await tick()
  bed.finish({ ok: true })
  await tick()
  bed.session.contextWindow = {
    availability: 'unavailable',
    source: 'provider',
    reason: 'none',
  }
  bed.settle()
  expect(bed.gateway.note).not.toHaveBeenCalled()
  expect(bed.guard()).toBe(false)
  bed.session.contextWindow = context(10)
  bed.settle()
  expect(bed.gateway.note).toHaveBeenCalledExactlyOnceWith(
    's',
    'Context compacted automatically at 90% → 10%',
  )
})
it('a failed run releases the first row, reports the card, and never retries', async () => {
  const bed = fixture()
  bed.guard()
  await tick()
  const outcome = {
    ok: false as const,
    beat: 'sealing' as const,
    reason: 'No seal',
  }
  bed.finish(outcome)
  await tick()
  expect(bed.rows[0]).toBe('sent')
  expect(bed.gateway.changed).toHaveBeenCalledWith({
    sessionId: 's',
    beat: null,
    automatic: { outcome, before: 90 },
  })
  bed.settle()
  expect(bed.guard()).toBe(false)
  await tick()
  expect(bed.run).toHaveBeenCalledTimes(1)
  expect(bed.gateway.note).not.toHaveBeenCalled()
})
