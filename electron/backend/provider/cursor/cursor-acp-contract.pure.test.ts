import { describe, expect, it } from 'vitest'
import {
  CURSOR_ACP_ATTACHMENT_CAPABILITY,
  CURSOR_ACP_INTERACTION_CAPABILITY,
  CURSOR_ACP_MID_RUN_INPUT_CAPABILITY,
  CURSOR_ACP_PROVIDER_DECISION,
  CURSOR_ACP_SETTINGS_INFO,
  CURSOR_ACP_SKILLS_CAPABILITY,
  CURSOR_ACP_TELEMETRY_CAPABILITY,
  buildCursorUnavailableContextWindow,
  classifyCursorAcpMessage,
  formatCursorAcpModelLabel,
  getCursorAcpCurrentModeId,
  getCursorAcpCurrentModelId,
  getCursorAcpDefaultModelId,
  mapCursorApprovalToAcpOptionId,
  normalizeCursorAcpConfigOptions,
  normalizeCursorAcpModelOptions,
  normalizeCursorAcpProviderConfigOptions,
  parseCursorAcpContextWindowTokens,
  parseCursorAcpModelId,
  redactCursorAcpPayload,
} from './cursor-acp-contract.pure'

const SESSION_NEW_FIXTURE = {
  sessionId: 'cursor-session-1',
  modes: {
    currentModeId: 'agent',
    availableModes: [
      { id: 'agent', name: 'Agent' },
      { id: 'plan', name: 'Plan' },
      { id: 'ask', name: 'Ask' },
    ],
  },
  models: {
    currentModelId: 'default[]',
    availableModels: [
      { id: 'default[]', name: 'Auto' },
      { id: 'composer-2.5[fast=true]', name: 'Composer 2.5 Fast' },
    ],
  },
  configOptions: [
    {
      id: 'mode',
      label: 'Mode',
      currentValue: 'agent',
      options: [
        { value: 'agent', label: 'Agent' },
        { value: 'plan', label: 'Plan' },
        { value: 'ask', label: 'Ask' },
      ],
    },
    {
      id: 'model',
      label: 'Model',
      currentValue: 'default[]',
      options: [
        { value: 'default[]', label: 'Auto' },
        {
          value: 'composer-2.5[fast=true]',
          label: 'Composer 2.5 Fast',
        },
        {
          value:
            'claude-opus-4-8[thinking=true,context=300k,effort=high,fast=false]',
          label: 'Claude Opus 4.8 Thinking High',
        },
        {
          value: 'gpt-5.3-codex[reasoning=medium,fast=false]',
          label: 'GPT-5.3 Codex',
        },
      ],
    },
  ],
}

