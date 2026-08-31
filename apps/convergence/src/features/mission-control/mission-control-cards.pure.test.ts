import { describe, expect, it } from 'vitest'
import type { SessionSummary } from '@/entities/session'
import {
  GLOBAL_SESSION_PROJECT_NAME,
  buildSessionCards,
} from './mission-control-cards.pure'

function makeSession(overrides: Partial<SessionSummary> = {}): SessionSummary {
  return {
    id: 'session-1',
    contextKind: 'project',
    projectId: 'project-1',
    workspaceId: null,
    providerId: 'claude-code',
    model: 'claude-opus-5',
    effort: null,
    name: 'Wire the room',
    status: 'idle',
    attention: 'none',
    activity: null,
    contextWindow: null,
    workingDirectory: '/repos/convergence',
    archivedAt: null,
    parentSessionId: null,
    forkStrategy: null,
    primarySurface: 'conversation',
    continuationToken: null,
    lastSequence: 0,
    createdAt: '2026-08-13T10:00:00.000Z',
    updatedAt: '2026-08-13T10:00:00.000Z',
    ...overrides,
  }
}

const PROJECTS = [
  { id: 'project-1', name: 'Convergence' },
  { id: 'project-2', name: 'Emergence' },
]

const PROVIDERS = [
  { id: 'claude-code', name: 'Claude Code', vendorLabel: 'Anthropic' },
  { id: 'codex', name: 'Codex', vendorLabel: '' },
]

describe('buildSessionCards', () => {
  it('resolves the project name for a project session', () => {
    const [card] = buildSessionCards({
      sessions: [makeSession({ projectId: 'project-2' })],
      projects: PROJECTS,
      providers: PROVIDERS,
    })

    expect(card?.projectName).toBe('Emergence')
  })

  it('names the app itself as the context for a chat session', () => {
    const [card] = buildSessionCards({
      sessions: [makeSession({ contextKind: 'global', projectId: null })],
      projects: PROJECTS,
      providers: PROVIDERS,
    })

    expect(card?.projectName).toBe(GLOBAL_SESSION_PROJECT_NAME)
  })

  it('falls back honestly when the project is gone', () => {
    const [card] = buildSessionCards({
      sessions: [makeSession({ projectId: 'project-vanished' })],
      projects: PROJECTS,
      providers: PROVIDERS,
    })

    expect(card?.projectName).toBe('Unknown project')
  })

  it('prefers the vendor label, then the provider name, then the id', () => {
    const cards = buildSessionCards({
      sessions: [
        makeSession({ id: 'a', providerId: 'claude-code' }),
        makeSession({ id: 'b', providerId: 'codex' }),
        makeSession({ id: 'c', providerId: 'pi' }),
      ],
      projects: PROJECTS,
      providers: PROVIDERS,
    })

    expect(cards.map((card) => card.providerLabel)).toEqual([
      'Anthropic',
      'Codex',
      'pi',
    ])
  })

  it('carries the live activity line onto the card', () => {
    const [card] = buildSessionCards({
      sessions: [makeSession({ status: 'running', activity: 'tool:Bash' })],
      projects: PROJECTS,
      providers: PROVIDERS,
    })

    expect(card?.activityLabel).toBe('running tool: Bash')
  })

  it('leaves archived sessions out of the room', () => {
    const cards = buildSessionCards({
      sessions: [
        makeSession({ id: 'live' }),
        makeSession({ id: 'archived', archivedAt: '2026-08-01T00:00:00.000Z' }),
      ],
      projects: PROJECTS,
      providers: PROVIDERS,
    })

    expect(cards.map((card) => card.session.id)).toEqual(['live'])
  })

  it('leaves shell sessions out of the room', () => {
    const cards = buildSessionCards({
      sessions: [
        makeSession({ id: 'agent' }),
        makeSession({ id: 'terminal', providerId: 'shell' }),
      ],
      projects: PROJECTS,
      providers: PROVIDERS,
    })

    expect(cards.map((card) => card.session.id)).toEqual(['agent'])
  })

  it('builds a lowercase haystack from card fields only', () => {
    const [card] = buildSessionCards({
      sessions: [
        makeSession({
          name: 'Wire The Room',
          status: 'running',
          activity: 'tool:Bash',
        }),
      ],
      projects: PROJECTS,
      providers: PROVIDERS,
    })

    expect(card?.searchText).toContain('wire the room')
    expect(card?.searchText).toContain('convergence')
    expect(card?.searchText).toContain('claude-code')
    expect(card?.searchText).toContain('anthropic')
    expect(card?.searchText).toContain('claude-opus-5')
    expect(card?.searchText).toContain('running')
    expect(card?.searchText).toContain('running tool: bash')
    expect(card?.searchText).toBe(card?.searchText.toLowerCase())
  })

  it('tolerates a session whose model is unset', () => {
    const [card] = buildSessionCards({
      sessions: [makeSession({ model: null })],
      projects: PROJECTS,
      providers: PROVIDERS,
    })

    expect(card?.searchText).not.toContain('null')
  })
})
