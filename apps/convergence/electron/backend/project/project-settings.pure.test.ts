import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PROJECT_SETTINGS,
  normalizeProjectSettings,
} from './project-settings.pure'

describe('normalizeProjectSettings', () => {
  it('returns defaults for invalid values', () => {
    expect(normalizeProjectSettings(null)).toEqual(DEFAULT_PROJECT_SETTINGS)
  })

  it('normalizes workspace creation settings', () => {
    expect(
      normalizeProjectSettings({
        workspaceCreation: {
          startStrategy: 'current-head',
          baseBranchName: ' master ',
        },
      }),
    ).toEqual({
      workspaceCreation: {
        startStrategy: 'current-head',
        baseBranchName: 'master',
      },
      workspaceEnvFiles: {
        copyMode: 'copy-missing',
        patterns: ['.env', '.env.*'],
      },
    })
  })

  it('normalizes workspace env file settings', () => {
    expect(
      normalizeProjectSettings({
        workspaceEnvFiles: {
          copyMode: 'overwrite',
          patterns: [' .env.local ', '../bad', '.env.local', '.env.secret'],
        },
      }),
    ).toEqual({
      workspaceCreation: {
        startStrategy: 'base-branch',
        baseBranchName: null,
      },
      workspaceEnvFiles: {
        copyMode: 'overwrite',
        patterns: ['.env.local', '.env.secret'],
      },
    })
  })
})
