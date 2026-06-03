import { homedir } from 'os'
import { dirname, join } from 'path'
import { mkdir, readFile, rm, stat, writeFile } from 'fs/promises'

export interface AntigravityTemporarySettingsPatch {
  modelLabel?: string | null
  statusLineCommand?: string | null
}

export interface AntigravitySettingsServiceOptions {
  settingsPath?: string
  lockPath?: string
  lockTimeoutMs?: number
  lockRetryDelayMs?: number
  staleLockMs?: number
  orphanLockMs?: number
}

interface OriginalSettings {
  existed: boolean
  raw: string | null
  parsed: Record<string, unknown>
}

interface SettingsLockState {
  version: 1
  ownerPid: number
  createdAtMs: number
  settingsPath: string
  original?: {
    existed: boolean
    raw: string | null
  }
  temporaryRaw?: string
}

const SETTINGS_LOCK_STATE_FILE = 'state.json'
const DEFAULT_LOCK_TIMEOUT_MS = 12 * 60 * 60 * 1000
const DEFAULT_LOCK_RETRY_DELAY_MS = 25
const DEFAULT_STALE_LOCK_MS = 12 * 60 * 60 * 1000
const DEFAULT_ORPHAN_LOCK_MS = 30_000

export function getDefaultAntigravitySettingsPath(): string {
  return join(homedir(), '.gemini', 'antigravity-cli', 'settings.json')
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isMissingFileError(error: unknown): boolean {
  return (
    !!error &&
    typeof error === 'object' &&
    (error as { code?: unknown }).code === 'ENOENT'
  )
}

function parseSettings(
  raw: string,
  settingsPath: string,
): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('settings root must be an object')
    }
    return parsed as Record<string, unknown>
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    throw new Error(
      `Failed to parse Antigravity settings at ${settingsPath}: ${reason}`,
      { cause: error },
    )
  }
}

async function readOriginalSettings(
  settingsPath: string,
): Promise<OriginalSettings> {
  try {
    const raw = await readFile(settingsPath, 'utf8')
    return {
      existed: true,
      raw,
      parsed: parseSettings(raw, settingsPath),
    }
  } catch (error) {
    if (!isMissingFileError(error)) throw error
    return { existed: false, raw: null, parsed: {} }
  }
}

function applyTemporaryPatch(
  settings: Record<string, unknown>,
  patch: AntigravityTemporarySettingsPatch,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...settings }

  if (patch.modelLabel !== undefined) {
    if (patch.modelLabel === null) {
      delete next.model
    } else {
      next.model = patch.modelLabel
    }
  }

  if (patch.statusLineCommand !== undefined) {
    if (patch.statusLineCommand === null) {
      delete next.statusLine
    } else {
      next.statusLine = {
        type: 'command',
        command: patch.statusLineCommand,
      }
    }
  }

  return next
}

function serializeSettings(settings: Record<string, unknown>): string {
  return `${JSON.stringify(settings, null, 2)}\n`
}

async function restoreOriginalSettings(
  settingsPath: string,
  original: Pick<OriginalSettings, 'existed' | 'raw'>,
): Promise<void> {
  if (original.existed) {
    await mkdir(dirname(settingsPath), { recursive: true })
    await writeFile(settingsPath, original.raw ?? '', 'utf8')
    return
  }

  await rm(settingsPath, { force: true })
}

function settingsLockStatePath(lockPath: string): string {
  return join(lockPath, SETTINGS_LOCK_STATE_FILE)
}

async function readSettingsLockState(
  lockPath: string,
): Promise<SettingsLockState | null> {
  try {
    const raw = await readFile(settingsLockStatePath(lockPath), 'utf8')
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return null

    const candidate = parsed as Partial<SettingsLockState>
    if (
      candidate.version !== 1 ||
      typeof candidate.ownerPid !== 'number' ||
      typeof candidate.createdAtMs !== 'number' ||
      typeof candidate.settingsPath !== 'string'
    ) {
      return null
    }

    return candidate as SettingsLockState
  } catch (error) {
    if (isMissingFileError(error)) return null
    return null
  }
}

async function writeSettingsLockState(
  lockPath: string,
  state: SettingsLockState,
): Promise<void> {
  await writeFile(
    settingsLockStatePath(lockPath),
    `${JSON.stringify(state, null, 2)}\n`,
    'utf8',
  )
}

function isProcessAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false

  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return (
      !!error &&
      typeof error === 'object' &&
      (error as { code?: unknown }).code === 'EPERM'
    )
  }
}

async function readOptionalSettingsRaw(
  settingsPath: string,
): Promise<string | null> {
  try {
    return await readFile(settingsPath, 'utf8')
  } catch (error) {
    if (isMissingFileError(error)) return null
    throw error
  }
}

