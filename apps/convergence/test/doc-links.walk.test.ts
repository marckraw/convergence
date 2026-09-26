import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { WALK_TEST_TIMEOUT_MS } from './walk-budget'

/**
 * The June spec purge (`7ef9e546`, 2026-06-01) deleted every file under
 * `docs/specs/`, and eleven references in four tracked docs kept naming them
 * for four months — `AGENTS.md` among them, so every agent in every lane was
 * told to read files that were not there (MAR-3178).
 *
 * Nothing caught it because nothing was looking. This walk looks: it reads the
 * agent-facing paper and asserts that every repo path those docs name still
 * exists, as the file or the folder the doc's own syntax claims it is. A doc
 * may point at a deleted spec through history
 * (`git show 7ef9e546^:docs/specs/project-spec.md`) — that is a command, not a
 * path, and it is not checked — but it may not name the bare path as if it
 * were still there.
 *
 * The first cut of this walk had four blind spots, each of which let a real
 * dead reference through (MAR-3467): a name with no folder in it was dropped
 * as a fragment, three of markdown's link forms were never read, folders were
 * not checked at all, and an illustration inside a code fence would have been
 * read as a claim. `describe` below pins each shape against fixture text, so
 * the reader of a green run can see what the extractor actually reads.
 */
const REPO_ROOT = resolve(import.meta.dirname, '..', '..', '..')

/** The agent-facing paper: the two root charters plus the whole `docs/` tree. */
const ROOT_DOCS = ['AGENTS.md', 'DESIGN.md']

/**
 * Local by design and gitignored (`.gitignore:25-26`), so they are named in the
 * docs but never present in a checkout. Exempt by name rather than by rule: the
 * point of the walk is that every other name has to be real.
 */
const GITIGNORED_BY_DESIGN = new Set(['FABLE.md', 'HANDOFF.md'])

/**
 * `AGENTS.md` names `docs/specs/` to forbid writing there — "do not add
 * feature-roadmap files under `docs/specs/`". A prohibition is not a pointer,
 * and the folder it forbids is supposed to stay gone.
 *
 * The exemption is the *pair*, not the path: any other doc naming
 * `docs/specs/` is telling an agent to go there, and still goes red. That is
 * the case `docs/agents/domain.md` was in.
 */
const PROHIBITED_NOT_PROMISED = [{ doc: 'AGENTS.md', path: 'docs/specs/' }]

/**
 * A bare repo path and nothing else. Excludes whitespace, `:` and `^`, which is
 * what keeps a `git show <sha>^:<path>` history pointer out of the candidates.
 */
const BARE_REPO_FILE = /^[A-Za-z0-9._@/{},+-]+\.md$/

/** The same shape, claiming a folder: the doc wrote a trailing separator. */
const BARE_REPO_DIRECTORY = /^[A-Za-z0-9._@/{},+-]+\/$/

const BACKTICK_SPAN = /`([^`\n]+)`/g

/**
 * All three inline link forms in one pattern: `](<path>)` first, so the angle
 * brackets are stripped rather than swallowed into the path, then `](path)`
 * with an optional `"title"` after it.
 */
const MARKDOWN_LINK =
  /\]\(\s*<([^>\n]+)>\s*\)|\]\(\s*([^)\s]+)(?:\s+"[^"]*")?\s*\)/g

/** And the block form, which carries its target after the colon instead. */
const REFERENCE_DEFINITION = /^\[[^\]\n]+\]:[ \t]*<?([^\s>]+)>?/gm

/** An opening or closing code fence: three or more backticks or tildes. */
const CODE_FENCE = /^ {0,3}(`{3,}|~{3,})/

/** A URL rather than a repo path — `https:`, `mailto:`, `vscode:`. */
const URL_SCHEME = /^[a-z][a-z0-9+.-]*:/i

type Reference = {
  /** The absolute path the doc claims exists. */
  path: string
  /** What its syntax claims that path is: a trailing `/` means a folder. */
  kind: 'directory' | 'file'
  /** Which doc made the claim, repo-relative — an exemption can be per-doc. */
  doc: string
}

