import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PROJECT_SETTINGS,
  normalizeProjectSettings,
} from './project-settings.pure'

describe('normalizeProjectSettings', () => {
  it('returns defaults for invalid values', () => {
    expect(normalizeProjectSettings(undefined)).toEqual(
      DEFAULT_PROJECT_SETTINGS,
    )
  })

  it('normalizes workspace creation settings', () => {
    expect(
      normalizeProjectSettings({
        workspaceCreation: {
          startStrategy: 'current-head',
          baseBranchName: ' main ',
        },
      }),
    ).toEqual({
      workspaceCreation: {
        startStrategy: 'current-head',
        baseBranchName: 'main',
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
          copyMode: 'disabled',
          patterns: [' .env.local ', '.env.local', 'nested/.env'],
        },
      }),
    ).toEqual({
      workspaceCreation: {
        startStrategy: 'base-branch',
        baseBranchName: null,
      },
      workspaceEnvFiles: {
        copyMode: 'disabled',
        patterns: ['.env.local'],
      },
    })
  })
})
