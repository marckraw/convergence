import { describe, expect, it } from 'vitest'
import {
  CLAUDE_ACCOUNT_PRIVATE_ENTRIES,
  detectAccountDirDrift,
  planAccountDirEntries,
} from './provider-account-manifest.pure'

/** What PA0 actually observed in a shared profile after one turn. */
const SHARED_ENTRIES = [
  'agents',
  'backups',
  'commands',
  'CLAUDE.md',
  'plugins',
  'projects',
  'sessions',
  'session-env',
  'settings.json',
  'skills',
  'todos',
]

describe('planAccountDirEntries', () => {
  it('shares everything except the explicit per-account list', () => {
    const plan = planAccountDirEntries(SHARED_ENTRIES)

    expect(plan.private).toEqual(['backups'])
    expect(plan.shared).toEqual([
      'CLAUDE.md',
      'agents',
      'commands',
      'plugins',
      'projects',
      'session-env',
      'sessions',
      'settings.json',
      'skills',
      'todos',
    ])
  })

  it('shares an entry nobody has heard of, rather than partitioning it', () => {
    // The polarity that matters: a future Claude release adding state must fail
    // toward over-sharing, which is visible, not silent partition, which is not.
    const plan = planAccountDirEntries([...SHARED_ENTRIES, 'brand-new-thing'])

    expect(plan.shared).toContain('brand-new-thing')
    expect(plan.private).not.toContain('brand-new-thing')
  })

  it('keeps identity and its backups per-account', () => {
    const plan = planAccountDirEntries(['.claude.json', 'backups', 'skills'])

    expect(plan.private).toEqual(['.claude.json', 'backups'])
    expect(plan.shared).toEqual(['skills'])
  })

  it('handles an empty or absent shared directory', () => {
    expect(planAccountDirEntries([])).toEqual({ shared: [], private: [] })
  })
})

describe('detectAccountDirDrift', () => {
  it('reports nothing for an account directory that matches the manifest', () => {
    const drift = detectAccountDirDrift({
      sharedEntries: SHARED_ENTRIES,
      accountEntries: [
        ...SHARED_ENTRIES.filter((entry) => entry !== 'backups'),
        '.claude.json',
      ],
    })

    expect(drift).toEqual({ unknownEntries: [], missingLinks: [] })
  })

  it('surfaces an entry a future Claude release invented', () => {
    const drift = detectAccountDirDrift({
      sharedEntries: ['skills'],
      accountEntries: ['skills', '.claude.json', 'credentials-v2'],
    })

    expect(drift.unknownEntries).toEqual(['credentials-v2'])
  })

  it('surfaces a shared entry that was never linked in', () => {
    const drift = detectAccountDirDrift({
      sharedEntries: ['skills', 'agents'],
      accountEntries: ['skills'],
    })

    expect(drift.missingLinks).toEqual(['agents'])
  })

  it('does not call the per-account entries drift', () => {
    const drift = detectAccountDirDrift({
      sharedEntries: [],
      accountEntries: [...CLAUDE_ACCOUNT_PRIVATE_ENTRIES],
    })

    expect(drift.unknownEntries).toEqual([])
  })
})
