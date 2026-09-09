import type { AgentRunFact } from './harness-evidence.types'

type StartedKeys = keyof Extract<AgentRunFact, { kind: 'agent.started' }>['run']
type ChangedKeys = keyof Extract<
  AgentRunFact,
  { kind: 'agent.changed' }
>['patch']
// @ts-expect-error taskId is a backend read projection, never a provider write.
const started: StartedKeys = 'taskId'
// @ts-expect-error taskId is a backend read projection, never a provider write.
const changed: ChangedKeys = 'taskId'
void started
void changed
