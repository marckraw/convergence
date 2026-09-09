import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import type { ConversationItem } from '@/entities/session'
import type { SessionAgentRun } from '@/shared/types/harness-evidence.types'
import { buildParallelWork } from '@/shared/lib/parallel-work.pure'
import { parallelWorkMarkers } from './parallel-work.pure'
import { ParallelWorkMarkerView } from './parallel-work-marker.presentational'

it('R4 renders spawn, launch and real return in order with identity links — mutation launch becomes return or marker follows final row status turns red', () => {
  const run = {
    id: 'agent',
    spawnedByItemId: 'spawn',
    description: 'Read routes',
    agentType: 'Explore',
    status: 'completed',
  } as SessionAgentRun
  const items = [
    { id: 'spawn', kind: 'tool-call', toolName: 'Agent', providerMeta: {} },
    {
      id: 'launch',
      kind: 'tool-result',
      relatedItemId: 'spawn',
      providerMeta: { providerEventType: 'tool_result.async_launched' },
    },
    {
      id: 'return',
      kind: 'note',
      taskId: 'agent',
      providerMeta: { providerEventType: 'harness.task.terminal' },
    },
  ] as ConversationItem[]
  const markers = parallelWorkMarkers(items, buildParallelWork([run], [], []))
  const select = vi.fn()
  render(
    <>
      {[...markers].map(([id, marker]) => (
        <ParallelWorkMarkerView key={id} marker={marker} onSelect={select} />
      ))}
    </>,
  )
  const buttons = screen.queryAllByRole('button')
  buttons.forEach((button) => fireEvent.click(button))
  expect({
    labels: buttons.map((button) => button.textContent),
    selected: select.mock.calls,
  }).toEqual({
    labels: [
      '↳Started Explore · Read routes↗',
      '↳launched · Read routes↗',
      '↳Result returned · Read routes · completed↗',
    ],
    selected: [['agent'], ['agent'], ['agent']],
  })
})
