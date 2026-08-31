import { describe, expect, it } from 'vitest'
import { extractAntigravityTrajectoryToolEvents } from './antigravity-trajectory.pure'

function encodeVarint(value: number): Buffer {
  const bytes: number[] = []
  let remaining = BigInt(value)
  do {
    let byte = Number(remaining & 0x7fn)
    remaining >>= 7n
    if (remaining > 0n) byte |= 0x80
    bytes.push(byte)
  } while (remaining > 0n)
  return Buffer.from(bytes)
}

function fieldKey(fieldNumber: number, wireType: number): Buffer {
  return encodeVarint((fieldNumber << 3) | wireType)
}

function varintField(fieldNumber: number, value: number): Buffer {
  return Buffer.concat([fieldKey(fieldNumber, 0), encodeVarint(value)])
}

function bytesField(fieldNumber: number, value: string | Buffer): Buffer {
  const payload = typeof value === 'string' ? Buffer.from(value, 'utf8') : value
  return Buffer.concat([
    fieldKey(fieldNumber, 2),
    encodeVarint(payload.length),
    payload,
  ])
}

function message(...fields: Buffer[]): Buffer {
  return Buffer.concat(fields)
}

function toolCallPayload(): Buffer {
  return message(
    bytesField(1, 'call-1'),
    bytesField(2, 'list_dir'),
    bytesField(3, '{"DirectoryPath":"."}'),
    bytesField(9, 'list_dir'),
  )
}

describe('antigravity trajectory telemetry parser', () => {
  it('extracts assistant tool calls from step type 15 payloads', () => {
    const stepPayload = message(
      varintField(1, 15),
      varintField(4, 3),
      bytesField(20, message(bytesField(7, toolCallPayload()))),
    )

    expect(
      extractAntigravityTrajectoryToolEvents([
        { idx: 2, stepType: 15, status: 3, stepPayload },
      ]),
    ).toEqual([
      {
        kind: 'tool-call',
        stepIndex: 2,
        toolCallId: 'call-1',
        toolName: 'list_dir',
        inputText: '{"DirectoryPath":"."}',
        providerItemId: 'antigravity:2:tool-call:call-1',
      },
    ])
  })

  it('extracts tool results that repeat the Antigravity tool call id', () => {
    const stepPayload = message(
      varintField(1, 9),
      varintField(4, 3),
      bytesField(5, message(bytesField(4, toolCallPayload()))),
      bytesField(
        15,
        message(
          bytesField(1, 'file:///tmp/project'),
          bytesField(3, message(bytesField(1, 'README.md'))),
          bytesField(3, message(bytesField(1, 'package.json'))),
        ),
      ),
    )

    expect(
      extractAntigravityTrajectoryToolEvents([
        { idx: 3, stepType: 9, status: 3, stepPayload },
      ]),
    ).toEqual([
      {
        kind: 'tool-result',
        stepIndex: 3,
        toolCallId: 'call-1',
        toolName: 'list_dir',
        outputText: '/tmp/project\nREADME.md\npackage.json',
        providerItemId: 'antigravity:3:tool-result:call-1',
      },
    ])
  })

  it('ignores malformed payloads instead of throwing', () => {
    expect(
      extractAntigravityTrajectoryToolEvents([
        {
          idx: 1,
          stepType: 15,
          status: 3,
          stepPayload: Buffer.from([0xff, 0xff, 0xff]),
        },
      ]),
    ).toEqual([])
  })
})
