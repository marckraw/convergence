import { randomUUID } from 'crypto'
import { promises as nodeFs } from 'fs'
import { homedir } from 'os'
import { basename, dirname, join } from 'path'
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
  /** Used to land the reconciled config atomically; see `writeConfigAtomically`. */
  rename: (from: string, to: string) => Promise<void>
  /**
   * Best-effort cleanup of the temp file when `rename` fails. Optional so
   * fakes written before this cleanup existed keep compiling; without it the
   * temp file is simply left behind, which was today's behaviour.
   */
  rm?: (path: string) => Promise<void>
}

const defaultIo: ClaudeConfigIo = {
  readFile: (path) => nodeFs.readFile(path, 'utf8'),
  writeFile: (path, contents) => nodeFs.writeFile(path, contents, 'utf8'),
  rename: (from, to) => nodeFs.rename(from, to),
  rm: (path) => nodeFs.rm(path, { force: true }),
}

/**
 * The three outcomes of reading a `.claude.json`: a file that genuinely does
 * not exist yet (safe to seed), a file that read and parsed as a JSON object
 * (safe to reconcile), or a file whose bytes could not be trusted — a parse
 * error, a partial read, or JSON that parsed but was not an object. The last
 * case must never be folded into "absent": that is exactly what let a
 * transient read failure look like a fresh account and get overwritten.
 */
export type ClaudeConfigReadState =
  | { kind: 'absent' }
  | { kind: 'ok'; value: Record<string, unknown> }
  | { kind: 'unreadable'; error: unknown }

export interface ResolveClaudeAccountEnvInput {
  /**
   * The account serving this spawn, or `null` for the ambient default account
   * — the shared `~/.claude` credential Convergence has always used. PA4
   * supplies this by resolving the turn's recorded account id.
   */
  account: ClaudeAccountEnvTarget | null
  /** The session's working directory, whose trust entry is reconciled. */
  workingDirectory: string
  /** Values Convergence sets itself: telemetry sink and connection configuration. */
  injections?: NodeJS.ProcessEnv
  baseEnv?: NodeJS.ProcessEnv
  homeDir?: string
  io?: ClaudeConfigIo
  /**
   * Optional, ignorable signal for callers that want to surface a note to the
   * user (e.g. "account config could not be read, left untouched"). Existing
   * callers that do not pass this keep their current behaviour exactly.
   */
  onNote?: (text: string) => void
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
  const sharedRead = await readClaudeConfig(io, join(home, '.claude.json'))
  const accountConfigPath = join(input.account.configDir, '.claude.json')
  const accountRead = await readClaudeConfig(io, accountConfigPath)

  if (accountRead.kind === 'unreadable') {
    // The one state where reconciling would mean guessing: we cannot tell
    // apart "new account" from "file the disk briefly refused to hand back",
    // so we write nothing and let the account's own file stand. The account
    // directories below still decide identity, so this costs a trust prompt
    // or a missing MCP server at worst — never the wrong credential.
    input.onNote?.(
      `Could not read the Claude account config at ${accountConfigPath}; leaving it untouched and starting this turn without its MCP servers.`,
    )
    return buildClaudeAccountEnv({
      baseEnv,
      account: input.account,
      injections: input.injections,
    })
  }

  const sharedConfig = sharedRead.kind === 'ok' ? sharedRead.value : null
  const accountConfig = accountRead.kind === 'ok' ? accountRead.value : null

  const reconciled = reconcileAccountClaudeConfig({
    accountConfig,
    sharedConfig,
    workingDirectory: input.workingDirectory,
  })

  if (reconciled.changed) {
    try {
      await writeConfigAtomically(io, accountConfigPath, reconciled.config)
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

async function readClaudeConfig(
  io: ClaudeConfigIo,
  path: string,
): Promise<ClaudeConfigReadState> {
  let raw: string
  try {
    raw = await io.readFile(path)
  } catch (error) {
    return isEnoent(error) ? { kind: 'absent' } : { kind: 'unreadable', error }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    return { kind: 'unreadable', error }
  }

  if (!isRecord(parsed)) {
    return {
      kind: 'unreadable',
      error: new Error(`expected a JSON object at ${path}`),
    }
  }

  return { kind: 'ok', value: parsed }
}

function isEnoent(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'ENOENT'
  )
}

/**
 * Writes the reconciled config to a temp file in the same directory, then
 * renames it over the real path — so a concurrent reader never observes a
 * half-written file, and a crash mid-write leaves the original untouched.
 *
 * Residual: this does not lock against the Claude CLI itself. If the CLI
 * writes the same file between our read and this rename, one side's update to
 * the shared keys (trust, mcpServers) can be lost. Nothing here depends on
 * that write for identity, and the next spawn re-reconciles from the shared
 * source of truth, so the loss heals itself on the next turn rather than
 * compounding.
 */
async function writeConfigAtomically(
  io: ClaudeConfigIo,
  path: string,
  config: Record<string, unknown>,
): Promise<void> {
  const tempPath = join(dirname(path), `.${basename(path)}.tmp-${randomUUID()}`)
  await io.writeFile(tempPath, `${JSON.stringify(config, null, 2)}\n`)
  try {
    await io.rename(tempPath, path)
  } catch (error) {
    // The rename failed, so the temp file is a scrap, not reconciled account
    // state — remove it so a later listing of the account directory (e.g.
    // MAR-3031's private-history detection) never sees it. Best effort: if
    // the cleanup itself fails too, the caller's outer catch still swallows
    // the original rename failure exactly as before.
    await io.rm?.(tempPath).catch(() => {})
    throw error
  }
}
