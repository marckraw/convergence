import { describe, expect, it } from 'vitest'
import type { ConversationItem } from '../conversation-item.types'
import type { ForkSummary } from './session-fork.types'
import {
  buildExtractionPrompt,
  extractArtifactsByRegex,
  mergeArtifacts,
  parseAndValidateSummary,
  renderFullSeed,
  renderSeedMarkdown,
  serializeConversationItems,
} from './session-fork.pure'

const sampleSummary: ForkSummary = {
  topic: 'Refactor auth middleware',
  decisions: [
    {
      text: 'Use JWT rotation',
      evidence: 'We should rotate JWTs on every request',
    },
  ],
  open_questions: ['Do we need refresh tokens?'],
  key_facts: [
    {
      text: 'Auth lives in middleware/auth.ts',
      evidence: 'middleware/auth.ts handles the login flow',
    },
  ],
  artifacts: {
    urls: ['https://example.com/docs'],
    file_paths: ['middleware/auth.ts:42'],
    repos: [],
    commands: ['npm test'],
    identifiers: ['#123'],
  },
  next_steps: ['Write the migration'],
}

describe('serializeConversationItems', () => {
  it('prefixes roles and collapses tool entries', () => {
    const items: ConversationItem[] = [
      {
        id: '1',
        sessionId: 's',
        sequence: 1,
        turnId: 't1',
        kind: 'message',
        state: 'complete',
        actor: 'user',
        text: 'hi',
        createdAt: 't1',
        updatedAt: 't1',
        providerMeta: {
          providerId: 'p',
          providerItemId: null,
          providerEventType: 'user',
        },
      },
      {
        id: '2',
        sessionId: 's',
        sequence: 2,
        turnId: 't1',
        kind: 'message',
        state: 'complete',
        actor: 'assistant',
        text: 'hello',
        createdAt: 't2',
        updatedAt: 't2',
        providerMeta: {
          providerId: 'p',
          providerItemId: null,
          providerEventType: 'assistant',
        },
      },
      {
        id: '3',
        sessionId: 's',
        sequence: 3,
        turnId: 't1',
        kind: 'tool-call',
        state: 'complete',
        toolName: 'bash',
        inputText: 'ls -la',
        createdAt: 't3',
        updatedAt: 't3',
        providerMeta: {
          providerId: 'p',
          providerItemId: null,
          providerEventType: 'tool-use',
        },
      },
      {
        id: '4',
        sessionId: 's',
        sequence: 4,
        turnId: 't1',
        kind: 'tool-result',
        state: 'complete',
        toolName: null,
        relatedItemId: null,
        outputText: 'file.ts',
        createdAt: 't4',
        updatedAt: 't4',
        providerMeta: {
          providerId: 'p',
          providerItemId: null,
          providerEventType: 'tool-result',
        },
      },
      {
        id: '5',
        sessionId: 's',
        sequence: 5,
        turnId: 't1',
        kind: 'note',
        state: 'complete',
        level: 'info',
        text: 'status: ok',
        createdAt: 't5',
        updatedAt: 't5',
        providerMeta: {
          providerId: 'p',
          providerItemId: null,
          providerEventType: 'system',
        },
      },
      {
        id: '6',
        sessionId: 's',
        sequence: 6,
        turnId: 't1',
        kind: 'approval-request',
        state: 'complete',
        description: 'run rm',
        createdAt: 't6',
        updatedAt: 't6',
        providerMeta: {
          providerId: 'p',
          providerItemId: null,
          providerEventType: 'approval-request',
        },
      },
      {
        id: '7',
        sessionId: 's',
        sequence: 7,
        turnId: 't1',
        kind: 'input-request',
        state: 'complete',
        prompt: 'name?',
        createdAt: 't7',
        updatedAt: 't7',
        providerMeta: {
          providerId: 'p',
          providerItemId: null,
          providerEventType: 'input-request',
        },
      },
    ]
    const out = serializeConversationItems(items)
    expect(out).toContain('user: hi')
    expect(out).toContain('assistant: hello')
    expect(out).toContain('[tool bash]')
    expect(out).toContain('[tool result]')
    expect(out).not.toContain('ls -la')
    expect(out).not.toContain('file.ts')
    expect(out).toContain('system: status: ok')
    expect(out).toContain('[approval requested: run rm]')
    expect(out).toContain('[input requested: name?]')
  })

  it('truncates very long text', () => {
    const items: ConversationItem[] = [
      {
        id: '1',
        sessionId: 's',
        sequence: 1,
        turnId: 't1',
        kind: 'message',
        state: 'complete',
        actor: 'user',
        text: 'x'.repeat(10000),
        createdAt: 't1',
        updatedAt: 't1',
        providerMeta: {
          providerId: 'p',
          providerItemId: null,
          providerEventType: 'user',
        },
      },
    ]
    const out = serializeConversationItems(items)
    expect(out.length).toBeLessThan(10000)
    expect(out).toContain('…')
  })
})

