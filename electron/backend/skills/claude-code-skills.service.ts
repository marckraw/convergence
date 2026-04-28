import { readdir, readFile } from 'fs/promises'
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

const PLUGIN_CACHE_WALK_MAX_DEPTH = 5

function collectAncestorPaths(projectPath: string): string[] {
  const paths: string[] = []
  let current = resolve(projectPath)
  for (;;) {
    paths.push(current)
    const parent = dirname(current)
    if (parent === current) {
      break
    }
    current = parent
  }
  return paths
}

function collectAncestorSkillRoots(
  projectPath: string,
  relativeRoot: string,
  rawScope: string,
): FilesystemSkillRoot[] {
  return collectAncestorPaths(projectPath).map((path) => ({
    rootPath: join(path, relativeRoot),
    rawScope,
    kind: 'skills-dir',
  }))
}

interface InstalledPluginRecord {
  installPath?: unknown
}

interface InstalledPluginsManifest {
  version?: unknown
  plugins?: unknown
}

async function readInstalledPluginsManifest(
  manifestPath: string,
): Promise<FilesystemSkillRoot[]> {
  let raw: string
  try {
    raw = await readFile(manifestPath, 'utf8')
  } catch {
    return []
  }

  let parsed: InstalledPluginsManifest
  try {
    parsed = JSON.parse(raw) as InstalledPluginsManifest
  } catch {
    return []
  }

  const plugins = parsed?.plugins
  if (!plugins || typeof plugins !== 'object' || Array.isArray(plugins)) {
    return []
  }

  const roots: FilesystemSkillRoot[] = []
  for (const records of Object.values(
    plugins as Record<string, InstalledPluginRecord[] | undefined>,
  )) {
    if (!Array.isArray(records)) {
      continue
    }
    for (const record of records) {
      const installPath = record?.installPath
      if (typeof installPath === 'string' && installPath.trim()) {
        roots.push({
          rootPath: join(installPath, 'skills'),
          rawScope: 'plugin',
          kind: 'skills-dir',
        })
      }
    }
  }
  return roots
}

async function discoverPluginCacheSkillRoots(
  cachePath: string,
): Promise<FilesystemSkillRoot[]> {
  const roots: FilesystemSkillRoot[] = []

  async function walk(currentPath: string, depth: number): Promise<void> {
    if (depth > PLUGIN_CACHE_WALK_MAX_DEPTH) {
      return
    }
    let entries
    try {
      entries = await readdir(currentPath, { withFileTypes: true })
    } catch {
      return
    }

    const skillsEntry = entries.find(
      (entry) => entry.isDirectory() && entry.name === 'skills',
    )
    if (skillsEntry) {
      roots.push({
        rootPath: join(currentPath, 'skills'),
        rawScope: 'plugin',
        kind: 'skills-dir',
      })
      return
    }

    await Promise.all(
      entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => walk(join(currentPath, entry.name), depth + 1)),
    )
  }

  await walk(cachePath, 0)
  return roots
}

async function collectClaudePluginRoots(
  projectPath: string,
  homeDir: string,
): Promise<FilesystemSkillRoot[]> {
  const pluginDirs = [
    join(homeDir, '.claude', 'plugins'),
    ...collectAncestorPaths(projectPath).map((path) =>
      join(path, '.claude', 'plugins'),
    ),
  ]

  const manifestRoots = (
    await Promise.all(
      pluginDirs.map((pluginDir) =>
        readInstalledPluginsManifest(join(pluginDir, 'installed_plugins.json')),
      ),
    )
  ).flat()

  if (manifestRoots.length > 0) {
    return manifestRoots
  }

  return (
    await Promise.all(
      pluginDirs.map((pluginDir) =>
        discoverPluginCacheSkillRoots(join(pluginDir, 'cache')),
      ),
    )
  ).flat()
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
