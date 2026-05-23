import { describe, expect, it } from 'vitest'
import { PROJECT_SCRIPT_ICON_OPTIONS } from './project-script-icons.pure'

describe('PROJECT_SCRIPT_ICON_OPTIONS', () => {
  it('keeps the default play icon available first', () => {
    expect(PROJECT_SCRIPT_ICON_OPTIONS[0]).toEqual({
      id: 'play',
      label: 'Run',
    })
  })

  it('uses unique icon ids', () => {
    const ids = PROJECT_SCRIPT_ICON_OPTIONS.map((option) => option.id)

    expect(new Set(ids).size).toBe(ids.length)
  })
})