describe('buildExtractionPrompt', () => {
  it('includes transcript and schema hint', () => {
    const prompt = buildExtractionPrompt('user: hello')
    expect(prompt).toContain('Transcript:')
    expect(prompt).toContain('user: hello')
    expect(prompt).toContain('"decisions"')
    expect(prompt).toContain('"artifacts"')
  })
})

describe('parseAndValidateSummary', () => {
  function validJson(): string {
    return JSON.stringify(sampleSummary)
  }

  it('accepts a valid JSON payload', () => {
    const result = parseAndValidateSummary(validJson())
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.topic).toBe('Refactor auth middleware')
      expect(result.value.decisions).toHaveLength(1)
    }
  })

  it('strips markdown code fences', () => {
    const raw = '```json\n' + validJson() + '\n```'
    const result = parseAndValidateSummary(raw)
    expect(result.ok).toBe(true)
  })

  it('rejects invalid JSON', () => {
    const result = parseAndValidateSummary('not json {')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.kind).toBe('parse')
  })

  it('rejects missing topic', () => {
    const bad = { ...sampleSummary, topic: '' }
    const result = parseAndValidateSummary(JSON.stringify(bad))
    expect(result.ok).toBe(false)
    if (!result.ok && result.error.kind === 'schema') {
      expect(result.error.field).toBe('topic')
    } else {
      throw new Error('expected schema error')
    }
  })

  it('rejects decisions with missing evidence', () => {
    const bad = {
      ...sampleSummary,
      decisions: [{ text: 'something' }],
    }
    const result = parseAndValidateSummary(JSON.stringify(bad))
    expect(result.ok).toBe(false)
    if (!result.ok && result.error.kind === 'schema') {
      expect(result.error.field).toBe('decisions')
    } else {
      throw new Error('expected schema error')
    }
  })

  it('rejects wrong artifact shape', () => {
    const bad = {
      ...sampleSummary,
      artifacts: { ...sampleSummary.artifacts, urls: 'not an array' },
    }
    const result = parseAndValidateSummary(JSON.stringify(bad))
    expect(result.ok).toBe(false)
    if (!result.ok && result.error.kind === 'schema') {
      expect(result.error.field).toBe('artifacts.urls')
    } else {
      throw new Error('expected schema error')
    }
  })

  it('accepts empty arrays', () => {
    const empty: ForkSummary = {
      topic: 'x',
      decisions: [],
      open_questions: [],
      key_facts: [],
      artifacts: {
        urls: [],
        file_paths: [],
        repos: [],
        commands: [],
        identifiers: [],
      },
      next_steps: [],
    }
    const result = parseAndValidateSummary(JSON.stringify(empty))
    expect(result.ok).toBe(true)
  })
})

