import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { closeDatabase, getDatabase, resetDatabase } from '../database/database'
import { CrewService } from './crew.service'
import { DEFAULT_CREW_MEMBER_SEAT } from './crew.types'

describe('CrewService', () => {
  let service: CrewService

  beforeEach(() => {
    const db = getDatabase()
    service = new CrewService(db)
    db.prepare(
      "INSERT INTO projects (id, name, repository_path) VALUES ('p1', 'p1', '/tmp/p1')",
    ).run()
    db.prepare(
      "INSERT INTO projects (id, name, repository_path) VALUES ('p2', 'p2', '/tmp/p2')",
    ).run()
    db.prepare(
      "INSERT INTO sessions (id, project_id, provider_id, name, working_directory) VALUES ('s1', 'p1', 'codex', 's1', '/tmp/p1')",
    ).run()
    db.prepare(
      "INSERT INTO sessions (id, project_id, provider_id, name, working_directory) VALUES ('s2', 'p2', 'claude-code', 's2', '/tmp/p2')",
    ).run()
  })

  afterEach(() => {
    closeDatabase()
    resetDatabase()
  })

  /**
   * One seat, one crew (R2; constitution §6.6). Yesterday a conversation wired
   * into two crews answered another mastermind's brief, and nothing in the app
   * could see it.
   */
  it('refuses a conversation that already sits in another crew, and names it', () => {
    const night = service.create({ name: 'Night shift', sessionIds: ['s1'] })
    const day = service.create({ name: 'Day shift' })

    // Mutation: drop `refuseSecondCrew` -> the throw is the index's, which
    // cannot say WHICH crew already holds it, and this assertion is red.
    expect(() => service.addMember(day.id, 's1')).toThrow(
      'This conversation is already in the crew "Night shift"',
    )
    expect(service.getById(day.id)!.sessionIds).toEqual([])
    expect(service.getById(night.id)!.sessionIds).toEqual(['s1'])
  })

  it('R10 stores trimmed absolute paths, refuses relative paths without losing the saved value, and clears empty paths', () => {
    const crew = service.create({ name: 'Lane crew', sessionIds: ['s1'] })
    expect(crew.members[0].lanePath).toBeNull()
    const ref = { sessionId: 's1' }
    expect(
      service.setMemberSeat(crew.id, ref, { lanePath: '  /tmp/horse  ' })
        .members[0].lanePath,
    ).toBe('/tmp/horse')
    expect(() =>
      service.setMemberSeat(crew.id, ref, { lanePath: '../horse' }),
    ).toThrow('A worktree path must be absolute')
    expect(service.getById(crew.id)!.members[0].lanePath).toBe('/tmp/horse')
    expect(
      service.setMemberSeat(crew.id, ref, { lanePath: '  ' }).members[0]
        .lanePath,
    ).toBeNull()
  })

  it('lets the same crew re-add a member it already has', () => {
    const crew = service.create({ name: 'Night shift', sessionIds: ['s1'] })

    expect(() => service.addMember(crew.id, 's1')).not.toThrow()
    expect(service.getById(crew.id)!.sessionIds).toEqual(['s1'])
  })

  it('reads a seat nobody has described as horse · resident · 1', () => {
    const crew = service.create({ name: 'Night shift', sessionIds: ['s1'] })

    expect(crew.members[0]).toMatchObject({
      role: 'horse',
      kind: 'resident',
      wipLimit: 1,
      roleCard: null,
      hostPolicy: null,
      lanePolicy: null,
      providerId: null,
      model: null,
    })
  })

  it('stores what a seat is, one field at a time, and leaves the rest alone', () => {
    const crew = service.create({ name: 'Night shift', sessionIds: ['s1'] })

    service.setMemberSeat(
      crew.id,
      { sessionId: 's1' },
      {
        role: 'reviewer',
        roleCard: '  You read blind.  ',
        wipLimit: 3,
        lanePolicy: 'own-worktree',
        hostPolicy: 'little-monster',
      },
    )
    const seated = service.setMemberSeat(
      crew.id,
      { sessionId: 's1' },
      { wipLimit: 2 },
    )

    expect(seated.members[0]).toMatchObject({
      role: 'reviewer',
      kind: 'resident',
      roleCard: 'You read blind.',
      wipLimit: 2,
      lanePolicy: 'own-worktree',
      hostPolicy: 'little-monster',
    })
  })

  it('refuses a word no seat could have meant rather than defaulting it', () => {
    const crew = service.create({ name: 'Night shift', sessionIds: ['s1'] })

    expect(() =>
      service.setMemberSeat(
        crew.id,
        { sessionId: 's1' },
        { role: 'general' as never },
      ),
    ).toThrow('A crew member role must be one of')
    expect(service.getById(crew.id)!.members[0]!.role).toBe('horse')
  })

  /**
   * A dynamic seat is a recipe: no conversation until a wire spawns one (R3).
   * It is addressed by its baton name, the only name it has.
   */
  it('seats a recipe with no conversation and finds it by its baton name', () => {
    const crew = service.create({ name: 'Night shift', sessionIds: ['s1'] })

    const seated = service.addRecipeMember(crew.id, {
      batonName: 'errand',
      providerId: 'codex',
      model: 'gpt-6-astra',
      hostPolicy: 'little-monster',
      roleCard: 'You are an errand.',
      role: 'horse',
    })

    // The recipe is a member and is NOT a conversation: every existing reader
    // of `sessionIds` means "the conversations in this crew".
    expect(seated.sessionIds).toEqual(['s1'])
    expect(seated.members).toHaveLength(2)
    const recipe = service.findMemberByBatonName(crew.id, 'errand')
    expect(recipe).toMatchObject({
      sessionId: null,
      kind: 'dynamic',
      providerId: 'codex',
      model: 'gpt-6-astra',
      hostPolicy: 'little-monster',
      roleCard: 'You are an errand.',
    })
  })

  it('refuses a recipe with no provider or host, and a name the crew already seats', () => {
    const crew = service.create({ name: 'Night shift' })
    service.addRecipeMember(crew.id, {
      batonName: 'errand',
      providerId: 'codex',
      model: null,
      hostPolicy: 'local',
    })

    expect(() =>
      service.addRecipeMember(crew.id, {
        batonName: 'second',
        providerId: '  ',
        model: null,
        hostPolicy: 'local',
      }),
    ).toThrow('A dynamic seat needs a provider and a host')
    expect(() =>
      service.addRecipeMember(crew.id, {
        batonName: 'errand',
        providerId: 'codex',
        model: null,
        hostPolicy: 'local',
      }),
    ).toThrow('This crew already has a seat named "errand"')
  })

  /**
   * A word this build does not know is not a reason to lose the crew
   * (MAR-3083 lap 2, B). It can arrive from a newer build, a hand edit or a
   * foreign writer; the WRITE door still refuses it.
   */
  it('reads a junk seat word as the default instead of throwing the surface down', () => {
    const crew = service.create({ name: 'Night shift', sessionIds: ['s1'] })
    getDatabase()
      .prepare(
        "UPDATE session_crew_members SET role = 'general' WHERE session_id = 's1'",
      )
      .run()

    // Mutation: let the read normalizer throw (lap 1) and `list()` throws --
    // every crew surface goes down for one row.
    expect(service.list()[0]!.members[0]).toMatchObject({
      sessionId: 's1',
      role: 'horse',
    })
    expect(() =>
      service.setMemberSeat(
        crew.id,
        { sessionId: 's1' },
        {
          role: 'general' as never,
        },
      ),
    ).toThrow('A crew member role must be one of')
  })

  /**
   * A recipe has no conversation, so every member-scoped write has to be able
   * to name it some other way (MAR-3083 lap 2, C). Before this, a
   * session-keyed `WHERE` matched nothing and each edit was a silent no-op.
   */
  it('edits and removes a recipe by its baton name', () => {
    const crew = service.create({ name: 'Night shift', sessionIds: ['s1'] })
    service.addRecipeMember(crew.id, {
      batonName: 'errand',
      providerId: 'codex',
      model: 'gpt-6-astra',
      hostPolicy: 'little-monster',
    })

    const edited = service.setMemberSeat(
      crew.id,
      { batonName: 'errand' },
      { roleCard: 'You are an errand.', wipLimit: 2 },
    )
    expect(
      edited.members.find((member) => member.batonName === 'errand'),
    ).toMatchObject({
      sessionId: null,
      roleCard: 'You are an errand.',
      wipLimit: 2,
    })

    // Mutation: key the UPDATE on `session_id` again and the row above is
    // unchanged; the DELETE below removes nothing.
    const removed = service.removeMember(crew.id, { batonName: 'errand' })
    expect(removed.members.map((member) => member.batonName)).toEqual([null])
  })

  /**
   * A recipe's name is a key only among rows that have no other one
   * (MAR-3083 lap 3, H). A resident's key is its conversation, and residents
   * have always been free to share a baton name.
   */
  it('addresses a recipe by name without touching a resident of the same name', () => {
    const crew = service.create({ name: 'Night shift', sessionIds: ['s1'] })
    service.setMemberBatonName(crew.id, { sessionId: 's1' }, 'errand')
    service.addRecipeMember(crew.id, {
      batonName: 'errand-seat',
      providerId: 'codex',
      model: null,
      hostPolicy: 'local',
    })
    // The recipe takes the contested name only after the resident has it, so
    // the row order is the one that used to resolve the resident first.
    getDatabase()
      .prepare(
        "UPDATE session_crew_members SET baton_name = 'errand' WHERE session_id IS NULL",
      )
      .run()

    const edited = service.setMemberSeat(
      crew.id,
      { batonName: 'errand' },
      { roleCard: 'You are an errand.' },
    )

    // Mutation: drop `session_id IS NULL` from the clause and BOTH rows carry
    // the card -- one edit changing a conversation nobody addressed.
    expect(
      edited.members.map((member) => [member.sessionId, member.roleCard]),
    ).toEqual([
      ['s1', null],
      [null, 'You are an errand.'],
    ])
    expect(service.findMemberByBatonName(crew.id, 'errand')).toMatchObject({
      sessionId: null,
    })

    const removed = service.removeMember(crew.id, { batonName: 'errand' })
    expect(removed.sessionIds).toEqual(['s1'])
  })

  it('lets residents share a name, and refuses one a recipe holds', () => {
    const crew = service.create({
      name: 'Night shift',
      sessionIds: ['s1', 's2'],
    })
    service.setMemberBatonName(crew.id, { sessionId: 's1' }, 'twin')
    service.addRecipeMember(crew.id, {
      batonName: 'errand',
      providerId: 'codex',
      model: null,
      hostPolicy: 'local',
    })

    // Two conversations may answer to one name, as they always could.
    expect(() =>
      service.setMemberBatonName(crew.id, { sessionId: 's2' }, 'twin'),
    ).not.toThrow()
    // A recipe's name is its only key: nothing else may take it.
    expect(() =>
      service.setMemberBatonName(crew.id, { sessionId: 's2' }, 'errand'),
    ).toThrow('This crew already has a seat named "errand"')
  })

  /**
   * A recipe with no name is a row nobody can reach — un-editable and
   * un-removable for good (MAR-3083 lap 3, I).
   */
  it('refuses to clear a recipe name, and the seat stays reachable', () => {
    const crew = service.create({ name: 'Night shift' })
    service.addRecipeMember(crew.id, {
      batonName: 'errand',
      providerId: 'codex',
      model: null,
      hostPolicy: 'local',
    })

    expect(() =>
      service.setMemberBatonName(crew.id, { batonName: 'errand' }, '  '),
    ).toThrow('A dynamic seat needs a baton name')

    // Mutation: allow the blank and this row can never be named, edited or
    // removed again -- the removal below is what goes red.
    expect(service.getById(crew.id)!.members[0]!.batonName).toBe('errand')
    expect(
      service.removeMember(crew.id, { batonName: 'errand' }).members,
    ).toEqual([])
  })

  /**
   * `kind` is derived, never stored truth (MAR-3083 lap 3, J): a seat is a
   * recipe exactly when it has no conversation. Flipping the column used to
   * hide the row from every read and free its only name.
   */
  it('refuses a kind that disagrees with the row, and reads the row either way', () => {
    const crew = service.create({ name: 'Night shift', sessionIds: ['s1'] })
    service.addRecipeMember(crew.id, {
      batonName: 'errand',
      providerId: 'codex',
      model: null,
      hostPolicy: 'local',
    })

    expect(() =>
      service.setMemberSeat(
        crew.id,
        { batonName: 'errand' },
        {
          kind: 'resident',
        },
      ),
    ).toThrow('a seat is dynamic exactly when it has no conversation')

    // Even a hand-edited column cannot hide it: the read derives the answer.
    getDatabase()
      .prepare(
        "UPDATE session_crew_members SET kind = 'resident' WHERE session_id IS NULL",
      )
      .run()
    // Mutation: filter the read on the column again and the recipe vanishes.
    expect(
      service.getById(crew.id)!.members.map((member) => member.kind),
    ).toEqual(['resident', 'dynamic'])
  })

  it('creates a decorated crew and appends positions', () => {
    const first = service.create({
      name: '  Night shift  ',
      emoji: '🌙',
      accentColor: ' #7c3aed ',
    })
    const second = service.create({ name: 'Reviewers' })

    expect(first.name).toBe('Night shift')
    expect(first.emoji).toBe('🌙')
    expect(first.accentColor).toBe('#7c3aed')
    expect(first.sessionIds).toEqual([])
    expect(first.position).toBe(0)
    expect(second.position).toBe(1)
    expect(service.list().map((crew) => crew.id)).toEqual([first.id, second.id])
  })

  it('creates a crew with initial members', () => {
    const crew = service.create({
      name: 'Convoy',
      sessionIds: ['s1', 's1', 's2'],
    })
    expect(crew.sessionIds).toEqual(['s1', 's2'])
  })

  it('holds sessions from different projects in one crew', () => {
    const crew = service.create({ name: 'Cross-project' })
    service.addMember(crew.id, 's1')
    const withBoth = service.addMember(crew.id, 's2')

    expect(withBoth.sessionIds).toEqual(['s1', 's2'])
  })

  /**
   * Restaged by MAR-3083 R2. This test asserted the opposite until seats
   * existed -- one session could sit in many crews -- and that is exactly the
   * shape the constitution's "one seat, one crew" retires: a shared seat
   * answers a second mastermind's brief with nobody able to see why.
   */
  it('keeps a session in the first crew that seated it', () => {
    const masterminds = service.create({ name: 'Masterminds' })
    const workers = service.create({ name: 'Workers' })
    service.addMember(masterminds.id, 's1')

    expect(() => service.addMember(workers.id, 's1')).toThrow(
      'This conversation is already in the crew "Masterminds"',
    )
    expect(service.list().map((crew) => crew.sessionIds)).toEqual([['s1'], []])
  })

  it('treats adding an existing member as a no-op', () => {
    const crew = service.create({ name: 'Convoy' })
    service.addMember(crew.id, 's1')
    const again = service.addMember(crew.id, 's1')

    expect(again.sessionIds).toEqual(['s1'])
  })

  it('removes a member without touching the session', () => {
    const db = getDatabase()
    const crew = service.create({ name: 'Convoy', sessionIds: ['s1', 's2'] })
    const after = service.removeMember(crew.id, { sessionId: 's1' })

    expect(after.sessionIds).toEqual(['s2'])
    expect(db.prepare('SELECT COUNT(*) AS count FROM sessions').get()).toEqual({
      count: 2,
    })
  })

  it('remembers where a card was dropped, and forgets it on request', () => {
    const crew = service.create({ name: 'Convoy', sessionIds: ['s1', 's2'] })

    // Nobody has arranged anything yet, and null is what says so.
    expect(crew.members).toEqual([
      {
        ...DEFAULT_CREW_MEMBER_SEAT,
        sessionId: 's1',
        batonName: null,
        canvasX: null,
        canvasY: null,
      },
      {
        ...DEFAULT_CREW_MEMBER_SEAT,
        sessionId: 's2',
        batonName: null,
        canvasX: null,
        canvasY: null,
      },
    ])

    const moved = service.setMemberPosition(crew.id, 's1', { x: 240, y: 96 })
    expect(moved.members[0]).toMatchObject({ canvasX: 240, canvasY: 96 })
    // Only the card that moved.
    expect(moved.members[1]).toMatchObject({ canvasX: null, canvasY: null })

    // Null puts it back under the automatic layout.
    const released = service.setMemberPosition(crew.id, 's1', null)
    expect(released.members[0]).toMatchObject({ canvasX: null, canvasY: null })
  })

  /**
   * A coordinate that is not a number would be written and then read back as a
   * position no layout can recover from: the card ends up off the canvas with
   * no way to find it. Null means the automatic walk, which is always
   * somewhere visible.
   */
  it('refuses a position that could not have been meant', () => {
    const crew = service.create({ name: 'Convoy', sessionIds: ['s1'] })

    // NaN and Infinity are checked separately on purpose: SQLite stores NaN
    // as NULL on its own, so only the infinity case can tell the guard from
    // the database's own behaviour.
    expect(
      service.setMemberPosition(crew.id, 's1', { x: Number.NaN, y: 10 })
        .members[0],
    ).toMatchObject({ canvasX: null, canvasY: null })

    const bad = service.setMemberPosition(crew.id, 's1', {
      x: Number.POSITIVE_INFINITY,
      y: 10,
    })

    expect(bad.members[0]).toMatchObject({ canvasX: null, canvasY: null })
  })

  it('is silent about a member this crew does not have', () => {
    const crew = service.create({ name: 'Convoy', sessionIds: ['s1'] })

    // A card dragged in a window whose membership changed under it is not an
    // error worth failing a drag over; the next crew broadcast corrects it.
    expect(() =>
      service.setMemberPosition(crew.id, 's2', { x: 1, y: 2 }),
    ).not.toThrow()
  })

  it('updates name and decoration, leaving untouched fields alone', () => {
    const crew = service.create({
      name: 'Convoy',
      emoji: '🐎',
      accentColor: 'violet',
    })
    const renamed = service.update(crew.id, { name: 'Stable' })
    expect(renamed.name).toBe('Stable')
    expect(renamed.emoji).toBe('🐎')
    expect(renamed.accentColor).toBe('violet')

    const undecorated = service.update(crew.id, {
      emoji: null,
      accentColor: null,
    })
    expect(undecorated.emoji).toBeNull()
    expect(undecorated.accentColor).toBeNull()
    expect(undecorated.name).toBe('Stable')
  })

  it('rejects a blank rename', () => {
    const crew = service.create({ name: 'Convoy' })
    expect(() => service.update(crew.id, { name: '  ' })).toThrow(
      /cannot be empty/,
    )
  })

  it('deletes memberships with the crew but never the sessions', () => {
    const db = getDatabase()
    const crew = service.create({ name: 'Convoy', sessionIds: ['s1', 's2'] })
    service.delete(crew.id)

    expect(service.list()).toEqual([])
    expect(
      db.prepare('SELECT COUNT(*) AS count FROM session_crew_members').get(),
    ).toEqual({ count: 0 })
    expect(db.prepare('SELECT COUNT(*) AS count FROM sessions').get()).toEqual({
      count: 2,
    })
  })

  it('filters members whose session no longer exists', () => {
    const db = getDatabase()
    const crew = service.create({ name: 'Convoy', sessionIds: ['s1', 's2'] })
    db.prepare("DELETE FROM sessions WHERE id = 's1'").run()

    expect(service.list()[0]?.sessionIds).toEqual(['s2'])
    expect(service.getById(crew.id)?.sessionIds).toEqual(['s2'])
  })

  /**
   * An orphan seat is shown, not hidden (MAR-3118 R10): the conversation is
   * gone, a wire may still aim at the seat, and the drawer needs a row to
   * say so and a way to remove it. Derived from the join, never stored.
   */
  it('lists a seat whose conversation was deleted, marked as missing, and removes it on request', () => {
    const db = getDatabase()
    const crew = service.create({ name: 'Convoy', sessionIds: ['s1', 's2'] })
    service.setMemberBatonName(crew.id, { sessionId: 's1' }, 'grok')
    db.prepare("DELETE FROM sessions WHERE id = 's1'").run()

    // Mutation: filter it out of the read again -> the member is gone.
    expect(
      service.list()[0]?.members.map((member) => ({
        sessionId: member.sessionId,
        batonName: member.batonName,
        conversationMissing: member.conversationMissing,
      })),
    ).toEqual([
      { sessionId: 's1', batonName: 'grok', conversationMissing: true },
      { sessionId: 's2', batonName: null, conversationMissing: false },
    ])
    // Nothing is removed automatically; removing it is the person's call.
    service.removeMember(crew.id, { sessionId: 's1' })
    expect(service.getById(crew.id)?.members.map((m) => m.sessionId)).toEqual([
      's2',
    ])
  })

  it('keeps archived sessions as valid members', () => {
    const db = getDatabase()
    const crew = service.create({ name: 'Convoy', sessionIds: ['s1'] })
    db.prepare(
      "UPDATE sessions SET archived_at = datetime('now') WHERE id = 's1'",
    ).run()

    expect(service.getById(crew.id)?.sessionIds).toEqual(['s1'])
  })

  it('throws when addressing a crew that does not exist', () => {
    expect(() => service.addMember('missing', 's1')).toThrow(/Crew not found/)
    expect(() => service.removeMember('missing', { sessionId: 's1' })).toThrow(
      /Crew not found/,
    )
    expect(() => service.update('missing', { name: 'x' })).toThrow(
      /Crew not found/,
    )
    expect(service.getById('missing')).toBeNull()
  })

  it('deleting an unknown crew is a no-op', () => {
    const crew = service.create({ name: 'Convoy' })
    service.delete('missing')
    expect(service.list().map((entry) => entry.id)).toEqual([crew.id])
  })
})

