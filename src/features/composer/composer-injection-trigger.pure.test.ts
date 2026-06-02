import { describe, expect, it } from 'vitest'
import {
  detectComposerInjectionTrigger,
  filterComposerInjectionRootItems,
  replaceComposerInjectionRange,
  resolveComposerInjectionAlias,
} from './composer-injection-trigger.pure'

describe('resolveComposerInjectionAlias', () => {
  it('resolves short and canonical aliases', () => {
    expect(resolveComposerInjectionAlias('c')).toBe('context')
    expect(resolveComposerInjectionAlias('context')).toBe('context')
    expect(resolveComposerInjectionAlias('p')).toBe('prompt')
    expect(resolveComposerInjectionAlias('prompt')).toBe('prompt')
    expect(resolveComposerInjectionAlias('s')).toBe('skill')
    expect(resolveComposerInjectionAlias('skill')).toBe('skill')
  })

  it('normalizes case and whitespace', () => {
    expect(resolveComposerInjectionAlias(' Skill ')).toBe('skill')
  })

  it('rejects unsupported aliases', () => {
    expect(resolveComposerInjectionAlias('skills')).toBeNull()
    expect(resolveComposerInjectionAlias('prompts')).toBeNull()
    expect(resolveComposerInjectionAlias('x')).toBeNull()
    expect(resolveComposerInjectionAlias('')).toBeNull()
  })
})

describe('detectComposerInjectionTrigger', () => {
  it('opens the root picker for bare "::"', () => {
    expect(detectComposerInjectionTrigger('::', 2)).toEqual({
      open: true,
      kind: 'root',
      query: '',
      range: { start: 0, end: 2 },
    })
  })

  it('uses text after bare "::" as root picker query', () => {
    expect(detectComposerInjectionTrigger('::sk', 4)).toEqual({
      open: true,
      kind: 'root',
      query: 'sk',
      range: { start: 0, end: 4 },
    })
  })

  it('opens context injection for short and canonical aliases', () => {
    expect(detectComposerInjectionTrigger('::c::api', 8)).toEqual({
      open: true,
      kind: 'context',
      alias: 'c',
      query: 'api',
      range: { start: 0, end: 8 },
    })

    expect(detectComposerInjectionTrigger('::context::api', 14)).toEqual({
      open: true,
      kind: 'context',
      alias: 'context',
      query: 'api',
      range: { start: 0, end: 14 },
    })
  })

  it('opens skill injection for short and canonical aliases', () => {
    expect(detectComposerInjectionTrigger('::s::diagnose', 13)).toEqual({
      open: true,
      kind: 'skill',
      alias: 's',
      query: 'diagnose',
      range: { start: 0, end: 13 },
    })

    expect(detectComposerInjectionTrigger('::skill::diagnose', 17)).toEqual({
      open: true,
      kind: 'skill',
      alias: 'skill',
      query: 'diagnose',
      range: { start: 0, end: 17 },
    })
  })

  it('opens prompt injection for short and canonical aliases', () => {
    expect(detectComposerInjectionTrigger('::p::daily', 10)).toEqual({
      open: true,
      kind: 'prompt',
      alias: 'p',
      query: 'daily',
      range: { start: 0, end: 10 },
    })

    expect(detectComposerInjectionTrigger('::prompt::daily', 15)).toEqual({
      open: true,
      kind: 'prompt',
      alias: 'prompt',
      query: 'daily',
      range: { start: 0, end: 15 },
    })
  })

  it('opens namespaced injections with an empty query', () => {
    expect(detectComposerInjectionTrigger('::skill::', 9)).toEqual({
      open: true,
      kind: 'skill',
      alias: 'skill',
      query: '',
      range: { start: 0, end: 9 },
    })
  })

  it('opens after a whitespace boundary inside a message', () => {
    const text = 'please use ::s::review'
    expect(detectComposerInjectionTrigger(text, text.length)).toEqual({
      open: true,
      kind: 'skill',
      alias: 's',
      query: 'review',
      range: { start: 11, end: 22 },
    })
  })

  it('does not open for mid-word triggers', () => {
    expect(detectComposerInjectionTrigger('foo::s::bar', 11)).toEqual({
      open: false,
    })
  })

  it('does not open after whitespace inside the query', () => {
    expect(detectComposerInjectionTrigger('::skill::foo bar', 16)).toEqual({
      open: false,
    })
  })

  it('does not open for triple-colon prefixes', () => {
    expect(detectComposerInjectionTrigger(':::', 3)).toEqual({ open: false })
    expect(detectComposerInjectionTrigger(':::skill', 8)).toEqual({
      open: false,
    })
  })

  it('rejects unsupported namespaced aliases', () => {
    expect(detectComposerInjectionTrigger('::x::foo', 8)).toEqual({
      open: false,
    })
    expect(detectComposerInjectionTrigger('::skills::foo', 13)).toEqual({
      open: false,
    })
    expect(detectComposerInjectionTrigger('::prompts::foo', 14)).toEqual({
      open: false,
    })
  })

  it('supports cursor positions while typing a root query', () => {
    expect(detectComposerInjectionTrigger('::skill', 4)).toEqual({
      open: true,
      kind: 'root',
      query: 'sk',
      range: { start: 0, end: 4 },
    })
  })

  it('supports cursor positions while typing a namespaced query', () => {
    expect(detectComposerInjectionTrigger('::skill::diagnose', 12)).toEqual({
      open: true,
      kind: 'skill',
      alias: 'skill',
      query: 'dia',
      range: { start: 0, end: 12 },
    })
  })

  it('closes when cursor is outside the active token', () => {
    expect(detectComposerInjectionTrigger('::skill::diagnose', 1)).toEqual({
      open: false,
    })
  })
})

