import type { FC } from 'react'
import { RefreshCw } from 'lucide-react'
import { Button, cn } from '@convergence/ui'
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
      return `Couldn't check: ${row.error ?? 'the check failed.'}`
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
  <section
    aria-labelledby="connections-overview-heading"
    className="space-y-3 rounded-xl border border-border bg-card/45 px-4 py-4"
  >
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 id="connections-overview-heading" className="text-sm font-semibold">
        Who can reach Figma, Linear and GitHub
      </h3>
      <Button
        type="button"
        variant="secondary"
        disabled={isChecking}
        onClick={onCheckAll}
        className="min-h-10"
      >
        <RefreshCw className="mr-2 size-3.5" aria-hidden="true" />
        {isChecking ? 'Checking all accounts…' : 'Check all accounts'}
      </Button>
    </div>
    <p className="text-pretty text-xs leading-relaxed text-muted-foreground">
      Every OpenAI and Claude account on this Mac, checked through each app that
      reaches the service. Figma keeps one sign-in per app for each Figma user,
      so the same app works on one account at a time; every conversation on that
      account shares it.
    </p>
    {describeConnectionsCheckedAt(checkedAt) ? (
      <p className="text-xs text-muted-foreground">
        {describeConnectionsCheckedAt(checkedAt)}
      </p>
    ) : null}
    {rows.length > 0 ? (
      <div className="overflow-x-auto">
        <table className="w-full min-w-[36rem] border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-border text-muted-foreground">
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
                className="border-b border-border/60 align-top"
              >
                <th scope="row" className="py-2 pr-3 font-normal">
                  <p className="break-all text-sm font-medium">
                    {row.identity}
                  </p>
                  <p className="text-muted-foreground">{row.provider}</p>
                  {rowNote(row) ? (
                    <p className="text-pretty text-muted-foreground">
                      {rowNote(row)}
                    </p>
                  ) : null}
                </th>
                {CONNECTION_SERVICES.map((service) => {
                  const cell = connectionCell(row.paths, service.id)
                  return (
                    <td key={service.id} className="py-2 pr-3">
                      {row.state !== 'checked' ? null : cell.paths.length ===
                        0 ? (
                        <span className="text-muted-foreground">—</span>
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
  </section>
)
