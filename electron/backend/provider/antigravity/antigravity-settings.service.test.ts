import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AntigravitySettingsService } from './antigravity-settings.service'

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

async function waitFor(
  predicate: () => boolean,
  timeoutMs = 500,
): Promise<void> {
  const startedAt = Date.now()
  while (!predicate()) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error('waitFor timed out')
    }
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
}

describe('AntigravitySettingsService', () => {
  let dir: string
  let settingsPath: string
  let lockPath: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'convergence-antigravity-settings-'))
    settingsPath = join(dir, 'settings.json')
    lockPath = join(dir, 'settings.lock')
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('writes temporary settings and removes the file again when none existed', async () => {
    const service = new AntigravitySettingsService({
      settingsPath,
      lockPath,
    })

    const result = await service.withTemporarySettings(
      {
        modelLabel: 'Gemini 3.5 Flash',
        statusLineCommand: '/tmp/statusline.sh',
      },
      async () => {
        const raw = await readFile(settingsPath, 'utf8')
        expect(JSON.parse(raw)).toEqual({
          model: 'Gemini 3.5 Flash',
          statusLine: {
            type: 'command',
            command: '/tmp/statusline.sh',
          },
        })
        return 'ok'
      },
    )

    expect(result).toBe('ok')
    expect(await exists(settingsPath)).toBe(false)
    expect(await exists(lockPath)).toBe(false)
  })

  it('restores the exact prior settings bytes after a failing operation', async () => {
    const original = '{\n  "enableTelemetry": false,\n  "model": "Old"\n}\n'
    await writeFile(settingsPath, original, 'utf8')
    const service = new AntigravitySettingsService({
      settingsPath,
      lockPath,
    })

    await expect(
      service.withTemporarySettings(
        { modelLabel: 'Gemini 3.1 Pro (high)' },
        async () => {
          const raw = await readFile(settingsPath, 'utf8')
          expect(JSON.parse(raw)).toMatchObject({
            enableTelemetry: false,
            model: 'Gemini 3.1 Pro (high)',
          })
          throw new Error('boom')
        },
      ),
    ).rejects.toThrow('boom')

    expect(await readFile(settingsPath, 'utf8')).toBe(original)
    expect(await exists(lockPath)).toBe(false)
  })

  it('serializes concurrent temporary settings mutations', async () => {
    const events: string[] = []
    const service = new AntigravitySettingsService({
      settingsPath,
      lockPath,
      lockRetryDelayMs: 5,
    })
    let releaseFirst!: () => void

    const first = service.withTemporarySettings(
      { modelLabel: 'First' },
      async () => {
        events.push('first-start')
        await new Promise<void>((resolve) => {
          releaseFirst = resolve
        })
        events.push('first-end')
      },
    )

    await waitFor(() => events.includes('first-start'))

    const second = service.withTemporarySettings(
      { modelLabel: 'Second' },
      async () => {
        events.push('second-start')
      },
    )

    await new Promise((resolve) => setTimeout(resolve, 25))
    expect(events).toEqual(['first-start'])

    releaseFirst()
    await Promise.all([first, second])
    expect(events).toEqual(['first-start', 'first-end', 'second-start'])
  })

  it('times out when the settings lock remains held', async () => {
    await mkdir(lockPath)
    const service = new AntigravitySettingsService({
      settingsPath,
      lockPath,
      lockRetryDelayMs: 5,
      lockTimeoutMs: 20,
    })

    await expect(
      service.withTemporarySettings(
        { modelLabel: 'Gemini 3 Flash' },
        async () => {
          throw new Error('should not run')
        },
      ),
    ).rejects.toThrow('Timed out waiting for Antigravity settings lock')
  })
})
