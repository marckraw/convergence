import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SIDEBAR,
  DEFAULT_SIDEBAR_LAYOUT,
  MAX_SIDEBAR,
  MIN_SIDEBAR,
  parseSidebarLayout,
  serializeSidebarLayout,
} from './sidebar-layout.pure'

describe('the sidebar layout between launches (NAV-16)', () => {
  it('reads back what it wrote', () => {
    const layout = { width: 312, collapsed: true }
    expect(parseSidebarLayout(serializeSidebarLayout(layout))).toEqual(layout)
  })

  it('starts at the default when nothing was kept', () => {
    expect(parseSidebarLayout(null)).toEqual(DEFAULT_SIDEBAR_LAYOUT)
  })

  it('reads an entry it cannot understand as the default', () => {
    for (const raw of ['', 'wide', '{', '42', 'null', '[]']) {
      expect(parseSidebarLayout(raw)).toEqual(DEFAULT_SIDEBAR_LAYOUT)
    }
    expect(
      parseSidebarLayout(JSON.stringify({ width: 'wide', collapsed: 'yes' })),
    ).toEqual({ width: DEFAULT_SIDEBAR, collapsed: false })
  })

  it('honours a width outside the range as far as the range allows', () => {
    expect(parseSidebarLayout(JSON.stringify({ width: 900 })).width).toBe(
      MAX_SIDEBAR,
    )
    expect(parseSidebarLayout(JSON.stringify({ width: 10 })).width).toBe(
      MIN_SIDEBAR,
    )
  })
})
