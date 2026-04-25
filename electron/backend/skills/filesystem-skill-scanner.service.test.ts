import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  readSettingsSkillEntries,
  scanFilesystemSkillCatalog,
} from './filesystem-skill-scanner.service'

describe('scanFilesystemSkillCatalog', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'convergence-fs-skills-'))
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('maps SKILL.md directories into provider catalog entries', async () => {
    const skillDir = join(tempDir, 'skills', 'review')
    mkdirSync(skillDir, { recursive: true })
    writeFileSync(
      join(skillDir, 'SKILL.md'),
      [
        '---',
        'name: review-code',
        'description: Reviews code changes.',
        '---',
        '',
        '# Review Code',
      ].join('\n'),
    )

    const catalog = await scanFilesystemSkillCatalog({
      providerId: 'claude-code',
      providerName: 'Claude Code',
      invocationSupport: 'native-command',
      activationConfirmation: 'native-event',
      roots: [
        {
          rootPath: join(tempDir, 'skills'),
          rawScope: 'user',
          kind: 'skills-dir',
        },
      ],
    })

    expect(catalog).toMatchObject({
      providerId: 'claude-code',
      providerName: 'Claude Code',
      catalogSource: 'filesystem',
      invocationSupport: 'native-command',
      activationConfirmation: 'native-event',
      error: null,
    })
    expect(catalog.skills).toEqual([
      expect.objectContaining({
        name: 'review-code',
        displayName: 'review-code',
        description: 'Reviews code changes.',
        shortDescription: 'Reviews code changes.',
        path: resolve(skillDir, 'SKILL.md'),
        scope: 'user',
        rawScope: 'user',
        sourceLabel: 'User',
        enabled: true,
        warnings: [],
      }),
    ])
  })

  it('warns on invalid frontmatter, missing descriptions, and disabled skills', async () => {
    const skillDir = join(tempDir, 'skills', 'broken')
    mkdirSync(skillDir, { recursive: true })
    writeFileSync(
      join(skillDir, 'SKILL.md'),
      ['---', 'name broken', 'user-invocable: false', '---'].join('\n'),
    )

    const catalog = await scanFilesystemSkillCatalog({
      providerId: 'pi',
      providerName: 'Pi Agent',
      invocationSupport: 'native-command',
      activationConfirmation: 'none',
      roots: [
        {
          rootPath: join(tempDir, 'skills'),
          rawScope: 'project',
          kind: 'skills-dir',
        },
      ],
    })

    expect(catalog.skills[0]).toMatchObject({
      name: 'broken',
      enabled: false,
      warnings: expect.arrayContaining([
        expect.objectContaining({ code: 'invalid-frontmatter' }),
        expect.objectContaining({ code: 'missing-description' }),
        expect.objectContaining({ code: 'disabled' }),
      ]),
    })
  })

  it('preserves duplicates and warns when name-only invocation is ambiguous', async () => {
    for (const rootName of ['user', 'project']) {
      const skillDir = join(tempDir, rootName, 'same')
      mkdirSync(skillDir, { recursive: true })
      writeFileSync(
        join(skillDir, 'SKILL.md'),
        ['---', 'name: same-name', 'description: Same name.', '---'].join('\n'),
      )
    }

    const catalog = await scanFilesystemSkillCatalog({
      providerId: 'claude-code',
      providerName: 'Claude Code',
      invocationSupport: 'native-command',
      activationConfirmation: 'native-event',
      pathInvocation: 'name-only',
      roots: [
        {
          rootPath: join(tempDir, 'user'),
          rawScope: 'user',
          kind: 'skills-dir',
        },
        {
          rootPath: join(tempDir, 'project'),
          rawScope: 'project',
          kind: 'skills-dir',
        },
      ],
    })

    expect(catalog.skills).toHaveLength(2)
    for (const skill of catalog.skills) {
      expect(skill.warnings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: 'duplicate-name' }),
          expect.objectContaining({ code: 'unsupported-path-invocation' }),
        ]),
      )
    }
  })
})

describe('readSettingsSkillEntries', () => {
  it('reads string and object path entries from settings', () => {
    expect(
      readSettingsSkillEntries({
        skills: ['plain-skill', { path: './local-skill' }, { name: 'ignored' }],
      }),
    ).toEqual(['plain-skill', './local-skill'])
  })
})
