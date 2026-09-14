import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { AttachmentsService } from '../attachments/attachments.service'
import type { Attachment } from '../attachments/attachments.types'
import { closeDatabase, getDatabase, resetDatabase } from '../database/database'
import { GitService } from '../git/git.service'
import { LocalExecutionHost } from '../provider/execution-host/local-execution-host'
import { ProviderRegistry } from '../provider/provider-registry'
import { ProviderSessionEmitter } from '../provider/provider-session.emitter'
import type { Provider, SessionHandle } from '../provider/provider.types'
import type { SkillSelection } from '../skills/skills.types'
import type { SessionDelta } from './conversation-item.types'
import { SessionService } from './session.service'
import { TurnCaptureService } from './turn/turn-capture.service'

interface AcceptedDispatch {
  text: string
  accountId: string | null
  attachments?: Attachment[]
  skills?: SkillSelection[]
}
function skill(id: string): SkillSelection {
  return {
    id,
    providerId: 'claude-code',
    providerName: 'Claude Code',
    name: id,
    displayName: id,
    path: '/fixture/' + id,
    scope: 'project',
    rawScope: null,
    sourceLabel: 'fixture',
    status: 'selected',
  }
}
let cleanup: (() => Promise<void>) | undefined
let accepted: AcceptedDispatch[]
let emit: (
  index: number,
  overrides?: {
    providerAccountId?: string | null
    omitAccount?: boolean
    omitMetadata?: boolean
  },
) => void
let unknownUser: () => void
let replay: () => void
let turns: () => Array<string | null>
let messages: () => Array<{
  text: string
  attachmentIds?: string[]
  skillSelections?: SkillSelection[]
}>

afterEach(async () => {
  await cleanup?.()
  cleanup = undefined
  closeDatabase()
  resetDatabase()
})

// A controlled adapter scheduler using the real service, emitter and turn
// persistence. It proves attribution, not a vendor's concurrent-input policy.
beforeEach(async () => {
  const dir = mkdtempSync(join(tmpdir(), 'dispatch-attribution-'))
  const db = getDatabase()
  accepted = []
  let emitDelta: (delta: SessionDelta) => void = () => {}
  let latestDelta: SessionDelta | undefined
  const emitter = new ProviderSessionEmitter({
    providerId: 'claude-code',
    emitDelta: (delta) => {
      latestDelta = delta
      emitDelta(delta)
    },
  })
  const handle: SessionHandle = {
    resident: true,
    onDelta: (callback) => {
      emitDelta = callback
    },
    onStatusChange: () => {},
    onAttentionChange: () => {},
    onContinuationToken: () => {},
    onContextWindowChange: () => {},
    onActivityChange: () => {},
    sendMessage: (text, attachments, skills, options) => {
      options?.onTurnAccepted?.()
      accepted.push({
        text,
        accountId: options?.providerAccountId ?? null,
        attachments,
        skills,
      })
    },
    approve: () => {},
    deny: () => {},
    stop: () => {},
  }
  const provider: Provider = {
    id: 'claude-code',
    name: 'Controlled Claude adapter',
    supportsContinuation: true,
    describe: async () => {
      throw new Error('No discovery in this fixture')
    },
    start: (config) => {
      accepted.push({
        text: config.initialMessage,
        accountId: config.providerAccountId ?? null,
        attachments: config.initialAttachments,
        skills: config.initialSkillSelections,
      })
      return handle
    },
  }
  const registry = new ProviderRegistry()
  registry.register(provider)
  const service = new SessionService(db, new LocalExecutionHost(registry), dir)
  const attachments = new AttachmentsService(db, join(dir, 'attachments'))
  service.setAttachmentsService(attachments)
  const capture = new TurnCaptureService(new GitService(), db, {
    debounceMs: 0,
  })
  service.setTurnCaptureService(capture)
  db.prepare(
    "INSERT INTO projects(id,name,repository_path) VALUES ('p','fixture',?)",
  ).run(dir)
  const session = service.create({
    projectId: 'p',
    workspaceId: null,
    providerId: 'claude-code',
    model: null,
    effort: null,
    name: 'dispatch attribution',
  })
  cleanup = async () => {
    await service.disposeAll()
    await capture.flushPendingEnd(session.id)
    rmSync(dir, { recursive: true, force: true })
  }
  turns = () =>
    capture.listTurns(session.id).map((turn) => turn.providerAccountId)
  messages = () =>
    service
      .getConversation(session.id)
      .flatMap((item) =>
        item.kind === 'message' && item.actor === 'user' ? [item] : [],
      )
  emit = (index, overrides = {}) => {
    const dispatch = accepted[index]!
    emitter.addUserMessage({
      text: dispatch.text,
      ...(!overrides.omitAccount
        ? {
            providerAccountId:
              overrides.providerAccountId === undefined
                ? dispatch.accountId
                : overrides.providerAccountId,
          }
        : {}),
      ...(!overrides.omitMetadata
        ? {
            attachmentIds: dispatch.attachments?.map(
              (attachment) => attachment.id,
            ),
            skillSelections: dispatch.skills?.map((selection) => ({
              ...selection,
              status: 'sent',
            })),
          }
        : {}),
    })
  }
  unknownUser = () => {
    emitter.addUserMessage({ text: 'provider event without a local dispatch' })
  }
  replay = () => {
    if (latestDelta) emitDelta(latestDelta)
  }
  const attachmentIds: string[] = []
  for (const name of ['first', 'second']) {
    const ingested = await attachments.ingestFiles(session.id, [
      {
        name: name + '.txt',
        bytes: new Uint8Array(Buffer.from(name)),
      },
    ])
    expect(ingested.rejections).toEqual([])
    attachmentIds.push(ingested.attachments[0]!.id)
  }
  await service.start(session.id, {
    text: 'first',
    providerAccountId: 'account-a',
    attachmentIds: [attachmentIds[0]!],
    skillSelections: [skill('skill-a')],
  })
  await service.sendMessage(session.id, {
    text: 'second',
    providerAccountId: 'account-b',
    deliveryMode: 'normal',
    attachmentIds: [attachmentIds[1]!],
    skillSelections: [skill('skill-b')],
  })
})

