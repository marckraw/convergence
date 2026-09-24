export const LUNA_MODEL_ID = 'gpt-6-luna'
export const LUNA_EFFORTS = ['low', 'medium', 'high'] as const
export type LunaEffort = (typeof LUNA_EFFORTS)[number]

/**
 * Whole-call budget for one helper turn.
 *
 * The app's own default is 20s. That budget cannot cover a cold `codex
 * app-server` start (the host allows 90s) plus a cloud answer, and the harness
 * already abandons a row at 120s. 110s lets the worker report the timeout
 * itself instead of the parent killing a silent process.
 */
export const LUNA_ONE_SHOT_TIMEOUT_MS = 110_000

export function parseLunaEffort(argv: readonly string[]): LunaEffort {
  const effort = argv[0] === '--effort' ? argv[1] : undefined
  if (!isLunaEffort(effort)) {
    throw new Error('Usage: node run.mjs luna --effort low|medium|high')
  }
  return effort
}

export function isLunaEffort(value: string | undefined): value is LunaEffort {
  return LUNA_EFFORTS.some((effort) => effort === value)
}

/**
 * PATH can list an old Codex first. The app refuses anything below its
 * resident-server gate, so the worker keeps walking `which -a` until one
 * binary passes that same gate.
 */
export function selectCodexBinary(
  candidates: readonly { binaryPath: string; version: string | null }[],
  supportsResidentServer: (version: string | null) => boolean,
): { binaryPath: string; version: string | null } {
  const match = candidates.find((candidate) =>
    supportsResidentServer(candidate.version),
  )
  if (!match) {
    const seen = candidates
      .map((candidate) => candidate.version ?? 'unknown')
      .join(', ')
    throw new Error(
      `No Codex binary on PATH satisfies the resident app-server gate. Seen: ${seen || 'none'}`,
    )
  }
  return match
}

/**
 * The one-shot call the harness sends.
 *
 * `permissionConfig` states the brief (no approvals, no writes). The Codex
 * helper does not read that field: every helper turn uses its own constant,
 * `approvalPolicy: never` and `sandbox: read-only`, and refuses tool requests.
 */
export function buildLunaOneShotInput(input: {
  prompt: string
  effort: LunaEffort
  workingDirectory: string
  requestId: string
}) {
  return {
    prompt: input.prompt,
    modelId: LUNA_MODEL_ID,
    effort: input.effort,
    workingDirectory: input.workingDirectory,
    timeoutMs: LUNA_ONE_SHOT_TIMEOUT_MS,
    requestId: input.requestId,
    providerAccountId: null,
    permissionConfig: {
      preset: 'custom' as const,
      codex: {
        approvalPolicy: 'never' as const,
        sandbox: 'read-only' as const,
      },
    },
  }
}

/** Drop credential-shaped substrings before a sentence or error is stored. */
export function redactForReport(text: string): string {
  return text
    .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, '[redacted]')
    .replace(
      /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,
      '[redacted]',
    )
    .replace(/(Bearer\s+)\S+/gi, '$1[redacted]')
}
