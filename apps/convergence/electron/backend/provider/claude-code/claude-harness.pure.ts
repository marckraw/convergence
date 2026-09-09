import type {
  HarnessFact,
  HarnessOutput,
} from '../../../../src/shared/types/harness-facts.types'
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
  const fieldBounds: NonNullable<HarnessFact['fieldBounds']> = {}
  const text = (field: string, value: unknown, budget = 64): string | null => {
    if (typeof value !== 'string') return null
    const bounded = boundHarnessText(value, budget)
    if (typeof bounded === 'string') return bounded
    fieldBounds[field] = {
      truncated: true,
      bytes: (fieldBounds[field]?.bytes ?? 0) + bounded.bytes,
    }
    return bounded.preview
  }
  const boundedFact = <T extends HarnessFact>(fact: T): T =>
    Object.keys(fieldBounds).length ? { ...fact, fieldBounds } : fact
  if (!e) return null
  if (e.type === 'rate_limit_event') {
    const r = claudeRecord(e.rate_limit_info) ?? {}
    return boundedFact({
      kind: 'harness.rateLimit',
      at,
      status: text('status', r.status),
      type: text('rateLimitType', r.rateLimitType),
      utilization: number(r.utilization),
      resetsAt: number(r.resetsAt),
      overageStatus: text('overageStatus', r.overageStatus),
      overageResetsAt: number(r.overageResetsAt),
      overageDisabledReason: text(
        'overageDisabledReason',
        r.overageDisabledReason,
      ),
      isUsingOverage: boolean(r.isUsingOverage),
      overageInUse: boolean(r.overageInUse),
      surpassedThreshold: number(r.surpassedThreshold),
    })
  }
  if (e.type !== 'system') return null
  if (
    ['hook_started', 'hook_progress', 'hook_response'].includes(
      String(e.subtype),
    )
  ) {
    return boundedFact({
      kind: 'harness.hook',
      at,
      hookId: text('hookId', e.hook_id),
      hookName: text('hookName', e.hook_name),
      hookEvent: text('hookEvent', e.hook_event),
      phase:
        e.subtype === 'hook_started'
          ? 'started'
          : e.subtype === 'hook_progress'
            ? 'progress'
            : 'response',
      status:
        e.subtype !== 'hook_response'
          ? null
          : e.outcome === 'cancelled'
            ? 'cancelled'
            : e.exit_code === 2
              ? 'blocked'
              : e.outcome === 'success'
                ? 'ok'
                : e.outcome === 'error'
                  ? 'failed'
                  : null,
      output:
        typeof e.output === 'string' ? boundHarnessText(e.output, 4096) : null,
    })
  }
  if (e.subtype === 'api_retry')
    return boundedFact({
      kind: 'harness.retry',
      phase: 'attempt',
      at,
      attempt: number(e.attempt),
      maxRetries: number(e.max_retries),
      retryDelayMs: number(e.retry_delay_ms),
      errorStatus: number(e.error_status),
      message: text('message', e.error, 512),
      noResponse: boolean(e.no_response),
    })
  if (e.subtype === 'compact_boundary') {
    const c = claudeRecord(e.compact_metadata) ?? {}
    return boundedFact({
      kind: 'harness.compaction',
      at,
      trigger: text('trigger', c.trigger),
      preTokens: number(c.pre_tokens),
      postTokens: number(c.post_tokens),
      durationMs: number(c.duration_ms),
    })
  }
  if (e.subtype === 'permission_denied') {
    const toolUseId = text('toolUseId', e.tool_use_id)
    return boundedFact({
      kind: 'harness.denial',
      ...(toolUseId ? { toolUseId } : {}),
      at,
      toolName: text('toolName', e.tool_name),
      reasonType: text('reasonType', e.decision_reason_type),
      reason: text('reason', e.decision_reason, 1024),
    })
  }
  if (e.subtype === 'init') {
    const servers = Array.isArray(e.mcp_servers)
      ? e.mcp_servers.flatMap((value) => {
          const r = claudeRecord(value),
            name = claudeString(r?.name)
          return name ? [{ name, status: claudeString(r?.status) }] : []
        })
      : null
    const others =
      servers?.filter((server) => server.status !== 'connected') ?? []
    const plugins = Array.isArray(e.plugins) ? e.plugins : null
    const capabilities = strings(e.capabilities)
    return boundedFact({
      kind: 'harness.init',
      at,
      claudeCodeVersion: text('claudeCodeVersion', e.claude_code_version),
      model: text('model', e.model),
      permissionMode: text('permissionMode', e.permissionMode),
      mcpServers: servers
        ? {
            total: servers.length,
            connected: servers.length - others.length,
            others: others.slice(0, 16).map((server) => ({
              name: text('mcpServers', server.name, 48)!,
              status: text('mcpServers', server.status),
            })),
            omitted: Math.max(0, others.length - 16),
          }
        : null,
      plugins: plugins
        ? {
            count: plugins.length,
            names: plugins.slice(0, 16).flatMap((value) => {
              const name = text('plugins', claudeRecord(value)?.name, 48)
              return name === null ? [] : [name]
            }),
            omitted: Math.max(0, plugins.length - 16),
          }
        : null,
      capabilities: capabilities
        ? {
            values: capabilities
              .slice(0, 32)
              .map((value) => text('capabilities', value, 32)!),
            omitted: Math.max(0, capabilities.length - 32),
          }
        : null,
      tools: Array.isArray(e.tools) ? { count: e.tools.length } : null,
      skills: Array.isArray(e.skills) ? { count: e.skills.length } : null,
      slashCommands: Array.isArray(e.slash_commands)
        ? { count: e.slash_commands.length }
        : null,
    })
  }
  return null
}

/** Bound text in the envelope's JSON UTF-8 unit; never split a code point. */
export function boundHarnessText(
  output: string,
  budget: number,
): HarnessOutput {
  const bytes = Buffer.byteLength(output, 'utf8')
  if (Buffer.byteLength(JSON.stringify(output)) <= budget) return output
  let size = 2,
    preview = ''
  for (const point of output) {
    const next = Buffer.byteLength(JSON.stringify(point)) - 2
    if (size + next > budget) break
    size += next
    preview += point
  }
  return { truncated: true, bytes, preview }
}
