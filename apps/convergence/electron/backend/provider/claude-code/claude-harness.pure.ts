import type {
  HarnessFact,
  HarnessOutput,
} from '../../../../src/shared/types/harness-facts.types'
import { boundedHarnessPayload } from '../../session/harness-evidence.pure'
import { claudeRecord, claudeString } from './claude-evidence.pure'

const number = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null
const boolean = (value: unknown): boolean | null =>
  typeof value === 'boolean' ? value : null
const strings = (value: unknown): string[] | null =>
  Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : null

/** Decode only reported harness facts; missing fields remain unknown. */
export function readClaudeHarnessFact(
  data: unknown,
  at: string,
): HarnessFact | null {
  const e = claudeRecord(data)
  if (!e) return null
  if (e.type === 'rate_limit_event') {
    const r = claudeRecord(e.rate_limit_info) ?? {}
    return {
      kind: 'harness.rateLimit',
      at,
      status: claudeString(r.status),
      type: claudeString(r.rateLimitType),
      utilization: number(r.utilization),
      resetsAt: number(r.resetsAt),
      overageStatus: claudeString(r.overageStatus),
      overageResetsAt: number(r.overageResetsAt),
      overageDisabledReason: claudeString(r.overageDisabledReason),
      isUsingOverage: boolean(r.isUsingOverage),
      overageInUse: boolean(r.overageInUse),
      surpassedThreshold: number(r.surpassedThreshold),
    }
  }
  if (e.type !== 'system') return null
  if (
    ['hook_started', 'hook_progress', 'hook_response'].includes(
      String(e.subtype),
    )
  ) {
    return {
      kind: 'harness.hook',
      at,
      hookId: claudeString(e.hook_id),
      hookName: claudeString(e.hook_name),
      hookEvent: claudeString(e.hook_event),
      phase:
        e.subtype === 'hook_started'
          ? 'started'
          : e.subtype === 'hook_progress'
            ? 'progress'
            : 'response',
      status:
        e.subtype !== 'hook_response'
          ? null
          : e.exit_code === 2
            ? 'blocked'
            : e.outcome === 'success'
              ? 'ok'
              : e.outcome === 'error'
                ? 'failed'
                : null,
      output:
        typeof e.output === 'string'
          ? (JSON.parse(boundedHarnessPayload(e.output)) as HarnessOutput)
          : null,
    }
  }
  if (e.subtype === 'api_retry')
    return {
      kind: 'harness.retry',
      phase: 'attempt',
      at,
      attempt: number(e.attempt),
      maxRetries: number(e.max_retries),
      retryDelayMs: number(e.retry_delay_ms),
      errorStatus: number(e.error_status),
      message: claudeString(e.error),
      noResponse: boolean(e.no_response),
    }
  if (e.subtype === 'compact_boundary') {
    const c = claudeRecord(e.compact_metadata) ?? {}
    return {
      kind: 'harness.compaction',
      at,
      trigger: claudeString(c.trigger),
      preTokens: number(c.pre_tokens),
      postTokens: number(c.post_tokens),
      durationMs: number(c.duration_ms),
    }
  }
  if (e.subtype === 'permission_denied')
    return {
      kind: 'harness.denial',
      at,
      toolName: claudeString(e.tool_name),
      reasonType: claudeString(e.decision_reason_type),
      reason: claudeString(e.decision_reason),
    }
  if (e.subtype === 'init')
    return {
      kind: 'harness.init',
      at,
      claudeCodeVersion: claudeString(e.claude_code_version),
      model: claudeString(e.model),
      permissionMode: claudeString(e.permissionMode),
      mcpServers: Array.isArray(e.mcp_servers)
        ? e.mcp_servers.flatMap((value) => {
            const r = claudeRecord(value)
            const name = claudeString(r?.name)
            return name ? [{ name, status: claudeString(r?.status) }] : []
          })
        : null,
      plugins: Array.isArray(e.plugins)
        ? e.plugins.flatMap((value) => {
            const r = claudeRecord(value)
            const name = claudeString(r?.name)
            return name
              ? [
                  {
                    name,
                    path: claudeString(r?.path),
                    version: claudeString(r?.version),
                  },
                ]
              : []
          })
        : null,
      capabilities: strings(e.capabilities),
      skillsCount: Array.isArray(e.skills) ? e.skills.length : null,
      slashCommandsCount: Array.isArray(e.slash_commands)
        ? e.slash_commands.length
        : null,
    }
  return null
}
