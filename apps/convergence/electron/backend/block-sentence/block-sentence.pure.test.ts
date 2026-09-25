import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import fixtures from '../../../tools/spikes/block-summary/fixtures.json'
import type { ConversationItem } from '../session/conversation-item.types'
import {
  acceptBlockSentence,
  assembleBlockPrompt,
  blockRecords,
  BLOCK_PROMPT_MAX_BYTES,
  BLOCK_RECORD_TEXT_MAX_CHARS,
  blockRecordsFromItems,
  buildBlockPrompt,
  deriveBlockTruth,
  promptProviderName,
  readPathTokens,
  truthCheck,
  unwrapShellCommand,
  type BlockPrompt,
  type BlockRecord,
} from './block-sentence.pure'

const promptText = readFileSync(
  new URL('./block-sentence.prompt.txt', import.meta.url),
  'utf8',
)

function base(
  id: string,
  providerEventType: string | null = null,
  providerId = 'codex',
) {
  return {
    id,
    sessionId: 's',
    sequence: 1,
    turnId: 't',
    state: 'complete' as const,
    createdAt: '2026-09-25T00:00:00.000Z',
    updatedAt: '2026-09-25T00:00:00.000Z',
    providerMeta: {
      providerId,
      providerItemId: null,
      providerEventType,
    },
  }
}

type Fixture = (typeof fixtures)[number]
const fixture = (id: string): Fixture =>
  fixtures.find((block) => block.id === id)!

/** A Claude Code Read as the app records it: an absolute `file_path`. */
function claudeRead(id: string, filePath: string): ConversationItem {
  return {
    ...base(id, 'tool-use', 'claude-code'),
    kind: 'tool-call',
    toolName: 'Read',
    inputText: JSON.stringify({ file_path: filePath }, null, 2),
  }
}

/**
 * A Codex step exactly as `codex-provider.ts` records a `commandExecution`:
 * `toolName` is the command as Codex sent it, and the output carries a
 * `"<command>: "` prefix.
 */
function codexCommand(
  id: string,
  command: string,
  output: string,
): ConversationItem {
  return {
    ...base(id, 'commandExecution'),
    kind: 'tool-result',
    toolName: command,
    relatedItemId: null,
    outputText: `${command}: ${output}`,
  }
}

describe('the prompt is the spike prompt (A3)', () => {
  it("keeps CV2b's prompt bytes", () => {
    expect(
      createHash('sha256')
        .update(
          readFileSync(new URL('./block-sentence.prompt.txt', import.meta.url)),
        )
        .digest('hex'),
    ).toBe('3021f53220e111d7a242f3cbec7f982581d941a15befc316d388da08503812c8')
  })

  it('assembles as run.mjs does: prompt, newline, then the JSON', () => {
    const records: BlockRecord[] = [
      { type: 'tool-call', toolName: 'Read', inputText: '{"path":"a.ts"}' },
    ]
    expect(assembleBlockPrompt(promptText, 'claude', records)).toBe(
      `${promptText}\n${JSON.stringify({ provider: 'claude', items: records })}`,
    )
  })
})

describe('the truth set is the spike truth set (A3)', () => {
  it('gives the 20 fixture blocks exactly the truth sets in fixtures.json', () => {
    expect(fixtures).toHaveLength(20)
    for (const block of fixtures) {
      const records = block.items as BlockRecord[]
      expect(deriveBlockTruth(records), block.id).toEqual(block.truth)
      expect(
        buildBlockPrompt(promptText, block.provider, records)?.truth,
        block.id,
      ).toEqual(block.truth)
    }
  })
})

