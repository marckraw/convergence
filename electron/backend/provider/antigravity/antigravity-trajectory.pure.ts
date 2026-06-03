export interface AntigravityTrajectoryStepRow {
  idx: number
  stepType: number
  status: number
  stepPayload: Uint8Array
}

export type AntigravityTrajectoryToolEvent =
  | {
      kind: 'tool-call'
      stepIndex: number
      toolCallId: string | null
      toolName: string
      inputText: string
      providerItemId: string
    }
  | {
      kind: 'tool-result'
      stepIndex: number
      toolCallId: string | null
      toolName: string | null
      outputText: string
      providerItemId: string
    }

interface AntigravityProtoField {
  fieldNumber: number
  wireType: number
  value: bigint | Uint8Array
}

interface ToolCallPayload {
  toolCallId: string | null
  toolName: string | null
  inputText: string
}

const TOOL_CALL_STEP_TYPE = 15
const MAX_IMPORTED_TEXT_LENGTH = 8_000
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function readVarint(
  input: Uint8Array,
  offset: number,
): { value: bigint; offset: number } {
  let value = 0n
  let shift = 0n
  let cursor = offset

  for (let index = 0; index < 10 && cursor < input.length; index += 1) {
    const byte = BigInt(input[cursor])
    cursor += 1
    value |= (byte & 0x7fn) << shift
    if ((byte & 0x80n) === 0n) {
      return { value, offset: cursor }
    }
    shift += 7n
  }

  throw new Error('Invalid Antigravity protobuf varint')
}

function decodeFields(input: Uint8Array): AntigravityProtoField[] {
  const fields: AntigravityProtoField[] = []
  let cursor = 0

  while (cursor < input.length) {
    const tag = readVarint(input, cursor)
    cursor = tag.offset

    const fieldNumber = Number(tag.value >> 3n)
    const wireType = Number(tag.value & 7n)
    if (fieldNumber <= 0) {
      throw new Error('Invalid Antigravity protobuf field number')
    }

    if (wireType === 0) {
      const varint = readVarint(input, cursor)
      cursor = varint.offset
      fields.push({ fieldNumber, wireType, value: varint.value })
      continue
    }

    if (wireType === 1) {
      if (cursor + 8 > input.length) {
        throw new Error('Invalid Antigravity protobuf fixed64 field')
      }
      fields.push({
        fieldNumber,
        wireType,
        value: input.slice(cursor, cursor + 8),
      })
      cursor += 8
      continue
    }

    if (wireType === 2) {
      const length = readVarint(input, cursor)
      cursor = length.offset
      const byteLength = Number(length.value)
      if (
        !Number.isSafeInteger(byteLength) ||
        cursor + byteLength > input.length
      ) {
        throw new Error('Invalid Antigravity protobuf length-delimited field')
      }
      fields.push({
        fieldNumber,
        wireType,
        value: input.slice(cursor, cursor + byteLength),
      })
      cursor += byteLength
      continue
    }

    if (wireType === 5) {
      if (cursor + 4 > input.length) {
        throw new Error('Invalid Antigravity protobuf fixed32 field')
      }
      fields.push({
        fieldNumber,
        wireType,
        value: input.slice(cursor, cursor + 4),
      })
      cursor += 4
      continue
    }

    throw new Error(`Unsupported Antigravity protobuf wire type: ${wireType}`)
  }

  return fields
}

function safeDecodeFields(input: Uint8Array): AntigravityProtoField[] {
  try {
    return decodeFields(input)
  } catch {
    return []
  }
}

function lengthDelimitedFields(
  fields: AntigravityProtoField[],
  fieldNumber: number,
): Uint8Array[] {
  return fields
    .filter(
      (field): field is AntigravityProtoField & { value: Uint8Array } =>
        field.fieldNumber === fieldNumber &&
        field.wireType === 2 &&
        field.value instanceof Uint8Array,
    )
    .map((field) => field.value)
}

function utf8Text(input: Uint8Array): string | null {
  const text = Buffer.from(input).toString('utf8')
  if (Buffer.from(text, 'utf8').length !== input.length) return null
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index)
    const isReadableControl = code === 9 || code === 10 || code === 13
    if (!isReadableControl && code < 32) return null
  }
  if (!text.trim()) return null
  return text
}

function firstStringField(
  fields: AntigravityProtoField[],
  fieldNumber: number,
): string | null {
  for (const value of lengthDelimitedFields(fields, fieldNumber)) {
    const text = utf8Text(value)
    if (text) return text
  }
  return null
}

function parseToolCallPayload(input: Uint8Array): ToolCallPayload | null {
  const fields = safeDecodeFields(input)
  if (fields.length === 0) return null

  const toolName = firstStringField(fields, 2) ?? firstStringField(fields, 9)
  const toolCallId = firstStringField(fields, 1)
  if (!toolName && !toolCallId) return null

  return {
    toolCallId,
    toolName,
    inputText: firstStringField(fields, 3) ?? '',
  }
}

