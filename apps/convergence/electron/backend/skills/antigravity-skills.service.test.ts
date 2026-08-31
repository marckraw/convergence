import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AntigravitySkillsService } from './antigravity-skills.service'

function writeSkill(root: string, folder: string, name: string): void {
  const skillDir = join(root, folder)
  mkdirSync(skillDir, { recursive: true })
  writeFileSync(
    join(skillDir, 'SKILL.md'),
    ['---', `name: ${name}`, `description: ${name} description.`, '---'].join(
      '\n',
    ),
  )
}

describe('AntigravitySkillsService', () => {
  let tempDir: string
  let homeDir: string
  let projectPath: string

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'convergence-antigravity-skills-'))
    homeDir = join(tempDir, 'home')
    projectPath = join(tempDir, 'repo', 'packages', 'app')
    mkdirSync(projectPath, { recursive: true })
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('discovers Antigravity workspace, global, legacy, and plugin skills', async () => {
    writeSkill(
      join(homeDir, '.gemini', 'config', 'skills'),
      'global-config',
      'global-config',
    )
    writeSkill(
      join(homeDir, '.gemini', 'antigravity-cli', 'skills'),
      'global-cli',
      'global-cli',
    )
    writeSkill(join(projectPath, '.agents', 'skills'), 'workspace', 'workspace')
    writeSkill(join(projectPath, '.agent', 'skills'), 'legacy', 'legacy')
    writeSkill(
      join(homeDir, '.gemini', 'config', 'plugins', 'plugin-a', 'skills'),
      'plugin-config',
      'plugin-config',
    )
    writeSkill(
      join(
        homeDir,
        '.gemini',
        'antigravity-cli',
        'plugins',
        'plugin-b',
        'skills',
      ),
      'plugin-cli',
      'plugin-cli',
    )

    const catalog = await new AntigravitySkillsService({ homeDir }).list(
      projectPath,
    )

    expect(catalog).toMatchObject({
      providerId: 'antigravity',
      providerName: 'Antigravity CLI',
      catalogSource: 'filesystem',
      invocationSupport: 'native-command',
      activationConfirmation: 'none',
      error: null,
    })
    expect(catalog.skills.map((skill) => skill.name).sort()).toEqual([
      'global-cli',
      'global-config',
      'legacy',
      'plugin-cli',
      'plugin-config',
      'workspace',
    ])
  })
})
