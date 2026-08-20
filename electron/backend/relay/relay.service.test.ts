import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { closeDatabase, getDatabase, resetDatabase } from '../database/database'
import { RelayService } from './relay.service'

describe('RelayService', () => {
  let service: RelayService

  beforeEach(() => {
    const db = getDatabase()
    service = new RelayService(db)
    db.prepare(
      "INSERT INTO projects (id, name, repository_path) VALUES ('p1', 'p1', '/tmp/p1')",
    ).run()
    for (const id of ['s1', 's2', 's3']) {
      db.prepare(
        `INSERT INTO sessions (id, project_id, provider_id, name, working_directory)
         VALUES (?, 'p1', 'codex', ?, '/tmp/p1')`,
      ).run(id, id)
    }
    db.prepare(
      "INSERT INTO session_crews (id, name) VALUES ('c1', 'Review loop')",
    ).run()
  })

  afterEach(() => {
    closeDatabase()
    resetDatabase()
  })

  function createRelay(overrides: Partial<{ target: string }> = {}) {
    return service.create({
      crewId: 'c1',
      sourceSessionId: 's1',
      action: 'hail',
      targetSessionId: overrides.target ?? 's2',
    })
  }

  it('creates an armed settled relay by default', () => {
    const relay = createRelay()

    expect(relay).toMatchObject({
      crewId: 'c1',
      sourceSessionId: 's1',
      targetSessionId: 's2',
      trigger: 'settled',
      action: 'hail',
      armed: true,
    })
    expect(service.list().map((r) => r.id)).toEqual([relay.id])
  })

  it('can create a wire that starts switched off', () => {
    const relay = service.create({
      crewId: 'c1',
      sourceSessionId: 's1',
      action: 'hail',
      targetSessionId: 's2',
      armed: false,
    })

    expect(relay.armed).toBe(false)
  })

  it('refuses a hail with no target and a wire pointing at its own source', () => {
    expect(() =>
      service.create({
        crewId: 'c1',
        sourceSessionId: 's1',
        action: 'hail',
      }),
    ).toThrow('A hail relay needs a target session')

    expect(() =>
      service.create({
        crewId: 'c1',
        sourceSessionId: 's1',
        action: 'hail',
        targetSessionId: 's1',
      }),
    ).toThrow('A relay cannot hail the session it listens to')
  })

  it('repoints a wire and keeps the rest of it', () => {
    const relay = createRelay()

    const updated = service.update(relay.id, { targetSessionId: 's3' })

    expect(updated).toMatchObject({
      id: relay.id,
      sourceSessionId: 's1',
      targetSessionId: 's3',
      armed: true,
    })
  })

  it('rejects an update that would point a wire at its own source', () => {
    const relay = createRelay()

    expect(() => service.update(relay.id, { targetSessionId: 's1' })).toThrow(
      'A relay cannot hail the session it listens to',
    )
  })

  it('arms and disarms without touching anything else', () => {
    const relay = createRelay()

    expect(service.setArmed(relay.id, false).armed).toBe(false)
    expect(service.setArmed(relay.id, true)).toMatchObject({
      armed: true,
      targetSessionId: 's2',
    })
  })

  it('lists the wires leaving a session, armed or not', () => {
    const armed = createRelay()
    const disarmed = service.create({
      crewId: 'c1',
      sourceSessionId: 's1',
      action: 'hail',
      targetSessionId: 's3',
      armed: false,
    })
    service.create({
      crewId: 'c1',
      sourceSessionId: 's2',
      action: 'hail',
      targetSessionId: 's3',
    })

    expect(service.listForSourceSession('s1').map((r) => r.id)).toEqual([
      armed.id,
      disarmed.id,
    ])
  })

  it('throws a named error for a missing relay', () => {
    expect(() => service.update('nope', { armed: false })).toThrow(
      'Relay not found: nope',
    )
    expect(() => service.setArmed('nope', true)).toThrow(
      'Relay not found: nope',
    )
    expect(service.getById('nope')).toBeNull()
  })

  it('deletes the wire and leaves its hops standing', () => {
    const relay = createRelay()
    service.appendHop({
      relayId: relay.id,
      crewId: 'c1',
      flowRunId: 'run-1',
      sourceSessionId: 's1',
      targetSessionId: 's2',
      triggerStatus: 'completed',
      outcome: 'delivered',
    })

    service.delete(relay.id)

    expect(service.list()).toEqual([])
    expect(service.listHops('c1')).toHaveLength(1)
  })

  it('survives the deletion of both sessions it wires together', () => {
    const relay = createRelay()
    const db = getDatabase()

    db.prepare("DELETE FROM sessions WHERE id IN ('s1', 's2')").run()

    expect(service.getById(relay.id)).toMatchObject({
      sourceSessionId: 's1',
      targetSessionId: 's2',
    })
  })

  describe('instructions on the wire', () => {
    it('stores a wire with no instruction as null', () => {
      expect(createRelay().instruction).toBeNull()
    })

    it('keeps a brief, trimmed', () => {
      const relay = service.create({
        crewId: 'c1',
        sourceSessionId: 's1',
        action: 'hail',
        targetSessionId: 's2',
        instruction: '  Take a look at this.  ',
      })

      expect(relay.instruction).toBe('Take a look at this.')
      expect(service.getById(relay.id)!.instruction).toBe(
        'Take a look at this.',
      )
    })

    it('treats a blank box as no instruction', () => {
      const relay = service.create({
        crewId: 'c1',
        sourceSessionId: 's1',
        action: 'hail',
        targetSessionId: 's2',
        instruction: '   ',
      })

      expect(relay.instruction).toBeNull()
    })

    it('leaves the brief alone when an edit is about something else', () => {
      const relay = service.create({
        crewId: 'c1',
        sourceSessionId: 's1',
        action: 'hail',
        targetSessionId: 's2',
        instruction: 'Review it.',
      })

      expect(
        service.update(relay.id, { targetSessionId: 's3' }).instruction,
      ).toBe('Review it.')
    })

    it('clears the brief when the box is emptied', () => {
      const relay = service.create({
        crewId: 'c1',
        sourceSessionId: 's1',
        action: 'hail',
        targetSessionId: 's2',
        instruction: 'Review it.',
      })

      expect(
        service.update(relay.id, { instruction: null }).instruction,
      ).toBeNull()
      expect(
        service.update(relay.id, { instruction: 'Now this.' }).instruction,
      ).toBe('Now this.')
    })

    it('refuses a brief nobody meant to write', () => {
      expect(() =>
        service.create({
          crewId: 'c1',
          sourceSessionId: 's1',
          action: 'hail',
          targetSessionId: 's2',
          instruction: 'x'.repeat(4001),
        }),
      ).toThrow('4000')
    })

    it('carries a brief on a spawn wire too', () => {
      const relay = service.create({
        crewId: 'c1',
        sourceSessionId: 's1',
        action: 'spawn',
        instruction: 'Start from the branch diff.',
        spawnSpec: {
          projectId: 'p1',
          providerId: 'codex',
          model: null,
          effort: null,
          name: 'Reviewer',
          providerAccountId: null,
        },
      })

      expect(relay.instruction).toBe('Start from the branch diff.')
    })
  })

  describe('spawn wires', () => {
    const spec = {
      projectId: 'p1',
      providerId: 'codex',
      model: 'gpt-5.6',
      effort: 'high',
      name: 'Reviewer',
      providerAccountId: null,
    }

    it('stores and reads back the whole session spec', () => {
      const relay = service.create({
        crewId: 'c1',
        sourceSessionId: 's1',
        action: 'spawn',
        spawnSpec: spec,
      })

      expect(relay).toMatchObject({
        action: 'spawn',
        targetSessionId: null,
        spawnSpec: spec,
      })
      expect(service.getById(relay.id)!.spawnSpec).toEqual(spec)
    })

    it('refuses a spawn with no spec or no provider', () => {
      expect(() =>
        service.create({
          crewId: 'c1',
          sourceSessionId: 's1',
          action: 'spawn',
        }),
      ).toThrow('A spawn relay needs a session spec')

      expect(() =>
        service.create({
          crewId: 'c1',
          sourceSessionId: 's1',
          action: 'spawn',
          spawnSpec: { ...spec, providerId: '' },
        }),
      ).toThrow('A spawn relay needs a provider')
    })

    it('drops the hail target when a wire is switched to spawn', () => {
      const relay = createRelay()

      const updated = service.update(relay.id, {
        action: 'spawn',
        spawnSpec: spec,
      })

      expect(updated).toMatchObject({
        action: 'spawn',
        targetSessionId: null,
        spawnSpec: spec,
      })
    })

    it('drops the spawn spec when a wire is switched back to hail', () => {
      const relay = service.create({
        crewId: 'c1',
        sourceSessionId: 's1',
        action: 'spawn',
        spawnSpec: spec,
      })

      const updated = service.update(relay.id, {
        action: 'hail',
        targetSessionId: 's2',
      })

      expect(updated).toMatchObject({
        action: 'hail',
        targetSessionId: 's2',
        spawnSpec: null,
      })
    })

    it('keeps the spec across an edit that does not mention it', () => {
      const relay = service.create({
        crewId: 'c1',
        sourceSessionId: 's1',
        action: 'spawn',
        spawnSpec: spec,
      })

      expect(service.update(relay.id, { armed: false })).toMatchObject({
        armed: false,
        spawnSpec: spec,
      })
    })

    it('degrades an unreadable spec to none rather than failing the read', () => {
      const relay = service.create({
        crewId: 'c1',
        sourceSessionId: 's1',
        action: 'spawn',
        spawnSpec: spec,
      })
      getDatabase()
        .prepare('UPDATE session_relays SET spawn_spec_json = ? WHERE id = ?')
        .run('{not json', relay.id)

      expect(service.getById(relay.id)!.spawnSpec).toBeNull()
      expect(service.list()).toHaveLength(1)
    })
  })

  describe('the hop ledger', () => {
    it('records a firing with its preview and reads the trail newest first', () => {
      const relay = createRelay()

      const first = service.appendHop({
        relayId: relay.id,
        crewId: 'c1',
        flowRunId: 'run-1',
        sourceSessionId: 's1',
        targetSessionId: 's2',
        triggerStatus: 'completed',
        payloadPreview: 'Done.',
        outcome: 'delivered',
      })
      const second = service.appendHop({
        relayId: relay.id,
        crewId: 'c1',
        flowRunId: 'run-1',
        sourceSessionId: 's1',
        targetSessionId: 's2',
        triggerStatus: 'failed',
        outcome: 'skipped-failed',
        error: 'The source session failed, so nothing was carried.',
      })

      expect(first).toMatchObject({
        outcome: 'delivered',
        payloadPreview: 'Done.',
        error: null,
        spawnedSessionId: null,
      })
      expect(service.listHops('c1').map((hop) => hop.id)).toEqual([
        second.id,
        first.id,
      ])
      expect(service.listHops('c1')[0].error).toContain('failed')
    })

    it('honours the trail limit', () => {
      const relay = createRelay()
      for (let index = 0; index < 5; index += 1) {
        service.appendHop({
          relayId: relay.id,
          crewId: 'c1',
          flowRunId: 'run-1',
          sourceSessionId: 's1',
          triggerStatus: 'completed',
          outcome: 'delivered',
        })
      }

      expect(service.listHops('c1', 2)).toHaveLength(2)
    })

    it('keeps each crew trail to itself', () => {
      const relay = createRelay()
      service.appendHop({
        relayId: relay.id,
        crewId: 'c1',
        flowRunId: 'run-1',
        sourceSessionId: 's1',
        triggerStatus: 'completed',
        outcome: 'delivered',
      })

      expect(service.listHops('other-crew')).toEqual([])
    })
  })

  describe('the loop law and the budget', () => {
    it('says a wire has not fired when its run holds no hops', () => {
      const relay = createRelay()

      expect(service.hasFiredInFlowRun(relay.id, 'run-1')).toBe(false)
    })

    it('remembers a wire that spent a turn in this run', () => {
      const relay = createRelay()
      service.appendHop({
        relayId: relay.id,
        crewId: 'c1',
        flowRunId: 'run-1',
        sourceSessionId: 's1',
        targetSessionId: 's2',
        triggerStatus: 'completed',
        outcome: 'delivered',
      })

      expect(service.hasFiredInFlowRun(relay.id, 'run-1')).toBe(true)
      // The next run is a clean sheet; that is what makes the law a pause
      // rather than a one-shot fuse.
      expect(service.hasFiredInFlowRun(relay.id, 'run-2')).toBe(false)
    })

    it('keeps the answer to the wire that was asked about', () => {
      const first = createRelay()
      const second = createRelay({ target: 's3' })
      service.appendHop({
        relayId: first.id,
        crewId: 'c1',
        flowRunId: 'run-1',
        sourceSessionId: 's1',
        targetSessionId: 's2',
        triggerStatus: 'completed',
        outcome: 'delivered',
      })

      expect(service.hasFiredInFlowRun(second.id, 'run-1')).toBe(false)
    })

    /**
     * A skip is not a firing. If it counted, one failed source would retire
     * the wire for the rest of the run without a turn ever being spent.
     */
    it('does not count skips, errors or words from another build', () => {
      const relay = createRelay()
      for (const outcome of [
        'skipped-failed',
        'skipped-budget',
        'skipped-already-fired',
        'error',
      ] as const) {
        service.appendHop({
          relayId: relay.id,
          crewId: 'c1',
          flowRunId: 'run-1',
          sourceSessionId: 's1',
          triggerStatus: 'completed',
          outcome,
        })
      }
      service.appendHop({
        relayId: relay.id,
        crewId: 'c1',
        flowRunId: 'run-1',
        sourceSessionId: 's1',
        triggerStatus: 'completed',
        outcome: 'skipped-disarmed' as never,
      })

      expect(service.hasFiredInFlowRun(relay.id, 'run-1')).toBe(false)
    })

    it('counts a spawn as this wire having fired', () => {
      const relay = createRelay()
      service.appendHop({
        relayId: relay.id,
        crewId: 'c1',
        flowRunId: 'run-spawn',
        sourceSessionId: 's1',
        spawnedSessionId: 's3',
        triggerStatus: 'completed',
        outcome: 'spawned',
      })

      expect(service.hasFiredInFlowRun(relay.id, 'run-spawn')).toBe(true)
    })

    it('charges only the hops that spent a provider turn', () => {
      const relay = createRelay()
      const outcomes = [
        'delivered',
        'queued',
        'skipped-failed',
        'skipped-budget',
        'error',
      ] as const
      for (const outcome of outcomes) {
        service.appendHop({
          relayId: relay.id,
          crewId: 'c1',
          flowRunId: 'run-1',
          sourceSessionId: 's1',
          triggerStatus: 'completed',
          outcome,
        })
      }

      expect(service.countBudgetedHops('run-1')).toBe(2)
      expect(service.countBudgetedHops('run-unknown')).toBe(0)
    })
  })
})