describe('MAR-3084 R3: a crew carries its tracker binding and nothing secret', () => {
  afterEach(() => {
    closeDatabase()
    resetDatabase()
  })

  it('binds with defaults, round-trips, and unbinds with null', () => {
    const service = new CrewService(getDatabase())
    const crew = service.create({ name: 'Loom' })
    expect(crew.trackerBinding).toBeNull()

    const bound = service.setTrackerBinding(crew.id, {
      projectId: 'project-1',
      wavePrefix: 'batch:',
      statusMap: { Doing: 'in-progress' },
    })
    expect(bound.trackerBinding).toEqual({
      kind: 'linear',
      projectId: 'project-1',
      labelPrefix: 'horse:',
      wavePrefix: 'batch:',
      statusMap: { Doing: 'in-progress' },
    })
    expect(service.getById(crew.id)!.trackerBinding).toEqual(
      bound.trackerBinding,
    )
    expect(service.setTrackerBinding(crew.id, null).trackerBinding).toBeNull()
  })

  it('refuses a binding without a project and leaves the crew as it was', () => {
    const service = new CrewService(getDatabase())
    const crew = service.create({ name: 'Loom' })
    service.setTrackerBinding(crew.id, { projectId: 'project-1' })
    expect(() => service.setTrackerBinding(crew.id, { projectId: '' })).toThrow(
      'project id',
    )
    expect(service.getById(crew.id)!.trackerBinding?.projectId).toBe(
      'project-1',
    )
  })
})
