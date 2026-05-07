import { describe, expect, it } from 'vitest'
import {
  buildPierreChangedFilesTreeInput,
  mapChangedFileStatusToPierre,
  normalizeChangedFilePath,
} from './changed-files-tree.pure'

describe('Pierre changed files tree helpers', () => {
  it('maps Git porcelain statuses to Pierre statuses', () => {
    expect(mapChangedFileStatusToPierre('M')).toBe('modified')
    expect(mapChangedFileStatusToPierre('A')).toBe('added')
    expect(mapChangedFileStatusToPierre('D')).toBe('deleted')
    expect(mapChangedFileStatusToPierre('R')).toBe('renamed')
    expect(mapChangedFileStatusToPierre('??')).toBe('untracked')
    expect(mapChangedFileStatusToPierre('!!')).toBe('ignored')
    expect(mapChangedFileStatusToPierre('MM')).toBe('modified')
  })

  it('passes already-normalized Pierre statuses through', () => {
    expect(mapChangedFileStatusToPierre('added')).toBe('added')
    expect(mapChangedFileStatusToPierre('modified')).toBe('modified')
    expect(mapChangedFileStatusToPierre('deleted')).toBe('deleted')
    expect(mapChangedFileStatusToPierre('renamed')).toBe('renamed')
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