function walk(directory: string, files: string[]): void {
  if (!existsSync(directory)) return
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name)
    if (entry.isDirectory()) walk(path, files)
    else if (entry.isFile() && entry.name.endsWith('.md')) files.push(path)
  }
}

/** `a/{b,c}/d.md` names two files; check both rather than skip the line. */
function expandBraces(candidate: string): string[] {
  const group = /\{([^{}]*)\}/.exec(candidate)
  if (!group) return [candidate]
  return group[1]
    .split(',')
    .flatMap((option) =>
      expandBraces(
        candidate.slice(0, group.index) +
          option +
          candidate.slice(group.index + group[0].length),
      ),
    )
}

/**
 * A path inside a fenced block is an illustration — sample output, a tree
 * sketch, the shell line that would create the thing. It is not a claim that
 * the path is there today, so dropping the fenced lines before any rule below
 * runs is what keeps this walk from raising a false alarm on an example.
 */
function withoutFencedBlocks(source: string): string {
  const prose: string[] = []
  let fence: string | null = null

  for (const line of source.split('\n')) {
    const marker = CODE_FENCE.exec(line)?.[1]
    if (fence === null) {
      if (marker) fence = marker
      else prose.push(line)
      continue
    }
    // Only the same character, at least as long, closes what it opened.
    if (marker && marker[0] === fence[0] && marker.length >= fence.length)
      fence = null
  }

  return prose.join('\n')
}

/**
 * A name with no separator in it is a claim about the repo root, so it is
 * always checked. Treating its one segment as a "first segment that has to
 * exist" is what made `ROADMAP.md` — a missing file — indistinguishable from a
 * fragment, and it silently retired the exemption above with it (MAR-3467).
 *
 * A multi-segment path still has to start at something real, because docs also
 * backtick path *fragments*: `AGENTS.md` writes
 * `convergence-design-promote/SKILL.md` under a sentence that supplies the
 * `.agents/skills/` prefix, and `docs/architecture/relay-engine.md` writes
 * `src/widgets/mission-control/` relative to the workspace it is describing.
 * A fragment is not a claim that the path resolves.
 */
function isRepoRooted(candidate: string): boolean {
  const [first, ...rest] = candidate.split('/')
  if (rest.length === 0) return true
  return existsSync(resolve(REPO_ROOT, first))
}

/** A link resolves from the folder of the doc that carries it. */
function linkReference(
  target: string,
  doc: string,
  references: Reference[],
): void {
  const path = target.split('#')[0]
  if (!path.endsWith('.md') || URL_SCHEME.test(path)) return
  references.push({
    path: resolve(dirname(doc), path),
    kind: 'file',
    doc: relative(REPO_ROOT, doc),
  })
}

function extractReferences(source: string, doc: string): Reference[] {
  const prose = withoutFencedBlocks(source)
  const references: Reference[] = []

  for (const [, span] of prose.matchAll(BACKTICK_SPAN)) {
    const kind = BARE_REPO_DIRECTORY.test(span)
      ? 'directory'
      : BARE_REPO_FILE.test(span)
        ? 'file'
        : null
    if (!kind) continue
    for (const candidate of expandBraces(span))
      if (isRepoRooted(candidate))
        references.push({
          path: resolve(REPO_ROOT, candidate),
          kind,
          doc: relative(REPO_ROOT, doc),
        })
  }

  for (const [, angled, plain] of prose.matchAll(MARKDOWN_LINK))
    linkReference(angled ?? plain, doc, references)

  for (const [, target] of prose.matchAll(REFERENCE_DEFINITION))
    linkReference(target, doc, references)

  return references
}

function referencesIn(doc: string): Reference[] {
  return extractReferences(readFileSync(doc, 'utf8'), doc)
}

/** How the doc wrote it: repo-relative, with the `/` back if it claimed one. */
function claimedName(reference: Reference): string {
  const path = relative(REPO_ROOT, reference.path)
  return reference.kind === 'directory' ? `${path}/` : path
}

function isExempt(reference: Reference): boolean {
  const name = claimedName(reference)
  if (GITIGNORED_BY_DESIGN.has(name)) return true
  return PROHIBITED_NOT_PROMISED.some(
    (pair) => pair.doc === reference.doc && pair.path === name,
  )
}

