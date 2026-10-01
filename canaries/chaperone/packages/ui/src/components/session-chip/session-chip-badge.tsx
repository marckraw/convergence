// canary: ui-package-named-exports
// A part exported as a default, below the first line (Chaperone 0.8.0 reads ^ per line).

function SessionChipBadge({ count }: { count: number }) {
  return <span>{count}</span>
}

export default SessionChipBadge
