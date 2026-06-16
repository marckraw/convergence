import { describe, expect, it } from 'vitest'
import {
  buildClaudeQuotaUnavailableSnapshot,
  mapClaudeUsagePayloadsToQuotaSnapshot,
  resolveAsarUnpackedPath,
  resolveCcusageNativeBinaryPath,
  resolveCcusageNativePackageName,
} from './claude-quota.pure'

describe('ccusage native package resolution', () => {
  it('maps supported platform and architecture pairs', () => {
    expect(resolveCcusageNativePackageName('darwin', 'arm64')).toBe(
      '@ccusage/ccusage-darwin-arm64',
    )
    expect(resolveCcusageNativePackageName('darwin', 'x64')).toBe(
      '@ccusage/ccusage-darwin-x64',
    )
    expect(resolveCcusageNativePackageName('linux', 'arm64')).toBe(
      '@ccusage/ccusage-linux-arm64',
    )
    expect(resolveCcusageNativePackageName('linux', 'x64')).toBe(
      '@ccusage/ccusage-linux-x64',
    )
    expect(resolveCcusageNativePackageName('win32', 'arm64')).toBe(
      '@ccusage/ccusage-win32-arm64',
    )
    expect(resolveCcusageNativePackageName('win32', 'x64')).toBe(
      '@ccusage/ccusage-win32-x64',
    )
  })

  it('returns null for unsupported ccusage native targets', () => {
    expect(resolveCcusageNativePackageName('freebsd', 'x64')).toBeNull()
    expect(resolveCcusageNativePackageName('darwin', 'ia32')).toBeNull()
  })

  it('uses the Windows executable path only on Windows', () => {
    expect(resolveCcusageNativeBinaryPath('win32')).toBe('bin/ccusage.exe')
    expect(resolveCcusageNativeBinaryPath('darwin')).toBe('bin/ccusage')
  })

  it('maps packaged asar paths to the unpacked filesystem location', () => {
    expect(
      resolveAsarUnpackedPath(
        '/Applications/Convergence.app/Contents/Resources/app.asar/node_modules/@ccusage/ccusage-darwin-arm64/bin/ccusage',
      ),
    ).toBe(
      '/Applications/Convergence.app/Contents/Resources/app.asar.unpacked/node_modules/@ccusage/ccusage-darwin-arm64/bin/ccusage',
    )
    expect(
      resolveAsarUnpackedPath(
        'C:\\Program Files\\Convergence\\resources\\app.asar\\node_modules\\@ccusage\\ccusage-win32-x64\\bin\\ccusage.exe',
      ),
    ).toBe(
      'C:\\Program Files\\Convergence\\resources\\app.asar.unpacked\\node_modules\\@ccusage\\ccusage-win32-x64\\bin\\ccusage.exe',
    )
  })

  it('leaves non-asar paths unchanged', () => {
    expect(
      resolveAsarUnpackedPath(
        '/repo/node_modules/@ccusage/ccusage-darwin-arm64/bin/ccusage',
      ),
    ).toBe('/repo/node_modules/@ccusage/ccusage-darwin-arm64/bin/ccusage')
  })
})

describe('mapClaudeUsagePayloadsToQuotaSnapshot', () => {
  it('maps current weekly usage and active 5-hour block from ccusage JSON', () => {
    const snapshot = mapClaudeUsagePayloadsToQuotaSnapshot(
      {
        weekly: [
          {
            week: '2026-06-07',
            totalTokens: 191_180_820,
            totalCost: 285.7294,
          },
        ],
      },
      {
        blocks: [
          {
            startTime: '2026-06-11T11:00:00.000Z',
            endTime: '2026-06-11T16:00:00.000Z',
            isActive: true,
            isGap: false,
            totalTokens: 18_108_881,
            costUSD: 38.8181,
          },
        ],
      },
      '2026-06-11T14:00:00.000Z',
    )

    expect(snapshot).toMatchObject({
      providerId: 'claude-code',
      status: 'available',
      source: 'local-usage-log',
      lastCheckedAt: '2026-06-11T14:00:00.000Z',
    })
    expect(snapshot.windows).toEqual([
      {
        kind: 'five-hour',
        label: 'Current 5-hour Claude usage',
        usedPercent: 60,
        remainingPercent: 40,
        windowMinutes: 300,
        resetsAt: '2026-06-11T16:00:00.000Z',
        displayMode: 'observed-usage',
        valueLabel: '18.1M tokens, $38.82',
        resetLabel: 'Ends',
      },
      {
        kind: 'weekly',
        label: "This week's Claude usage",
        usedPercent: 65.47619047619048,
        remainingPercent: 34.52380952380952,
        windowMinutes: 10_080,
        resetsAt: '2026-06-14T00:00:00.000Z',
        displayMode: 'observed-usage',
        valueLabel: '191.2M tokens, $285.73',
        resetLabel: 'Ends',
      },
    ])
  })

  it('omits inactive Claude windows without marking the provider unavailable', () => {
    const snapshot = mapClaudeUsagePayloadsToQuotaSnapshot(
      { weekly: [] },
      { blocks: [] },
      '2026-06-11T14:00:00.000Z',
    )

    expect(snapshot.windows).toEqual([])
  })
})

describe('buildClaudeQuotaUnavailableSnapshot', () => {
  it('uses local usage logs as the unavailable source', () => {
    expect(
      buildClaudeQuotaUnavailableSnapshot(
        'ccusage failed.',
        '2026-06-11T14:00:00.000Z',
      ),
    ).toEqual({
      providerId: 'claude-code',
      status: 'unavailable',
      source: 'local-usage-log',
      reason: 'ccusage failed.',
      usageUrl: 'https://claude.ai/new#settings/usage',
      lastCheckedAt: '2026-06-11T14:00:00.000Z',
      stale: false,
    })
  })
})
