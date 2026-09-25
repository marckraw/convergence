import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { useSessionStore, type Session } from '@/entities/session'
import {
  useSessionRelayStore,
  type SessionRelay,
} from '@/entities/session-relay'
import { useProjectStore } from '@/entities/project'
import { useSkillStore } from '@/entities/skill'
import { useProjectContextStore } from '@/entities/project-context'
import { buildRelaySentence } from '@/features/mission-control'
import { SessionConversationSurface } from './session-conversation-surface.container'
import {
  countSessionWires,
  formatSessionWireSummary,
} from './session-wires.pure'

// Exercise the real surface, composer and wires; isolate unrelated transcript
// and annotation UI. All IO uses fixtures, with no provider or app access.
vi.mock('./session-transcript.container', () => ({
  SessionTranscript: () => null,
}))
vi.mock('@/features/response-annotations', () => ({
  AnnotationSelectionCapture: () => null,
  AnnotationTray: () => null,
}))
vi.mock('@/features/conversation-actions', () => ({
  conversationActionsAvailable: () => false,
  ConversationActionsContainer: () => null,
}))

const session: Session = {
  id: 'source',
  contextKind: 'global',
  projectId: null,
  workspaceId: null,
  providerId: 'claude-code',
  model: 'sonnet',
  effort: 'medium',
  name: 'Source',
  status: 'completed',
  attention: 'none',
  activity: null,
  workingDirectory: '/tmp/ch5',
  contextWindow: null,
  archivedAt: null,
  parentSessionId: null,
  forkStrategy: null,
  primarySurface: 'conversation',
  continuationToken: null,
  lastSequence: 0,
  createdAt: '2026-09-25T00:00:00.000Z',
  updatedAt: '2026-09-25T00:00:00.000Z',
}

function wire(overrides: Partial<SessionRelay> = {}): SessionRelay {
  return {
    id: 'wire',
    crewId: 'crew',
    sourceSessionId: session.id,
    trigger: 'settled',
    action: 'hail',
    targetSessionId: 'target',
    spawnSpec: null,
    instruction: null,
    opener: null,
    conditionToken: null,
    armed: true,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    ...overrides,
  }
}

function summary(relays: SessionRelay[]) {
  const { unconditional, conditional, disarmed } = countSessionWires(relays)
  return formatSessionWireSummary(unconditional, conditional, disarmed)
}

function surface(current = session) {
  return (
    <SessionConversationSurface
      session={current}
      conversationItems={[]}
      composerContext={
        current.contextKind === 'project'
          ? {
              kind: 'project',
              projectId: 'project',
              workspaceId: null,
              activeSessionId: current.id,
            }
          : { kind: 'global', activeSessionId: current.id }
      }
      onApprove={vi.fn()}
      onDeny={vi.fn()}
      onInputAnswer={vi.fn()}
    />
  )
}

beforeEach(() => {
  Object.defineProperty(window, 'electronAPI', {
    configurable: true,
    value: {
      providerAccounts: { list: vi.fn().mockResolvedValue([]) },
      turns: {
        listForSession: vi.fn().mockResolvedValue([]),
        onTurnDelta: vi.fn(() => () => {}),
      },
      providerQuota: { list: vi.fn().mockResolvedValue([]) },
      git: { getCloneableRepositoryUrl: vi.fn().mockResolvedValue(null) },
    },
  })
  useSessionStore.setState({
    sessions: [session],
    globalChatSessions: [session],
    globalSessions: [session, { ...session, id: 'target', name: 'Target' }],
    providerCatalogs: {},
    loadProviderCatalog: vi.fn(),
  })
  useProjectStore.setState({ projects: [] })
  useSkillStore.setState({ loadCatalog: vi.fn(), loadGlobalCatalog: vi.fn() })
  useProjectContextStore.setState({ loadForProject: vi.fn() })
  useSessionRelayStore.setState({ relays: [], isLoaded: true })
})

