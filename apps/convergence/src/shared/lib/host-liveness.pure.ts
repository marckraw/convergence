/** The viewer's updates never stand in for an execution host's last envelope. */
export function hostLivenessLabel(
  host: string | undefined,
  at: string | null | undefined,
  now: number,
): string | null {
  if (!host || host === 'local') return null
  const timestamp = at ? Date.parse(at) : NaN
  if (!Number.isFinite(timestamp)) return 'host · not recorded'
  const seconds = Math.max(0, Math.floor((now - timestamp) / 1000))
  const age =
    seconds < 60
      ? `${seconds}s`
      : seconds < 3600
        ? `${Math.floor(seconds / 60)}m`
        : seconds < 86400
          ? `${Math.floor(seconds / 3600)}h`
          : `${Math.floor(seconds / 86400)}d`
  return `host · ${age} ago`
}
