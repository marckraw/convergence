import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  mkdtemp,
  mkdir,
  readdir,
  readFile,
  rm,
  stat,
  symlink,
  writeFile,
} from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { defaultClaudeNeedsAuthNoteIo as io } from './provider-account-mcp.service'

describe("MAR-3517 the real note IO edits only the account's own file", () => {
  let dir: string
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'cvg-note-io-'))
  })
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('reads a regular file, and reports none when there is none', async () => {
    const path = join(dir, 'mcp-needs-auth-cache.json')
    expect(await io.read(path)).toBeNull()
    await writeFile(path, '{"a":{"timestamp":1}}')
    expect(await io.read(path)).toBe('{"a":{"timestamp":1}}')
  })

  it("never reads through a symlink or a directory: those are not this account's note", async () => {
    const shared = join(dir, 'shared.json')
    await writeFile(shared, '{"a":{"timestamp":1}}')
    const linked = join(dir, 'linked.json')
    await symlink(shared, linked)
    expect(await io.read(linked)).toBeNull()
    const folder = join(dir, 'folder.json')
    await mkdir(folder)
    expect(await io.read(folder)).toBeNull()
  })

  it('replaces in one step, keeps the permissions Claude Code gave the file, leaves no scrap', async () => {
    const path = join(dir, 'mcp-needs-auth-cache.json')
    await writeFile(path, '{"a":{"timestamp":1},"b":{"timestamp":2}}', {
      mode: 0o644,
    })
    await io.replace(path, '{"b":{"timestamp":2}}')
    expect(await readFile(path, 'utf8')).toBe('{"b":{"timestamp":2}}')
    expect((await stat(path)).mode & 0o777).toBe(0o644)
    expect(await readdir(dir)).toEqual(['mcp-needs-auth-cache.json'])
  })

  it('a replace that fails leaves the note as it was and no scrap behind', async () => {
    const path = join(dir, 'mcp-needs-auth-cache.json')
    await mkdir(path)
    await expect(io.replace(path, '{}')).rejects.toThrow()
    expect(await readdir(dir)).toEqual(['mcp-needs-auth-cache.json'])
    expect((await stat(path)).isDirectory()).toBe(true)
  })
})
