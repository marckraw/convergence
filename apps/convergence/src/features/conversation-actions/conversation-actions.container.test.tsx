import { useRef } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { useAppSettingsStore } from '@/entities/app-settings'
import { useComposerIntentStore } from '@/entities/composer-intent'
import {
  DRILL_COMPACTION_UNINTERRUPTIBLE,
  useContextDrillStore,
} from '@/entities/context-drill'
import type {
  ConversationProjectAction,
  ConversationRoutineAction,
} from '@/entities/conversation-actions'
import { useDialogStore } from '@/entities/dialog'
import { useLoomNavigationStore } from '@/entities/loom-navigation'
import { COMPACTING_CONTEXT_LABEL, useSessionStore } from '@/entities/session'
import { useSkillStore, type ProjectSkillCatalog } from '@/entities/skill'
import { ConversationActionsContainer } from './conversation-actions.container'

let projectActionsMock: ConversationProjectAction[] = []

vi.mock('@/entities/conversation-actions', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/entities/conversation-actions')>()
  return {
    ...actual,
    useConversationProjectActions: () => projectActionsMock,
  }
})

type TestSession = {
  id: string
  providerId: string
  status: 'running' | 'completed' | 'failed'
  attention: 'none' | 'finished' | 'failed'
  activity: null | 'compacting'
  executionHost?: string
}

const SETTLED: TestSession = {
  id: 'session-1',
  providerId: 'claude-code',
  status: 'completed',
  attention: 'finished',
  activity: null,
}

const ROUTINES: ConversationRoutineAction[] = [
  { id: 'drill', kind: 'routine', label: 'Run the drill', offered: true },
  { id: 'compact', kind: 'routine', label: 'Compact', offered: true },
  { id: 'fork', kind: 'routine', label: 'Fork', offered: true },
  { id: 'hand-off', kind: 'routine', label: 'Hand off', offered: true },
]

const HANDOFF_REFUSAL =
  'Wait for this conversation and its pending requests to settle before switching accounts.'

function skillEntry(id: string, displayName: string, enabled = true) {
  return {
    id,
    providerId: 'claude-code' as const,
    providerName: 'Claude Code',
    name: id,
    displayName,
    description: `${displayName} description`,
    shortDescription: null,
    path: `/skills/${id}/SKILL.md`,
    scope: 'global' as const,
    rawScope: null,
    sourceLabel: 'Global',
    enabled,
    dependencies: [],
    warnings: enabled
      ? []
      : [
          {
            code: 'disabled' as const,
            message: 'Disabled in Claude Code settings.',
          },
        ],
  }
}

function skillCatalog(
  skills = [
    skillEntry('planning', 'Planning'),
    skillEntry('review', 'Review'),
    skillEntry('legacy', 'Legacy', false),
  ],
  providerId: 'claude-code' | 'codex' = 'claude-code',
): ProjectSkillCatalog {
  return {
    projectId: 'project-1',
    projectName: 'Project',
    refreshedAt: '',
    providers: [
      {
        providerId,
        providerName: providerId === 'codex' ? 'Codex' : 'Claude Code',
        catalogSource: 'filesystem',
        invocationSupport: 'native-command',
        activationConfirmation: 'none',
        error: null,
        skills: skills.map((entry) => ({ ...entry, providerId })),
      },
    ],
  }
}

function Harness({ session }: { session: TestSession }) {
  const boundaryRef = useRef<HTMLDivElement | null>(null)
  return (
    <div ref={boundaryRef}>
      <ConversationActionsContainer
        session={session as never}
        catalogScope={{ kind: 'project', projectId: 'project-1' }}
        boundaryRef={boundaryRef}
      />
      <button type="button">Elsewhere</button>
    </div>
  )
}

const describeMock = vi.fn<(sessionId: string) => Promise<unknown>>()
const runMock = vi.fn(() => Promise.resolve())
const cancelMock = vi.fn<(sessionId: string) => Promise<string | null>>()
const compactMock = vi.fn(() => Promise.resolve())
const openDialogMock = vi.fn()
const originalPlatform = navigator.platform

function trigger() {
  return screen.getByRole('button', { name: 'Actions' })
}