it('delivers both dispatches before either user event', () => {
  expect(accepted.map(({ text, accountId }) => ({ text, accountId }))).toEqual([
    { text: 'first', accountId: 'account-a' },
    { text: 'second', accountId: 'account-b' },
  ])
  expect(turns()).toEqual([])
})
it('attributes each emitted turn to its own account', () => {
  emit(0)
  emit(1)
  expect(turns()).toEqual(['account-a', 'account-b'])
})
it('attributes out-of-order user events to their own accounts', () => {
  emit(1)
  emit(0)
  expect(messages().map((item) => item.text)).toEqual(['second', 'first'])
  expect(turns()).toEqual(['account-b', 'account-a'])
})
it('replayed user events do not open or relabel another turn', () => {
  emit(0)
  replay()
  emit(1)
  replay()
  expect(turns()).toEqual(['account-a', 'account-b'])
  expect(messages()).toHaveLength(2)
})
it('records an unknown account without borrowing a pending selection', () => {
  emit(0, { omitAccount: true })
  emit(1)
  expect(turns()).toEqual([null, 'account-b'])
})
it('records an explicit ambient binding instead of the selected account', () => {
  emit(0, { providerAccountId: null })
  emit(1, { providerAccountId: 'adapter-account' })
  expect(turns()).toEqual([null, 'adapter-account'])
})
it('a missing echo cannot leave attribution for a later unbound user event', () => {
  emit(1)
  unknownUser()
  expect(turns()).toEqual(['account-b', null])
  expect(messages().map((item) => item.text)).not.toContain('first')
})
it('persists the attachments and resolved skills belonging to each artifact', () => {
  emit(1)
  emit(0)
  expect(messages().map((item) => item.attachmentIds)).toEqual([
    accepted[1]!.attachments!.map((item) => item.id),
    accepted[0]!.attachments!.map((item) => item.id),
  ])
  expect(
    messages().map((item) =>
      item.skillSelections?.map(({ id, status }) => ({ id, status })),
    ),
  ).toEqual([
    [{ id: 'skill-b', status: 'sent' }],
    [{ id: 'skill-a', status: 'sent' }],
  ])
})
it('does not fill absent artifact metadata from a later dispatch', () => {
  emit(0, { omitMetadata: true })
  emit(1)
  expect(messages()[0]!.attachmentIds).toBeUndefined()
  expect(messages()[0]!.skillSelections).toBeUndefined()
  expect(messages()[1]!.attachmentIds).toEqual(
    accepted[1]!.attachments!.map((item) => item.id),
  )
})
