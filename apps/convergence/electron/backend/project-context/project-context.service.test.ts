import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { closeDatabase, getDatabase, resetDatabase } from '../database/database'
import { ProjectContextService } from './project-context.service'

describe('ProjectContextService', () => {
  let service: ProjectContextService

  beforeEach(() => {
    const db = getDatabase()
    service = new ProjectContextService(db)
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
      "INSERT INTO sessions (id, project_id, provider_id, name, working_directory) VALUES ('s2', 'p1', 'codex', 's2', '/tmp/p1')",
    ).run()
  })

  afterEach(() => {
    closeDatabase()
    resetDatabase()
  })

  it('creates and lists items scoped to a project', () => {
    const a = service.create({
      projectId: 'p1',
      label: 'monorepo',
      body: 'See ~/work/monorepo',
      reinjectMode: 'boot',
    })
    const b = service.create({
      projectId: 'p1',
      label: null,
      body: 'no label',
      reinjectMode: 'every-turn',
    })
    service.create({
      projectId: 'p2',
      label: 'other',
      body: 'other project',
      reinjectMode: 'boot',
    })

    const items = service.list('p1')
    expect(items.map((i) => i.id).sort()).toEqual([a.id, b.id].sort())
    const monorepo = items.find((i) => i.id === a.id)
    expect(monorepo?.reinjectMode).toBe('boot')
    expect(monorepo?.label).toBe('monorepo')
    const unlabelled = items.find((i) => i.id === b.id)
    expect(unlabelled?.label).toBeNull()
    expect(unlabelled?.reinjectMode).toBe('every-turn')
  })

  it('trims whitespace and treats whitespace-only labels as null', () => {
    const item = service.create({
      projectId: 'p1',
      label: '   ',
      body: '   body   ',
      reinjectMode: 'boot',
    })
    expect(item.label).toBeNull()
    expect(item.body).toBe('body')
  })

  it('rejects empty bodies on create and update', () => {
    expect(() =>
      service.create({
        projectId: 'p1',
        body: '   ',
        reinjectMode: 'boot',
      }),
    ).toThrow(/body cannot be empty/i)

    const item = service.create({
      projectId: 'p1',
      body: 'ok',
      reinjectMode: 'boot',
    })
    expect(() => service.update(item.id, { body: ' ' })).toThrow(
      /body cannot be empty/i,
    )
  })

  it('updates fields independently and bumps updated_at', () => {
    const item = service.create({
      projectId: 'p1',
      label: 'first',
      body: 'first body',
      reinjectMode: 'boot',
    })
    const initialUpdatedAt = item.updatedAt

    const updated = service.update(item.id, {
      body: 'second body',
      reinjectMode: 'every-turn',
    })

    expect(updated.label).toBe('first')
    expect(updated.body).toBe('second body')
    expect(updated.reinjectMode).toBe('every-turn')
    expect(updated.updatedAt >= initialUpdatedAt).toBe(true)
  })

  it('clears the label when patch.label is null', () => {
    const item = service.create({
      projectId: 'p1',
      label: 'will-go',
      body: 'body',
      reinjectMode: 'boot',
    })
    const updated = service.update(item.id, { label: null })
    expect(updated.label).toBeNull()
  })

  it('throws on update for an unknown id', () => {
    expect(() => service.update('does-not-exist', { body: 'x' })).toThrow(
      /not found/i,
    )
  })

  it('deletes an item', () => {
    const item = service.create({
      projectId: 'p1',
      body: 'goodbye',
      reinjectMode: 'boot',
    })
    service.delete(item.id)
    expect(service.getById(item.id)).toBeNull()
    expect(service.list('p1')).toEqual([])
  })

  it('cascades item deletion when its project is deleted', () => {
    const item = service.create({
      projectId: 'p1',
      body: 'will be cascaded',
      reinjectMode: 'boot',
    })
    const db = getDatabase()
    db.prepare('DELETE FROM projects WHERE id = ?').run('p1')
    expect(service.getById(item.id)).toBeNull()
  })

  it('attachToSession replaces the existing attachment set in stable order', () => {
    const a = service.create({
      projectId: 'p1',
      label: 'a',
      body: 'a',
      reinjectMode: 'boot',
    })
    const b = service.create({
      projectId: 'p1',
      label: 'b',
      body: 'b',
      reinjectMode: 'every-turn',
    })
    const c = service.create({
      projectId: 'p1',
      label: 'c',
      body: 'c',
      reinjectMode: 'boot',
    })

    service.attachToSession('s1', [a.id, b.id])
    expect(service.listForSession('s1').map((i) => i.id)).toEqual([a.id, b.id])

    service.attachToSession('s1', [c.id, a.id])
    expect(service.listForSession('s1').map((i) => i.id)).toEqual([c.id, a.id])

    service.attachToSession('s1', [])
    expect(service.listForSession('s1')).toEqual([])
  })

  it('attachToSession throws when the session does not exist', () => {
    const item = service.create({
      projectId: 'p1',
      body: 'b',
      reinjectMode: 'boot',
    })
    expect(() => service.attachToSession('does-not-exist', [item.id])).toThrow(
      /Session not found/,
    )
  })

  it('attachToSession throws when an item id does not exist', () => {
    expect(() => service.attachToSession('s1', ['missing-id'])).toThrow(
      /context item not found/i,
    )
  })

  it('listForSession returns items joined and ordered by sort_order', () => {
    const a = service.create({
      projectId: 'p1',
      label: 'a',
      body: 'a-body',
      reinjectMode: 'boot',
    })
    const b = service.create({
      projectId: 'p1',
      label: 'b',
      body: 'b-body',
      reinjectMode: 'every-turn',
    })
    service.attachToSession('s1', [b.id, a.id])

    const items = service.listForSession('s1')
    expect(items.map((i) => i.label)).toEqual(['b', 'a'])
    expect(items.map((i) => i.body)).toEqual(['b-body', 'a-body'])
  })

  it('different sessions can hold different attachment sets', () => {
    const a = service.create({
      projectId: 'p1',
      body: 'a',
      reinjectMode: 'boot',
    })
    const b = service.create({
      projectId: 'p1',
      body: 'b',
      reinjectMode: 'boot',
    })
    service.attachToSession('s1', [a.id])
    service.attachToSession('s2', [b.id])
    expect(service.listForSession('s1').map((i) => i.id)).toEqual([a.id])
    expect(service.listForSession('s2').map((i) => i.id)).toEqual([b.id])
  })

  it('rejects create against a missing project', () => {
    expect(() =>
      service.create({
        projectId: 'no-such-project',
        body: 'b',
        reinjectMode: 'boot',
      }),
    ).toThrow(/Project not found/)
  })
})
