import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Session } from '@/entities/session'
import { TooltipProvider } from '@/shared/ui/tooltip'
import {
  NeedsYou,
  buildNeedsYouSummary,
  getNeedsYouAction,
} from './needs-you.presentational'

function makeSession(overrides: Partial<Session>): Session {
  return {
    id: 'session-1',
    projectId: 'project-1',
    workspaceId: null,
    providerId: 'claude-code',
    model: 'sonnet',
    effort: 'medium' as const,
    name: 'Session',
    status: 'idle',
    attention: 'none',
    activity: null,
    contextWindow: null,
    workingDirectory: '/tmp/project-1',
    archivedAt: null,
    parentSessionId: null,
    forkStrategy: null,
    continuationToken: null,
    lastSequence: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('NeedsYou', () => {
  it('builds summaries for all meaningful attention states', () => {
    expect(
      buildNeedsYouSummary(
        makeSession({
          name: 'Approval',
          status: 'running',
          attention: 'needs-approval',
        }),
      )?.summary,
    ).toBe('Approval needed')

    expect(
      buildNeedsYouSummary(
        makeSession({
          id: 'session-2',
          name: 'Input',
          status: 'running',
          attention: 'needs-input',
        }),
      )?.summary,
    ).toBe('Input needed')

    expect(
      buildNeedsYouSummary(
        makeSession({
          id: 'session-3',
          name: 'Finished',
          status: 'completed',
          attention: 'finished',
        }),
      )?.summary,
    ).toBe('Finished')

    expect(
      buildNeedsYouSummary(
        makeSession({
          id: 'session-4',
          name: 'Failed',
          status: 'failed',
          attention: 'failed',
        }),
      )?.summary,
    ).toBe('Session failed')
  })

  it('uses snooze for active attention and acknowledge for terminal attention', () => {
    expect(
      getNeedsYouAction(
        makeSession({
          name: 'Approval',
          status: 'running',
          attention: 'needs-approval',
        }),
      ).label,
    ).toBe('Snooze')

    expect(
      getNeedsYouAction(
        makeSession({
          id: 'session-2',
          name: 'Finished',
          status: 'completed',
          attention: 'finished',
        }),
      ).label,
    ).toBe('Acknowledge')
  })

  it('renders project context and selects attention sessions', () => {
    const onSelect = vi.fn()
    const onDismiss = vi.fn()
    const onArchive = vi.fn()

    render(
      <TooltipProvider>
        <NeedsYou
          waitingSessions={[]}
          reviewSessions={[
            {
              session: makeSession({
                name: 'Review RoomFinder',
                status: 'completed',
                attention: 'finished',
              }),
              projectName: 'RoomFinder',
              summary: 'Finished',
              priority: 3,
            },
          ]}
          activeSessionId={null}
          onSelect={onSelect}
          onDismiss={onDismiss}
          onArchive={onArchive}
        />
      </TooltipProvider>,
    )

    expect(screen.getByText('Needs You (1)')).toBeInTheDocument()
    expect(screen.getByText('Needs Review')).toBeInTheDocument()
    expect(screen.getByText('Finished')).toBeInTheDocument()
    expect(screen.getByText('RoomFinder')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Review RoomFinder').closest('button')!)

    expect(onSelect).toHaveBeenCalledWith('session-1')
    expect(onDismiss).not.toHaveBeenCalled()
    expect(onArchive).not.toHaveBeenCalled()
  })

  it('renders waiting and review sections separately', () => {
    const onSelect = vi.fn()
    const onDismiss = vi.fn()
    const onArchive = vi.fn()

    render(
      <TooltipProvider>
        <NeedsYou
          waitingSessions={[
            {
              session: makeSession({
                id: 'session-2',
                projectId: 'project-2',
                name: 'Need approval',
                status: 'running',
                attention: 'needs-approval',
                workingDirectory: '/tmp/project-2',
              }),
              projectName: 'Convergence',
              summary: 'Approval needed',
              priority: 0,
            },
          ]}
          reviewSessions={[
            {
              session: makeSession({
                id: 'session-3',
                projectId: 'project-2',
                name: 'Review release notes',
                status: 'completed',
                attention: 'finished',
                workingDirectory: '/tmp/project-2',
              }),
              projectName: 'Convergence',
              summary: 'Finished',
              priority: 3,
            },
          ]}
          activeSessionId={null}
          onSelect={onSelect}
          onDismiss={onDismiss}
          onArchive={onArchive}
        />
      </TooltipProvider>,
    )

    expect(screen.getByText('Waiting on You')).toBeInTheDocument()
    expect(screen.getByText('Needs Review')).toBeInTheDocument()
  })

  it('dismisses a review item without selecting the session', () => {
    const onSelect = vi.fn()
    const onDismiss = vi.fn()
    const onArchive = vi.fn()

    render(
      <TooltipProvider>
        <NeedsYou
          waitingSessions={[]}
          reviewSessions={[
            {
              session: makeSession({
                name: 'Review RoomFinder',
                status: 'completed',
                attention: 'finished',
              }),
              projectName: 'RoomFinder',
              summary: 'Finished',
              priority: 3,
            },
          ]}
          activeSessionId={null}
          onSelect={onSelect}
          onDismiss={onDismiss}
          onArchive={onArchive}
        />
      </TooltipProvider>,
    )

    fireEvent.click(
      screen.getByRole('button', { name: /acknowledge review roomfinder/i }),
    )

    expect(onDismiss).toHaveBeenCalledWith('session-1')
    expect(onSelect).not.toHaveBeenCalled()
    expect(onArchive).not.toHaveBeenCalled()
  })

  it('archives a review item without selecting the session', () => {
    const onSelect = vi.fn()
    const onDismiss = vi.fn()
    const onArchive = vi.fn()

    render(
      <TooltipProvider>
        <NeedsYou
          waitingSessions={[]}
          reviewSessions={[
            {
              session: makeSession({
                name: 'Review RoomFinder',
                status: 'completed',
                attention: 'finished',
              }),
              projectName: 'RoomFinder',
              summary: 'Finished',
              priority: 3,
            },
          ]}
          activeSessionId={null}
          onSelect={onSelect}
          onDismiss={onDismiss}
          onArchive={onArchive}
        />
      </TooltipProvider>,
    )

    fireEvent.click(
      screen.getByRole('button', { name: /archive review roomfinder/i }),
    )

    expect(onArchive).toHaveBeenCalledWith('session-1')
    expect(onSelect).not.toHaveBeenCalled()
    expect(onDismiss).not.toHaveBeenCalled()
  })

  it('applies data-pulse to a session row when pulsingSessionIds includes its id', () => {
    render(
      <TooltipProvider>
        <NeedsYou
          waitingSessions={[]}
          reviewSessions={[
            {
              session: makeSession({
                name: 'Review RoomFinder',
                status: 'completed',
                attention: 'finished',
              }),
              projectName: 'RoomFinder',
              summary: 'Finished',
              priority: 3,
            },
          ]}
          activeSessionId={null}
          pulsingSessionIds={{ 'session-1': true }}
          onSelect={vi.fn()}
          onDismiss={vi.fn()}
          onArchive={vi.fn()}
        />
      </TooltipProvider>,
    )

    const row = screen.getByText('Review RoomFinder').closest('[data-pulse]')
    expect(row).not.toBeNull()
    expect(row).toHaveAttribute('data-pulse', 'true')
  })

  it('snoozes active needs-you items without selecting the session', () => {
    const onSelect = vi.fn()
    const onDismiss = vi.fn()
    const onArchive = vi.fn()

    render(
      <TooltipProvider>
        <NeedsYou
          waitingSessions={[
            {
              session: makeSession({
                id: 'session-2',
                projectId: 'project-2',
                name: 'Need approval',
                status: 'running',
                attention: 'needs-approval',
                workingDirectory: '/tmp/project-2',
              }),
              projectName: 'Convergence',
              summary: 'Approval needed',
              priority: 0,
            },
          ]}
          reviewSessions={[]}
          activeSessionId={null}
          onSelect={onSelect}
          onDismiss={onDismiss}
          onArchive={onArchive}
        />
      </TooltipProvider>,
    )

    fireEvent.click(
      screen.getByRole('button', { name: /snooze need approval/i }),
    )

    expect(onDismiss).toHaveBeenCalledWith('session-2')
    expect(onSelect).not.toHaveBeenCalled()
    expect(onArchive).not.toHaveBeenCalled()
  })
})
