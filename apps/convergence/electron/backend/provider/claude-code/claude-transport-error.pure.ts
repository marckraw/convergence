/** Classifies a refusal expressed by the transport; never compares versions. */
export function describeClaudeTransportVersionRefusal(
  error: string | undefined,
  version: string | null,
): string | null {
  if (
    !error ||
    !/Claude Code/i.test(error) ||
    !/(?:minimum (?:supported |required )?version|version[^\n]*too old)/i.test(
      error,
    )
  )
    return null
  return `Claude Code ${version ?? '(unknown version)'} is older than this app supports`
}
