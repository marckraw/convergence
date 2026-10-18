import {
  executionHostRegistryFor,
  seedExecutionHostEndpoint,
  TEST_EXECUTION_HOST_ENDPOINT_ID,
} from '../../execution-host-endpoint/execution-host-endpoint.fixture'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  closeDatabase,
  getDatabase,
  resetDatabase,
} from '../../database/database'
import { SessionService } from '../../session/session.service'
import { AttachmentsService } from '../../attachments/attachments.service'
import { ProviderRegistry } from '../provider-registry'
import {
  createStubDaemon,
  deferred,
  envelope,
  waitUntil,
  type StubDaemon,
} from '@convergence/execution-host-client'
import type { ExecutionToolAttachment } from '@mrck-labs/execution-host-protocol'
import { LocalExecutionHost } from './local-execution-host'
import { RemoteExecutionHost } from './remote-execution-host'
import { TEST_REMOTE_WORK_ADDRESS } from '../../session/session-work-address.fixture'
import type { ConversationItem } from '../../session/conversation-item.types'

/** A real 1x1 PNG: the attachment store keeps an image by its bytes. */
const PNG = new Uint8Array(
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
    'base64',
  ),
)

const PROJECT_ID = 'remote-project'

function reference(id: string, bytes = PNG): ExecutionToolAttachment {
  return {
    id,
    name: `${id}.png`,
    mimeType: 'image/png',
    sizeBytes: bytes.length,
    width: 1,
    height: 1,
  }
}

/**
 * MAR-4274 on the whole path: a host adds a tool result naming the images it
 * kept, the run downloads them from the attachments route of the stub daemon,
 * and the session's record ends up with the item, its images in Convergence's
 * own store, and a count of the ones that did not make it.
 */
