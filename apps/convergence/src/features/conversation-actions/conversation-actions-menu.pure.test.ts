import { describe, expect, it } from 'vitest'
import { DRILL_COMPACTION_UNINTERRUPTIBLE } from '@/entities/context-drill'
import type {
  ConversationAction,
  ConversationRoutineAction,
} from '@/entities/conversation-actions'
import { COMPACTING_CONTEXT_LABEL } from '@/entities/session'
import type {
  ProjectSkillCatalog,
  ProviderSkillCatalog,
  SkillCatalogEntry,
} from '@/entities/skill'
import {
  ACTIONS_PANEL_MARGIN,
  ACTIONS_PANEL_WIDTH,
  conversationActionsAvailable,
  levelAfterEscape,
  nextFocusIndex,
  placeActionsPanel,
  resolveRoutineRows,
  resolveSkillListState,
  skillsFailedLabel,
  visibleSkillActions,
} from './conversation-actions-menu.pure'

function skill(
  id: string,
  overrides: Partial<SkillCatalogEntry> = {},
): SkillCatalogEntry {
  return {
    id,
    providerId: 'claude-code',
    providerName: 'Claude Code',
    name: id,
    displayName: id,
    description: `${id} description`,
    shortDescription: null,
    path: `/skills/${id}/SKILL.md`,
    scope: 'global',
    rawScope: null,
    sourceLabel: 'Global',
    enabled: true,
    dependencies: [],
    warnings: [],
    ...overrides,
  }
}

function provider(
  skills: SkillCatalogEntry[],
  overrides: Partial<ProviderSkillCatalog> = {},
): ProviderSkillCatalog {
  return {
    providerId: 'claude-code',
    providerName: 'Claude Code',
    catalogSource: 'filesystem',
    invocationSupport: 'native-command',
    activationConfirmation: 'none',
    skills,
    error: null,
    ...overrides,
  }
}

function catalog(
  providers: ProviderSkillCatalog[],
  projectId = 'project-1',
): ProjectSkillCatalog {
  return { projectId, projectName: 'Project', providers, refreshedAt: '' }
}

describe('conversationActionsAvailable (R1)', () => {
  const session = {
    id: 'session-1',
    providerId: 'claude-code',
    primarySurface: 'conversation',
  }

  it('is there for a project and a global conversation', () => {
    expect(
      conversationActionsAvailable({
        session,
        composerContext: { activeSessionId: 'session-1' },
        composerDisabledReason: null,
      }),
    ).toBe(true)
  })

  it.each([
    [
      'a removed worktree',
      { composerContext: { activeSessionId: 'session-1' }, reason: 'gone' },
    ],
    ['no context', { composerContext: null, reason: null }],
    [
      'a draft composer',
      { composerContext: { activeSessionId: null }, reason: null },
    ],
  ])('is absent for %s', (_name, { composerContext, reason }) => {
    expect(
      conversationActionsAvailable({
        session,
        composerContext,
        composerDisabledReason: reason,
      }),
    ).toBe(false)
  })

  it('is absent for a shell and a terminal-primary session', () => {
    const composerContext = { activeSessionId: 'session-1' }
    expect(
      conversationActionsAvailable({
        session: { ...session, providerId: 'shell' },
        composerContext,
        composerDisabledReason: null,
      }),
    ).toBe(false)
    expect(
      conversationActionsAvailable({
        session: { ...session, primarySurface: 'terminal' },
        composerContext,
        composerDisabledReason: null,
      }),
    ).toBe(false)
  })
})

describe('levelAfterEscape (R6)', () => {
  it('goes back one level: a list to the fan, the fan to closed', () => {
    expect(levelAfterEscape('skills')).toBe('fan')
    expect(levelAfterEscape('routines')).toBe('fan')
    expect(levelAfterEscape('project')).toBe('fan')
    expect(levelAfterEscape('fan')).toBe('closed')
    expect(levelAfterEscape('closed')).toBe('closed')
  })
})

describe('nextFocusIndex (R6)', () => {
  it('traverses with arrows (wrapping), Home and End', () => {
    expect(nextFocusIndex('ArrowDown', 0, 3)).toBe(1)
    expect(nextFocusIndex('ArrowDown', 2, 3)).toBe(0)
    expect(nextFocusIndex('ArrowUp', 0, 3)).toBe(2)
    expect(nextFocusIndex('ArrowRight', -1, 3)).toBe(0)
    expect(nextFocusIndex('Home', 2, 3)).toBe(0)
    expect(nextFocusIndex('End', 0, 3)).toBe(2)
    expect(nextFocusIndex('a', 0, 3)).toBeNull()
    expect(nextFocusIndex('ArrowDown', 0, 0)).toBeNull()
  })
})

