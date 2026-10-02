import { describe, expect, it } from 'vitest'
import { failureTitle, reasonOf } from './notify.pure'

describe('failureTitle (R10)', () => {
  it('writes "Couldn’t <verb> <thing>." with one full stop', () => {
    expect(failureTitle('update Codex')).toBe('Couldn’t update Codex.')
    expect(failureTitle('open the project.')).toBe('Couldn’t open the project.')
    expect(failureTitle('  sync the env files  ')).toBe(
      'Couldn’t sync the env files.',
    )
  })
})

describe('reasonOf', () => {
  it('reads an Error’s message and a string as they came', () => {
    expect(reasonOf(new Error('npm exited with code 1'))).toBe(
      'npm exited with code 1',
    )
    expect(reasonOf('The folder is read-only.')).toBe(
      'The folder is read-only.',
    )
  })

  it('says nothing for nothing, a blank message or a value that isn’t text', () => {
    expect(reasonOf(undefined)).toBeUndefined()
    expect(reasonOf(null)).toBeUndefined()
    expect(reasonOf('   ')).toBeUndefined()
    expect(reasonOf(new Error(''))).toBeUndefined()
    expect(reasonOf({ code: 42 })).toBeUndefined()
  })
})
