export interface ClaudeSkillActivationEvent {
  skillName: string
  skillSource: string | null
  pluginName: string | null
  marketplaceName: string | null
  timestamp: string | null
  sequence: number | null
}

type AttributeValue = string | number | boolean

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function valueFromOtelValue(value: unknown): AttributeValue | null {
  if (!isRecord(value)) {
    return null
  }

  if (typeof value.stringValue === 'string') {
    return value.stringValue
  }
  if (typeof value.intValue === 'number') {
    return value.intValue
  }
  if (typeof value.intValue === 'string') {
    const parsed = Number.parseInt(value.intValue, 10)
    return Number.isFinite(parsed) ? parsed : value.intValue
  }
  if (typeof value.doubleValue === 'number') {
    return value.doubleValue
  }
  if (typeof value.doubleValue === 'string') {
    const parsed = Number.parseFloat(value.doubleValue)
    return Number.isFinite(parsed) ? parsed : value.doubleValue
  }
  if (typeof value.boolValue === 'boolean') {
    return value.boolValue
  }

  return null
}

function attributesToRecord(
  attributes: unknown,
): Record<string, AttributeValue> {
  if (!Array.isArray(attributes)) {
    return {}
  }

  const record: Record<string, AttributeValue> = {}
  for (const attribute of attributes) {
    if (!isRecord(attribute) || typeof attribute.key !== 'string') {
      continue
    }
    const value = valueFromOtelValue(attribute.value)
    if (value !== null) {
      record[attribute.key] = value
    }
  }
  return record
}

function stringAttribute(
  attributes: Record<string, AttributeValue>,
  key: string,
): string | null {
  const value = attributes[key]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function numberAttribute(
  attributes: Record<string, AttributeValue>,
  key: string,
): number | null {
  const value = attributes[key]
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function collectLogRecords(payload: unknown): unknown[] {
  if (!isRecord(payload) || !Array.isArray(payload.resourceLogs)) {
    return []
  }

  return payload.resourceLogs.flatMap((resourceLog) => {
    if (!isRecord(resourceLog) || !Array.isArray(resourceLog.scopeLogs)) {
      return []
    }

    return resourceLog.scopeLogs.flatMap((scopeLog) => {
      if (!isRecord(scopeLog) || !Array.isArray(scopeLog.logRecords)) {
        return []
      }
      return scopeLog.logRecords
    })
  })
}

export function extractClaudeSkillActivationEvents(
  payload: unknown,
): ClaudeSkillActivationEvent[] {
  return collectLogRecords(payload).flatMap((logRecord) => {
    if (!isRecord(logRecord)) {
      return []
    }

    const attributes = attributesToRecord(logRecord.attributes)
    if (stringAttribute(attributes, 'event.name') !== 'skill_activated') {
      return []
    }

    const skillName = stringAttribute(attributes, 'skill.name')
    if (!skillName) {
      return []
    }

    return [
      {
        skillName,
        skillSource: stringAttribute(attributes, 'skill.source'),
        pluginName: stringAttribute(attributes, 'plugin.name'),
        marketplaceName: stringAttribute(attributes, 'marketplace.name'),
        timestamp:
          stringAttribute(attributes, 'event.timestamp') ??
          (typeof logRecord.timeUnixNano === 'string'
            ? logRecord.timeUnixNano
            : null),
        sequence: numberAttribute(attributes, 'event.sequence'),
      },
    ]
  })
}

export function isConcreteClaudeSkillName(skillName: string): boolean {
  return skillName.trim() !== '' && skillName !== 'custom_skill'
}