function isInternalIdentifier(value: string): boolean {
  return (
    UUID_PATTERN.test(value) ||
    value === 'sessionID' ||
    value.startsWith('bot-') ||
    value.startsWith('req_vrtx_') ||
    /^[A-Za-z0-9_-]{20,}$/.test(value)
  )
}

function normalizeReadableText(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed || isInternalIdentifier(trimmed)) return null
  if (trimmed === 'toolAction' || trimmed === 'toolSummary') return null
  if (trimmed === 'AbsolutePath' || trimmed === 'DirectoryPath') return null
  if (trimmed.startsWith('file://')) {
    try {
      return decodeURIComponent(trimmed.replace(/^file:\/\//, ''))
    } catch {
      return trimmed
    }
  }
  return trimmed
}

function collectReadableStrings(
  input: Uint8Array,
  output: string[],
  depth = 0,
): void {
  if (depth > 8) return

  const directText = utf8Text(input)
  if (directText) {
    const normalized = normalizeReadableText(directText)
    if (normalized) output.push(normalized)
  }

  const fields = safeDecodeFields(input)
  for (const field of fields) {
    if (field.wireType !== 2 || !(field.value instanceof Uint8Array)) continue
    collectReadableStrings(field.value, output, depth + 1)
  }
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const value of values) {
    if (seen.has(value)) continue
    seen.add(value)
    result.push(value)
  }
  return result
}

function truncateImportedText(value: string): string {
  if (value.length <= MAX_IMPORTED_TEXT_LENGTH) return value
  return `${value.slice(0, MAX_IMPORTED_TEXT_LENGTH)}\n\n[Antigravity telemetry truncated]`
}

function formatToolResultOutput(input: Uint8Array[]): string {
  const values: string[] = []
  for (const value of input) {
    collectReadableStrings(value, values)
  }

  const text = uniqueStrings(values).join('\n').trim()
  return truncateImportedText(
    text || 'Antigravity recorded a completed tool result.',
  )
}

function parseAssistantToolCalls(
  step: AntigravityTrajectoryStepRow,
): AntigravityTrajectoryToolEvent[] {
  const root = safeDecodeFields(step.stepPayload)
  const events: AntigravityTrajectoryToolEvent[] = []

  for (const assistantPayload of lengthDelimitedFields(root, 20)) {
    const assistantFields = safeDecodeFields(assistantPayload)
    const toolCalls = lengthDelimitedFields(assistantFields, 7)

    toolCalls.forEach((toolCallPayload, index) => {
      const parsed = parseToolCallPayload(toolCallPayload)
      if (!parsed?.toolName) return

      const eventKey = parsed.toolCallId ?? String(index)
      events.push({
        kind: 'tool-call',
        stepIndex: step.idx,
        toolCallId: parsed.toolCallId,
        toolName: parsed.toolName,
        inputText: truncateImportedText(parsed.inputText),
        providerItemId: `antigravity:${step.idx}:tool-call:${eventKey}`,
      })
    })
  }

  return events
}

function parseToolResult(
  step: AntigravityTrajectoryStepRow,
): AntigravityTrajectoryToolEvent[] {
  const root = safeDecodeFields(step.stepPayload)
  const stepMetadata = lengthDelimitedFields(root, 5).flatMap((field) =>
    lengthDelimitedFields(safeDecodeFields(field), 4),
  )
  if (stepMetadata.length === 0) return []

  const resultPayloads = root
    .filter(
      (field): field is AntigravityProtoField & { value: Uint8Array } =>
        field.wireType === 2 &&
        field.fieldNumber !== 5 &&
        field.value instanceof Uint8Array,
    )
    .map((field) => field.value)
  const outputText = formatToolResultOutput(resultPayloads)

  return stepMetadata.map((toolCallPayload, index) => {
    const parsed = parseToolCallPayload(toolCallPayload)
    const eventKey = parsed?.toolCallId ?? String(index)
    return {
      kind: 'tool-result',
      stepIndex: step.idx,
      toolCallId: parsed?.toolCallId ?? null,
      toolName: parsed?.toolName ?? null,
      outputText,
      providerItemId: `antigravity:${step.idx}:tool-result:${eventKey}`,
    }
  })
}

export function extractAntigravityTrajectoryToolEvents(
  steps: AntigravityTrajectoryStepRow[],
): AntigravityTrajectoryToolEvent[] {
  const events: AntigravityTrajectoryToolEvent[] = []

  for (const step of steps) {
    if (step.stepType === TOOL_CALL_STEP_TYPE) {
      events.push(...parseAssistantToolCalls(step))
      continue
    }

    events.push(...parseToolResult(step))
  }

  return events
}
