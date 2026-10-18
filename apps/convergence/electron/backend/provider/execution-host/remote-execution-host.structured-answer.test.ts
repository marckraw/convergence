import { beforeEach, describe, expect, it } from 'vitest'
import type { SessionDelta } from '../../session/conversation-item.types'
import type {
  AttentionState,
  SessionHandle,
  SessionStartConfig,
} from '../provider.types'
import {
  createStubDaemon,
  DAEMON_HEALTH_FIXTURE_0_26_1,
  envelope,
  waitUntil,
  type StubDaemon,
} from '@convergence/execution-host-client'
import {
  EXECUTION_HOST_STRUCTURED_INTERACTIONS_CAPABILITY,
  type LocalSendMessageOptions,
} from './execution-host-wire-mapping.pure'
import { RemoteExecutionHost } from './remote-execution-host'

function createHost(stub: StubDaemon): RemoteExecutionHost {
  return new RemoteExecutionHost({
    onEventSeq: () => {},
    connection: {
      resolveConnection: async () => ({
        baseUrl: 'http://daemon.test',
        token: 'test-token',
      }),
    },
    fetch: stub.fetchFn,
    reconnect: {
      maxAttempts: 2,
      wait: () => new Promise((resolve) => setTimeout(resolve, 0)),
    },
  })
}

/** The 0.26.1 capture with `interactions.structured` taken out, as an older host says. */
function healthWithoutStructuredInteractions(): string {
  const body = JSON.parse(DAEMON_HEALTH_FIXTURE_0_26_1) as {
    executionProtocol: { capabilities: string[] }
  }
  body.executionProtocol.capabilities =
    body.executionProtocol.capabilities.filter(
      (id) => id !== EXECUTION_HOST_STRUCTURED_INTERACTIONS_CAPABILITY,
    )
  return JSON.stringify(body)
}

function startConfig(sessionId: string): SessionStartConfig {
  return {
    sessionId,
    workingDirectory: '/work',
    initialMessage: 'hello',
    model: null,
    effort: null,
    continuationToken: null,
  }
}

const CHOICE_ANSWER: LocalSendMessageOptions = {
  deliveryMode: 'normal',
  interactionResponse: {
    kind: 'choice',
    providerItemId: 'local-request-1',
    answers: [{ questionId: 'q1', values: ['yes'] }],
  },
}

/**
 * A structured answer to an input request (MAR-4276): sent only to a host that
 * advertises `interactions.structured`, as the protocol's shared client does
 * from 0.26. Refused here otherwise, out loud, and never posted.
 */
