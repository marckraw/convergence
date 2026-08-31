import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { PiSkillsService } from './pi-skills.service'

function writeSkill(root: string, name: string, description = 'Use it.') {
  const skillDir = join(root, name)
  mkdirSync(skillDir, { recursive: true })
  writeFileSync(
    join(skillDir, 'SKILL.md'),
    ['---', `name: ${name}`, `description: ${description}`, '---'].join('\n'),
  )
}

describe('PiSkillsService', () => {
  let tempDir: string
  let homeDir: string
  let projectPath: string

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'convergence-pi-skills-'))
    homeDir = join(tempDir, 'home')
    projectPath = join(tempDir, 'workspace', 'repo')
    mkdirSync(projectPath, { recursive: true })
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('lists global, project, ancestor, settings, and package roots', async () => {
    writeSkill(join(homeDir, '.pi', 'agent', 'skills'), 'global-pi')
    writeSkill(join(homeDir, '.agents', 'skills'), 'global-agents')
    writeSkill(join(projectPath, '.pi', 'skills'), 'project-pi')
    writeSkill(
      join(tempDir, 'workspace', '.agents', 'skills'),
      'ancestor-agent',
    )
    writeSkill(join(projectPath, 'settings-skill'), 'settings-local')
    writeSkill(
      join(projectPath, 'node_modules', '@acme', 'package-a', 'skills'),
      'package-skill',
    )
    writeSkill(join(tempDir, 'outside'), 'outside-skill')
    mkdirSync(join(projectPath, '.pi'), { recursive: true })
    writeFileSync(
      join(projectPath, '.pi', 'settings.json'),
      JSON.stringify({
        skills: [
          '../settings-skill/settings-local',
          join(tempDir, 'outside', 'outside-skill'),
        ],
      }),
    )

    const catalog = await new PiSkillsService({ homeDir }).list(projectPath)

    expect(catalog).toMatchObject({
      providerId: 'pi',
      providerName: 'Pi Agent',
      catalogSource: 'filesystem',
      invocationSupport: 'native-command',
      activationConfirmation: 'none',
      error: null,
    })
    expect(catalog.skills.map((skill) => skill.name)).toEqual(
      expect.arrayContaining([
        'global-pi',
        'global-agents',
        'project-pi',
        'ancestor-agent',
        'settings-local',
        'package-skill',
      ]),
    )
    expect(catalog.skills.map((skill) => skill.name)).not.toContain(
      'outside-skill',
    )
  })

  it('returns an empty catalog when documented roots are absent', async () => {
    const catalog = await new PiSkillsService({ homeDir }).list(projectPath)

    expect(catalog.skills).toEqual([])
    expect(catalog.error).toBeNull()
  })
})
