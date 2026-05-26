import { describe, expect, it } from 'vitest'
import { routeMatchToMainViewRoute } from './route-state.pure'

function routeMatch(
  routeId: string,
  params: Record<string, unknown> = {},
  search: Record<string, unknown> = {},
) {
  return { routeId, params, search }
}

describe('routeMatchToMainViewRoute', () => {
  it('falls back to home when no route match is active', () => {
    expect(routeMatchToMainViewRoute(null)).toEqual({ kind: 'home' })
  })

  it('maps code session routes', () => {
    expect(
      routeMatchToMainViewRoute(
        routeMatch('/code/sessions/$sessionId', { sessionId: 'session-1' }),
      ),
    ).toEqual({ kind: 'code-session', sessionId: 'session-1' })
  })

  it('maps new code session routes with optional workspace search', () => {
    expect(
      routeMatchToMainViewRoute(
        routeMatch('/code/sessions/new', {}, { workspaceId: 'workspace-1' }),
      ),
    ).toEqual({ kind: 'new-code-session', workspaceId: 'workspace-1' })
  })

  it('maps code review routes with canonical search state', () => {
    expect(
      routeMatchToMainViewRoute(
        routeMatch(
          '/code/review',
          {},
          {
            targetId: 'target-1',
            mode: 'base-branch',
            file: 'src/app.ts',
          },
        ),
      ),
    ).toEqual({
      kind: 'code-review',
      targetId: 'target-1',
      mode: 'base-branch',
      filePath: 'src/app.ts',
    })
  })

  it('maps chat routes', () => {
    expect(routeMatchToMainViewRoute(routeMatch('/chat/'))).toEqual({
      kind: 'chat-home',
    })
    expect(
      routeMatchToMainViewRoute(
        routeMatch('/chat/session/$sessionId', { sessionId: 'chat-1' }),
      ),
    ).toEqual({ kind: 'chat-session', sessionId: 'chat-1' })
    expect(
      routeMatchToMainViewRoute(
        routeMatch(
          '/chat/space/$spaceId',
          { spaceId: 'space-1' },
          { draft: true },
        ),
      ),
    ).toEqual({ kind: 'chat-space', spaceId: 'space-1', draftAttempt: true })
  })
})
