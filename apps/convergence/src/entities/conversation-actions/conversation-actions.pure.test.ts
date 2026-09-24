import { describe, expect, it } from 'vitest'
import {
  filterComposerSkills,
  skillSelectionFromCatalogEntry,
  type ProjectSkillCatalog,
  type SkillCatalogEntry,
  type SkillProviderId,
} from '@/entities/skill'
import {
  buildConversationActions,
  buildConversationProjectActions,
} from './conversation-actions.pure'
import type { ConversationRoutineAction } from './conversation-actions.types'

function skill(
  providerId: SkillProviderId,
  name: string,
  enabled = true,
): SkillCatalogEntry {
  return {
    id: `${providerId}:${name}`,
    providerId,
    providerName: providerId,
    name,
    displayName: name,
    description: '',
    shortDescription: null,
    path: `/fixture/${providerId}/${name}/SKILL.md`,
    scope: 'project',
    rawScope: 'project',
    sourceLabel: 'Project',
    enabled,
    dependencies: [],
    warnings: [],
  }
}

const catalog: ProjectSkillCatalog = {
  projectId: 'p',
  projectName: 'Fixture',
  refreshedAt: 'now',
  providers: (['claude-code', 'codex'] as const).map((providerId) => ({
    providerId,
    providerName: providerId,
    catalogSource: 'filesystem',
    invocationSupport: 'native-command',
    activationConfirmation: 'none',
    error: null,
    skills: [
      skill(providerId, 'A disabled', false),
      skill(providerId, 'Zebra'),
      skill(providerId, 'Alpha'),
    ],
  })),
}
const routines: ConversationRoutineAction[] = [
  {
    id: 'compact',
    kind: 'routine',
    label: 'Compact',
    offered: false,
    reason: 'Wait for the pending send',
  },
  { id: 'fork', kind: 'routine', label: 'Fork', offered: true },
]

describe('buildConversationActions', () => {
  it.each(['claude-code', 'codex'])(
    'lists exactly the %s composer skills, enabled then by name, before routines',
    (providerId) => {
      const actions = buildConversationActions({
        routines,
        skillCatalog: catalog,
        providerId,
      })
      const skills = actions.filter((action) => action.kind === 'skill')
      expect(skills.map((action) => action.label)).toEqual([
        'Alpha',
        'Zebra',
        'A disabled',
      ])
      expect(skills.map((action) => action.skill.providerId)).toEqual([
        providerId,
        providerId,
        providerId,
      ])
      expect(skills.map((action) => action.skill)).toEqual(
        filterComposerSkills({ catalog, providerId, query: '' }).map((entry) =>
          skillSelectionFromCatalogEntry(entry),
        ),
      )
      expect(skills.map((action) => action.offered)).toEqual([
        true,
        true,
        false,
      ])
      expect(skills[2].reason).toBe('This skill is disabled.')
      expect(actions.slice(3)).toEqual(routines)
      expect(new Set(actions.map((action) => action.id)).size).toBe(
        actions.length,
      )
    },
  )

  it('preserves the catalog disabled reason and chip selection', () => {
    const entry = catalog.providers[0].skills[0]
    const skillCatalog = {
      ...catalog,
      providers: [
        {
          ...catalog.providers[0],
          skills: [
            {
              ...entry,
              warnings: [
                {
                  code: 'disabled' as const,
                  message: 'Disabled by project configuration',
                },
              ],
            },
          ],
        },
      ],
    }
    expect(
      buildConversationActions({
        routines: [],
        skillCatalog,
        providerId: 'claude-code',
      }),
    ).toEqual([
      {
        id: `skill:${entry.id}`,
        kind: 'skill',
        label: entry.displayName,
        offered: false,
        reason: 'Disabled by project configuration',
        skill: skillSelectionFromCatalogEntry(entry),
      },
    ])
  })

  it('keeps routines and their refusal text when there is no skill catalog', () => {
    expect(
      buildConversationActions({
        routines,
        skillCatalog: null,
        providerId: 'codex',
      }),
    ).toEqual(routines)
  })
})

it('has no project actions without a seated conversation', () => {
  expect(
    buildConversationProjectActions({
      sessionId: 'unseated',
      crews: [],
      snapshots: {},
      currentCrewId: 'stale-crew',
    }),
  ).toEqual([])
})