describe.each(['global', 'project'] as const)(
  'CH5 %s conversation surface',
  (contextKind) => {
    function renderSurface() {
      const current = {
        ...session,
        contextKind,
        projectId: contextKind === 'project' ? 'project' : null,
      }
      useSessionStore.setState({
        sessions: [current],
        globalChatSessions: [current],
      })
      return render(surface(current))
    }

    it('R1 places wires immediately after Send quiet', () => {
      const relays = [wire()]
      useSessionRelayStore.setState({ relays })
      renderSurface()
      expect(
        screen.getByRole('switch', { name: 'Send quiet' }).nextElementSibling,
      ).toBe(screen.getByRole('button', { name: summary(relays) }))
    })

    it('R2 keeps all-disarmed wires grey and visible without Quiet', () => {
      const relays = [wire({ armed: false })]
      useSessionRelayStore.setState({ relays })
      renderSurface()
      expect(screen.queryByRole('switch', { name: 'Send quiet' })).toBeNull()
      expect(screen.getByRole('button', { name: summary(relays) })).toHaveClass(
        'text-muted-foreground/60',
      )
    })

    it('R2 shows neither wires nor Quiet with no outgoing wires', () => {
      useSessionRelayStore.setState({
        relays: [wire({ sourceSessionId: 'another' })],
      })
      renderSurface()
      expect(screen.queryByRole('switch', { name: 'Send quiet' })).toBeNull()
      expect(screen.queryByRole('button', { name: /wire/ })).toBeNull()
    })

    it('R3 uses CH1 summaries and relay sentences, striking through disarmed wires', () => {
      const relays = [
        wire(),
        wire({ id: 'conditional', conditionToken: 'BATON: fable' }),
        wire({ id: 'off', armed: false, conditionToken: 'BATON: reviewer' }),
      ]
      useSessionRelayStore.setState({ relays })
      renderSurface()
      const trigger = screen.getByRole('button', { name: summary(relays) })
      expect(trigger).toHaveAttribute('title', summary(relays))
      fireEvent.click(trigger)
      const popover = screen.getByRole('dialog')
      for (const relay of relays) {
        const sentence = buildRelaySentence(
          relay,
          (id) => (id === 'source' ? 'Source' : 'Target'),
          () => 'a project',
        ).text
        const line = within(popover).getByText(sentence)
        if (relay.armed) expect(line).not.toHaveClass('line-through')
        else expect(line).toHaveClass('line-through')
      }
    })

    it('R4 opens a read-only popover with no arming or editing controls', () => {
      const relays = [wire()]
      useSessionRelayStore.setState({ relays })
      renderSurface()
      fireEvent.click(screen.getByRole('button', { name: summary(relays) }))
      const popover = within(screen.getByRole('dialog'))
      expect(popover.queryByRole('switch')).toBeNull()
      expect(popover.queryByRole('checkbox')).toBeNull()
      expect(popover.queryAllByRole('button')).toHaveLength(0)
    })

    it('R5 keeps the visible trigger within 12 characters and h-7', () => {
      const relays = [wire()]
      useSessionRelayStore.setState({ relays })
      renderSurface()
      const trigger = screen.getByRole('button', { name: summary(relays) })
      expect(trigger.textContent?.length).toBeLessThanOrEqual(12)
      expect(trigger).toHaveTextContent('1 wire')
      expect(trigger).toHaveClass('h-7')
    })

    it('updates the disclosure when a wire is disarmed without hiding it', () => {
      const relay = wire()
      useSessionRelayStore.setState({ relays: [relay] })
      renderSurface()
      act(() =>
        useSessionRelayStore.setState({ relays: [{ ...relay, armed: false }] }),
      )
      expect(screen.queryByRole('switch', { name: 'Send quiet' })).toBeNull()
      expect(
        screen.getByRole('button', {
          name: summary([{ ...relay, armed: false }]),
        }),
      ).toBeVisible()
    })

    it('B switches one mounted surface from A to B and shows B’s wires', () => {
      const next = {
        ...session,
        id: 'next',
        name: 'Next',
        contextKind,
        projectId: contextKind === 'project' ? 'project' : null,
      }
      const firstWires = [wire()]
      const nextWires = [
        wire({
          id: 'next-wire',
          sourceSessionId: next.id,
          armed: false,
          conditionToken: 'BATON: next',
        }),
      ]
      useSessionRelayStore.setState({ relays: [...firstWires, ...nextWires] })
      useSessionStore.setState((state) => ({
        globalSessions: [...state.globalSessions, next],
      }))
      const { rerender } = renderSurface()
      expect(
        screen.getByRole('button', { name: summary(firstWires) }),
      ).toBeVisible()

      rerender(surface(next))

      expect(
        screen.queryByRole('button', { name: summary(firstWires) }),
      ).toBeNull()
      const trigger = screen.getByRole('button', { name: summary(nextWires) })
      expect(trigger).toHaveAttribute('title', summary(nextWires))
      fireEvent.click(trigger)
      expect(
        within(screen.getByRole('dialog')).getByText(
          'Only if it ends with "BATON: next", when Next finishes, send its last message to Target',
        ),
      ).toHaveClass('line-through')
    })
  },
)
