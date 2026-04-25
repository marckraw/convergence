import { readdir, readFile } from 'fs/promises'
import { homedir } from 'os'
import { dirname, join, resolve } from 'path'
import {
  isPathInside,
  readSettingsSkillEntries,
  scanFilesystemSkillCatalog,
  uniqueSkillRoots,
  type FilesystemSkillRoot,
} from './filesystem-skill-scanner.service'
import type { ProviderSkillCatalog, SkillCatalogOptions } from './skills.types'

export interface PiSkillsServiceOptions {
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

function resolveConfiguredSkillPath(
  value: string,
  settingsPath: string,
  homeDir: string,
): string {
  if (value === '~') {
    return homeDir
  }
  if (value.startsWith('~/')) {
    return resolve(homeDir, value.slice(2))
  }
  return resolve(dirname(settingsPath), value)
}

async function readSettingsSkillRoots(input: {
  settingsPath: string
  projectPath: string
  homeDir: string
}): Promise<FilesystemSkillRoot[]> {
  try {
    const settings = JSON.parse(await readFile(input.settingsPath, 'utf8'))
    return readSettingsSkillEntries(settings)
      .map((entry) =>
        resolveConfiguredSkillPath(entry, input.settingsPath, input.homeDir),
      )
      .filter(
        (skillPath) =>
          isPathInside(skillPath, input.projectPath) ||
          isPathInside(skillPath, input.homeDir),
      )
      .map((rootPath) => ({
        rootPath,
        rawScope: 'settings',
        kind: 'skill-file' as const,
      }))
  } catch {
    return []
  }
}

async function discoverNodePackageSkillRoots(
  projectPath: string,
): Promise<FilesystemSkillRoot[]> {
  const nodeModulesPath = join(projectPath, 'node_modules')

  try {
    const packageEntries = await readdir(nodeModulesPath, {
      withFileTypes: true,
    })
    const roots = await Promise.all(
      packageEntries
        .filter((entry) => entry.isDirectory())
        .sort((left, right) => left.name.localeCompare(right.name))
        .map(async (entry) => {
          if (!entry.name.startsWith('@')) {
            return [
              {
                rootPath: join(nodeModulesPath, entry.name, 'skills'),
                rawScope: 'product',
                kind: 'skills-dir' as const,
              },
            ]
          }

          try {
            const scopedPath = join(nodeModulesPath, entry.name)
            const scopedEntries = await readdir(scopedPath, {
              withFileTypes: true,
            })
            return scopedEntries
              .filter((scopedEntry) => scopedEntry.isDirectory())
              .sort((left, right) => left.name.localeCompare(right.name))
              .map((scopedEntry) => ({
                rootPath: join(scopedPath, scopedEntry.name, 'skills'),
                rawScope: 'product',
                kind: 'skills-dir' as const,
              }))
          } catch {
            return []
          }
        }),
    )
    return roots.flat()
  } catch {
    return []
  }
}

async function collectSettingsRoots(
  projectPath: string,
  homeDir: string,
): Promise<FilesystemSkillRoot[]> {
  const settingsPaths = [
    join(projectPath, '.pi', 'settings.json'),
    join(projectPath, '.agents', 'settings.json'),
    join(homeDir, '.pi', 'agent', 'settings.json'),
    join(homeDir, '.agents', 'settings.json'),
  ]

  return (
    await Promise.all(
      settingsPaths.map((settingsPath) =>
        readSettingsSkillRoots({ settingsPath, projectPath, homeDir }),
      ),
    )
  ).flat()
}

export class PiSkillsService {
  private homeDir: string

  constructor(options: PiSkillsServiceOptions = {}) {
    this.homeDir = resolve(options.homeDir ?? homedir())
  }

  async list(
    projectPath: string,
    _options: SkillCatalogOptions = {},
  ): Promise<ProviderSkillCatalog> {
    const resolvedProjectPath = resolve(projectPath)
    const roots = uniqueSkillRoots([
      {
        rootPath: join(this.homeDir, '.pi', 'agent', 'skills'),
        rawScope: 'global',
        kind: 'skills-dir',
      },
      {
        rootPath: join(this.homeDir, '.agents', 'skills'),
        rawScope: 'global',
        kind: 'skills-dir',
      },
      ...collectAncestorSkillRoots(
        resolvedProjectPath,
        '.pi/skills',
        'project',
      ),
      ...collectAncestorSkillRoots(
        resolvedProjectPath,
        '.agents/skills',
        'project',
      ),
      ...(await discoverNodePackageSkillRoots(resolvedProjectPath)),
      ...(await collectSettingsRoots(resolvedProjectPath, this.homeDir)),
    ])

    return scanFilesystemSkillCatalog({
      providerId: 'pi',
      providerName: 'Pi Agent',
      invocationSupport: 'native-command',
      activationConfirmation: 'none',
      roots,
      pathInvocation: 'name-only',
    })
  }
}
