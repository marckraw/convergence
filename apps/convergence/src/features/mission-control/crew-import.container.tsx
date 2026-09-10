import { useRef, useState, type ReactNode } from 'react'
import { useSessionStore } from '@/entities/session'
import { sessionCrewApi, useSessionCrewStore } from '@/entities/session-crew'
import { useSessionRelayStore } from '@/entities/session-relay'
import { useProjectStore, projectApi, dialogApi } from '@/entities/project'
import type {
  CrewImportPlan,
  CrewImportDecisions,
  CrewImportReport,
} from '@/shared/types/crew-import.types'
import { Button } from '@/shared/ui/button'
import { CrewImportView } from './crew-import.presentational'

export function CrewImport({
  trigger,
}: {
  trigger?: (start: () => void, busy: boolean) => ReactNode
}) {
  const [plan, setPlan] = useState<CrewImportPlan | null>(null)
  const [decisions, setDecisions] = useState<CrewImportDecisions>({
    revision: '',
    choices: {},
    updates: {},
    includeLayout: false,
  })
  const [report, setReport] = useState<CrewImportReport | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const running = useRef(false)
  async function run(action: () => Promise<void>) {
    if (running.current) return
    running.current = true
    setBusy(true)
    setError(null)
    try {
      await action()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Crew import failed')
    } finally {
      running.current = false
      setBusy(false)
    }
  }
  async function replan(
    path: string | undefined,
    choices: Record<string, string>,
    fresh = false,
  ) {
    const next = await sessionCrewApi.importPlan(path, choices)
    if (!next) return
    setPlan(next)
    setReport(null)
    setDecisions((current) => ({
      revision: next.revision,
      choices,
      updates: fresh ? {} : current.updates,
      includeLayout: fresh ? next.hasLayout : current.includeLayout,
    }))
  }
  return (
    <>
      {trigger ? (
        trigger(() => void run(() => replan(undefined, {}, true)), busy)
      ) : (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={() => void run(() => replan(undefined, {}, true))}
        >
          Import crew…
        </Button>
      )}
      {!plan && error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {plan && (
        <CrewImportView
          plan={plan}
          decisions={decisions}
          report={report}
          error={error}
          busy={busy}
          onClose={() => {
            setPlan(null)
            setReport(null)
            setError(null)
          }}
          onChoice={(key, value) =>
            void run(() =>
              replan(plan.path, { ...decisions.choices, [key]: value }),
            )
          }
          onUpdate={(key, value) =>
            setDecisions((current) => ({
              ...current,
              updates: { ...current.updates, [key]: value },
            }))
          }
          onIncludeLayout={(includeLayout) =>
            setDecisions((current) => ({ ...current, includeLayout }))
          }
          onChooseFolder={() =>
            void run(async () => {
              const repositoryPath = await dialogApi.selectDirectory()
              if (!repositoryPath) return
              await projectApi.create({ repositoryPath })
              await useProjectStore.getState().loadProjects()
              await replan(plan.path, decisions.choices)
            })
          }
          onApply={() =>
            void run(async () => {
              const result = await sessionCrewApi.importApply(
                plan.path,
                decisions,
              )
              setReport(result)
              await Promise.all([
                useSessionCrewStore.getState().load(),
                useSessionRelayStore.getState().load(),
                useSessionStore.getState().loadGlobalSessions(),
                useSessionStore
                  .getState()
                  .refreshSessions([
                    ...new Set(
                      plan.roles.flatMap((role) =>
                        role.projectId === null ? [] : [role.projectId],
                      ),
                    ),
                  ]),
                ...(plan.roles.some((role) => role.projectId === null)
                  ? [useSessionStore.getState().loadGlobalChatSessions()]
                  : []),
              ])
            })
          }
        />
      )}
    </>
  )
}
