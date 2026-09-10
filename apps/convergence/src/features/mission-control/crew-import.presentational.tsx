import type {
  CrewImportPlan,
  CrewImportDecisions,
  CrewImportReport,
  CrewImportRow,
} from '@/shared/types/crew-import.types'
import { Input } from '@/shared/ui/input'
import { Button } from '@/shared/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogFooter,
} from '@/shared/ui/dialog'

interface Props {
  plan: CrewImportPlan
  decisions: CrewImportDecisions
  report: CrewImportReport | null
  busy: boolean
  error: string | null
  onClose: () => void
  onApply: () => void
  onChoice: (key: string, value: string) => void
  onUpdate: (key: string, value: boolean) => void
  onIncludeLayout: (value: boolean) => void
  onChooseFolder: () => void
}
export function CrewImportView({
  plan,
  decisions,
  report,
  busy,
  error,
  onClose,
  onApply,
  onChoice,
  onUpdate,
  onIncludeLayout,
  onChooseFolder,
}: Props) {
  const rows: CrewImportRow[] = [
    plan.crew,
    ...plan.roles,
    ...plan.wires,
    plan.limits,
    ...plan.kept,
  ]
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose()
      }}
    >
      <DialogContent className="w-[min(1000px,calc(100vw-2rem))]">
        <DialogHeader>
          <DialogTitle>
            {report ? 'Crew import report' : 'Import crew'}
          </DialogTitle>
          <DialogDescription className="break-all">
            {plan.path}
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          {error && (
            <p role="alert" className="mb-3 text-sm text-destructive">
              {error}
            </p>
          )}
          {report ? (
            <>
              <p className="mb-3 text-sm">
                {report.nothingToChange
                  ? 'Nothing to change.'
                  : 'Import finished. Any refused updates are listed below.'}
              </p>
              <ul className="space-y-2 text-sm">
                {report.entries.map((entry, i) => (
                  <li key={`${entry.key}:${i}`}>
                    <strong>{entry.label}</strong> — {entry.outcome}
                    {entry.reason ? `: ${entry.reason}` : ''}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <>
              <p className="mb-3 text-sm text-muted-foreground">
                Review the file against this machine. Local records absent from
                the file are kept. Remote conversations can be bound, but cannot
                be created here.
              </p>
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border">
                    {['What', 'State', 'Detail', 'Decision'].map((title) => (
                      <th className="px-2 py-2" key={title}>
                        {title}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr
                      className="border-b border-border/50 align-top"
                      key={r.key}
                    >
                      <th
                        scope="row"
                        className="max-w-56 break-words px-2 py-3 font-medium"
                      >
                        {r.label}
                      </th>
                      <td className="px-2 py-3">
                        {r.state === 'create' ? 'will create' : r.state}
                      </td>
                      <td className="max-w-72 break-words px-2 py-3 text-muted-foreground">
                        {r.detail}
                        {r.warnings
                          ?.filter(
                            (warning) =>
                              decisions.updates[warning.updateKey] !== false,
                          )
                          .map((warning) => (
                            <p
                              className="mt-1 text-warning"
                              key={warning.updateKey}
                            >
                              {warning.message}
                            </p>
                          ))}
                      </td>
                      <td className="px-2 py-3">
                        {r.state === 'choose' && r.options.length > 0 && (
                          <select
                            aria-label={`Choose ${r.label}`}
                            className="max-w-60 rounded border border-border bg-background p-1"
                            disabled={busy}
                            value={
                              decisions.choices[r.choiceKey ?? r.key] ?? ''
                            }
                            onChange={(e) =>
                              onChoice(r.choiceKey ?? r.key, e.target.value)
                            }
                          >
                            <option value="">Choose…</option>
                            {r.options.map((o) => (
                              <option key={o.value} value={o.value}>
                                {o.label}
                              </option>
                            ))}
                          </select>
                        )}
                        {r.canUpdate && (
                          <label className="flex items-center gap-2">
                            <Input
                              type="checkbox"
                              className="h-4 w-4 shrink-0 p-0"
                              aria-label={`Update ${r.label} to file`}
                              disabled={busy}
                              checked={decisions.updates[r.key] !== false}
                              onChange={(e) =>
                                onUpdate(r.key, e.target.checked)
                              }
                            />
                            Update to file
                          </label>
                        )}
                        {r.state === 'missing-project' && (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={busy}
                            onClick={onChooseFolder}
                          >
                            Choose folder…
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {plan.hasLayout && (
                <label className="mt-4 flex items-center gap-2 text-sm">
                  <Input
                    type="checkbox"
                    className="h-4 w-4 shrink-0 p-0"
                    checked={decisions.includeLayout}
                    disabled={busy}
                    onChange={(e) => onIncludeLayout(e.target.checked)}
                  />
                  Include layout
                </label>
              )}
            </>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={onClose}>
            {report ? 'Close' : 'Cancel'}
          </Button>
          {!report && (
            <Button disabled={busy || !plan.canApply} onClick={onApply}>
              {busy ? 'Working…' : 'Apply'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
