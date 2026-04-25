import { readdir } from 'fs/promises'
import { homedir } from 'os'
import { dirname, join, resolve } from 'path'
import {
  scanFilesystemSkillCatalog,
  uniqueSkillRoots,
  type FilesystemSkillRoot,
} from './filesystem-skill-scanner.service'
import type { ProviderSkillCatalog, SkillCatalogOptions } from './skills.types'

export interface ClaudeCodeSkillsServiceOptions {
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
    if (parent === current) {
      break
    }
    current = parent
  }

  return roots
}

async function discoverPluginSkillRoots(
  pluginDirectoryPath: string,
): Promise<FilesystemSkillRoot[]> {
  try {
    const entries = await readdir(pluginDirectoryPath, { withFileTypes: true })
    return entries
      .filter((entry) => entry.isDirectory())
      .sort((left, right) => left.name.localeCompare(right.name))
      .map((entry) => ({
        rootPath: join(pluginDirectoryPath, entry.name, 'skills'),
        rawScope: 'plugin',
        kind: 'skills-dir' as const,
      }))
  } catch {
    return []
  }
}

async function collectClaudePluginRoots(
  projectPath: string,
  homeDir: string,
): Promise<FilesystemSkillRoot[]> {
  const projectPluginRoots = await Promise.all(
    collectAncestorSkillRoots(projectPath, '.claude/plugins', 'plugin').map(
      (root) => discoverPluginSkillRoots(root.rootPath),
    ),
  )
  const homePluginRoots = await discoverPluginSkillRoots(
    join(homeDir, '.claude', 'plugins'),
  )

  return [...projectPluginRoots.flat(), ...homePluginRoots]
}

export class ClaudeCodeSkillsService {
  private homeDir: string

  constructor(options: ClaudeCodeSkillsServiceOptions = {}) {
    this.homeDir = resolve(options.homeDir ?? homedir())
  }

  async list(
    projectPath: string,
    _options: SkillCatalogOptions = {},
  ): Promise<ProviderSkillCatalog> {
    const roots = uniqueSkillRoots([
      {
        rootPath: join(this.homeDir, '.claude', 'skills'),
        rawScope: 'user',
        kind: 'skills-dir',
      },
      ...collectAncestorSkillRoots(projectPath, '.claude/skills', 'project'),
      ...(await collectClaudePluginRoots(projectPath, this.homeDir)),
    ])

    return scanFilesystemSkillCatalog({
      providerId: 'claude-code',
      providerName: 'Claude Code',
      invocationSupport: 'native-command',
      activationConfirmation: 'native-event',
      roots,
      pathInvocation: 'name-only',
    })
  }
}