describe('caps: the truth set follows what was sent (A3)', () => {
  it('cuts each record to 2,000 characters and forgets paths past the cut', () => {
    const inputText = `${'x'.repeat(BLOCK_RECORD_TEXT_MAX_CHARS)} src/secret/beyond.ts`
    const built = buildBlockPrompt(promptText, 'claude', [
      { type: 'tool-call', toolName: 'Bash', inputText },
    ])!
    const sent = built.records[0]!
    expect(sent.type === 'tool-call' && sent.inputText.length).toBe(
      BLOCK_RECORD_TEXT_MAX_CHARS,
    )
    expect(built.prompt).not.toContain('src/secret/beyond.ts')
    expect(built.truth.paths).not.toContain('src/secret/beyond.ts')
    expect(built.truth.paths).not.toContain('beyond.ts')
    expect(
      acceptBlockSentence('Ran a command on src/secret/beyond.ts', built.truth),
    ).toBeNull()
  })

  it('drops records from the end until the prompt fits 16 KB', () => {
    const records: BlockRecord[] = Array.from({ length: 12 }, (_, index) => ({
      type: 'tool-call',
      toolName: 'Read',
      inputText: JSON.stringify({
        file_path: `src/part-${index}/file-${index}.ts`,
        pad: 'y'.repeat(1_900),
      }),
    }))
    const built = buildBlockPrompt(promptText, 'claude', records)!
    expect(new TextEncoder().encode(built.prompt).length).toBeLessThanOrEqual(
      BLOCK_PROMPT_MAX_BYTES,
    )
    expect(built.records.length).toBeGreaterThan(0)
    expect(built.records.length).toBeLessThan(records.length)
    expect(built.records).toEqual(records.slice(0, built.records.length))
    const lastSent = built.records.length - 1
    expect(built.truth.paths).toContain(
      `src/part-${lastSent}/file-${lastSent}.ts`,
    )
    const firstDropped = built.records.length
    expect(built.truth.paths).not.toContain(
      `src/part-${firstDropped}/file-${firstDropped}.ts`,
    )
    expect(built.truth.paths).not.toContain(`file-${firstDropped}.ts`)
  })

  it('sends nothing when not even one record fits', () => {
    expect(
      buildBlockPrompt('p'.repeat(BLOCK_PROMPT_MAX_BYTES), 'claude', [
        { type: 'tool-call', toolName: 'Read', inputText: '{}' },
      ]),
    ).toBeNull()
    expect(buildBlockPrompt(promptText, 'claude', [])).toBeNull()
  })
})

describe('one mapper from real items to the spike records (A3)', () => {
  it('sends calls and Codex step results, never thinking or answered results', () => {
    const items: ConversationItem[] = [
      {
        ...base('call'),
        kind: 'tool-call',
        toolName: 'Read',
        inputText: '{"file_path":"src/a.ts"}',
      },
      {
        ...base('answer'),
        kind: 'tool-result',
        toolName: 'Read',
        relatedItemId: 'call',
        outputText: 'contents of src/other.ts',
      },
      { ...base('think'), kind: 'thinking', actor: 'assistant', text: 'hmm' },
      {
        ...base('pi-result'),
        kind: 'tool-result',
        toolName: 'read',
        relatedItemId: null,
        outputText: 'unlinked pi output',
      },
      {
        ...base('codex', 'commandExecution'),
        kind: 'tool-result',
        toolName: 'ls src/shared',
        relatedItemId: null,
        outputText: 'lib\nui',
      },
    ]
    expect(blockRecordsFromItems(items)).toEqual([
      {
        type: 'tool-call',
        toolName: 'Read',
        inputText: '{"file_path":"src/a.ts"}',
      },
      { type: 'tool-result', toolName: 'ls src/shared', outputText: 'lib\nui' },
    ])
  })
})

describe('truth before storage (R3)', () => {
  const truth = deriveBlockTruth([
    {
      type: 'tool-call',
      toolName: 'Read',
      inputText: '{"file_path":"src/widgets/session-view/state.ts"}',
    },
  ])

  it('keeps a supported sentence, trimmed', () => {
    expect(
      acceptBlockSentence('  Read src/widgets/session-view/state.ts.  ', truth),
    ).toBe('Read src/widgets/session-view/state.ts.')
  })

  it('drops an invented path, a long line and two sentences', () => {
    expect(acceptBlockSentence('Read src/auth/secrets.ts.', truth)).toBeNull()
    expect(
      acceptBlockSentence(Array(15).fill('word').join(' '), truth),
    ).toBeNull()
    expect(acceptBlockSentence('Read state.ts. Updated it.', truth)).toBeNull()
    expect(acceptBlockSentence('   ', truth)).toBeNull()
  })
})

