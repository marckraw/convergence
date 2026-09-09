function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export interface ClaudeSessionRules {
  rules: Array<{ toolName: string; ruleContent: string }>
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
        if (
          isRecord(rule) &&
          typeof rule.toolName === 'string' &&
          typeof rule.ruleContent === 'string'
        )
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

export function matchesClaudeSessionRule(
  remembered: ClaudeSessionRules,
  suggestions: unknown[] | undefined,
  toolName: string,
): boolean {
  if (!suggestions?.length || !readClaudeSessionRules(suggestions).rules.length)
    return false
  return suggestions.every((suggestion) => {
    if (!isRecord(suggestion)) return false
    if (
      suggestion.type === 'addRules' &&
      suggestion.behavior === 'allow' &&
      Array.isArray(suggestion.rules)
    )
      return suggestion.rules.every(
        (rule) =>
          isRecord(rule) &&
          rule.toolName === toolName &&
          remembered.rules.some(
            (known) =>
              known.toolName === rule.toolName &&
              known.ruleContent === rule.ruleContent,
          ),
      )
    if (
      suggestion.type === 'addDirectories' &&
      Array.isArray(suggestion.directories)
    )
      return suggestion.directories.every(
        (directory) =>
          typeof directory === 'string' &&
          remembered.directories.includes(directory),
      )
    return false
  })
}