describe('extractArtifactsByRegex', () => {
  it('finds URLs', () => {
    const text =
      'see https://example.com/docs and http://foo.bar/baz for details'
    const out = extractArtifactsByRegex(text)
    expect(out.urls).toContain('https://example.com/docs')
    expect(out.urls).toContain('http://foo.bar/baz')
  })

  it('deduplicates URLs', () => {
    const text = 'https://a.com and https://a.com again'
    const out = extractArtifactsByRegex(text)
    expect(out.urls).toEqual(['https://a.com'])
  })

  it('finds file paths with line refs', () => {
    const text = 'look at src/foo/bar.ts:42 and ./utils.ts'
    const out = extractArtifactsByRegex(text)
    expect(out.file_paths.some((p) => p.includes('src/foo/bar.ts:42'))).toBe(
      true,
    )
  })

  it('finds github repo slugs', () => {
    const text = 'clone github.com/owner/repo and also gitlab.com/x/y'
    const out = extractArtifactsByRegex(text)
    expect(out.repos.some((r) => r.includes('github.com/owner/repo'))).toBe(
      true,
    )
    expect(out.repos.some((r) => r.includes('gitlab.com/x/y'))).toBe(true)
  })

  it('finds identifiers', () => {
    const text = 'closes #1234 and ABC-567'
    const out = extractArtifactsByRegex(text)
    expect(out.identifiers).toContain('#1234')
    expect(out.identifiers).toContain('ABC-567')
  })

  it('does not misclassify URL fragments as file paths', () => {
    const text = 'see https://example.com/some/path.html here'
    const out = extractArtifactsByRegex(text)
    expect(out.file_paths).toEqual([])
  })
})

describe('mergeArtifacts', () => {
  it('unions and dedupes', () => {
    const llm = {
      urls: ['https://a.com'],
      file_paths: ['foo.ts'],
      repos: [],
      commands: ['npm test'],
      identifiers: [],
    }
    const regex = {
      urls: ['https://a.com', 'https://b.com'],
      file_paths: ['bar.ts'],
      repos: ['github.com/x/y'],
      commands: [],
      identifiers: ['#42'],
    }
    const out = mergeArtifacts(llm, regex)
    expect(out.urls).toEqual(['https://a.com', 'https://b.com'])
    expect(out.file_paths).toEqual(['foo.ts', 'bar.ts'])
    expect(out.repos).toEqual(['github.com/x/y'])
    expect(out.commands).toEqual(['npm test'])
    expect(out.identifiers).toEqual(['#42'])
  })
})

describe('renderSeedMarkdown', () => {
  it('renders all sections', () => {
    const md = renderSeedMarkdown({
      summary: sampleSummary,
      parentName: 'Parent session',
      additionalInstruction: null,
    })
    expect(md).toContain('This session is a fork of "Parent session"')
    expect(md).toContain('**Topic:** Refactor auth middleware')
    expect(md).toContain('**Decisions made so far:**')
    expect(md).toContain('Use JWT rotation')
    expect(md).toContain('**Key facts established:**')
    expect(md).toContain('**Open questions:**')
    expect(md).toContain('**Relevant artifacts:**')
    expect(md).toContain('**Suggested next steps:**')
    expect(md).toContain('Continue from here.')
  })

  it('omits empty sections', () => {
    const minimal: ForkSummary = {
      topic: 'x',
      decisions: [],
      open_questions: [],
      key_facts: [],
      artifacts: {
        urls: [],
        file_paths: [],
        repos: [],
        commands: [],
        identifiers: [],
      },
      next_steps: [],
    }
    const md = renderSeedMarkdown({
      summary: minimal,
      parentName: 'P',
      additionalInstruction: null,
    })
    expect(md).not.toContain('**Decisions made so far:**')
    expect(md).not.toContain('**Key facts established:**')
    expect(md).not.toContain('**Relevant artifacts:**')
    expect(md).not.toContain('**Suggested next steps:**')
  })

  it('uses additional instruction when provided', () => {
    const md = renderSeedMarkdown({
      summary: sampleSummary,
      parentName: 'P',
      additionalInstruction: 'Now make it faster.',
    })
    expect(md).toContain('Now make it faster.')
    expect(md).not.toContain('Continue from here.')
  })
})

describe('renderFullSeed', () => {
  it('wraps the serialized transcript with parent context and default tail', () => {
    const seed = renderFullSeed({
      serializedTranscript: 'user: hi\n\nassistant: hey',
      parentName: 'Parent session',
      additionalInstruction: null,
    })
    expect(seed).toContain('This session is a fork of "Parent session"')
    expect(seed).toContain('user: hi')
    expect(seed).toContain('assistant: hey')
    expect(seed).toContain('---')
    expect(seed).toContain('Continue from here.')
  })

  it('uses additional instruction when provided', () => {
    const seed = renderFullSeed({
      serializedTranscript: 'user: hi',
      parentName: 'P',
      additionalInstruction: 'Also consider security.',
    })
    expect(seed).toContain('Also consider security.')
    expect(seed).not.toContain('Continue from here.')
  })
})
