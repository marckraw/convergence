import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { closeDatabase, getDatabase, resetDatabase } from '../database/database'
import { GitService } from '../git/git.service'
import { LocalExecutionHost } from '../provider/execution-host/local-execution-host'
import { ProviderRegistry } from '../provider/provider-registry'
import { ProviderSessionEmitter } from '../provider/provider-session.emitter'
import type { Provider, SessionHandle } from '../provider/provider.types'
import type { SessionDelta } from './conversation-item.types'
import { SessionService } from './session.service'
import { TurnCaptureService } from './turn/turn-capture.service'

let cleanup: (() => Promise<void>) | undefined
afterEach(async () => {
  await cleanup?.()
  closeDatabase()
  resetDatabase()
})

// A controlled adapter scheduler. The fixture proves attribution, not a
// vendor's policy for concurrent inputs. Hook failures remain real failures;
// only the final account-attribution assertion is expected to fail (MAR-2539).
let accepted: Array<{ text: string; accountId: string | null }>
let recorded: Array<string | null>

beforeEach(async () => {
  const dir = mkdtempSync(join(tmpdir(), 'dispatch-attribution-'))
  const db = getDatabase()
  accepted = []
  let emitDelta: (delta: SessionDelta) => void = () => {}
  const emitter = new ProviderSessionEmitter({
    providerId: 'claude-code',
    emitDelta: (delta) => emitDelta(delta),
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
    sendMessage: (text, _attachments, _skills, options) => {
      accepted.push({ text, accountId: options?.providerAccountId ?? null })
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
      })
      return handle
    },
  }
  const registry = new ProviderRegistry()
  registry.register(provider)
  const service = new SessionService(db, new LocalExecutionHost(registry), dir)
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

  await service.start(session.id, {
    text: 'first',
    providerAccountId: 'account-a',
  })
  await service.sendMessage(session.id, {
    text: 'second',
    providerAccountId: 'account-b',
    deliveryMode: 'normal',
  })
  for (const dispatch of accepted) {
    emitter.addUserMessage({ text: dispatch.text })
  }
  recorded = capture.listTurns(session.id).map((turn) => turn.providerAccountId)
})

it('delivers both dispatches to the controlled adapter before either user event', () => {
  expect(accepted).toEqual([
    { text: 'first', accountId: 'account-a' },
    { text: 'second', accountId: 'account-b' },
  ])
  expect(recorded).toHaveLength(2)
})

// Fable's ruling holds the product fix until PR #633 lands. Keep this known
// defect explicit and remove the marker when integrating adapter-owned facts.
it.fails('attributes each emitted turn to its own account', () => {
  expect(recorded).toEqual(['account-a', 'account-b'])
})
