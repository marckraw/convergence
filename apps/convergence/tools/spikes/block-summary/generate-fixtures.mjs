import { writeFileSync } from 'node:fs'

const specs = [
  [
    'claude',
    'Read ten transcript files',
    Array.from({ length: 10 }, (_, i) => [
      'Read',
      { file_path: `src/widgets/session-view/part-${i + 1}.tsx` },
    ]),
  ],
  [
    'claude',
    'Search then read',
    [
      ['Grep', { pattern: 'transcript', path: 'src/widgets/session-view' }],
      ['Read', { file_path: 'src/widgets/session-view/index.ts' }],
    ],
  ],
  [
    'claude',
    'Edit three files',
    [1, 2, 3].map((i) => [
      'Edit',
      {
        file_path: `src/features/composer/part-${i}.ts`,
        old_string: 'one',
        new_string: 'two',
      },
    ]),
  ],
  [
    'claude',
    'Invoke tests without a result',
    [['Bash', { command: 'npm test' }]],
  ],
  [
    'claude',
    'Trap: filename does not prove deployment',
    [['Read', { file_path: 'docs/deployed-successfully.md' }]],
  ],
  ['pi', 'Read configuration', [['read', { path: 'package.json' }]]],
  [
    'pi',
    'Edit styling',
    [
      [
        'edit',
        { path: 'src/shared/theme.css', oldText: 'red', newText: 'blue' },
      ],
    ],
  ],
  ['pi', 'List source directory', [['bash', { command: 'ls src/entities' }]]],
  [
    'pi',
    'Search then read settings',
    [
      ['grep', { pattern: 'timeout', path: 'src/shared/settings' }],
      ['read', { path: 'src/shared/settings/defaults.ts' }],
    ],
  ],
  [
    'pi',
    'Trap: filename does not prove tests passed',
    [['read', { path: 'test/all-tests-passed.test.ts' }]],
  ],
  [
    'cursor',
    'Read free text',
    [['Read', 'Read src/widgets/session-view/transcript.tsx']],
  ],
  [
    'cursor',
    'Search free text',
    [['Grep', 'Search for pending in src/entities/session']],
  ],
  [
    'cursor',
    'Edit free text',
    [['Edit', 'Replace label text in src/features/composer/button.tsx']],
  ],
  ['cursor', 'Command free text', [['Bash', 'Run npm run typecheck']]],
  [
    'cursor',
    'Read two free text paths',
    [
      ['Read', 'Read docs/architecture/overview.md'],
      ['Read', 'Read docs/architecture/boundaries.md'],
    ],
  ],
  [
    'codex',
    'Five command results',
    [
      'pwd',
      'git status --short',
      'git diff --stat',
      'git branch --show-current',
      'git log -1 --oneline',
    ].map((command) => [command, 'Command finished (exit 0).']),
  ],
  [
    'codex',
    'Failed test result',
    [['npm test', 'Command exited 1. One assertion failed.']],
  ],
  [
    'codex',
    'Read through command result',
    [['cat src/entities/session/types.ts', 'export type SessionId = string;']],
  ],
  [
    'codex',
    'Search through command result',
    [
      [
        'rg pending src/widgets/session-view',
        'src/widgets/session-view/state.ts:4: pending: false',
      ],
    ],
  ],
  ['codex', 'Directory listing result', [['ls src/shared', 'lib\nui\nstyles']]],
]

const blocks = specs.map(([provider, label, records], index) => {
  const items = records.map(([toolName, input]) =>
    provider === 'codex'
      ? { type: 'tool-result', toolName, outputText: input }
      : {
          type: 'tool-call',
          toolName,
          inputText:
            typeof input === 'string'
              ? input
              : JSON.stringify(
                  input,
                  null,
                  provider === 'claude' ? 2 : undefined,
                ),
        },
  )
  // Include literal file paths, their parents and basenames as allowed mentions.
  const paths = new Set()
  for (const item of items) {
    const text = Object.values(item).join(' ')
    for (const match of text.matchAll(
      /(?:[\w.-]+\/)+[\w.-]+|\b[\w-]+\.(?:json|tsx?|css|md)\b/g,
    )) {
      const path = match[0]
      paths.add(path)
      paths.add(path.split('/').at(-1))
      let parent = path
      while (parent.includes('/')) {
        parent = parent.slice(0, parent.lastIndexOf('/'))
        paths.add(parent)
      }
    }
  }
  if (label === 'Directory listing result') {
    for (const name of ['lib', 'ui', 'styles']) paths.add(name)
  }
  return {
    id: `block-${String(index + 1).padStart(2, '0')}`,
    provider,
    label,
    items,
    truth: {
      toolNames: [...new Set(items.map((item) => item.toolName))],
      paths: [...paths].sort(),
    },
  }
})
writeFileSync(
  new URL('./fixtures.json', import.meta.url),
  `${JSON.stringify(blocks, null, 2)}\n`,
)
