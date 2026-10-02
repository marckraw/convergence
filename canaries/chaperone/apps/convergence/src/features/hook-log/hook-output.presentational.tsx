// canary: raw-elements-need-a-reason, use-timestamp
// A hook's output from before CodeBlock: a raw <pre> with no reason given, its
// only raw element, so the <pre> alone trips raw-elements-need-a-reason; and
// its time written by hand, the moment's toLocaleTimeString, not a Timestamp.
type HookOutputProps = { output: string; at: string }

export function HookOutput({ output, at }: HookOutputProps) {
  return (
    <div>
      <span>ran at {new Date(at).toLocaleTimeString()}</span>
      <pre className="whitespace-pre-wrap">{output}</pre>
    </div>
  )
}
