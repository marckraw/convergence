import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_NOTIFICATION_PREFS,
  DEFAULT_ONBOARDING_PREFS,
  useAppSettingsStore,
} from '@/entities/app-settings'
import { useDialogStore } from '@/entities/dialog'
import { useProjectStore } from '@/entities/project'
import { NotificationsOnboardingContainer } from './onboarding-card.container'
import type { Project } from '@/entities/project'

const mockProject: Project = {
  id: 'p-1',
  name: 'Project',
  repositoryPath: '/tmp/p',
  settings: {
    workspaceCreation: { startStrategy: 'base-branch', baseBranchName: null },
  },
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
} as Project

function primeStores(opts: {
  isLoaded: boolean
  hasProject: boolean
  dismissed: boolean
}) {
  useAppSettingsStore.setState({
    settings: {
      defaultProviderId: null,
      defaultModelId: null,
      defaultEffortId: null,
      namingModelByProvider: {},
      extractionModelByProvider: {},
      notifications: DEFAULT_NOTIFICATION_PREFS,
      onboarding: {
        ...DEFAULT_ONBOARDING_PREFS,
        notificationsCardDismissed: opts.dismissed,
      },
    },
    isLoaded: opts.isLoaded,
    isSaving: false,
    error: null,
    unsubscribeBroadcast: null,
  })
  useProjectStore.setState({
    projects: opts.hasProject ? [mockProject] : [],
    activeProject: opts.hasProject ? mockProject : null,
    loading: false,
    error: null,
  })
  useDialogStore.setState({ openDialog: null })
}

describe('NotificationsOnboardingContainer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    primeStores({ isLoaded: false, hasProject: false, dismissed: false })
  })

  it('renders nothing while settings are still loading', () => {
    primeStores({ isLoaded: false, hasProject: true, dismissed: false })

    const { container } = render(<NotificationsOnboardingContainer />)

    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing when there is no active project', () => {
    primeStores({ isLoaded: true, hasProject: false, dismissed: false })

    const { container } = render(<NotificationsOnboardingContainer />)

    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing once the card has been dismissed', () => {
    primeStores({ isLoaded: true, hasProject: true, dismissed: true })

    const { container } = render(<NotificationsOnboardingContainer />)

    expect(container).toBeEmptyDOMElement()
  })

  it('renders the card when not dismissed and a project is active', () => {
    primeStores({ isLoaded: true, hasProject: true, dismissed: false })

    render(<NotificationsOnboardingContainer />)

    expect(screen.getByText(/Convergence can notify you/i)).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Open Settings' }),
    ).toBeInTheDocument()
  })

  it('Open Settings opens the app-settings dialog via the dialog store', () => {
    primeStores({ isLoaded: true, hasProject: true, dismissed: false })
    render(<NotificationsOnboardingContainer />)

    fireEvent.click(screen.getByRole('button', { name: 'Open Settings' }))

    expect(useDialogStore.getState().openDialog).toBe('app-settings')
  })

  it('Don’t show again persists the dismissal flag through save', () => {
    primeStores({ isLoaded: true, hasProject: true, dismissed: false })
    const save = vi.fn().mockResolvedValue(undefined)
    useAppSettingsStore.setState({ save } as never)

    render(<NotificationsOnboardingContainer />)

    fireEvent.click(
      screen.getByRole('button', { name: /don.{1,2}t show again/i }),
    )

    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        onboarding: expect.objectContaining({
          notificationsCardDismissed: true,
        }),
      }),
    )
  })
})
