import { readdir } from 'fs/promises'
import { homedir } from 'os'
import { join, resolve } from 'path'
import {
  collectProjectAncestorSkillRoots,
  fingerprintFilesystemSkillRoots,
  scanFilesystemSkillCatalog,
  uniqueSkillRoots,
  type FilesystemSkillRoot,
} from './filesystem-skill-scanner.service'
import type { ProviderSkillCatalog, SkillCatalogOptions } from './skills.types'

export interface AntigravitySkillsServiceOptions {
  homeDir?: string
}

async function collectPluginSkillRoots(
  pluginRoot: string,
): Promise<FilesystemSkillRoot[]> {
  try {
    const entries = await readdir(pluginRoot, { withFileTypes: true })
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => ({
        rootPath: join(pluginRoot, entry.name, 'skills'),
        rawScope: 'plugin',
        kind: 'skills-dir' as const,
      }))
  } catch {
    return []
  }
}

export class AntigravitySkillsService {
  private homeDir: string

  constructor(options: AntigravitySkillsServiceOptions = {}) {
    this.homeDir = resolve(options.homeDir ?? homedir())
  }

  private async resolveRoots(
    projectPath: string,
  ): Promise<FilesystemSkillRoot[]> {
    const resolvedProjectPath = resolve(projectPath)
    const [agentsRoots, agentRoots, configPlugins, cliPlugins] =
      await Promise.all([
        collectProjectAncestorSkillRoots(
          resolvedProjectPath,
          '.agents/skills',
          'project',
          this.homeDir,
        ),
        collectProjectAncestorSkillRoots(
          resolvedProjectPath,
          '.agent/skills',
          'project',
          this.homeDir,
        ),
        collectPluginSkillRoots(
          join(this.homeDir, '.gemini', 'config', 'plugins'),
        ),
        collectPluginSkillRoots(
          join(this.homeDir, '.gemini', 'antigravity-cli', 'plugins'),
        ),
      ])
    return uniqueSkillRoots([
      {
        rootPath: join(this.homeDir, '.gemini', 'config', 'skills'),
        rawScope: 'global',
        kind: 'skills-dir',
      },
      {
        rootPath: join(this.homeDir, '.gemini', 'antigravity-cli', 'skills'),
        rawScope: 'global',
        kind: 'skills-dir',
      },
      ...agentsRoots,
      ...agentRoots,
      ...configPlugins,
      ...cliPlugins,
    ])
  }

  async list(
    projectPath: string,
    _options: SkillCatalogOptions = {},
  ): Promise<ProviderSkillCatalog> {
    return scanFilesystemSkillCatalog({
      providerId: 'antigravity',
      providerName: 'Antigravity CLI',
      invocationSupport: 'native-command',
      activationConfirmation: 'none',
      roots: await this.resolveRoots(projectPath),
      pathInvocation: 'name-only',
    })
  }

  async fingerprint(projectPath: string): Promise<string> {
    return fingerprintFilesystemSkillRoots(await this.resolveRoots(projectPath))
  }
}
