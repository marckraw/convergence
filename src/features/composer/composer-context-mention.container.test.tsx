import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { ComposerContainer } from './composer.container'
import { useSessionStore } from '@/entities/session'
import { useSkillStore } from '@/entities/skill'
import {
  useProjectContextStore,
  type ProjectContextItem,
} from '@/entities/project-context'

const PROJECT_ID = 'project-mention'

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
    sendMessageToSession: vi.fn(),
    cancelQueuedInput: vi.fn(),
  })
  useSkillStore.setState({
    catalog: null,
    isCatalogLoading: false,
    catalogError: null,
    selectedSkillId: null,
    detailsBySkillId: {},
    detailsErrorBySkillId: {},
    loadingDetailsSkillId: null,
    loadCatalog: vi.fn().mockResolvedValue(null),
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

  function getTextbox(): HTMLTextAreaElement {
    return screen.getByRole('textbox') as HTMLTextAreaElement
  }

  function setValueAndCursor(textbox: HTMLTextAreaElement, value: string) {
    textbox.focus()
    fireEvent.change(textbox, { target: { value } })
    textbox.setSelectionRange(value.length, value.length)
    fireEvent.keyUp(textbox, { key: 'a' })
  }

  it('opens the picker when the user types "::" at the start of the message', () => {
    renderComposer()
    const textbox = getTextbox()
    setValueAndCursor(textbox, '::')

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
    setValueAndCursor(textbox, '::mob')

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
    setValueAndCursor(textbox, 'hi ::mon')

    fireEvent.click(
      screen.getByTestId(`composer-context-mention-item-${itemA.id}`),
    )

    expect(textbox.value).toBe(`hi ${itemA.body}`)
    expect(screen.queryByTestId('composer-context-mention-picker')).toBeNull()
  })

  it('inserts via Enter when the picker is open', () => {
    renderComposer()
    const textbox = getTextbox()
    setValueAndCursor(textbox, '::mon')

    fireEvent.keyDown(textbox, { key: 'Enter' })

    expect(textbox.value).toBe(itemA.body)
  })

  it('closes the picker when Escape is pressed and reopens on further typing', () => {
    renderComposer()
    const textbox = getTextbox()
    setValueAndCursor(textbox, '::mon')
    expect(
      screen.getByTestId('composer-context-mention-picker'),
    ).toBeInTheDocument()

    fireEvent.keyDown(textbox, { key: 'Escape' })
    expect(screen.queryByTestId('composer-context-mention-picker')).toBeNull()

    setValueAndCursor(textbox, 'foo ::mon')
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