function pressActionsShortcut() {
  act(() => {
    fireEvent.keyDown(window, { key: '.', metaKey: true })
  })
}

function escape() {
  act(() => {
    fireEvent.keyDown(document.activeElement ?? document.body, {
      key: 'Escape',
    })
  })
}

function key(name: string) {
  act(() => {
    fireEvent.keyDown(document.activeElement ?? document.body, { key: name })
  })
}

async function openGroup(name: 'Skills' | 'Routines' | 'Project') {
  pressActionsShortcut()
  const fan = screen.getByRole('menu', { name: 'Actions' })
  await act(async () => {
    fireEvent.click(within(fan).getByRole('menuitem', { name }))
  })
  return screen.getByRole('menu', { name })
}

beforeEach(() => {
  Object.defineProperty(navigator, 'platform', {
    value: 'MacIntel',
    configurable: true,
  })
  projectActionsMock = []
  describeMock.mockReset()
  describeMock.mockResolvedValue(ROUTINES)
  runMock.mockClear()
  cancelMock.mockReset()
  cancelMock.mockResolvedValue(null)
  compactMock.mockClear()
  openDialogMock.mockClear()
  ;(window as unknown as { electronAPI: unknown }).electronAPI = {
    conversationActions: { describe: describeMock },
  }
  useComposerIntentStore.setState({ intentsBySessionId: {} })
  useContextDrillStore.setState({
    beats: {},
    descriptions: {},
    run: runMock,
    cancel: cancelMock,
  })
  useSessionStore.setState({ compactSessionContext: compactMock })
  useDialogStore.setState({
    openDialog: null,
    payload: null,
    open: openDialogMock,
  })
  useLoomNavigationStore.setState({ pending: null, shownCrewId: null })
  useSkillStore.setState({
    catalog: skillCatalog(),
    isCatalogLoading: false,
    loadingProviders: [],
    catalogError: null,
    failedProviders: {},
    loadCatalog: vi.fn().mockResolvedValue(null),
    loadGlobalCatalog: vi.fn().mockResolvedValue(null),
  })
  useAppSettingsStore.setState((state) => ({
    settings: { ...state.settings, executionHostEndpoints: [] },
  }))
})

afterEach(() => {
  Object.defineProperty(navigator, 'platform', {
    value: originalPlatform,
    configurable: true,
  })
})

