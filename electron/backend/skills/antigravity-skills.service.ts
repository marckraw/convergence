import { readdir } from 'fs/promises'
import { homedir } from 'os'
import { dirname, join, resolve } from 'path'
import {
  scanFilesystemSkillCatalog,
  uniqueSkillRoots,
  type FilesystemSkillRoot,
} from './filesystem-skill-scanner.service'
import type { ProviderSkillCatalog, SkillCatalogOptions } from './skills.types'

export interface AntigravitySkillsServiceOptions {
  homeDir?: string
}

function collectAncestorSkillRoots(
  projectPath: string,
  relativeRoot: string,
  rawScope: string,
): FilesystemSkillRoot[] {
  const roots: FilesystemSkillRoot[] = []
  let current = resolve(projectPath)

  for (;;) {
    roots.push({
      rootPath: join(current, relativeRoot),
      rawScope,
      kind: 'skills-dir',
    })

    const parent = dirname(current)
    if (parent === current) break
    current = parent
  }

  return roots
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

  async list(
    projectPath: string,
    _options: SkillCatalogOptions = {},
  ): Promise<ProviderSkillCatalog> {
    const resolvedProjectPath = resolve(projectPath)
    const roots = uniqueSkillRoots([
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
      ...collectAncestorSkillRoots(
        resolvedProjectPath,
        '.agents/skills',
        'project',
      ),
      ...collectAncestorSkillRoots(
        resolvedProjectPath,
        '.agent/skills',
        'project',
      ),
      ...(await collectPluginSkillRoots(
        join(this.homeDir, '.gemini', 'config', 'plugins'),
      )),
      ...(await collectPluginSkillRoots(
        join(this.homeDir, '.gemini', 'antigravity-cli', 'plugins'),
      )),
    ])

    return scanFilesystemSkillCatalog({
      providerId: 'antigravity',
      providerName: 'Antigravity CLI',
      invocationSupport: 'native-command',
      activationConfirmation: 'none',
      roots,
      pathInvocation: 'name-only',
    })
  }
}
