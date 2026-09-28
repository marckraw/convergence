import {
  connectionCell,
  type ConnectionPathState,
  type ConnectionService,
  type ConnectionsOverviewRow,
} from '@/entities/provider-account'

/**
 * What a horse's account can reach, on its Loom card (MAR-3519). Marcin's
 * law: every horse must have Figma and Linear. The answer is the account's —
 * several horses on one account share its sign-ins — and it comes from the
 * last "Check all accounts" (MAR-3518), never from a guess.
 */
export interface LoomHorseAccessLine {
  text: string
  tone: 'good' | 'muted' | 'warn'
}

const SERVICES: ReadonlyArray<[ConnectionService, string]> = [
  ['figma', 'Figma'],
  ['linear', 'Linear'],
]

const WORD: Record<ConnectionPathState, string> = {
  works: 'works',
  connected: 'connected',
  unchecked: 'not checked',
  'needs-sign-in': 'needs sign-in',
  failed: "can't be used",
}

const muted = (text: string): LoomHorseAccessLine => ({ text, tone: 'muted' })

export function loomHorseAccessLine(input: {
  remote: boolean
  /** undefined while unknown; null is the ambient default account. */
  accountId: string | null | undefined
  /** The last "Check all accounts": a row exists once a check has begun. */
  rows: readonly ConnectionsOverviewRow[]
  /** When that check finished; shown, so an old answer never reads as live. */
  checkedAt?: string | null
}): LoomHorseAccessLine | null {
  if (input.remote)
    return muted('Figma, Linear: on another machine, not checked here')
  if (input.accountId === undefined) return null
  if (input.accountId === null)
    return muted('Figma, Linear: default account, not checked')
  const row = input.rows.find((entry) => entry.accountId === input.accountId)
  if (!row)
    return muted(
      'Figma, Linear: not checked yet (Settings → Provider accounts)',
    )
  if (row.state === 'checking') return muted('Figma, Linear: checking…')
  if (row.state === 'not-connected')
    return {
      text: `Figma, Linear: ${row.identity} isn't connected`,
      tone: 'warn',
    }
  if (row.state === 'failed')
    return muted(`Figma, Linear: couldn't check ${row.identity}`)
  const states = SERVICES.map(
    ([service, label]) =>
      [label, connectionCell(row.paths, service).state] as const,
  )
  const parts = states.map(([label, state]) =>
    state === 'none' ? `no ${label}` : `${label} ${WORD[state]}`,
  )
  const lacking = states.some(
    ([, state]) =>
      state === 'none' || state === 'needs-sign-in' || state === 'failed',
  )
  const reachable = states.every(
    ([, state]) => state === 'works' || state === 'connected',
  )
  const at = input.checkedAt ? new Date(input.checkedAt) : null
  const when =
    at && !Number.isNaN(at.getTime())
      ? ` · checked ${at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
      : ''
  return {
    text: `${parts.join(' · ')} · ${row.identity}${when}`,
    tone: lacking ? 'warn' : reachable ? 'good' : 'muted',
  }
}
