import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ComposerContainer } from './composer.container'
import { useSessionStore } from '@/entities/session'
import {
  useSkillStore,
  type ProjectSkillCatalog,
  type SkillCatalogEntry,
} from '@/entities/skill'
import {
  useProjectContextStore,
  type ProjectContextItem,
} from '@/entities/project-context'
import {
  usePromptLibraryStore,
  type PromptLibraryCatalog,
  type PromptLibraryDetails,
  type PromptLibraryEntry,
} from '@/entities/prompt-library'

const PROJECT_ID = 'project-mention'

function prompt(
  id: string,
  overrides: Partial<PromptLibraryEntry> = {},
): PromptLibraryEntry {
  return {
    id,
    title: id,
    description: `${id} description`,
    shortDescription: null,
    path: `/tmp/${id}.md`,
    relativePath: `${id}.md`,
    scope: 'project',
    sourceLabel: 'Project',
    kind: 'markdown',
    tags: [],
    sizeBytes: 10,
    ...overrides,
  }
}

function skill(
  id: string,
  overrides: Partial<SkillCatalogEntry> = {},
): SkillCatalogEntry {
  return {
    id,
    providerId: 'claude-code',
    providerName: 'Claude Code',
    name: id,
    displayName: id,
    description: `${id} description`,
    shortDescription: null,
    path: `/tmp/${id}/SKILL.md`,
    scope: 'user',
    rawScope: 'user',
    sourceLabel: 'User',
    enabled: true,
    dependencies: [],
    warnings: [],
    ...overrides,
  }
}

const reviewSkill = skill('skill-review', {
  name: 'review',
  displayName: 'Review',
  description: 'Review pull requests.',
})

const disabledSkill = skill('skill-disabled', {
  name: 'disabled',
  displayName: 'Disabled',
  enabled: false,
})

const skillCatalog: ProjectSkillCatalog = {
  projectId: PROJECT_ID,
  projectName: 'Project Mention',
  refreshedAt: '2026-06-02T00:00:00.000Z',
  providers: [
    {
      providerId: 'claude-code',
      providerName: 'Claude Code',
      catalogSource: 'native-rpc',
      invocationSupport: 'structured-input',
      activationConfirmation: 'none',
      error: null,
      skills: [reviewSkill, disabledSkill],
    },
  ],
}

const dailyPrompt = prompt('prompt-daily', {
  title: 'Daily Plan',
  description: 'Plan the day.',
  tags: ['planning'],
})

const globalPrompt = prompt('prompt-global', {
  title: 'Global Review',
  description: 'Reusable global review prompt.',
  scope: 'global',
  sourceLabel: 'Global',
  tags: ['review'],
})

const promptCatalog: PromptLibraryCatalog = {
  projectId: PROJECT_ID,
  projectName: 'Project Mention',
  refreshedAt: '2026-06-02T00:00:00.000Z',
  roots: [],
  prompts: [dailyPrompt, globalPrompt],
}

const globalPromptCatalog: PromptLibraryCatalog = {
  ...promptCatalog,
  projectId: 'global',
  projectName: 'Global chat',
  prompts: [globalPrompt],
}

const dailyPromptDetails: PromptLibraryDetails = {
  promptId: dailyPrompt.id,
  path: dailyPrompt.path,
  markdown: '---\ntitle: Daily Plan\n---\nWrite a daily plan.',
  promptText: 'Write a daily plan.',
  sizeBytes: 64,
}