describe('paths as the model will write them (R7)', () => {
  const items = ['a', 'b', 'c'].map((name) =>
    claudeRead(`read-${name}`, `/Users/me/proj/src/app/${name}.ts`),
  )
  const built = buildBlockPrompt(
    promptText,
    promptProviderName('claude-code'),
    blockRecordsFromItems(items),
  )!

  it('holds every contiguous sub-path of an absolute Claude path', () => {
    for (const path of [
      'src/app',
      'src/app/a.ts',
      'app/a.ts',
      'proj/src',
      'Users/me/proj/src/app/a.ts',
      'a.ts',
    ])
      expect(built.truth.paths, path).toContain(path)
  })

  it('keeps "Read three files in src/app." for Claude-shaped items', () => {
    expect(
      acceptBlockSentence('Read three files in src/app.', built.truth),
    ).toBe('Read three files in src/app.')
  })

  it('keeps a line that copies the absolute path exactly, and its ./ spelling', () => {
    expect(
      acceptBlockSentence('Read /Users/me/proj/src/app/a.ts.', built.truth),
    ).not.toBeNull()
    expect(
      acceptBlockSentence('Read ./src/app/b.ts and src/app/c.ts.', built.truth),
    ).not.toBeNull()
  })

  it('still drops an invented path, and a real folder joined to a name it never held', () => {
    expect(acceptBlockSentence('Read src/lib/x.ts.', built.truth)).toBeNull()
    expect(
      acceptBlockSentence('Read three files in src/app/lib.', built.truth),
    ).toBeNull()
    expect(
      acceptBlockSentence('Read /Users/me/proj/src/lib/a.ts.', built.truth),
    ).toBeNull()
  })

  it('reads ./ and a leading / the same way on both sides', () => {
    const truth = deriveBlockTruth([
      {
        type: 'tool-call',
        toolName: 'Bash',
        inputText: '{"command":"cat ./docs/notes/plan.md"}',
      },
    ])
    expect(truth.paths).toContain('docs/notes/plan.md')
    expect(truth.paths).not.toContain('./docs/notes/plan.md')
    for (const sentence of [
      'Read docs/notes/plan.md.',
      'Read ./docs/notes/plan.md.',
      'Read /docs/notes/plan.md.',
      'Read notes/plan.md.',
    ])
      expect(acceptBlockSentence(sentence, truth), sentence).toBe(sentence)
  })
})

describe('Codex records in the spike shape (R8)', () => {
  it.each([
    [`/bin/zsh -lc 'ls src/shared'`, 'ls src/shared'],
    [`zsh -lc 'git status --short'`, 'git status --short'],
    [`/bin/bash -c 'npm test'`, 'npm test'],
    [`bash -l -c 'rg pending src'`, 'rg pending src'],
    [`/usr/bin/sh -c "npm run typecheck"`, 'npm run typecheck'],
    [String.raw`/bin/zsh -lc 'echo '\''hi'\'' > a.txt'`, `echo 'hi' > a.txt`],
    [
      String.raw`bash -lc "echo \"\$HOME\" \\ done"`,
      String.raw`echo "$HOME" \ done`,
    ],
    [`/bin/zsh -lc 'cat <<EOF\nline\nEOF'`, 'cat <<EOF\nline\nEOF'],
  ])('unwraps %s', (wrapped, command) => {
    expect(unwrapShellCommand(wrapped)).toBe(command)
  })

  it.each([
    'ls src/shared',
    `python -c 'print(1)'`,
    `/bin/zsh -lc ls`,
    `/bin/zsh -lc 'a' 'b'`,
    `/bin/zsh -lc 'it's'`,
    `bash -lc "say "hi""`,
    `fish -c 'ls'`,
  ])('leaves %s as Codex wrote it', (command) => {
    expect(unwrapShellCommand(command)).toBe(command)
  })

  it('a wrapped `ls` with its prefixed output gives the spike listing record and truth set', () => {
    const block = fixture('block-20')
    const records = blockRecordsFromItems([
      codexCommand('ls', `/bin/zsh -lc 'ls src/shared'`, 'lib\nui\nstyles'),
    ])
    expect(records).toEqual(block.items)
    expect(deriveBlockTruth(records)).toEqual(block.truth)
    // The listing rule reads the entries, the first one included.
    expect(deriveBlockTruth(records).paths).toContain('lib')
  })

  it('a wrapped `npm test` with output gives the spike record', () => {
    const block = fixture('block-17')
    const records = blockRecordsFromItems([
      codexCommand(
        'test',
        `/bin/zsh -lc 'npm test'`,
        'Command exited 1. One assertion failed.',
      ),
    ])
    expect(records).toEqual(block.items)
    expect(deriveBlockTruth(records)).toEqual(block.truth)
  })

  it('five wrapped commands give the spike block and its exact prompt', () => {
    const block = fixture('block-16')
    const items = (block.items as BlockRecord[]).map((record, index) =>
      codexCommand(
        `c${index}`,
        `/bin/zsh -lc '${record.toolName}'`,
        record.type === 'tool-result' ? record.outputText : '',
      ),
    )
    const built = buildBlockPrompt(
      promptText,
      promptProviderName('codex'),
      blockRecordsFromItems(items),
    )!
    expect(built.records).toEqual(block.items)
    expect(built.truth).toEqual(block.truth)
    expect(built.prompt).toBe(
      assembleBlockPrompt(promptText, 'codex', block.items as BlockRecord[]),
    )
  })

  it('strips only the prefix Codex added, never a matching start of real output', () => {
    const records = blockRecordsFromItems([
      codexCommand('p', 'pwd', 'pwd: /tmp/x'),
    ])
    expect(records).toEqual([
      { type: 'tool-result', toolName: 'pwd', outputText: 'pwd: /tmp/x' },
    ])
  })
})