function resolvesAsClaimed(reference: Reference): boolean {
  if (!existsSync(reference.path)) return false
  const stats = statSync(reference.path)
  return reference.kind === 'directory' ? stats.isDirectory() : stats.isFile()
}

it(
  'names no repo path that does not exist',
  { timeout: WALK_TEST_TIMEOUT_MS },
  () => {
    const docs = ROOT_DOCS.map((name) => resolve(REPO_ROOT, name))
    walk(resolve(REPO_ROOT, 'docs'), docs)

    // A walk rooted at the wrong folder reads nothing and passes; prove it
    // reached the charter that carried the dead references.
    expect(docs).toContain(resolve(REPO_ROOT, 'AGENTS.md'))
    expect(docs).toContain(resolve(REPO_ROOT, 'docs/agents/domain.md'))

    const referenced = docs.flatMap(referencesIn)

    // And prove the extractor pulled paths out of them, for the same reason:
    // a regex that matches nothing also reports nothing missing. One of each
    // kind, because a folder rule that never fires is the gap this closed.
    expect(referenced).toContainEqual({
      path: resolve(REPO_ROOT, 'docs/architecture/quick-reference.md'),
      kind: 'file',
      doc: 'AGENTS.md',
    })
    expect(referenced).toContainEqual({
      path: resolve(REPO_ROOT, 'docs/adr'),
      kind: 'directory',
      doc: 'docs/agents/domain.md',
    })

    const missing = [
      ...new Set(
        referenced
          .filter((reference) => !isExempt(reference))
          .filter((reference) => !resolvesAsClaimed(reference))
          .map(claimedName),
      ),
    ].sort()

    expect(missing).toEqual([])
  },
)

/**
 * The corpus above cannot pin a rule it has no instance of — today no tracked
 * doc uses a titled link or puts a path in a fence, so those rules would pass
 * a green run while matching nothing at all. These read fixture text instead,
 * so each shape stays pinned whether or not a doc happens to use it.
 */
describe('what the walk reads out of a doc', () => {
  /** Carried by a root doc, so a link resolves from the repo root. */
  function claimsIn(source: string): string[] {
    return extractReferences(source, resolve(REPO_ROOT, 'AGENTS.md'))
      .map(claimedName)
      .sort()
  }

  it('reads a name with no folder in it as a claim about the root', () => {
    expect(claimsIn('`ROADMAP.md` beside `AGENTS.md`')).toEqual([
      'AGENTS.md',
      'ROADMAP.md',
    ])
  })

  it('still drops a fragment that does not start at the root', () => {
    expect(
      claimsIn('`convergence-design-promote/SKILL.md` `src/widgets/x/`'),
    ).toEqual([])
  })

  it('reads a plain, an angle-bracket, a titled and a reference link', () => {
    expect(
      claimsIn(
        '[a](docs/plain.md) [b](<docs/angle.md>) [c](docs/titled.md "t")\n' +
          '\n[d]: docs/reference.md\n',
      ),
    ).toEqual([
      'docs/angle.md',
      'docs/plain.md',
      'docs/reference.md',
      'docs/titled.md',
    ])
  })

  it('reads neither a URL nor a bare anchor as a repo path', () => {
    expect(claimsIn('[a](https://example.com/x.md) [b](#a-section)')).toEqual(
      [],
    )
  })

  it('reads a trailing separator as a claim about a folder', () => {
    expect(claimsIn('`docs/adr/` and `docs/gone/`')).toEqual([
      'docs/adr/',
      'docs/gone/',
    ])
  })

  it('reads nothing out of a fenced block', () => {
    expect(claimsIn('```sh\n`docs/gone/` [a](docs/gone.md)\n```')).toEqual([])
    expect(claimsIn('~~~\n`docs/gone.md`\n~~~')).toEqual([])
  })

  it('starts reading again once the fence closes', () => {
    expect(claimsIn('```\n`docs/gone.md`\n```\n\n`AGENTS.md`')).toEqual([
      'AGENTS.md',
    ])
  })
})
