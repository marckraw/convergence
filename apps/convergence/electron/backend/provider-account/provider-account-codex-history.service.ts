import { constants, promises as nodeFs } from 'fs'
import { homedir } from 'os'
import { basename, dirname, join, resolve } from 'path'
import {
  CODEX_SHARED_HISTORY_ENTRIES,
  isCodexRolloutDirectory,
  isCodexWriterLockName,
  isCodexHistoryOsJunk,
  planCodexHistoryMigration,
  type CodexHistoryEntry,
  type CodexHistoryObservation,
} from './provider-account-codex-history.pure'

export interface CodexHistoryStat {
  isDirectory(): boolean
  isFile(): boolean
  isSymbolicLink(): boolean
  size: number
}

export interface CodexHistoryReadFs {
  lstat(path: string): Promise<CodexHistoryStat>
  readlink(path: string): Promise<string>
  readdir(path: string): Promise<string[]>
}

export interface CodexHistoryFs extends CodexHistoryReadFs {
  mkdir(path: string): Promise<void>
  symlink(target: string, path: string): Promise<void>
  /** Must refuse replacement of an existing destination. */
  copyFileExclusive(source: string, destination: string): Promise<void>
  /** Must create only when absent. */
  createEmptyFile(path: string): Promise<void>
  rename(source: string, destination: string): Promise<void>
}

export const codexHistoryFs: CodexHistoryFs = {
  lstat: (path) => nodeFs.lstat(path),
  readlink: (path) => nodeFs.readlink(path),
  readdir: (path) => nodeFs.readdir(path),
  mkdir: async (path) => {
    await nodeFs.mkdir(path, { recursive: true, mode: 0o700 })
  },
  symlink: (target, path) => nodeFs.symlink(target, path),
  copyFileExclusive: (source, destination) =>
    nodeFs.copyFile(source, destination, constants.COPYFILE_EXCL),
  createEmptyFile: (path) =>
    nodeFs.writeFile(path, '', { flag: 'wx', mode: 0o600 }),
  rename: (source, destination) => nodeFs.rename(source, destination),
}

interface RolloutFile {
  entry: CodexHistoryEntry
  relative: string
}

export interface CodexHistoryLayout {
  ready: boolean
  warnings: string[]
}

/**
 * @pattern Filesystem adapter.
 * Joins only native conversation storage across account homes. Credential and
 * runtime files never pass this boundary. Call migration with the account's
 * server stopped and admission closed; inspection itself is read-only.
 */
export class CodexAccountHistoryService {
  readonly sharedHome: string
  constructor(
    private readonly options: {
      homeDir?: string
      fs?: CodexHistoryFs
      now?: () => Date
    } = {},
  ) {
    this.sharedHome = join(options.homeDir ?? homedir(), '.codex')
  }

  private get fs(): CodexHistoryFs {
    return this.options.fs ?? codexHistoryFs
  }

  async inspect(configDir: string): Promise<CodexHistoryLayout> {
    try {
      const { plan } = await this.preflight(configDir)
      if (!plan.link.length && !plan.warnings.length)
        return { ready: true, warnings: [] }
      return {
        ready: false,
        warnings: plan.warnings.length
          ? plan.warnings
          : [
              'Conversations on this account are stored separately. Reconnect this account in Settings → Accounts → OpenAI to enable switching. Existing conversations will be preserved.',
            ],
      }
    } catch (error) {
      return { ready: false, warnings: [this.failureMessage(error)] }
    }
  }

  async migrate(configDir: string): Promise<CodexHistoryLayout> {
    let changed = false
    try {
      const { plan, files } = await this.preflight(configDir)
      if (plan.warnings.length) return { ready: false, warnings: plan.warnings }
      if (!plan.link.length) return { ready: true, warnings: [] }
      const stamp = (this.options.now?.() ?? new Date())
        .toISOString()
        .replace(/[:.]/g, '-')
      const backups = new Map(
        plan.preserve.map((entry) => [
          entry,
          join(configDir, `${entry}.pre-share-${stamp}`),
        ]),
      )
      for (const backup of backups.values()) {
        if (await this.stat(backup))
          throw new Error(
            'A preserved history backup already exists. Retry after inspecting it.',
          )
      }
      // Every preflight above is read-only, including both rollout trees and
      // every ancillary entry. IO failure after this point is reported honestly.
      changed = true
      for (const entry of plan.link) {
        const target = join(this.sharedHome, entry)
        if (await this.stat(target)) continue
        if (entry === 'session_index.jsonl') {
          await this.fs.mkdir(this.sharedHome)
          await this.fs.createEmptyFile(target)
        } else await this.fs.mkdir(target)
      }
      for (const file of files) {
        const target = join(this.sharedHome, file.entry, file.relative)
        await this.fs.mkdir(dirname(target))
        await this.fs.copyFileExclusive(
          join(configDir, file.entry, file.relative),
          target,
        )
      }
      for (const entry of plan.link) {
        const source = join(configDir, entry)
        const backup = backups.get(entry)
        if (backup) await this.fs.rename(source, backup)
        await this.fs.symlink(join(this.sharedHome, entry), source)
      }
      return { ready: true, warnings: [] }
    } catch (error) {
      return {
        ready: false,
        warnings: [
          this.failureMessage(error) +
            (changed
              ? ' Some history entries may already have been copied or linked. Original files are preserved in the account home or its .pre-share backups; inspect them before reconnecting.'
              : ' Nothing was changed.'),
        ],
      }
    }
  }