/** A Claude Code tool call as the app records it (pretty-printed input). */
function claudeCall(
  id: string,
  toolName: string,
  input: Record<string, unknown>,
): ConversationItem {
  return {
    ...base(id, 'tool-use', 'claude-code'),
    kind: 'tool-call',
    toolName,
    inputText: JSON.stringify(input, null, 2),
  }
}

/** A Codex step as `codex-provider.ts` records it, the command zsh-wrapped. */
function codexWrapped(id: string, command: string, output: string) {
  return codexCommand(
    id,
    `/bin/zsh -lc '${command.replaceAll(`'`, `'\\''`)}'`,
    output,
  )
}

describe('one path reader on both sides of the gate (R13)', () => {
  /** Production-shaped blocks: what Claude Code and Codex actually record. */
  const productionBlocks: Array<[string, ConversationItem[]]> = [
    [
      'claude-code',
      [
        claudeCall('r1', 'Read', {
          file_path: '/Users/me/proj/node_modules/@scope/pkg/index.ts',
        }),
        claudeCall('r2', 'Read', { file_path: '/Users/me/proj/Cargo.toml' }),
        claudeCall('g1', 'Grep', {
          pattern: 'vite.config',
          path: '/Users/me/proj/node_modules/@types/node',
        }),
        claudeCall('w1', 'Write', {
          file_path: '/Users/me/proj/.github/workflows/ci.yml',
          content:
            'uses: actions/setup-node@v4\nrun: npm ci && tsc -p tsconfig.node.json',
        }),
        claudeCall('e1', 'Edit', {
          file_path: './scripts/release.sh',
          old_string: 'v1.2.3',
          new_string: 'v1.2.4',
        }),
      ],
    ],
    [
      'codex',
      [
        codexWrapped(
          'c1',
          'cat Cargo.toml',
          '[package]\nname = "x"\nedition = "2021"',
        ),
        codexWrapped(
          'c2',
          'rg -n useState packages/@scope/ui/src',
          'packages/@scope/ui/src/button.tsx:3: import { useState } from "react"',
        ),
        codexWrapped('c3', 'ls ../sibling/crates', 'core\ncli\nREADME.md'),
        codexWrapped(
          'c4',
          "sed -n '1,20p' vite.config.mjs",
          'export default defineConfig({ plugins: [react()] })',
        ),
        codexWrapped('c5', 'cat /etc/hosts', '127.0.0.1 localhost'),
      ],
    ],
  ]

  const cases: Array<{ name: string; records: BlockRecord[] }> = [
    ...fixtures.map((block) => ({
      name: block.id,
      records: block.items as BlockRecord[],
    })),
    ...productionBlocks.map(([provider, items]) => ({
      name: provider,
      records: blockRecordsFromItems(items),
    })),
  ]

  it('a sentence quoting any token the reader finds in a record passes the path gate', () => {
    let tokens = 0
    for (const { name, records } of cases) {
      const truth = deriveBlockTruth(records)
      for (const record of records)
        for (const field of Object.values(record))
          for (const token of readPathTokens(field)) {
            tokens += 1
            for (const sentence of [`Read ${token}.`, `Read \`${token}\`.`]) {
              const result = truthCheck(sentence, { truth })
              expect(result.unknownPaths, `${name}: ${sentence}`).toEqual([])
              expect(result.pass, `${name}: ${sentence}`).toBe(true)
            }
          }
    }
    // Not vacuous: the fixtures and the production blocks name many paths.
    expect(tokens).toBeGreaterThan(40)
  })

  it('`cat Cargo.toml` → "Read Cargo.toml." passes; an invented Cargo.lock still fails', () => {
    const truth = deriveBlockTruth(
      blockRecordsFromItems([
        codexWrapped('c1', 'cat Cargo.toml', '[package]\nname = "x"'),
      ]),
    )
    expect(acceptBlockSentence('Read Cargo.toml.', truth)).toBe(
      'Read Cargo.toml.',
    )
    expect(acceptBlockSentence('Read Cargo.lock.', truth)).toBeNull()
    expect(
      acceptBlockSentence('Read Cargo.toml and Cargo.lock.', truth),
    ).toBeNull()
  })

  it('`@scope/pkg/index.ts` passes, from an absolute Claude path', () => {
    const truth = deriveBlockTruth(
      blockRecordsFromItems([
        claudeCall('r1', 'Read', {
          file_path: '/Users/me/proj/node_modules/@scope/pkg/index.ts',
        }),
      ]),
    )
    for (const sentence of [
      'Read @scope/pkg/index.ts.',
      'Read node_modules/@scope/pkg/index.ts.',
    ])
      expect(acceptBlockSentence(sentence, truth), sentence).toBe(sentence)
    expect(acceptBlockSentence('Read @scope/pkg/main.ts.', truth)).toBeNull()
    expect(acceptBlockSentence('Read @other/pkg/index.ts.', truth)).toBeNull()
  })

  it('reads the same tokens the check reads, normalized once', () => {
    expect(
      readPathTokens(
        'cat ./Cargo.toml /Users/me/a.ts node_modules/@types/x src/app/. ../up/b.rs',
      ),
    ).toEqual([
      'Cargo.toml',
      'Users/me/a.ts',
      'node_modules/@types/x',
      'src/app',
      '../up/b.rs',
    ])
  })
})

