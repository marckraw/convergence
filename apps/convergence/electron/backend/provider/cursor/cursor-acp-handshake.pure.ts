import { CURSOR_ACP_LOGIN_METHOD_ID } from './cursor-acp-contract.pure'

/** The ACP protocol version Convergence speaks (MAR-3145 R2). */
export const CURSOR_ACP_CLIENT_PROTOCOL_VERSION = 1

/**
 * What the Cursor CLI told us at `initialize`, read once and kept (MAR-3145 R1).
 *
 * Every field is explicitly unknown (`null`) when the CLI's result did not name
 * it, so a caller can never mistake "the CLI stayed silent" for "the CLI said
 * no". Parsing never throws: a malformed result is all unknowns.
 */
export interface CursorAcpHandshake {
  protocolVersion: number | null
  loadSession: boolean | null
  image: boolean | null
  /** `null` when the CLI named no `authMethods` array at all. */
  authMethodIds: string[] | null
}

const UNKNOWN_HANDSHAKE: CursorAcpHandshake = {
  protocolVersion: null,
  loadSession: null,
  image: null,
  authMethodIds: null,
}

function readRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function readBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null
}

/** Turns an ACP `initialize` result into a typed handshake. Never throws. */
export function parseCursorAcpHandshake(result: unknown): CursorAcpHandshake {
  const record = readRecord(result)
  if (!record) return { ...UNKNOWN_HANDSHAKE }

  const agentCapabilities = readRecord(record.agentCapabilities)
  const promptCapabilities = agentCapabilities
    ? readRecord(agentCapabilities.promptCapabilities)
    : null

  return {
    protocolVersion: readNumber(record.protocolVersion),
    loadSession: agentCapabilities
      ? readBoolean(agentCapabilities.loadSession)
      : null,
    image: promptCapabilities ? readBoolean(promptCapabilities.image) : null,
    authMethodIds: readAuthMethodIds(record.authMethods),
  }
}

function readAuthMethodIds(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null

  const ids: string[] = []
  for (const entry of value) {
    const record = readRecord(entry)
    const id = record?.id
    if (typeof id === 'string' && id.trim()) ids.push(id.trim())
  }
  return ids
}

/**
 * What the CLI's `authMethods` means for the one login method we know
 * (MAR-3145 R2, corrected lap 2).
 *
 * Three answers, not two: silence is not a refusal. `authMethods` is optional
 * in ACP, so a CLI that names no list — or an empty one — has told us nothing
 * about logging in, and the app proceeds exactly as it did before this rule
 * existed. Only a CLI that lists methods and leaves ours out has said no.
 *
 * The union exists so the conflation cannot come back: there is no boolean a
 * caller could read `false` from and throw on.
 */
export type CursorAcpLoginDecision =
  | { kind: 'proceed'; note: string | null }
  | { kind: 'refuse'; message: string }

/** Said once when the CLI named no login methods at all. */
export const CURSOR_ACP_SILENT_LOGIN_NOTE =
  'Cursor named no login methods; trying cursor_login.'

function formatMissingLoginMethodMessage(offeredIds: string[]): string {
  return `Cursor offers no login method Convergence knows (offered: ${offeredIds.join(
    ', ',
  )}). Update Convergence or the Cursor CLI.`
}

export function readCursorAcpLoginDecision(
  handshake: CursorAcpHandshake,
): CursorAcpLoginDecision {
  const offeredIds = handshake.authMethodIds

  // No list, or an empty one: the CLI stayed silent. Proceed, and say so.
  if (offeredIds === null || offeredIds.length === 0) {
    return { kind: 'proceed', note: CURSOR_ACP_SILENT_LOGIN_NOTE }
  }

  if (offeredIds.includes(CURSOR_ACP_LOGIN_METHOD_ID)) {
    return { kind: 'proceed', note: null }
  }

  return {
    kind: 'refuse',
    message: formatMissingLoginMethodMessage(offeredIds),
  }
}

/**
 * One debug line naming both versions when the CLI speaks a protocol we did not
 * expect — the handshake continues, because a mismatch is not yet a failure.
 * `null` when the versions agree or the CLI named none.
 */
export function formatCursorAcpProtocolVersionNote(
  handshake: CursorAcpHandshake,
): string | null {
  const { protocolVersion } = handshake
  if (protocolVersion === null) return null
  if (protocolVersion === CURSOR_ACP_CLIENT_PROTOCOL_VERSION) return null
  return `Cursor ACP protocol version ${protocolVersion} differs from the version Convergence speaks (${CURSOR_ACP_CLIENT_PROTOCOL_VERSION}); continuing.`
}
