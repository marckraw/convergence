import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  collectProjectAncestorSkillRoots,
  fingerprintFilesystemSkillRoots,
  readSettingsSkillEntries,
  scanFilesystemSkillCatalog,
  type FilesystemSkillRoot,
} from './filesystem-skill-scanner.service'

describe('collectProjectAncestorSkillRoots', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'convergence-ancestor-roots-'))
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('stops at the git repository root and never climbs above it', async () => {
    const repoRoot = join(tempDir, 'repo')
    mkdirSync(join(repoRoot, '.git'), { recursive: true })
    const project = join(repoRoot, 'packages', 'app')
    mkdirSync(project, { recursive: true })

    const roots = await collectProjectAncestorSkillRoots(
      project,
      '.agents/skills',
      'project',
      tmpdir(),
    )
    const paths = roots.map((root) => root.rootPath)

    // Working dir up to and including the repo root...
    expect(paths).toContain(resolve(join(project, '.agents/skills')))
    expect(paths).toContain(
      resolve(join(repoRoot, 'packages', '.agents/skills')),
    )
    expect(paths).toContain(resolve(join(repoRoot, '.agents/skills')))
    // ...but nothing above the repo root.
    expect(paths).not.toContain(resolve(join(tempDir, '.agents/skills')))
    expect(roots.every((root) => root.rawScope === 'project')).toBe(true)
  })

  it('returns only the project root when it is itself the repo root', async () => {
    const repoRoot = join(tempDir, 'solo-repo')
    mkdirSync(join(repoRoot, '.git'), { recursive: true })

    const roots = await collectProjectAncestorSkillRoots(
      repoRoot,
      '.claude/skills',
      'project',
      tmpdir(),
    )

    expect(roots.map((root) => root.rootPath)).toEqual([
      resolve(join(repoRoot, '.claude/skills')),
    ])
  })

  it('falls back to a home-capped walk when there is no git repo', async () => {
    // No .git anywhere; home is the hard ceiling so global skills are excluded.
    const home = '/Users/dev'
    const roots = await collectProjectAncestorSkillRoots(
      '/Users/dev/work/repo',
      '.agents/skills',
      'project',
      home,
    )
    const paths = roots.map((root) => root.rootPath)

    expect(paths).toContain(resolve('/Users/dev/work/repo/.agents/skills'))
    expect(paths).toContain(resolve('/Users/dev/work/.agents/skills'))
    expect(paths).not.toContain(resolve('/Users/dev/.agents/skills'))
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

describe('fingerprintFilesystemSkillRoots', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'convergence-fs-fingerprint-'))
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  function writeSkill(name: string, body: string): void {
    const skillDir = join(tempDir, 'skills', name)
    mkdirSync(skillDir, { recursive: true })
    writeFileSync(
      join(skillDir, 'SKILL.md'),
      ['---', `name: ${name}`, `description: ${body}`, '---'].join('\n'),
    )
  }

  function skillRoots(): FilesystemSkillRoot[] {
    return [
      {
        rootPath: join(tempDir, 'skills'),
        rawScope: 'user',
        kind: 'skills-dir',
      },
    ]
  }

  it('is stable across calls when nothing changes', async () => {
    writeSkill('review', 'Reviews code.')

    const first = await fingerprintFilesystemSkillRoots(skillRoots())
    const second = await fingerprintFilesystemSkillRoots(skillRoots())

    expect(first).toBe(second)
  })

  it('changes when a skill is added', async () => {
    writeSkill('review', 'Reviews code.')
    const before = await fingerprintFilesystemSkillRoots(skillRoots())

    writeSkill('plan', 'Plans work.')
    const after = await fingerprintFilesystemSkillRoots(skillRoots())

    expect(after).not.toBe(before)
  })

  it('changes when a skill is removed', async () => {
    writeSkill('review', 'Reviews code.')
    writeSkill('plan', 'Plans work.')
    const before = await fingerprintFilesystemSkillRoots(skillRoots())

    rmSync(join(tempDir, 'skills', 'plan'), { recursive: true, force: true })
    const after = await fingerprintFilesystemSkillRoots(skillRoots())

    expect(after).not.toBe(before)
  })

  it('changes when a SKILL.md is edited', async () => {
    writeSkill('review', 'Reviews code.')
    const before = await fingerprintFilesystemSkillRoots(skillRoots())

    // Different length so the fingerprint differs on size even if mtime is
    // unchanged at sub-millisecond resolution.
    writeSkill('review', 'Reviews code changes thoroughly and carefully.')
    const after = await fingerprintFilesystemSkillRoots(skillRoots())

    expect(after).not.toBe(before)
  })

  it('returns a stable hash for roots with no skills', async () => {
    // No skills written — discovery finds nothing.
    expect(await fingerprintFilesystemSkillRoots(skillRoots())).toBe(
      await fingerprintFilesystemSkillRoots(skillRoots()),
    )
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
