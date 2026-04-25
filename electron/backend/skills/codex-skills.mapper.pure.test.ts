import { describe, expect, it } from 'vitest'
import {
  extractCodexSkillRecords,
  mapCodexSkillCatalog,
} from './codex-skills.mapper.pure'

describe('extractCodexSkillRecords', () => {
  it('extracts skills from cwd-grouped app-server responses', () => {
    expect(
      extractCodexSkillRecords({
        result: [
          {
            cwd: '/tmp/project',
            skills: [{ name: 'skill-a' }, { name: 'skill-b' }],
            errors: [],
          },
        ],
      }),
    ).toEqual([{ name: 'skill-a' }, { name: 'skill-b' }])
  })
})

describe('mapCodexSkillCatalog', () => {
  it('maps Codex app-server skills into normalized catalog entries', () => {
    const catalog = mapCodexSkillCatalog({
      skills: [
        {
          name: 'review',
          description: 'Review pull requests.',
          path: '/tmp/user/review/SKILL.md',
          scope: 'user',
          enabled: true,
          interface: {
            displayName: 'Review',
            shortDescription: 'Review PRs',
          },
          dependencies: {
            mcpServers: ['github'],
            apps: [{ name: 'linear', state: 'needs-auth' }],
          },
        },
        {
          name: 'review',
          scope: 'repo',
          enabled: false,
        },
        {
          name: 'mystery',
          description: 'Mystery skill.',
          path: '/tmp/system/mystery/SKILL.md',
          scope: 'workspace',
        },
        {
          description: 'Skipped because name is required.',
          path: '/tmp/bad/SKILL.md',
        },
      ],
    })

    expect(catalog).toMatchObject({
      providerId: 'codex',
      providerName: 'Codex',
      catalogSource: 'native-rpc',
      invocationSupport: 'structured-input',
      activationConfirmation: 'none',
      error: null,
    })
    expect(catalog.skills).toHaveLength(3)

    expect(catalog.skills[0]).toMatchObject({
      providerId: 'codex',
      name: 'review',
      displayName: 'Review',
      description: 'Review pull requests.',
      shortDescription: 'Review PRs',
      path: '/tmp/user/review/SKILL.md',
      scope: 'user',
      rawScope: 'user',
      sourceLabel: 'User',
      enabled: true,
      dependencies: [
        expect.objectContaining({
          kind: 'mcp',
          name: 'github',
          state: 'declared',
        }),
        expect.objectContaining({
          kind: 'app',
          name: 'linear',
          state: 'needs-auth',
        }),
      ],
    })
    expect(catalog.skills[0].warnings).toEqual([
      expect.objectContaining({ code: 'duplicate-name' }),
    ])

    expect(catalog.skills[1]).toMatchObject({
      name: 'review',
      path: null,
      scope: 'project',
      rawScope: 'repo',
      sourceLabel: 'Project',
      enabled: false,
    })
    expect(catalog.skills[1].warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'missing-path' }),
        expect.objectContaining({ code: 'missing-description' }),
        expect.objectContaining({ code: 'disabled' }),
        expect.objectContaining({ code: 'duplicate-name' }),
      ]),
    )

    expect(catalog.skills[2]).toMatchObject({
      name: 'mystery',
      scope: 'unknown',
      sourceLabel: 'Unknown',
    })
    expect(catalog.skills[2].warnings).toEqual([
      expect.objectContaining({ code: 'unknown-scope' }),
    ])
  })
})
