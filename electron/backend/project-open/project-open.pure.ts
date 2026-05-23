import { join } from 'path'
import type {
  ProjectOpenApp,
  ProjectOpenAppId,
  ProjectOpenAppKind,
} from './project-open.types'

export interface ProjectOpenAppDefinition extends ProjectOpenApp {
  appName: string
  bundleIds: string[]
  candidatePaths: (homeDir: string) => string[]
}

export interface DetectProjectOpenAppsInput {
  platform: NodeJS.Platform | string
  homeDir: string
  exists: (path: string) => boolean
  spotlightPathsByBundleId?: Partial<Record<string, string[]>>
}

export const PROJECT_OPEN_APP_DEFINITIONS: ProjectOpenAppDefinition[] = [
  {
    id: 'cursor',
    label: 'Cursor',
    kind: 'editor',
    appName: 'Cursor',
    bundleIds: ['com.todesktop.230313mzl4w4u92', 'com.cursor.cursor'],
    candidatePaths: (homeDir) => [
      '/Applications/Cursor.app',
      join(homeDir, 'Applications', 'Cursor.app'),
    ],
  },
  {
    id: 'vscode',
    label: 'VS Code',
    kind: 'editor',
    appName: 'Visual Studio Code',
    bundleIds: ['com.microsoft.VSCode'],
    candidatePaths: (homeDir) => [
      '/Applications/Visual Studio Code.app',
      join(homeDir, 'Applications', 'Visual Studio Code.app'),
    ],
  },
  {
    id: 'zed',
    label: 'Zed',
    kind: 'editor',
    appName: 'Zed',
    bundleIds: ['dev.zed.Zed'],
    candidatePaths: (homeDir) => [
      '/Applications/Zed.app',
      join(homeDir, 'Applications', 'Zed.app'),
    ],
  },
  {
    id: 'webstorm',
    label: 'WebStorm',
    kind: 'editor',
    appName: 'WebStorm',
    bundleIds: ['com.jetbrains.WebStorm'],
    candidatePaths: (homeDir) => [
      '/Applications/WebStorm.app',
      join(homeDir, 'Applications', 'WebStorm.app'),
    ],
  },
  {
    id: 'finder',
    label: 'Finder',
    kind: 'file-manager',
    appName: 'Finder',
    bundleIds: ['com.apple.finder'],
    candidatePaths: () => [],
  },
]

export function detectProjectOpenApps({
  platform,
  homeDir,
  exists,
  spotlightPathsByBundleId = {},
}: DetectProjectOpenAppsInput): ProjectOpenApp[] {
  return PROJECT_OPEN_APP_DEFINITIONS.flatMap((definition) => {
    if (definition.id === 'finder') {
      return platform === 'darwin' ? [toApp(definition)] : []
    }

    const spotlightPaths = definition.bundleIds.flatMap(
      (bundleId) => spotlightPathsByBundleId[bundleId] ?? [],
    )
    const installed =
      spotlightPaths.length > 0 ||
      definition.candidatePaths(homeDir).some((path) => exists(path))

    return installed ? [toApp(definition)] : []
  })
}

export function getProjectOpenAppDefinition(
  id: ProjectOpenAppId,
): ProjectOpenAppDefinition | null {
  return PROJECT_OPEN_APP_DEFINITIONS.find((app) => app.id === id) ?? null
}

function toApp(definition: {
  id: ProjectOpenAppId
  label: string
  kind: ProjectOpenAppKind
}): ProjectOpenApp {
  return {
    id: definition.id,
    label: definition.label,
    kind: definition.kind,
  }
}
