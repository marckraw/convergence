export const CURSOR_ADMIN_API_KEY_PREFIX = 'key_'
export const CURSOR_USER_API_KEY_PREFIX = 'crsr_'

export function isCursorUserApiKey(value: string): boolean {
  return value.trim().toLowerCase().startsWith(CURSOR_USER_API_KEY_PREFIX)
}

export function describeCursorAdminApiKeySource(): string {
  return `Use the Cursor Admin API key from Dashboard > Settings > Cursor Admin API Keys. Those keys start with ${CURSOR_ADMIN_API_KEY_PREFIX}. User API Keys from the Cloud Agent/API page start with ${CURSOR_USER_API_KEY_PREFIX} and do not work for usage data.`
}

export function describeCursorUserApiKeyMismatch(): string {
  return `This looks like a Cursor User API Key (${CURSOR_USER_API_KEY_PREFIX}...) from the Cloud Agent/API page. ${describeCursorAdminApiKeySource()}`
}

export function validateCursorAdminApiKey(value: string): string | null {
  const apiKey = value.trim()
  if (!apiKey) {
    return 'Cursor Admin API key cannot be empty.'
  }

  if (isCursorUserApiKey(apiKey)) {
    return describeCursorUserApiKeyMismatch()
  }

  return null
}

export function describeCursorAdminApiAuthFailure(): string {
  return `Cursor Admin API auth failed. ${describeCursorAdminApiKeySource()}`
}
