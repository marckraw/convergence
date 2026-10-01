// canary: preset/presentational-no-side-effects, preset/presentational-no-stateful-hooks, presentational-no-effects, presentational-no-electron, renderer-no-direct-electron, raw-elements-need-a-reason
// A presentational that keeps state, runs an effect, imports Electron, and renders a raw <button>
// and <input> with no reason given for either.
import { useEffect, useState } from 'react'
import { shell } from 'electron'

export function ComposerView({ onSend }: { onSend: (text: string) => void }) {
  const [text, setText] = useState('')
  useEffect(() => {
    shell.beep()
  }, [])
  return (
    <div>
      <input value={text} onChange={(event) => setText(event.target.value)} />
      <button onClick={() => onSend(text)}>Send</button>
    </div>
  )
}
