import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getFallbackPathEntries } from './shell-path.win32.pure'

const ENV_KEYS = [
  'LOCALAPPDATA',
  'APPDATA',
  'ProgramFiles',
  'ProgramFiles(x86)',
] as const

describe('shell-path.win32.pure', () => {
  const savedEnv: Record<string, string | undefined> = {}

  beforeEach(() => {
    for (const key of ENV_KEYS) {
      savedEnv[key] = process.env[key]
    }
    process.env.LOCALAPPDATA = 'C:\\Users\\Test\\AppData\\Local'
    process.env.APPDATA = 'C:\\Users\\Test\\AppData\\Roaming'
    process.env['ProgramFiles'] = 'C:\\Program Files'
    process.env['ProgramFiles(x86)'] = 'C:\\Program Files (x86)'
  })

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (savedEnv[key] === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = savedEnv[key]
      }
    }
  })

  it('includes Git for Windows install locations', () => {
    const entries = getFallbackPathEntries()

    expect(entries).toContain('C:\\Program Files\\Git\\cmd')
    expect(entries).toContain('C:\\Program Files\\Git\\bin')
    expect(entries).toContain('C:\\Program Files (x86)\\Git\\cmd')
  })

  it('includes user-scoped install locations (npm, Scoop, bun, cargo)', () => {
    const entries = getFallbackPathEntries()

    const hasNpm = entries.some((entry) => entry.endsWith('\\npm'))
    const hasScoop = entries.some((entry) => entry.endsWith('\\scoop\\shims'))
    const hasBun = entries.some((entry) => entry.endsWith('\\.bun\\bin'))
    const hasCargo = entries.some((entry) => entry.endsWith('\\.cargo\\bin'))

    expect(hasNpm).toBe(true)
    expect(hasScoop).toBe(true)
    expect(hasBun).toBe(true)
    expect(hasCargo).toBe(true)
  })

  it('falls back to defaults when Windows env vars are missing', () => {
    delete process.env.LOCALAPPDATA
    delete process.env.APPDATA
    delete process.env['ProgramFiles']
    delete process.env['ProgramFiles(x86)']

    const entries = getFallbackPathEntries()

    expect(entries.length).toBeGreaterThan(0)
    expect(entries).toContain('C:\\Program Files\\Git\\cmd')
  })
})
