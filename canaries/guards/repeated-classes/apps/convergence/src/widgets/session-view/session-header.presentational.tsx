// The session's header bar and its label: the first copy of each.
export function SessionHeader({ title }: { title: string }) {
  return (
    <header className="flex min-w-0 items-center gap-2 border-b border-border px-3">
      <h2 className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {title}
      </h2>
    </header>
  )
}
