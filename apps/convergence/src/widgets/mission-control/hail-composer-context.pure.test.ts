import { describe, expect, it } from 'vitest'
import type { SessionSummary } from '@/entities/session'
import { buildHailComposerContext } from './hail-composer-context.pure'

function makeSession(overrides: Partial<SessionSummary> = {}): SessionSummary {
  return {
    id: 'session-1',
    contextKind: 'project',
    projectId: 'project-1',
    workspaceId: null,
    providerId: 'claude-code',
    ...overrides,
  } as SessionSummary
}

describe('buildHailComposerContext', () => {
  it('aims the composer at a project session, in its own workspace', () => {
    expect(
      buildHailComposerContext(
        makeSession({ id: 'a', projectId: 'project-2', workspaceId: 'ws-7' }),
      ),
    ).toEqual({
      kind: 'project',
      projectId: 'project-2',
      workspaceId: 'ws-7',
      activeSessionId: 'a',
    })
  })

  it('keeps a null workspace null rather than inventing one', () => {
    expect(
      buildHailComposerContext(makeSession({ workspaceId: null })),
    ).toMatchObject({ workspaceId: null })
  })

  it('aims the composer at a chat session through the global context', () => {
    expect(
      buildHailComposerContext(
        makeSession({ id: 'chat', contextKind: 'global', projectId: null }),
      ),
    ).toEqual({ kind: 'global', activeSessionId: 'chat' })
  })

  it('falls back to the global context for a project session with no project', () => {
    expect(
      buildHailComposerContext(
        makeSession({ id: 'orphan', contextKind: 'project', projectId: null }),
      ),
    ).toEqual({ kind: 'global', activeSessionId: 'orphan' })
  })

  it('always targets the session it was given', () => {
    for (const session of [
      makeSession({ id: 'a' }),
      makeSession({ id: 'b', contextKind: 'global', projectId: null }),
    ]) {
      expect(buildHailComposerContext(session).activeSessionId).toBe(session.id)
    }
  })
})
