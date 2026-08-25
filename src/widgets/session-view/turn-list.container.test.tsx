import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Turn, TurnFileChange } from '@/entities/turn'
import { TurnList } from './turn-list.container'

/**
 * `@pierre/trees` is the file tree widget, not the seam under test. Replacing
 * it with plain buttons keeps the path from a record's flags to rendered text
 * real — the notice mount, the selection lookup and the copy are all the
 * production ones (MAR-2577).
 */
vi.mock('./changed-files-tree-model.container', () => {
  interface MockTreeProps {
    treeInput: { paths: string[] }
    onSelectFile?: (file: string) => void
  }

  return {
    ChangedFilesTreeModel: ({ treeInput, onSelectFile }: MockTreeProps) => (
      <div>
        {treeInput.paths.map((path) => (
          <button key={path} type="button" onClick={() => onSelectFile?.(path)}>
            {path}
          </button>
        ))}
      </div>
    ),
  }
})

const TURN: Turn = {
  id: 'turn-1',
  sessionId: 'session-1',
  sequence: 1,
  startedAt: '2026-08-23T00:00:00.000Z',
  endedAt: '2026-08-23T00:01:00.000Z',
  status: 'completed',
  summary: 'Rewrote the parser',
  providerAccountId: null,
  model: null,
  effort: null,
}

function fileChange(overrides: Partial<TurnFileChange> = {}): TurnFileChange {
  return {
    id: 'change-1',
    sessionId: 'session-1',
    turnId: 'turn-1',
    repoRoot: null,
    filePath: 'src/parser.ts',
    oldPath: null,
    status: 'modified',
    additions: 0,
    deletions: 0,
    diff: '[diff truncated: 4210 lines]',
    truncated: false,
    binary: false,
    createdAt: '2026-08-23T00:01:00.000Z',
    ...overrides,
  }
}

function stubTurnsApi(change: TurnFileChange): void {
  Object.defineProperty(window, 'electronAPI', {
    configurable: true,
    writable: true,
    value: {
      turns: {
        listForSession: vi.fn().mockResolvedValue([TURN]),
        getFileChanges: vi.fn().mockResolvedValue([change]),
        getFileDiff: vi.fn().mockResolvedValue(change.diff),
        onTurnDelta: vi.fn().mockReturnValue(() => {}),
      },
    },
  })
}

async function selectTheChangedFile(): Promise<void> {
  fireEvent.click(await screen.findByRole('button', { name: 'src/parser.ts' }))
}

const TRUNCATED_NOTICE =
  'Diff truncated — this is a fragment, not the whole change.'
const BINARY_NOTICE = 'Binary file — there is no textual diff to show.'

describe('TurnList', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('says a selected diff is a fragment when the record says it was cut', async () => {
    stubTurnsApi(fileChange({ truncated: true }))

    render(<TurnList sessionId="session-1" />)
    await selectTheChangedFile()

    expect(await screen.findByText(TRUNCATED_NOTICE)).toBeInTheDocument()
  })

  it('says a selected diff is a marker when the record says the file is binary', async () => {
    stubTurnsApi(fileChange({ binary: true, diff: '[binary file change]' }))

    render(<TurnList sessionId="session-1" />)
    await selectTheChangedFile()

    expect(await screen.findByText(BINARY_NOTICE)).toBeInTheDocument()
  })

  /**
   * The one that makes the two above mean something: identical rendering path,
   * identical diff text, and the only difference is the flag on the record.
   */
  it('says nothing above a diff the record reports as whole', async () => {
    stubTurnsApi(fileChange({ diff: 'diff --git a/src/parser.ts\n+one line' }))

    render(<TurnList sessionId="session-1" />)
    await selectTheChangedFile()

    // The diff pane header only renders once a file is selected, so waiting for
    // it is waiting for the same render the notices would have appeared in.
    await waitFor(() => {
      expect(screen.getByText('Turn diff')).toBeInTheDocument()
    })
    expect(screen.queryByText(TRUNCATED_NOTICE)).not.toBeInTheDocument()
    expect(screen.queryByText(BINARY_NOTICE)).not.toBeInTheDocument()
  })
})
