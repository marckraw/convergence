import { isRemoteExecutionHost } from '@/entities/execution-host'

/**
 * The line above a skill list read on this Mac (MAR-3401).
 *
 * The list stays selectable. This only says which machine it was read from,
 * because a remote host may not have the same skills installed. A blank label
 * falls back to the host id so the line still names a machine.
 */
export function remoteSkillsNotice(input: {
  hostId: string | null | undefined
  hostLabel: string | null | undefined
}): string | null {
  if (!isRemoteExecutionHost(input.hostId)) return null
  const label = input.hostLabel?.trim() || String(input.hostId).trim()
  return `From this Mac — ${label} may not have these skills.`
}
