function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

type ClaudeSessionRule = { toolName: string; ruleContent?: string }

function isRule(value: unknown): value is ClaudeSessionRule {
  return (
    isRecord(value) &&
    typeof value.toolName === 'string' &&
    (value.ruleContent === undefined || typeof value.ruleContent === 'string')
  )
}

export interface ClaudeSessionRules {
  rules: ClaudeSessionRule[]
  directories: string[]
}

export function readClaudeSessionRules(
  suggestions: unknown[] | undefined,
): ClaudeSessionRules {
  const result: ClaudeSessionRules = { rules: [], directories: [] }
  for (const suggestion of suggestions ?? []) {
    if (!isRecord(suggestion)) continue
    if (
      suggestion.type === 'addRules' &&
      suggestion.behavior === 'allow' &&
      Array.isArray(suggestion.rules)
    ) {
      for (const rule of suggestion.rules) {
        if (isRule(rule))
          result.rules.push({
            toolName: rule.toolName,
            ruleContent: rule.ruleContent,
          })
      }
    }
    if (
      suggestion.type === 'addDirectories' &&
      Array.isArray(suggestion.directories)
    )
      result.directories.push(
        ...suggestion.directories.filter(
          (value): value is string => typeof value === 'string',
        ),
      )
  }
  return result
}

/** Whether remembering these grants can honour an identical repeat. */
export function isRememberableSuggestionSet(
  suggestions: unknown[] | undefined,
  toolName: string,
): boolean {
  if (!suggestions?.length || !readClaudeSessionRules(suggestions).rules.length)
    return false
  return suggestions.every((suggestion) => {
    if (!isRecord(suggestion)) return false
    // A mode is an alternative to the chosen grants, never stored or sent.
    if (suggestion.type === 'setMode') return true
    if (
      suggestion.type === 'addRules' &&
      suggestion.behavior === 'allow' &&
      Array.isArray(suggestion.rules)
    )
      return suggestion.rules.every(
        (rule) => isRule(rule) && rule.toolName === toolName,
      )
    if (
      suggestion.type === 'addDirectories' &&
      Array.isArray(suggestion.directories)
    )
      return suggestion.directories.every(
        (directory) => typeof directory === 'string',
      )
    return false
  })
}

export function matchesClaudeSessionRule(
  remembered: ClaudeSessionRules,
  suggestions: unknown[] | undefined,
  toolName: string,
): boolean {
  if (!isRememberableSuggestionSet(suggestions, toolName)) return false
  const grants = readClaudeSessionRules(suggestions)
  return (
    grants.rules.every((rule) =>
      remembered.rules.some(
        (known) =>
          known.toolName === rule.toolName &&
          (known.ruleContent ?? null) === (rule.ruleContent ?? null),
      ),
    ) &&
    grants.directories.every((directory) =>
      remembered.directories.includes(directory),
    )
  )
}
