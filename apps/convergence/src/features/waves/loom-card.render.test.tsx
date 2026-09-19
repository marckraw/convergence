import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render } from '@testing-library/react'
import { useSessionStore } from '@/entities/session'
import { useSessionCrewStore } from '@/entities/session-crew'
import { useWorkLedgerStore } from '@/entities/work-ledger'
import { WavePanel } from './wave-panel.container'
import { saveWavePanelMode } from './wave-panel-mode.api'
import { WaveRowView } from './wave-row.presentational'
import { boundCrewWith, ledgerEntry } from './wave-rows.fixture'
import { sectionWaveRows } from './wave-sections.pure'

const NOW = Date.parse('2026-09-17T12:10:00.000Z')
const LABELS = ['groomed', 'wave › loom-view']
const entry = () =>
  ledgerEntry({
    issueIdentifier: 'EX-1',
    trackerStatus: 'In Review',
    fact: { ...ledgerEntry({ issueIdentifier: 'EX-1' }).fact, labels: LABELS },
  })
const chipWords = (card: Element, kind: 'status' | 'label') =>
  Array.from(
    card.querySelectorAll(`[data-loom-chip="${kind}"]`),
    (chip) => chip.textContent,
  )

afterEach(() => {
  cleanup()
  delete (window as unknown as { electronAPI?: unknown }).electronAPI
  localStorage.clear()
  vi.restoreAllMocks()
})

describe('MAR-3199: Loom card chips', () => {
  it.each(['In Progress', 'Reviewed', '', 'In Review'])(
    'R1: one status chip reads tracker status %j',
    (trackerStatus) => {
      const row = sectionWaveRows([{ ...entry(), trackerStatus }], NOW)
        .inTheWave[0]
      const { container } = render(
        <WaveRowView
          appearance="loom"
          row={row}
          inertReason={null}
          onOpen={vi.fn()}
        />,
      )
      expect(chipWords(container, 'status')).toEqual([
        `Linear: ${trackerStatus || 'not seen'}`,
      ])
    },
  )

  it.each([LABELS, [], undefined].map((labels) => ({ labels })))(
    'R2: label facts $labels are shown in order without inventions',
    ({ labels }) => {
      const fact = { ...entry().fact }
      if (labels === undefined) delete fact.labels
      else fact.labels = labels
      const row = sectionWaveRows([{ ...entry(), fact }], NOW).inTheWave[0]
      const { container } = render(
        <WaveRowView
          appearance="loom"
          row={row}
          inertReason={null}
          onOpen={vi.fn()}
        />,
      )
      expect(chipWords(container, 'label')).toEqual(labels ?? [])
      const wrapper = container.querySelector(
        '[data-loom-chip="status"]',
      )!.parentElement!
      expect(wrapper.textContent).toBe(
        ['Linear: In Review', ...(labels ?? [])].join(''),
      )
    },
  )

  it('R4: the non-Loom appearance has no chips', () => {
    const row = sectionWaveRows([entry()], NOW).inTheWave[0]
    const { container } = render(
      <WaveRowView row={row} inertReason={null} onOpen={vi.fn()} />,
    )
    expect(container.querySelectorAll('[data-loom-chip]')).toHaveLength(0)
  })

  it('R5: the rendered meta line uses preparation wording without an invented lap', () => {
    const row = sectionWaveRows(
      [{ ...entry(), state: 'assigned', seat: null }],
      NOW,
    ).waitingToStart[0]
    const { getByText } = render(
      <WaveRowView
        appearance="loom"
        row={row}
        inertReason={null}
        onOpen={vi.fn()}
      />,
    )
    expect(getByText('no seat · in preparation')).toBeTruthy()
  })

  it.each(['compact', 'expanded'] as const)(
    'R3: real %s panel passes Loom appearance to Now cards',
    async (mode) => {
      vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(1440)
      saveWavePanelMode(mode)
      const crew = boundCrewWith('crew-1', 'Loom', [])
      const snapshot = {
        crewId: crew.id,
        entries: [entry()],
        trackerHealth: {
          state: 'ok' as const,
          since: '2026-09-17T12:00:00.000Z',
          lastOkAt: '2026-09-17T12:00:00.000Z',
          backoffUntil: null,
        },
      }
      ;(window as unknown as { electronAPI: unknown }).electronAPI = {
        crew: {
          list: vi.fn(async () => [crew]),
          onUpdated: vi.fn(() => () => {}),
        },
        workLedger: {
          list: vi.fn(async () => snapshot),
          onUpdated: vi.fn(() => () => {}),
        },
      }
      useSessionStore.setState({ globalSessions: [] })
      useSessionCrewStore.setState({ crews: [] })
      useWorkLedgerStore.setState({
        snapshots: {},
        broadcastCount: {},
        error: null,
        unsubscribeBroadcast: null,
      })
      await act(async () => {
        render(<WavePanel />)
      })
      const card = document.querySelector(
        '[data-loom-sheet="now"] [data-wave-row="crew-1:EX-1"]',
      )
      expect(card).not.toBeNull()
      expect(chipWords(card!, 'status')).toEqual(['Linear: In Review'])
      expect(chipWords(card!, 'label')).toEqual(LABELS)
    },
  )
})
