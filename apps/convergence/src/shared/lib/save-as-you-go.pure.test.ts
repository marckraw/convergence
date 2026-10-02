import { describe, expect, it } from 'vitest'
import {
  createSaveAsYouGo,
  type SaveTimers,
  type SaveWork,
} from './save-as-you-go.pure'

/** A clock the test moves by hand. */
function manualTimers() {
  let now = 0
  let nextId = 1
  const pending = new Map<number, { at: number; run: () => void }>()
  const timers: SaveTimers = {
    set: (run, delayMs) => {
      const id = nextId++
      pending.set(id, { at: now + delayMs, run })
      return id
    },
    clear: (handle) => {
      pending.delete(handle as number)
    },
  }
  const advance = (ms: number) => {
    now += ms
    for (const [id, timer] of [...pending]) {
      if (timer.at <= now) {
        pending.delete(id)
        timer.run()
      }
    }
  }
  return { timers, advance, pending }
}

/** Lets the saves chained so far run. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

/** A save that records what it saved, and finishes when told. */
function recorder() {
  const saved: string[] = []
  const work =
    (value: string): SaveWork =>
    async () => {
      saved.push(value)
    }
  return { saved, work }
}

describe('createSaveAsYouGo', () => {
  it('saves once typing has paused for the delay, not before', async () => {
    const clock = manualTimers()
    const { saved, work } = recorder()
    const scheduler = createSaveAsYouGo(() => work('typed'), clock.timers)

    scheduler.scheduleSave(400)
    clock.advance(399)
    await settle()
    expect(saved).toEqual([])
    clock.advance(1)
    await settle()
    expect(saved).toEqual(['typed'])
  })

  it('saves two changes inside one wait once, with the later value', async () => {
    const clock = manualTimers()
    const { saved, work } = recorder()
    let draft = 'a'
    const scheduler = createSaveAsYouGo(() => work(draft), clock.timers)

    scheduler.scheduleSave(400)
    clock.advance(200)
    draft = 'ab'
    scheduler.scheduleSave(400)
    clock.advance(399)
    await settle()
    // Mutation: keep the first timer when a second change comes -> 'a' is
    // saved here, red.
    expect(saved).toEqual([])
    clock.advance(1)
    await settle()
    expect(saved).toEqual(['ab'])
  })

  it('reads what it saves when the save is asked for', async () => {
    const clock = manualTimers()
    const { saved, work } = recorder()
    let space = 'first'
    const scheduler = createSaveAsYouGo(() => work(space), clock.timers)

    scheduler.saveNow()
    space = 'second'
    await settle()
    expect(saved).toEqual(['first'])
  })

  it('saves now, and the waiting save goes with it', async () => {
    const clock = manualTimers()
    const { saved, work } = recorder()
    const scheduler = createSaveAsYouGo(() => work('now'), clock.timers)

    scheduler.scheduleSave(400)
    scheduler.saveNow()
    expect(clock.pending.size).toBe(0)
    clock.advance(400)
    await settle()
    expect(saved).toEqual(['now'])
  })

  it('flushes only a save that is waiting', async () => {
    const clock = manualTimers()
    const { saved, work } = recorder()
    const scheduler = createSaveAsYouGo(() => work('kept'), clock.timers)

    scheduler.flush()
    await settle()
    expect(saved).toEqual([])
    scheduler.scheduleSave(400)
    scheduler.flush()
    await settle()
    // Mutation: flush without checking for a waiting save -> two saves.
    expect(saved).toEqual(['kept'])
    clock.advance(400)
    await settle()
    expect(saved).toEqual(['kept'])
  })

  it('asks nothing of a save there is nothing to save for', async () => {
    const clock = manualTimers()
    let asked = 0
    const scheduler = createSaveAsYouGo(() => {
      asked += 1
      return null
    }, clock.timers)

    scheduler.saveNow()
    await settle()
    expect(asked).toBe(1)
  })

  it('runs saves one after another, in the order asked', async () => {
    const clock = manualTimers()
    const order: string[] = []
    let finishFirst: () => void = () => {}
    const values = ['first', 'second']
    const scheduler = createSaveAsYouGo(() => {
      const value = values.shift()!
      return async () => {
        order.push(`start ${value}`)
        if (value === 'first')
          await new Promise<void>((resolve) => {
            finishFirst = resolve
          })
        order.push(`end ${value}`)
      }
    }, clock.timers)

    scheduler.saveNow()
    scheduler.saveNow()
    await settle()
    expect(order).toEqual(['start first'])
    finishFirst()
    await settle()
    expect(order).toEqual([
      'start first',
      'end first',
      'start second',
      'end second',
    ])
  })

  it('goes on saving after one save fails', async () => {
    const clock = manualTimers()
    const saved: string[] = []
    const values = ['fails', 'next']
    const scheduler = createSaveAsYouGo(() => {
      const value = values.shift()!
      return async () => {
        if (value === 'fails') throw new Error('the database is locked')
        saved.push(value)
      }
    }, clock.timers)

    scheduler.saveNow()
    scheduler.saveNow()
    await settle()
    // Mutation: chain without catching -> the failure skips 'next', red.
    expect(saved).toEqual(['next'])
  })
})
