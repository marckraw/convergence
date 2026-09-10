import type { SessionRelay } from '../relay/relay.types'
import type { CrewConfigSession } from './crew-config.types'
/** MAR-2889's hand-written crew, with synthetic instance ids. */
export const liveCrew = {
  name: 'convergence development',
  emoji: '🧪',
  accentColor: null,
  roundCap: 24,
  stallMinutes: 30,
}
const definitions = [
  [
    'fable',
    '-- Fable Mastermind --',
    'claude-code',
    'claude-fable-5-1',
    'high',
  ],
  [
    'horse opus',
    '-- Horse Executor Opus --',
    'claude-code',
    'claude-opus-5',
    'high',
  ],
  ['horse astra', '-- Horse Astra Executor --', 'codex', 'gpt-6-astra', 'high'],
  [
    'studio horse astra',
    'Lane: Studio - Horse Astra Executor --',
    'codex',
    'gpt-6-astra',
    'high',
  ],
  [
    'reviewer',
    '-- PI Codex Reviewer --',
    'pi',
    'openai-codex/gpt-5.6-sol',
    'xhigh',
  ],
] as const
export const liveSessions: CrewConfigSession[] = definitions.map(
  ([key, name, providerId, model, effort], index) => ({
    id: `session-${index}`,
    name,
    providerId,
    model,
    effort,
    permissionConfig: { preset: 'yolo' },
    projectId: key === 'studio horse astra' ? 'lane-id' : 'root-id',
    executionHost: 'local',
  }),
)
export const liveMembers = definitions.map(([batonName], index) => ({
  sessionId: `session-${index}`,
  batonName,
  canvasX: index === 0 ? -323 : index === 2 ? 398 : null,
  canvasY: index === 0 ? 679 : index === 2 ? 720 : null,
}))
export const liveProjects = [
  {
    id: 'root-id',
    name: 'convergence',
    origin: 'git@github.com:marckraw/convergence.git',
    laneOf: null,
    laneName: null,
  },
  {
    id: 'lane-id',
    name: 'convergence · lane: studio',
    origin: null,
    laneOf: 'root-id',
    laneName: 'studio',
  },
]
const edges = [
  [0, 1, 'BATON: horse opus', '/clear', null],
  [1, 0, null, null, null],
  [0, 2, 'BATON: horse astra', null, null],
  [2, 0, null, null, 'finished, now your turn :)'],
  [0, 3, 'BATON: studio horse astra', null, null],
  [3, 0, null, null, 'Finished, now your turn:'],
] as const
export const liveRelays: SessionRelay[] = edges.map(
  ([from, to, conditionToken, opener, instruction], index) => ({
    id: `wire-${index}`,
    crewId: 'crew-id',
    sourceSessionId: `session-${from}`,
    targetSessionId: `session-${to}`,
    trigger: 'settled',
    action: 'hail',
    spawnSpec: null,
    conditionToken,
    opener,
    instruction,
    armed: true,
    createdAt: 'timestamp',
    updatedAt: 'timestamp',
  }),
)

/** Expected YAML from the hand-written MAR-2889 example, expanded by R2–R4. */
export const liveCrewYaml = `# yaml-language-server: $schema=https://raw.githubusercontent.com/marckraw/convergence/master/docs/crews/crew-config.schema.json
version: 1
crew: "convergence development"
emoji: "🧪"
limits: { deliveriesPerRun: 24, attentionAfterMinutes: 30 }
roles:
  fable: { conversation: "-- Fable Mastermind --", provider: "claude-code", model: "claude-fable-5-1", effort: "high", permissions: "yolo", project: "github.com/marckraw/convergence", host: "local" }
  "horse astra": { conversation: "-- Horse Astra Executor --", provider: "codex", model: "gpt-6-astra", effort: "high", permissions: "yolo", project: "github.com/marckraw/convergence", host: "local" }
  "horse opus": { conversation: "-- Horse Executor Opus --", provider: "claude-code", model: "claude-opus-5", effort: "high", permissions: "yolo", project: "github.com/marckraw/convergence", host: "local" }
  reviewer: { conversation: "-- PI Codex Reviewer --", provider: "pi", model: "openai-codex/gpt-5.6-sol", effort: "xhigh", permissions: "yolo", project: "github.com/marckraw/convergence", host: "local" }
  "studio horse astra": { conversation: "Lane: Studio - Horse Astra Executor --", provider: "codex", model: "gpt-6-astra", effort: "high", permissions: "yolo", project: "github.com/marckraw/convergence", lane: "studio", host: "local" }
wires:
  - { from: "fable", to: "horse astra", when: "BATON: horse astra", opener: "keep" }
  - { from: "fable", to: "horse opus", when: "BATON: horse opus", opener: "clear" }
  - { from: "fable", to: "studio horse astra", when: "BATON: studio horse astra", opener: "keep" }
  - { from: "horse astra", to: "fable", when: "settled", opener: "keep", instruction: "finished, now your turn :)" }
  - { from: "horse opus", to: "fable", when: "settled", opener: "keep" }
  - { from: "studio horse astra", to: "fable", when: "settled", opener: "keep", instruction: "Finished, now your turn:" }
`
