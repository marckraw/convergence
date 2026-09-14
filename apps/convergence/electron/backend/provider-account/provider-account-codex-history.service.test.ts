import { promises as fs } from 'fs'
import { tmpdir } from 'os'
import { join, dirname } from 'path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { CODEX_SHARED_HISTORY_ENTRIES } from './provider-account-codex-history.pure'
import {
  CodexAccountHistoryService,
  codexHistoryFs,
} from './provider-account-codex-history.service'

let root: string
let account: string
let shared: string
let subject: CodexAccountHistoryService
const now = () => new Date('2026-09-14T10:00:00.000Z')

async function write(path: string, text: string) {
  await fs.mkdir(dirname(path), { recursive: true })
  await fs.writeFile(path, text)
}

beforeEach(async () => {
  root = await fs.mkdtemp(join(tmpdir(), 'cvg-history-layout-'))
  account = join(root, 'account-b')
  shared = join(root, '.codex')
  await fs.mkdir(account)
  subject = new CodexAccountHistoryService({ homeDir: root, now })
})
afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true })
})

it('links only conversation entries and leaves credentials, config and databases private', async () => {
  await write(join(account, 'auth.json'), 'PRIVATE-AUTH')
  await write(join(account, 'config.toml'), 'PRIVATE-CONFIG')
  await write(join(account, 'state_5.sqlite'), 'PRIVATE-DB')
  expect(await subject.migrate(account)).toEqual({ ready: true, warnings: [] })
  for (const entry of CODEX_SHARED_HISTORY_ENTRIES) {
    expect(await fs.readlink(join(account, entry))).toBe(join(shared, entry))
  }
  for (const entry of ['auth.json', 'config.toml', 'state_5.sqlite']) {
    expect((await fs.lstat(join(account, entry))).isSymbolicLink()).toBe(false)
    await expect(fs.lstat(join(shared, entry))).rejects.toMatchObject({
      code: 'ENOENT',
    })
  }
  expect(await subject.inspect(account)).toEqual({ ready: true, warnings: [] })
  expect(await subject.migrate(account)).toEqual({ ready: true, warnings: [] })
})

it('copies both rollout trees and preserves their original directories', async () => {
  await write(join(account, 'sessions/2026/09/rollout-a.jsonl'), 'A')
  await write(join(account, 'archived_sessions/rollout-b.jsonl'), 'B')
  expect((await subject.migrate(account)).ready).toBe(true)
  expect(
    await fs.readFile(join(shared, 'sessions/2026/09/rollout-a.jsonl'), 'utf8'),
  ).toBe('A')
  expect(
    await fs.readFile(
      join(shared, 'archived_sessions/rollout-b.jsonl'),
      'utf8',
    ),
  ).toBe('B')
  expect(
    await fs.readFile(
      join(
        account,
        'sessions.pre-share-2026-09-14T10-00-00-000Z/2026/09/rollout-a.jsonl',
      ),
      'utf8',
    ),
  ).toBe('A')
  expect(
    await fs.readFile(
      join(
        account,
        'archived_sessions.pre-share-2026-09-14T10-00-00-000Z/rollout-b.jsonl',
      ),
      'utf8',
    ),
  ).toBe('B')
})

it('preflights collisions across active and archived trees before any mutation', async () => {
  await write(join(account, 'sessions/rollout-new.jsonl'), 'new')
  await write(
    join(account, 'archived_sessions/rollout-collision.jsonl'),
    'local',
  )
  await write(join(shared, 'sessions/2026/rollout-collision.jsonl'), 'shared')
  const result = await subject.migrate(account)
  expect(result.ready).toBe(false)
  expect(result.warnings.join(' ')).toContain('1 files already exist')
  expect(await fs.readdir(account)).toEqual(['archived_sessions', 'sessions'])
  expect(await fs.readdir(shared)).toEqual(['sessions'])
  await expect(
    fs.lstat(join(shared, 'sessions/rollout-new.jsonl')),
  ).rejects.toMatchObject({ code: 'ENOENT' })
  expect(
    await fs.readFile(
      join(shared, 'sessions/2026/rollout-collision.jsonl'),
      'utf8',
    ),
  ).toBe('shared')
})

it('refuses foreign links and nonempty ancillary entries without changing rollouts', async () => {
  await write(join(account, 'sessions/rollout-a.jsonl'), 'A')
  await write(join(account, 'session_index.jsonl'), 'existing index')
  await fs.symlink(join(root, 'foreign'), join(account, 'attachments'))
  const result = await subject.migrate(account)
  expect(result.ready).toBe(false)
  expect(result.warnings.join(' ')).toMatch(/session_index.jsonl.*attachments/)
  await expect(fs.lstat(shared)).rejects.toMatchObject({ code: 'ENOENT' })
  expect((await fs.lstat(join(account, 'sessions'))).isDirectory()).toBe(true)
})

it('preserves empty ancillary entries before joining shared storage', async () => {
  await fs.mkdir(join(account, 'attachments'))
  await write(join(account, 'session_index.jsonl'), '')
  expect((await subject.migrate(account)).ready).toBe(true)
  expect(
    (
      await fs.lstat(
        join(account, 'attachments.pre-share-2026-09-14T10-00-00-000Z'),
      )
    ).isDirectory(),
  ).toBe(true)
  expect(
    await fs.readFile(
      join(account, 'session_index.jsonl.pre-share-2026-09-14T10-00-00-000Z'),
      'utf8',
    ),
  ).toBe('')
})

it('does not follow nested rollout links during migration', async () => {
  await fs.mkdir(join(account, 'sessions'))
  await write(join(root, 'foreign/rollout-secret.jsonl'), 'private')
  await fs.symlink(join(root, 'foreign'), join(account, 'sessions/elsewhere'))
  const result = await subject.migrate(account)
  expect(result.ready).toBe(false)
  expect(result.warnings.join(' ')).toContain('symlink')
  await expect(fs.lstat(shared)).rejects.toMatchObject({ code: 'ENOENT' })
})

it('reports partial IO honestly and preserves source files if an exclusive copy fails', async () => {
  await write(join(account, 'sessions/rollout-a.jsonl'), 'A')
  const subject = new CodexAccountHistoryService({
    homeDir: root,
    now,
    fs: {
      ...codexHistoryFs,
      copyFileExclusive: vi.fn(async () => {
        throw new Error('destination appeared concurrently')
      }),
    },
  })
  const result = await subject.migrate(account)
  expect(result.ready).toBe(false)
  expect(result.warnings.join(' ')).toContain('may already have been copied')
  expect(result.warnings.join(' ')).not.toContain('Nothing was changed')
  expect(
    await fs.readFile(join(account, 'sessions/rollout-a.jsonl'), 'utf8'),
  ).toBe('A')
})

it('unlinking an enrolled home leaves shared conversation files intact', async () => {
  await subject.migrate(account)
  await write(join(account, 'sessions/rollout-kept.jsonl'), 'KEEP')
  await fs.rm(account, { recursive: true, force: true })
  expect(
    await fs.readFile(join(shared, 'sessions/rollout-kept.jsonl'), 'utf8'),
  ).toBe('KEEP')
})

it('inspection is read-only and notices a broken shared layout', async () => {
  const before = await fs.readdir(account)
  expect((await subject.inspect(account)).ready).toBe(false)
  expect(await fs.readdir(account)).toEqual(before)
  await subject.migrate(account)
  await fs.unlink(join(account, 'sessions'))
  expect((await subject.inspect(account)).ready).toBe(false)
  await expect(fs.lstat(join(account, 'sessions'))).rejects.toMatchObject({
    code: 'ENOENT',
  })
})