describe('ConversationActionsContainer', () => {
  describe('keyboard first (R6)', () => {
    it('opens and closes with ⌘., traverses the fan, and hands focus back to the button (walkthrough step 1)', () => {
      render(<Harness session={SETTLED} />)
      expect(screen.queryByRole('menu')).toBeNull()

      pressActionsShortcut()
      const fan = screen.getByRole('menu', { name: 'Actions' })
      const items = within(fan).getAllByRole('menuitem')
      expect(items.map((item) => item.textContent)).toEqual([
        'Skills',
        'Routines',
        'Close',
      ])
      expect(document.activeElement).toBe(items[0])

      key('ArrowDown')
      expect(document.activeElement).toBe(items[1])
      key('End')
      expect(document.activeElement).toBe(
        within(fan).getByRole('menuitem', { name: 'Close menu' }),
      )
      key('Home')
      expect(document.activeElement).toBe(items[0])

      escape()
      expect(screen.queryByRole('menu')).toBeNull()
      expect(document.activeElement).toBe(trigger())

      pressActionsShortcut()
      expect(screen.getByRole('menu', { name: 'Actions' })).toBeInTheDocument()
      pressActionsShortcut()
      expect(screen.queryByRole('menu')).toBeNull()
      expect(document.activeElement).toBe(trigger())
    })

    it('answers Ctrl+. off macOS and ignores it on a Mac', () => {
      render(<Harness session={SETTLED} />)
      act(() => {
        fireEvent.keyDown(window, { key: '.', ctrlKey: true })
      })
      expect(screen.queryByRole('menu')).toBeNull()

      Object.defineProperty(navigator, 'platform', {
        value: 'Linux x86_64',
        configurable: true,
      })
      act(() => {
        fireEvent.keyDown(window, { key: '.', ctrlKey: true })
      })
      expect(screen.getByRole('menu', { name: 'Actions' })).toBeInTheDocument()
    })

    it('does not open while a dialog is open', () => {
      useDialogStore.setState({ openDialog: 'session-fork' })
      render(<Harness session={SETTLED} />)
      pressActionsShortcut()
      expect(screen.queryByRole('menu')).toBeNull()
    })

    it('goes back one level on Esc: list → fan → closed', async () => {
      render(<Harness session={SETTLED} />)
      await openGroup('Routines')

      escape()
      const fan = screen.getByRole('menu', { name: 'Actions' })
      expect(screen.queryByRole('menu', { name: 'Routines' })).toBeNull()
      expect(document.activeElement).toBe(
        within(fan).getByRole('menuitem', { name: 'Routines' }),
      )

      escape()
      expect(screen.queryByRole('menu')).toBeNull()
      expect(document.activeElement).toBe(trigger())
    })

    it('opens by pointer too, and a press outside closes it without cancelling anything', () => {
      useContextDrillStore.setState({ beats: { 'session-1': 'sealing' } })
      render(<Harness session={SETTLED} />)
      fireEvent.click(trigger())
      expect(screen.getByRole('menu', { name: 'Actions' })).toBeInTheDocument()

      fireEvent.pointerDown(screen.getByRole('button', { name: 'Elsewhere' }))
      expect(screen.queryByRole('menu')).toBeNull()
      expect(cancelMock).not.toHaveBeenCalled()
    })
  })

  describe('skills (R2)', () => {
    it('adds the chosen skill through the composer, by keyboard, and sends nothing (walkthrough step 3)', async () => {
      render(<Harness session={SETTLED} />)
      const list = await openGroup('Skills')
      const search = within(list).getByRole('textbox', { name: 'Find a skill' })
      expect(document.activeElement).toBe(search)
      expect(
        within(list)
          .getAllByRole('menuitem')
          .map((item) => item.textContent),
      ).toEqual(['Skills', 'Planning', 'Review', 'Legacy'])

      fireEvent.change(search, { target: { value: 'plan' } })
      expect(
        within(list)
          .getAllByRole('menuitem')
          .map((item) => item.textContent),
      ).toEqual(['Skills', 'Planning'])

      key('ArrowDown')
      expect(document.activeElement).toHaveTextContent('Planning')
      act(() => {
        fireEvent.click(document.activeElement as HTMLElement)
      })

      expect(
        useComposerIntentStore.getState().intentsBySessionId['session-1'],
      ).toEqual([
        expect.objectContaining({
          kind: 'add-skill',
          skill: expect.objectContaining({
            id: 'planning',
            displayName: 'Planning',
            status: 'selected',
          }),
        }),
      ])
      expect(screen.queryByRole('menu')).toBeNull()
      expect(runMock).not.toHaveBeenCalled()
    })

    it('sends typing on a row to the search', async () => {
      render(<Harness session={SETTLED} />)
      const list = await openGroup('Skills')
      const row = within(list).getByRole('menuitem', { name: 'Review' })
      row.focus()
      key('r')
      expect(document.activeElement).toBe(
        within(list).getByRole('textbox', { name: 'Find a skill' }),
      )
    })

    it('shows a disabled skill disabled, with its reason, and adds nothing for it', async () => {
      render(<Harness session={SETTLED} />)
      const list = await openGroup('Skills')
      const legacy = within(list).getByRole('menuitem', { name: 'Legacy' })
      expect(legacy).toHaveAttribute('aria-disabled', 'true')
      expect(
        within(list).getByText('Disabled in Claude Code settings.'),
      ).toBeInTheDocument()

      fireEvent.click(legacy)
      expect(useComposerIntentStore.getState().intentsBySessionId).toEqual({})
    })

    it('says whose skills they are on a remote host, with the composer’s line', async () => {
      useAppSettingsStore.setState((state) => ({
        settings: {
          ...state.settings,
          executionHostEndpoints: [
            {
              id: 'little-monster',
              label: 'little-monster',
              baseUrl: 'https://little-monster.example.com',
              position: 0,
              createdAt: '2026-01-01',
              updatedAt: '2026-01-01',
              configurationEpoch: 0,
            },
          ],
        },
      }))
      render(
        <Harness session={{ ...SETTLED, executionHost: 'little-monster' }} />,
      )
      const list = await openGroup('Skills')
      expect(
        within(list).getByTestId('remote-skills-notice'),
      ).toHaveTextContent(
        'From this Mac — little-monster may not have these skills.',
      )
    })

    it('loads this project’s catalog when Skills opens, and nothing before', async () => {
      render(<Harness session={SETTLED} />)
      pressActionsShortcut()
      expect(useSkillStore.getState().loadCatalog).not.toHaveBeenCalled()
      expect(describeMock).toHaveBeenCalledTimes(1)
      await act(async () => {
        fireEvent.click(screen.getByRole('menuitem', { name: 'Skills' }))
      })
      expect(useSkillStore.getState().loadCatalog).toHaveBeenCalledWith(
        'project-1',
      )
    })
  })

  describe('loading, failure and empty told apart (R3)', () => {
    it('says loading while this agent’s provider has not arrived', async () => {
      useSkillStore.setState({
        catalog: { ...skillCatalog([]), providers: [] },
        isCatalogLoading: true,
        loadingProviders: [
          { providerId: 'claude-code', providerName: 'Claude Code' },
        ],
      })
      render(<Harness session={SETTLED} />)
      const list = await openGroup('Skills')
      expect(within(list).getByRole('status')).toHaveTextContent(
        'Loading skills…',
      )
    })

    it('says the scan failed, never that there are no skills', async () => {
      useSkillStore.setState({
        catalog: { ...skillCatalog([]), providers: [] },
        failedProviders: { 'claude-code': 'EACCES: ~/.claude/skills' },
      })
      render(<Harness session={SETTLED} />)
      const list = await openGroup('Skills')
      expect(within(list).getByRole('alert')).toHaveTextContent(
        "Couldn't load this agent's skills: EACCES: ~/.claude/skills",
      )
      expect(
        within(list).queryByText('No skills available for this agent'),
      ).toBeNull()
    })

    it('says there are none only when the scan succeeded empty, and offers Routines', async () => {
      useSkillStore.setState({
        catalog: skillCatalog([skillEntry('other', 'Other')], 'codex'),
      })
      render(<Harness session={SETTLED} />)
      const list = await openGroup('Skills')
      expect(
        within(list).getByText('No skills available for this agent'),
      ).toBeInTheDocument()
      expect(
        within(list).getByText('Routines are still available below.'),
      ).toBeInTheDocument()

      await act(async () => {
        fireEvent.click(
          within(list).getByRole('menuitem', { name: 'Routines →' }),
        )
      })
      expect(screen.getByRole('menu', { name: 'Routines' })).toBeInTheDocument()
    })
  })

  describe('routines run their existing flows (R4)', () => {
    it('lists them in the frames’ words', async () => {
      render(<Harness session={SETTLED} />)
      const list = await openGroup('Routines')
      expect(
        within(list)
          .getAllByRole('menuitem')
          .map((item) => item.textContent),
      ).toEqual([
        'Routines',
        'Run the drill',
        'Compact',
        'Fork',
        'Hand off to another account',
      ])
    })

    it('starts the drill through the drill store, and stays open for its beats', async () => {
      render(<Harness session={SETTLED} />)
      const list = await openGroup('Routines')
      fireEvent.click(
        within(list).getByRole('menuitem', { name: 'Run the drill' }),
      )
      expect(runMock).toHaveBeenCalledWith('session-1')
      expect(screen.getByRole('menu', { name: 'Routines' })).toBeInTheDocument()
    })

    it('compacts through the session store, and shows a failure as returned', async () => {
      compactMock.mockRejectedValueOnce(new Error('Compaction failed: busy'))
      render(<Harness session={SETTLED} />)
      const list = await openGroup('Routines')
      await act(async () => {
        fireEvent.click(within(list).getByRole('menuitem', { name: 'Compact' }))
      })
      expect(compactMock).toHaveBeenCalledWith('session-1')
      expect(within(list).getByRole('alert')).toHaveTextContent(
        'Compaction failed: busy',
      )
    })

    it('opens the existing fork dialog', async () => {
      render(<Harness session={SETTLED} />)
      const list = await openGroup('Routines')
      fireEvent.click(within(list).getByRole('menuitem', { name: 'Fork' }))
      expect(openDialogMock).toHaveBeenCalledWith('session-fork', {
        parentSessionId: 'session-1',
      })
      expect(screen.queryByRole('menu')).toBeNull()
    })

    it('asks the composer to open its account picker for a hand-off', async () => {
      render(<Harness session={SETTLED} />)
      const list = await openGroup('Routines')
      fireEvent.click(
        within(list).getByRole('menuitem', {
          name: 'Hand off to another account',
        }),
      )
      expect(
        useComposerIntentStore.getState().intentsBySessionId['session-1'],
      ).toEqual([expect.objectContaining({ kind: 'open-account-picker' })])
      expect(screen.queryByRole('menu')).toBeNull()
    })

    it('shows a routine that is not offered disabled, with CA1’s reason, and runs nothing', async () => {
      describeMock.mockResolvedValue([
        ROUTINES[2],
        {
          id: 'hand-off',
          kind: 'routine',
          label: 'Hand off',
          offered: false,
          reason: HANDOFF_REFUSAL,
        },
      ])
      render(<Harness session={SETTLED} />)
      const list = await openGroup('Routines')
      const handOff = within(list).getByRole('menuitem', {
        name: 'Hand off to another account',
      })
      expect(handOff).toHaveAttribute('aria-disabled', 'true')
      expect(within(list).getByText(HANDOFF_REFUSAL)).toBeInTheDocument()
      fireEvent.click(handOff)
      expect(useComposerIntentStore.getState().intentsBySessionId).toEqual({})
    })

    it('re-describes on every open and when the conversation settles while open', async () => {
      const busy: TestSession = {
        ...SETTLED,
        status: 'running',
        attention: 'none',
      }
      describeMock.mockResolvedValue([
        {
          id: 'compact',
          kind: 'routine',
          label: 'Compact',
          offered: false,
          reason: 'Context can only be compacted while the session is idle',
        },
      ])
      const { rerender } = render(<Harness session={busy} />)
      const list = await openGroup('Routines')
      expect(
        within(list).getByRole('menuitem', { name: 'Compact' }),
      ).toHaveAttribute('aria-disabled', 'true')
      expect(describeMock).toHaveBeenCalledTimes(1)

      describeMock.mockResolvedValue([ROUTINES[1]])
      await act(async () => {
        rerender(<Harness session={SETTLED} />)
      })
      expect(describeMock).toHaveBeenCalledTimes(2)
      expect(
        within(screen.getByRole('menu', { name: 'Routines' })).getByRole(
          'menuitem',
          { name: 'Compact' },
        ),
      ).not.toHaveAttribute('aria-disabled')

      escape()
      escape()
      pressActionsShortcut()
      expect(describeMock).toHaveBeenCalledTimes(3)
    })
  })

  describe('progress is the routine’s own (R5)', () => {
    it('draws sealing, compacting and waking from the store, with Cancel only where real', async () => {
      useContextDrillStore.setState({ beats: { 'session-1': 'sealing' } })
      render(<Harness session={SETTLED} />)
      const list = await openGroup('Routines')
      const drill = within(list).getByTestId('routine-drill')

      expect(within(drill).getByRole('status')).toHaveTextContent(
        'Sealing memory…',
      )
      const cancel = within(drill).getByRole('menuitem', { name: 'Cancel' })
      expect(cancel).not.toHaveAttribute('aria-disabled')
      expect(
        within(drill).getByText(
          'Cancels the routine; the current reply may continue.',
        ),
      ).toBeInTheDocument()
      expect(
        within(list).getByRole('menuitem', { name: 'Close menu' }),
      ).toBeInTheDocument()

      act(() => {
        useContextDrillStore.setState({ beats: { 'session-1': 'compacting' } })
      })
      expect(within(drill).getByRole('status')).toHaveTextContent('Compacting…')
      const unavailable = within(drill).getByRole('menuitem', {
        name: 'Cancel unavailable',
      })
      expect(unavailable).toHaveAttribute('aria-disabled', 'true')
      expect(
        within(drill).getByText(DRILL_COMPACTION_UNINTERRUPTIBLE),
      ).toBeInTheDocument()
      fireEvent.click(unavailable)
      expect(cancelMock).not.toHaveBeenCalled()

      act(() => {
        useContextDrillStore.setState({ beats: { 'session-1': 'resuming' } })
      })
      expect(within(drill).getByRole('status')).toHaveTextContent('Waking up…')
      expect(
        within(drill).getByRole('menuitem', { name: 'Cancel' }),
      ).not.toHaveAttribute('aria-disabled')
    })

    it('cancels through the drill store and shows a refusal as returned', async () => {
      cancelMock.mockResolvedValue('The routine already finished.')
      useContextDrillStore.setState({ beats: { 'session-1': 'resuming' } })
      render(<Harness session={SETTLED} />)
      const list = await openGroup('Routines')
      await act(async () => {
        fireEvent.click(within(list).getByRole('menuitem', { name: 'Cancel' }))
      })
      expect(cancelMock).toHaveBeenCalledWith('session-1')
      expect(within(list).getByRole('alert')).toHaveTextContent(
        'The routine already finished.',
      )
    })

    it('cancels nothing on close, and shows the current beat on reopen', async () => {
      useContextDrillStore.setState({ beats: { 'session-1': 'sealing' } })
      render(<Harness session={SETTLED} />)
      const list = await openGroup('Routines')
      fireEvent.click(
        within(list).getByRole('menuitem', { name: 'Close menu' }),
      )
      expect(screen.queryByRole('menu')).toBeNull()
      expect(document.activeElement).toBe(trigger())

      act(() => {
        useContextDrillStore.setState({ beats: { 'session-1': 'compacting' } })
      })
      const reopened = await openGroup('Routines')
      expect(
        within(within(reopened).getByTestId('routine-drill')).getByRole(
          'status',
        ),
      ).toHaveTextContent('Compacting…')
      expect(cancelMock).not.toHaveBeenCalled()
      expect(useContextDrillStore.getState().beats['session-1']).toBe(
        'compacting',
      )
    })

    it('shows a compaction outside a drill with the shared label and no Cancel', async () => {
      render(<Harness session={{ ...SETTLED, activity: 'compacting' }} />)
      const list = await openGroup('Routines')
      const compact = within(list).getByTestId('routine-compact')
      expect(within(compact).getByRole('status')).toHaveTextContent(
        COMPACTING_CONTEXT_LABEL,
      )
      expect(
        within(list).queryByRole('menuitem', { name: /^Cancel/ }),
      ).toBeNull()
    })
  })

  describe('project (CA3)', () => {
    it('has no Project entry when this conversation has no project actions', () => {
      render(<Harness session={SETTLED} />)
      pressActionsShortcut()
      expect(screen.queryByRole('menuitem', { name: 'Project' })).toBeNull()
    })

    it('navigates to Loom with CA3’s request and writes nothing', async () => {
      const navigation = {
        crewId: 'crew-1',
        target: { kind: 'seat' as const, sessionId: 'session-1' },
      }
      projectActionsMock = [
        {
          id: 'project:open-issue',
          kind: 'project',
          label: 'Open its issue',
          offered: false,
          reason: 'No active ticket',
        },
        {
          id: 'project:show-in-loom',
          kind: 'project',
          label: 'Show in Loom',
          offered: true,
          navigation,
        },
      ]
      render(<Harness session={SETTLED} />)
      const list = await openGroup('Project')
      expect(within(list).getByText('No active ticket')).toBeInTheDocument()
      expect(
        within(list).getByText("Current conversation's seat"),
      ).toBeInTheDocument()

      fireEvent.click(
        within(list).getByRole('menuitem', { name: 'Open its issue' }),
      )
      expect(useLoomNavigationStore.getState().pending).toBeNull()

      fireEvent.click(
        within(list).getByRole('menuitem', { name: 'Show in Loom' }),
      )
      expect(useLoomNavigationStore.getState().pending).toEqual(navigation)
      expect(screen.queryByRole('menu')).toBeNull()
    })
  })
})
