import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppSettingsStore } from '@/entities/app-settings'
import { useDialogStore } from '@/entities/dialog'
import { TooltipProvider } from '@/shared/ui/tooltip'
import { Sidebar } from './sidebar.container'

vi.mock('@/features', async () => {
  const { AppSettingsDialogContainer } = await import('@/features/app-settings')
  const Passthrough = ({ trigger }: { trigger?: import('react').ReactNode }) =>
    trigger ?? null
  const Empty = () => null
  return {
    AppSettingsDialogContainer,
    SpaceWorkboardDialogContainer: Passthrough,
    McpServersDialogContainer: Passthrough,
    ProjectContextSettings: Empty,
    ProjectCreateDialogContainer: Empty,
    ProjectSettingsDialogContainer: Passthrough,
    PromptLibraryBrowserDialogContainer: Passthrough,
    ProviderStatusDialogContainer: Passthrough,
    ReleaseNotesDialogContainer: Passthrough,
    SkillsBrowserDialogContainer: Passthrough,
    SpaceCreateDialogContainer: Empty,
    ThemeToggleButton: Empty,
    WorkspaceCreateDialogContainer: Empty,
    LaneCreateDialogContainer: Empty,
  }
})

const hover = async (control: Element) => {
  await act(async () => {
    fireEvent.pointerMove(control, { pointerType: 'mouse' })
  })
  return screen.findByRole('tooltip')
}

const noop = vi.fn()

function renderSidebar(collapsed: boolean) {
  return render(
    <TooltipProvider>
      <Sidebar
        activeSurface="code"
        onSelectSurface={noop}
        onSelectSession={noop}
        activeSessionId={null}
        onSelectGlobalSession={noop}
        onNewGlobalSession={noop}
        selectedSpaceId={null}
        onSelectSpace={noop}
        activeGlobalSessionId={null}
        collapsed={collapsed}
        peek={false}
        onCollapse={noop}
        onExpand={noop}
        onPeek={noop}
        onPinPeek={noop}
      />
    </TooltipProvider>,
  )
}

describe('MAR-3358 R1: the gear opens settings', () => {
  beforeEach(() => {
    useDialogStore.setState({ openDialog: null, payload: null })
    useAppSettingsStore.setState({ isLoaded: true, error: null })
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
      credentials: {
        executionHostDaemon: {
          environmentOverride: vi.fn().mockResolvedValue({
            configured: false,
            envKey: 'CONVERGENCE_EXECUTION_HOST_DAEMON_TOKEN',
            endpointId: 'default',
          }),
        },
      },
      executionHost: {
        sessionCountsByEndpoint: vi.fn().mockResolvedValue([]),
      },
    }
  })

  it('expanded header gear opens the Settings dialog', async () => {
    renderSidebar(false)
    fireEvent.click(screen.getByRole('button', { name: 'Open settings' }))
    // Mutation: wrap this gear in Tooltip and pass it as DialogTrigger -> red.
    expect(
      await screen.findByRole('dialog', { name: 'Settings' }),
    ).toBeInTheDocument()
  })

  it('collapsed footer gear opens the Settings dialog', async () => {
    renderSidebar(true)
    fireEvent.click(screen.getByRole('button', { name: 'Open settings' }))
    // Mutation: wrap this gear in Tooltip and pass it as DialogTrigger -> red.
    expect(
      await screen.findByRole('dialog', { name: 'Settings' }),
    ).toBeInTheDocument()
  })
})

describe('MAR-3358 R2: the gear keeps the shared tooltip', () => {
  beforeEach(() => {
    useDialogStore.setState({ openDialog: null, payload: null })
  })

  it('expanded header gear shows Open settings on hover, not a title', async () => {
    renderSidebar(false)
    const control = screen.getByRole('button', { name: 'Open settings' })
    expect(control.getAttribute('title')).toBeNull()
    const tip = await hover(control)
    expect(tip.textContent).toBe('Open settings')
  })

  it('collapsed footer gear shows Open settings on hover, not a title', async () => {
    renderSidebar(true)
    const control = screen.getByRole('button', { name: 'Open settings' })
    expect(control.getAttribute('title')).toBeNull()
    const tip = await hover(control)
    expect(tip.textContent).toBe('Open settings')
  })
})
