import { describe, expect, it } from 'vitest'
import Fuse from 'fuse.js'
import { DEFAULT_PROJECT_SETTINGS, type Project } from '@/entities/project'
import type { Workspace } from '@/entities/workspace'
import type { Session, NeedsYouDismissals } from '@/entities/session'
import { buildPaletteIndex } from './command-palette-index.pure'
import {
  buildCuratedSections,
  rankForQuery,
  PALETTE_FUSE_OPTIONS,
} from './command-palette-ranking.pure'
import type { PaletteItem, SessionPaletteItem } from './command-center.types'

function project(id: string, name: string): Project {
  return {
    id,
    name,
    repositoryPath: `/repos/${name}`,
    settings: DEFAULT_PROJECT_SETTINGS,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

function workspace(
  id: string,
  projectId: string,
  branchName: string,
): Workspace {
  return {
    id,
    projectId,
    branchName,
    path: `/worktrees/${id}`,
    type: 'worktree',
    createdAt: '2026-01-01T00:00:00.000Z',
  }
}

function session(
  id: string,
  projectId: string,
  overrides: Partial<Session> = {},
): Session {
  return {
    id,
    projectId,
    workspaceId: null,
    providerId: 'claude-code',
    model: null,
    effort: null,
    name: `session ${id}`,
    status: 'idle',
    attention: 'none',
    activity: null,
    contextWindow: null,
    workingDirectory: '/tmp',
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

function buildItems(input: {
  projects: Project[]
  workspaces: Workspace[]
  sessions: Session[]
  recentSessionIds?: string[]
  dismissals?: NeedsYouDismissals
}): PaletteItem[] {
  return buildPaletteIndex({
    projects: input.projects,
    workspaces: input.workspaces,
    sessions: input.sessions,
    recentSessionIds: input.recentSessionIds ?? [],
    dismissals: input.dismissals ?? {},
  })
}

describe('buildCuratedSections', () => {
  it('returns the seven sections in spec order', () => {
    const sections = buildCuratedSections([], {}, [])
    expect(sections.map((section) => section.id)).toEqual([
      'waiting-on-you',
      'needs-review',
      'session-actions',
      'recent-sessions',
      'projects',
      'workspaces',
      'dialogs',
    ])
  })

  it('orders waiting-on-you by attention priority then updatedAt desc', () => {
    const items = buildItems({
      projects: [project('p1', 'alpha')],
      workspaces: [],
      sessions: [
        session('s-input', 'p1', {
          attention: 'needs-input',
          updatedAt: '2026-02-03T00:00:00.000Z',
        }),
        session('s-approval-old', 'p1', {
          attention: 'needs-approval',
          updatedAt: '2026-02-01T00:00:00.000Z',
        }),
        session('s-approval-new', 'p1', {
          attention: 'needs-approval',
          updatedAt: '2026-02-02T00:00:00.000Z',
        }),
      ],
    })
    const sections = buildCuratedSections(items, {}, [])
    const waiting = sections.find((s) => s.id === 'waiting-on-you')!
    const ids = waiting.items.map(
      (item) => (item as SessionPaletteItem).sessionId,
    )
    expect(ids).toEqual(['s-approval-new', 's-approval-old', 's-input'])
  })

  it('puts finished and failed into needs-review', () => {
    const items = buildItems({
      projects: [project('p1', 'alpha')],
      workspaces: [],
      sessions: [
        session('s-fin', 'p1', { attention: 'finished' }),
        session('s-fail', 'p1', { attention: 'failed' }),
      ],
    })
    const sections = buildCuratedSections(items, {}, [])
    const review = sections.find((s) => s.id === 'needs-review')!
    const ids = review.items.map(
      (item) => (item as SessionPaletteItem).sessionId,
    )
    expect(ids).toEqual(['s-fail', 's-fin'])
  })

  it('excludes dismissed sessions whose updatedAt matches dismissal', () => {
    const items = buildItems({
      projects: [project('p1', 'alpha')],
      workspaces: [],
      sessions: [
        session('s1', 'p1', {
          attention: 'needs-approval',
          updatedAt: '2026-02-01T00:00:00.000Z',
        }),
      ],
    })
    const sections = buildCuratedSections(
      items,
      {
        s1: {
          updatedAt: '2026-02-01T00:00:00.000Z',
          disposition: 'snoozed',
        },
      },
      [],
    )
    expect(sections.find((s) => s.id === 'waiting-on-you')!.items).toHaveLength(
      0,
    )
  })

  it('keeps stale dismissals from filtering (session has been updated since)', () => {
    const items = buildItems({
      projects: [project('p1', 'alpha')],
      workspaces: [],
      sessions: [
        session('s1', 'p1', {
          attention: 'needs-approval',
          updatedAt: '2026-02-02T00:00:00.000Z',
        }),
      ],
    })
    const sections = buildCuratedSections(
      items,
      {
        s1: {
          updatedAt: '2026-02-01T00:00:00.000Z',
          disposition: 'snoozed',
        },
      },
      [],
    )
    expect(sections.find((s) => s.id === 'waiting-on-you')!.items).toHaveLength(
      1,
    )
  })

  it('excludes attention-section sessions from recents and caps at 5', () => {
    const sessions = Array.from({ length: 7 }, (_, i) => session(`s${i}`, 'p1'))
    sessions[0] = { ...sessions[0], attention: 'needs-approval' }
    const items = buildItems({
      projects: [project('p1', 'alpha')],
      workspaces: [],
      sessions,
    })
    const recents = sessions.map((s) => s.id)
    const sections = buildCuratedSections(items, {}, recents)
    const recent = sections.find((s) => s.id === 'recent-sessions')!
    const ids = recent.items.map(
      (item) => (item as SessionPaletteItem).sessionId,
    )
    expect(ids).toHaveLength(5)
    expect(ids).not.toContain('s0')
    expect(ids).toEqual(['s1', 's2', 's3', 's4', 's5'])
  })

  it('caps projects and workspaces at 8', () => {
    const projects = Array.from({ length: 10 }, (_, i) =>
      project(`p${i}`, `name-${i}`),
    )
    const workspaces = Array.from({ length: 10 }, (_, i) =>
      workspace(`w${i}`, 'p0', `branch-${i}`),
    )
    const items = buildItems({ projects, workspaces, sessions: [] })
    const sections = buildCuratedSections(items, {}, [])
    expect(sections.find((s) => s.id === 'projects')!.items).toHaveLength(8)
    expect(sections.find((s) => s.id === 'workspaces')!.items).toHaveLength(8)
  })

  it('always emits the five dialog items plus the check-updates entry', () => {
    const sections = buildCuratedSections([], {}, [])
    const dialogs = sections.find((s) => s.id === 'dialogs')!
    expect(dialogs.items).toHaveLength(0)

    const items = buildItems({ projects: [], workspaces: [], sessions: [] })
    const allSections = buildCuratedSections(items, {}, [])
    const dialogSection = allSections.find((s) => s.id === 'dialogs')!
    expect(dialogSection.items).toHaveLength(6)
    expect(
      dialogSection.items.some((item) => item.kind === 'check-updates'),
    ).toBe(true)
  })
})

describe('rankForQuery', () => {
  const items = buildItems({
    projects: [project('p1', 'storefront')],
    workspaces: [workspace('w1', 'p1', 'feat/checkout')],
    sessions: [
      session('s1', 'p1', {
        name: 'checkout refactor',
        providerId: 'claude-code',
      }),
      session('s2', 'p1', {
        name: 'unrelated',
        providerId: 'checkout-provider',
      }),
    ],
  })
  const fuse = new Fuse(items, PALETTE_FUSE_OPTIONS)

  it('returns empty for blank query', () => {
    expect(rankForQuery(items, '', fuse)).toEqual([])
    expect(rankForQuery(items, '   ', fuse)).toEqual([])
  })

  it('ranks session.name matches above provider.id matches', () => {
    const ranked = rankForQuery(items, 'checkout', fuse)
    const sessionHits = ranked
      .filter((entry) => entry.item.kind === 'session')
      .map((entry) => (entry.item as SessionPaletteItem).sessionId)
    expect(sessionHits).toContain('s1')
    expect(sessionHits).toContain('s2')
    expect(sessionHits.indexOf('s1')).toBeLessThan(sessionHits.indexOf('s2'))
  })

  it('surfaces the matching workspace for a branch name query', () => {
    const ranked = rankForQuery(items, 'checkout', fuse)
    const workspaceHit = ranked.find((entry) => entry.item.kind === 'workspace')
    expect(workspaceHit).toBeDefined()
  })

  it('does not apply attention boost on typed queries', () => {
    const itemsWithAttention = buildItems({
      projects: [project('p1', 'storefront')],
      workspaces: [],
      sessions: [
        session('s-hit', 'p1', {
          name: 'checkout flow',
          attention: 'none',
        }),
        session('s-attention', 'p1', {
          name: 'unrelated',
          attention: 'needs-approval',
        }),
      ],
    })
    const localFuse = new Fuse(itemsWithAttention, PALETTE_FUSE_OPTIONS)
    const ranked = rankForQuery(itemsWithAttention, 'checkout', localFuse)
    const sessionHits = ranked.filter((entry) => entry.item.kind === 'session')
    expect(sessionHits[0]?.item.kind).toBe('session')
    expect((sessionHits[0]?.item as SessionPaletteItem).sessionId).toBe('s-hit')
  })
})
