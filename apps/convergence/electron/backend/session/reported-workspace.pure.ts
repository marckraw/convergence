import {
  decodeExecutionSessionWorkspace,
  encodeExecutionSessionWorkspace,
  type ExecutionSessionWorkspace,
} from '@mrck-labs/execution-host-protocol'

/**
 * The `sessions.reported_workspace` column: the daemon's own answer about where
 * a session worked, kept so the record no longer has to ask for it (MAR-2694).
 *
 * Reading and writing both go through the protocol's codec rather than through
 * a shape this file understands. The column holds a wire value, and a wire
 * value has exactly one reader -- the one the daemon encodes with -- or the
 * app grows a second opinion about what the daemon said and only one of them
 * gets updated when the protocol moves.
 */
export function serializeReportedWorkspace(
  workspace: ExecutionSessionWorkspace,
): string {
  return encodeExecutionSessionWorkspace(workspace)
}

/**
 * Reads the column. Never throws and never repairs: a column that is absent,
 * blank, unparseable, or shaped like a workspace this build cannot read yields
 * `null`, which every surface reads as "the record says nothing about what the
 * daemon reported" -- the same honest silence a session that has not answered
 * yet produces.
 *
 * The refusal is quiet *here* and loud at the wire (`fetchSessionWorkspaceInfo`
 * throws on an undecodable echo), and that difference is deliberate. A daemon
 * sending something unreadable right now is news; a row this app wrote under
 * an older build is history, and history that cannot be read is best said to be
 * unknown rather than allowed to take the app down at boot.
 */
export function parseReportedWorkspace(
  raw: string | null | undefined,
): ExecutionSessionWorkspace | null {
  if (typeof raw !== 'string' || !raw.trim()) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  const decoded = decodeExecutionSessionWorkspace(parsed)
  return decoded.ok ? decoded.value : null
}
