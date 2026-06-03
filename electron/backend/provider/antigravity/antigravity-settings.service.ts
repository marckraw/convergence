import { homedir } from 'os'
import { dirname, join } from 'path'
import { mkdir, readFile, rm, writeFile } from 'fs/promises'

export interface AntigravityTemporarySettingsPatch {
  modelLabel?: string | null
  statusLineCommand?: string | null
}

export interface AntigravitySettingsServiceOptions {
  settingsPath?: string
  lockPath?: string
  lockTimeoutMs?: number
  lockRetryDelayMs?: number
}

interface OriginalSettings {
  existed: boolean
  raw: string | null
  parsed: Record<string, unknown>
}

const DEFAULT_LOCK_TIMEOUT_MS = 10_000
const DEFAULT_LOCK_RETRY_DELAY_MS = 25

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

async function restoreOriginalSettings(
  settingsPath: string,
  original: OriginalSettings,
): Promise<void> {
  if (original.existed) {
    await mkdir(dirname(settingsPath), { recursive: true })
    await writeFile(settingsPath, original.raw ?? '', 'utf8')
    return
  }

  await rm(settingsPath, { force: true })
}

async function acquireSettingsLock(input: {
  lockPath: string
  timeoutMs: number
  retryDelayMs: number
}): Promise<() => Promise<void>> {
  await mkdir(dirname(input.lockPath), { recursive: true })
  const startedAt = Date.now()

  while (true) {
    try {
      await mkdir(input.lockPath)
      return async () => {
        await rm(input.lockPath, { recursive: true, force: true })
      }
    } catch (error) {
      const isBusy =
        !!error &&
        typeof error === 'object' &&
        (error as { code?: unknown }).code === 'EEXIST'
      if (!isBusy) throw error

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

  constructor(options: AntigravitySettingsServiceOptions = {}) {
    this.settingsPath =
      options.settingsPath ?? getDefaultAntigravitySettingsPath()
    this.lockPath = options.lockPath ?? `${this.settingsPath}.convergence-lock`
    this.lockTimeoutMs = options.lockTimeoutMs ?? DEFAULT_LOCK_TIMEOUT_MS
    this.lockRetryDelayMs =
      options.lockRetryDelayMs ?? DEFAULT_LOCK_RETRY_DELAY_MS
  }

  async withTemporarySettings<T>(
    patch: AntigravityTemporarySettingsPatch,
    operation: () => Promise<T>,
  ): Promise<T> {
    const release = await acquireSettingsLock({
      lockPath: this.lockPath,
      timeoutMs: this.lockTimeoutMs,
      retryDelayMs: this.lockRetryDelayMs,
    })

    try {
      const original = await readOriginalSettings(this.settingsPath)
      const next = applyTemporaryPatch(original.parsed, patch)

      await mkdir(dirname(this.settingsPath), { recursive: true })
      await writeFile(
        this.settingsPath,
        `${JSON.stringify(next, null, 2)}\n`,
        'utf8',
      )

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
