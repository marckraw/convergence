/**
 * How long ago the host last reached this app (MAR-3054).
 *
 * The stamp is the viewer's receipt time, not the daemon's event time: a
 * reconnect replay stamps the old envelopes it walks through "now". That is the
 * fact the label is for -- "the host last reached me" -- and never the viewer's
 * own updates standing in for it.
 */
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
      ? '<1m'
      : seconds < 3600
        ? `${Math.floor(seconds / 60)}m`
        : seconds < 86400
          ? `${Math.floor(seconds / 3600)}h`
          : `${Math.floor(seconds / 86400)}d`
  return `host · ${age} ago`
}
