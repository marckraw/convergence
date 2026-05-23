import { execFile as nodeExecFile } from 'child_process'
import { shell } from 'electron'
import { existsSync } from 'fs'
import { homedir } from 'os'
import {
  detectProjectOpenApps,
  getProjectOpenAppDefinition,
  PROJECT_OPEN_APP_DEFINITIONS,
} from './project-open.pure'
import type { ProjectOpenApp, ProjectOpenRequest } from './project-open.types'

type ExecFileCallback = (
  error: Error | null,
  stdout: string | Buffer,
  stderr: string | Buffer,
) => void

type ExecFileFn = (
  file: string,
  args: string[],
  callback: ExecFileCallback,
) => void

export interface ProjectOpenServiceDeps {
  platform?: NodeJS.Platform | string
  homeDir?: string
  exists?: (path: string) => boolean
  execFile?: ExecFileFn
  openPath?: (path: string) => Promise<string>
}

export class ProjectOpenService {
  private readonly platform: NodeJS.Platform | string
  private readonly homeDir: string
  private readonly exists: (path: string) => boolean
  private readonly execFile: ExecFileFn
  private readonly openPath: (path: string) => Promise<string>

  constructor(deps: ProjectOpenServiceDeps = {}) {
    this.platform = deps.platform ?? process.platform
    this.homeDir = deps.homeDir ?? homedir()
    this.exists = deps.exists ?? existsSync
    this.execFile = deps.execFile ?? nodeExecFile
    this.openPath = deps.openPath ?? shell.openPath
  }

  async listApps(): Promise<ProjectOpenApp[]> {
    const spotlightPathsByBundleId =
      this.platform === 'darwin' ? await this.detectSpotlightApps() : {}

    return detectProjectOpenApps({
      platform: this.platform,
      homeDir: this.homeDir,
      exists: this.exists,
      spotlightPathsByBundleId,
    })
  }

  async open(request: ProjectOpenRequest): Promise<void> {
    if (!request.path) {
      throw new Error('No project path was provided.')
    }

    if (!this.exists(request.path)) {
      throw new Error(`Project path does not exist: ${request.path}`)
    }

    if (request.appId === 'finder') {
      const error = await this.openPath(request.path)
      if (error) throw new Error(error)
      return
    }

    if (this.platform !== 'darwin') {
      throw new Error('Opening a specific editor is only supported on macOS.')
    }

    const availableApps = await this.listApps()
    if (!availableApps.some((app) => app.id === request.appId)) {
      throw new Error(`Editor is not installed: ${request.appId}`)
    }

    const definition = getProjectOpenAppDefinition(request.appId)
    if (!definition) {
      throw new Error(`Unsupported editor: ${request.appId}`)
    }

    await runExecFile(this.execFile, '/usr/bin/open', [
      '-a',
      definition.appName,
      request.path,
    ])
  }

  private async detectSpotlightApps(): Promise<
    Partial<Record<string, string[]>>
  > {
    const entries = await Promise.all(
      PROJECT_OPEN_APP_DEFINITIONS.filter((app) => app.kind === 'editor').map(
        async (app) => {
          const paths = await this.detectSpotlightPaths(app.bundleId)
          return [app.bundleId, paths] as const
        },
      ),
    )

    return Object.fromEntries(entries)
  }

  private async detectSpotlightPaths(bundleId: string): Promise<string[]> {
    try {
      const { stdout } = await runExecFile(this.execFile, '/usr/bin/mdfind', [
        `kMDItemCFBundleIdentifier == "${bundleId}"`,
      ])
      return stdout
        .split('\n')
        .map((path) => path.trim())
        .filter(Boolean)
    } catch {
      return []
    }
  }
}

function runExecFile(
  execFile: ExecFileFn,
  file: string,
  args: string[],
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(file, args, (error, stdout, stderr) => {
      if (error) {
        reject(error)
        return
      }

      resolve({
        stdout: String(stdout),
        stderr: String(stderr),
      })
    })
  })
}
