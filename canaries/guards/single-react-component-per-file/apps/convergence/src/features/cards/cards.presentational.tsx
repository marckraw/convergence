// Two components in one file: the second is a file of its own (AGENTS.md, one React component per
// file).
export function CardTitle({ title }: { title: string }) {
  return <h2>{title}</h2>
}

export const CardBody = ({ body }: { body: string }) => <p>{body}</p>
