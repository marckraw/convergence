// The design system's panel: its header and footer share a bar, and the composer's footer copies
// it a third time. Two of the three copies live in packages/ui/src, so the guard reports them only
// while it reads the package as well as the app (MAR-3610).
export function Panel({ title, children }: { title: string; children: string }) {
  return (
    <section>
      <header className="flex items-center justify-between gap-3 px-4 py-2">
        {title}
      </header>
      {children}
      <footer className="flex items-center justify-between gap-3 px-4 py-2" />
    </section>
  )
}
