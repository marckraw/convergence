import { describe, expect, it } from 'vitest'
import {
  filterComposerSkills,
  filterSelectionsForProvider,
} from './composer-skill-picker.pure'
import type {
  ProjectSkillCatalog,
  SkillCatalogEntry,
  SkillSelection,
} from '@/entities/skill'

function skill(
  id: string,
  overrides: Partial<SkillCatalogEntry> = {},
): SkillCatalogEntry {
  return {
    id,
    providerId: 'codex',
    providerName: 'Codex',
    name: id,
    displayName: id,
    description: `${id} description`,
    shortDescription: null,
    path: `/tmp/${id}/SKILL.md`,
    scope: 'user',
    rawScope: 'user',
    sourceLabel: 'User',
    enabled: true,
    dependencies: [],
    warnings: [],
    ...overrides,
  }
}

const catalog: ProjectSkillCatalog = {
  projectId: 'project-1',
  projectName: 'convergence',
  refreshedAt: '2026-04-25T00:00:00.000Z',
  providers: [
    {
      providerId: 'codex',
      providerName: 'Codex',
      catalogSource: 'native-rpc',
      invocationSupport: 'structured-input',
      activationConfirmation: 'none',
      error: null,
      skills: [
        skill('review', { description: 'Review pull requests.' }),
        skill('disabled', { enabled: false }),
      ],
    },
    {
      providerId: 'pi',
      providerName: 'Pi',
      catalogSource: 'filesystem',
      invocationSupport: 'native-command',
      activationConfirmation: 'none',
      error: null,
      skills: [
        skill('pi-review', {
          providerId: 'pi',
          providerName: 'Pi',
          description: 'Pi review helper.',
        }),
      ],
    },
  ],
}

describe('filterComposerSkills', () => {
  it('scopes skills to the active provider', () => {
    expect(
      filterComposerSkills({
        catalog,
        providerId: 'codex',
        query: '',
      }).map((entry) => entry.id),
    ).toEqual(['review', 'disabled'])
  })

  it('matches query across description and path', () => {
    expect(
      filterComposerSkills({
        catalog,
        providerId: 'codex',
        query: 'pull requests',
      }).map((entry) => entry.id),
    ).toEqual(['review'])

    expect(
      filterComposerSkills({
        catalog,
        providerId: null,
        query: '/tmp/pi-review',
      }).map((entry) => entry.id),
    ).toEqual(['pi-review'])
  })

  it('sorts enabled skills before disabled skills', () => {
    expect(
      filterComposerSkills({
        catalog,
        providerId: 'codex',
        query: '',
      }).map((entry) => entry.id),
    ).toEqual(['review', 'disabled'])
  })
})

describe('filterSelectionsForProvider', () => {
  it('removes selections for a different provider', () => {
    const selections: SkillSelection[] = [
      {
        id: 'skill-1',
        providerId: 'codex',
        providerName: 'Codex',
        name: 'review',
        displayName: 'Review',
        path: '/tmp/review/SKILL.md',
        scope: 'user',
        rawScope: 'user',
        sourceLabel: 'User',
        status: 'selected',
      },
      {
        id: 'skill-2',
        providerId: 'pi',
        providerName: 'Pi',
        name: 'review',
        displayName: 'Review',
        path: '/tmp/pi-review/SKILL.md',
        scope: 'project',
        rawScope: 'repo',
        sourceLabel: 'Project',
        status: 'selected',
      },
    ]

    expect(filterSelectionsForProvider(selections, 'codex')).toEqual([
      selections[0],
    ])
    expect(filterSelectionsForProvider(selections, null)).toEqual([])
  })
})