describe('the prompt names the provider as measured (R11)', () => {
  it('claude-code is claude; the others are as the fixtures had them', () => {
    expect(promptProviderName('claude-code')).toBe('claude')
    for (const name of ['codex', 'pi', 'cursor'])
      expect(promptProviderName(name)).toBe(name)
  })

  it("a Claude Code block's prompt is byte-identical to the spike's", () => {
    const block = fixture('block-01')
    const items = (block.items as BlockRecord[]).map((record, index) => ({
      ...base(`r${index}`, 'tool-use', 'claude-code'),
      kind: 'tool-call' as const,
      toolName: record.toolName,
      inputText: record.type === 'tool-call' ? record.inputText : '',
    }))
    expect(
      buildBlockPrompt(
        promptText,
        promptProviderName(items[0]!.providerMeta.providerId),
        blockRecordsFromItems(items),
      )!.prompt,
    ).toBe(
      assembleBlockPrompt(promptText, 'claude', block.items as BlockRecord[]),
    )
  })
})

/**
 * Lap 1's `buildBlockPrompt`, verbatim, as the reference the linear fit must
 * agree with (R9). It re-assembles and re-measures the prompt per dropped
 * record: quadratic in the block, which is why it was replaced.
 */
function lap1BuildBlockPrompt(
  text: string,
  provider: string,
  records: readonly BlockRecord[],
): BlockPrompt | null {
  const cap = (value: string) =>
    value.length > BLOCK_RECORD_TEXT_MAX_CHARS
      ? value.slice(0, BLOCK_RECORD_TEXT_MAX_CHARS)
      : value
  const capped: BlockRecord[] = records.map((record) =>
    record.type === 'tool-call'
      ? { ...record, inputText: cap(record.inputText) }
      : { ...record, outputText: cap(record.outputText) },
  )
  while (capped.length > 0) {
    const prompt = assembleBlockPrompt(text, provider, capped)
    if (new TextEncoder().encode(prompt).length <= BLOCK_PROMPT_MAX_BYTES)
      return { prompt, records: capped, truth: deriveBlockTruth(capped) }
    capped.pop()
  }
  return null
}

/** A long Codex block: heredoc commands of KBs, outputs past the cap. */
function thousandCodexSteps(): ConversationItem[] {
  return Array.from({ length: 1_000 }, (_, index) => {
    const heredoc = `cat <<'EOF' > src/gen/file-${index}.ts\n${'const x = 1 // ünïcode\n'.repeat(200)}EOF`
    return codexCommand(
      `step-${index}`,
      `/bin/zsh -lc '${index % 2 ? heredoc : `sed -n 1,400p src/mod-${index}/index.ts`}'`,
      `${'line of output with a path src/out/file.ts\n'.repeat(80)}`,
    )
  })
}

