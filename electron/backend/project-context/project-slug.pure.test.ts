import { describe, expect, it } from 'vitest'
import { projectNameToSlug } from './project-slug.pure'

describe('projectNameToSlug', () => {
  it('lowercases ASCII names', () => {
    expect(projectNameToSlug('Convergence')).toBe('convergence')
  })

  it('replaces spaces and punctuation with single dashes', () => {
    expect(projectNameToSlug('My Awesome Repo')).toBe('my-awesome-repo')
    expect(projectNameToSlug('repo.name_v2')).toBe('repo-name-v2')
  })

  it('collapses runs of non-alphanumeric chars into a single dash', () => {
    expect(projectNameToSlug('foo   ___   bar')).toBe('foo-bar')
    expect(projectNameToSlug('a---b')).toBe('a-b')
  })

  it('prepends p- when the slug starts with a digit', () => {
    expect(projectNameToSlug('123-numbers')).toBe('p-123-numbers')
    expect(projectNameToSlug('9lives')).toBe('p-9lives')
  })

  it('strips non-ASCII without transliteration', () => {
    expect(projectNameToSlug('Über-Project ✨')).toBe('ber-project')
    expect(projectNameToSlug('日本語')).toBe('convergence')
    expect(projectNameToSlug('hello 世界')).toBe('hello')
  })

  it('returns the fallback when the input is empty or only punctuation', () => {
    expect(projectNameToSlug('')).toBe('convergence')
    expect(projectNameToSlug('   ')).toBe('convergence')
    expect(projectNameToSlug('---')).toBe('convergence')
    expect(projectNameToSlug('!!!')).toBe('convergence')
  })

  it('caps the slug at 64 characters', () => {
    const longName = 'a'.repeat(200)
    const slug = projectNameToSlug(longName)
    expect(slug.length).toBe(64)
    expect(slug).toBe('a'.repeat(64))
  })

  it('trims trailing dashes after the length cap', () => {
    const tricky = 'a'.repeat(63) + ' more text after'
    const slug = projectNameToSlug(tricky)
    expect(slug.endsWith('-')).toBe(false)
    expect(slug.length).toBeLessThanOrEqual(64)
  })

  it('caps and trims even after the leading-digit prefix is added', () => {
    const longDigits = '9' + 'a'.repeat(80)
    const slug = projectNameToSlug(longDigits)
    expect(slug.startsWith('p-')).toBe(true)
    expect(slug.length).toBeLessThanOrEqual(64)
    expect(slug.endsWith('-')).toBe(false)
  })

  it('trims leading and trailing dashes from the final result', () => {
    expect(projectNameToSlug('   leading-and-trailing   ')).toBe(
      'leading-and-trailing',
    )
    expect(projectNameToSlug('-foo-')).toBe('foo')
  })
})
