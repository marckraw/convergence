import { describe, expect, it } from 'vitest'
import {
  buildClaudeDescriptor,
  buildEffortOptions,
  parseReasoningEffort,
  buildFallbackAntigravityDescriptor,
  buildFallbackCodexDescriptor,
  buildFallbackCursorDescriptor,
  buildFallbackPiDescriptor,
  CODEX_ATTACHMENT_CAPABILITY,
  CODEX_MID_RUN_INPUT_CAPABILITY,
  getMidRunInputCapabilityForProviderId,
  NO_MID_RUN_INPUT_CAPABILITY,
  normalizeProviderDescriptor,
} from './provider-descriptor.pure'

describe('provider-descriptor', () => {
  it('advertises Codex, Pi and Cursor reset and keeps Antigravity unsupported — disable Codex, Pi or Cursor, or enable Antigravity, turns red', () => {
    expect({
      codex: buildFallbackCodexDescriptor().supportsConversationReset,
      pi: buildFallbackPiDescriptor().supportsConversationReset,
      cursor: buildFallbackCursorDescriptor().supportsConversationReset,
      antigravity:
        buildFallbackAntigravityDescriptor().supportsConversationReset,
    }).toEqual({ codex: true, pi: true, cursor: true, antigravity: false })
  })
  it('builds labeled effort options', () => {
    expect(
      buildEffortOptions(['minimal', 'high'], { high: 'Deep reasoning' }),
    ).toEqual([
      { id: 'minimal', label: 'Minimal', description: undefined },
      { id: 'high', label: 'High', description: 'Deep reasoning' },
    ])
  })

  it('returns the expected built-in provider descriptors', () => {
    expect(buildClaudeDescriptor().vendorLabel).toBe('Anthropic')
    expect(buildFallbackCodexDescriptor().vendorLabel).toBe('OpenAI')
    expect(buildFallbackPiDescriptor().vendorLabel).toBe('Pi')
    expect(buildFallbackCursorDescriptor().vendorLabel).toBe('Anysphere')
    expect(buildFallbackAntigravityDescriptor().vendorLabel).toBe('Google')
    expect(buildClaudeDescriptor().skills).toEqual({
      catalog: 'filesystem',
      invocation: 'native-command',
      activationConfirmation: 'native-event',
    })
    expect(buildFallbackCodexDescriptor().skills).toEqual({
      catalog: 'native-rpc',
      invocation: 'structured-input',
      activationConfirmation: 'none',
    })
    expect(buildFallbackPiDescriptor().skills).toEqual({
      catalog: 'filesystem',
      invocation: 'native-command',
      activationConfirmation: 'none',
    })
    expect(buildFallbackCursorDescriptor().skills).toEqual({
      catalog: 'native-rpc',
      invocation: 'native-command',
      activationConfirmation: 'none',
    })
    expect(buildFallbackAntigravityDescriptor().skills).toEqual({
      catalog: 'filesystem',
      invocation: 'native-command',
      activationConfirmation: 'none',
    })
    expect(
      buildFallbackCodexDescriptor().contextManagement?.compact,
    ).toMatchObject({ availability: 'available', method: 'native-rpc' })
    expect(
      buildFallbackPiDescriptor().contextManagement?.compact,
    ).toMatchObject({ availability: 'available', method: 'native-rpc' })
    expect(buildClaudeDescriptor().contextManagement?.compact).toMatchObject({
      availability: 'runtime-check',
      method: 'slash-command',
    })
    expect(
      buildFallbackCursorDescriptor().contextManagement?.compact,
    ).toMatchObject({
      availability: 'unavailable',
      method: 'unsupported',
    })
    expect(
      buildFallbackAntigravityDescriptor().contextManagement?.compact,
    ).toMatchObject({ availability: 'unavailable', method: 'unsupported' })
  })

  // Two rows reading exactly the same thing is unpickable: the user cannot
  // tell which one they are choosing. Guarding every catalog, not just
  // Claude's, so an alias added later cannot reintroduce it.
  it('never shows two model options with the same label', () => {
    const descriptors = {
      claude: buildClaudeDescriptor(),
      codex: buildFallbackCodexDescriptor(),
      pi: buildFallbackPiDescriptor(),
      cursor: buildFallbackCursorDescriptor(),
      antigravity: buildFallbackAntigravityDescriptor(),
    }

    for (const [name, descriptor] of Object.entries(descriptors)) {
      const labels = descriptor.modelOptions.map((option) => option.label)
      const duplicates = labels.filter(
        (label, index) => labels.indexOf(label) !== index,
      )
      expect(`${name}: ${duplicates.join(', ')}`).toBe(`${name}: `)
    }
  })

  it('exposes current Claude Code aliases and pinned Anthropic model IDs', () => {
    const descriptor = buildClaudeDescriptor()

    expect(descriptor.defaultModelId).toBe('opus')
    expect(descriptor.fastModelId).toBe('haiku')
    expect(descriptor.modelOptions.map((option) => option.id)).toEqual([
      'best',
      'fable',
      'sonnet',
      'opus',
      'haiku',
      'claude-fable-5-1',
      'claude-fable-5',
      'claude-opus-5-5',
      'claude-opus-5',
      'claude-sonnet-5',
      'claude-opus-4-8',
      'claude-sonnet-4-6',
      'claude-opus-4-7',
      'claude-opus-4-6',
      'claude-haiku-4-5',
    ])
    expect(
      descriptor.modelOptions.find((option) => option.id === 'fable'),
    ).toMatchObject({
      label: 'Claude Fable',
      contextWindowTokens: 1_000_000,
      defaultEffort: 'high',
      effortOptions: [
        { id: 'low', label: 'Low' },
        { id: 'medium', label: 'Medium' },
        { id: 'high', label: 'High' },
        { id: 'xhigh', label: 'Very High' },
        { id: 'max', label: 'Max' },
      ],
    })
    expect(
      descriptor.modelOptions.find(
        (option) => option.id === 'claude-fable-5-1',
      ),
    ).toMatchObject({
      label: 'Claude Fable 5.1',
      contextWindowTokens: 1_000_000,
      defaultEffort: 'high',
      effortOptions: [
        { id: 'low', label: 'Low' },
        { id: 'medium', label: 'Medium' },
        { id: 'high', label: 'High' },
        { id: 'xhigh', label: 'Very High' },
        { id: 'max', label: 'Max' },
      ],
    })
    expect(
      descriptor.modelOptions.find((option) => option.id === 'claude-opus-5-5'),
    ).toMatchObject({
      label: 'Claude Opus 5.5',
      contextWindowTokens: 1_000_000,
      defaultEffort: 'medium',
      effortOptions: [
        { id: 'low', label: 'Low' },
        { id: 'medium', label: 'Medium' },
        { id: 'high', label: 'High' },
        { id: 'xhigh', label: 'Very High' },
        { id: 'max', label: 'Max' },
      ],
    })
    expect(
      descriptor.modelOptions.find((option) => option.id === 'opus'),
    ).toMatchObject({
      label: 'Claude Opus',
      description: 'Alias for the latest Opus (currently Opus 5.5).',
      contextWindowTokens: 1_000_000,
      defaultEffort: 'medium',
      effortOptions: [
        { id: 'low', label: 'Low' },
        { id: 'medium', label: 'Medium' },
        { id: 'high', label: 'High' },
        { id: 'xhigh', label: 'Very High' },
        { id: 'max', label: 'Max' },
      ],
    })
    expect(
      descriptor.modelOptions.find((option) => option.id === 'claude-opus-5'),
    ).toMatchObject({
      label: 'Claude Opus 5',
      contextWindowTokens: 1_000_000,
      defaultEffort: 'high',
      effortOptions: [
        { id: 'low', label: 'Low' },
        { id: 'medium', label: 'Medium' },
        { id: 'high', label: 'High' },
        { id: 'xhigh', label: 'Very High' },
        { id: 'max', label: 'Max' },
      ],
    })
    expect(
      descriptor.modelOptions.find((option) => option.id === 'claude-opus-4-8'),
    ).toMatchObject({
      label: 'Claude Opus 4.8',
      contextWindowTokens: 1_000_000,
      defaultEffort: 'high',
    })
    expect(
      descriptor.modelOptions.find((option) => option.id === 'claude-sonnet-5'),
    ).toMatchObject({
      label: 'Claude Sonnet 5',
      contextWindowTokens: 1_000_000,
      defaultEffort: 'medium',
    })
  })

  it('builds a conservative Cursor fallback descriptor from P0 ACP decisions', () => {
    const descriptor = buildFallbackCursorDescriptor()

    expect(descriptor).toMatchObject({
      id: 'cursor',
      name: 'Cursor',
      supportsContinuation: true,
      supportsConversationReset: true,
      defaultModelId: 'default[]',
      attachments: {
        supportsImage: true,
        supportsPdf: false,
        supportsText: true,
      },
      midRunInput: {
        supportsAnswer: true,
        supportsNativeFollowUp: false,
        supportsAppQueuedFollowUp: true,
        supportsSteer: false,
        supportsInterrupt: true,
      },
      interactions: {
        inputRequests: ['choice', 'plan'],
        passiveUpdates: ['todos', 'task', 'generated-image'],
        unavailable: ['generated-image-artifact-rendering'],
      },
      telemetry: {
        contextWindow: { availability: 'partial', source: 'model-metadata' },
        quota: { availability: 'unavailable', source: 'manual' },
      },
    })
    expect(descriptor.settings?.links?.[0]).toEqual({
      label: 'Cursor dashboard',
      url: 'https://cursor.com/dashboard',
    })
    expect(descriptor.modelOptions).toEqual([
      {
        id: 'default[]',
        label: 'Auto',
        defaultEffort: null,
        effortOptions: [],
        inputModalities: ['text', 'image'],
        source: 'provider',
      },
    ])
    expect(getMidRunInputCapabilityForProviderId('cursor')).toEqual(
      descriptor.midRunInput,
    )
  })

  // The renderer shows this exact string as the disabled Compact control's
  // reason (src/features/composer/context-compaction.pure.ts), so this reads
  // the descriptor a session is built from, not the module constant beside it.
  it('tells a Cursor conversation that compaction does not exist rather than promising its return (MAR-3153)', () => {
    const compact = buildFallbackCursorDescriptor().contextManagement?.compact

    expect(compact).toEqual({
      availability: 'unavailable',
      method: 'unsupported',
      supportsInstructions: false,
      notes:
        "Cursor's CLI has no compaction command, so Convergence cannot compact a Cursor conversation. Use /clear to start fresh when the context is full.",
    })
    // A promise of a comeback is the defect this pins, in any wording.
    expect(compact?.notes).not.toMatch(/temporarily/i)
    expect(compact?.notes).not.toMatch(/follow-up/i)
  })

  it('exposes pi-compatible effort options on the pi fallback descriptor', () => {
    const descriptor = buildFallbackPiDescriptor()
    const effortIds = descriptor.modelOptions[0]?.effortOptions.map(
      (option) => option.id,
    )
    expect(effortIds).toEqual([
      'none',
      'minimal',
      'low',
      'medium',
      'high',
      'xhigh',
    ])
  })

  it('labels the ultra reasoning effort', () => {
    expect(buildEffortOptions(['max', 'ultra'])).toEqual([
      { id: 'max', label: 'Max', description: undefined },
      { id: 'ultra', label: 'Ultra (multi-agent)', description: undefined },
    ])
  })

  // Fixture: `model/list` tape probed from codex-cli 0.156.0 on 2026-09-22
  // (MAR-3320, `includeHidden: false`, `limit: 100`). No row advertises `none`.
  // The tape has no context-window field; retain the 272k convention pending
  // live-turn measurement in MAR-3330.
  it('mirrors the live codex 0.156.0 model/list tape in the fallback catalog', () => {
    const descriptor = buildFallbackCodexDescriptor()

    expect(descriptor.defaultModelId).toBe('gpt-6-astra')
    expect(descriptor.fastModelId).toBe('gpt-6-luna')
    expect(
      descriptor.modelOptions.map((option) => ({
        id: option.id,
        defaultEffort: option.defaultEffort,
        efforts: option.effortOptions.map((effort) => effort.id),
        inputModalities: option.inputModalities,
        contextWindowTokens: option.contextWindowTokens,
      })),
    ).toEqual([
      {
        id: 'gpt-6-astra',
        defaultEffort: 'medium',
        efforts: ['low', 'medium', 'high', 'xhigh', 'max', 'ultra'],
        inputModalities: ['text', 'image'],
        contextWindowTokens: 272_000,
      },
      {
        id: 'gpt-6-sol',
        defaultEffort: 'medium',
        efforts: ['low', 'medium', 'high', 'xhigh', 'max', 'ultra'],
        inputModalities: ['text', 'image'],
        contextWindowTokens: 272_000,
      },
      {
        id: 'gpt-6-luna',
        defaultEffort: 'medium',
        efforts: ['low', 'medium', 'high', 'xhigh', 'max'],
        inputModalities: ['text', 'image'],
        contextWindowTokens: 272_000,
      },
      {
        id: 'gpt-5.6-sol',
        defaultEffort: 'low',
        efforts: ['low', 'medium', 'high', 'xhigh', 'max', 'ultra'],
        inputModalities: ['text', 'image'],
        contextWindowTokens: 272_000,
      },
      {
        id: 'gpt-5.6-terra',
        defaultEffort: 'medium',
        efforts: ['low', 'medium', 'high', 'xhigh', 'max', 'ultra'],
        inputModalities: ['text', 'image'],
        contextWindowTokens: 272_000,
      },
      {
        id: 'gpt-5.6-luna',
        defaultEffort: 'medium',
        efforts: ['low', 'medium', 'high', 'xhigh', 'max'],
        inputModalities: ['text', 'image'],
        contextWindowTokens: 272_000,
      },
      {
        id: 'gpt-5.5',
        defaultEffort: 'medium',
        efforts: ['low', 'medium', 'high', 'xhigh'],
        inputModalities: ['text', 'image'],
        contextWindowTokens: 272_000,
      },
    ])
    expect(
      descriptor.modelOptions.some((option) =>
        option.effortOptions.some((effort) => effort.id === 'none'),
      ),
    ).toBe(false)
    expect(descriptor.modelOptions[0]).toMatchObject({
      label: 'GPT-6 Astra',
      description: 'Our most capable model for complex, demanding work.',
    })
    expect(descriptor.modelOptions[1]).toMatchObject({
      label: 'GPT-6 Sol',
      description: 'Built to power complex coding and agentic workflows.',
    })
    expect(descriptor.modelOptions[2]).toMatchObject({
      label: 'GPT-6 Luna',
      description: 'Our most efficient model for focused, high-volume tasks.',
    })
  })

  it('exposes Antigravity official models as model + effort options', () => {
    const descriptor = buildFallbackAntigravityDescriptor()

    expect(descriptor).toMatchObject({
      id: 'antigravity',
      name: 'Antigravity CLI',
      defaultModelId: 'gemini-3.5-flash',
      fastModelId: 'gemini-3.5-flash',
      attachments: {
        supportsImage: false,
        supportsPdf: false,
        supportsText: true,
      },
      midRunInput: {
        supportsAnswer: false,
        supportsNativeFollowUp: false,
        supportsAppQueuedFollowUp: true,
        supportsSteer: false,
        supportsInterrupt: false,
      },
    })
    expect(descriptor.modelOptions.map((option) => option.id)).toEqual([
      'gemini-3.1-pro',
      'gemini-3.5-flash',
      'gemini-3-flash',
      'claude-sonnet-4.6-thinking',
      'claude-opus-4.6-thinking',
      'gpt-oss-120b',
    ])
  })

  it('normalizes invalid default model and effort values', () => {
    const normalized = normalizeProviderDescriptor({
      id: 'codex',
      name: 'Codex',
      vendorLabel: 'OpenAI',
      kind: 'conversation',
      supportsContinuation: true,
      supportsConversationReset: false,
      defaultModelId: 'missing',
      modelOptions: [
        {
          id: 'gpt-5.4',
          label: 'GPT-5.4',
          defaultEffort: 'xhigh',
          effortOptions: [
            { id: 'low', label: 'Low' },
            { id: 'medium', label: 'Medium' },
          ],
        },
      ],
      attachments: CODEX_ATTACHMENT_CAPABILITY,
      midRunInput: CODEX_MID_RUN_INPUT_CAPABILITY,
    })

    expect(normalized.defaultModelId).toBe('gpt-5.4')
    expect(normalized.modelOptions[0]?.defaultEffort).toBe('medium')
    expect(normalized.midRunInput).toEqual(CODEX_MID_RUN_INPUT_CAPABILITY)
    expect(normalized.skills).toEqual({
      catalog: 'unsupported',
      invocation: 'unsupported',
      activationConfirmation: 'none',
    })
  })

  it('defaults unsupported mid-run input capability when normalizing legacy descriptors', () => {
    const normalized = normalizeProviderDescriptor({
      id: 'legacy',
      name: 'Legacy',
      vendorLabel: 'Legacy',
      kind: 'conversation',
      supportsContinuation: false,
      supportsConversationReset: false,
      defaultModelId: 'legacy',
      modelOptions: [],
      attachments: CODEX_ATTACHMENT_CAPABILITY,
      midRunInput: undefined as never,
    })

    expect(normalized.midRunInput).toEqual(NO_MID_RUN_INPUT_CAPABILITY)
  })
})

