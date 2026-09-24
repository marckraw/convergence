import type { FC } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react'
import {
  useSessionStore,
  type ConversationItem,
  type Session,
} from '@/entities/session'
import { useResponseAnnotationStore } from '@/entities/response-annotation'
import { useSkillStore } from '@/entities/skill'
import type { ComposerSessionContext } from '@/features/composer'
import {
  cornerRectsIntersect,
  floatingCornerReservedRect,
  type CornerRect,
} from '@/shared/ui/floating-corner.pure'
import { SessionConversationSurface } from './session-conversation-surface.container'

/** Every draw of the Actions menu's view, i.e. every render of its container. */
const actionsViewDraws = vi.hoisted(() => ({ count: 0 }))

vi.mock(
  '@/features/conversation-actions/conversation-actions.presentational',
  async (importOriginal) => {
    const actual = await importOriginal<{
      ConversationActionsView: FC<object>
    }>()
    const Counted: FC<object> = (props) => {
      actionsViewDraws.count += 1
      return <actual.ConversationActionsView {...props} />
    }
    return { ConversationActionsView: Counted }
  },
)

vi.mock('@/features/composer', () => ({
  ComposerContainer: ({ context }: { context: ComposerSessionContext }) => (
    <div data-testid="composer">
      {context.kind}:{context.activeSessionId ?? 'new'}
    </div>
  ),
}))

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
    getTotalSize: () =>
      Array.from({ length: options.count }, (_, index) =>
        options.estimateSize(index),
      ).reduce((total, size) => total + size, 0),
    measureElement: vi.fn(),
    scrollToIndex: vi.fn(),
  }),
}))

