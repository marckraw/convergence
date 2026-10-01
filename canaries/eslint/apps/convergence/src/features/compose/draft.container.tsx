// canary: @typescript-eslint/no-unused-vars, react-hooks/rules-of-hooks, react-hooks/exhaustive-deps
// An unused local, a hook called inside a branch, and the Quiet bug's shape (MAR-2537): a
// useCallback that reads `muted` but leaves it out of its dependency array.
import { useCallback, useState } from 'react'

export function DraftContainer({
  muted,
  send,
}: {
  muted: boolean
  send: (muted: boolean) => void
}) {
  const unused = 'never read'
  if (muted) {
    const [count] = useState(0)
    return <span>{count}</span>
  }
  const handleSubmit = useCallback(() => {
    send(muted)
  }, [send])
  return <button onClick={handleSubmit}>Send</button>
}
