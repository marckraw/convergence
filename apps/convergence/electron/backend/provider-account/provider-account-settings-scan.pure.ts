/**
 * The one credential channel no environment boundary can close.
 *
 * `settings.json` is symlinked shared by design — it is agent knowledge, not
 * credentials. But two of its keys resolve *inside* the Claude process, after
 * the environment Convergence builds has already been handed over:
 * `apiKeyHelper` (rank 4 in the documented auth precedence) and the settings
 * `env` block. Either can carry a credential that outranks the selected
 * account, and PA2's allowlist physically cannot strip what never passes
 * through the environment it constructs.
 *
 * So this is a scan, not a filter. With one of these present, account selection
 * is decorative: every account serves the same credential. Enrolment warns
 * loudly, PA7 re-checks periodically, and identity attestation is the net that
 * actually catches the consequence.
 */

export type ProviderAccountSettingsWarningKind =
  | 'api-key-helper'
  | 'credential-env-key'

export interface ProviderAccountSettingsWarning {
  kind: ProviderAccountSettingsWarningKind
  /** The settings key at fault, e.g. `apiKeyHelper` or `env.ANTHROPIC_API_KEY`. */
  key: string
  message: string
}

/**
 * Names that outrank subscription OAuth, plus the shapes a credential usually
 * takes. Matching is deliberately generous: a false warning costs one glance,
 * a missed one costs every account serving the wrong identity.
 */
const CREDENTIAL_ENV_NAMES: readonly string[] = [
  'ANTHROPIC_AUTH_TOKEN',
  'ANTHROPIC_API_KEY',
  'CLAUDE_CODE_OAUTH_TOKEN',
  'CCR_OAUTH_TOKEN_FILE',
  'CLAUDE_CODE_USE_BEDROCK',
  'CLAUDE_CODE_USE_VERTEX',
]

const CREDENTIAL_NAME_HINT =
  /(^|_)(TOKEN|KEY|SECRET|CREDENTIAL|PASSWORD)S?($|_)/i

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isCredentialShapedEnvName(name: string): boolean {
  return CREDENTIAL_ENV_NAMES.includes(name) || CREDENTIAL_NAME_HINT.test(name)
}

/**
 * Scans a parsed shared `settings.json`. Returns an empty list for a missing or
 * malformed file: this is an advisory check, and refusing to enrol because
 * settings could not be parsed would be worse than the risk it reports.
 */
export function scanSharedSettingsForCredentials(
  settings: unknown,
): ProviderAccountSettingsWarning[] {
  if (!isRecord(settings)) return []

  const warnings: ProviderAccountSettingsWarning[] = []

  if (
    typeof settings.apiKeyHelper === 'string' &&
    settings.apiKeyHelper.trim()
  ) {
    warnings.push({
      kind: 'api-key-helper',
      key: 'apiKeyHelper',
      message:
        'Shared settings.json defines apiKeyHelper, which resolves inside the ' +
        'Claude process and outranks subscription OAuth. While it is set, ' +
        'every provider account serves the same credential and account ' +
        'selection has no effect.',
    })
  }

  if (isRecord(settings.env)) {
    for (const name of Object.keys(settings.env).sort()) {
      if (!isCredentialShapedEnvName(name)) continue
      warnings.push({
        kind: 'credential-env-key',
        key: `env.${name}`,
        message:
          `Shared settings.json injects ${name} into every Claude process. ` +
          'Settings-injected environment is applied inside the process, so ' +
          'account selection cannot override it.',
      })
    }
  }

  return warnings
}
