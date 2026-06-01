import { RouterProvider } from '@tanstack/react-router'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useSessionStore } from '@/entities/session'
import { router } from './router'

const { appMounts } = vi.hoisted(() => ({
  appMounts: vi.fn(),
}))

vi.mock('./App.container', async () => {
  const React = await import('react')

  return {
    App: (props: {
      mainViewRoute?: {
        kind: string
        sessionId?: string
        workspaceId?: string | null
        spaceId?: string
        draftAttempt?: boolean
        targetId?: string | null
        mode?: string
        view?: string
        filePath?: string | null
      }
      onSelectCodeSession?: (sessionId: string) => void
      onBeginCodeSessionDraft?: (workspaceId: string) => void
      onOpenCodeReview?: () => void
      onShowCode?: () => void
      onShowCodeHome?: () => void
      onShowChat?: () => void
    }) => {
      React.useEffect(() => {
        appMounts()
      }, [])

      return (
        <>
          <div
            data-testid="app-shell"
            data-route-kind={props.mainViewRoute?.kind ?? 'home'}
            data-session-id={props.mainViewRoute?.sessionId ?? ''}
            data-workspace-id={
              'workspaceId' in (props.mainViewRoute ?? {})
                ? String(props.mainViewRoute?.workspaceId ?? '')
                : ''
            }
            data-space-id={props.mainViewRoute?.spaceId ?? ''}
            data-space-draft={String(
              props.mainViewRoute?.draftAttempt ?? false,
            )}
            data-review-target-id={props.mainViewRoute?.targetId ?? ''}
            data-review-mode={props.mainViewRoute?.mode ?? ''}
            data-review-view={props.mainViewRoute?.view ?? ''}
            data-review-file={props.mainViewRoute?.filePath ?? ''}
            data-routed-navigation={
              props.onSelectCodeSession ? 'true' : 'false'
            }
            data-routed-draft={props.onBeginCodeSessionDraft ? 'true' : 'false'}
            data-routed-review={props.onOpenCodeReview ? 'true' : 'false'}
            data-routed-show-code={props.onShowCode ? 'true' : 'false'}
            data-routed-show-code-home={props.onShowCodeHome ? 'true' : 'false'}
            data-routed-show-chat={props.onShowChat ? 'true' : 'false'}
          >
            App Shell
          </div>
          <button type="button" onClick={() => props.onShowCode?.()}>
            Show code
          </button>
          <button type="button" onClick={() => props.onShowChat?.()}>
            Show chat
          </button>
        </>
      )
    },
  }
})

