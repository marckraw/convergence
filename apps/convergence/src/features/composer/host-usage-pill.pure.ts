import { executionProviderUsageWindowLimits } from '@mrck-labs/execution-host-protocol'
import type { ProviderHostUsage } from '@/entities/session'
import { getCodexUsageTone, type CodexUsageTone } from './codex-usage-pill.pure'

/** One limit window of a host account, as the pill's panel draws it. */
export interface HostUsageWindowView {
  id: string
  label: string
  /** 0-100, what is left: the composer's usage pills all read remaining. */
  remainingPercent: number
  resetsAt: string | null
  tone: CodexUsageTone
}

/** What the host usage pill and its panel show (MAR-4272). */
export interface HostUsagePillView {
  /** "Claude Code on kuba-vps": whose usage, and on which machine. */
  title: string
  /** The pill's text: the provider and what is left of its tightest window. */
  text: string
  ariaLabel: string
  /** What is left of the tightest window limiting the model, or null. */
  remainingPercent: number | null
  tone: CodexUsageTone
  /** The provider's own verdict, when it is not plain "ok". */
  verdict: 'warning' | 'limited' | null
  /** Every window still in force that limits the selected model. */
  windows: HostUsageWindowView[]
  observedAt: string
  /** How the host heard it: from a session's turn, or by asking. */
  sourceLabel: string
  credits: {
    text: string
    balance: string | null
    observedAt: string
  } | null
}

function remainingOf(usedPercent: number): number {
  return Math.max(0, Math.min(100, 100 - usedPercent))
}

/**
 * The host account's usage beside the provider it belongs to (MAR-4272).
 *
 * The windows are the ones still in force for the selected model, by the
 * protocol's own rule (`executionProviderUsageWindowLimits`), so this pill and
 * accent.'s pickers agree on which windows count: one past its reset says
 * nothing, and an Opus week does not limit a Sonnet session. The pill reads
 * what is left of the tightest of them, as the Codex pill does.
 *
 * The provider's own verdict outranks the arithmetic: a `limited` host is
 * danger whatever the percentages say, and `warning` is never shown calmer
 * than warning.
 *
 * Shown to anyone (Marcin, 18 Oct): usage and credits are not the account,
 * which never reaches the renderer.
 */
export function resolveHostUsagePill(input: {
  usage: ProviderHostUsage
  providerName: string
  hostLabel: string
  model: { id: string; label: string } | null
  now: Date | number
}): HostUsagePillView {
  const { usage } = input
  const windows = usage.windows
    .filter((window) =>
      executionProviderUsageWindowLimits(
        {
          ...(window.resetsAt === null ? {} : { resetsAt: window.resetsAt }),
          ...(window.modelFamily === null
            ? {}
            : { modelFamily: window.modelFamily }),
        },
        input.model
          ? { slug: input.model.id, label: input.model.label }
          : { slug: '' },
        input.now,
      ),
    )
    .map((window) => {
      const remainingPercent = remainingOf(window.usedPercent)
      return {
        id: window.id,
        label: window.label,
        remainingPercent,
        resetsAt: window.resetsAt,
        tone: getCodexUsageTone(remainingPercent),
      }
    })
  const tightest = windows.reduce<HostUsageWindowView | null>(
    (lowest, window) =>
      lowest === null || window.remainingPercent < lowest.remainingPercent
        ? window
        : lowest,
    null,
  )
  const remainingPercent = tightest?.remainingPercent ?? null
  const verdict =
    usage.status === 'limited' || usage.status === 'warning'
      ? usage.status
      : null
  const arithmeticTone = getCodexUsageTone(remainingPercent)
  const tone: CodexUsageTone =
    verdict === 'limited'
      ? 'danger'
      : verdict === 'warning' && arithmeticTone !== 'danger'
        ? 'warning'
        : arithmeticTone
  const title = `${input.providerName} on ${input.hostLabel}`
  const amount =
    verdict === 'limited'
      ? 'limited'
      : remainingPercent === null
        ? '--'
        : `${Math.round(remainingPercent)}%`
  return {
    title,
    text: `${input.providerName} ${amount}`,
    ariaLabel:
      verdict === 'limited'
        ? `${title}: usage limited`
        : remainingPercent === null
          ? `${title}: no usage limit in force`
          : `${title}: ${Math.round(remainingPercent)}% of the tightest usage limit left`,
    remainingPercent,
    tone,
    verdict,
    windows,
    observedAt: usage.observedAt,
    sourceLabel:
      usage.source === 'turn' ? 'reported by a turn' : 'read from the provider',
    credits: usage.credits
      ? {
          text: usage.credits.unlimited
            ? 'Unlimited'
            : usage.credits.hasCredits
              ? 'Available'
              : 'No credits remaining',
          balance: usage.credits.unlimited ? null : usage.credits.balance,
          observedAt: usage.credits.observedAt,
        }
      : null,
  }
}
