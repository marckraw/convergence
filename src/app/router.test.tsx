import { RouterProvider } from '@tanstack/react-router'
import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { router } from './router'

vi.mock('./App.container', () => ({
  App: (props: {
    mainViewRoute?: {
      kind: string
      sessionId?: string
      workspaceId?: string | null
      spaceId?: string
      draftAttempt?: boolean
      targetId?: string | null
      mode?: string
      filePath?: string | null
    }
    onSelectCodeSession?: (sessionId: string) => void
    onBeginCodeSessionDraft?: (workspaceId: string) => void
    onOpenCodeReview?: () => void
  }) => (
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
      data-space-draft={String(props.mainViewRoute?.draftAttempt ?? false)}
      data-review-target-id={props.mainViewRoute?.targetId ?? ''}
      data-review-mode={props.mainViewRoute?.mode ?? ''}
      data-review-file={props.mainViewRoute?.filePath ?? ''}
      data-routed-navigation={props.onSelectCodeSession ? 'true' : 'false'}
      data-routed-draft={props.onBeginCodeSessionDraft ? 'true' : 'false'}
      data-routed-review={props.onOpenCodeReview ? 'true' : 'false'}
    >
      App Shell
    </div>
  ),
}))

describe('app router', () => {
  beforeEach(async () => {
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
})