describe('resolveSkillListState (R3)', () => {
  const base = {
    catalogId: 'project-1',
    isCatalogLoading: false,
    loadingProviderIds: [] as string[],
    catalogError: null,
    failedProviders: {},
    providerId: 'claude-code',
  }

  it('is loading while this agent’s provider has not arrived', () => {
    expect(
      resolveSkillListState({
        ...base,
        catalog: catalog([]),
        isCatalogLoading: true,
        loadingProviderIds: ['claude-code'],
      }),
    ).toEqual({ kind: 'loading' })
    expect(
      resolveSkillListState({ ...base, catalog: null, isCatalogLoading: true }),
    ).toEqual({ kind: 'loading' })
  })

  it('reads a catalog of another project or chat as not yet this one’s', () => {
    expect(
      resolveSkillListState({
        ...base,
        catalog: catalog([provider([skill('a')])], 'project-2'),
      }),
    ).toEqual({ kind: 'loading' })
  })

  it('is a failure, never empty, when this provider’s scan failed', () => {
    expect(
      resolveSkillListState({
        ...base,
        catalog: catalog([]),
        failedProviders: { 'claude-code': 'EACCES: skills dir' },
      }),
    ).toEqual({ kind: 'failed', message: 'EACCES: skills dir' })
    expect(
      resolveSkillListState({
        ...base,
        catalog: catalog([provider([], { error: 'Codex app-server exited' })]),
      }),
    ).toEqual({ kind: 'failed', message: 'Codex app-server exited' })
    expect(
      resolveSkillListState({
        ...base,
        catalog: null,
        catalogError: 'Failed to load skills',
      }),
    ).toEqual({ kind: 'failed', message: 'Failed to load skills' })
  })

  it('names a failure as a failure, with the store’s own message', () => {
    expect(skillsFailedLabel('EACCES: skills dir')).toBe(
      "Couldn't load this agent's skills: EACCES: skills dir",
    )
  })

  it('is empty only when the scan succeeded with none', () => {
    expect(
      resolveSkillListState({
        ...base,
        catalog: catalog([provider([skill('a')], { providerId: 'codex' })]),
      }),
    ).toEqual({ kind: 'empty' })
  })

  it('is listed when this provider has skills', () => {
    expect(
      resolveSkillListState({
        ...base,
        catalog: catalog([provider([skill('a')])]),
      }),
    ).toEqual({ kind: 'listed' })
  })
})

describe('visibleSkillActions (R2)', () => {
  it('keeps CA1’s rows in CA1’s order, narrowed by the composer’s query rule', () => {
    const skills = catalog([
      provider([
        skill('beta', { displayName: 'Beta planning' }),
        skill('alpha', { displayName: 'Alpha' }),
      ]),
    ])
    const actions: ConversationAction[] = [
      {
        id: 'skill:alpha',
        kind: 'skill',
        label: 'Alpha',
        offered: true,
        skill: { id: 'alpha' } as never,
      },
      {
        id: 'skill:beta',
        kind: 'skill',
        label: 'Beta planning',
        offered: true,
        skill: { id: 'beta' } as never,
      },
      { id: 'fork', kind: 'routine', label: 'Fork', offered: true },
    ]
    expect(
      visibleSkillActions({
        actions,
        catalog: skills,
        providerId: 'claude-code',
        query: '',
      }).map((action) => action.id),
    ).toEqual(['skill:alpha', 'skill:beta'])
    expect(
      visibleSkillActions({
        actions,
        catalog: skills,
        providerId: 'claude-code',
        query: 'plan',
      }).map((action) => action.id),
    ).toEqual(['skill:beta'])
  })
})

