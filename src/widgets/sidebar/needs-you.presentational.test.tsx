import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { NeedsYou, buildNeedsYouSummary } from './needs-you.presentational'

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

  it('renders project context and selects attention sessions', () => {
    const onSelect = vi.fn()
    const onDismiss = vi.fn()

    render(
      <NeedsYou
        sessions={[
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
      />,
    )

    expect(screen.getByText('Needs You (1)')).toBeInTheDocument()
    expect(screen.getByText('Finished')).toBeInTheDocument()
    expect(screen.getByText('RoomFinder')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Review RoomFinder').closest('button')!)

    expect(onSelect).toHaveBeenCalledWith('session-1')
    expect(onDismiss).not.toHaveBeenCalled()
  })

  it('dismisses an item without selecting the session', () => {
    const onSelect = vi.fn()
    const onDismiss = vi.fn()

    render(
      <NeedsYou
        sessions={[
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
      />,
    )

    fireEvent.click(
      screen.getByRole('button', { name: /dismiss review roomfinder/i }),
    )

    expect(onDismiss).toHaveBeenCalledWith('session-1')
    expect(onSelect).not.toHaveBeenCalled()
  })
})
