import { act, render, screen, waitFor } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ConversationItem, Session } from '@/entities/session'
import type { BlockSentenceData } from '@/shared/types/electron-api'
import { turnWorkBlocks } from '../../../electron/backend/block-sentence/block-sentence-blocks.pure'
import { SessionTranscript } from './session-transcript.container'
import { WorkBlockRow } from './work-block.presentational'
import { useTranscriptViewStore } from './transcript-view.model'

vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: (options: {
    count: number
    estimateSize: (index: number) => number
    getItemKey?: (index: number) => string | number | bigint
  }) => ({
    getVirtualItems: () =>
      Array.from({ length: options.count }, (_, index) => ({
        index,
        key: options.getItemKey?.(index) ?? index,
        start: index * options.estimateSize(index),
      })),
    getTotalSize: () => options.count * 160,
    measureElement: () => {},
    scrollToIndex: vi.fn(),
  }),
}))

const session: Session = {
  id: 'cv3-session',
  contextKind: 'project',
  projectId: 'p',
  workspaceId: 'w',
  providerId: 'claude-code',
  model: 'sonnet',
  effort: 'medium',
  name: 'CV3',
  status: 'completed',
  hasActiveHandle: false,
  attention: 'none',
  activity: null,
  workingDirectory: '/repo',
  contextWindow: null,
  archivedAt: null,
  parentSessionId: null,
  forkStrategy: null,
  primarySurface: 'conversation',
  continuationToken: null,
  lastSequence: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

let sequence = 0
function base(id: string) {
  sequence += 1
  return {
    id,
    sessionId: session.id,
    sequence,
    turnId: 'turn-1',
    state: 'complete' as const,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    providerMeta: {
      providerId: 'claude-code',
      providerItemId: null,
      providerEventType: null,
    },
  }
}
const read = (id: string): ConversationItem => ({
  ...base(id),
  kind: 'tool-call',
  toolName: 'Read',
  inputText: JSON.stringify({ file_path: `/repo/src/app/${id}.ts` }),
})
const answer = (id: string, of: string): ConversationItem => ({
  ...base(id),
  kind: 'tool-result',
  toolName: 'Read',
  relatedItemId: of,
  outputText: `contents of ${of}`,
})

const turn: ConversationItem[] = [
  { ...base('u1'), kind: 'message', actor: 'user', text: 'look' },
  read('r1'),
  answer('a1', 'r1'),
  read('r2'),
  answer('a2', 'r2'),
  { ...base('m1'), kind: 'message', actor: 'assistant', text: 'done' },
]

const SENTENCE = 'Read two app files under src/app.'

function stored(
  firstItemId: string,
  lastItemId: string,
  sentence = SENTENCE,
): BlockSentenceData {
  return {
    sessionId: session.id,
    firstItemId,
    lastItemId,
    sentence,
    model: 'gpt-6-luna',
    createdAt: '2026-01-01T00:00:00.000Z',
  }
}

let rows: BlockSentenceData[] = []
let announce: ((event: { sessionId: string }) => void) | null = null

beforeEach(() => {
  localStorage.clear()
  useTranscriptViewStore.setState({ modes: {}, openBlocks: new Set() })
  rows = []
  announce = null
  ;(window as unknown as { electronAPI: unknown }).electronAPI = {
    blockSentences: {
      list: vi.fn(async () => rows),
      onChanged: vi.fn((callback) => {
        announce = callback
        return () => {
          announce = null
        }
      }),
    },
  }
})

afterEach(() => {
  delete (window as unknown as { electronAPI?: unknown }).electronAPI
})

const renderTranscript = () =>
  render(
    <SessionTranscript
      session={session}
      conversationItems={turn}
      onApprove={vi.fn()}
      onDeny={vi.fn()}
      onInputAnswer={vi.fn()}
    />,
  )

const sentenceLine = () => screen.queryByTestId('work-block-sentence')

describe('MAR-3395 CV3 the model sentence beside the facts', () => {
  it('R1+R5 a sentence stored for the block main folded shows under the facts', async () => {
    // Main keys the block from the same items; the window must find it.
    const [block] = turnWorkBlocks(turn as never)
    rows = [stored(block!.firstItemId, block!.lastItemId)]
    renderTranscript()
    await waitFor(() => expect(sentenceLine()).not.toBeNull())
    expect({
      facts: screen.getByTestId('work-block').textContent,
      sentence: sentenceLine()?.textContent,
      key: [block!.firstItemId, block!.lastItemId],
    }).toEqual({
      facts: 'Read 2 files in src/app',
      sentence: SENTENCE,
      key: ['r1', 'a2'],
    })
  })

  it('R5 no sentence: the row is exactly CV1’s', async () => {
    renderTranscript()
    await act(async () => {})
    expect(sentenceLine()).toBeNull()
    const props = {
      label: 'Read 2 files in src/app',
      memberCount: 4,
      open: false,
      working: false,
      onToggle: () => {},
    }
    expect(
      renderToStaticMarkup(<WorkBlockRow {...props} sentence={null} />),
    ).toBe(renderToStaticMarkup(<WorkBlockRow {...props} />))
    expect(
      renderToStaticMarkup(<WorkBlockRow {...props} sentence={SENTENCE} />),
    ).not.toBe(renderToStaticMarkup(<WorkBlockRow {...props} />))
  })

  it('R5 a sentence written about other steps is not shown (same first item, different last)', async () => {
    rows = [stored('r1', 'r2')]
    renderTranscript()
    await act(async () => {})
    expect(sentenceLine()).toBeNull()
    expect(screen.getByTestId('work-block').textContent).toBe(
      'Read 2 files in src/app',
    )
  })

  it('R4 a sentence stored after the turn appears when main says so', async () => {
    renderTranscript()
    await act(async () => {})
    expect(sentenceLine()).toBeNull()
    rows = [stored('r1', 'a2')]
    await act(async () => {
      announce?.({ sessionId: 'another-session' })
    })
    expect(sentenceLine()).toBeNull()
    await act(async () => {
      announce?.({ sessionId: session.id })
    })
    await waitFor(() => expect(sentenceLine()?.textContent).toBe(SENTENCE))
  })

  it('R5 Full mode is unchanged: every entry as today, no sentence', async () => {
    rows = [stored('r1', 'a2')]
    useTranscriptViewStore.getState().setMode(session.id, 'full')
    renderTranscript()
    await act(async () => {})
    expect(screen.queryByTestId('work-block')).toBeNull()
    expect(sentenceLine()).toBeNull()
  })
})
