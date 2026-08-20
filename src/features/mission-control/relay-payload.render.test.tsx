import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { Markdown } from '@/shared/ui/markdown.container'
// Reaches across into the backend on purpose. The wire compiles its payload in
// `electron/backend/relay/relay.pure.ts`, but that tree is DOM-free by design
// (tsconfig.node.json ships no DOM lib), and this format can only be judged
// once rendered. So the function is imported to where a renderer lives rather
// than a renderer dragged to where the function lives.
import { compileRelayPayload } from '../../../electron/backend/relay/relay.pure'

/**
 * The compiled relay payload, rendered (the MAR-2280 law applied to F7).
 *
 * The string tests in `electron/backend/relay/relay.pure.test.ts` pin every
 * character of the separator -- and that is exactly the assertion that let the
 * Response Annotations bug ship: a string that reads correctly can render as
 * something else entirely. Markdown glues a plain line onto the paragraph
 * above it, and absorbs anything under an open blockquote into that quote. So
 * a wire's standing brief and the message it was written about could arrive as
 * one blurred block, or the message could arrive looking like part of the
 * brief.
 *
 * These tests put the compiled payload through the same component the
 * transcript uses and ask the DOM where the words actually landed. Anything
 * asserting this format's meaning rather than its bytes belongs here.
 */

const BRIEF = 'Take a look at this and tell me what you would change.'
const MESSAGE = 'The migration runs in a single transaction.'

/** The element that actually holds a phrase, so we can ask what encloses it. */
function leafHolding(container: HTMLElement, text: string): Element {
  const match = Array.from(container.querySelectorAll('*')).find(
    (element) =>
      element.textContent?.includes(text) && element.children.length === 0,
  )
  if (!match) throw new Error(`"${text}" was not rendered at all.`)
  return match
}

function renderPayload(instruction: string | null, message: string) {
  return render(
    <Markdown content={compileRelayPayload(instruction, message)} />,
  )
}

describe('the compiled relay payload, rendered', () => {
  it('keeps the brief and the message as separate blocks', () => {
    // Without the blank line these render as one paragraph, and the receiving
    // model reads "…what you would change. The migration runs…" as one thought.
    const { container } = renderPayload(BRIEF, MESSAGE)

    expect(leafHolding(container, BRIEF)).not.toBe(
      leafHolding(container, MESSAGE),
    )
  })

  it('keeps a quoted message inside its own quote, and the brief outside it', () => {
    const { container } = renderPayload(BRIEF, `> ${MESSAGE}`)

    expect(leafHolding(container, MESSAGE).closest('blockquote')).not.toBeNull()
    expect(leafHolding(container, BRIEF).closest('blockquote')).toBeNull()
  })

  it('does not let a brief that ends in a quote swallow the message', () => {
    // The Response Annotations bug, mirrored: an instruction whose last line
    // opens a blockquote would absorb the message into the brief itself.
    const { container } = renderPayload(
      'Compare against:\n> the old plan',
      MESSAGE,
    )

    expect(
      leafHolding(container, 'the old plan').closest('blockquote'),
    ).not.toBeNull()
    expect(leafHolding(container, MESSAGE).closest('blockquote')).toBeNull()
  })

  it('keeps a fenced code message inside its fence', () => {
    const { container } = renderPayload(BRIEF, '```ts\nconst answer = 42\n```')

    expect(
      leafHolding(container, 'const answer = 42').closest('pre'),
    ).not.toBeNull()
    expect(leafHolding(container, BRIEF).closest('pre')).toBeNull()
  })

  it('renders an unbriefed payload as the message alone', () => {
    const { container } = renderPayload(null, MESSAGE)

    expect(container.textContent).toContain(MESSAGE)
    expect(container.textContent).not.toContain(BRIEF)
  })
})
