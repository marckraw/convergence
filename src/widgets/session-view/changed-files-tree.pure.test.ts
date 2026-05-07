import { describe, expect, it } from 'vitest'
import {
  buildPierreChangedFilesTreeInput,
  mapGitStatusToPierre,
  normalizeChangedFilePath,
} from './changed-files-tree.pure'

describe('Pierre changed files tree helpers', () => {
  it('maps Git porcelain statuses to Pierre statuses', () => {
    expect(mapGitStatusToPierre('M')).toBe('modified')
    expect(mapGitStatusToPierre('A')).toBe('added')
    expect(mapGitStatusToPierre('D')).toBe('deleted')
    expect(mapGitStatusToPierre('R')).toBe('renamed')
    expect(mapGitStatusToPierre('??')).toBe('untracked')
    expect(mapGitStatusToPierre('!!')).toBe('ignored')
    expect(mapGitStatusToPierre('MM')).toBe('modified')
  })

  it('normalizes local changed-file paths for Pierre', () => {
    expect(normalizeChangedFilePath('./src\\app.ts')).toBe('src/app.ts')
    expect(normalizeChangedFilePath('  docs/spec.md  ')).toBe('docs/spec.md')
  })

  it('builds path-first Pierre tree input and note counts', () => {
    const treeInput = buildPierreChangedFilesTreeInput({
      files: [
        { status: 'M', file: './src\\app.ts' },
        { status: '??', file: 'src/new.ts' },
        { status: 'D', file: 'docs/old.md' },
        { status: 'A', file: 'src/new.ts' },
      ],
      noteCountsByPath: new Map([
        ['src/app.ts', 2],
        ['src/new.ts', 0],
        ['docs/old.md', 1],
      ]),
    })

    expect(treeInput.paths).toEqual(['src/app.ts', 'src/new.ts', 'docs/old.md'])
    expect(treeInput.gitStatus).toEqual([
      { path: 'src/app.ts', status: 'modified' },
      { path: 'src/new.ts', status: 'added' },
      { path: 'docs/old.md', status: 'deleted' },
    ])
    expect([...treeInput.noteCountsByPath.entries()]).toEqual([
      ['src/app.ts', 2],
      ['docs/old.md', 1],
    ])
  })
})
