/**
 * Which speeds Codex offers one account, per model (MAR-3574). The renderer's
 * copy of the backend's `CodexServiceTiersSnapshot`.
 */
export interface CodexSpeedTier {
  id: string
  name: string
  description: string
}

export interface CodexSpeedModelTiers {
  tiers: CodexSpeedTier[]
  defaultTier: string | null
}

export type CodexSpeedSnapshot =
  | {
      status: 'available'
      models: Record<string, CodexSpeedModelTiers>
      checkedAt: string
    }
  | { status: 'warming-up'; checkedAt: string }
  | { status: 'unavailable'; reason: string; checkedAt: string }

export interface CodexSpeedScope {
  executionHostId: string
  providerAccountId: string | null
}
