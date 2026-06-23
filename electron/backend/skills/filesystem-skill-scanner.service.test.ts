import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  collectProjectAncestorSkillRoots,
  readSettingsSkillEntries,
  scanFilesystemSkillCatalog,
} from './filesystem-skill-scanner.service'

describe('collectProjectAncestorSkillRoots', () => {
  it('walks ancestors but stops before the home directory', () => {
    const home = '/Users/dev'
    const project = '/Users/dev/work/repo'

    const roots = collectProjectAncestorSkillRoots(
      project,
      '.agents/skills',
      'project',
      home,
    )
    const paths = roots.map((root) => root.rootPath)

    // Ancestors below home are project-scoped...
    expect(paths).toContain(resolve('/Users/dev/work/repo/.agents/skills'))
    expect(paths).toContain(resolve('/Users/dev/work/.agents/skills'))
    // ...but the home dir (and above) are NOT — that's where the mislabel was.
    expect(paths).not.toContain(resolve('/Users/dev/.agents/skills'))
    expect(paths).not.toContain(resolve('/.agents/skills'))
    expect(roots.every((root) => root.rawScope === 'project')).toBe(true)
  })

  it('stops immediately when the project is the home directory', () => {
    expect(
      collectProjectAncestorSkillRoots(
        '/Users/dev',
        '.agents/skills',
        'project',
        '/Users/dev',
      ),
    ).toEqual([])
  })
})

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

  it('discovers skills exposed via symlinked directories', async () => {
    const realSkillDir = join(tempDir, 'real', 'linked-skill')
    mkdirSync(realSkillDir, { recursive: true })
    writeFileSync(
      join(realSkillDir, 'SKILL.md'),
      [
        '---',
        'name: linked-skill',
        'description: Reached through a symlink.',
        '---',
      ].join('\n'),
    )

    const skillsRoot = join(tempDir, 'skills')
    mkdirSync(skillsRoot, { recursive: true })
    symlinkSync(realSkillDir, join(skillsRoot, 'linked-skill'), 'dir')

    const catalog = await scanFilesystemSkillCatalog({
      providerId: 'claude-code',
      providerName: 'Claude Code',
      invocationSupport: 'native-command',
      activationConfirmation: 'native-event',
      roots: [
        {
          rootPath: skillsRoot,
          rawScope: 'user',
          kind: 'skills-dir',
        },
      ],
    })

    expect(catalog.skills).toEqual([
      expect.objectContaining({
        name: 'linked-skill',
        description: 'Reached through a symlink.',
        enabled: true,
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