const baseSession: Session = {
  id: 'session-1',
  contextKind: 'global',
  projectId: null,
  workspaceId: null,
  providerId: 'claude-code',
  model: 'sonnet',
  effort: 'medium',
  name: 'Global chat',
  status: 'running',
  attention: 'none',
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

describe('SessionConversationSurface', () => {
  beforeEach(() => {
    useResponseAnnotationStore.setState({ annotationsBySessionId: {} })
  })

  it('renders the reusable transcript and composer for a global session', () => {
    render(
      <SessionConversationSurface
        session={baseSession}
        conversationItems={[]}
        composerContext={{ kind: 'global', activeSessionId: 'session-1' }}
        onApprove={vi.fn()}
        onDeny={vi.fn()}
        onInputAnswer={vi.fn()}
      />,
    )

    expect(
      screen.getByTestId('session-transcript-scroll-region'),
    ).toBeInTheDocument()
    expect(screen.getByTestId('composer')).toHaveTextContent('global:session-1')
  })

  it('renders a disabled composer reason instead of composer controls', () => {
    render(
      <SessionConversationSurface
        session={baseSession}
        conversationItems={[]}
        composerContext={{ kind: 'global', activeSessionId: 'session-1' }}
        composerDisabledReason="Conversation input is disabled."
        onApprove={vi.fn()}
        onDeny={vi.fn()}
        onInputAnswer={vi.fn()}
      />,
    )

    expect(screen.getByText('Conversation input is disabled.')).toBeVisible()
    expect(screen.queryByTestId('composer')).toBeNull()
  })

  it('shows an old convergence-ui-html fence as an ordinary code block with no split or chip (MAR-3104)', () => {
    render(
      <SessionConversationSurface
        session={baseSession}
        conversationItems={[
          {
            id: 'message-1',
            sessionId: 'session-1',
            sequence: 1,
            turnId: 'turn-1',
            kind: 'message',
            actor: 'assistant',
            state: 'complete',
            text: [
              'Markdown answer.',
              '',
              '```convergence-ui-html',
              '---',
              'title: Preview panel',
              '---',
              '<main>Generated UI</main>',
              '```',
            ].join('\n'),
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
            providerMeta: {
              providerId: 'codex',
              providerItemId: null,
              providerEventType: 'assistant',
            },
          },
        ]}
        composerContext={{ kind: 'global', activeSessionId: 'session-1' }}
        onApprove={vi.fn()}
        onDeny={vi.fn()}
        onInputAnswer={vi.fn()}
      />,
    )

    // R2 — no panel, no chip; the fence body is visible as code.
    // (Mutation R2: restore parseAssistantUiResponse strip → HTML absent → red.)
    expect(screen.queryByTestId('session-ui-response-split')).toBeNull()
    expect(screen.queryByTestId('ui-response-artifact-indicator')).toBeNull()
    expect(screen.getByText('Markdown answer.')).toBeInTheDocument()
    expect(screen.getByText('<main>Generated UI</main>')).toBeInTheDocument()

    // R3 — transcript row carries no leftover selection affordance.
    // (Mutation R3: leave data-ui-response-artifact on the row → red.)
    const row = screen.getByTestId('session-transcript-row')
    expect(row).not.toHaveAttribute('data-ui-response-artifact')
    expect(row).not.toHaveAttribute('data-selected-ui-response-artifact')
  })

  it('remounts the annotation tray per session so an open edit does not follow a switch (MAR-3008)', () => {
    const sessionA: Session = { ...baseSession, id: 'session-a', name: 'A' }
    const sessionB: Session = { ...baseSession, id: 'session-b', name: 'B' }
    useResponseAnnotationStore.getState().addAnnotation('session-a', {
      messageId: 'msg-a',
      quotedText: 'the quoted line',
      prefix: '',
      suffix: '',
      body: 'original reply',
      kind: 'comment',
    })

    const { rerender } = render(
      <SessionConversationSurface
        session={sessionA}
        conversationItems={[]}
        composerContext={{ kind: 'global', activeSessionId: 'session-a' }}
        onApprove={vi.fn()}
        onDeny={vi.fn()}
        onInputAnswer={vi.fn()}
      />,
    )

    const strip = screen.getByRole('list', { name: 'Responding to' })
    const pill = within(strip)
      .getAllByRole('button')
      .find((button) => button.hasAttribute('data-annotation-pill'))
    expect(pill).toBeDefined()
    fireEvent.click(pill!)
    expect(screen.getByTestId('annotation-chip')).toBeInTheDocument()
    fireEvent.click(
      within(screen.getByTestId('annotation-chip')).getByLabelText(
        /^Edit response to/,
      ),
    )
    const editField = screen.getByLabelText(/^Edit response to/)
    fireEvent.change(editField, {
      target: { value: 'draft that must not travel' },
    })
    expect(editField).toHaveValue('draft that must not travel')
    expect(document.activeElement).toBe(editField)

    rerender(
      <SessionConversationSurface
        session={sessionB}
        conversationItems={[]}
        composerContext={{ kind: 'global', activeSessionId: 'session-b' }}
        onApprove={vi.fn()}
        onDeny={vi.fn()}
        onInputAnswer={vi.fn()}
      />,
    )
    rerender(
      <SessionConversationSurface
        session={sessionA}
        conversationItems={[]}
        composerContext={{ kind: 'global', activeSessionId: 'session-a' }}
        onApprove={vi.fn()}
        onDeny={vi.fn()}
        onInputAnswer={vi.fn()}
      />,
    )

    // No chip open — remount cleared expanded/edit view state.
    // (Mutation: drop `key={sessionId}` → measured red on the edit-input
    // assertion below — the stale `editingId` re-renders the input.)
    expect(document.querySelector('[data-annotation-expanded]')).toBeNull()
    expect(screen.queryByLabelText(/^Edit response to/)).toBeNull()
    expect(screen.queryByDisplayValue('draft that must not travel')).toBeNull()
    const tray = screen.getByTestId('annotation-tray')
    expect(tray.contains(document.activeElement)).toBe(false)
  })

  it('remounts the selection capture per session so a draft cannot follow or file on the wrong one (MAR-3096)', () => {
    const sessionA: Session = { ...baseSession, id: 'session-a', name: 'A' }
    const sessionB: Session = { ...baseSession, id: 'session-b', name: 'B' }
    const messageA: ConversationItem = {
      id: 'msg-a',
      sessionId: 'session-a',
      sequence: 1,
      turnId: 'turn-1',
      kind: 'message',
      actor: 'assistant',
      state: 'complete',
      text: 'The scheduler retries with exponential backoff.',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      providerMeta: {
        providerId: 'claude-code',
        providerItemId: null,
        providerEventType: 'assistant',
      },
    }

    const { rerender } = render(
      <SessionConversationSurface
        session={sessionA}
        conversationItems={[messageA]}
        composerContext={{ kind: 'global', activeSessionId: 'session-a' }}
        onApprove={vi.fn()}
        onDeny={vi.fn()}
        onInputAnswer={vi.fn()}
      />,
    )

    selectTextInMessage('msg-a', 'exponential backoff')
    expect(
      screen.getByTestId('annotation-selection-popover'),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('Comment on the selected text'))
    fireEvent.change(screen.getByLabelText('Comment on the selected text'), {
      target: { value: 'draft that must not cross' },
    })
    expect(screen.getByLabelText('Comment on the selected text')).toHaveValue(
      'draft that must not cross',
    )

    rerender(
      <SessionConversationSurface
        session={sessionB}
        conversationItems={[]}
        composerContext={{ kind: 'global', activeSessionId: 'session-b' }}
        onApprove={vi.fn()}
        onDeny={vi.fn()}
        onInputAnswer={vi.fn()}
      />,
    )

    // No popover on B — remount cleared capture/isCommenting/commentValue.
    // (Mutation R1: drop `key={sessionId}` → measured red here.)
    expect(screen.queryByTestId('annotation-selection-popover')).toBeNull()
    expect(screen.queryByDisplayValue('draft that must not cross')).toBeNull()

    // Nothing was committed, and with the key there is no popover left to
    // submit on B — so a wrong-session write is impossible (no mounted
    // capture still holds A's messageId).
    // (Mutation R2: drop the key and submit the surviving popover on B →
    // annotationsBySessionId['session-b'] appears with messageId msg-a → red.)
    const store = useResponseAnnotationStore.getState().annotationsBySessionId
    expect(store['session-a']).toBeUndefined()
    expect(store['session-b']).toBeUndefined()

    rerender(
      <SessionConversationSurface
        session={sessionA}
        conversationItems={[messageA]}
        composerContext={{ kind: 'global', activeSessionId: 'session-a' }}
        onApprove={vi.fn()}
        onDeny={vi.fn()}
        onInputAnswer={vi.fn()}
      />,
    )
    expect(screen.queryByTestId('annotation-selection-popover')).toBeNull()
    expect(screen.queryByDisplayValue('draft that must not cross')).toBeNull()
  })
})

describe('the Actions button (MAR-3393 R1)', () => {
  function renderSurface(
    overrides: Partial<{
      session: Session
      composerContext: ComposerSessionContext | null
      composerDisabledReason: string | null
    }> = {},
  ) {
    render(
      <SessionConversationSurface
        session={overrides.session ?? baseSession}
        conversationItems={[]}
        composerContext={
          overrides.composerContext === undefined
            ? { kind: 'global', activeSessionId: 'session-1' }
            : overrides.composerContext
        }
        composerDisabledReason={overrides.composerDisabledReason ?? null}
        onApprove={vi.fn()}
        onDeny={vi.fn()}
        onInputAnswer={vi.fn()}
      />,
    )
  }

  function actionsButton() {
    return screen.queryByRole('button', { name: 'Actions' })
  }

  it('is there for a global conversation', () => {
    renderSurface()
    expect(actionsButton()).toBeInTheDocument()
  })

  it('is there for a project conversation', () => {
    renderSurface({
      session: { ...baseSession, contextKind: 'project', projectId: 'p-1' },
      composerContext: {
        kind: 'project',
        projectId: 'p-1',
        workspaceId: null,
        activeSessionId: 'session-1',
      },
    })
    expect(actionsButton()).toBeInTheDocument()
  })

  it('is absent for a removed worktree, no context, a draft, a shell and a terminal-primary session', () => {
    renderSurface({ composerDisabledReason: 'Worktree removed.' })
    expect(actionsButton()).toBeNull()
    cleanup()

    renderSurface({ composerContext: null })
    expect(actionsButton()).toBeNull()
    cleanup()

    renderSurface({
      composerContext: { kind: 'global', activeSessionId: null },
    })
    expect(actionsButton()).toBeNull()
    cleanup()

    renderSurface({ session: { ...baseSession, providerId: 'shell' } })
    expect(actionsButton()).toBeNull()
    cleanup()

    renderSurface({
      session: { ...baseSession, primarySurface: 'terminal' },
    })
    expect(actionsButton()).toBeNull()
  })
})

/**
 * Reads the few Tailwind tokens that place the Actions button, exactly as the
 * rendered elements carry them (MAR-3416). jsdom has no layout, so the box is
 * computed from the classes and the CSS variables the row sets, never from a
 * second copy of the numbers. A token it cannot read throws, so a new
 * placement class cannot slip past it.
 */
function placementTokens(
  element: Element,
  containerWidth: number,
): Map<string, string> {
  const active = new Map<string, string>()
  for (const token of (element.getAttribute('class') ?? '').split(/\s+/)) {
    if (!token) continue
    let utility = token
    const query = token.match(/^@min-\[(\d+)rem\]:(.+)$/)
    if (query) {
      if (containerWidth < Number(query[1]) * 16) continue
      utility = query[2]
    } else if (token.includes(':')) {
      continue // a state variant (hover, focus, inert, ...): not in play
    }
    if (/^(absolute|relative|fixed|static)$/.test(utility)) {
      active.set('position', utility)
      continue
    }
    const length = utility.match(/^(bottom|right|pr|pb|px|py|w|h)-(.+)$/)
    if (length) active.set(length[1], length[2])
  }
  return active
}

function lengthPx(value: string | undefined, element: Element): number {
  if (value === undefined) return 0
  if (/^\d+$/.test(value)) return Number(value) * 4
  const literal = value.match(/^\[(\d+)px\]$/)
  if (literal) return Number(literal[1])
  const variable = value.match(/^\[var\((--[\w-]+)\)\]$/)
  if (variable) {
    const set = (element as HTMLElement).style.getPropertyValue(variable[1])
    const px = set.match(/^(\d+)px$/)
    if (!px) throw new Error(`${variable[1]} is "${set}", not a px length`)
    return Number(px[1])
  }
  throw new Error(`cannot read the length "${value}"`)
}

/**
 * The Actions button's box in a window whose right and bottom edges are the
 * surface's (the worst case, MAR-3416 R2), and which layout placed it.
 */
function actionsButtonRect(
  row: Element,
  surface: { width: number; height: number },
): { rect: CornerRect; layout: 'row' | 'gutter' } {
  const host = row.parentElement!
  const anchor = row.firstElementChild!
  const hostTokens = placementTokens(host, surface.width)
  const hostPadRight = lengthPx(
    hostTokens.get('pr') ?? hostTokens.get('px'),
    host,
  )
  const hostPadBottom = lengthPx(
    hostTokens.get('pb') ?? hostTokens.get('py'),
    host,
  )
  // A container query reads the host's content box, not its border box.
  const contentWidth = surface.width - 2 * hostPadRight
  const rowTokens = placementTokens(row, contentWidth)
  const anchorTokens = placementTokens(anchor, contentWidth)
  const width = lengthPx(anchorTokens.get('w'), anchor)
  const height = lengthPx(anchorTokens.get('h'), anchor)
  const rowPadRight = lengthPx(rowTokens.get('pr'), row)
  const absolute = rowTokens.get('position') === 'absolute'
  const right = absolute
    ? surface.width - lengthPx(rowTokens.get('right'), row) - rowPadRight
    : surface.width - hostPadRight - rowPadRight
  const bottom = absolute
    ? surface.height - lengthPx(rowTokens.get('bottom'), row)
    : surface.height - hostPadBottom
  return {
    rect: { left: right - width, top: bottom - height, right, bottom },
    layout: absolute ? 'gutter' : 'row',
  }
}

describe('the Actions layer and the feedback corner (MAR-3416)', () => {
  beforeEach(() => {
    // Opening the fan asks the backend for the routines' state.
    ;(window as unknown as { electronAPI: unknown }).electronAPI = {
      conversationActions: { describe: vi.fn().mockResolvedValue([]) },
    }
  })

  function renderSurface() {
    render(
      <SessionConversationSurface
        session={baseSession}
        conversationItems={[]}
        composerContext={{ kind: 'global', activeSessionId: 'session-1' }}
        onApprove={vi.fn()}
        onDeny={vi.fn()}
        onInputAnswer={vi.fn()}
      />,
    )
    return screen.getByTestId('conversation-actions')
  }

  it('R1: one layer holds the button, every fan pill and Close — above the composer card (z-10) and the feedback button (z-40), below dialogs (z-50)', () => {
    const root = renderSurface()
    const layer = (root.getAttribute('class') ?? '').match(
      /(?:^|\s)z-\[(\d+)\](?:\s|$)/,
    )
    expect(layer, 'the Actions root carries no z-index layer').not.toBeNull()
    expect(Number(layer![1])).toBeGreaterThan(40)
    expect(Number(layer![1])).toBeLessThan(50)
    expect(root.className.split(/\s+/)).toContain('relative')

    fireEvent.click(screen.getByRole('button', { name: 'Actions' }))
    const fan = screen.getByRole('menu', { name: 'Actions' })
    const pills = within(fan).getAllByRole('menuitem')
    expect(pills.map((pill) => pill.textContent)).toEqual(
      expect.arrayContaining(['Skills', 'Routines', 'Close']),
    )
    for (const pill of pills) expect(root.contains(pill)).toBe(true)
  })

  it('R1: the layer hides under covered, inert content, so it cannot show through the expanded Loom', () => {
    const root = renderSurface()
    expect(root.className.split(/\s+/)).toContain('in-[[inert]]:invisible')
  })

  it('R2: at 600, 896 (56rem), 928 and 1400 px the button and the Close pill stay out of the feedback corner', () => {
    const root = renderSurface()
    fireEvent.click(screen.getByRole('button', { name: 'Actions' }))
    const close = screen.getByRole('menuitem', { name: 'Close menu' })
    const closeTokens = placementTokens(close, 0)
    expect(close.parentElement?.parentElement).toBe(root.firstElementChild)
    expect(closeTokens.get('position')).toBe('absolute')
    expect(lengthPx(closeTokens.get('bottom'), close)).toBe(0)
    expect(lengthPx(closeTokens.get('right'), close)).toBe(0)
    expect(lengthPx(closeTokens.get('w'), close)).toBe(96)

    const height = 800
    const layouts: Record<number, 'row' | 'gutter'> = {
      600: 'row',
      // The host's px-4 leaves a 864 px content box: still the row.
      896: 'row',
      928: 'gutter',
      1400: 'gutter',
    }
    for (const [width, layout] of Object.entries(layouts)) {
      const surface = { width: Number(width), height }
      const button = actionsButtonRect(root, surface)
      expect(button.layout, `layout at ${width}px`).toBe(layout)
      // Close takes the button's own box (bottom-0 right-0 w-24 in the anchor).
      expect(
        cornerRectsIntersect(button.rect, floatingCornerReservedRect(surface)),
        `the Actions button at ${width}px: ${JSON.stringify(button.rect)}`,
      ).toBe(false)
    }
  })
})

describe('the Actions button while a reply streams (MAR-3393 R16)', () => {
  function streamingMessage(text: string): ConversationItem {
    return {
      id: 'message-streaming',
      sessionId: 'session-1',
      sequence: 1,
      turnId: 'turn-1',
      kind: 'message',
      actor: 'assistant',
      state: 'streaming',
      text,
      createdAt: '2026-09-24T00:00:00.000Z',
      updatedAt: '2026-09-24T00:00:00.000Z',
      providerMeta: {
        providerId: 'claude-code',
        providerItemId: null,
        providerEventType: null,
      },
    } as ConversationItem
  }

  /**
   * Shaped like SessionView: it subscribes to the open conversation, so every
   * streamed append redraws it and the surface under it, and it hands the
   * surface a context and handlers written inline.
   */
  function StreamingParent() {
    const items = useSessionStore((state) => state.activeConversation)
    return (
      <SessionConversationSurface
        session={{ ...baseSession, id: 'session-1' }}
        conversationItems={items}
        composerContext={{
          kind: 'project',
          projectId: 'project-1',
          workspaceId: null,
          activeSessionId: 'session-1',
        }}
        onApprove={vi.fn()}
        onDeny={vi.fn()}
        onInputAnswer={vi.fn()}
      />
    )
  }

  it('draws a closed menu 0 times across 30 streamed appends and 5 catalog loads the composer runs — mutations drop the memo, or read the catalog while closed, turn red', async () => {
    useSessionStore.setState({ activeConversation: [streamingMessage('')] })
    render(<StreamingParent />)
    await act(async () => {})
    expect(screen.getByRole('button', { name: 'Actions' })).toBeInTheDocument()
    actionsViewDraws.count = 0

    for (let i = 1; i <= 30; i += 1) {
      act(() => {
        useSessionStore.setState({
          activeConversation: [streamingMessage(`token ${i}`)],
        })
      })
    }
    // The appends landed: the transcript drew every one.
    expect(screen.getByText('token 30')).toBeInTheDocument()

    for (let i = 1; i <= 5; i += 1) {
      act(() => {
        useSkillStore.setState({
          isCatalogLoading: i % 2 === 1,
          catalog: {
            projectId: 'project-1',
            projectName: 'Project',
            providers: [],
            refreshedAt: String(i),
          },
        })
      })
    }

    expect(actionsViewDraws.count).toBe(0)
  })
})

/** Selects a phrase inside a rendered annotatable message (jsdom Range). */
function selectTextInMessage(messageId: string, phrase: string) {
  const container = document.querySelector(
    `[data-annotation-message-id="${messageId}"]`,
  )
  if (!container) throw new Error(`No message ${messageId} rendered.`)

  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT)
  let textNode: Text | null = null
  let start = -1
  while (walker.nextNode()) {
    const node = walker.currentNode as Text
    const index = (node.textContent ?? '').indexOf(phrase)
    if (index >= 0) {
      textNode = node
      start = index
      break
    }
  }
  if (!textNode || start < 0) {
    throw new Error(`"${phrase}" is not in the message.`)
  }

  const range = document.createRange()
  range.setStart(textNode, start)
  range.setEnd(textNode, start + phrase.length)

  const selection = window.getSelection()
  selection?.removeAllRanges()
  selection?.addRange(range)

  fireEvent.mouseUp(document)
}
