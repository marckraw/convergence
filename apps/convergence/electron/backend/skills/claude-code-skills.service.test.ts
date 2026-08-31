import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ClaudeCodeSkillsService } from './claude-code-skills.service'

function writeSkill(root: string, name: string, description = 'Use it.') {
  const skillDir = join(root, name)
  mkdirSync(skillDir, { recursive: true })
  writeFileSync(
    join(skillDir, 'SKILL.md'),
    ['---', `name: ${name}`, `description: ${description}`, '---'].join('\n'),
  )
}

function writeInstalledPluginsManifest(
  pluginsDir: string,
  plugins: Record<string, Array<{ scope: string; installPath: string }>>,
) {
  mkdirSync(pluginsDir, { recursive: true })
  writeFileSync(
    join(pluginsDir, 'installed_plugins.json'),
    JSON.stringify({ version: 2, plugins }, null, 2),
  )
}

describe('ClaudeCodeSkillsService', () => {
  let tempDir: string
  let homeDir: string
  let projectPath: string

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'convergence-claude-skills-'))
    homeDir = join(tempDir, 'home')
    projectPath = join(tempDir, 'workspace', 'nested', 'repo')
    mkdirSync(projectPath, { recursive: true })
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('lists user, project, ancestor project, and manifest-declared plugin skills', async () => {
    writeSkill(join(homeDir, '.claude', 'skills'), 'user-skill')
    writeSkill(join(projectPath, '.claude', 'skills'), 'project-skill')
    writeSkill(
      join(tempDir, 'workspace', '.claude', 'skills'),
      'ancestor-skill',
    )

    const pluginInstallPath = join(
      homeDir,
      '.claude',
      'plugins',
      'cache',
      'addy-agent-skills',
      'agent-skills',
      '1.0.0',
    )
    writeSkill(join(pluginInstallPath, 'skills'), 'plugin-skill')
    writeInstalledPluginsManifest(join(homeDir, '.claude', 'plugins'), {
      'agent-skills@addy-agent-skills': [
        { scope: 'user', installPath: pluginInstallPath },
      ],
    })

    const catalog = await new ClaudeCodeSkillsService({ homeDir }).list(
      projectPath,
    )

    expect(catalog).toMatchObject({
      providerId: 'claude-code',
      providerName: 'Claude Code',
      catalogSource: 'filesystem',
      invocationSupport: 'native-command',
      activationConfirmation: 'native-event',
      error: null,
    })
    expect(
      catalog.skills.map((skill) => ({
        name: skill.name,
        scope: skill.scope,
        sourceLabel: skill.sourceLabel,
      })),
    ).toEqual(
      expect.arrayContaining([
        { name: 'user-skill', scope: 'user', sourceLabel: 'User' },
        { name: 'project-skill', scope: 'project', sourceLabel: 'Project' },
        { name: 'ancestor-skill', scope: 'project', sourceLabel: 'Project' },
        { name: 'plugin-skill', scope: 'plugin', sourceLabel: 'Plugin' },
      ]),
    )
  })

  it('discovers plugin skills via cache walk when no manifest is present', async () => {
    const pluginInstallPath = join(
      homeDir,
      '.claude',
      'plugins',
      'cache',
      'caveman',
      'caveman',
      '8bab5c739e13',
    )
    writeSkill(join(pluginInstallPath, 'skills'), 'caveman')

    const catalog = await new ClaudeCodeSkillsService({ homeDir }).list(
      projectPath,
    )

    expect(
      catalog.skills.map((skill) => ({
        name: skill.name,
        scope: skill.scope,
      })),
    ).toEqual([{ name: 'caveman', scope: 'plugin' }])
  })

  it('returns multiple plugin skills from a single manifest entry', async () => {
    const installPath = join(
      homeDir,
      '.claude',
      'plugins',
      'cache',
      'addy-agent-skills',
      'agent-skills',
      '1.0.0',
    )
    writeSkill(join(installPath, 'skills'), 'spec')
    writeSkill(join(installPath, 'skills'), 'plan')
    writeSkill(join(installPath, 'skills'), 'build')
    writeInstalledPluginsManifest(join(homeDir, '.claude', 'plugins'), {
      'agent-skills@addy-agent-skills': [{ scope: 'user', installPath }],
    })

    const catalog = await new ClaudeCodeSkillsService({ homeDir }).list(
      projectPath,
    )

    expect(catalog.skills.map((skill) => skill.name).sort()).toEqual([
      'build',
      'plan',
      'spec',
    ])
  })

  it('ignores manifest entries without a usable installPath', async () => {
    writeInstalledPluginsManifest(join(homeDir, '.claude', 'plugins'), {
      'broken@marketplace': [{ scope: 'user', installPath: '' }],
    })

    const catalog = await new ClaudeCodeSkillsService({ homeDir }).list(
      projectPath,
    )

    expect(catalog.skills).toEqual([])
    expect(catalog.error).toBeNull()
  })

  it('survives malformed manifest JSON without throwing', async () => {
    const pluginsDir = join(homeDir, '.claude', 'plugins')
    mkdirSync(pluginsDir, { recursive: true })
    writeFileSync(join(pluginsDir, 'installed_plugins.json'), '{not json')

    const fallbackInstallPath = join(
      pluginsDir,
      'cache',
      'caveman',
      'caveman',
      '8bab5c739e13',
    )
    writeSkill(join(fallbackInstallPath, 'skills'), 'caveman')

    const catalog = await new ClaudeCodeSkillsService({ homeDir }).list(
      projectPath,
    )

    expect(catalog.skills.map((skill) => skill.name)).toEqual(['caveman'])
    expect(catalog.error).toBeNull()
  })

  it('returns an empty catalog when documented roots are absent', async () => {
    const catalog = await new ClaudeCodeSkillsService({ homeDir }).list(
      projectPath,
    )

    expect(catalog.skills).toEqual([])
    expect(catalog.error).toBeNull()
  })
})
