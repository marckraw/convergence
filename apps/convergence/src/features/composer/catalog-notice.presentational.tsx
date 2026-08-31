import type { FC } from 'react'
import type { OptionRowNotice } from '@/entities/session'
import { cn } from '@/shared/lib/cn.pure'
import { AlertTriangle } from 'lucide-react'

/**
 * How loudly the option row says what it has to say (MAR-2682).
 *
 * A map keyed on the union rather than a ternary, so a fourth notice kind is a
 * compile error here — where how loud it should be is a decision someone has to
 * make — instead of falling through to the quietest option. `kind` exists to be
 * read here: without this the three notices would render identically and the
 * field would be a label nothing acts on.
 *
 * "Could not be asked" is the loud one, and it is loud for the same reason the
 * strip's own warning is: a machine that did not answer is a live signal, not
 * context. Waiting on one, and a daemon that honestly runs nothing, are both
 * normal beats.
 */
const catalogNoticeToneClass = {
  asking: 'text-muted-foreground',
  unreachable: 'text-warning-foreground',
  empty: 'text-muted-foreground',
} satisfies Record<OptionRowNotice['kind'], string>

/**
 * The option row's sentence: either standing in for the controls, or beside
 * them when what they hold is a listing the machine could not re-confirm.
 */
export const CatalogNotice: FC<{ notice: OptionRowNotice }> = ({ notice }) => (
  <span
    data-testid="composer-catalog-notice"
    className={cn(
      'flex min-w-0 items-center gap-1 px-2 text-xs',
      catalogNoticeToneClass[notice.kind],
    )}
  >
    {notice.kind === 'unreachable' ? (
      <AlertTriangle className="h-3 w-3 shrink-0" />
    ) : null}
    {notice.text}
  </span>
)
