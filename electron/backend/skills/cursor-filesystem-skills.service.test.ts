import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CursorFilesystemSkillsService } from './cursor-filesystem-skills.service'

function writeSkill(root: string, name: string, description = 'Use it.') {
  const skillDir = join(root, name)
  mkdirSync(skillDir, { recursive: true })
  writeFileSync(
    join(skillDir, 'SKILL.md'),
    ['---', `name: ${name}`, `description: ${description}`, '---'].join('\n'),
  )
}

describe('CursorFilesystemSkillsService', () => {
  let tempDir: string
  let homeDir: string
  let projectPath: string

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'convergence-cursor-fs-skills-'))
    homeDir = join(tempDir, 'home')
    projectPath = join(tempDir, 'workspace', 'repo')
    mkdirSync(projectPath, { recursive: true })
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('discovers project-scoped .cursor/skills', async () => {
    writeSkill(
      join(projectPath, '.cursor', 'skills'),
      'vercel-react-best-practices',
    )

    const catalog = await new CursorFilesystemSkillsService({ homeDir }).list(
      projectPath,
    )

    expect(catalog).toMatchObject({
      providerId: 'cursor',
      providerName: 'Cursor',
      catalogSource: 'filesystem',
      invocationSupport: 'native-command',
      activationConfirmation: 'none',
      error: null,
    })
    expect(
      catalog.skills.map((skill) => ({ name: skill.name, scope: skill.scope })),
    ).toEqual([{ name: 'vercel-react-best-practices', scope: 'project' }])
  })

  it('returns an empty catalog when there is no .cursor/skills directory', async () => {
    const catalog = await new CursorFilesystemSkillsService({ homeDir }).list(
      projectPath,
    )

    expect(catalog.skills).toEqual([])
    expect(catalog.error).toBeNull()
  })
})
