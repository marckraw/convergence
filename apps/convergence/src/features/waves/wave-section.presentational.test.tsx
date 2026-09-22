import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { WaveSectionView } from './wave-section.presentational'
import { LoomSheetView } from './loom-sheet.presentational'
import { loomSheets } from './loom-sheets.pure'
import { ledgerEntry } from './wave-rows.fixture'
import {
  LOOM_BEFORE_WIDE_CLASS,
  LOOM_NOW_WIDE_CLASS,
} from './wave-panel.styles'
import { LOOM_DONE_IS_NOT_RELEASED } from './loom-before.pure'

const now = Date.parse('2026-09-22T12:00:00Z')
const sheets = loomSheets(
  [
    ledgerEntry({ issueIdentifier: 'MAR-1', state: 'done', wave: 'one' }),
    ledgerEntry({ issueIdentifier: 'MAR-2', state: 'done', wave: 'two' }),
    ledgerEntry({
      issueIdentifier: 'MAR-3',
      state: 'done',
      seenAt: '2026-08-01T12:00:00Z',
    }),
  ],
  now,
)
const base = { inertReason: () => null, onOpen: vi.fn() }
const rows = () => [
  ...document.querySelectorAll<HTMLElement>('[data-wave-row]'),
]
const grids = () =>
  [...document.querySelectorAll('div')].filter(
    (el) => el.className === LOOM_BEFORE_WIDE_CLASS,
  )
afterEach(cleanup)

describe('MAR-3301 section layout', () => {
  it.each([undefined, 'open', 'closed'] as const)(
    'grid wraps only rows, disclosure=%s',
    (disclosure) => {
      render(
        <WaveSectionView
          {...base}
          title="Finished"
          rows={sheets.before.slice(0, 2)}
          appearance="loom"
          layout="grid"
          disclosure={disclosure}
          hint="A hint"
          footer={<button>More</button>}
        />,
      )
      const grid = rows()[0]!.parentElement!
      expect(grid.tagName).toBe('DIV')
      expect(grid.className).toBe(LOOM_BEFORE_WIDE_CLASS)
      expect(grid.className).toBe(
        'grid grid-cols-[repeat(auto-fill,minmax(min(100%,360px),1fr))] items-start gap-3',
      )
      expect(grid.children).toHaveLength(2)
      expect(grid.contains(screen.getByText('Finished · 2'))).toBe(false)
      expect(grid.contains(screen.getByText('A hint'))).toBe(false)
      for (const row of rows()) expect(row.className).not.toMatch(/\bmb-/)
      if (disclosure)
        expect(grid.parentElement!.hasAttribute('open')).toBe(
          disclosure === 'open',
        )
      else expect(grid.contains(screen.getByText('More'))).toBe(false)
    },
  )
  it.each([undefined, 'list'] as const)(
    'list preserves direct row children and margins, layout=%s',
    (layout) => {
      render(
        <WaveSectionView
          {...base}
          title="Finished"
          rows={sheets.before}
          appearance="loom"
          layout={layout}
        />,
      )
      expect(grids()).toHaveLength(0)
      for (const row of rows()) {
        expect(row.parentElement!.tagName).toBe('SECTION')
        expect(row.classList.contains('mb-2')).toBe(true)
      }
    },
  )
})

describe('MAR-3301 Before sheet width', () => {
  it.each([true, false])(
    'all groups including searched older use width=%s',
    (wide) => {
      render(
        <LoomSheetView
          {...base}
          sheet="before"
          sheets={sheets}
          now={now}
          horses={[]}
          qaExpanded={false}
          onToggleQa={vi.fn()}
          wide={wide}
          search={{
            summary: {
              total: 3,
              notFound: false,
              bySheet: { before: 3, now: 0, next: 0, plan: 0 },
              elsewhere: [],
            },
            nowhere: '',
            shownHorses: [],
          }}
        />,
      )
      expect(rows()).toHaveLength(3)
      expect(grids()).toHaveLength(wide ? 3 : 0)
      for (const row of rows()) {
        expect(row.parentElement!.className === LOOM_BEFORE_WIDE_CLASS).toBe(
          wide,
        )
        expect(row.classList.contains('mb-2')).toBe(!wide)
      }
      for (const group of document.querySelectorAll('details'))
        expect(group.open).toBe(true)
      expect(screen.getByText(LOOM_DONE_IS_NOT_RELEASED)).toBeTruthy()
    },
  )
  it('unsearched Before keeps only newest group open', () => {
    render(
      <LoomSheetView
        {...base}
        sheet="before"
        sheets={sheets}
        now={now}
        horses={[]}
        qaExpanded={false}
        onToggleQa={vi.fn()}
        wide
      />,
    )
    expect(grids()).toHaveLength(2)
    expect(
      [...document.querySelectorAll('details')].map((group) => group.open),
    ).toEqual([true, false])
    expect(screen.getByText('1 older issue not shown')).toBeTruthy()
  })
  it('Now retains its own wide container', () => {
    render(
      <LoomSheetView
        {...base}
        sheet="now"
        sheets={sheets}
        now={now}
        horses={[]}
        qaExpanded={false}
        onToggleQa={vi.fn()}
        wide
      />,
    )
    expect(
      screen.getByRole('region', { name: 'Horses' }).parentElement!.className,
    ).toBe(LOOM_NOW_WIDE_CLASS)
    expect(grids()).toHaveLength(0)
  })
})