describe('parseReasoningEffort (MAR-2550)', () => {
  /**
   * Derived from the descriptors themselves rather than a copied list: if a
   * provider offers a level, that level must survive the boundary. A hand-kept
   * array here would be the very drift MAR-2034 cost us.
   */
  const offeredEfforts = [
    buildClaudeDescriptor(),
    buildFallbackCodexDescriptor(),
    buildFallbackPiDescriptor(),
    buildFallbackCursorDescriptor(),
    buildFallbackAntigravityDescriptor(),
  ].flatMap((descriptor) =>
    descriptor.modelOptions.flatMap((model) =>
      model.effortOptions.map((option) => option.id),
    ),
  )

  it('accepts every effort a real provider descriptor offers', () => {
    expect(offeredEfforts.length).toBeGreaterThan(0)
    for (const effort of new Set(offeredEfforts)) {
      expect(parseReasoningEffort(effort)).toBe(effort)
    }
  })

  it('rejects anything the union does not declare', () => {
    expect(parseReasoningEffort('turbo')).toBeNull()
    expect(parseReasoningEffort('')).toBeNull()
    expect(parseReasoningEffort('toString')).toBeNull()
    expect(parseReasoningEffort(null)).toBeNull()
    expect(parseReasoningEffort(undefined)).toBeNull()
    expect(parseReasoningEffort(3)).toBeNull()
  })
})