  private async preflight(configDir: string): Promise<{
    plan: ReturnType<typeof planCodexHistoryMigration>
    files: RolloutFile[]
  }> {
    const observations = await this.observe(configDir)
    const preliminary = planCodexHistoryMigration({
      entries: observations,
      collisions: 0,
    })
    if (preliminary.warnings.length) return { plan: preliminary, files: [] }
    if (!preliminary.link.length) return { plan: preliminary, files: [] }
    const files: RolloutFile[] = []
    for (const item of observations) {
      if (item.state !== 'rollouts') continue
      for (const relative of await this.rollouts(join(configDir, item.entry)))
        files.push({ entry: item.entry, relative })
    }
    // Names, not relative paths: moving between active and archived must not
    // conceal an existing rollout with the same native identity.
    const sharedNames = new Set<string>()
    for (const entry of files.length ? ['sessions', 'archived_sessions'] : []) {
      for (const relative of await this.rollouts(join(this.sharedHome, entry)))
        sharedNames.add(basename(relative))
    }
    const sourceNames = new Set<string>()
    let collisions = 0
    for (const file of files) {
      const name = basename(file.relative)
      if (sharedNames.has(name) || sourceNames.has(name)) collisions++
      sourceNames.add(name)
    }
    const plan = planCodexHistoryMigration({
      entries: observations,
      collisions,
    })
    return { plan, files }
  }

  private failureMessage(error: unknown): string {
    return `Could not prepare shared Codex conversation history: ${error instanceof Error ? error.message : String(error)}`
  }

  private async stat(path: string): Promise<CodexHistoryStat | null> {
    try {
      return await this.fs.lstat(path)
    } catch (error) {
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === 'ENOENT'
      )
        return null
      throw error
    }
  }

  private async observe(configDir: string): Promise<CodexHistoryObservation[]> {
    if (resolve(configDir) === resolve(this.sharedHome))
      throw new Error('The ambient home is not an enrolled account.')
    const home = await this.stat(configDir)
    if (!home?.isDirectory() || home.isSymbolicLink())
      throw new Error('The account home must be a real directory.')
    const observations: CodexHistoryObservation[] = []
    for (const entry of CODEX_SHARED_HISTORY_ENTRIES) {
      const path = join(configDir, entry)
      const target = join(this.sharedHome, entry)
      const shared = await this.stat(target)
      if (
        shared &&
        (shared.isSymbolicLink() ||
          (entry === 'session_index.jsonl'
            ? !shared.isFile()
            : !shared.isDirectory()))
      ) {
        observations.push({ entry, state: 'invalid' })
        continue
      }
      const local = await this.stat(path)
      if (!local) {
        observations.push({ entry, state: 'absent' })
        continue
      }
      if (local.isSymbolicLink()) {
        observations.push({
          entry,
          state:
            resolve(dirname(path), await this.fs.readlink(path)) ===
              resolve(target) && shared
              ? 'shared'
              : 'invalid',
        })
      } else if (entry === 'session_index.jsonl') {
        observations.push({
          entry,
          state: local.isFile()
            ? local.size === 0
              ? 'empty'
              : 'nonempty'
            : 'invalid',
        })
      } else if (local.isDirectory()) {
        const names: string[] = []
        for (const name of await this.fs.readdir(path)) {
          const child = await this.stat(join(path, name))
          if (
            isCodexHistoryOsJunk(name) &&
            child?.isFile() &&
            !child.isSymbolicLink()
          )
            continue
          names.push(name)
        }
        let knownLocksOnly = entry === 'thread-writer-locks'
        for (const name of names) {
          if (!knownLocksOnly) break
          const child = await this.stat(join(path, name))
          knownLocksOnly =
            isCodexWriterLockName(name) &&
            !!child?.isFile() &&
            !child.isSymbolicLink()
        }
        observations.push({
          entry,
          state:
            !names.length || knownLocksOnly
              ? 'empty'
              : isCodexRolloutDirectory(entry)
                ? 'rollouts'
                : 'nonempty',
        })
      } else observations.push({ entry, state: 'invalid' })
    }
    return observations
  }

  private async rollouts(root: string, prefix = ''): Promise<string[]> {
    const stat = await this.stat(join(root, prefix))
    if (!stat) return []
    if (!stat.isDirectory() || stat.isSymbolicLink())
      throw new Error('A rollout directory has an unexpected file or symlink.')
    const result: string[] = []
    for (const name of await this.fs.readdir(join(root, prefix))) {
      const relative = join(prefix, name)
      const child = await this.stat(join(root, relative))
      if (!child)
        throw new Error('Conversation history changed during inspection.')
      if (child.isSymbolicLink())
        throw new Error('A rollout entry is an unexpected symlink.')
      if (isCodexHistoryOsJunk(name)) {
        if (child.isFile()) continue
        throw new Error('An OS metadata entry is not a regular file.')
      }
      if (child.isDirectory())
        result.push(...(await this.rollouts(root, relative)))
      else if (child.isFile() && /^rollout-.+\.jsonl$/.test(name))
        result.push(relative)
      else
        throw new Error('A rollout directory contains an unrecognized entry.')
    }
    return result
  }
}
