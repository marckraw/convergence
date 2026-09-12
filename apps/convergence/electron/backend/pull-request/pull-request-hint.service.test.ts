import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { getDatabase, closeDatabase, resetDatabase } from '../database/database'
import { SessionService } from '../session/session.service'
import { LocalExecutionHost } from '../provider/execution-host/local-execution-host'
import { ProviderRegistry } from '../provider/provider-registry'
import type { SessionHandle } from '../provider/provider.types'
import type { SessionDelta } from '../session/conversation-item.types'
import { toLocalSessionDelta } from '../provider/execution-host/execution-host-wire-mapping.pure'
import { connectPullRequestRefresh } from './pull-request-refresh.service'
import type { PullRequestService } from './pull-request.service'

let sessions: SessionService
beforeEach(() => {
  const db = getDatabase()
  db.prepare(
    "INSERT INTO projects (id,name,repository_path,settings) VALUES ('p','Project','/repo','{}')",
  ).run()
  db.prepare(
    "INSERT INTO sessions (id,project_id,provider_id,name,working_directory) VALUES ('s','p','codex','Horse','/repo')",
  ).run()
  sessions = new SessionService(
    db,
    new LocalExecutionHost(new ProviderRegistry()),
  )
})
afterEach(async () => {
  await sessions.disposeAll()
  vi.restoreAllMocks()
  closeDatabase()
  resetDatabase()
})

// Feed the real accepted-delta path without starting a CLI or a daemon.
function deliver(delta: SessionDelta) {
  ;(
    sessions as unknown as {
      applyDelta(id: string, delta: SessionDelta, source: SessionHandle): void
    }
  ).applyDelta('s', delta, {} as SessionHandle)
}

it('a mapped daemon PR hint refreshes exactly once and is never stored (mutation: keep prUrl unmapped)', () => {
  const service = {
    refreshForSession: vi.fn().mockResolvedValue(null),
    start: vi.fn(),
    stop: vi.fn(),
  } as unknown as PullRequestService
  const disconnect = connectPullRequestRefresh(service, sessions, vi.fn())
  const delta = toLocalSessionDelta({
    kind: 'session.patch',
    patch: { prUrl: 'https://github.com/acme/app/pull/999' },
  })!
  deliver(delta)
  expect(service.refreshForSession).toHaveBeenCalledExactlyOnceWith('s')
  const row = getDatabase().prepare("SELECT * FROM sessions WHERE id='s'").get()
  expect(JSON.stringify(row)).not.toContain('pull/999')
  disconnect()
  deliver(delta)
  expect(service.refreshForSession).toHaveBeenCalledTimes(1)
})

it('logs a throwing hint listener with the session id and continues (mutation: swallow observer error)', () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {})
  const failure = new Error('observer failed')
  sessions.onPullRequestHint(() => {
    throw failure
  })
  const next = vi.fn()
  sessions.onPullRequestHint(next)
  expect(() =>
    deliver({
      kind: 'session.patch',
      patch: { prUrl: 'https://github.com/acme/app/pull/999' },
    }),
  ).not.toThrow()
  expect(log).toHaveBeenCalledWith(
    '[session] PR hint listener failed for s',
    failure,
  )
  expect(next).toHaveBeenCalledExactlyOnceWith('s')
})
