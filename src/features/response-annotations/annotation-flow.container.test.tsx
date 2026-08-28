import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { localProviderCatalogs, useSessionStore } from '@/entities/session'
import { useResponseAnnotationStore } from '@/entities/response-annotation'
import { useAppSettingsStore } from '@/entities/app-settings'
import { useSkillStore } from '@/entities/skill'
import { useProjectContextStore } from '@/entities/project-context'
import { ComposerContainer } from '@/features/composer'
import { AnnotationSelectionCapture } from './annotation-selection-capture.container'
import { AnnotationTray } from './annotation-tray.container'

/**
 * The whole slice, end to end: select text in a completed agent message,
 * answer it, and watch the compiled prompt come out of the send action.
 *
 * Rendered the way the widget composes it — popover, tray, composer — because
 * the layering is the design: three pieces that only meet here, in a widget,
 * and never import each other.
 */

const SESSION_ID = 'session-1'
const LATEST_MESSAGE_ID = 'msg-latest'
const EARLIER_MESSAGE_ID = 'msg-earlier'

const LATEST_TEXT =
  'I rewrote the scheduler so retries back off exponentially. The migration runs in a single transaction.'
const EARLIER_TEXT = 'The cache is warmed on boot, which costs about a second.'

const sendMessageToSession = vi.fn()

function agentMessage(id: string, text: string, state = 'complete') {
  return {
    id,
    sessionId: SESSION_ID,
    sequence: id === LATEST_MESSAGE_ID ? 2 : 1,
    turnId: 'turn-1',
    kind: 'message' as const,
    state,
    actor: 'assistant' as const,
    text,
    createdAt: '2026-08-06T10:00:00.000Z',
    updatedAt: '2026-08-06T10:00:00.000Z',
    providerMeta: {
      providerId: 'claude-code',
      providerItemId: null,
      providerEventType: 'assistant',
    },
  }
}

/** The transcript, reduced to the one thing this feature needs from it. */
function AnnotatableTranscript() {
  return (
    <div>
      <div data-annotation-message-id={EARLIER_MESSAGE_ID}>
        <p>{EARLIER_TEXT}</p>
      </div>
      <div data-annotation-message-id={LATEST_MESSAGE_ID}>
        <p>{LATEST_TEXT}</p>
      </div>
      {/* Still streaming: no attribute, so it offers nothing (ruling 5). */}
      <div>
        <p>Half a sentence the model has not finished</p>
      </div>
    </div>
  )
}

function renderSurface() {
  return render(
    <>
      <AnnotatableTranscript />
      <AnnotationSelectionCapture sessionId={SESSION_ID} />
      <AnnotationTray sessionId={SESSION_ID} />
      <ComposerContainer
        context={{
          kind: 'project',
          projectId: 'project-1',
          workspaceId: null,
          activeSessionId: SESSION_ID,
        }}
      />
    </>,
  )
}

/** Selects a phrase inside one rendered message, the way a mouse would. */
function selectTextIn(messageId: string, phrase: string) {
  const container = document.querySelector(
    `[data-annotation-message-id="${messageId}"] p`,
  )
  if (!container) throw new Error(`No message ${messageId} rendered.`)

  const textNode = container.firstChild
  if (!textNode || textNode.nodeType !== Node.TEXT_NODE) {
    throw new Error('Message has no text node to select.')
  }

  const start = (textNode.textContent ?? '').indexOf(phrase)
  if (start < 0) throw new Error(`"${phrase}" is not in the message.`)

  const range = document.createRange()
  range.setStart(textNode, start)
  range.setEnd(textNode, start + phrase.length)

  const selection = window.getSelection()
  selection?.removeAllRanges()
  selection?.addRange(range)

  fireEvent.mouseUp(document)
}

