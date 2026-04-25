import { request } from 'http'
import { describe, expect, it } from 'vitest'
import {
  buildEmbeddedClaudeSkillTelemetryEnv,
  shouldUseEmbeddedClaudeSkillTelemetry,
  startClaudeSkillTelemetrySink,
} from './claude-skill-telemetry.service'

function attr(key: string, value: string | number) {
  return {
    key,
    value:
      typeof value === 'number' ? { intValue: value } : { stringValue: value },
  }
}

function postJson(url: string, payload: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url)
    const body = JSON.stringify(payload)
    const req = request(
      {
        hostname: parsed.hostname,
        port: parsed.port,
        path: parsed.pathname,
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(body),
        },
      },
      (res) => {
        res.resume()
        res.on('end', () => resolve())
      },
    )
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

describe('shouldUseEmbeddedClaudeSkillTelemetry', () => {
  it('uses embedded telemetry only when user logs config is absent', () => {
    expect(shouldUseEmbeddedClaudeSkillTelemetry({})).toBe(true)
    expect(
      shouldUseEmbeddedClaudeSkillTelemetry({
        CONVERGENCE_CLAUDE_SKILL_TELEMETRY: '0',
      }),
    ).toBe(false)
    expect(
      shouldUseEmbeddedClaudeSkillTelemetry({
        OTEL_LOGS_EXPORTER: 'console',
      }),
    ).toBe(false)
    expect(
      shouldUseEmbeddedClaudeSkillTelemetry({
        OTEL_EXPORTER_OTLP_LOGS_ENDPOINT: 'http://collector/v1/logs',
      }),
    ).toBe(false)
  })
})

describe('startClaudeSkillTelemetrySink', () => {
  it('builds Claude environment for an embedded OTLP JSON logs endpoint', () => {
    expect(
      buildEmbeddedClaudeSkillTelemetryEnv('http://127.0.0.1:4318', {}),
    ).toEqual({
      CLAUDE_CODE_ENABLE_TELEMETRY: '1',
      OTEL_LOGS_EXPORTER: 'otlp',
      OTEL_EXPORTER_OTLP_LOGS_PROTOCOL: 'http/json',
      OTEL_EXPORTER_OTLP_LOGS_ENDPOINT: 'http://127.0.0.1:4318/v1/logs',
      OTEL_LOG_TOOL_DETAILS: '1',
      OTEL_LOGS_EXPORT_INTERVAL: '1000',
      OTEL_METRICS_EXPORTER: 'none',
    })
  })

  it('receives OTLP JSON skill activation events', async () => {
    const events: string[] = []
    const sink = await startClaudeSkillTelemetrySink({
      env: {},
      onSkillActivated: (event) => events.push(event.skillName),
    })

    // Some CI sandboxes disallow binding local HTTP ports. Runtime treats that
    // the same as disabled telemetry: sessions continue and chips stay sent.
    if (!sink) return

    try {
      expect(sink.env).toMatchObject({
        CLAUDE_CODE_ENABLE_TELEMETRY: '1',
        OTEL_LOGS_EXPORTER: 'otlp',
        OTEL_EXPORTER_OTLP_LOGS_PROTOCOL: 'http/json',
        OTEL_LOG_TOOL_DETAILS: '1',
      })
      await postJson(sink.env.OTEL_EXPORTER_OTLP_LOGS_ENDPOINT, {
        resourceLogs: [
          {
            scopeLogs: [
              {
                logRecords: [
                  {
                    attributes: [
                      attr('event.name', 'skill_activated'),
                      attr('event.sequence', 1),
                      attr('skill.name', 'explain-code'),
                    ],
                  },
                ],
              },
            ],
          },
        ],
      })

      expect(events).toEqual(['explain-code'])
    } finally {
      sink.dispose()
    }
  })

  it('returns null when embedded telemetry is disabled', async () => {
    await expect(
      startClaudeSkillTelemetrySink({
        env: { OTEL_LOGS_EXPORTER: 'console' },
        onSkillActivated: () => {},
      }),
    ).resolves.toBeNull()
  })
})
