import { promises as nodeFs } from 'fs'
import { homedir } from 'os'
import { dirname, join, resolve } from 'path'
import { isAccountHistoryOsJunk } from './provider-account-history.pure'
import {
  planAccountDirEntries,
  summarizeClaudeAccountLayout,
  type ClaudeAccountLayout,
  type ClaudeAccountLayoutEntry,
} from './provider-account-manifest.pure'
import {
  codexHistoryFs,
  type CodexHistoryFs,
} from './provider-account-codex-history.service'

export interface ClaudeAccountHistoryFs extends Pick<
  CodexHistoryFs,
  'lstat' | 'readlink'
> {
  readdir(path: string): Promise<string[]>
  symlink(target: string, path: string): Promise<void>
  unlink(path: string): Promise<void>
}

const defaultFs: ClaudeAccountHistoryFs = {
  lstat: codexHistoryFs.lstat,
  readlink: (path) => nodeFs.readlink(path),
  readdir: (path) => nodeFs.readdir(path),
  symlink: (target, path) => nodeFs.symlink(target, path),
  unlink: (path) => nodeFs.unlink(path),
}

/** Inspects sharing without migrating private data. Repair only creates missing
 * links; a real entry or a link to another destination always stays untouched. */
export class ClaudeAccountHistoryService {
  private readonly fs: ClaudeAccountHistoryFs
  private readonly sharedDir: string

  constructor(deps: { fs?: ClaudeAccountHistoryFs; homeDir?: string } = {}) {
    this.fs = deps.fs ?? defaultFs
    this.sharedDir = join(deps.homeDir ?? homedir(), '.claude')
  }

  async inspect(configDir: string): Promise<ClaudeAccountLayout> {
    let names: string[]
    try {
      names = planAccountDirEntries([
        ...new Set([
          ...(await this.entries(this.sharedDir)),
          ...(await this.entries(configDir)),
        ]),
      ]).shared
    } catch {
      return summarizeClaudeAccountLayout([
        {
          name: 'account layout',
          status: 'unreadable',
          hasPrivateContent: false,
        },
      ])
    }
    const entries: ClaudeAccountLayoutEntry[] = []
    for (const name of names) {
      const entry = await this.inspectEntry(configDir, name)
      if (
        isAccountHistoryOsJunk(name) &&
        ['real-file', 'missing', 'linked'].includes(entry.status)
      )
        continue
      entries.push(entry)
    }
    return summarizeClaudeAccountLayout(entries)
  }

  async seedMissingLinks(configDir: string): Promise<ClaudeAccountLayout> {
    const names = planAccountDirEntries(
      await this.entries(this.sharedDir),
    ).shared
    for (const name of names) {
      if (isAccountHistoryOsJunk(name)) continue
      const entry = await this.inspectEntry(configDir, name)
      if (entry.status !== 'missing' && entry.status !== 'dangling') continue
      const target = join(this.sharedDir, name)
      if (!(await this.destinationExists(target))) continue
      const path = join(configDir, name)
      // Re-inspection keeps an already repaired or replaced entry out of this
      // path. We never recursively remove anything while repairing links.
      if (entry.status === 'dangling') {
        const current = await this.inspectEntry(configDir, name)
        if (current.status !== 'dangling') continue
        await this.fs.unlink(path)
      }
      try {
        await this.fs.symlink(target, path)
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
      }
    }
    return this.inspect(configDir)
  }

  async assertRemovalSafe(
    configDir: string,
    deletePrivateHistory: boolean,
  ): Promise<void> {
    // Wrong-target links are safe only because removal never dereferences
    // symlinks: the linked destination is not inside the deletion operation.
    const layout = await this.inspect(configDir)
    if (layout.unreadableEntries.length)
      throw new Error(
        'The account history could not be inspected. No account data was removed; check its files and try again.',
      )
    if (layout.privateEntries.length && !deletePrivateHistory) {
      throw new Error(
        `This account contains private history or data (${layout.privateEntries.join(', ')}). Review removal in Provider accounts and explicitly choose whether to delete it. Nothing was removed.`,
      )
    }
  }

  private async inspectEntry(
    configDir: string,
    name: string,
  ): Promise<ClaudeAccountLayoutEntry> {
    const path = join(configDir, name)
    const result = (
      status: ClaudeAccountLayoutEntry['status'],
      hasPrivateContent = false,
    ): ClaudeAccountLayoutEntry => ({ name, status, hasPrivateContent })
    let stat: Awaited<ReturnType<ClaudeAccountHistoryFs['lstat']>>
    try {
      stat = await this.fs.lstat(path)
    } catch (error) {
      return result(
        (error as NodeJS.ErrnoException).code === 'ENOENT'
          ? 'missing'
          : 'unreadable',
      )
    }
    try {
      if (stat.isSymbolicLink()) {
        const target = resolve(dirname(path), await this.fs.readlink(path))
        if (!(await this.destinationExists(target))) return result('dangling')
        if (target !== resolve(this.sharedDir, name))
          return result('wrong-target')
        return result('linked')
      }
      if (stat.isDirectory())
        return result(
          'real-directory',
          (await this.fs.readdir(path)).length > 0,
        )
      if (stat.isFile()) return result('real-file', stat.size > 0)
      return result('unreadable')
    } catch {
      return result('unreadable')
    }
  }

  private async destinationExists(
    path: string,
    seen = new Set<string>(),
  ): Promise<boolean> {
    const normalized = resolve(path)
    if (seen.has(normalized) || seen.size > 32)
      throw new Error('Cyclic account history link')
    seen.add(normalized)
    try {
      const stat = await this.fs.lstat(normalized)
      if (!stat.isSymbolicLink()) return true
      return this.destinationExists(
        resolve(dirname(normalized), await this.fs.readlink(normalized)),
        seen,
      )
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
      throw error
    }
  }

  private async entries(path: string): Promise<string[]> {
    try {
      return await this.fs.readdir(path)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
      throw error
    }
  }
}