function comment(text: string) {
  fireEvent.click(screen.getByLabelText('Comment on the selected text'))
  fireEvent.change(screen.getByLabelText('Comment on the selected text'), {
    target: { value: text },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Add' }))
}

function sendComposer(freeText = '') {
  const textbox = screen.getByRole('textbox')
  if (freeText) {
    fireEvent.change(textbox, { target: { value: freeText } })
  }
  fireEvent.keyDown(textbox, { key: 'Enter', metaKey: true })
}

function sentText(): string {
  const call = sendMessageToSession.mock.calls[0]?.[0] as
    | { text: string }
    | undefined
  return call?.text ?? ''
}

describe('response annotations, end to end', () => {
  beforeEach(() => {
    sendMessageToSession.mockClear()
    useResponseAnnotationStore.setState({ annotationsBySessionId: {} })
    ;(window as unknown as { electronAPI: unknown }).electronAPI = {
      providerAccounts: { list: vi.fn(() => Promise.resolve([])) },
      turns: { listForSession: vi.fn(() => Promise.resolve([])) },
      providerQuota: { list: vi.fn().mockResolvedValue([]) },
    }

    useSessionStore.setState({
      sessions: [
        {
          id: SESSION_ID,
          contextKind: 'project',
          projectId: 'project-1',
          workspaceId: null,
          providerId: 'claude-code',
          model: 'claude-sonnet',
          effort: 'medium',
          name: 'Session',
          status: 'idle',
          attention: 'none',
          activity: null,
          contextWindow: null,
          workingDirectory: '/tmp/project-1',
          archivedAt: null,
          parentSessionId: null,
          forkStrategy: null,
          primarySurface: 'conversation',
          continuationToken: null,
          lastSequence: 0,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      globalChatSessions: [],
      activeConversationSessionId: SESSION_ID,
      activeConversation: [
        agentMessage(EARLIER_MESSAGE_ID, EARLIER_TEXT),
        agentMessage(LATEST_MESSAGE_ID, LATEST_TEXT),
      ],
      providerCatalogs: localProviderCatalogs([
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
              label: 'Claude Sonnet',
              defaultEffort: 'medium',
              effortOptions: [{ id: 'medium', label: 'Medium' }],
            },
          ],
          attachments: {
            supportsImage: true,
            supportsPdf: true,
            supportsText: true,
            maxImageBytes: 10 * 1024 * 1024,
            maxPdfBytes: 20 * 1024 * 1024,
            maxTextBytes: 1024 * 1024,
            maxTotalBytes: 50 * 1024 * 1024,
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
      ]),
      queuedInputsBySessionId: {},
      loadProviders: vi.fn(),
      loadProviderCatalog: vi.fn(),
      createAndStartSession: vi.fn(),
      createAndStartGlobalSession: vi.fn(),
      sendMessageToSession,
      cancelQueuedInput: vi.fn(),
      error: null,
    } as never)

    useSkillStore.setState({
      catalog: null,
      isCatalogLoading: false,
      catalogError: null,
      loadCatalog: vi.fn().mockResolvedValue(null),
      loadGlobalCatalog: vi.fn().mockResolvedValue(null),
    } as never)

    useProjectContextStore.setState({
      itemsByProjectId: {},
      attachmentsBySessionId: {},
      loading: false,
      error: null,
      loadForProject: vi.fn().mockResolvedValue(undefined),
    } as never)

    useAppSettingsStore.setState((state) => ({
      settings: {
        ...state.settings,
        piModelVisibility: { additionalModelIds: [] },
      },
      isLoaded: true,
    }))
  })

  it('turns a selection, a comment and free text into one compiled prompt', () => {
    renderSurface()

    selectTextIn(LATEST_MESSAGE_ID, 'runs in a single transaction')
    comment('This is the part that worries me.')

    expect(screen.getByTestId('annotation-tray')).toBeInTheDocument()
    sendComposer('Otherwise it looks good.')

    expect(sentText()).toBe(
      [
        'Responding to specific parts of your message:',
        '',
        '> runs in a single transaction',
        '',
        'This is the part that worries me.',
        '',
        'Otherwise it looks good.',
      ].join('\n'),
    )
  })

  it('sends annotations on their own, with no free text at all', () => {
    // Selecting three passages and hitting send is a complete thought.
    renderSurface()

    selectTextIn(LATEST_MESSAGE_ID, 'retries back off exponentially')
    comment('Good.')
    sendComposer()

    expect(sentText()).toBe(
      [
        'Responding to specific parts of your message:',
        '',
        '> retries back off exponentially',
        '',
        'Good.',
      ].join('\n'),
    )
  })

  it('sends an emoji reaction in the same shape as a comment', () => {
    renderSurface()

    selectTextIn(LATEST_MESSAGE_ID, 'I rewrote the scheduler')
    fireEvent.click(screen.getByLabelText('React with 👍'))
    sendComposer()

    expect(sentText()).toBe(
      [
        'Responding to specific parts of your message:',
        '',
        '> I rewrote the scheduler',
        '',
        '👍',
      ].join('\n'),
    )
  })

  it('says which quote came from an earlier message', () => {
    renderSurface()

    selectTextIn(LATEST_MESSAGE_ID, 'The migration')
    comment('Here.')
    selectTextIn(EARLIER_MESSAGE_ID, 'warmed on boot')
    comment('And this, from before.')

    sendComposer()

    expect(sentText()).toBe(
      [
        'Responding to specific parts of your message:',
        '',
        '> The migration',
        '',
        'Here.',
        '',
        '(from your earlier message)',
        '> warmed on boot',
        '',
        'And this, from before.',
      ].join('\n'),
    )
  })

  it('offers nothing for a selection outside a completed agent message', () => {
    // Streaming messages carry no annotation attribute at all, so there is
    // nothing to select inside them.
    renderSurface()

    const streaming = screen.getByText(
      'Half a sentence the model has not finished',
    )
    const range = document.createRange()
    range.selectNodeContents(streaming)
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
    fireEvent.mouseUp(document)

    expect(
      screen.queryByTestId('annotation-selection-popover'),
    ).not.toBeInTheDocument()
  })

  it('sends what an edited chip says, not what was first typed', () => {
    renderSurface()

    selectTextIn(LATEST_MESSAGE_ID, 'The migration')
    comment('First thought.')

    const chip = screen.getByTestId('annotation-chip')
    fireEvent.click(within(chip).getByLabelText(/^Edit response to/))
    fireEvent.change(screen.getByLabelText(/^Edit response to/), {
      target: { value: 'What I actually meant.' },
    })
    fireEvent.click(screen.getByLabelText('Save response'))

    sendComposer()

    expect(sentText()).toContain('What I actually meant.')
    expect(sentText()).not.toContain('First thought.')
  })

  it('drops a deleted chip from the compiled prompt', () => {
    renderSurface()

    selectTextIn(LATEST_MESSAGE_ID, 'The migration')
    comment('Keep this one.')
    selectTextIn(LATEST_MESSAGE_ID, 'retries back off')
    comment('Delete this one.')

    const chips = screen.getAllByTestId('annotation-chip')
    fireEvent.click(within(chips[1]!).getByLabelText(/^Remove response to/))

    sendComposer('done')

    expect(sentText()).toContain('Keep this one.')
    expect(sentText()).not.toContain('Delete this one.')
  })

  it('empties the tray once the annotations have been sent', () => {
    // Sent, not deleted: the tray reads pending only, so it goes quiet while
    // the record survives for the message to keep showing (RA3).
    renderSurface()

    selectTextIn(LATEST_MESSAGE_ID, 'The migration')
    comment('Sent now.')
    sendComposer('and gone')

    expect(screen.queryByTestId('annotation-tray')).not.toBeInTheDocument()
    expect(
      useResponseAnnotationStore.getState().annotationsBySessionId[SESSION_ID],
    ).toHaveLength(1)
  })

  it('leaves an ordinary message untouched when nothing was annotated', () => {
    // Someone who never selected anything cannot tell this feature exists.
    renderSurface()

    sendComposer('Just a normal message.')

    expect(sentText()).toBe('Just a normal message.')
  })
})
