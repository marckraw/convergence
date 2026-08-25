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

function stubTurnsApi(...changes: TurnFileChange[]): ReturnType<typeof vi.fn> {
  const getFileDiff = vi
    .fn()
    .mockImplementation(
      (_turnId: string, filePath: string, repoRoot?: string | null) =>
        Promise.resolve(
          changes.find(
            (change) =>
              change.filePath === filePath &&
              (repoRoot === undefined || change.repoRoot === repoRoot),
          )?.diff ?? '',
        ),
    )

  Object.defineProperty(window, 'electronAPI', {
    configurable: true,
    writable: true,
    value: {
      turns: {
        listForSession: vi.fn().mockResolvedValue([TURN]),
        getFileChanges: vi.fn().mockResolvedValue(changes),
        getFileDiff,
        onTurnDelta: vi.fn().mockReturnValue(() => {}),
      },
    },
  })

  return getFileDiff
}

async function selectTheChangedFile(): Promise<void> {
  fireEvent.click(await screen.findByRole('button', { name: 'src/parser.ts' }))
}

const TRUNCATED_NOTICE =
  'Diff truncated — this is a fragment, not the whole change.'
const BINARY_NOTICE = 'Binary file — there is no textual diff to show.'

const ROOT_LABEL = '(workspace root)'

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

  it('asks for the diff of the repository the selected change belongs to', async () => {
    const getFileDiff = stubTurnsApi(
      fileChange({ id: 'root', repoRoot: null, filePath: 'src/parser.ts' }),
    )

    render(<TurnList sessionId="session-1" />)
    await selectTheChangedFile()

    // Null is a repository -- the working-directory root -- and the lookup has
    // to say so, because a turn's other rows may belong to other repositories
    // at the same path (MAR-2589).
    await waitFor(() => {
      expect(getFileDiff).toHaveBeenCalledWith('turn-1', 'src/parser.ts', null)
    })
  })

  it('renders a single-repository turn as bare paths, exactly as before', async () => {
    stubTurnsApi(
      fileChange({ id: 'a', repoRoot: null, filePath: 'src/parser.ts' }),
      fileChange({ id: 'b', repoRoot: null, filePath: 'src/lexer.ts' }),
    )

    render(<TurnList sessionId="session-1" />)

    expect(
      await screen.findByRole('button', { name: 'src/parser.ts' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'src/lexer.ts' }),
    ).toBeInTheDocument()
    expect(screen.queryByText(new RegExp(ROOT_LABEL, 'i'))).toBeNull()
  })

  it('draws one row per repository when two repositories changed the same path', async () => {
    const getFileDiff = stubTurnsApi(
      fileChange({
        id: 'web',
        repoRoot: 'apps/web',
        filePath: 'README.md',
        diff: 'web readme diff',
      }),
      fileChange({
        id: 'api',
        repoRoot: 'apps/api',
        filePath: 'README.md',
        diff: 'api readme diff',
      }),
      fileChange({
        id: 'root',
        repoRoot: null,
        filePath: 'README.md',
        diff: 'root readme diff',
      }),
    )

    render(<TurnList sessionId="session-1" />)

    // Keyed by path alone the tree draws one row and two of the three diffs
    // are unreachable from the UI.
    const webRow = await screen.findByRole('button', {
      name: 'apps/web/README.md',
    })
    expect(
      screen.getByRole('button', { name: 'apps/api/README.md' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: `${ROOT_LABEL}/README.md` }),
    ).toBeInTheDocument()

    fireEvent.click(webRow)
    await waitFor(() => {
      expect(getFileDiff).toHaveBeenCalledWith(
        'turn-1',
        'README.md',
        'apps/web',
      )
    })

    fireEvent.click(screen.getByRole('button', { name: 'apps/api/README.md' }))
    await waitFor(() => {
      expect(getFileDiff).toHaveBeenCalledWith(
        'turn-1',
        'README.md',
        'apps/api',
      )
    })
  })

  it('reads the notices off the repository the selection names', async () => {
    stubTurnsApi(
      fileChange({
        id: 'web',
        repoRoot: 'apps/web',
        filePath: 'README.md',
        truncated: false,
        diff: 'diff --git a/README.md\n+whole',
      }),
      fileChange({
        id: 'api',
        repoRoot: 'apps/api',
        filePath: 'README.md',
        truncated: true,
        diff: '[diff truncated: 4210 lines]',
      }),
    )

    render(<TurnList sessionId="session-1" />)

    // Same path, opposite facts. A lookup that matched on path alone would
    // find whichever row came first and describe the wrong change.
    fireEvent.click(
      await screen.findByRole('button', { name: 'apps/api/README.md' }),
    )
    expect(await screen.findByText(TRUNCATED_NOTICE)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'apps/web/README.md' }))
    await waitFor(() => {
      expect(screen.queryByText(TRUNCATED_NOTICE)).not.toBeInTheDocument()
    })
  })
})