const itemA: ProjectContextItem = {
  id: 'ctx-a',
  projectId: PROJECT_ID,
  label: 'monorepo',
  body: 'See ~/work/monorepo for the API contract.',
  reinjectMode: 'boot',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

const itemB: ProjectContextItem = {
  id: 'ctx-b',
  projectId: PROJECT_ID,
  label: 'mobile',
  body: 'Mobile app lives at ~/work/mobile.',
  reinjectMode: 'boot',
  createdAt: '2026-01-02T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
}

const mockElectronAPI = {
  projectContext: {
    list: vi.fn().mockResolvedValue([itemA, itemB]),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    attachToSession: vi.fn(),
    listForSession: vi.fn().mockResolvedValue([]),
  },
}

function seedStores() {
  useSessionStore.setState({
    sessions: [],
    globalChatSessions: [],
    providers: [
      {
        id: 'claude-code',
        name: 'Claude Code',
        vendorLabel: 'Anthropic',
        kind: 'conversation',
        supportsContinuation: true,
        defaultModelId: 'claude-sonnet',
        modelOptions: [
          {
            id: 'claude-sonnet',
            label: 'Sonnet',
            defaultEffort: 'medium',
            effortOptions: [{ id: 'medium', label: 'Medium' }],
          },
        ],
        attachments: {
          supportsImage: true,
          supportsPdf: true,
          supportsText: true,
          maxImageBytes: 5 * 1024 * 1024,
          maxPdfBytes: 10 * 1024 * 1024,
          maxTextBytes: 1024 * 1024,
          maxTotalBytes: 25 * 1024 * 1024,
        },
        midRunInput: {
          supportsAnswer: false,
          supportsNativeFollowUp: false,
          supportsAppQueuedFollowUp: true,
          supportsSteer: false,
          supportsInterrupt: false,
          defaultRunningMode: 'follow-up',
        },
      },
    ],
    queuedInputsBySessionId: {},
    loadProviders: vi.fn(),
    createAndStartSession: vi.fn(),
    createAndStartGlobalSession: vi.fn(),
    sendMessageToSession: vi.fn(),
    cancelQueuedInput: vi.fn(),
  })
  useSkillStore.setState({
    catalog: skillCatalog,
    isCatalogLoading: false,
    catalogError: null,
    selectedSkillId: null,
    detailsBySkillId: {},
    detailsErrorBySkillId: {},
    loadingDetailsSkillId: null,
    loadCatalog: vi.fn().mockResolvedValue(skillCatalog),
    loadGlobalCatalog: vi.fn().mockResolvedValue(skillCatalog),
  })
  usePromptLibraryStore.setState({
    catalog: promptCatalog,
    isCatalogLoading: false,
    catalogError: null,
    selectedPromptId: null,
    detailsByPromptId: {},
    detailsErrorByPromptId: {},
    loadingDetailsPromptId: null,
    isMutating: false,
    mutationError: null,
    loadCatalog: vi.fn().mockImplementation(async () => {
      usePromptLibraryStore.setState({ catalog: promptCatalog })
      return promptCatalog
    }),
    loadGlobalCatalog: vi.fn().mockImplementation(async () => {
      usePromptLibraryStore.setState({ catalog: globalPromptCatalog })
      return globalPromptCatalog
    }),
    selectPrompt: vi.fn(),
    loadDetails: vi.fn().mockResolvedValue(dailyPromptDetails),
    createPrompt: vi.fn(),
    updatePrompt: vi.fn(),
    deletePrompt: vi.fn(),
  })
  useProjectContextStore.setState({
    itemsByProjectId: { [PROJECT_ID]: [itemA, itemB] },
    attachmentsBySessionId: {},
    loading: false,
    error: null,
  })
}

describe('ComposerContainer — context mention picker', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.defineProperty(window, 'electronAPI', {
      value: mockElectronAPI,
      writable: true,
      configurable: true,
    })
    seedStores()
  })

  afterEach(() => {
    useProjectContextStore.setState({
      itemsByProjectId: {},
      attachmentsBySessionId: {},
      loading: false,
      error: null,
    })
  })

  function renderComposer() {
    return render(
      <ComposerContainer
        context={{
          kind: 'project',
          projectId: PROJECT_ID,
          workspaceId: null,
          activeSessionId: null,
        }}
      />,
    )
  }

  function renderGlobalComposer() {
    return render(
      <ComposerContainer
        context={{
          kind: 'global',
          activeSessionId: null,
        }}
      />,
    )
  }

  function getTextbox(): HTMLTextAreaElement {
    return screen.getByRole('textbox') as HTMLTextAreaElement
  }

  function setValueAndCursor(textbox: HTMLTextAreaElement, value: string) {
    textbox.focus()
    fireEvent.change(textbox, { target: { value } })
    textbox.setSelectionRange(value.length, value.length)
    fireEvent.keyUp(textbox, { key: 'a' })
  }

  it('opens the root injection picker for bare "::"', () => {
    renderComposer()
    const textbox = getTextbox()
    setValueAndCursor(textbox, '::')

    expect(screen.queryByTestId('composer-context-mention-picker')).toBeNull()
    expect(
      screen.getByTestId('composer-injection-root-picker'),
    ).toBeInTheDocument()
    expect(
      screen.getByTestId('composer-injection-root-item-context'),
    ).toBeInTheDocument()
    expect(
      screen.getByTestId('composer-injection-root-item-skill'),
    ).toBeInTheDocument()
    expect(
      screen.getByTestId('composer-injection-root-item-prompt'),
    ).toBeInTheDocument()
  })

  it('filters root injection kinds by query', () => {
    renderComposer()
    const textbox = getTextbox()
    setValueAndCursor(textbox, '::s')

    expect(
      screen.queryByTestId('composer-injection-root-item-context'),
    ).toBeNull()
    expect(
      screen.getByTestId('composer-injection-root-item-skill'),
    ).toBeInTheDocument()
  })

  it('shows skill and prompt injections in global chat', () => {
    renderGlobalComposer()
    const textbox = getTextbox()
    setValueAndCursor(textbox, '::')

    expect(
      screen.queryByTestId('composer-injection-root-item-context'),
    ).toBeNull()
    expect(
      screen.getByTestId('composer-injection-root-item-skill'),
    ).toBeInTheDocument()
    expect(
      screen.getByTestId('composer-injection-root-item-prompt'),
    ).toBeInTheDocument()
  })

  it('selects root injection kinds with the keyboard', async () => {
    renderComposer()
    const textbox = getTextbox()
    setValueAndCursor(textbox, '::')

    fireEvent.keyDown(textbox, { key: 'ArrowDown' })
    fireEvent.keyDown(textbox, { key: 'Enter' })

    await waitFor(() => expect(textbox.value).toBe('::skill::'))
    expect(screen.queryByTestId('composer-context-mention-picker')).toBeNull()
  })

  it('transitions from root picker to context picker', async () => {
    renderComposer()
    const textbox = getTextbox()
    setValueAndCursor(textbox, '::')

    fireEvent.keyDown(textbox, { key: 'Enter' })

    await waitFor(() => expect(textbox.value).toBe('::context::'))
    await waitFor(() =>
      expect(
        screen.getByTestId('composer-context-mention-picker'),
      ).toBeInTheDocument(),
    )
  })

  it('closes the root picker when Escape is pressed and reopens on another range', () => {
    renderComposer()
    const textbox = getTextbox()
    setValueAndCursor(textbox, '::')
    expect(
      screen.getByTestId('composer-injection-root-picker'),
    ).toBeInTheDocument()

    fireEvent.keyDown(textbox, { key: 'Escape' })
    expect(screen.queryByTestId('composer-injection-root-picker')).toBeNull()

    setValueAndCursor(textbox, 'foo ::')
    expect(
      screen.getByTestId('composer-injection-root-picker'),
    ).toBeInTheDocument()
  })

  it('opens the picker for the short context injection alias', () => {
    renderComposer()
    const textbox = getTextbox()
    setValueAndCursor(textbox, '::c::')

    expect(
      screen.getByTestId('composer-context-mention-picker'),
    ).toBeInTheDocument()
    expect(
      screen.getByTestId(`composer-context-mention-item-${itemA.id}`),
    ).toBeInTheDocument()
    expect(
      screen.getByTestId(`composer-context-mention-item-${itemB.id}`),
    ).toBeInTheDocument()
  })

  it('opens the inline skill picker for the short skill injection alias', () => {
    renderComposer()
    const textbox = getTextbox()
    setValueAndCursor(textbox, '::s::rev')

    expect(
      screen.getByTestId('composer-skill-injection-picker'),
    ).toBeInTheDocument()
    expect(
      screen.getByTestId(`composer-skill-injection-item-${reviewSkill.id}`),
    ).toBeInTheDocument()
    expect(
      screen.queryByTestId(`composer-skill-injection-item-${disabledSkill.id}`),
    ).toBeNull()
  })

  it('opens the inline prompt picker for the short prompt injection alias', () => {
    renderComposer()
    const textbox = getTextbox()
    setValueAndCursor(textbox, '::p::daily')

    expect(
      screen.getByTestId('composer-prompt-injection-picker'),
    ).toBeInTheDocument()
    expect(
      screen.getByTestId(`composer-prompt-injection-item-${dailyPrompt.id}`),
    ).toBeInTheDocument()
    expect(
      screen.queryByTestId(`composer-prompt-injection-item-${globalPrompt.id}`),
    ).toBeNull()
  })

  it('inserts prompt text via Enter when the inline prompt picker is open', async () => {
    renderComposer()
    const textbox = getTextbox()
    setValueAndCursor(textbox, 'please ::prompt::daily')

    fireEvent.keyDown(textbox, { key: 'Enter' })

    await waitFor(() =>
      expect(textbox.value).toBe(`please ${dailyPromptDetails.promptText}`),
    )
    expect(screen.queryByTestId('composer-prompt-injection-picker')).toBeNull()
    expect(usePromptLibraryStore.getState().loadDetails).toHaveBeenCalledWith(
      PROJECT_ID,
      dailyPrompt,
    )
  })

  it('loads global prompts for global chat prompt injection', async () => {
    renderGlobalComposer()
    const textbox = getTextbox()
    setValueAndCursor(textbox, '::p::')

    await waitFor(() =>
      expect(
        screen.getByTestId(`composer-prompt-injection-item-${globalPrompt.id}`),
      ).toBeInTheDocument(),
    )
    await waitFor(() =>
      expect(
        screen.queryByTestId(
          `composer-prompt-injection-item-${dailyPrompt.id}`,
        ),
      ).toBeNull(),
    )
    expect(
      usePromptLibraryStore.getState().loadGlobalCatalog,
    ).toHaveBeenCalled()
  })

  it('selects an inline skill with the keyboard and removes the trigger text', async () => {
    renderComposer()
    const textbox = getTextbox()
    setValueAndCursor(textbox, 'please ::s::rev')

    fireEvent.keyDown(textbox, { key: 'Enter' })

    await waitFor(() => expect(textbox.value).toBe('please '))
    expect(screen.queryByTestId('composer-skill-injection-picker')).toBeNull()
    expect(screen.getByTestId('selected-skills-row')).toHaveTextContent(
      'Review',
    )
  })

  it('sends inline-selected skills through the existing session payload', async () => {
    renderComposer()
    const textbox = getTextbox()
    setValueAndCursor(textbox, 'use ::skill::rev')

    fireEvent.keyDown(textbox, { key: 'Enter' })
    await waitFor(() => expect(textbox.value).toBe('use '))

    fireEvent.keyDown(textbox, { key: 'Enter', metaKey: true })

    const createAndStartSession =
      useSessionStore.getState().createAndStartSession
    expect(createAndStartSession).toHaveBeenCalledTimes(1)
    const firstCall = vi.mocked(createAndStartSession).mock.calls[0]
    expect(firstCall?.[8]).toEqual([
      expect.objectContaining({
        id: reviewSkill.id,
        providerId: 'claude-code',
        name: 'review',
        displayName: 'Review',
        status: 'selected',
      }),
    ])
  })

  it('opens the picker for the canonical context injection name', () => {
    renderComposer()
    const textbox = getTextbox()
    setValueAndCursor(textbox, '::context::')

    expect(
      screen.getByTestId('composer-context-mention-picker'),
    ).toBeInTheDocument()
    expect(
      screen.getByTestId(`composer-context-mention-item-${itemA.id}`),
    ).toBeInTheDocument()
    expect(
      screen.getByTestId(`composer-context-mention-item-${itemB.id}`),
    ).toBeInTheDocument()
  })

  it('filters items by the trailing query', () => {
    renderComposer()
    const textbox = getTextbox()
    setValueAndCursor(textbox, '::context::mob')

    expect(
      screen.getByTestId(`composer-context-mention-item-${itemB.id}`),
    ).toBeInTheDocument()
    expect(
      screen.queryByTestId(`composer-context-mention-item-${itemA.id}`),
    ).toBeNull()
  })

  it('inserts the item body inline when an item is clicked', () => {
    renderComposer()
    const textbox = getTextbox()
    setValueAndCursor(textbox, 'hi ::c::mon')

    fireEvent.click(
      screen.getByTestId(`composer-context-mention-item-${itemA.id}`),
    )

    expect(textbox.value).toBe(`hi ${itemA.body}`)
    expect(screen.queryByTestId('composer-context-mention-picker')).toBeNull()
  })

  it('inserts via Enter when the picker is open', () => {
    renderComposer()
    const textbox = getTextbox()
    setValueAndCursor(textbox, '::c::mon')

    fireEvent.keyDown(textbox, { key: 'Enter' })

    expect(textbox.value).toBe(itemA.body)
  })

  it('closes the picker when Escape is pressed and reopens on further typing', () => {
    renderComposer()
    const textbox = getTextbox()
    setValueAndCursor(textbox, '::c::mon')
    expect(
      screen.getByTestId('composer-context-mention-picker'),
    ).toBeInTheDocument()

    fireEvent.keyDown(textbox, { key: 'Escape' })
    expect(screen.queryByTestId('composer-context-mention-picker')).toBeNull()

    setValueAndCursor(textbox, 'foo ::c::mon')
    expect(
      screen.getByTestId('composer-context-mention-picker'),
    ).toBeInTheDocument()
  })

  it('does not open for mid-word "::"', () => {
    renderComposer()
    const textbox = getTextbox()
    setValueAndCursor(textbox, 'foo::bar')

    expect(screen.queryByTestId('composer-context-mention-picker')).toBeNull()
  })

  it('does not open for triple-colon ":::"', () => {
    renderComposer()
    const textbox = getTextbox()
    setValueAndCursor(textbox, ':::')

    expect(screen.queryByTestId('composer-context-mention-picker')).toBeNull()
  })
})
