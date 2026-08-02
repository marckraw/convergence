import { promises as nodeFs } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import {
  collectMcpEnvPassthroughNames,
  isRecord,
  reconcileAccountClaudeConfig,
} from './provider-account-claude-config.pure'
import { buildClaudeAccountEnv } from './provider-account-env.pure'
import type { ClaudeAccountEnvTarget } from './provider-account-env.pure'

/**
 * The single boundary every Claude child process passes through.
 *
 * One function, one place where a credential can reach a provider process, so
 * "which account served this turn" has exactly one answer per spawn. Sites do
 * not build environments; they ask for one.
 */

/** Filesystem seam, so tests never touch a real `.claude.json`. */
export interface ClaudeConfigIo {
  readFile: (path: string) => Promise<string>
  writeFile: (path: string, contents: string) => Promise<void>
}

const defaultIo: ClaudeConfigIo = {
  readFile: (path) => nodeFs.readFile(path, 'utf8'),
  writeFile: (path, contents) => nodeFs.writeFile(path, contents, 'utf8'),
}

export interface ResolveClaudeAccountEnvInput {
  /**
   * The account serving this spawn, or `null` for the ambient default account
   * — the shared `~/.claude` credential Convergence has always used. PA4
   * supplies this by resolving the turn's recorded account id.
   */
  account: ClaudeAccountEnvTarget | null
  /** The session's working directory, whose trust entry is reconciled. */
  workingDirectory: string
  /** Values Convergence sets itself: telemetry sink, deferred tool response. */
  injections?: NodeJS.ProcessEnv
  baseEnv?: NodeJS.ProcessEnv
  homeDir?: string
  io?: ClaudeConfigIo
}

export async function resolveClaudeAccountEnv(
  input: ResolveClaudeAccountEnvInput,
): Promise<NodeJS.ProcessEnv> {
  const baseEnv = input.baseEnv ?? process.env

  if (!input.account) {
    // No account selected: today's environment, and not a single filesystem
    // read. The reconciler is a no-op by construction rather than by check.
    return buildClaudeAccountEnv({
      baseEnv,
      account: null,
      injections: input.injections,
    })
  }

  const io = input.io ?? defaultIo
  const home = input.homeDir ?? homedir()
  const sharedConfig = await readJsonObject(io, join(home, '.claude.json'))
  const accountConfigPath = join(input.account.configDir, '.claude.json')
  const accountConfig = await readJsonObject(io, accountConfigPath)

  const reconciled = reconcileAccountClaudeConfig({
    accountConfig,
    sharedConfig,
    workingDirectory: input.workingDirectory,
  })

  if (reconciled.changed) {
    try {
      await io.writeFile(
        accountConfigPath,
        `${JSON.stringify(reconciled.config, null, 2)}\n`,
      )
    } catch {
      // Best effort. A failed reconcile costs a trust prompt or a missing
      // server, never the wrong credential — the account directories below are
      // what decide identity, and they do not depend on this write.
    }
  }

  return buildClaudeAccountEnv({
    baseEnv,
    account: input.account,
    passthroughNames: collectMcpEnvPassthroughNames(
      reconciled.config.mcpServers,
    ),
    injections: input.injections,
  })
}

async function readJsonObject(
  io: ClaudeConfigIo,
  path: string,
): Promise<Record<string, unknown> | null> {
  try {
    const parsed = JSON.parse(await io.readFile(path)) as unknown
    return isRecord(parsed) ? parsed : null
  } catch {
    return null
  }
}
