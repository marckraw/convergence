/**
 * What a person typed into a Linear "Project" field, read as one of three
 * things (MAR-3156 R1).
 *
 * In `shared` because BOTH sides need the same answer and neither may own it:
 * the renderer asks "is this already an id?" to decide whether to bind
 * straight away (R3 -- an id needs no read and no key), and the adapter asks
 * which filter to send. Two copies of this rule would be two answers to one
 * question the first time somebody edited one of them.
 */
export type LinearProjectReference =
  | { kind: 'id'; value: string }
  | { kind: 'slugId'; value: string }
  | { kind: 'name'; value: string }

const LINEAR_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Linear's own host, and the only one a slug id can come from (lap 2, B). */
const LINEAR_HOST = 'linear.app'

/**
 * The URL a person actually pasted, or null when it is not one.
 *
 * A browser's address bar hands out `linear.app/marckraw/project/...` without
 * the scheme, and a paste of that is the commonest shape there is. Read as a
 * name it earned the sentence "paste the project's URL from Linear" -- said
 * to somebody who had just done exactly that (lap 2, B).
 */
function linearProjectUrl(raw: string): URL | null {
  const candidate =
    raw.startsWith(`${LINEAR_HOST}/`) || raw.startsWith(`www.${LINEAR_HOST}/`)
      ? `https://${raw}`
      : raw
  let url: URL
  try {
    url = new URL(candidate)
  } catch {
    return null
  }
  // A `mailto:` or a `file:` is not a link to a project, whatever it spells.
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
  // And neither is somebody else's site with Linear's path shape: a slug id
  // is a fact about Linear's workspace, so the host has to be Linear's.
  const host = url.hostname.toLowerCase()
  if (host !== LINEAR_HOST && !host.endsWith(`.${LINEAR_HOST}`)) return null
  return url
}

/**
 * The slug id inside a Linear project URL, or null when there is none.
 *
 * `https://linear.app/<workspace>/project/<slug>-<hex>` -- and the segment
 * AFTER `/project/` is the one that carries it, never the last segment of the
 * path: `.../project/convergence-f66c7ae332ee/overview` ends in `overview`,
 * and a lookup for that finds nothing. Query and trailing path are ignored.
 *
 * A segment with no hyphen at all IS the slug id (lap 2, B): Linear answers
 * to the bare `f66c7ae332ee`, and the name in front of it is decoration.
 */
function linearProjectSlugId(raw: string): string | null {
  const url = linearProjectUrl(raw)
  if (url === null) return null
  const segments = url.pathname.split('/').filter(Boolean)
  const at = segments.indexOf('project')
  const segment = at === -1 ? null : segments[at + 1]
  if (!segment) return null
  const slugId = segment.slice(segment.lastIndexOf('-') + 1)
  // Nothing after the last hyphen is not an id: `.../project/convergence-`
  // is a half-copied URL, and asking Linear about "" would come back empty
  // and read as "no project answers to that".
  return slugId.length > 0 ? slugId : null
}

export function parseLinearProjectReference(
  raw: string,
): LinearProjectReference | null {
  const trimmed = raw.trim()
  if (trimmed === '') return null
  if (LINEAR_UUID.test(trimmed)) return { kind: 'id', value: trimmed }
  const slugId = linearProjectSlugId(trimmed)
  if (slugId !== null) return { kind: 'slugId', value: slugId }
  return { kind: 'name', value: trimmed }
}
