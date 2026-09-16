import { describe, expect, it } from 'vitest'
import {
  isPathInside,
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
      name: 'glob path pattern apps/**/.env matches zero intermediate segments',
      path: 'apps/.env',
      patterns: ['apps/**/.env'],
      expected: true,
    },
    {
      name: 'glob path pattern rejects root .env',
      path: '.env',
      patterns: ['apps/**/.env'],
      expected: false,
    },
    {
      name: 'question-mark path pattern matches one segment char',
      path: 'a/x',
      patterns: ['?/x'],
      expected: true,
    },
    {
      name: 'question-mark path pattern rejects two-char segment',
      path: 'ab/x',
      patterns: ['?/x'],
      expected: false,
    },
    {
      name: 'dollar in path pattern matches literal $',
      path: 'apps/a$b/.env.local',
      patterns: ['apps/a$b/.env*'],
      expected: true,
    },
  ])('$name', ({ path, patterns, expected }) => {
    expect(matchesWorkspaceEnvFilePattern(path, patterns)).toBe(expected)
  })

  it('does not throw on a question-mark path pattern', () => {
    expect(() => matchesWorkspaceEnvFilePattern('a/x', ['?/x'])).not.toThrow()
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

  it('drops skip-list segments by exact equality, not substring', () => {
    expect(
      selectWorkspaceEnvPaths(
        [
          'apps/a/.env',
          'node_modules/x/.env',
          'apps/a/dist/.env',
          'coverage/.env.local',
          'dist-tools/.env',
          '.github/.env',
        ],
        defaults,
        WORKSPACE_ENV_PATH_SKIP_SEGMENTS,
      ).sort(),
    ).toEqual(['.github/.env', 'apps/a/.env', 'dist-tools/.env'])
  })
})

describe('isPathInside', () => {
  it('accepts the same path and nested children', () => {
    expect(isPathInside('/tmp/ws', '/tmp/ws')).toBe(true)
    expect(isPathInside('/tmp/ws/apps/a', '/tmp/ws')).toBe(true)
  })

  it('rejects siblings and parents', () => {
    expect(isPathInside('/tmp/outside', '/tmp/ws')).toBe(false)
    expect(isPathInside('/tmp', '/tmp/ws')).toBe(false)
  })

  it('rejects a prefix that is not a path-segment boundary (MAR-2778 G)', () => {
    expect(isPathInside('/tmp/ws2', '/tmp/ws')).toBe(false)
    expect(isPathInside('/tmp/ws-evil/x', '/tmp/ws')).toBe(false)
  })
})
