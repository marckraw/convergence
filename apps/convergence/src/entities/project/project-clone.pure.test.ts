import { describe, expect, it } from 'vitest'
import { deriveCloneFolderName } from './project-clone.pure'

describe('deriveCloneFolderName', () => {
  it('derives a default folder name from Git remote URLs', () => {
    expect(deriveCloneFolderName('https://github.com/acme/app.git')).toBe('app')
    expect(deriveCloneFolderName('git@github.com:acme/app.git')).toBe('app')
  })

  it('returns an empty string for empty input', () => {
    expect(deriveCloneFolderName('')).toBe('')
  })
})