describe('cursor ACP contract helpers', () => {
  it('parses Cursor ACP model ids without inventing separate effort options', () => {
    expect(
      parseCursorAcpModelId(
        'claude-opus-4-8[thinking=true,context=300k,effort=high,fast=false]',
      ),
    ).toEqual({
      raw: 'claude-opus-4-8[thinking=true,context=300k,effort=high,fast=false]',
      baseId: 'claude-opus-4-8',
      params: {
        thinking: 'true',
        context: '300k',
        effort: 'high',
        fast: 'false',
      },
    })

    expect(
      formatCursorAcpModelLabel(
        'claude-opus-4-8[thinking=true,context=300k,effort=high,fast=false]',
      ),
    ).toBe('Claude Opus 4 8 (thinking, 300k, high effort, standard)')
    expect(
      parseCursorAcpContextWindowTokens(
        'claude-opus-4-8[thinking=true,context=300k,effort=high,fast=false]',
      ),
    ).toBe(300_000)
  })

  it('normalizes config options and model options from session/new', () => {
    expect(getCursorAcpCurrentModeId(SESSION_NEW_FIXTURE)).toBe('agent')
    expect(getCursorAcpCurrentModelId(SESSION_NEW_FIXTURE)).toBe('default[]')
    expect(getCursorAcpDefaultModelId(SESSION_NEW_FIXTURE)).toBe('default[]')

    expect(normalizeCursorAcpConfigOptions(SESSION_NEW_FIXTURE)).toMatchObject([
      {
        id: 'mode',
        currentValue: 'agent',
        options: [
          { id: 'agent', label: 'Agent' },
          { id: 'plan', label: 'Plan' },
          { id: 'ask', label: 'Ask' },
        ],
      },
      {
        id: 'model',
        currentValue: 'default[]',
      },
    ])

    expect(normalizeCursorAcpModelOptions(SESSION_NEW_FIXTURE)).toEqual([
      {
        id: 'default[]',
        label: 'Auto',
        defaultEffort: null,
        effortOptions: [],
        inputModalities: ['text'],
        source: 'provider',
      },
      {
        id: 'composer-2.5[fast=true]',
        label: 'Composer 2.5 Fast',
        description: 'fast',
        defaultEffort: null,
        effortOptions: [],
        inputModalities: ['text'],
        source: 'provider',
      },
      {
        id: 'claude-opus-4-8[thinking=true,context=300k,effort=high,fast=false]',
        label: 'Claude Opus 4.8 Thinking High',
        description: 'thinking · high effort · standard',
        contextWindowTokens: 300_000,
        defaultEffort: null,
        effortOptions: [],
        inputModalities: ['text'],
        source: 'provider',
      },
      {
        id: 'gpt-5.3-codex[reasoning=medium,fast=false]',
        label: 'GPT-5.3 Codex',
        description: 'medium reasoning · standard',
        defaultEffort: null,
        effortOptions: [],
        inputModalities: ['text'],
        source: 'provider',
      },
    ])
  })

  it('falls back to models.availableModels when configOptions are unavailable', () => {
    expect(
      normalizeCursorAcpModelOptions({
        models: SESSION_NEW_FIXTURE.models,
      }),
    ).toEqual([
      {
        id: 'default[]',
        label: 'Auto',
        defaultEffort: null,
        effortOptions: [],
        inputModalities: ['text'],
        source: 'provider',
      },
      {
        id: 'composer-2.5[fast=true]',
        label: 'Composer 2.5 Fast',
        description: 'fast',
        defaultEffort: null,
        effortOptions: [],
        inputModalities: ['text'],
        source: 'provider',
      },
    ])
  })

  it('normalizes Cursor provider config metadata without adding unsupported options', () => {
    expect(
      normalizeCursorAcpProviderConfigOptions(SESSION_NEW_FIXTURE),
    ).toEqual([
      expect.objectContaining({
        id: 'mode',
        label: 'Mode',
        currentValue: 'agent',
        persistence: 'session',
        method: 'session/set_mode',
        options: [
          { id: 'agent', label: 'Agent' },
          { id: 'plan', label: 'Plan' },
          { id: 'ask', label: 'Ask' },
        ],
      }),
      expect.objectContaining({
        id: 'model',
        label: 'Model',
        currentValue: 'default[]',
        persistence: 'session',
        method: 'session/set_config_option',
      }),
    ])
  })

  it('represents Cursor context usage as unavailable unless token usage is reported', () => {
    expect(
      buildCursorUnavailableContextWindow(
        'claude-opus-4-8[context=300k,fast=false]',
      ),
    ).toEqual({
      availability: 'unavailable',
      source: 'estimated',
      reason:
        'Cursor ACP reports a 300,000 token context tier for the selected model, but does not expose per-turn token usage to Convergence.',
    })

    expect(buildCursorUnavailableContextWindow('default[]')).toEqual({
      availability: 'unavailable',
      source: 'provider',
      reason:
        'Cursor ACP does not expose reliable context-window usage to Convergence for this session.',
    })
  })

  it('classifies ACP responses, server requests, and session updates', () => {
    expect(
      classifyCursorAcpMessage({
        jsonrpc: '2.0',
        id: 1,
        result: { protocolVersion: 1 },
      }),
    ).toBe('response')

    expect(
      classifyCursorAcpMessage({
        jsonrpc: '2.0',
        id: 2,
        method: 'session/request_permission',
        params: {
          sessionId: 'cursor-session-1',
          options: [{ optionId: 'allow-once' }],
        },
      }),
    ).toBe('permission-request')

    expect(
      classifyCursorAcpMessage({
        jsonrpc: '2.0',
        method: 'session/update',
        params: {
          sessionId: 'cursor-session-1',
          update: {
            sessionUpdate: 'agent_message_chunk',
            content: { type: 'text', text: 'hello' },
          },
        },
      }),
    ).toBe('assistant-message-chunk')

    expect(
      classifyCursorAcpMessage({
        jsonrpc: '2.0',
        method: 'session/update',
        params: {
          sessionId: 'cursor-session-1',
          update: {
            sessionUpdate: 'agent_thought_chunk',
            content: { type: 'text', text: 'thinking' },
          },
        },
      }),
    ).toBe('thinking-chunk')

    expect(
      classifyCursorAcpMessage({
        jsonrpc: '2.0',
        method: 'session/update',
        params: {
          sessionUpdate: 'tool_call_update',
          toolCallId: 'tool-1',
          status: 'completed',
        },
      }),
    ).toBe('tool-call-update')

    expect(
      classifyCursorAcpMessage({
        jsonrpc: '2.0',
        id: 3,
        method: 'cursor/ask_question',
        params: { question: 'Continue?' },
      }),
    ).toBe('cursor-ask-question')
  })

  it('maps Convergence approval decisions to conservative Cursor ACP options', () => {
    expect(mapCursorApprovalToAcpOptionId(true)).toBe('allow-once')
    expect(mapCursorApprovalToAcpOptionId(false)).toBe('reject-once')
  })

  it('redacts account data and summarizes raw tool payloads', () => {
    const redacted = redactCursorAcpPayload(
      {
        method: 'session/update',
        params: {
          email: 'person@example.com',
          accessToken: 'secret-token',
          update: {
            sessionUpdate: 'tool_call_update',
            rawInput: { command: 'pwd' },
            rawOutput: {
              content: 'x'.repeat(80),
              status: 'completed',
            },
          },
          commands: Array.from({ length: 4 }, (_, index) => ({
            name: `command-${index}`,
          })),
        },
      },
      { maxStringLength: 32, maxArrayItems: 2 },
    )

    expect(redacted).toEqual({
      method: 'session/update',
      params: {
        email: '[redacted]',
        accessToken: '[redacted]',
        update: {
          sessionUpdate: 'tool_call_update',
          rawInput: {
            command: 'pwd',
          },
          rawOutput: {
            status: 'completed',
            contentPreview:
              'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx... [truncated 48 chars]',
            contentBytes: 80,
          },
        },
        commands: [
          { name: 'command-0' },
          { name: 'command-1' },
          '[truncated 2 items]',
        ],
      },
    })
  })

  it('summarizes prompt payloads without persisting prompt bodies', () => {
    const redacted = redactCursorAcpPayload({
      sessionId: 'cursor-session-1',
      prompt: [
        {
          type: 'text',
          text: 'secret user prompt',
        },
        {
          type: 'image',
          mimeType: 'image/png',
          data: 'base64-image-data',
        },
      ],
    })

    expect(JSON.stringify(redacted)).not.toContain('secret user prompt')
    expect(JSON.stringify(redacted)).not.toContain('base64-image-data')
    expect(redacted).toEqual({
      sessionId: 'cursor-session-1',
      prompt: {
        count: 2,
        parts: [
          {
            type: 'text',
            textBytes: 18,
          },
          {
            type: 'image',
            mimeType: 'image/png',
            dataBytes: 17,
          },
        ],
      },
    })
  })

  it('summarizes available command payloads before debug persistence', () => {
    expect(
      redactCursorAcpPayload(
        {
          update: {
            sessionUpdate: 'available_commands_update',
            availableCommands: [
              {
                name: 'review',
                description: 'Review current changes',
                input: { hint: 'scope to review' },
              },
              { name: 'commit', description: 'Prepare commit' },
              { name: 'plan', description: 'Create a plan' },
            ],
          },
        },
        { maxArrayItems: 2 },
      ),
    ).toEqual({
      update: {
        sessionUpdate: 'available_commands_update',
        availableCommands: {
          count: 3,
          commands: [
            {
              name: 'review',
              description: 'Review current changes',
              input: { hint: 'scope to review' },
            },
            {
              name: 'commit',
              description: 'Prepare commit',
            },
            '[truncated 1 commands]',
          ],
        },
      },
    })
  })

  it('encodes conservative P0 capability decisions for the first provider slice', () => {
    expect(CURSOR_ACP_PROVIDER_DECISION).toMatchObject({
      supportsContinuation: true,
      modelSelection: 'acp-advertised-options-only',
      modelConfigMutation: 'session-scoped-set-config-option-only',
      modeSettingMethod: 'session/set_mode',
      approvePermissionOptionId: 'allow-once',
      denyPermissionOptionId: 'reject-once',
      stopStrategy: 'terminate-acp-process-until-session-cancel-is-supported',
      quotaTelemetry: 'unavailable-from-acp-prompt-result',
      contextWindowTelemetry:
        'model-context-metadata-only-token-usage-unavailable',
    })

    expect(CURSOR_ACP_MID_RUN_INPUT_CAPABILITY).toMatchObject({
      supportsAnswer: true,
      supportsNativeFollowUp: false,
      supportsAppQueuedFollowUp: true,
      supportsSteer: false,
      supportsInterrupt: false,
      defaultRunningMode: 'follow-up',
    })

    expect(CURSOR_ACP_ATTACHMENT_CAPABILITY).toMatchObject({
      supportsImage: true,
      supportsText: true,
      supportsPdf: false,
    })

    expect(CURSOR_ACP_SKILLS_CAPABILITY).toMatchObject({
      catalog: 'native-rpc',
      invocation: 'native-command',
      activationConfirmation: 'none',
    })

    expect(CURSOR_ACP_INTERACTION_CAPABILITY).toMatchObject({
      inputRequests: ['choice', 'plan'],
      passiveUpdates: ['todos', 'task', 'generated-image'],
      unavailable: ['generated-image-artifact-rendering'],
    })

    expect(CURSOR_ACP_TELEMETRY_CAPABILITY).toMatchObject({
      contextWindow: { availability: 'partial', source: 'model-metadata' },
      quota: { availability: 'unavailable', source: 'manual' },
    })
    expect(CURSOR_ACP_SETTINGS_INFO.links?.[0]).toEqual({
      label: 'Cursor dashboard',
      url: 'https://cursor.com/dashboard',
    })
  })
})