describe('resolveRoutineRows (R4/R5)', () => {
  const routines: ConversationRoutineAction[] = [
    {
      id: 'drill',
      kind: 'routine',
      label: 'Run the drill',
      offered: false,
      reason: 'Context can only be compacted while the session is idle',
    },
    { id: 'compact', kind: 'routine', label: 'Compact', offered: true },
    { id: 'fork', kind: 'routine', label: 'Fork', offered: true },
    {
      id: 'hand-off',
      kind: 'routine',
      label: 'Hand off',
      offered: false,
      reason: 'Wait for this conversation to settle.',
    },
  ]

  it('uses the frames’ words by id and CA1’s reason for a refusal', () => {
    const rows = resolveRoutineRows({
      routines,
      drillBeat: null,
      drillDescription: undefined,
      compacting: false,
    })
    expect(rows.map((row) => row.label)).toEqual([
      'Run the drill',
      'Compact',
      'Fork',
      'Hand off to another account',
    ])
    expect(rows[3]).toMatchObject({
      offered: false,
      reason: 'Wait for this conversation to settle.',
      progress: null,
    })
  })

  it('draws each drill beat from the shared resolver, with Cancel only where real', () => {
    const at = (beat: 'sealing' | 'compacting' | 'resuming') =>
      resolveRoutineRows({
        routines,
        drillBeat: beat,
        drillDescription: undefined,
        compacting: beat === 'compacting',
      }).find((row) => row.id === 'drill')?.progress
    expect(at('sealing')).toEqual({
      label: 'Sealing memory…',
      cancel: { enabled: true, reason: null },
    })
    expect(at('compacting')).toEqual({
      label: 'Compacting…',
      cancel: { enabled: false, reason: DRILL_COMPACTION_UNINTERRUPTIBLE },
    })
    expect(at('resuming')).toEqual({
      label: 'Waking up…',
      cancel: { enabled: true, reason: null },
    })
  })

  it('keeps a running drill on screen even when CA1 no longer lists it', () => {
    const rows = resolveRoutineRows({
      routines: routines.filter((routine) => routine.id !== 'drill'),
      drillBeat: 'sealing',
      drillDescription: undefined,
      compacting: false,
    })
    expect(rows[0]).toMatchObject({
      id: 'drill',
      progress: { label: 'Sealing memory…' },
    })
  })

  it('shows a compaction outside a drill with the shared label and no Cancel', () => {
    const compact = resolveRoutineRows({
      routines,
      drillBeat: null,
      drillDescription: undefined,
      compacting: true,
    }).find((row) => row.id === 'compact')
    expect(compact).toMatchObject({
      offered: false,
      progress: { label: COMPACTING_CONTEXT_LABEL, cancel: null },
    })
  })
})

describe('placeActionsPanel (R1)', () => {
  function inside(
    boundary: { left: number; top: number; right: number; bottom: number },
    anchor: { left: number; top: number; right: number; bottom: number },
  ) {
    const placed = placeActionsPanel({ boundary, anchor })
    const right = anchor.right - placed.right
    const left = right - placed.width
    const bottom = anchor.bottom - placed.bottom
    const top = bottom - placed.maxHeight
    return { placed, left, right, top, bottom }
  }

  it('is 286 wide, right-aligned to the button and growing upward', () => {
    const boundary = { left: 0, top: 0, right: 1000, bottom: 700 }
    const anchor = { left: 888, top: 650, right: 984, bottom: 684 }
    const { placed, right, bottom } = inside(boundary, anchor)
    expect(placed.width).toBe(ACTIONS_PANEL_WIDTH)
    expect(right).toBe(anchor.right)
    expect(bottom).toBeLessThan(anchor.top)
  })

  it.each([480, 300, 200])(
    'stays inside a %i px surface with an 8 px margin',
    (width) => {
      const boundary = { left: 40, top: 20, right: 40 + width, bottom: 620 }
      const anchor = {
        left: boundary.right - 16 - 96,
        top: 560,
        right: boundary.right - 16,
        bottom: 594,
      }
      const { left, right, top } = inside(boundary, anchor)
      expect(left).toBeGreaterThanOrEqual(boundary.left + ACTIONS_PANEL_MARGIN)
      expect(right).toBeLessThanOrEqual(boundary.right - ACTIONS_PANEL_MARGIN)
      expect(top).toBeGreaterThanOrEqual(boundary.top + ACTIONS_PANEL_MARGIN)
    },
  )

  it('clamps a button that sits past the surface edge back inside', () => {
    const boundary = { left: 0, top: 0, right: 480, bottom: 600 }
    const anchor = { left: 400, top: 540, right: 496, bottom: 574 }
    const { right } = inside(boundary, anchor)
    expect(right).toBe(480 - ACTIONS_PANEL_MARGIN)
  })
})
