// Mission Control's board header, pasted from the session's: the second copy of the bar, and of
// its label inside cn(). Short strings like "flex items-center" repeat freely.
import { cn } from '@/shared/lib/cn.pure'

export function BoardHeader({ title, live }: { title: string; live: boolean }) {
  return (
    <header className="flex min-w-0 items-center gap-2 border-b border-border px-3">
      <h2
        className={cn(
          'text-[11px] uppercase tracking-wide text-muted-foreground',
          live && 'flex items-center',
        )}
      >
        {title}
      </h2>
    </header>
  )
}
