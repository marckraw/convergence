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

/**
 * The slug id inside a Linear project URL, or null when there is none.
 *
 * `https://linear.app/<workspace>/project/<slug>-<hex>` -- and the segment
 * AFTER `/project/` is the one that carries it, never the last segment of the
 * path: `.../project/convergence-0a1b2c3d4e5f/overview` ends in `overview`,
 * and a lookup for that finds nothing. Query and trailing path are ignored.
 */
function linearProjectSlugId(raw: string): string | null {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return null
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
  const segments = url.pathname.split('/').filter(Boolean)
  const at = segments.indexOf('project')
  const segment = at === -1 ? null : segments[at + 1]
  if (!segment) return null
  const slugId = segment.slice(segment.lastIndexOf('-') + 1)
  return slugId.length > 0 && slugId !== segment ? slugId : null
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