describe('no quadratic work on main (R9)', () => {
  /** Median of 7 timed runs after one warm-up, in ms. */
  function medianMs(run: () => unknown): { median: number; runs: number[] } {
    run()
    const runs: number[] = []
    for (let index = 0; index < 7; index += 1) {
      const started = performance.now()
      run()
      runs.push(performance.now() - started)
    }
    const sorted = [...runs].sort((a, b) => a - b)
    return { median: sorted[3]!, runs }
  }

  it('builds a 1,000-record block in at most 5 ms', () => {
    const items = thousandCodexSteps()
    const records = blockRecordsFromItems(items)
    expect(records).toHaveLength(1_000)
    // The fit alone, over an already mapped block of 1,000 records.
    const fit = medianMs(() => buildBlockPrompt(promptText, 'codex', records))
    // The service's own path: items -> lazy records -> fit -> one assembly.
    const path = medianMs(() =>
      buildBlockPrompt(promptText, 'codex', blockRecords(items)),
    )
    const show = (ms: number) => ms.toFixed(3)
    process.stdout.write(
      `R9: 1,000-record Codex block -- buildBlockPrompt ${show(fit.median)} ms, ` +
        `items to prompt ${show(path.median)} ms (median of 7; ` +
        `runs ${fit.runs.map(show).join(', ')} / ${path.runs.map(show).join(', ')})\n`,
    )
    expect(fit.median).toBeLessThanOrEqual(5)
    expect(path.median).toBeLessThanOrEqual(5)
    // Both ways send the same thing.
    expect(buildBlockPrompt(promptText, 'codex', blockRecords(items))).toEqual(
      buildBlockPrompt(promptText, 'codex', records),
    )
  })

  it('maps only what it sends: the fit stops pulling items at the first record past the budget', () => {
    const items = thousandCodexSteps()
    let pulled = 0
    const counted: Iterable<ConversationItem> = {
      *[Symbol.iterator]() {
        for (const item of items) {
          pulled += 1
          yield item
        }
      },
    }
    const built = buildBlockPrompt(promptText, 'codex', blockRecords(counted))!
    expect(built.records.length).toBeGreaterThan(0)
    expect(pulled).toBe(built.records.length + 1)
  })

  it('equals the lap-1 function on the 20 fixtures', () => {
    for (const block of fixtures) {
      const records = block.items as BlockRecord[]
      expect(
        buildBlockPrompt(promptText, block.provider, records),
        block.id,
      ).toEqual(lap1BuildBlockPrompt(promptText, block.provider, records))
    }
  })

  it('equals the lap-1 function wherever the cut lands, multi-byte text included', () => {
    for (let count = 0; count <= 24; count += 1) {
      const records: BlockRecord[] = Array.from({ length: count }, (_, i) => ({
        type: i % 3 ? 'tool-call' : 'tool-result',
        toolName: i % 3 ? 'Read' : `ls src/part-${i}`,
        ...(i % 3
          ? {
              inputText: JSON.stringify({
                file_path: `src/part-${i}/f.ts`,
                pad: 'é'.repeat(300 + i * 97),
              }),
            }
          : { outputText: `a\nb\n${'z'.repeat(2_500)}` }),
      })) as BlockRecord[]
      expect(buildBlockPrompt(promptText, 'pi', records), `${count}`).toEqual(
        lap1BuildBlockPrompt(promptText, 'pi', records),
      )
    }
  })

  it('caps every text field of a record, the tool name included', () => {
    const toolName = `cat <<'EOF' > src/a.ts\n${'x'.repeat(5_000)} src/hidden/after-cap.ts\nEOF`
    const built = buildBlockPrompt(promptText, 'codex', [
      { type: 'tool-result', toolName, outputText: 'ok' },
      { type: 'tool-call', toolName, inputText: 'y'.repeat(3_000) },
    ])!
    for (const record of built.records) {
      expect(record.toolName.length).toBe(BLOCK_RECORD_TEXT_MAX_CHARS)
      const text =
        record.type === 'tool-call' ? record.inputText : record.outputText
      expect(text.length).toBeLessThanOrEqual(BLOCK_RECORD_TEXT_MAX_CHARS)
    }
    expect(built.prompt).not.toContain('src/hidden/after-cap.ts')
    expect(built.truth.paths).not.toContain('src/hidden/after-cap.ts')
    expect(built.truth.paths).toContain('src/a.ts')
  })
})
