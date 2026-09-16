import { describe, expect, it } from 'vitest'
import {
  matchesWorkspaceEnvFilePattern,
  selectWorkspaceEnvPaths,
  WORKSPACE_ENV_PATH_SKIP_SEGMENTS,
} from './workspace-env.pure'

describe('matchesWorkspaceEnvFilePattern', () => {
  it('matches env files from default root-level patterns', () => {
    expect(matchesWorkspaceEnvFilePattern('.env', ['.env', '.env.*'])).toBe(
      true,
    )
    expect(
      matchesWorkspaceEnvFilePattern('.env.local', ['.env', '.env.*']),
    ).toBe(true)
  })

  it('skips common template env files', () => {
    expect(
      matchesWorkspaceEnvFilePattern('.env.example', ['.env', '.env.*']),
    ).toBe(false)
    expect(
      matchesWorkspaceEnvFilePattern('.env.production.sample', [
        '.env',
        '.env.*',
      ]),
    ).toBe(false)
  })

  it('ignores unrelated files', () => {
    expect(
      matchesWorkspaceEnvFilePattern('README.md', ['.env', '.env.*']),
    ).toBe(false)
  })

  it.each([
    {
      name: 'default .env at root',
      path: '.env',
      patterns: ['.env', '.env.*'],
      expected: true,
    },
    {
      name: 'default .env nested under apps',
      path: 'apps/a/.env',
      patterns: ['.env', '.env.*'],
      expected: true,
    },
    {
      name: 'default .env.* nested local',
      path: 'apps/b/.env.local',
      patterns: ['.env', '.env.*'],
      expected: true,
    },
    {
      name: 'template at depth is excluded',
      path: 'apps/a/.env.example',
      patterns: ['.env', '.env.*'],
      expected: false,
    },
    {
      name: 'exact path pattern',
      path: 'apps/a/.env',
      patterns: ['apps/a/.env'],
      expected: true,
    },
    {
      name: 'exact path pattern rejects sibling',
      path: 'apps/b/.env',
      patterns: ['apps/a/.env'],
      expected: false,
    },
    {
      name: 'glob path pattern apps/**/.env',
      path: 'apps/a/.env',
      patterns: ['apps/**/.env'],
      expected: true,
    },
    {
      name: 'glob path pattern rejects root .env',
      path: '.env',
      patterns: ['apps/**/.env'],
      expected: false,
    },
  ])('$name', ({ path, patterns, expected }) => {
    expect(matchesWorkspaceEnvFilePattern(path, patterns)).toBe(expected)
  })
})

describe('selectWorkspaceEnvPaths', () => {
  const defaults = ['.env', '.env.*']

  it('keeps nested project env files and drops templates', () => {
    expect(
      selectWorkspaceEnvPaths(
        [
          '.env',
          'apps/a/.env',
          'apps/b/.env.local',
          'apps/a/.env.example',
          'README.md',
        ],
        defaults,
      ).sort(),
    ).toEqual(['.env', 'apps/a/.env', 'apps/b/.env.local'])
  })

  it('drops skip-list segments even when the basename matches', () => {
    expect(
      selectWorkspaceEnvPaths(
        [
          'apps/a/.env',
          'node_modules/x/.env',
          'apps/a/dist/.env',
          'coverage/.env.local',
        ],
        defaults,
        WORKSPACE_ENV_PATH_SKIP_SEGMENTS,
      ),
    ).toEqual(['apps/a/.env'])
  })
})
