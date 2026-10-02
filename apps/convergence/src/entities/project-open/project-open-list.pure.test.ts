import { describe, expect, it } from 'vitest'
import type { ProjectOpenApp } from './project-open.types'
import {
  DETECTING_APPS_LABEL,
  NO_APPS_FOUND_LABEL,
  openInLabel,
  projectOpenNote,
} from './project-open-list.pure'

const cursor: ProjectOpenApp = { id: 'cursor', label: 'Cursor', kind: 'editor' }

describe('an "Open in" list (NAV-25, DLG-29)', () => {
  it('names each app for where it opens', () => {
    expect(openInLabel(cursor)).toBe('Open in Cursor')
    expect(openInLabel({ label: 'Finder' })).toBe('Open in Finder')
  })

  it('lists its apps once they are found', () => {
    expect(projectOpenNote({ apps: [cursor], loading: false })).toBeNull()
  })

  it('says why it lists nothing, the reason first', () => {
    expect(
      projectOpenNote({
        apps: [],
        loading: true,
        unavailableReason: 'No project path available',
      }),
    ).toBe('No project path available')
    expect(projectOpenNote({ apps: [], loading: true })).toBe(
      DETECTING_APPS_LABEL,
    )
    expect(
      projectOpenNote({ apps: [], loading: false, unavailableReason: null }),
    ).toBe(NO_APPS_FOUND_LABEL)
  })
})
