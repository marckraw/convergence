import { execFile as nodeExecFile, type ChildProcess } from 'child_process'
import { shell } from 'electron'
import { existsSync } from 'fs'
import { homedir } from 'os'
import {
  detectProjectOpenApps,
  getProjectOpenAppDefinition,
  PROJECT_OPEN_APP_DEFINITIONS,
} from './project-open.pure'
import type {
  ProjectOpenApp,
  ProjectOpenAppId,
  ProjectOpenRequest,
} from './project-open.types'

type ExecFileCallback = (
  error: Error | null,
  stdout: string | Buffer,
  stderr: string | Buffer,
) => void

type ExecFileFn = (
  file: string,
  args: string[],
  callback: ExecFileCallback,
) => ChildProcess

export interface ProjectOpenServiceDeps {
  platform?: NodeJS.Platform | string
  homeDir?: string
  exists?: (path: string) => boolean
  execFile?: ExecFileFn
  openPath?: (path: string) => Promise<string>
  now?: () => number
  appCacheTtlMs?: number
  mdfindTimeoutMs?: number
}

const DEFAULT_APP_CACHE_TTL_MS = 30_000
const DEFAULT_MDFIND_TIMEOUT_MS = 1_500

export class ProjectOpenService {
  private readonly platform: NodeJS.Platform | string
  private readonly homeDir: string
  private readonly exists: (path: string) => boolean
  private readonly execFile: ExecFileFn
  private readonly openPath: (path: string) => Promise<string>
  private readonly now: () => number
  private readonly appCacheTtlMs: number
  private readonly mdfindTimeoutMs: number
  private appCache: { expiresAt: number; apps: ProjectOpenApp[] } | null = null

  constructor(deps: ProjectOpenServiceDeps = {}) {
    this.platform = deps.platform ?? process.platform
    this.homeDir = deps.homeDir ?? homedir()
    this.exists = deps.exists ?? existsSync
    this.execFile = deps.execFile ?? nodeExecFile
    this.openPath = deps.openPath ?? shell.openPath
    this.now = deps.now ?? Date.now
    this.appCacheTtlMs = deps.appCacheTtlMs ?? DEFAULT_APP_CACHE_TTL_MS
    this.mdfindTimeoutMs = deps.mdfindTimeoutMs ?? DEFAULT_MDFIND_TIMEOUT_MS
  }

  async listApps(): Promise<ProjectOpenApp[]> {
    const cached = this.appCache
    const now = this.now()
    if (cached && cached.expiresAt > now) {
      return cached.apps
    }

    const spotlightPathsByBundleId =
      this.platform === 'darwin' ? await this.detectSpotlightApps() : {}

    const apps = detectProjectOpenApps({
      platform: this.platform,
      homeDir: this.homeDir,
      exists: this.exists,
      spotlightPathsByBundleId,
    })
    this.appCache = {
      apps,
      expiresAt: now + this.appCacheTtlMs,
    }

    return apps
  }

  async open(request: ProjectOpenRequest): Promise<void> {
    validateProjectOpenAppId(request.appId)

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
      throw new Error(`Unknown project open app: ${request.appId}`)
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
        (app) =>
          Promise.all(
            app.bundleIds.map(async (bundleId) => {
              const paths = await this.detectSpotlightPaths(bundleId)
              return [bundleId, paths] as const
            }),
          ),
      ),
    )

    return Object.fromEntries(entries.flat())
  }

  private async detectSpotlightPaths(bundleId: string): Promise<string[]> {
    try {
      const { stdout } = await runExecFile(
        this.execFile,
        '/usr/bin/mdfind',
        [`kMDItemCFBundleIdentifier == "${bundleId}"`],
        this.mdfindTimeoutMs,
      )
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
  timeoutMs?: number,
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    let settled = false
    let timeout: ReturnType<typeof setTimeout> | null = null
    const child = execFile(file, args, (error, stdout, stderr) => {
      if (settled) return
      settled = true
      if (timeout) clearTimeout(timeout)

      if (error) {
        reject(error)
        return
      }

      resolve({
        stdout: String(stdout),
        stderr: String(stderr),
      })
    })

    if (timeoutMs !== undefined) {
      timeout = setTimeout(() => {
        if (settled) return
        settled = true
        child.kill()
        reject(new Error(`Command timed out: ${file}`))
      }, timeoutMs)
    }
  })
}

function validateProjectOpenAppId(
  appId: unknown,
): asserts appId is ProjectOpenAppId {
  if (
    PROJECT_OPEN_APP_DEFINITIONS.some((definition) => definition.id === appId)
  ) {
    return
  }

  const available = PROJECT_OPEN_APP_DEFINITIONS.map(
    (definition) => definition.id,
  ).join(', ')
  throw new Error(
    `Unknown project open app: ${String(appId)}. Available: ${available}`,
  )
}
