import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { promises as fs } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { ClaudeAccountHistoryService } from './provider-account-claude-history.service'

describe('Claude account history layout', () => {
  let home: string
  let shared: string
  let account: string
  let service: ClaudeAccountHistoryService
  beforeEach(async () => {
    home = await fs.mkdtemp(join(tmpdir(), 'claude-history-fixture-'))
    shared = join(home, '.claude')
    account = join(home, 'account')
    await fs.mkdir(shared)
    await fs.mkdir(account)
    service = new ClaudeAccountHistoryService({ homeDir: home })
  })
  afterEach(async () => {
    await fs.rm(home, { recursive: true, force: true })
  })

  it('reports actual sharing, private data, missing and wrong or dangling links separately', async () => {
    for (const name of ['projects', 'skills', 'sessions', 'commands', 'agents'])
      await fs.mkdir(join(shared, name))
    await fs.symlink(join(shared, 'projects'), join(account, 'projects'))
    await fs.mkdir(join(account, 'sessions'))
    await fs.writeFile(join(account, 'sessions', 'only-copy.jsonl'), 'fixture')
    await fs.symlink(shared, join(account, 'skills'))
    await fs.symlink(join(home, 'missing'), join(account, 'commands'))
    const layout = await service.inspect(account)
    expect(layout.entries).toEqual([
      { name: 'agents', status: 'missing', hasPrivateContent: false },
      { name: 'commands', status: 'dangling', hasPrivateContent: false },
      { name: 'projects', status: 'linked', hasPrivateContent: false },
      { name: 'sessions', status: 'real-directory', hasPrivateContent: true },
      { name: 'skills', status: 'wrong-target', hasPrivateContent: false },
    ])
    expect(layout.fullyShared).toBe(false)
    expect(layout.privateEntries).toEqual(['sessions'])
  })

  it('repairs missing and dangling links while preserving private content and foreign link targets', async () => {
    for (const name of ['projects', 'skills', 'sessions', 'commands'])
      await fs.mkdir(join(shared, name))
    await fs.mkdir(join(account, 'projects'))
    const onlyCopy = join(account, 'projects', 'only-copy.jsonl')
    await fs.writeFile(onlyCopy, 'keep me')
    await fs.symlink(shared, join(account, 'skills'))
    await fs.symlink(join(home, 'missing'), join(account, 'sessions'))
    await service.seedMissingLinks(account)
    expect(await fs.readFile(onlyCopy, 'utf8')).toBe('keep me')
    expect(await fs.readlink(join(account, 'skills'))).toBe(shared)
    expect(await fs.readlink(join(account, 'sessions'))).toBe(
      join(shared, 'sessions'),
    )
    expect(await fs.readlink(join(account, 'commands'))).toBe(
      join(shared, 'commands'),
    )
  })

  it('requires explicit deletion for the only copy of private files or directory contents', async () => {
    await fs.writeFile(join(account, 'history.jsonl'), 'private turn')
    await expect(service.assertRemovalSafe(account, false)).rejects.toThrow(
      /history.jsonl/,
    )
    await expect(
      service.assertRemovalSafe(account, true),
    ).resolves.toBeUndefined()
    expect(await fs.readFile(join(account, 'history.jsonl'), 'utf8')).toBe(
      'private turn',
    )
  })

  it('does not call a chain of dangling links shared history', async () => {
    await fs.symlink(join(home, 'missing'), join(shared, 'projects'))
    await fs.symlink(join(shared, 'projects'), join(account, 'projects'))
    expect((await service.inspect(account)).entries[0].status).toBe('dangling')
  })

  it('fails closed for a cyclic link instead of reporting verified sharing', async () => {
    await fs.symlink(join(shared, 'projects'), join(shared, 'projects'))
    await fs.symlink(join(shared, 'projects'), join(account, 'projects'))
    await expect(service.assertRemovalSafe(account, true)).rejects.toThrow(
      /could not be inspected/,
    )
  })

  it('excludes the intentionally private identity and backups from the shared-history promise', async () => {
    await fs.writeFile(join(account, '.claude.json'), '{}')
    await fs.mkdir(join(account, 'backups'))
    await fs.writeFile(join(account, 'backups', 'old.json'), '{}')
    expect((await service.inspect(account)).privateEntries).toEqual([])
  })
})
