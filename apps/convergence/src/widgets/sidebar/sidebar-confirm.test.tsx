import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppSettingsStore } from '@/entities/app-settings'
import { useDialogStore } from '@/entities/dialog'
import { useSessionStore, type SessionSummary } from '@/entities/session'
import { UiProvider } from '@convergence/ui'
import { Sidebar } from './sidebar.container'

vi.mock('@/features', async () => {
  const actual =
    await vi.importActual<typeof import('@/features')>('@/features')
  const Empty = () => null
  return {
    ...actual,
    AppSettingsDialogContainer: Empty,
    SpaceWorkboardDialogContainer: Empty,
    McpServersDialogContainer: Empty,
    ProjectContextSettings: Empty,
    ProjectCreateDialogContainer: Empty,
    ProjectSettingsDialogContainer: Empty,
    PromptLibraryBrowserDialogContainer: Empty,
    ProviderStatusDialogContainer: Empty,
    ReleaseNotesDialogContainer: Empty,
    SkillsBrowserDialogContainer: Empty,
    SpaceCreateDialogContainer: Empty,
    ThemeToggleButton: Empty,
    WorkspaceCreateDialogContainer: Empty,
    LaneCreateDialogContainer: Empty,
  }
})

const chat: SessionSummary = {
  id: 'global-session-1',
  contextKind: 'global',
  projectId: null,
  workspaceId: null,
  providerId: 'claude-code',
  model: 'sonnet',
  effort: 'medium',
  name: 'Planning chat',
  status: 'completed',
  attention: 'finished',
  activity: null,
  workingDirectory: '/tmp/convergence/global',
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

const noop = vi.fn()

function renderChatSidebar() {
  return render(
    <UiProvider>
      <Sidebar
        activeSurface="chat"
        onSelectSurface={noop}
        onSelectSession={noop}
        activeSessionId={null}
        onSelectGlobalSession={noop}
        onNewGlobalSession={noop}
        selectedSpaceId={null}
        onSelectSpace={noop}
        activeGlobalSessionId={null}
        collapsed={false}
        peek={false}
        onCollapse={noop}
        onExpand={noop}
        onPeek={noop}
        onPinPeek={noop}
      />
    </UiProvider>,
  )
}

/** Opens the chat's actions and chooses Delete session…, which asks. */
async function askToDelete() {
  fireEvent.click(
    await screen.findByRole('button', {
      name: 'Chat session actions Planning chat',
    }),
  )
  fireEvent.click(
    await screen.findByRole('menuitem', { name: 'Delete session…' }),
  )
  return screen.findByRole('alertdialog', {
    name: 'Delete “Planning chat”?',
  })
}

describe('MAR-3616 R5: deleting a conversation asks first', () => {
  const deleteSession = vi.fn().mockResolvedValue(undefined)

  beforeEach(() => {
    deleteSession.mockClear()
    useDialogStore.setState({ openDialog: null, payload: null })
    useAppSettingsStore.setState({ isLoaded: true, error: null })
    useSessionStore.setState({ globalChatSessions: [chat], deleteSession })
    ;(window as unknown as { electronAPI: unknown }).electronAPI = {
      provider: {
        getAll: vi.fn().mockResolvedValue([]),
        getAllAvailable: vi.fn().mockResolvedValue([]),
      },
      appSettings: {
        get: vi.fn(),
        set: vi.fn(),
        sweepExecutionHostCredentials: vi.fn().mockResolvedValue([]),
        onUpdated: vi.fn(() => () => {}),
      },
      executionHost: {
        sessionCountsByEndpoint: vi.fn().mockResolvedValue([]),
      },
    }
  })

  it('in the app’s dialog, with the red button naming the action and the focus on Cancel — mutation delete without asking turns red', async () => {
    const nativeConfirm = vi.spyOn(window, 'confirm')
    renderChatSidebar()
    const question = await askToDelete()
    // Asked, not done: nothing is deleted before the answer.
    expect(deleteSession).not.toHaveBeenCalled()
    expect(question).toHaveTextContent('deleted for good')
    const cancel = within(question).getByRole('button', { name: 'Cancel' })
    await waitFor(() => expect(cancel).toHaveFocus())
    fireEvent.click(
      within(question).getByRole('button', { name: 'Delete session' }),
    )
    await waitFor(() =>
      expect(deleteSession).toHaveBeenCalledWith('global-session-1', null),
    )
    expect(nativeConfirm).not.toHaveBeenCalled()
  })

  it('Cancel keeps the conversation — mutation ignore the answer turns red', async () => {
    renderChatSidebar()
    const question = await askToDelete()
    fireEvent.click(within(question).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    expect(deleteSession).not.toHaveBeenCalled()
  })
})