describe('RemoteExecutionHost structured answers', () => {
  let stub: StubDaemon
  let host: RemoteExecutionHost

  beforeEach(() => {
    stub = createStubDaemon()
    host = createHost(stub)
  })

  async function startedHandle(sessionId: string): Promise<SessionHandle> {
    const handle = host.start('claude', startConfig(sessionId))
    await waitUntil(
      () => stub.eventStreamLastEventIds.length === 1,
      'event stream to open',
    )
    return handle
  }

  describe('on a host that does not advertise interactions.structured', () => {
    beforeEach(async () => {
      stub.setHealthBody(healthWithoutStructuredInteractions())
      await host.refreshProviders()
    })

    /** Mutation: remove the `structuredAnswerRefusal` check from `postCommand`, or have it ignore the handshake's capabilities, and this is red. */
    it('refuses the answer unsent, with a note saying why and attention raised', async () => {
      const handle = await startedHandle('s-old-host')
      const deltas: SessionDelta[] = []
      const attentions: AttentionState[] = []
      handle.onDelta((delta) => deltas.push(delta))
      handle.onAttentionChange((attention) => attentions.push(attention))
      stub.emit(
        envelope(1, { kind: 'status', status: 'running' }, 's-old-host'),
      )
      await waitUntil(() => deltas.length === 1, 'the stream to deliver')
      deltas.length = 0

      handle.sendMessage('', undefined, undefined, CHOICE_ANSWER)
      await waitUntil(
        () => attentions.includes('failed'),
        'the refusal to be reported',
      )

      expect(stub.commandEnvelopes).toEqual([])
      const notes = JSON.stringify(
        deltas.filter((delta) => delta.kind === 'conversation.item.add'),
      )
      expect(notes).toContain('was not delivered')
      expect(notes).toContain('interactions.structured')

      handle.stop()
    })

    /** Mutation: gate every send-message instead of only one carrying `interactionResponse`, and this is red. */
    it('still sends a plain message to the same host', async () => {
      const handle = await startedHandle('s-old-host-plain')

      handle.sendMessage('a plain message')
      await waitUntil(
        () => stub.commandEnvelopes.length === 1,
        'the message to be posted',
      )

      expect(stub.commandEnvelopes[0]).toMatchObject({
        sessionId: 's-old-host-plain',
        command: { kind: 'send-message', text: 'a plain message' },
      })

      handle.stop()
    })
  })

  describe('on a host that advertises it', () => {
    /** Mutation: send the answer with the local provider item id, or not at all, and this is red. */
    it('posts the answer by allowlist, without the local provider item id', async () => {
      await host.refreshProviders()
      const handle = await startedHandle('s-new-host')

      handle.sendMessage('', undefined, undefined, CHOICE_ANSWER)
      await waitUntil(
        () => stub.commandEnvelopes.length === 1,
        'the answer to be posted',
      )

      expect(stub.commandEnvelopes).toEqual([
        {
          protocolVersion: 1,
          sessionId: 's-new-host',
          command: {
            kind: 'send-message',
            text: '',
            options: {
              deliveryMode: 'normal',
              interactionResponse: {
                kind: 'choice',
                answers: [{ questionId: 'q1', values: ['yes'] }],
              },
            },
          },
        },
      ])

      handle.stop()
    })
  })

  describe('on a run attached at boot', () => {
    /** Mutation: drop the `ensureListed()` from `begin()` for a resumed run and this is red; nothing lists the host, so the answer goes unchecked. */
    it('lists its host in the background, so an answer to a host that cannot read it is refused', async () => {
      stub.setHealthBody(healthWithoutStructuredInteractions())
      const handle = host.attach('claude', startConfig('s-boot'), 0)
      const attentions: AttentionState[] = []
      handle.onAttentionChange((attention) => attentions.push(attention))
      await waitUntil(() => host.handshake() !== null, 'the host to be listed')

      handle.sendMessage('', undefined, undefined, CHOICE_ANSWER)
      await waitUntil(
        () => attentions.includes('failed'),
        'the refusal to be reported',
      )

      expect(stub.commandEnvelopes).toEqual([])

      handle.stop()
    })
  })

  describe('on a host that said nothing readable', () => {
    /** Mutation: wait for a listing before sending an answer and this is red; a plain message sent right behind it would overtake it. */
    it('sends an answer from a run attached before its host was listed, without waiting to be told', async () => {
      // The listing the attach asks for fails, so the host stays unread.
      stub.setProvidersStatus(500)
      const handle = host.attach('claude', startConfig('s-unlisted'), 0)
      await waitUntil(
        () => stub.eventStreamLastEventIds.length === 1,
        'event stream to open',
      )
      expect(host.handshake()).toBeNull()

      handle.sendMessage('', undefined, undefined, CHOICE_ANSWER)
      handle.sendMessage('then a plain message')
      await waitUntil(
        () => stub.commandEnvelopes.length === 2,
        'both to be posted',
      )

      expect(
        stub.commandEnvelopes.map(
          (posted) =>
            (posted.command as { options?: { interactionResponse?: unknown } })
              .options?.interactionResponse !== undefined,
        ),
      ).toEqual([true, false])

      handle.stop()
    })

    /** Mutation: treat a missing handshake as "does not advertise" and this is red; unknown is not unsupported. */
    it('sends the answer, as it did before the gate, and leaves the host to say', async () => {
      stub.setHealthBody(null)
      await host.refreshProviders()
      expect(host.handshake()).toBeNull()
      const handle = await startedHandle('s-unknown')

      handle.sendMessage('', undefined, undefined, CHOICE_ANSWER)
      await waitUntil(
        () => stub.commandEnvelopes.length === 1,
        'the answer to be posted',
      )

      handle.stop()
    })
  })
})
