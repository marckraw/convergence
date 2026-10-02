import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ComposerContainer } from '@/features/composer'
import { useSessionStore } from '@/entities/session'
import { useSessionRelayStore } from '@/entities/session-relay'
import { rendererPerfReport } from '@/shared/lib/usePerfProbe'
import { SessionWiresContainer } from './session-wires.container'
import {
  installComposerBridge,
  queuedInput,
  seedComposerStores,
  seedQueuedInputs,
  wireLeaving,
} from '../../../test/composer-harness'

/**
 * The composer's render budget, measured where the composer meets the
 * session's wires (MAR-3325). It mounts `ComposerContainer` beside the real
 * `SessionWiresContainer`, so it lives at the widgets layer, which may compose
 * both: a feature may not import a widget (MAR-3609, which moved it here from
 * the composer's own tests unchanged).
 */
describe('ComposerContainer under a SessionView-shaped parent', () => {
  beforeEach(() => {
    installComposerBridge()
    seedComposerStores()
  })

  /**
   * The render budget (MAR-3325, MAR-3310 F1d).
   *
   * Counted by the app's own instrument: the perf flag on, the composer's
   * `PerfProfiler` (React's `<Profiler>`) records every commit of the
   * composer root, and `rendererPerfReport()` is what S0 read. A commit is
   * anything under that root drawing again, so a child that re-renders counts
   * against it too.
   *
   * The parent below is shaped like `SessionView`: it subscribes to the open
   * conversation (so every streamed patch redraws it) and hands the composer a
   * context written inline, as Mission Control and the chat surface still do.
   * The composer must hold its own line against both.
   */
  describe('the render budget (MAR-3325)', () => {
    const OPEN_CONTEXT = {
      kind: 'project',
      projectId: 'project-1',
      workspaceId: null,
      activeSessionId: 'session-1',
    } as const

    function TranscriptStub() {
      const items = useSessionStore((s) => s.activeConversation)
      return (
        <div data-testid="transcript-stub">
          {items
            .map((item) => (item.kind === 'message' ? item.text : ''))
            .join('|')}
        </div>
      )
    }

    const wiresSlot = <SessionWiresContainer sessionId="session-1" />

    function ConversationParent({ withWires = false }) {
      // Subscribed exactly as SessionView subscribes: every patch of the open
      // conversation redraws this component.
      useSessionStore((s) => s.activeConversation)
      return (
        <>
          <TranscriptStub />
          <ComposerContainer
            context={{ ...OPEN_CONTEXT }}
            wiresSlot={withWires ? wiresSlot : undefined}
          />
        </>
      )
    }

    /** Every composer-root commit so far, as the S0 report reads it. */
    function composerCommitTotal(): number {
      return rendererPerfReport().commits.composer?.count ?? 0
    }

    interface CommitCounter {
      readonly count: number
      reset: () => void
    }

    function renderCounted(withWires = false): CommitCounter {
      render(<ConversationParent withWires={withWires} />)
      let baseline = composerCommitTotal()
      return {
        get count() {
          return composerCommitTotal() - baseline
        },
        reset: () => {
          baseline = composerCommitTotal()
        },
      }
    }

    /** Lets every mount-time async hop land, then zeroes the counter. */
    async function settle(commits: CommitCounter) {
      await act(async () => {})
      await act(async () => {})
      commits.reset()
    }

    function summary(id: string, overrides: Record<string, unknown> = {}) {
      const base = useSessionStore.getState().sessions[0]!
      return { ...base, id, name: `Session ${id}`, ...overrides } as typeof base
    }

    function agentMessage(text: string) {
      return {
        id: 'item-agent',
        sessionId: 'session-1',
        sequence: 1,
        turnId: 'turn-1',
        kind: 'message' as const,
        actor: 'assistant' as const,
        state: 'streaming' as const,
        text,
        createdAt: '2026-09-24T00:00:00.000Z',
        updatedAt: '2026-09-24T00:00:00.000Z',
        providerMeta: {
          providerId: 'claude-code',
          providerItemId: null,
          providerEventType: null,
        },
      }
    }

    beforeEach(() => {
      // The perf flag on, so `PerfProfiler` mounts a real Profiler.
      ;(
        window as unknown as { electronAPI: Record<string, unknown> }
      ).electronAPI.perf = { isEnabled: () => true, report: vi.fn() }
      useSessionStore.setState((state) => ({
        activeSessionId: 'session-1',
        activeConversationSessionId: 'session-1',
        activeConversation: [],
        currentProjectId: 'project-1',
        globalSessions: state.sessions,
      }))
    })

    it('R1 costs exactly one commit per keystroke — 20 keys, 20 commits', async () => {
      const commits = renderCounted()
      await settle(commits)
      const textbox = screen.getByPlaceholderText('Send a follow-up...')

      for (let i = 1; i <= 20; i += 1) {
        fireEvent.change(textbox, { target: { value: 'x'.repeat(i) } })
      }

      expect(textbox).toHaveValue('x'.repeat(20))
      expect(commits.count).toBe(20)
    })

    it.each([false, true])(
      'R2 30 summaries of another conversation draw nothing (real wires slot: %s) — mutation subscribe to the whole sessions list turns red',
      async (withWires) => {
        useSessionRelayStore.setState({
          relays: [
            { ...wireLeaving('session-1'), targetSessionId: 'session-3' },
          ],
        })
        act(() => {
          useSessionStore.setState((state) => ({
            sessions: [...state.sessions, summary('session-2')],
            globalSessions: [
              ...state.globalSessions,
              summary('session-2'),
              summary('session-3'),
            ],
          }))
        })
        const commits = renderCounted(withWires)
        await settle(commits)
        if (withWires) {
          expect(
            screen.getByRole('button', {
              name: '1 wire fires when this session finishes.',
            }),
          ).toBeVisible()
        }

        for (let i = 1; i <= 30; i += 1) {
          act(() => {
            useSessionStore.getState().handleSessionSummaryUpdate(
              summary('session-2', {
                status: 'running',
                activity: 'streaming',
                updatedAt: `2026-09-24T00:00:${String(i).padStart(2, '0')}.000Z`,
              }),
            )
          })
        }

        // The updates landed: the store's lists moved on.
        expect(
          useSessionStore
            .getState()
            .sessions.find((entry) => entry.id === 'session-2')?.updatedAt,
        ).toBe('2026-09-24T00:00:30.000Z')
        expect(commits.count).toBe(0)
      },
    )

    it('R2 30 streamed patches of the open conversation draw nothing while the transcript receives every one — mutation drop the memo turns red', async () => {
      act(() => {
        useSessionStore.setState({ activeConversation: [agentMessage('')] })
      })
      const commits = renderCounted()
      await settle(commits)

      for (let i = 1; i <= 30; i += 1) {
        act(() => {
          useSessionStore.getState().handleConversationPatched({
            sessionId: 'session-1',
            op: 'patch',
            item: agentMessage(`token ${i}`),
          })
        })
      }

      expect(screen.getByTestId('transcript-stub')).toHaveTextContent(
        'token 30',
      )
      expect(commits.count).toBe(0)
    })

    it('R2 a summary of the open conversation that moves no copied field costs one commit, not two — mutation key the model/permission effect on the summary object turns red', async () => {
      act(() => {
        useSessionStore.setState((state) => ({
          sessions: state.sessions.map((entry) => ({
            ...entry,
            serviceTier: 'default',
            permissionConfig: { preset: 'ask' },
          })),
        }))
      })
      const commits = renderCounted()
      await settle(commits)

      for (let i = 1; i <= 10; i += 1) {
        act(() => {
          // Over IPC every summary is a new object, the permission config too.
          useSessionStore.getState().handleSessionSummaryUpdate(
            summary('session-1', {
              serviceTier: 'default',
              permissionConfig: { preset: 'ask' },
              updatedAt: `2026-09-24T00:01:${String(i).padStart(2, '0')}.000Z`,
            }),
          )
        })
      }

      expect(commits.count).toBe(10)
    })

    it('R2 the open conversation starting to run is drawn: the running placeholder and the queued follow-up appear', async () => {
      const commits = renderCounted()
      await settle(commits)
      expect(screen.getByPlaceholderText('Send a follow-up...')).toBeVisible()

      act(() => {
        useSessionStore
          .getState()
          .handleSessionSummaryUpdate(
            summary('session-1', { status: 'running', attention: 'none' }),
          )
      })

      expect(commits.count).toBeGreaterThanOrEqual(1)
      expect(screen.getByPlaceholderText('Queue a follow-up...')).toBeVisible()

      commits.reset()
      act(() => {
        seedQueuedInputs([queuedInput({})])
      })

      expect(commits.count).toBeGreaterThanOrEqual(1)
      expect(await screen.findByTestId('queued-inputs')).toHaveTextContent(
        'Waiting for the next turn',
      )
    })

    it('R2 the relay count is a number: 30 wire-list changes that leave the count alone draw nothing, arming one draws the toggle — mutation filter the relays inside the selector turns red', async () => {
      const commits = renderCounted()
      await settle(commits)

      for (let i = 1; i <= 30; i += 1) {
        act(() => {
          useSessionRelayStore.setState({
            relays: [{ ...wireLeaving('session-9'), updatedAt: `t-${i}` }],
          })
        })
      }

      expect(commits.count).toBe(0)
      expect(screen.queryByRole('button', { name: 'Send quiet' })).toBeNull()

      act(() => {
        useSessionRelayStore.setState({
          relays: [wireLeaving('session-9'), wireLeaving('session-1')],
        })
      })

      expect(commits.count).toBeGreaterThanOrEqual(1)
      expect(
        screen.getByRole('button', { name: 'Send quiet' }),
      ).toHaveAttribute('aria-pressed', 'false')
    })

    it('R3 aimed from Mission Control at a conversation of a project nobody has opened, it still continues that conversation — mutation drop the globalSessions fallback turns red', () => {
      act(() => {
        useSessionStore.setState({
          sessions: [],
          globalChatSessions: [],
          globalSessions: [
            summary('session-elsewhere', {
              projectId: 'project-unopened',
            }),
          ],
        })
      })

      render(
        <ComposerContainer
          context={{
            kind: 'project',
            projectId: 'project-unopened',
            workspaceId: null,
            activeSessionId: 'session-elsewhere',
          }}
        />,
      )

      const textbox = screen.getByPlaceholderText('Send a follow-up...')
      fireEvent.change(textbox, { target: { value: 'From the Hail' } })
      fireEvent.keyDown(textbox, { key: 'Enter', metaKey: true })

      expect(
        useSessionStore.getState().sendMessageToSession,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: 'session-elsewhere',
          text: 'From the Hail',
        }),
      )
      expect(
        useSessionStore.getState().createAndStartSession,
      ).not.toHaveBeenCalled()
    })
  })
})