describe('app router', () => {
  beforeEach(async () => {
    appMounts.mockClear()
    useSessionStore.setState({
      activeSessionId: null,
      activeGlobalSessionId: null,
    })
    await router.navigate({ to: '/', replace: true })
  })

  it('renders the existing app shell at the default route', async () => {
    render(<RouterProvider router={router} />)

    await waitFor(() => {
      expect(screen.getByTestId('app-shell')).toBeInTheDocument()
    })
    expect(screen.getByTestId('app-shell')).toHaveAttribute(
      'data-route-kind',
      'home',
    )
    expect(screen.getByTestId('app-shell')).toHaveAttribute(
      'data-routed-navigation',
      'true',
    )
    expect(screen.getByTestId('app-shell')).toHaveAttribute(
      'data-routed-review',
      'true',
    )
    expect(screen.getByTestId('app-shell')).toHaveAttribute(
      'data-routed-draft',
      'true',
    )
    expect(screen.getByTestId('app-shell')).toHaveAttribute(
      'data-routed-show-code',
      'true',
    )
    expect(screen.getByTestId('app-shell')).toHaveAttribute(
      'data-routed-show-code-home',
      'true',
    )
    expect(screen.getByTestId('app-shell')).toHaveAttribute(
      'data-routed-show-chat',
      'true',
    )
  })

  it('passes the code session route into the app shell', async () => {
    await router.navigate({
      to: '/code/sessions/$sessionId',
      params: { sessionId: 'session-1' },
    })

    render(<RouterProvider router={router} />)

    await waitFor(() => {
      expect(screen.getByTestId('app-shell')).toHaveAttribute(
        'data-route-kind',
        'code-session',
      )
    })
    expect(screen.getByTestId('app-shell')).toHaveAttribute(
      'data-session-id',
      'session-1',
    )
  })

  it('passes the code review route into the app shell', async () => {
    await router.navigate({
      to: '/code/review',
      search: {
        targetId: 'session:session-1',
        mode: 'base-branch',
        view: 'diff',
        file: 'src/app.ts',
      },
    })

    render(<RouterProvider router={router} />)

    await waitFor(() => {
      expect(screen.getByTestId('app-shell')).toHaveAttribute(
        'data-route-kind',
        'code-review',
      )
    })
    expect(screen.getByTestId('app-shell')).toHaveAttribute(
      'data-review-target-id',
      'session:session-1',
    )
    expect(screen.getByTestId('app-shell')).toHaveAttribute(
      'data-review-mode',
      'base-branch',
    )
    expect(screen.getByTestId('app-shell')).toHaveAttribute(
      'data-review-view',
      'diff',
    )
    expect(screen.getByTestId('app-shell')).toHaveAttribute(
      'data-review-file',
      'src/app.ts',
    )
  })

  it('passes the new code session route into the app shell', async () => {
    await router.navigate({
      to: '/code/sessions/new',
      search: { workspaceId: 'workspace-1' },
    })

    render(<RouterProvider router={router} />)

    await waitFor(() => {
      expect(screen.getByTestId('app-shell')).toHaveAttribute(
        'data-route-kind',
        'new-code-session',
      )
    })
    expect(screen.getByTestId('app-shell')).toHaveAttribute(
      'data-workspace-id',
      'workspace-1',
    )
  })

  it('passes the chat home route into the app shell', async () => {
    await router.navigate({ to: '/chat' })

    render(<RouterProvider router={router} />)

    await waitFor(() => {
      expect(screen.getByTestId('app-shell')).toHaveAttribute(
        'data-route-kind',
        'chat-home',
      )
    })
  })

  it('passes the chat session route into the app shell', async () => {
    await router.navigate({
      to: '/chat/session/$sessionId',
      params: { sessionId: 'chat-1' },
    })

    render(<RouterProvider router={router} />)

    await waitFor(() => {
      expect(screen.getByTestId('app-shell')).toHaveAttribute(
        'data-route-kind',
        'chat-session',
      )
    })
    expect(screen.getByTestId('app-shell')).toHaveAttribute(
      'data-session-id',
      'chat-1',
    )
  })

  it('passes the chat space route into the app shell', async () => {
    await router.navigate({
      to: '/chat/space/$spaceId',
      params: { spaceId: 'space-1' },
      search: { draft: true },
    })

    render(<RouterProvider router={router} />)

    await waitFor(() => {
      expect(screen.getByTestId('app-shell')).toHaveAttribute(
        'data-route-kind',
        'chat-space',
      )
    })
    expect(screen.getByTestId('app-shell')).toHaveAttribute(
      'data-space-id',
      'space-1',
    )
    expect(screen.getByTestId('app-shell')).toHaveAttribute(
      'data-space-draft',
      'true',
    )
  })

  it('keeps the app shell mounted while navigating between main views', async () => {
    render(<RouterProvider router={router} />)

    await waitFor(() => {
      expect(screen.getByTestId('app-shell')).toHaveAttribute(
        'data-route-kind',
        'home',
      )
    })
    expect(appMounts).toHaveBeenCalledTimes(1)

    await router.navigate({
      to: '/code/sessions/$sessionId',
      params: { sessionId: 'session-1' },
    })
    await waitFor(() => {
      expect(screen.getByTestId('app-shell')).toHaveAttribute(
        'data-route-kind',
        'code-session',
      )
    })

    await router.navigate({
      to: '/code/review',
      search: {
        targetId: null,
        mode: 'working-tree',
        view: 'guide',
        file: null,
      },
    })
    await waitFor(() => {
      expect(screen.getByTestId('app-shell')).toHaveAttribute(
        'data-route-kind',
        'code-review',
      )
    })

    await router.navigate({
      to: '/chat/session/$sessionId',
      params: { sessionId: 'chat-1' },
    })
    await waitFor(() => {
      expect(screen.getByTestId('app-shell')).toHaveAttribute(
        'data-route-kind',
        'chat-session',
      )
    })

    expect(appMounts).toHaveBeenCalledTimes(1)
  })

  it('routes the code surface switch to the active code session', async () => {
    useSessionStore.setState({ activeSessionId: 'code-1' })
    await router.navigate({ to: '/chat' })

    render(<RouterProvider router={router} />)

    await waitFor(() => {
      expect(screen.getByTestId('app-shell')).toHaveAttribute(
        'data-route-kind',
        'chat-home',
      )
    })

    fireEvent.click(screen.getByRole('button', { name: 'Show code' }))

    await waitFor(() => {
      expect(screen.getByTestId('app-shell')).toHaveAttribute(
        'data-route-kind',
        'code-session',
      )
    })
    expect(screen.getByTestId('app-shell')).toHaveAttribute(
      'data-session-id',
      'code-1',
    )
  })

  it('routes the chat surface switch to the active chat session', async () => {
    useSessionStore.setState({ activeGlobalSessionId: 'chat-1' })
    await router.navigate({
      to: '/code/sessions/$sessionId',
      params: { sessionId: 'code-1' },
    })

    render(<RouterProvider router={router} />)

    await waitFor(() => {
      expect(screen.getByTestId('app-shell')).toHaveAttribute(
        'data-route-kind',
        'code-session',
      )
    })

    fireEvent.click(screen.getByRole('button', { name: 'Show chat' }))

    await waitFor(() => {
      expect(screen.getByTestId('app-shell')).toHaveAttribute(
        'data-route-kind',
        'chat-session',
      )
    })
    expect(screen.getByTestId('app-shell')).toHaveAttribute(
      'data-session-id',
      'chat-1',
    )
  })

  it('replaces unknown routes with the welcome route', async () => {
    await router.navigate({ to: '/missing-route' as never })

    render(<RouterProvider router={router} />)

    await waitFor(() => {
      expect(screen.getByTestId('app-shell')).toHaveAttribute(
        'data-route-kind',
        'home',
      )
    })
  })
})
