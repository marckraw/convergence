import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/shared/ui/tooltip'
import {
  NeedsYou,
  buildNeedsYouSummary,
  getNeedsYouAction,
} from './needs-you.presentational'

describe('NeedsYou', () => {
  it('builds summaries for all meaningful attention states', () => {
    expect(
      buildNeedsYouSummary({
        id: 'session-1',
        projectId: 'project-1',
        workspaceId: null,
        providerId: 'claude-code',
        model: 'sonnet',
        effort: 'medium',
        name: 'Approval',
        status: 'running',
        attention: 'needs-approval',
        workingDirectory: '/tmp/project-1',
        transcript: [],
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      })?.summary,
    ).toBe('Approval needed')

    expect(
      buildNeedsYouSummary({
        id: 'session-2',
        projectId: 'project-1',
        workspaceId: null,
        providerId: 'claude-code',
        model: 'sonnet',
        effort: 'medium',
        name: 'Input',
        status: 'running',
        attention: 'needs-input',
        workingDirectory: '/tmp/project-1',
        transcript: [],
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      })?.summary,
    ).toBe('Input needed')

    expect(
      buildNeedsYouSummary({
        id: 'session-3',
        projectId: 'project-1',
        workspaceId: null,
        providerId: 'claude-code',
        model: 'sonnet',
        effort: 'medium',
        name: 'Finished',
        status: 'completed',
        attention: 'finished',
        workingDirectory: '/tmp/project-1',
        transcript: [],
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      })?.summary,
    ).toBe('Finished')

    expect(
      buildNeedsYouSummary({
        id: 'session-4',
        projectId: 'project-1',
        workspaceId: null,
        providerId: 'claude-code',
        model: 'sonnet',
        effort: 'medium',
        name: 'Failed',
        status: 'failed',
        attention: 'failed',
        workingDirectory: '/tmp/project-1',
        transcript: [],
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      })?.summary,
    ).toBe('Session failed')
  })

  it('uses snooze for active attention and acknowledge for terminal attention', () => {
    expect(
      getNeedsYouAction({
        id: 'session-1',
        projectId: 'project-1',
        workspaceId: null,
        providerId: 'claude-code',
        model: 'sonnet',
        effort: 'medium',
        name: 'Approval',
        status: 'running',
        attention: 'needs-approval',
        workingDirectory: '/tmp/project-1',
        transcript: [],
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      }).label,
    ).toBe('Snooze')

    expect(
      getNeedsYouAction({
        id: 'session-2',
        projectId: 'project-1',
        workspaceId: null,
        providerId: 'claude-code',
        model: 'sonnet',
        effort: 'medium',
        name: 'Finished',
        status: 'completed',
        attention: 'finished',
        workingDirectory: '/tmp/project-1',
        transcript: [],
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      }).label,
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
              session: {
                id: 'session-1',
                projectId: 'project-1',
                workspaceId: null,
                providerId: 'claude-code',
                model: 'sonnet',
                effort: 'medium',
                name: 'Review RoomFinder',
                status: 'completed',
                attention: 'finished',
                workingDirectory: '/tmp/project-1',
                transcript: [],
                createdAt: '2026-01-01T00:00:00.000Z',
                updatedAt: '2026-01-01T00:00:00.000Z',
              },
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
              session: {
                id: 'session-2',
                projectId: 'project-2',
                workspaceId: null,
                providerId: 'claude-code',
                model: 'sonnet',
                effort: 'medium',
                name: 'Need approval',
                status: 'running',
                attention: 'needs-approval',
                workingDirectory: '/tmp/project-2',
                transcript: [],
                createdAt: '2026-01-01T00:00:00.000Z',
                updatedAt: '2026-01-01T00:00:00.000Z',
              },
              projectName: 'Convergence',
              summary: 'Approval needed',
              priority: 0,
            },
          ]}
          reviewSessions={[
            {
              session: {
                id: 'session-3',
                projectId: 'project-2',
                workspaceId: null,
                providerId: 'claude-code',
                model: 'sonnet',
                effort: 'medium',
                name: 'Review release notes',
                status: 'completed',
                attention: 'finished',
                workingDirectory: '/tmp/project-2',
                transcript: [],
                createdAt: '2026-01-01T00:00:00.000Z',
                updatedAt: '2026-01-01T00:00:00.000Z',
              },
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
              session: {
                id: 'session-1',
                projectId: 'project-1',
                workspaceId: null,
                providerId: 'claude-code',
                model: 'sonnet',
                effort: 'medium',
                name: 'Review RoomFinder',
                status: 'completed',
                attention: 'finished',
                workingDirectory: '/tmp/project-1',
                transcript: [],
                createdAt: '2026-01-01T00:00:00.000Z',
                updatedAt: '2026-01-01T00:00:00.000Z',
              },
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
              session: {
                id: 'session-1',
                projectId: 'project-1',
                workspaceId: null,
                providerId: 'claude-code',
                model: 'sonnet',
                effort: 'medium',
                name: 'Review RoomFinder',
                status: 'completed',
                attention: 'finished',
                workingDirectory: '/tmp/project-1',
                transcript: [],
                createdAt: '2026-01-01T00:00:00.000Z',
                updatedAt: '2026-01-01T00:00:00.000Z',
              },
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

  it('snoozes active needs-you items without selecting the session', () => {
    const onSelect = vi.fn()
    const onDismiss = vi.fn()
    const onArchive = vi.fn()

    render(
      <TooltipProvider>
        <NeedsYou
          waitingSessions={[
            {
              session: {
                id: 'session-2',
                projectId: 'project-2',
                workspaceId: null,
                providerId: 'claude-code',
                model: 'sonnet',
                effort: 'medium',
                name: 'Need approval',
                status: 'running',
                attention: 'needs-approval',
                workingDirectory: '/tmp/project-2',
                transcript: [],
                createdAt: '2026-01-01T00:00:00.000Z',
                updatedAt: '2026-01-01T00:00:00.000Z',
              },
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
