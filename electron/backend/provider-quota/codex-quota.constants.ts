export const CODEX_USAGE_URL = 'https://chatgpt.com/backend-api/wham/usage'
export const CODEX_QUOTA_CACHE_TTL_MS = 60_000

/**
 * `account/rateLimits/read` spawns a codex app-server and waits on OpenAI.
 * Measured on this machine 2026-07-27: 12.8s against codex 0.142 and 28.0s
 * against a cold 0.145. The budget is deliberately patient — a timeout here
 * silently demotes us to the auth.json scrape.
 */
export const CODEX_RATE_LIMITS_TIMEOUT_MS = 60_000