describe('a remote tool result with images', () => {
  let db: ReturnType<typeof getDatabase>
  let tempDir: string
  let stub: StubDaemon
  let service: SessionService
  let attachments: AttachmentsService
  let sessionId: string
  /** What the daemon has kept, by attachment id; anything else is a 404. */
  let served: Map<string, { bytes: Uint8Array; gate?: Promise<void> }>
  let attachmentRequests: string[]

  beforeEach(async () => {
    db = getDatabase()
    tempDir = mkdtempSync(join(tmpdir(), 'convergence-remote-tool-images-'))
    const repoPath = join(tempDir, 'repo')
    mkdirSync(repoPath)
    mkdirSync(join(repoPath, '.git'))
    db.prepare(
      "INSERT INTO projects (id, name, repository_path) VALUES (?, 'remote', ?)",
    ).run(PROJECT_ID, repoPath)
    seedExecutionHostEndpoint(db)

    stub = createStubDaemon()
    served = new Map()
    attachmentRequests = []
    const fetchFn = (async (
      input: Parameters<typeof fetch>[0],
      init?: RequestInit,
    ) => {
      const url = String(input)
      const match = /\/attachments\/([^/?]+)$/.exec(url)
      if (!match) return stub.fetchFn(input, init)
      const id = decodeURIComponent(match[1]!)
      attachmentRequests.push(id)
      const image = served.get(id)
      if (!image) return new Response('no such attachment', { status: 404 })
      await image.gate
      return new Response(image.bytes, { status: 200 })
    }) as typeof fetch

    service = new SessionService(
      db,
      new LocalExecutionHost(new ProviderRegistry()),
      join(tempDir, 'global-sessions'),
    )
    attachments = new AttachmentsService(db, join(tempDir, 'attachments'))
    service.setAttachmentsService(attachments)
    const host = new RemoteExecutionHost({
      connection: {
        resolveConnection: async () => ({
          baseUrl: 'http://daemon.test',
          token: 'test-token',
        }),
      },
      fetch: fetchFn,
      reconnect: {
        maxAttempts: 2,
        wait: () => new Promise((resolve) => setTimeout(resolve, 0)),
      },
      onEventSeq: (id, seq) => service.recordRemoteEventSeq(id, seq),
    })
    await host.refreshProviders()
    service.setRemoteExecutionHosts(
      executionHostRegistryFor({ [TEST_EXECUTION_HOST_ENDPOINT_ID]: host }),
    )
    service.setRemoteWorkspaceSourceResolver(() => ({
      repository: 'git@github.com:acme/repo.git',
    }))
    sessionId = service.create({
      projectId: PROJECT_ID,
      workspaceId: null,
      providerId: 'claude-code',
      model: 'sonnet',
      effort: null,
      name: 'remote session',
      executionHost: TEST_EXECUTION_HOST_ENDPOINT_ID,
      workAddress: TEST_REMOTE_WORK_ADDRESS,
    }).id
    await service.start(sessionId, { text: 'take a screenshot' })
    await waitUntil(
      () => stub.eventStreamLastEventIds.length === 1,
      'the event stream to open',
    )
  })

  afterEach(async () => {
    // Before the database closes: an image still being written must land, or
    // be given up, while there is a database to land in.
    await service.disposeAll()
    closeDatabase()
    resetDatabase()
    rmSync(tempDir, { recursive: true, force: true })
  })

  function toolResult(
    seq: number,
    extra: Record<string, unknown> = {},
  ): ReturnType<typeof envelope> {
    return envelope(
      seq,
      {
        kind: 'delta',
        delta: {
          kind: 'conversation.item.add',
          item: {
            id: 'tool-result-1',
            kind: 'tool-result',
            toolName: 'Screenshot',
            relatedItemId: 'call-1',
            outputText: 'took a screenshot',
            state: 'complete',
            createdAt: '2026-10-18T10:00:00.000Z',
            updatedAt: '2026-10-18T10:00:00.000Z',
            providerMeta: {
              providerId: 'claude',
              providerItemId: null,
              providerEventType: 'tool_result',
            },
            ...extra,
          },
        },
      } as never,
      sessionId,
    )
  }

  function readToolResult():
    | Extract<ConversationItem, { kind: 'tool-result' }>
    | undefined {
    return service
      .getConversation(sessionId)
      .find(
        (item): item is Extract<ConversationItem, { kind: 'tool-result' }> =>
          item.kind === 'tool-result',
      )
  }

  /**
   * Mutation: forward the add without fetching, or fetch without handing the
   * session the bytes, and the item never gains its images.
   */
  it('shows the images it could fetch, and counts the rest with the ones the host left out', async () => {
    served.set('img-1', { bytes: PNG })
    stub.emit(
      toolResult(1, {
        attachments: [reference('img-1'), reference('img-gone')],
        attachmentOmissions: { 'turn-limit': 1 },
      }),
    )

    await waitUntil(
      () => (readToolResult()?.attachmentIds?.length ?? 0) > 0,
      'the tool result to gain its image',
    )
    const item = readToolResult()!
    expect(item.outputText).toBe('took a screenshot')
    expect(item.attachmentIds).toHaveLength(1)
    expect(item.attachmentOmissions).toEqual({
      'turn-limit': 1,
      'download-failed': 1,
    })
    const [stored] = attachments.getMany(item.attachmentIds!)
    expect(stored).toMatchObject({
      sessionId,
      kind: 'image',
      mimeType: 'image/png',
      filename: 'img-1.png',
      sizeBytes: PNG.length,
    })
    expect(await attachments.readBytes(stored!.id)).toEqual(PNG)
    expect(attachmentRequests.sort()).toEqual(['img-1', 'img-gone'])
  })

  it('shows the host’s omissions at once, with no images to fetch', async () => {
    stub.emit(toolResult(1, { attachmentOmissions: { 'image-too-large': 2 } }))

    await waitUntil(() => readToolResult() !== undefined, 'the tool result')
    expect(readToolResult()?.attachmentOmissions).toEqual({
      'image-too-large': 2,
    })
    expect(readToolResult()).not.toHaveProperty('attachmentIds')
    expect(attachmentRequests).toEqual([])
  })

  /**
   * A turn's last screenshot comes just before its settle, and the settle
   * releases the handle. Mutation: abort the downloads with the stream on
   * dispose, and this image is lost.
   */
  it('keeps the images of a turn that settles while they are still on their way', async () => {
    const gate = deferred()
    served.set('img-1', { bytes: PNG, gate: gate.promise })
    stub.emitBatch([
      envelope(1, { kind: 'status', status: 'running' }, sessionId),
      toolResult(2, { attachments: [reference('img-1')] }),
      envelope(3, { kind: 'continuation-token', token: 'resume-1' }, sessionId),
      envelope(4, { kind: 'status', status: 'completed' }, sessionId),
    ])
    await waitUntil(
      () => service.getById(sessionId)?.status === 'completed',
      'the turn to settle',
    )
    await waitUntil(
      () => attachmentRequests.length === 1,
      'the image to be asked for',
    )
    expect(readToolResult()).not.toHaveProperty('attachmentIds')

    gate.release()
    await waitUntil(
      () => (readToolResult()?.attachmentIds?.length ?? 0) === 1,
      'the image to land after the settle',
    )
  })

  /** Mutation: drop the run's record of fetched items and the add replays a download. */
  it('does not fetch or store the images of a replayed add twice', async () => {
    served.set('img-1', { bytes: PNG })
    stub.emit(toolResult(1, { attachments: [reference('img-1')] }))
    await waitUntil(
      () => (readToolResult()?.attachmentIds?.length ?? 0) === 1,
      'the first image',
    )
    stub.emit(toolResult(2, { attachments: [reference('img-1')] }))
    stub.emit(envelope(3, { kind: 'status', status: 'running' }, sessionId))
    await waitUntil(
      () => service.getById(sessionId)?.status === 'running',
      'the stream to move past the replay',
    )

    expect(attachmentRequests).toEqual(['img-1'])
    expect(attachments.getForSession(sessionId)).toHaveLength(1)
    expect(readToolResult()?.attachmentIds).toHaveLength(1)
  })
})
