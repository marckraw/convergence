import type { FC } from 'react'
import { RefreshCw } from 'lucide-react'
import { Button, Card, cn, settingsHeading } from '@convergence/ui'
import {
  CONNECTION_SERVICES,
  connectionCell,
  connectionPathLine,
  describeConnectionsCheckedAt,
  type ConnectionsOverviewRow,
} from '@/entities/provider-account'
import { CHATGPT_SIGN_IN_TONE } from './chatgpt-app-sign-in.styles'

interface ConnectionsOverviewProps {
  rows: ConnectionsOverviewRow[]
  checkedAt: string | null
  isChecking: boolean
  onCheckAll: () => void
}

function rowNote(row: ConnectionsOverviewRow): string | null {
  switch (row.state) {
    case 'checking':
      return 'Checking…'
    case 'not-connected':
      return 'Account not connected, so not checked'
    case 'failed':
      return `Couldn’t check: ${row.error ?? 'the check failed.'}`
    case 'checked':
      return row.error
  }
}

/**
 * Which account can reach Figma, Linear and GitHub right now, and through
 * which app (MAR-3518). Render-only: the container runs the checks.
 */
export const ConnectionsOverview: FC<ConnectionsOverviewProps> = ({
  rows,
  checkedAt,
  isChecking,
  onCheckAll,
}) => (
  <Card
    render={<section />}
    aria-labelledby="connections-overview-heading"
    padding="md"
    className="space-y-3"
  >
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 id="connections-overview-heading" className={settingsHeading}>
        Who can reach Figma, Linear and GitHub
      </h3>
      {/* Busy is the Button's own (DLG-17): aria-busy, the spinner in the
          icon's place, and a width that holds while the words change. */}
      <Button
        type="button"
        variant="secondary"
        disabled={isChecking}
        onClick={onCheckAll}
        pending={isChecking}
        pendingLabel="Checking all accounts…"
      >
        <RefreshCw className="size-3.5" aria-hidden="true" />
        Check all accounts
      </Button>
    </div>
    <p className="text-pretty text-xs leading-relaxed text-ink-muted">
      Every OpenAI and Claude account on this Mac, checked through each app that
      reaches the service. Figma keeps one sign-in per app for each Figma user,
      so the same app works on one account at a time; every conversation on that
      account shares it.
    </p>
    {describeConnectionsCheckedAt(checkedAt) ? (
      <p className="text-xs text-ink-muted">
        {describeConnectionsCheckedAt(checkedAt)}
      </p>
    ) : null}
    {rows.length > 0 ? (
      <div className="overflow-x-auto">
        <table className="w-full min-w-144 border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-line text-ink-muted">
              <th scope="col" className="py-2 pr-3 font-medium">
                Account
              </th>
              {CONNECTION_SERVICES.map((service) => (
                <th
                  key={service.id}
                  scope="col"
                  className="py-2 pr-3 font-medium"
                >
                  {service.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.accountId}
                className="border-b border-line-soft align-top"
              >
                <th scope="row" className="py-2 pr-3 font-normal">
                  <p className="break-all text-sm font-medium">
                    {row.identity}
                  </p>
                  <p className="text-ink-muted">{row.provider}</p>
                  {rowNote(row) ? (
                    <p className="text-pretty text-ink-muted">{rowNote(row)}</p>
                  ) : null}
                </th>
                {CONNECTION_SERVICES.map((service) => {
                  const cell = connectionCell(row.paths, service.id)
                  return (
                    <td key={service.id} className="py-2 pr-3">
                      {row.state !== 'checked' ? null : cell.paths.length ===
                        0 ? (
                        <span className="text-ink-muted">—</span>
                      ) : (
                        cell.paths.map((path) => {
                          const line = connectionPathLine(path)
                          return (
                            <p
                              key={`${path.via}:${path.state}:${path.account ?? ''}`}
                              className={cn(
                                'text-pretty break-words',
                                CHATGPT_SIGN_IN_TONE[line.tone],
                              )}
                            >
                              {line.text}
                            </p>
                          )
                        })
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ) : null}
  </Card>
)
