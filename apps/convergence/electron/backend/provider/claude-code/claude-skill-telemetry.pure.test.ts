import { describe, expect, it } from 'vitest'
import {
  buildEmbeddedClaudeSkillTelemetryEnv,
  extractClaudeSkillActivationEvents,
  isConcreteClaudeSkillName,
  isClaudeSkillTelemetryDisabled,
  shouldUseEmbeddedClaudeSkillTelemetry,
} from './claude-skill-telemetry.pure'

function attr(key: string, value: string | number | boolean) {
  if (typeof value === 'boolean') {
    return { key, value: { boolValue: value } }
  }
  if (typeof value === 'number') {
    return { key, value: { intValue: value } }
  }
  return { key, value: { stringValue: value } }
}

describe('extractClaudeSkillActivationEvents', () => {
  it('extracts skill_activated log records from OTLP JSON payloads', () => {
    const payload = {
      resourceLogs: [
        {
          scopeLogs: [
            {
              logRecords: [
                {
                  attributes: [
                    attr('event.name', 'skill_activated'),
                    attr('event.timestamp', '2026-04-25T12:00:00.000Z'),
                    attr('event.sequence', 7),
                    attr('skill.name', 'explain-code'),
                    attr('skill.source', 'projectSettings'),
                    attr('plugin.name', 'plugin-a'),
                    attr('marketplace.name', 'marketplace-a'),
                  ],
                },
              ],
            },
          ],
        },
      ],
    }

    expect(extractClaudeSkillActivationEvents(payload)).toEqual([
      {
        skillName: 'explain-code',
        skillSource: 'projectSettings',
        pluginName: 'plugin-a',
        marketplaceName: 'marketplace-a',
        timestamp: '2026-04-25T12:00:00.000Z',
        sequence: 7,
      },
    ])
  })

  it('ignores unrelated events and skill events without a name', () => {
    const payload = {
      resourceLogs: [
        {
          scopeLogs: [
            {
              logRecords: [
                {
                  attributes: [
                    attr('event.name', 'tool_result'),
                    attr('skill.name', 'explain-code'),
                  ],
                },
                {
                  attributes: [attr('event.name', 'skill_activated')],
                },
              ],
            },
          ],
        },
      ],
    }

    expect(extractClaudeSkillActivationEvents(payload)).toEqual([])
  })
})

describe('isConcreteClaudeSkillName', () => {
  it('rejects the redacted custom_skill placeholder', () => {
    expect(isConcreteClaudeSkillName('custom_skill')).toBe(false)
    expect(isConcreteClaudeSkillName('explain-code')).toBe(true)
  })
})

describe('embedded Claude skill telemetry environment helpers', () => {
  it('detects disabled telemetry env flags', () => {
    expect(
      isClaudeSkillTelemetryDisabled({
        CONVERGENCE_CLAUDE_SKILL_TELEMETRY: '0',
      }),
    ).toBe(true)
    expect(
      isClaudeSkillTelemetryDisabled({
        CONVERGENCE_DISABLE_CLAUDE_SKILL_TELEMETRY: '1',
      }),
    ).toBe(true)
    expect(
      isClaudeSkillTelemetryDisabled({ CLAUDE_CODE_ENABLE_TELEMETRY: '0' }),
    ).toBe(true)
  })

  it('uses embedded telemetry only when no external logs exporter exists', () => {
    expect(shouldUseEmbeddedClaudeSkillTelemetry({})).toBe(true)
    expect(
      shouldUseEmbeddedClaudeSkillTelemetry({ OTEL_LOGS_EXPORTER: 'otlp' }),
    ).toBe(false)
    expect(
      shouldUseEmbeddedClaudeSkillTelemetry({
        OTEL_EXPORTER_OTLP_LOGS_ENDPOINT: 'https://example.com/logs',
      }),
    ).toBe(false)
  })

  it('builds OTLP log env while disabling metrics by default', () => {
    expect(
      buildEmbeddedClaudeSkillTelemetryEnv('http://127.0.0.1:1234'),
    ).toEqual({
      CLAUDE_CODE_ENABLE_TELEMETRY: '1',
      OTEL_LOGS_EXPORTER: 'otlp',
      OTEL_EXPORTER_OTLP_LOGS_PROTOCOL: 'http/json',
      OTEL_EXPORTER_OTLP_LOGS_ENDPOINT: 'http://127.0.0.1:1234/v1/logs',
      OTEL_LOG_TOOL_DETAILS: '1',
      OTEL_LOGS_EXPORT_INTERVAL: '1000',
      OTEL_METRICS_EXPORTER: 'none',
    })
  })
})
