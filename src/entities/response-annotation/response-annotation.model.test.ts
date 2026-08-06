import { beforeEach, describe, expect, it } from 'vitest'
import { useResponseAnnotationStore } from './response-annotation.model'
import type { ResponseAnnotationDraft } from './response-annotation.types'

const SESSION = 'session-1'

function draft(
  overrides: Partial<ResponseAnnotationDraft> = {},
): ResponseAnnotationDraft {
  return {
    messageId: 'msg-1',
    quotedText: 'the part I want to answer',
    prefix: 'before ',
    suffix: ' after',
    body: 'my response',
    kind: 'comment',
    ...overrides,
  }
}

function annotationsFor(sessionId: string) {
  return (
    useResponseAnnotationStore.getState().annotationsBySessionId[sessionId] ??
    []
  )
}

describe('useResponseAnnotationStore', () => {
  beforeEach(() => {
    useResponseAnnotationStore.setState({ annotationsBySessionId: {} })
  })

  it('stores a capture as a pending annotation with its own identity', () => {
    const stored = useResponseAnnotationStore
      .getState()
      .addAnnotation(SESSION, draft())

    expect(stored.id).toBeTruthy()
    expect(stored.state).toBe('pending')
    expect(stored.createdAt).toBeTruthy()
    expect(stored.quotedText).toBe('the part I want to answer')
    expect(annotationsFor(SESSION)).toEqual([stored])
  })

  it('keeps annotations in capture order', () => {
    const store = useResponseAnnotationStore.getState()
    store.addAnnotation(SESSION, draft({ body: 'first' }))
    store.addAnnotation(SESSION, draft({ body: 'second' }))

    expect(annotationsFor(SESSION).map((entry) => entry.body)).toEqual([
      'first',
      'second',
    ])
  })

  it('keeps one session annotations out of another', () => {
    // A pending annotation belongs to the conversation it quotes; carrying it
    // across a session switch would send a quote nobody in that session wrote.
    const store = useResponseAnnotationStore.getState()
    store.addAnnotation(SESSION, draft())

    expect(annotationsFor('session-2')).toEqual([])
  })

  it('edits the body of a pending annotation', () => {
    const store = useResponseAnnotationStore.getState()
    const stored = store.addAnnotation(SESSION, draft())

    store.editAnnotation(SESSION, stored.id, 'what I actually meant')

    expect(annotationsFor(SESSION)[0]?.body).toBe('what I actually meant')
  })

  it('refuses to rewrite what was already sent', () => {
    // The compiled message is a record of what the model was told; editing an
    // annotation after the fact would make the tray disagree with the transcript.
    const store = useResponseAnnotationStore.getState()
    const stored = store.addAnnotation(SESSION, draft({ body: 'as sent' }))
    store.markPendingAsSent(SESSION)

    store.editAnnotation(SESSION, stored.id, 'revised after the fact')

    expect(annotationsFor(SESSION)[0]?.body).toBe('as sent')
  })

  it('removes one annotation and leaves the rest', () => {
    const store = useResponseAnnotationStore.getState()
    const first = store.addAnnotation(SESSION, draft({ body: 'first' }))
    store.addAnnotation(SESSION, draft({ body: 'second' }))

    store.removeAnnotation(SESSION, first.id)

    expect(annotationsFor(SESSION).map((entry) => entry.body)).toEqual([
      'second',
    ])
  })

  it('keeps sent annotations rather than deleting them', () => {
    // The tray reads pending only, so it empties; the annotations survive for
    // the message to keep showing (RA3).
    const store = useResponseAnnotationStore.getState()
    store.addAnnotation(SESSION, draft())

    store.markPendingAsSent(SESSION)

    expect(annotationsFor(SESSION)).toHaveLength(1)
    expect(annotationsFor(SESSION)[0]?.state).toBe('sent')
  })

  it('leaves annotations captured after a send still pending', () => {
    const store = useResponseAnnotationStore.getState()
    store.addAnnotation(SESSION, draft({ body: 'before send' }))
    store.markPendingAsSent(SESSION)
    store.addAnnotation(SESSION, draft({ body: 'after send' }))

    expect(
      annotationsFor(SESSION).map((entry) => [entry.body, entry.state]),
    ).toEqual([
      ['before send', 'sent'],
      ['after send', 'pending'],
    ])
  })

  it('clears a session entirely', () => {
    const store = useResponseAnnotationStore.getState()
    store.addAnnotation(SESSION, draft())

    store.clearAnnotations(SESSION)

    expect(annotationsFor(SESSION)).toEqual([])
  })

  it('ignores edits and removals for a session it never saw', () => {
    const store = useResponseAnnotationStore.getState()

    expect(() => {
      store.editAnnotation('unknown', 'nope', 'x')
      store.removeAnnotation('unknown', 'nope')
      store.markPendingAsSent('unknown')
      store.clearAnnotations('unknown')
    }).not.toThrow()
  })
})
