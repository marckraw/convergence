import Database from 'better-sqlite3'
import { mkdtemp, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { AntigravityTrajectoryTelemetryService } from './antigravity-trajectory.service'

let tempDir: string | null = null

function encodeVarint(value: number): Buffer {
  const bytes: number[] = []
  let remaining = BigInt(value)
  do {
    let byte = Number(remaining & 0x7fn)
    remaining >>= 7n
    if (remaining > 0n) byte |= 0x80
    bytes.push(byte)
  } while (remaining > 0n)
  return Buffer.from(bytes)
}

function fieldKey(fieldNumber: number, wireType: number): Buffer {
  return encodeVarint((fieldNumber << 3) | wireType)
}

function varintField(fieldNumber: number, value: number): Buffer {
  return Buffer.concat([fieldKey(fieldNumber, 0), encodeVarint(value)])
}

function bytesField(fieldNumber: number, value: string | Buffer): Buffer {
  const payload = typeof value === 'string' ? Buffer.from(value, 'utf8') : value
  return Buffer.concat([
    fieldKey(fieldNumber, 2),
    encodeVarint(payload.length),
    payload,
  ])
}

function message(...fields: Buffer[]): Buffer {
  return Buffer.concat(fields)
}

function toolCallPayload(): Buffer {
  return message(
    bytesField(1, 'call-1'),
    bytesField(2, 'view_file'),
    bytesField(3, '{"AbsolutePath":"/tmp/project/README.md"}'),
    bytesField(9, 'view_file'),
  )
}

async function createConversationDb(): Promise<{
  conversationsDir: string
  conversationId: string
}> {
  tempDir = await mkdtemp(join(tmpdir(), 'convergence-ag-trajectory-'))
  const conversationId = '11111111-1111-4111-8111-111111111111'
  const db = new Database(join(tempDir, `${conversationId}.db`))
  db.exec(
    'CREATE TABLE steps (idx integer PRIMARY KEY, step_type integer, status integer, step_payload blob)',
  )
  db.prepare(
    'INSERT INTO steps (idx, step_type, status, step_payload) VALUES (?, ?, ?, ?)',
  ).run(
    0,
    15,
    3,
    message(
      varintField(1, 15),
      varintField(4, 3),
      bytesField(20, message(bytesField(7, toolCallPayload()))),
    ),
  )
  db.prepare(
    'INSERT INTO steps (idx, step_type, status, step_payload) VALUES (?, ?, ?, ?)',
  ).run(
    1,
    8,
    3,
    message(
      varintField(1, 8),
      varintField(4, 3),
      bytesField(5, message(bytesField(4, toolCallPayload()))),
      bytesField(
        14,
        message(
          bytesField(1, 'file:///tmp/project/README.md'),
          bytesField(4, '# Project\nUseful notes.'),
        ),
      ),
    ),
  )
  db.close()

  return { conversationsDir: tempDir, conversationId }
}

afterEach(async () => {
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true })
    tempDir = null
  }
})

describe('AntigravityTrajectoryTelemetryService', () => {
  it('reads tool events from a conversation database', async () => {
    const { conversationsDir, conversationId } = await createConversationDb()
    const service = new AntigravityTrajectoryTelemetryService(conversationsDir)

    await expect(service.getMaxStepIndex(conversationId)).resolves.toBe(1)
    await expect(service.readToolEvents(conversationId, null)).resolves.toEqual(
      [
        {
          kind: 'tool-call',
          stepIndex: 0,
          toolCallId: 'call-1',
          toolName: 'view_file',
          inputText: '{"AbsolutePath":"/tmp/project/README.md"}',
          providerItemId: 'antigravity:0:tool-call:call-1',
        },
        {
          kind: 'tool-result',
          stepIndex: 1,
          toolCallId: 'call-1',
          toolName: 'view_file',
          outputText: '/tmp/project/README.md\n# Project\nUseful notes.',
          providerItemId: 'antigravity:1:tool-result:call-1',
        },
      ],
    )
  })

  it('filters rows at or below the baseline step index', async () => {
    const { conversationsDir, conversationId } = await createConversationDb()
    const service = new AntigravityTrajectoryTelemetryService(conversationsDir)

    await expect(service.readToolEvents(conversationId, 0)).resolves.toEqual([
      expect.objectContaining({
        kind: 'tool-result',
        stepIndex: 1,
      }),
    ])
  })

  it('finds the latest conversation database updated after a timestamp', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'convergence-ag-trajectory-'))
    const oldId = '11111111-1111-4111-8111-111111111111'
    const latestId = '22222222-2222-4222-8222-222222222222'
    await writeFile(join(tempDir, `${oldId}.db`), '')
    await writeFile(join(tempDir, `${latestId}.db`), '')
    await writeFile(join(tempDir, 'not-a-conversation.db'), '')

    const service = new AntigravityTrajectoryTelemetryService(tempDir)
    const updatedAfterMs = Date.now() - 60_000

    await expect(
      service.findLatestConversationIdUpdatedAfter(updatedAfterMs),
    ).resolves.toBe(latestId)
  })

  it('returns empty telemetry for missing or invalid conversation ids', async () => {
    const service = new AntigravityTrajectoryTelemetryService('/tmp/missing')

    await expect(
      service.getMaxStepIndex('../not-a-conversation'),
    ).resolves.toBeNull()
    await expect(
      service.readToolEvents('11111111-1111-4111-8111-111111111111', null),
    ).resolves.toEqual([])
  })
})
