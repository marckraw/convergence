import { describe, expect, it } from 'vitest'
import type {
  SessionPermissionConfig,
  SessionSummary,
} from '@/entities/session'
import {
  findComposerSession,
  sameComposerContext,
  sessionPermissionConfigFromKey,
  sessionPermissionConfigKey,
} from './composer-session.pure'

function summary(id: string): SessionSummary {
  return { id, name: id } as SessionSummary
}

describe('findComposerSession', () => {
  const scopedOne = summary('one')
  const chatOne = summary('one')
  const globalOne = summary('one')
  const globalOnly = summary('elsewhere')
  const lists = {
    sessions: [scopedOne],
    globalChatSessions: [chatOne],
    globalSessions: [globalOne, globalOnly],
  }

  it('returns the stored summary from the list the context scopes, before globalSessions', () => {
    expect(findComposerSession(lists, 'project', 'one')).toBe(scopedOne)
    expect(findComposerSession(lists, 'global', 'one')).toBe(chatOne)
  })

  it('falls back to globalSessions for a Session in a project nobody has opened', () => {
    expect(findComposerSession(lists, 'project', 'elsewhere')).toBe(globalOnly)
    expect(findComposerSession(lists, 'global', 'elsewhere')).toBe(globalOnly)
  })

  it('answers undefined with no aim or an unknown id', () => {
    expect(findComposerSession(lists, 'project', null)).toBeUndefined()
    expect(findComposerSession(lists, 'project', 'missing')).toBeUndefined()
  })

  it('keeps its answer by reference when another summary in the list is replaced', () => {
    const before = findComposerSession(lists, 'project', 'one')
    const next = {
      ...lists,
      sessions: [scopedOne, summary('two')],
      globalSessions: [globalOne, summary('elsewhere')],
    }
    expect(findComposerSession(next, 'project', 'one')).toBe(before)
  })
})

describe('sessionPermissionConfigKey / sessionPermissionConfigFromKey', () => {
  const configs: SessionPermissionConfig[] = [
    { preset: 'ask' },
    { preset: 'yolo' },
    {
      preset: 'custom',
      codex: { approvalPolicy: 'on-request', sandbox: 'workspace-write' },
    },
    { preset: 'custom', claudeCode: { permissionMode: 'acceptEdits' } },
    {
      preset: 'custom',
      codex: { approvalPolicy: 'never', sandbox: 'danger-full-access' },
      claudeCode: { permissionMode: 'plan' },
    },
  ]

  it('round-trips every config shape field for field', () => {
    for (const config of configs) {
      expect(
        sessionPermissionConfigFromKey(sessionPermissionConfigKey(config)),
      ).toEqual(config)
    }
  })

  it('gives two objects with the same fields the same key, whatever their key order', () => {
    const a: SessionPermissionConfig = {
      preset: 'custom',
      codex: { approvalPolicy: 'untrusted', sandbox: 'read-only' },
    }
    const b = {
      codex: { sandbox: 'read-only', approvalPolicy: 'untrusted' },
      preset: 'custom',
    } as SessionPermissionConfig
    expect(sessionPermissionConfigKey(b)).toBe(sessionPermissionConfigKey(a))
  })

  it('gives different configs different keys', () => {
    const keys = configs.map(sessionPermissionConfigKey)
    expect(new Set(keys).size).toBe(configs.length)
    expect(
      sessionPermissionConfigKey({
        preset: 'custom',
        codex: { approvalPolicy: 'never', sandbox: 'read-only' },
      }),
    ).not.toBe(
      sessionPermissionConfigKey({
        preset: 'custom',
        codex: { approvalPolicy: 'never', sandbox: 'workspace-write' },
      }),
    )
  })

  it('keys a session that recorded no config as null, and rebuilds nothing from it', () => {
    expect(sessionPermissionConfigKey(undefined)).toBeNull()
    expect(sessionPermissionConfigKey(null)).toBeNull()
    expect(sessionPermissionConfigFromKey(null)).toBeNull()
  })
})

describe('sameComposerContext', () => {
  const project = {
    kind: 'project',
    projectId: 'p1',
    workspaceId: null,
    activeSessionId: 's1',
  } as const

  it('is true for two inline copies of the same aim', () => {
    expect(sameComposerContext({ ...project }, { ...project })).toBe(true)
    expect(
      sameComposerContext(
        { kind: 'global', activeSessionId: 's1' },
        { kind: 'global', activeSessionId: 's1' },
      ),
    ).toBe(true)
  })

  it('is false when any field of the aim moves', () => {
    expect(
      sameComposerContext(project, { ...project, activeSessionId: 's2' }),
    ).toBe(false)
    expect(sameComposerContext(project, { ...project, projectId: 'p2' })).toBe(
      false,
    )
    expect(
      sameComposerContext(project, { ...project, workspaceId: 'w1' }),
    ).toBe(false)
    expect(
      sameComposerContext(project, { kind: 'global', activeSessionId: 's1' }),
    ).toBe(false)
  })
})
