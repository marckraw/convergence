import { describe, expect, it } from 'vitest'
import {
  extractClaudeSkillActivationEvents,
  isConcreteClaudeSkillName,
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
