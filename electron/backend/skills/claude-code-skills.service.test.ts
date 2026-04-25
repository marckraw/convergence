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

  it('lists user, project, ancestor project, and plugin skill roots', async () => {
    writeSkill(join(homeDir, '.claude', 'skills'), 'user-skill')
    writeSkill(join(projectPath, '.claude', 'skills'), 'project-skill')
    writeSkill(
      join(tempDir, 'workspace', '.claude', 'skills'),
      'ancestor-skill',
    )
    writeSkill(
      join(homeDir, '.claude', 'plugins', 'plugin-a', 'skills'),
      'plugin-skill',
    )

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

  it('returns an empty catalog when documented roots are absent', async () => {
    const catalog = await new ClaudeCodeSkillsService({ homeDir }).list(
      projectPath,
    )

    expect(catalog.skills).toEqual([])
    expect(catalog.error).toBeNull()
  })
})
