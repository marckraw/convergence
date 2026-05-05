import { describe, expect, it } from 'vitest'
import {
  getChangedFilesEmptyMessage,
  getChangedFilesHeaderLabel,
  selectChangedFileAfterReload,
} from './changed-files.pure'

const base = {
  branchName: 'beta',
  comparisonRef: 'origin/beta',
  source: 'project-settings' as const,
  warning: null,
}

describe('changed files panel helpers', () => {
  it('derives mode-specific header labels', () => {
    expect(
      getChangedFilesHeaderLabel({
        mode: 'working-tree',
        count: 2,
        base: null,
      }),
    ).toBe('Changed Files (2)')

    expect(
      getChangedFilesHeaderLabel({
        mode: 'base-branch',
        count: 3,
        base,
      }),
    ).toBe('Against beta (3)')

    expect(
      getChangedFilesHeaderLabel({
        mode: 'turns',
        count: 0,
        base: null,
      }),
    ).toBe('Turns')
  })

  it('derives mode-specific empty states', () => {
    expect(
      getChangedFilesEmptyMessage({
        mode: 'working-tree',
        loading: false,
        base: null,
        error: null,
      }),
    ).toBe('No working tree changes detected')

    expect(
      getChangedFilesEmptyMessage({
        mode: 'base-branch',
        loading: false,
        base,
        error: null,
      }),
    ).toBe('No changes against beta detected')
  })

  it('prefers loading and error states over empty copy', () => {
    expect(
      getChangedFilesEmptyMessage({
        mode: 'base-branch',
        loading: true,
        base: null,
        error: null,
      }),
    ).toBe('Loading base branch changes...')

    expect(
      getChangedFilesEmptyMessage({
        mode: 'base-branch',
        loading: false,
        base: null,
        error: 'Base branch not found: beta',
      }),
    ).toBe('Base branch not found: beta')
  })

  it('keeps selected file after reload only when it still exists', () => {
    const files = [
      { status: 'M', file: 'a.ts' },
      { status: 'M', file: 'b.ts' },
    ]

    expect(selectChangedFileAfterReload({ current: 'b.ts', files })).toBe(
      'b.ts',
    )
    expect(selectChangedFileAfterReload({ current: 'missing.ts', files })).toBe(
      'a.ts',
    )
    expect(selectChangedFileAfterReload({ current: null, files: [] })).toBe(
      null,
    )
  })
})
