// canary: no-raw-input-outside-shared
// A container that prints the mailer's log in a raw <pre> instead of CodeBlock (DS8).
export function InviteLogContainer({ log }: { log: string }) {
  return <pre>{log}</pre>
}