describe('replaceComposerInjectionRange', () => {
  it('replaces the trigger range and returns the new cursor', () => {
    expect(
      replaceComposerInjectionRange(
        'use ::context::api please',
        { start: 4, end: 18 },
        'API_CONTEXT',
      ),
    ).toEqual({
      text: 'use API_CONTEXT please',
      cursor: 15,
    })
  })

  it('can remove a trigger range when selecting chip-based resources', () => {
    expect(
      replaceComposerInjectionRange(
        'use ::s::review please',
        { start: 4, end: 15 },
        '',
      ),
    ).toEqual({
      text: 'use  please',
      cursor: 4,
    })
  })
})

describe('filterComposerInjectionRootItems', () => {
  it('returns context and skill items when both are enabled', () => {
    expect(
      filterComposerInjectionRootItems({
        query: '',
        includeContext: true,
        includePrompt: true,
        includeSkill: true,
      }).map((item) => item.kind),
    ).toEqual(['context', 'skill', 'prompt'])
  })

  it('omits context when project context is unavailable', () => {
    expect(
      filterComposerInjectionRootItems({
        query: '',
        includeContext: false,
        includePrompt: true,
        includeSkill: true,
      }).map((item) => item.kind),
    ).toEqual(['skill', 'prompt'])
  })

  it('filters by alias and label text', () => {
    expect(
      filterComposerInjectionRootItems({
        query: 's',
        includeContext: true,
        includePrompt: true,
        includeSkill: true,
      }).map((item) => item.kind),
    ).toEqual(['skill'])

    expect(
      filterComposerInjectionRootItems({
        query: 'p',
        includeContext: true,
        includePrompt: true,
        includeSkill: true,
      }).map((item) => item.kind),
    ).toEqual(['prompt'])

    expect(
      filterComposerInjectionRootItems({
        query: 'context',
        includeContext: true,
        includePrompt: true,
        includeSkill: true,
      }).map((item) => item.kind),
    ).toEqual(['context'])
  })

  it('returns no items for unsupported root queries', () => {
    expect(
      filterComposerInjectionRootItems({
        query: 'zzz',
        includeContext: true,
        includePrompt: true,
        includeSkill: true,
      }),
    ).toEqual([])
  })
})