async function recoverSettingsFromStaleLock(input: {
  lockPath: string
  settingsPath: string
  staleLockMs: number
  orphanLockMs: number
}): Promise<boolean> {
  let lockStats: Awaited<ReturnType<typeof stat>>
  try {
    lockStats = await stat(input.lockPath)
  } catch (error) {
    if (isMissingFileError(error)) return true
    throw error
  }

  const now = Date.now()
  const state = await readSettingsLockState(input.lockPath)
  const lockAgeMs = now - (state?.createdAtMs ?? lockStats.mtimeMs)
  const ownerIsAlive =
    state && state.ownerPid !== process.pid
      ? isProcessAlive(state.ownerPid)
      : state?.ownerPid === process.pid

  if (state && ownerIsAlive && lockAgeMs < input.staleLockMs) {
    return false
  }

  if (!state && now - lockStats.mtimeMs < input.orphanLockMs) {
    return false
  }

  if (
    state?.settingsPath === input.settingsPath &&
    state.original &&
    typeof state.temporaryRaw === 'string'
  ) {
    const currentRaw = await readOptionalSettingsRaw(input.settingsPath)
    if (currentRaw === state.temporaryRaw) {
      await restoreOriginalSettings(input.settingsPath, state.original)
    }
  }

  await rm(input.lockPath, { recursive: true, force: true })
  return true
}

async function acquireSettingsLock(input: {
  lockPath: string
  settingsPath: string
  timeoutMs: number
  retryDelayMs: number
  staleLockMs: number
  orphanLockMs: number
}): Promise<() => Promise<void>> {
  await mkdir(dirname(input.lockPath), { recursive: true })
  const startedAt = Date.now()

  while (true) {
    try {
      await mkdir(input.lockPath)
      await writeSettingsLockState(input.lockPath, {
        version: 1,
        ownerPid: process.pid,
        createdAtMs: Date.now(),
        settingsPath: input.settingsPath,
      })
      return async () => {
        await rm(input.lockPath, { recursive: true, force: true })
      }
    } catch (error) {
      const isBusy =
        !!error &&
        typeof error === 'object' &&
        (error as { code?: unknown }).code === 'EEXIST'
      if (!isBusy) throw error

      const recovered = await recoverSettingsFromStaleLock({
        lockPath: input.lockPath,
        settingsPath: input.settingsPath,
        staleLockMs: input.staleLockMs,
        orphanLockMs: input.orphanLockMs,
      })
      if (recovered) continue

      if (Date.now() - startedAt >= input.timeoutMs) {
        throw new Error(
          `Timed out waiting for Antigravity settings lock at ${input.lockPath}`,
          { cause: error },
        )
      }

      await delay(input.retryDelayMs)
    }
  }
}

export class AntigravitySettingsService {
  private readonly settingsPath: string
  private readonly lockPath: string
  private readonly lockTimeoutMs: number
  private readonly lockRetryDelayMs: number
  private readonly staleLockMs: number
  private readonly orphanLockMs: number

  constructor(options: AntigravitySettingsServiceOptions = {}) {
    this.settingsPath =
      options.settingsPath ?? getDefaultAntigravitySettingsPath()
    this.lockPath = options.lockPath ?? `${this.settingsPath}.convergence-lock`
    this.lockTimeoutMs = options.lockTimeoutMs ?? DEFAULT_LOCK_TIMEOUT_MS
    this.lockRetryDelayMs =
      options.lockRetryDelayMs ?? DEFAULT_LOCK_RETRY_DELAY_MS
    this.staleLockMs = options.staleLockMs ?? DEFAULT_STALE_LOCK_MS
    this.orphanLockMs = options.orphanLockMs ?? DEFAULT_ORPHAN_LOCK_MS
  }

  async withTemporarySettings<T>(
    patch: AntigravityTemporarySettingsPatch,
    operation: () => Promise<T>,
  ): Promise<T> {
    const release = await acquireSettingsLock({
      lockPath: this.lockPath,
      settingsPath: this.settingsPath,
      timeoutMs: this.lockTimeoutMs,
      retryDelayMs: this.lockRetryDelayMs,
      staleLockMs: this.staleLockMs,
      orphanLockMs: this.orphanLockMs,
    })

    try {
      const original = await readOriginalSettings(this.settingsPath)
      const next = applyTemporaryPatch(original.parsed, patch)
      const temporaryRaw = serializeSettings(next)

      await writeSettingsLockState(this.lockPath, {
        version: 1,
        ownerPid: process.pid,
        createdAtMs: Date.now(),
        settingsPath: this.settingsPath,
        original: {
          existed: original.existed,
          raw: original.raw,
        },
        temporaryRaw,
      })

      await mkdir(dirname(this.settingsPath), { recursive: true })
      await writeFile(this.settingsPath, temporaryRaw, 'utf8')

      try {
        return await operation()
      } finally {
        await restoreOriginalSettings(this.settingsPath, original)
      }
    } finally {
      await release()
    }
  }
}
