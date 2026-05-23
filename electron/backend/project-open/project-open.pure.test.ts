import { describe, expect, it } from 'vitest'
import { detectProjectOpenApps } from './project-open.pure'

describe('detectProjectOpenApps', () => {
  it('always includes Finder on macOS', () => {
    expect(
      detectProjectOpenApps({
        platform: 'darwin',
        homeDir: '/Users/marc',
        exists: () => false,
      }),
    ).toEqual([{ id: 'finder', label: 'Finder', kind: 'file-manager' }])
  })

  it('includes editors detected from standard app locations', () => {
    const apps = detectProjectOpenApps({
      platform: 'darwin',
      homeDir: '/Users/marc',
      exists: (path) => path === '/Applications/Visual Studio Code.app',
    })

    expect(apps).toContainEqual({
      id: 'vscode',
      label: 'VS Code',
      kind: 'editor',
    })
    expect(apps).toContainEqual({
      id: 'finder',
      label: 'Finder',
      kind: 'file-manager',
    })
    expect(apps).not.toContainEqual(expect.objectContaining({ id: 'webstorm' }))
  })

  it('includes editors detected from Spotlight bundle ids', () => {
    const apps = detectProjectOpenApps({
      platform: 'darwin',
      homeDir: '/Users/marc',
      exists: () => false,
      spotlightPathsByBundleId: {
        'com.cursor.cursor': ['/Volumes/Dev/Cursor.app'],
      },
    })

    expect(apps).toContainEqual({
      id: 'cursor',
      label: 'Cursor',
      kind: 'editor',
    })
  })

  it('includes WebStorm from Spotlight without a Toolbox candidate path', () => {
    const apps = detectProjectOpenApps({
      platform: 'darwin',
      homeDir: '/Users/marc',
      exists: (path) => path.includes('JetBrains Toolbox'),
      spotlightPathsByBundleId: {
        'com.jetbrains.WebStorm': [
          '/Users/marc/Library/Application Support/JetBrains/Toolbox/apps/WebStorm/ch-0/WebStorm.app',
        ],
      },
    })

    expect(apps).toContainEqual({
      id: 'webstorm',
      label: 'WebStorm',
      kind: 'editor',
    })
  })

  it('omits Finder on other platforms', () => {
    expect(
      detectProjectOpenApps({
        platform: 'linux',
        homeDir: '/home/marc',
        exists: () => true,
      }),
    ).toEqual([
      { id: 'cursor', label: 'Cursor', kind: 'editor' },
      { id: 'vscode', label: 'VS Code', kind: 'editor' },
      { id: 'zed', label: 'Zed', kind: 'editor' },
      { id: 'webstorm', label: 'WebStorm', kind: 'editor' },
    ])
  })
})
